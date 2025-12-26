output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.dns_name
}

output "alb_zone_id" {
  description = "ALB zone ID for Route53"
  value       = module.alb.zone_id
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = module.ecs.service_name
}

output "documentdb_endpoint" {
  description = "DocumentDB endpoint"
  value       = module.documentdb.endpoint
  sensitive   = true
}

output "elasticache_endpoint" {
  description = "ElastiCache endpoint"
  value       = module.elasticache.endpoint
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = module.ecs.ecr_repository_url
}
