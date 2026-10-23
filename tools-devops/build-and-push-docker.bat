@echo off
setlocal

REM -----------------------------------------------------------------
REM Build Docker image va push len Docker Hub.
REM Thong tin dang nhap doc tu tools-devops\.env (khong commit), xem .env.example.
REM Cach dung:
REM   tools-devops\build-and-push-docker.bat ImageTag [DockerfilePath]
REM DockerfilePath mac dinh la Dockerfile (tinh tu thu muc goc repo).
REM -----------------------------------------------------------------
set "SCRIPT_DIR=%~dp0"
set "ENV_FILE=%SCRIPT_DIR%.env"

if not exist "%ENV_FILE%" (
    echo [Error] Khong tim thay %ENV_FILE%
    echo Hay copy %SCRIPT_DIR%.env.example thanh .env va dien thong tin.
    exit /b 1
)

REM Doc KEY=VALUE tu .env, bo qua dong comment bat dau bang #
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENV_FILE%") do set "%%A=%%B"

if "%DOCKER_USERNAME%"=="" ( echo [Error] Thieu DOCKER_USERNAME trong %ENV_FILE% & exit /b 1 )
if "%DOCKER_PASSWORD%"=="" ( echo [Error] Thieu DOCKER_PASSWORD trong %ENV_FILE% & exit /b 1 )
if "%DOCKER_IMAGE_REPO%"=="" ( echo [Error] Thieu DOCKER_IMAGE_REPO trong %ENV_FILE% & exit /b 1 )
if "%DOCKER_PLATFORM%"=="" set "DOCKER_PLATFORM=linux/amd64"

if "%~1"=="" (
    echo Usage: build-and-push-docker.bat ImageTag [DockerfilePath]
    exit /b 1
)
set "ImageName=%DOCKER_IMAGE_REPO%:%~1"
set "DockerfilePath=%~2"
if "%DockerfilePath%"=="" set "DockerfilePath=Dockerfile"

pushd "%SCRIPT_DIR%.."

echo.
echo =========================
echo Build Docker image: %ImageName%
echo Su dung Dockerfile: %DockerfilePath%
echo Platform: %DOCKER_PLATFORM%
echo =========================
echo.

docker build --no-cache --platform %DOCKER_PLATFORM% -t %ImageName% -f %DockerfilePath% .
if errorlevel 1 (
    echo [Error] Docker build that bai!
    popd
    pause
    exit /b 1
)

echo Dang nhap Docker Hub...
echo %DOCKER_PASSWORD%| docker login --username %DOCKER_USERNAME% --password-stdin
if errorlevel 1 (
    echo [Error] Docker login that bai!
    popd
    pause
    exit /b 1
)
echo Dang nhap thanh cong!

echo.
echo =========================
echo Push Docker image: %ImageName% len Docker Hub...
echo =========================
echo.

docker push %ImageName%
if errorlevel 1 (
    echo [Error] Docker push that bai!
    popd
    pause
    exit /b 1
)

popd
echo.
echo =========================
echo Hoan thanh. Happy Coding!
echo =========================
pause
endlocal
