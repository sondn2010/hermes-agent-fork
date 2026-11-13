@echo off
REM =============================================
REM File: build_push.bat
REM Muc dich: Tu dong dang nhap Docker, build Docker image voi build-arg,
REM va push image len Docker Hub.
REM Co the truyen tham so tu dong lenh:
REM   build_push.bat <image_tag>
REM Neu khong truyen, script se yeu cau nhap tuong tac.
REM =============================================

REM Nhan tham so image_tag tu dong lenh hoac nhap tuong tac
IF "%~1"=="" (
    set /p IMAGE_TAG=Nhap image tag:
) ELSE (
    set IMAGE_TAG=%~1
)

REM Nhan tham so dockerfile_name tu dong lenh hoac nhap tuong tac
IF "%~2"=="" (
    set /p DOCKERFILE_NAME=Nhap dockerfile_name:
) ELSE (
    set DOCKERFILE_NAME=%~2
)

REM Nhan tham so extra build args (vi du: "--build-arg USE_SLIM=false")
set "EXTRA_ARGS=%~3"

REM Cau hinh ten image dua tren Docker Hub repository (thay doi theo y ban neu can)
set "IMAGE_NAME=quangthan/erp:%IMAGE_TAG%"

echo.
echo =========================
echo Dang nhap docker hub...
echo =========================
echo.

REM Load thong tin dang nhap tu file .env
set "ENV_FILE=%~dp0.env"
if exist "%ENV_FILE%" (
    for /f "usebackq eol=# tokens=1* delims==" %%A in ("%ENV_FILE%") do (
        set "%%A=%%B"
    )
)

if "%DOCKER_USERNAME%"=="" (
    echo.
    echo [Error] Khong tim thay DOCKER_USERNAME!
    echo Vui long cau hinh trong tools-devops/.env ^(tham khao .env.example^).
    pause
    exit /b 1
)

if "%DOCKER_PASSWORD%"=="" (
    echo.
    echo [Error] Khong tim thay DOCKER_PASSWORD!
    echo Vui long cau hinh trong tools-devops/.env ^(tham khao .env.example^).
    pause
    exit /b 1
)

docker login --username %DOCKER_USERNAME% --password %DOCKER_PASSWORD%
IF ERRORLEVEL 1 (
    echo.
    echo [Error] Docker login that bai!
    pause
    exit /b 1
)

echo.
echo =========================
echo Build Docker image: %IMAGE_NAME%
echo With Dockerfile path: %DOCKERFILE_NAME%
if not "%EXTRA_ARGS%"=="" echo With Extra Args: %EXTRA_ARGS%
echo =========================
echo.

REM Build image voi build-arg
docker build --no-cache %EXTRA_ARGS% -t %IMAGE_NAME% -f %DOCKERFILE_NAME% .
IF ERRORLEVEL 1 (
    echo.
    echo [Error] Docker build that bai!
    pause
    exit /b 1
)

echo.
echo =========================
echo Push Docker image: %IMAGE_NAME% len Docker Hub quangthan/erp...
echo =========================
echo.

docker push %IMAGE_NAME%
IF ERRORLEVEL 1 (
    echo.
    echo [Error] Docker push that bai!
    pause
    exit /b 1
)

echo.
echo =========================
echo Hoan thanh. Happy Coding!
echo =========================
pause
