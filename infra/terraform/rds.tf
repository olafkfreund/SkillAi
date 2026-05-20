# ---------------------------------------------------------------------------
# RDS — PostgreSQL 17
# pgvector note: pgvector is loaded via CREATE EXTENSION vector; — it does
# NOT require any entry in shared_preload_libraries. The parameter group
# below is therefore empty of pgvector settings; it only tunes basics.
# ---------------------------------------------------------------------------

resource "random_password" "db_password" {
  length  = 32
  special = true
  # Exclude characters that break standard DSN parsing or psql quoting.
  override_special = "!#$%&*()-_=+[]{}:?"
}

# ---------------------------------------------------------------------------
# Security group — allows Postgres traffic from EKS nodes only
# ---------------------------------------------------------------------------

resource "aws_security_group" "rds" {
  name        = "${var.project}-rds-sg"
  description = "Allow Postgres ingress from EKS nodes"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from EKS nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-rds-sg"
  }
}

# ---------------------------------------------------------------------------
# DB subnet group — spans both private subnets for future Multi-AZ flip
# ---------------------------------------------------------------------------

resource "aws_db_subnet_group" "main" {
  name        = "${var.project}-db-subnet-group"
  description = "Private subnets for RDS — eu-west-2a and eu-west-2b"
  subnet_ids  = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tags = {
    Name = "${var.project}-db-subnet-group"
  }
}

# ---------------------------------------------------------------------------
# Parameter group — Postgres 17
# No special parameters needed for pgvector; it loads as a regular extension.
# ---------------------------------------------------------------------------

resource "aws_db_parameter_group" "postgres17" {
  name        = "${var.project}-pg17"
  family      = "postgres17"
  description = "Parameter group for SkillAI Postgres 17"

  # Recommended baseline for a small instance:
  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # log slow queries ≥ 1 s
  }

  tags = {
    Name = "${var.project}-pg17-params"
  }
}

# ---------------------------------------------------------------------------
# RDS instance
# ---------------------------------------------------------------------------

resource "aws_db_instance" "main" {
  identifier = "${var.project}-db"

  engine         = "postgres"
  engine_version = "17"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = 100 # autoscaling ceiling; change to 0 to disable
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.project
  username = var.db_username
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.postgres17.name

  # Private — only EKS nodes can reach this instance via the security group.
  publicly_accessible = false

  # Single-AZ to minimise cost at this tier.
  # To enable Multi-AZ for HA, set multi_az = true (+~$13/mo).
  multi_az = false

  # 7-day automated backup window — gives point-in-time recovery for a week.
  # backup_retention_period = 0 would disable backups entirely (not recommended).
  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  # skip_final_snapshot: set false normally so a named snapshot is created before
  # the instance is deleted.  Set var.force_destroy=true ONLY via destroy.sh
  # --force / FORCE_DESTROY=1 to bypass the snapshot when intentionally wiping
  # the environment (e.g. dev tear-down where data loss is acceptable).
  skip_final_snapshot = var.force_destroy

  # Final snapshot identifier includes a timestamp so each destroy produces a
  # uniquely named, recoverable snapshot in the AWS console.
  final_snapshot_identifier = "${var.project}-db-final-${formatdate("YYYYMMDDhhmm", timestamp())}"

  # Prevent accidental deletion via the AWS console or an unguarded
  # terraform destroy.  The destroy.sh script documents the two-phase
  # procedure required to remove this protection intentionally.
  deletion_protection = true

  tags = {
    Name = "${var.project}-db"
  }

  lifecycle {
    prevent_destroy = true
  }
}
