environment = "staging"
aws_region  = "us-east-1"

# VPC
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]
private_subnets    = ["10.0.1.0/24", "10.0.2.0/24"]
public_subnets     = ["10.0.101.0/24", "10.0.102.0/24"]

# DocumentDB - smaller for staging
documentdb_instance_class = "db.t3.medium"
documentdb_instance_count = 1

# ElastiCache - smaller for staging
elasticache_node_type  = "cache.t3.micro"
elasticache_num_nodes  = 1

# ECS - smaller for staging
app_cpu           = 512
app_memory        = 1024
app_desired_count = 1
app_image         = ""  # Will be set by CI/CD

# SSL - set this after creating certificate
acm_certificate_arn = ""
