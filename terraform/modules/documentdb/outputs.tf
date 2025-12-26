output "endpoint" {
  description = "DocumentDB cluster endpoint"
  value       = aws_docdb_cluster.main.endpoint
}

output "reader_endpoint" {
  description = "DocumentDB reader endpoint"
  value       = aws_docdb_cluster.main.reader_endpoint
}

output "port" {
  description = "DocumentDB port"
  value       = aws_docdb_cluster.main.port
}

output "connection_string" {
  description = "MongoDB-compatible connection string"
  value       = "mongodb://memorable_admin:${random_password.docdb_password.result}@${aws_docdb_cluster.main.endpoint}:${aws_docdb_cluster.main.port}/memorable?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false"
  sensitive   = true
}

output "master_password" {
  description = "DocumentDB master password"
  value       = random_password.docdb_password.result
  sensitive   = true
}

output "security_group_id" {
  description = "DocumentDB security group ID"
  value       = aws_security_group.documentdb.id
}
