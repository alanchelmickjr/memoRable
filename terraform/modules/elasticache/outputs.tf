output "endpoint" {
  description = "Redis primary endpoint"
  value       = "rediss://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
  sensitive   = true
}

output "primary_endpoint" {
  description = "Redis primary endpoint address"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "reader_endpoint" {
  description = "Redis reader endpoint address"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "port" {
  description = "Redis port"
  value       = 6379
}

output "auth_token" {
  description = "Redis auth token"
  value       = random_password.redis_auth.result
  sensitive   = true
}

output "security_group_id" {
  description = "Redis security group ID"
  value       = aws_security_group.redis.id
}
