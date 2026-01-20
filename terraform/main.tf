terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "memorable-terraform-state"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "memorable-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "memorable"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name_prefix = "memorable-${var.environment}"
}

module "vpc" {
  source = "./modules/vpc"

  name_prefix      = local.name_prefix
  vpc_cidr         = var.vpc_cidr
  azs              = var.availability_zones
  private_subnets  = var.private_subnets
  public_subnets   = var.public_subnets
}

module "secrets" {
  source = "./modules/secrets"

  name_prefix     = local.name_prefix
  environment     = var.environment
  anthropic_key   = var.anthropic_api_key
  openai_key      = var.openai_api_key
}

module "documentdb" {
  source = "./modules/documentdb"

  name_prefix             = local.name_prefix
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  allowed_security_groups = [module.ecs.ecs_security_group_id]
  instance_class          = var.documentdb_instance_class
  instance_count          = var.documentdb_instance_count
  skip_final_snapshot     = var.environment == "staging" ? true : false
  deletion_protection     = var.environment == "production" ? true : false
}

module "elasticache" {
  source = "./modules/elasticache"

  name_prefix         = local.name_prefix
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  allowed_security_groups = [module.ecs.ecs_security_group_id]
  node_type           = var.elasticache_node_type
  num_cache_nodes     = var.elasticache_num_nodes
}

module "alb" {
  source = "./modules/alb"

  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  public_subnet_ids  = module.vpc.public_subnet_ids
  certificate_arn    = var.acm_certificate_arn
}

module "ecs" {
  source = "./modules/ecs"

  name_prefix         = local.name_prefix
  environment         = var.environment
  aws_region          = var.aws_region
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  alb_target_group_arn = module.alb.target_group_arn
  alb_security_group_id = module.alb.security_group_id

  # Service configuration
  app_image           = var.app_image
  app_cpu             = var.app_cpu
  app_memory          = var.app_memory
  app_desired_count   = var.app_desired_count

  # Database connections
  mongodb_uri         = module.documentdb.connection_string
  redis_url           = module.elasticache.endpoint

  # Secrets
  anthropic_secret_arn = module.secrets.anthropic_secret_arn
  mongodb_secret_arn   = module.secrets.mongodb_secret_arn

  # Task execution
  execution_role_arn  = module.secrets.task_execution_role_arn
}
