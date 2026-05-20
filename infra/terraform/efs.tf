# ---------------------------------------------------------------------------
# EFS — uploads volume
# Used by the SkillAI app to store CV files and tenant logos under /app/uploads.
# RWX access allows multiple pods (if scaled) to share the same filesystem.
# ---------------------------------------------------------------------------

resource "aws_security_group" "efs" {
  name        = "${var.project}-efs-sg"
  description = "Allow NFS ingress from EKS nodes"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "NFS from EKS nodes"
    from_port       = 2049
    to_port         = 2049
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
    Name = "${var.project}-efs-sg"
  }
}

resource "aws_efs_file_system" "uploads" {
  # generalPurpose is the standard performance mode and sufficient for CV file
  # read/write patterns. maxIO mode only benefits highly-parallel workloads.
  performance_mode = "generalPurpose"

  # bursting throughput scales with storage size (~50 MiB/s per TiB stored).
  # At <1 GB stored this gives 1 MiB/s baseline burst credit — adequate for
  # sequential CV uploads. Switch to "elastic" throughput if uploads become
  # bursty or multi-tenant parallelism increases.
  throughput_mode = "bursting"

  encrypted = true

  lifecycle_policy {
    # Move files not accessed in 30 days to the cheaper IA storage class.
    transition_to_ia = "AFTER_30_DAYS"
  }

  tags = {
    Name = "${var.project}-uploads"
  }
}

# Mount targets — one per private subnet so pods on any node can reach EFS.
resource "aws_efs_mount_target" "private_a" {
  file_system_id  = aws_efs_file_system.uploads.id
  subnet_id       = aws_subnet.private_a.id
  security_groups = [aws_security_group.efs.id]
}

resource "aws_efs_mount_target" "private_b" {
  file_system_id  = aws_efs_file_system.uploads.id
  subnet_id       = aws_subnet.private_b.id
  security_groups = [aws_security_group.efs.id]
}
