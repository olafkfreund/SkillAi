# ---------------------------------------------------------------------------
# ECR — private image registry for the SkillAI app container
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "app" {
  name                 = var.project
  image_tag_mutability = "MUTABLE" # allows :latest tag to be overwritten on each push

  image_scanning_configuration {
    # Scan every image on push using ECR's built-in basic scanning (free).
    # Results appear in the ECR console and can be surfaced to CI via
    # `aws ecr describe-image-scan-findings`.
    scan_on_push = true
  }

  # Encryption at rest using the AWS-managed key.
  # For stricter key control, replace with a KMS CMK.
  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "${var.project}-ecr"
  }
}

# ---------------------------------------------------------------------------
# Lifecycle policy
# Keeps the last 10 tagged images and expires untagged images after 1 day.
# This prevents the registry from accumulating stale build artefacts while
# preserving enough history to roll back across the last ~10 deploys.
# ---------------------------------------------------------------------------

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep only the last 10 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["sha-", "v", "latest"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
