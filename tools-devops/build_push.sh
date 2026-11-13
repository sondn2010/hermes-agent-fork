#!/bin/bash
# =============================================
# File: build_push.sh
# Muc dich: Tu dong dang nhap Docker, build Docker image voi build-arg,
# va push image len Docker Hub.
# Co the truyen tham so tu dong lenh:
#   ./build_push.sh <image_tag> <dockerfile_name>
# Neu khong truyen, script se yeu cau nhap tuong tac.
# =============================================

# Nhan tham so image_tag tu dong lenh hoac nhap tuong tac
if [ -z "$1" ]; then
    read -p "Nhap image tag: " IMAGE_TAG
else
    IMAGE_TAG="$1"
fi

# Nhan tham so dockerfile_name tu dong lenh hoac nhap tuong tac
if [ -z "$2" ]; then
    read -p "Nhap dockerfile_name: " DOCKERFILE_NAME
else
    DOCKERFILE_NAME="$2"
fi

# Nhan tham so tuy chon extra build args (vi du: "--build-arg USE_SLIM=false")
EXTRA_ARGS="$3"

# Cau hinh ten image dua tren Docker Hub repository
IMAGE_NAME="quangthan/erp:${IMAGE_TAG}"

echo ""
echo "========================="
echo "Dang nhap docker hub..."
echo "========================="
echo ""

# Doc thong tin dang nhap tu file .env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

if [ -z "$DOCKER_USERNAME" ] || [ -z "$DOCKER_PASSWORD" ]; then
    echo ""
    echo "[Error] Khong tim thay DOCKER_USERNAME hoac DOCKER_PASSWORD!"
    echo "Vui long cau hinh trong tools-devops/.env (tham khao .env.example)."
    exit 1
fi

echo "$DOCKER_PASSWORD" | docker login --username "$DOCKER_USERNAME" --password-stdin
if [ $? -ne 0 ]; then
    echo ""
    echo "[Error] Docker login that bai!"
    exit 1
fi

echo ""
echo "========================="
echo "Build Docker image: ${IMAGE_NAME}"
echo "With Dockerfile path: ${DOCKERFILE_NAME}"
if [ -n "${EXTRA_ARGS}" ]; then
    echo "With Extra Args: ${EXTRA_ARGS}"
fi
echo "Platform: linux/amd64"
echo "========================="
echo ""

# Build image cho linux/amd64
docker buildx build --no-cache \
    --platform linux/amd64 \
    ${EXTRA_ARGS} \
    -t "${IMAGE_NAME}" \
    -f "${DOCKERFILE_NAME}" \
    --push \
    .

if [ $? -ne 0 ]; then
    echo ""
    echo "[Error] Docker buildx build and push that bai!"
    exit 1
fi

echo ""
echo "========================="
echo "Image ${IMAGE_NAME} da duoc build va push thanh cong!"
echo "Platform: linux/amd64"
echo "========================="
echo ""

echo ""
echo "========================="
echo "Hoan thanh. Happy Coding!"
echo "========================="
echo ""

