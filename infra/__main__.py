"""
Trubaoke — AWS infrastructure (Pulumi)

Resources created:
  - DynamoDB table     → caches detected chords + lyrics per video
  - ECR repository     → stores the backend Docker image
  - App Runner service → runs the FastAPI backend container
  - S3 bucket          → hosts the compiled React frontend
  - CloudFront CDN     → serves frontend + proxies /api/* to App Runner

Before running `pulumi up`:
  1. Set your YouTube Data API v3 key:
       pulumi config set --secret youtubeApiKey <YOUR_KEY>

  2. Build and push the backend Docker image (after ECR repo is created):
       docker build -t trubaoke-backend ./backend
       aws ecr get-login-password --region <REGION> \\
         | docker login --username AWS --password-stdin <ECR_REPO_URL>
       docker tag  trubaoke-backend <ECR_REPO_URL>:latest
       docker push <ECR_REPO_URL>:latest
"""

import json

import pulumi
import pulumi_aws as aws

# ── Config ─────────────────────────────────────────────────────────────────────

cfg = pulumi.Config()

# YouTube Data API v3 key (required secret)
youtube_api_key: pulumi.Output[str] = cfg.require_secret("youtubeApiKey")

# Docker image tag to deploy (default: "latest")
image_tag: str = cfg.get("imageTag") or "latest"

# ── DynamoDB — song cache ──────────────────────────────────────────────────────

songs_table = aws.dynamodb.Table(
    "trubaoke-songs",
    hash_key="videoId",
    attributes=[aws.dynamodb.TableAttributeArgs(name="videoId", type="S")],
    billing_mode="PAY_PER_REQUEST",
    ttl=aws.dynamodb.TableTtlArgs(attribute_name="ttl", enabled=True),
    tags={"app": "trubaoke"},
)

# ── ECR — backend image registry ──────────────────────────────────────────────

ecr_repo = aws.ecr.Repository(
    "trubaoke-backend",
    image_tag_mutability="MUTABLE",
    image_scanning_configuration=aws.ecr.RepositoryImageScanningConfigurationArgs(
        scan_on_push=True,
    ),
    force_delete=True,   # OK for personal project; remove for production
    tags={"app": "trubaoke"},
)

aws.ecr.LifecyclePolicy(
    "trubaoke-backend-lifecycle",
    repository=ecr_repo.name,
    policy=json.dumps({
        "rules": [{
            "rulePriority": 1,
            "description": "Retain the 5 most recent images",
            "selection": {
                "tagStatus": "any",
                "countType": "imageCountMoreThan",
                "countNumber": 5,
            },
            "action": {"type": "expire"},
        }]
    }),
)

# ── IAM — App Runner access role (used to pull images from ECR) ───────────────

access_role = aws.iam.Role(
    "trubaoke-ar-access",
    assume_role_policy=json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "build.apprunner.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    }),
    tags={"app": "trubaoke"},
)

aws.iam.RolePolicyAttachment(
    "trubaoke-ar-access-ecr",
    role=access_role.name,
    policy_arn="arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess",
)

# ── IAM — App Runner instance role (used by the running container) ─────────────

instance_role = aws.iam.Role(
    "trubaoke-ar-instance",
    assume_role_policy=json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "tasks.apprunner.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    }),
    tags={"app": "trubaoke"},
)

aws.iam.RolePolicy(
    "trubaoke-ar-instance-dynamodb",
    role=instance_role.id,
    policy=songs_table.arn.apply(lambda arn: json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query",
            ],
            "Resource": arn,
        }],
    })),
)

# ── App Runner — FastAPI backend ──────────────────────────────────────────────

backend_image_uri = ecr_repo.repository_url.apply(lambda url: f"{url}:{image_tag}")

backend = aws.apprunner.Service(
    "trubaoke-backend",
    service_name="trubaoke-backend",
    source_configuration=aws.apprunner.ServiceSourceConfigurationArgs(
        auto_deployments_enabled=False,
        authentication_configuration=aws.apprunner.ServiceSourceConfigurationAuthenticationConfigurationArgs(
            access_role_arn=access_role.arn,
        ),
        image_repository=aws.apprunner.ServiceSourceConfigurationImageRepositoryArgs(
            image_identifier=backend_image_uri,
            image_repository_type="ECR",
            image_configuration=aws.apprunner.ServiceSourceConfigurationImageRepositoryImageConfigurationArgs(
                port="8000",
                runtime_environment_variables={
                    "DYNAMODB_TABLE": songs_table.name,
                    "YOUTUBE_API_KEY": youtube_api_key,
                },
            ),
        ),
    ),
    instance_configuration=aws.apprunner.ServiceInstanceConfigurationArgs(
        instance_role_arn=instance_role.arn,
        cpu="1024",   # 1 vCPU — chord detection is CPU-bound
        memory="2048",  # 2 GB — librosa + numpy need room
    ),
    health_check_configuration=aws.apprunner.ServiceHealthCheckConfigurationArgs(
        path="/health",
        protocol="HTTP",
        interval=10,
        timeout=5,
        healthy_threshold=1,
        unhealthy_threshold=5,
    ),
    tags={"app": "trubaoke"},
)

# ── S3 — frontend static files ────────────────────────────────────────────────

frontend_bucket = aws.s3.BucketV2(
    "trubaoke-frontend",
    tags={"app": "trubaoke"},
)

aws.s3.BucketPublicAccessBlock(
    "trubaoke-frontend-pab",
    bucket=frontend_bucket.id,
    block_public_acls=True,
    block_public_policy=True,
    ignore_public_acls=True,
    restrict_public_buckets=True,
)

# ── CloudFront OAC — signed requests to private S3 bucket ────────────────────

oac = aws.cloudfront.OriginAccessControl(
    "trubaoke-oac",
    description="Trubaoke frontend — S3 OAC",
    origin_access_control_origin_type="s3",
    signing_behavior="always",
    signing_protocol="sigv4",
)

# ── CloudFront distribution — serves frontend + proxies /api/* to backend ─────

# Strip "https://" from App Runner service URL for the CloudFront origin hostname
backend_origin_hostname = backend.service_url

cdn = aws.cloudfront.Distribution(
    "trubaoke-cdn",
    origins=[
        # Origin 1: S3 bucket (frontend static files)
        aws.cloudfront.DistributionOriginArgs(
            origin_id="s3-frontend",
            domain_name=frontend_bucket.bucket_regional_domain_name,
            origin_access_control_id=oac.id,
        ),
        # Origin 2: App Runner backend (/api/* requests)
        aws.cloudfront.DistributionOriginArgs(
            origin_id="apprunner-backend",
            domain_name=backend_origin_hostname,
            custom_origin_config=aws.cloudfront.DistributionOriginCustomOriginConfigArgs(
                http_port=80,
                https_port=443,
                origin_protocol_policy="https-only",
                origin_ssl_protocols=["TLSv1.2"],
            ),
        ),
    ],
    enabled=True,
    is_ipv6_enabled=True,
    default_root_object="index.html",
    # Default behaviour: serve React SPA from S3
    default_cache_behavior=aws.cloudfront.DistributionDefaultCacheBehaviorArgs(
        target_origin_id="s3-frontend",
        viewer_protocol_policy="redirect-to-https",
        allowed_methods=["GET", "HEAD", "OPTIONS"],
        cached_methods=["GET", "HEAD"],
        compress=True,
        forwarded_values=aws.cloudfront.DistributionDefaultCacheBehaviorForwardedValuesArgs(
            query_string=False,
            cookies=aws.cloudfront.DistributionDefaultCacheBehaviorForwardedValuesCookiesArgs(
                forward="none",
            ),
        ),
        min_ttl=0,
        default_ttl=3600,
        max_ttl=86400,
    ),
    # /api/* → App Runner backend (no caching)
    ordered_cache_behaviors=[
        aws.cloudfront.DistributionOrderedCacheBehaviorArgs(
            path_pattern="/api/*",
            target_origin_id="apprunner-backend",
            viewer_protocol_policy="https-only",
            allowed_methods=[
                "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT",
            ],
            cached_methods=["GET", "HEAD"],
            compress=True,
            forwarded_values=aws.cloudfront.DistributionOrderedCacheBehaviorForwardedValuesArgs(
                query_string=True,
                headers=["Accept", "Content-Type"],
                cookies=aws.cloudfront.DistributionOrderedCacheBehaviorForwardedValuesCookiesArgs(
                    forward="none",
                ),
            ),
            min_ttl=0,
            default_ttl=0,
            max_ttl=0,
        ),
    ],
    # Serve index.html for all unknown paths (React Router support)
    custom_error_responses=[
        aws.cloudfront.DistributionCustomErrorResponseArgs(
            error_code=403, response_code=200, response_page_path="/index.html",
        ),
        aws.cloudfront.DistributionCustomErrorResponseArgs(
            error_code=404, response_code=200, response_page_path="/index.html",
        ),
    ],
    price_class="PriceClass_100",  # US + EU + Asia — lowest cost
    restrictions=aws.cloudfront.DistributionRestrictionsArgs(
        geo_restriction=aws.cloudfront.DistributionRestrictionsGeoRestrictionArgs(
            restriction_type="none",
        ),
    ),
    viewer_certificate=aws.cloudfront.DistributionViewerCertificateArgs(
        cloudfront_default_certificate=True,
    ),
    tags={"app": "trubaoke"},
)

# ── S3 bucket policy — allow CloudFront OAC to read objects ───────────────────

caller = aws.get_caller_identity()

aws.s3.BucketPolicy(
    "trubaoke-frontend-policy",
    bucket=frontend_bucket.id,
    policy=pulumi.Output.all(frontend_bucket.arn, cdn.id).apply(
        lambda args: json.dumps({
            "Version": "2012-10-17",
            "Statement": [{
                "Sid": "AllowCloudFrontOAC",
                "Effect": "Allow",
                "Principal": {"Service": "cloudfront.amazonaws.com"},
                "Action": "s3:GetObject",
                "Resource": f"{args[0]}/*",
                "Condition": {
                    "StringEquals": {
                        "AWS:SourceArn": (
                            f"arn:aws:cloudfront::{caller.account_id}"
                            f":distribution/{args[1]}"
                        )
                    }
                },
            }],
        })
    ),
)

# ── Outputs ────────────────────────────────────────────────────────────────────

pulumi.export(
    "frontend_url",
    cdn.domain_name.apply(lambda d: f"https://{d}"),
)
pulumi.export(
    "backend_url",
    backend.service_url.apply(lambda u: f"https://{u}"),
)
pulumi.export("ecr_repo_url", ecr_repo.repository_url)
pulumi.export("dynamodb_table", songs_table.name)
pulumi.export("frontend_bucket", frontend_bucket.id)
