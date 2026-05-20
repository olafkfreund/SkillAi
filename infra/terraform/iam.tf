# ---------------------------------------------------------------------------
# IRSA — EFS CSI Driver
#
# The EKS module already provisions the OIDC provider for the cluster.
# We reference it via module.eks.oidc_provider_arn.
#
# Two service accounts need EFS permissions:
#   kube-system/efs-csi-controller-sa  — manages EFS access points
#   kube-system/efs-csi-node-sa        — mounts the filesystem on each node
#
# We use the terraform-aws-modules/iam IRSA sub-module for consistency with
# the EBS CSI role already provisioned in eks.tf.
# ---------------------------------------------------------------------------

module "efs_csi_irsa_role" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name             = "${var.project}-efs-csi"
  attach_efs_csi_policy = true

  oidc_providers = {
    controller = {
      provider_arn = module.eks.oidc_provider_arn
      # Both CSI service accounts are bound to the same role.
      # The EFS CSI Helm chart / kustomize manifest must annotate each SA
      # with: eks.amazonaws.com/role-arn: <this role ARN>
      namespace_service_accounts = [
        "kube-system:efs-csi-controller-sa",
        "kube-system:efs-csi-node-sa",
      ]
    }
  }
}
