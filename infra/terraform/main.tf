terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Local state — intentional for initial / single-operator deployment.
  # Migration path to S3 backend when team-shared or CI-driven applies are needed:
  #
  #   backend "s3" {
  #     bucket         = "skillai-terraform-state-<account-id>"
  #     key            = "eks/eu-west-2/terraform.tfstate"
  #     region         = "eu-west-2"
  #     encrypt        = true
  #     dynamodb_table = "skillai-terraform-locks"
  #   }
  #
  # Steps to migrate:
  #   1. Create the S3 bucket + DynamoDB table (or use a bootstrap module).
  #   2. Uncomment the backend block above.
  #   3. Run `terraform init -migrate-state` — Terraform will copy local state to S3.
  #   4. Delete local terraform.tfstate + terraform.tfstate.backup.
  #   5. Add the bucket/table to .gitignore if not already present.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      ManagedBy   = "terraform"
      Environment = "production"
    }
  }
}
