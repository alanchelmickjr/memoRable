output "arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

output "dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "zone_id" {
  description = "ALB zone ID"
  value       = aws_lb.main.zone_id
}

output "target_group_arn" {
  description = "App target group ARN"
  value       = aws_lb_target_group.app.arn
}

output "ingestion_target_group_arn" {
  description = "Ingestion target group ARN"
  value       = aws_lb_target_group.ingestion.arn
}

output "security_group_id" {
  description = "ALB security group ID"
  value       = aws_security_group.alb.id
}
