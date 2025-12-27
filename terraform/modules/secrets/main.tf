resource "aws_secretsmanager_secret" "anthropic" {
  name        = "memorable/${var.environment}/anthropic"
  description = "Anthropic API key for MemoRable"

  tags = {
    Name = "${var.name_prefix}-anthropic-secret"
  }
}

resource "aws_secretsmanager_secret_version" "anthropic" {
  secret_id = aws_secretsmanager_secret.anthropic.id
  secret_string = jsonencode({
    api_key = var.anthropic_key
  })
}

resource "aws_secretsmanager_secret" "openai" {
  count       = var.openai_key != "" ? 1 : 0
  name        = "memorable/${var.environment}/openai"
  description = "OpenAI API key for MemoRable"

  tags = {
    Name = "${var.name_prefix}-openai-secret"
  }
}

resource "aws_secretsmanager_secret_version" "openai" {
  count     = var.openai_key != "" ? 1 : 0
  secret_id = aws_secretsmanager_secret.openai[0].id
  secret_string = jsonencode({
    api_key = var.openai_key
  })
}

resource "aws_secretsmanager_secret" "mongodb" {
  name        = "memorable/${var.environment}/mongodb"
  description = "MongoDB credentials for MemoRable"

  tags = {
    Name = "${var.name_prefix}-mongodb-secret"
  }
}

# IAM role for ECS task execution
data "aws_caller_identity" "current" {}

resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.name_prefix}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.name_prefix}-ecs-task-execution"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "secrets_access" {
  name = "${var.name_prefix}-secrets-access"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          "arn:aws:secretsmanager:*:${data.aws_caller_identity.current.account_id}:secret:memorable/${var.environment}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${var.name_prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.name_prefix}-ecs-task"
  }
}

resource "aws_iam_role_policy" "ecs_task_logs" {
  name = "${var.name_prefix}-ecs-task-logs"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}
