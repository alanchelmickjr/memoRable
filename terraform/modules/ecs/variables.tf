variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs"
  type        = list(string)
}

variable "alb_target_group_arn" {
  description = "ALB target group ARN"
  type        = string
}

variable "alb_security_group_id" {
  description = "ALB security group ID"
  type        = string
}

variable "app_image" {
  description = "Docker image for the app"
  type        = string
  default     = ""
}

variable "app_cpu" {
  description = "CPU units for the app"
  type        = number
  default     = 1024
}

variable "app_memory" {
  description = "Memory for the app (MB)"
  type        = number
  default     = 2048
}

variable "app_desired_count" {
  description = "Desired count of app tasks"
  type        = number
  default     = 2
}

variable "mongodb_uri" {
  description = "MongoDB connection string"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Redis URL"
  type        = string
  sensitive   = true
}

variable "anthropic_secret_arn" {
  description = "Anthropic secret ARN"
  type        = string
}

variable "mongodb_secret_arn" {
  description = "MongoDB secret ARN"
  type        = string
}

variable "execution_role_arn" {
  description = "ECS task execution role ARN"
  type        = string
}
