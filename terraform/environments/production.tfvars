environment = "production"
aws_region  = "us-east-1"

# VPC
vpc_cidr           = "10.1.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
private_subnets    = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]
public_subnets     = ["10.1.101.0/24", "10.1.102.0/24", "10.1.103.0/24"]

# DocumentDB - production scale
documentdb_instance_class = "db.r5.large"
documentdb_instance_count = 2

# ElastiCache - production scale
elasticache_node_type  = "cache.r5.large"
elasticache_num_nodes  = 2

# ECS - production scale
app_cpu           = 1024
app_memory        = 2048
app_desired_count = 2
app_image         = ""  # Will be set by CI/CD

# SSL - set this after creating certificate
acm_certificate_arn = ""
