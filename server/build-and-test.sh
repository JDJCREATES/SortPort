#!/bin/bash

# Build and Test Script for SnapSort LCEL Server
# Run this script to build and test your Docker image locally before AWS deployment

set -e

echo "🐳 Building SnapSort LCEL Server Docker image..."
docker build -t snapsort-lcel:latest .

echo "✅ Build complete!"

echo "🧪 Testing the image locally..."
echo "Starting container on port 3001..."

# Run container in background
CONTAINER_ID=$(docker run -d -p 3001:3001 \
  -e NODE_ENV=production \
  -e PORT=3001 \
  snapsort-lcel:latest)

echo "Container ID: $CONTAINER_ID"

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 10

# Test health endpoint
echo "🔍 Testing health endpoint..."
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
  echo "✅ Health check passed!"
else
  echo "❌ Health check failed!"
  docker logs $CONTAINER_ID
  docker stop $CONTAINER_ID
  exit 1
fi

# Show logs
echo "📋 Container logs:"
docker logs $CONTAINER_ID

# Stop container
echo "🛑 Stopping test container..."
docker stop $CONTAINER_ID

echo ""
echo "🎉 Docker image is ready for AWS deployment!"
echo ""
echo "Next steps for AWS ECS:"
echo "1. Create ECR repository: aws ecr create-repository --repository-name snapsort-lcel"
echo "2. Push image to ECR (get commands from AWS console)"
echo "3. Create ECS cluster and service using the AWS console"
echo "4. Set your environment variables in the ECS task definition"
