# ---------------------------------------------------------------------------
# VPC
# ---------------------------------------------------------------------------

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name                                   = "${var.project}-vpc"
    "kubernetes.io/cluster/${var.project}" = "shared"
  }
}

# ---------------------------------------------------------------------------
# Internet Gateway
# ---------------------------------------------------------------------------

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project}-igw"
  }
}

# ---------------------------------------------------------------------------
# Public subnets — eu-west-2a and eu-west-2b
# EKS tags allow the controller to provision external load balancers here.
# ---------------------------------------------------------------------------

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.10.0.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = {
    Name                                   = "${var.project}-public-a"
    "kubernetes.io/cluster/${var.project}" = "shared"
    "kubernetes.io/role/elb"               = "1"
  }
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.10.1.0/24"
  availability_zone       = "${var.aws_region}b"
  map_public_ip_on_launch = true

  tags = {
    Name                                   = "${var.project}-public-b"
    "kubernetes.io/cluster/${var.project}" = "shared"
    "kubernetes.io/role/elb"               = "1"
  }
}

# ---------------------------------------------------------------------------
# Private subnets — eu-west-2a and eu-west-2b
# EKS nodes and RDS live here; internal-LB tag for future internal services.
# ---------------------------------------------------------------------------

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.10.10.0/24"
  availability_zone = "${var.aws_region}a"

  tags = {
    Name                                   = "${var.project}-private-a"
    "kubernetes.io/cluster/${var.project}" = "shared"
    "kubernetes.io/role/internal-elb"      = "1"
  }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.10.11.0/24"
  availability_zone = "${var.aws_region}b"

  tags = {
    Name                                   = "${var.project}-private-b"
    "kubernetes.io/cluster/${var.project}" = "shared"
    "kubernetes.io/role/internal-elb"      = "1"
  }
}

# ---------------------------------------------------------------------------
# NAT Gateway — single, in eu-west-2a (cost optimisation).
# Cost note: ~$32/mo regardless of traffic. Required for nodes in private
# subnets to pull ECR images, reach api.anthropic.com, and other egress.
# To eliminate NAT cost you would need VPC endpoints for every AWS service
# the app touches (ECR, EKS, STS, S3, EFS) + a proxy for Anthropic/Gemini.
# ---------------------------------------------------------------------------

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${var.project}-nat-eip"
  }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_a.id

  tags = {
    Name = "${var.project}-nat"
  }

  depends_on = [aws_internet_gateway.main]
}

# ---------------------------------------------------------------------------
# Route tables
# ---------------------------------------------------------------------------

# Public route table — default route via IGW
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project}-public-rt"
  }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

# Private route table — default route via NAT
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${var.project}-private-rt"
  }
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_b" {
  subnet_id      = aws_subnet.private_b.id
  route_table_id = aws_route_table.private.id
}
