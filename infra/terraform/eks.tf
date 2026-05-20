# ---------------------------------------------------------------------------
# Common tags — reused by EKS-adjacent resources (e.g. CloudWatch log group).
# The provider default_tags block covers all aws_ resources automatically;
# this locals map is used explicitly where a resource-level tags argument is
# required (e.g. aws_cloudwatch_log_group).
# ---------------------------------------------------------------------------

locals {
  common_tags = {
    Project     = var.project
    ManagedBy   = "terraform"
    Environment = "production"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch log group for EKS control plane logs.
# Created BEFORE the cluster so the retention policy is in place from day 1.
# Without this resource EKS auto-creates the group with infinite retention,
# which accumulates unbounded CloudWatch Logs storage costs.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${var.project}/cluster"
  retention_in_days = 90
  tags              = local.common_tags
}

# ---------------------------------------------------------------------------
# EKS Cluster — using the community EKS module (terraform-aws-modules/eks)
# Module version pinned to ~> 20.0 for stability; 20.x is the LTS-equivalent
# line for aws provider v5 compatibility.
# ---------------------------------------------------------------------------

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.project
  cluster_version = var.cluster_version

  vpc_id     = aws_vpc.main.id
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  # Allow operator's laptop to reach the API server.
  # For a hardened deployment, set to false and access via AWS VPN or
  # a bastion host in the public subnet.
  cluster_endpoint_public_access       = true
  cluster_endpoint_public_access_cidrs = var.allowed_operator_cidrs

  # ---------------------------------------------------------------------------
  # Envelope encryption — encrypt K8s Secrets in etcd with a customer-managed
  # KMS key (defined in kms.tf).  The module accepts a map; the EKS API only
  # supports a single encryption config entry today.
  # ---------------------------------------------------------------------------
  cluster_encryption_config = {
    resources        = ["secrets"]
    provider_key_arn = aws_kms_key.eks_secrets.arn
  }

  # OIDC issuer — required for IRSA (IAM Roles for Service Accounts).
  # The EKS module creates the OIDC provider automatically when this is true.
  enable_irsa = true

  # ---------------------------------------------------------------------------
  # Control plane logging — all five log types enabled for security/audit
  # visibility. Logs land in the CloudWatch log group provisioned above.
  # EKS does not start writing until the group exists, so depends_on ensures
  # the group (and its retention policy) are in place before cluster creation.
  # ---------------------------------------------------------------------------
  cluster_enabled_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  # ---------------------------------------------------------------------------
  # Cluster add-ons — pinned to explicit versions for deterministic applies.
  # Silent auto-updates on every `terraform apply` are prevented by using
  # addon_version instead of most_recent = true (issue #249).
  #
  # To discover the current latest stable version for each addon, run:
  #   aws eks describe-addon-versions \
  #     --kubernetes-version 1.30 \
  #     --addon-name vpc-cni \
  #     --query 'addons[0].addonVersions[0].addonVersion' \
  #     --output text
  #
  #   aws eks describe-addon-versions \
  #     --kubernetes-version 1.30 \
  #     --addon-name kube-proxy \
  #     --query 'addons[0].addonVersions[0].addonVersion' \
  #     --output text
  #
  #   aws eks describe-addon-versions \
  #     --kubernetes-version 1.30 \
  #     --addon-name coredns \
  #     --query 'addons[0].addonVersions[0].addonVersion' \
  #     --output text
  #
  #   aws eks describe-addon-versions \
  #     --kubernetes-version 1.30 \
  #     --addon-name aws-ebs-csi-driver \
  #     --query 'addons[0].addonVersions[0].addonVersion' \
  #     --output text
  #
  # Replace the TODO placeholders below with the output of those commands
  # before applying. Bump versions intentionally when upgrading the cluster.
  # ---------------------------------------------------------------------------
  cluster_addons = {
    vpc-cni = {
      addon_version               = "# TODO: pin to current latest stable, see commands above"
      resolve_conflicts_on_create = "OVERWRITE"
      resolve_conflicts_on_update = "PRESERVE"
    }
    kube-proxy = {
      addon_version               = "# TODO: pin to current latest stable, see commands above"
      resolve_conflicts_on_create = "OVERWRITE"
      resolve_conflicts_on_update = "PRESERVE"
    }
    coredns = {
      addon_version               = "# TODO: pin to current latest stable, see commands above"
      resolve_conflicts_on_create = "OVERWRITE"
      resolve_conflicts_on_update = "PRESERVE"
    }
    aws-ebs-csi-driver = {
      addon_version               = "# TODO: pin to current latest stable, see commands above"
      resolve_conflicts_on_create = "OVERWRITE"
      resolve_conflicts_on_update = "PRESERVE"
      service_account_role_arn    = module.ebs_csi_irsa_role.iam_role_arn
    }
  }

  # ---------------------------------------------------------------------------
  # Managed node group
  # ami_type = AL2023_ARM_64_STANDARD is required for t4g (Graviton2) instances.
  # Using AL2 would result in "no AMI found" errors at launch time.
  # ---------------------------------------------------------------------------
  eks_managed_node_groups = {
    main = {
      name = "${var.project}-ng"

      instance_types = [var.node_instance_type]
      ami_type       = "AL2023_ARM_64_STANDARD"

      min_size     = var.node_min
      max_size     = var.node_max
      desired_size = var.node_desired

      # Nodes live in private subnets — they reach the control plane
      # via the ENI injected by the EKS module.
      subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]

      # Allow SSM Session Manager for in-band node access without a bastion.
      iam_role_additional_policies = {
        AmazonSSMManagedInstanceCore = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
      }
    }
  }

  tags = {
    Name = var.project
  }

  depends_on = [aws_cloudwatch_log_group.eks]
}

# ---------------------------------------------------------------------------
# IRSA role for the EBS CSI driver (needed by aws-ebs-csi-driver addon)
# ---------------------------------------------------------------------------

module "ebs_csi_irsa_role" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name             = "${var.project}-ebs-csi"
  attach_ebs_csi_policy = true

  oidc_providers = {
    ex = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }
}
