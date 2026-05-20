# ---------------------------------------------------------------------------
# KMS key for EKS envelope encryption of Kubernetes Secrets at rest in etcd.
#
# Envelope encryption means every K8s Secret's data encryption key (DEK) is
# itself encrypted by this CMK before being written to etcd. Compromise of
# etcd without access to this KMS key yields unreadable secret values.
#
# Key rotation is enabled (annual automatic rotation via AWS KMS).
# Deletion window is set to 30 days — the longest available window — to
# minimise the risk of accidental key destruction while still allowing
# eventual deletion if the cluster is torn down.
# ---------------------------------------------------------------------------

resource "aws_kms_key" "eks_secrets" {
  description             = "EKS envelope encryption for K8s Secrets — ${var.project}"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "${var.project}-eks-secrets"
  }
}

resource "aws_kms_alias" "eks_secrets" {
  name          = "alias/${var.project}-eks-secrets"
  target_key_id = aws_kms_key.eks_secrets.key_id
}
