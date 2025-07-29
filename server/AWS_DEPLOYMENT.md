# SnapSort LCEL Server - AWS Deployment Guide

## Docker Files Created
- `Dockerfile` - Production-optimized Docker image
- `.dockerignore` - Excludes unnecessary files
- `build-and-test.sh` - Local testing script

## Prerequisites
- Docker installed locally
- AWS CLI configured
- AWS account with ECS permissions

## Local Testing
```bash
cd server
chmod +x build-and-test.sh
./build-and-test.sh
```

## AWS ECS Deployment (Console Method)

### Step 1: Create ECR Repository
1. Go to AWS Console → ECR (Elastic Container Registry)
2. Click "Create repository"
3. Name: `snapsort-lcel`
4. Keep defaults, click "Create repository"

### Step 2: Build and Push Image
1. Click on your repository → "View push commands"
2. Run the 4 commands provided (they'll look like):
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com
docker build -t snapsort-lcel .
docker tag snapsort-lcel:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/snapsort-lcel:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/snapsort-lcel:latest
```

### Step 3: Create ECS Cluster
1. Go to AWS Console → ECS
2. Click "Create Cluster"
3. Choose "AWS Fargate (serverless)"
4. Cluster name: `snapsort-cluster`
5. Click "Create"

### Step 4: Create Task Definition
1. In ECS Console → Task Definitions → "Create new task definition"
2. Choose "AWS Fargate"
3. Configuration:
   - Task definition name: `snapsort-lcel-task`
   - Task role: Create new role or use existing
   - Task execution role: ecsTaskExecutionRole
   - Task memory: 1GB
   - Task CPU: 0.5 vCPU

4. Container Definition:
   - Container name: `snapsort-lcel`
   - Image URI: `YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/snapsort-lcel:latest`
   - Memory limit: 1024
   - Port mappings: 3001 (TCP)

5. Environment Variables (Add these):
   ```
   NODE_ENV=production
   PORT=3001
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_key
   OPENAI_API_KEY=your_openai_key
   ```

### Step 5: Create Service with Load Balancer
1. In your cluster → Services → "Create"
2. Configuration:
   - Launch type: Fargate
   - Task definition: snapsort-lcel-task
   - Service name: `snapsort-lcel-service`
   - Number of tasks: 1
   - Minimum healthy percent: 0
   - Maximum percent: 200

3. Load Balancer:
   - Type: Application Load Balancer
   - Create new ALB
   - Listener port: 80
   - Target group: Create new
   - Health check path: `/health`

4. Service Discovery (Optional):
   - Enable if you want internal DNS

### Step 6: Get Your Public URL
1. Go to EC2 Console → Load Balancers
2. Find your ALB → Copy DNS name
3. Your server will be at: `http://your-alb-dns-name.amazonaws.com`

### Step 7: Update Supabase Secrets
```bash
npx supabase secrets set LCEL_SERVER_URL=http://your-alb-dns-name.amazonaws.com
```

## Environment Variables Needed
Make sure to set these in your ECS Task Definition:
- `NODE_ENV=production`
- `PORT=3001`
- `SUPABASE_URL=your_supabase_project_url`
- `SUPABASE_SERVICE_ROLE_KEY=your_service_role_key`
- `OPENAI_API_KEY=your_openai_api_key`

## Security Notes
- The load balancer will handle HTTPS termination
- Your container runs on HTTP internally (port 3001)
- Health checks are configured for `/health` endpoint
- Production security middleware is already enabled in your server

## Monitoring
- CloudWatch logs will automatically collect your server logs
- ECS service metrics available in CloudWatch
- Your server has built-in monitoring endpoints at `/api/monitoring/health`

## Costs (Approximate)
- Fargate: ~$20-30/month for 0.5 vCPU, 1GB RAM
- Load Balancer: ~$16/month
- ECR storage: ~$1/month
- Total: ~$40/month for production deployment
