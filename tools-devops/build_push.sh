#!/bin/bash
# =============================================
# File: build_push.sh
# Muc dich: Dang nhap Docker Hub, build image (buildx) va push len Docker Hub.
# Thong tin dang nhap doc tu tools-devops/.env (khong commit), xem .env.example.
# Cach dung:
#   ./tools-devops/build_push.sh <image_tag> [dockerfile_path]
# Neu khong truyen image_tag, script se yeu cau nhap tuong tac.
# dockerfile_path mac dinh la Dockerfile (tinh tu thu muc goc repo).
# =============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [ ! -f "${ENV_FILE}" ]; then
    echo "[Error] Khong tim thay ${ENV_FILE}"
    echo "Hay copy ${SCRIPT_DIR}/.env.example thanh .env va dien thong tin."
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

for VAR in DOCKER_USERNAME DOCKER_PASSWORD DOCKER_IMAGE_REPO; do
    if [ -z "${!VAR}" ]; then
        echo "[Error] Thieu bien ${VAR} trong ${ENV_FILE}"
        exit 1
    fi
done
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"

if [ -z "$1" ]; then
    read -p "Nhap image tag: " IMAGE_TAG
else
    IMAGE_TAG="$1"
fi
if [ -z "${IMAGE_TAG}" ]; then
    echo "[Error] Image tag khong duoc de trong!"
    exit 1
fi

DOCKERFILE_NAME="${2:-Dockerfile}"
IMAGE_NAME="${DOCKER_IMAGE_REPO}:${IMAGE_TAG}"

cd "${REPO_ROOT}" || exit 1

echo ""
echo "========================="
echo "Dang nhap docker hub..."
echo "========================="
echo ""

echo "${DOCKER_PASSWORD}" | docker login --username "${DOCKER_USERNAME}" --password-stdin
if [ $? -ne 0 ]; then
    echo ""
    echo "[Error] Docker login that bai!"
    exit 1
fi

echo ""
echo "========================="
echo "Build Docker image: ${IMAGE_NAME}"
echo "With Dockerfile path: ${DOCKERFILE_NAME}"
echo "Platform: ${DOCKER_PLATFORM}"
echo "========================="
echo ""

docker buildx build --no-cache \
    --platform "${DOCKER_PLATFORM}" \
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
echo "Platform: ${DOCKER_PLATFORM}"
echo "========================="
echo ""
echo "Hoan thanh. Happy Coding!"
echo ""
