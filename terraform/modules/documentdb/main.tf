resource "aws_security_group" "documentdb" {
  name        = "${var.name_prefix}-documentdb-sg"
  description = "Security group for DocumentDB"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name_prefix}-documentdb-sg"
  }
}

resource "aws_docdb_subnet_group" "main" {
  name       = "${var.name_prefix}-docdb-subnet"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.name_prefix}-docdb-subnet"
  }
}

resource "random_password" "docdb_password" {
  length  = 32
  special = false
}

resource "aws_docdb_cluster_parameter_group" "main" {
  family = "docdb5.0"
  name   = "${var.name_prefix}-docdb-params"

  parameter {
    name  = "tls"
    value = "enabled"
  }

  tags = {
    Name = "${var.name_prefix}-docdb-params"
  }
}

resource "aws_docdb_cluster" "main" {
  cluster_identifier              = "${var.name_prefix}-docdb"
  engine                          = "docdb"
  master_username                 = "memorable_admin"
  master_password                 = random_password.docdb_password.result
  db_subnet_group_name            = aws_docdb_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.documentdb.id]
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.main.name
  storage_encrypted               = true
  skip_final_snapshot             = var.skip_final_snapshot
  deletion_protection             = var.deletion_protection

  tags = {
    Name = "${var.name_prefix}-docdb"
  }
}

resource "aws_docdb_cluster_instance" "main" {
  count              = var.instance_count
  identifier         = "${var.name_prefix}-docdb-${count.index + 1}"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = var.instance_class

  tags = {
    Name = "${var.name_prefix}-docdb-${count.index + 1}"
  }
}
