# tools-devops

Script build Docker image của Hermes Agent và push lên Docker Hub.

| File | Môi trường | Ghi chú |
|---|---|---|
| `build_push.sh` | macOS / Linux | Login → `docker buildx build --push` |
| `build-and-push-docker.bat` | Windows | Build → login → `docker push` |
| `.env.example` | — | File mẫu cấu hình, được commit |
| `.env` | — | Thông tin đăng nhập thật, **không commit** |

## Cài đặt lần đầu

1. Tạo Personal Access Token trên Docker Hub (Account Settings → Personal access tokens,
   quyền *Read & Write*). Không dùng mật khẩu tài khoản.
2. Tạo file `.env` từ file mẫu:

   ```bash
   cp tools-devops/.env.example tools-devops/.env
   ```

   Windows:

   ```bat
   copy tools-devops\.env.example tools-devops\.env
   ```

3. Điền các biến trong `tools-devops/.env`:

   | Biến | Bắt buộc | Ý nghĩa |
   |---|---|---|
   | `DOCKER_USERNAME` | Có | Username Docker Hub |
   | `DOCKER_PASSWORD` | Có | Personal Access Token (`dckr_pat_...`) |
   | `DOCKER_IMAGE_REPO` | Có | Repository, ví dụ `quangthan/erp` (xem [Quy ước tên image](#quy-ước-tên-image)) |
   | `DOCKER_PLATFORM` | Không | Platform build, mặc định `linux/amd64` |

## Sử dụng

Có thể chạy từ bất kỳ thư mục nào; script tự chuyển về thư mục gốc repo để làm build context.
Image được tag thành `<DOCKER_IMAGE_REPO>:<image_tag>`.

macOS / Linux:

```bash
./tools-devops/build_push.sh <image_tag> [dockerfile_path]

# ví dụ (DOCKER_IMAGE_REPO=quangthan/erp)
./tools-devops/build_push.sh hermes-agent-1.0.0
./tools-devops/build_push.sh hermes-agent-sandbox-1.0.0 docker/sandbox-desktop.Dockerfile
```

Bỏ trống `image_tag` thì script sẽ hỏi nhập tương tác.

Windows:

```bat
tools-devops\build-and-push-docker.bat <image_tag> [dockerfile_path]

REM ví dụ
tools-devops\build-and-push-docker.bat hermes-agent-1.0.0
```

`dockerfile_path` tính từ thư mục gốc repo, mặc định là `Dockerfile`.

## Quy ước tên image

Tên image có dạng `[registry/]namespace/repo:tag` và chỉ được có **một** dấu `:` (trước tag).
Các service ERP dùng chung một repo `quangthan/erp`, tên app nằm trong tag:

```text
quangthan/erp:hermes-agent-1.0.0
└────┬──────┘ └───────┬────────┘
 DOCKER_IMAGE_REPO   image_tag = <app>-<version>
```

Dùng trong `docker-compose.yml` / stack Portainer với `REPO_PREFIX=quangthan/erp`:

```yaml
services:
  hermes:
    image: ${REPO_PREFIX}:hermes-agent-1.0.0
```

> ⚠️ Không viết `${REPO_PREFIX}:hermes-agent:1.0.0`: sẽ thành `quangthan/erp:hermes-agent:1.0.0`
> và Docker báo `invalid reference format`.

Kiểm tra tên image sau khi ghép biến:

```bash
docker compose config | grep image:
```

## Retag image đã push

Gắn thêm tag mới cho image đã có trên Docker Hub, không cần build lại hay pull về máy
(giữ nguyên mọi platform của image gốc):

```bash
set -a; . tools-devops/.env; set +a
printf '%s' "$DOCKER_PASSWORD" | docker login --username "$DOCKER_USERNAME" --password-stdin
docker buildx imagetools create -t quangthan/erp:hermes-agent-1.0.0 quangthan/hermes-agent:1.0.0
docker buildx imagetools inspect quangthan/erp:hermes-agent-1.0.0
```

## Yêu cầu

- Docker Desktop / Docker Engine đang chạy.
- `build_push.sh` cần `docker buildx` (có sẵn trong Docker Desktop và Docker Engine bản mới).

## Bảo mật

- `tools-devops/.env` bị loại trừ bởi `.gitignore` (không commit) và `.dockerignore`
  (không bị `COPY . .` đưa vào image).
- Mật khẩu được truyền qua `--password-stdin`, không xuất hiện trên dòng lệnh.
- Không bao giờ ghi token trực tiếp vào script. Nếu token bị lộ, thu hồi ngay trên Docker Hub
  và tạo token mới.

Kiểm tra `.env` đã được ignore:

```bash
git check-ignore -v tools-devops/.env
```
