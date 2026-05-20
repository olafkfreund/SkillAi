# ---------------------------------------------------------------------------
# Outputs — consumed by k8s manifests + deployment scripts.
# Names are load-bearing: parallel agents reference these exact identifiers.
# DO NOT rename without updating infra/scripts/ and infra/k8s/ consumers.
# ---------------------------------------------------------------------------

output "cluster_name" {
  description = "EKS cluster name. Used in aws eks update-kubeconfig and kubectl contexts."
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "HTTPS endpoint for the EKS API server."
  value       = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64-encoded certificate authority data for the cluster. Required by kubeconfig."
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "region" {
  description = "AWS region where all resources were provisioned."
  value       = var.aws_region
}

output "rds_endpoint" {
  description = "RDS instance endpoint hostname (without port). Used to construct DATABASE_URL."
  value       = aws_db_instance.main.address
}

output "rds_port" {
  description = "RDS instance port."
  value       = aws_db_instance.main.port
}

output "rds_database" {
  description = "Postgres database name inside the RDS instance."
  value       = aws_db_instance.main.db_name
}

output "rds_username" {
  description = "Postgres master username."
  value       = aws_db_instance.main.username
}

output "rds_password" {
  description = "Postgres master password (generated). Store this in your .envrc — never commit it."
  value       = random_password.db_password.result
  sensitive   = true
}

output "efs_id" {
  description = "EFS filesystem ID. Used in the EFS CSI StorageClass and PersistentVolume."
  value       = aws_efs_file_system.uploads.id
}

output "ecr_repository_url" {
  description = "ECR repository URL (without tag). Append :<sha> or :latest when pushing images."
  value       = aws_ecr_repository.app.repository_url
}

output "kubeconfig_command" {
  description = "Shell command to update the local kubeconfig for this cluster."
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

output "eks_cloudwatch_log_group_arn" {
  description = "ARN of the CloudWatch log group receiving EKS control plane logs. Use this to grant read access to observability tooling or to configure metric filters."
  value       = aws_cloudwatch_log_group.eks.arn
}

output "eks_secrets_kms_key_arn" {
  description = "ARN of the KMS key used for EKS envelope encryption of Kubernetes Secrets. Required if you need to grant additional IAM principals permission to decrypt secrets."
  value       = aws_kms_key.eks_secrets.arn
}
