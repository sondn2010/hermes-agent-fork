# DevOps & Deployment Tools

Thư mục này chứa các kịch bản tự động hóa (build & push) Docker image lên Docker Hub.

## Lệnh Deploy / Build & Push

Để build và push Docker image lên Docker Hub, chạy lệnh sau từ thư mục gốc của dự án:

### Windows (CMD / PowerShell)
```cmd
tools-devops\build_push.bat bkglobal-hermes-agent-v1.0.6 Dockerfile
```

### Linux / macOS (Bash)
```bash
./tools-devops/build_push.sh bkglobal-hermes-agent-v1.0.6 Dockerfile
```

## Tham số (Parameters)

1. `IMAGE_TAG` (Tham số 1): Tag của Docker image (Ví dụ: `bkglobal-hermes-agent-v1.0`). Image hoàn chỉnh sẽ có tên `quangthan/erp:bkglobal-hermes-agent-v1.0`.
2. `DOCKERFILE_NAME` (Tham số 2): Tên hoặc đường dẫn tới Dockerfile (Ví dụ: `Dockerfile`).
