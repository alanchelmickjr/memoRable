output "anthropic_secret_arn" {
  description = "Anthropic secret ARN"
  value       = aws_secretsmanager_secret.anthropic.arn
}

output "openai_secret_arn" {
  description = "OpenAI secret ARN"
  value       = var.openai_key != "" ? aws_secretsmanager_secret.openai[0].arn : ""
}

output "mongodb_secret_arn" {
  description = "MongoDB secret ARN"
  value       = aws_secretsmanager_secret.mongodb.arn
}

output "task_execution_role_arn" {
  description = "ECS task execution role ARN"
  value       = aws_iam_role.ecs_task_execution.arn
}

output "task_role_arn" {
  description = "ECS task role ARN"
  value       = aws_iam_role.ecs_task.arn
}
