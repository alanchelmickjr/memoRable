variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "anthropic_key" {
  description = "Anthropic API key"
  type        = string
  sensitive   = true
}

variable "openai_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
  default     = ""
}
