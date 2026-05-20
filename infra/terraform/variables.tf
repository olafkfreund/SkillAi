variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "eu-west-2"
}

variable "project" {
  description = "Short project name used as a prefix/suffix throughout resource names and tags."
  type        = string
  default     = "skillai"
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS control plane."
  type        = string
  default     = "1.30"
}

variable "node_instance_type" {
  description = "EC2 instance type for the managed node group. Must be ARM-based (t4g.*) to match ami_type AL2023_ARM_64_STANDARD."
  type        = string
  default     = "t4g.small"
}

variable "node_desired" {
  description = "Desired number of nodes in the managed node group."
  type        = number
  default     = 1
}

variable "node_min" {
  description = "Minimum number of nodes in the managed node group."
  type        = number
  default     = 1
}

variable "node_max" {
  description = "Maximum number of nodes in the managed node group. Set to 2 to allow a brief scale-out during node replacement or manual HA bump."
  type        = number
  default     = 2
}

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.micro is the cheapest Graviton option. Upgrade to db.t4g.small for 1 GB RAM if connection count or shared_buffers become a bottleneck."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GiB. 20 GiB gp3 is the minimum and covers typical CV + vector-embedding workloads up to ~500 k candidates."
  type        = number
  default     = 20
}

variable "db_username" {
  description = "Master username for the RDS Postgres instance."
  type        = string
  default     = "skillai"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC. /16 leaves plenty of room for additional subnets if needed."
  type        = string
  default     = "10.10.0.0/16"
}
