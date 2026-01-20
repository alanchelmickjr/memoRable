output "cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "service_name" {
  description = "Main app ECS service name"
  value       = aws_ecs_service.app.name
}

output "ingestion_service_name" {
  description = "Ingestion ECS service name"
  value       = aws_ecs_service.ingestion.name
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = data.aws_ecr_repository.app.repository_url
}

output "ecr_mcp_repository_url" {
  description = "ECR MCP repository URL"
  value       = data.aws_ecr_repository.mcp.repository_url
}

output "ecr_ingestion_repository_url" {
  description = "ECR ingestion repository URL"
  value       = data.aws_ecr_repository.ingestion.repository_url
}

output "ecs_security_group_id" {
  description = "ECS tasks security group ID"
  value       = aws_security_group.ecs_tasks.id
}

output "service_discovery_namespace_id" {
  description = "Service discovery namespace ID"
  value       = aws_service_discovery_private_dns_namespace.main.id
}
