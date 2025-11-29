@echo off
REM ==========================================================================
REM NornicDB Full Build Script with CUDA Support
REM ==========================================================================
REM This script:
REM   1. Builds the UI (npm)
REM   2. Builds NornicDB with CUDA and localllm support
REM
REM Requirements:
REM   - Node.js 18+ (for UI build)
REM   - Go 1.21+
REM   - Visual Studio 2022 Build Tools with C++ Desktop development
REM   - CUDA Toolkit 12.x (optional, for GPU acceleration)
REM   - Pre-built libllama_windows_amd64.a in lib\llama (or run build-llama-cuda.ps1)
REM
REM Usage:
REM   build-full.bat           - Full build with CUDA
REM   build-full.bat --no-cuda - Build without CUDA support
REM ==========================================================================

setlocal enabledelayedexpansion

set NO_CUDA=0
if "%1"=="--no-cuda" set NO_CUDA=1

echo.
echo ============================================================
echo  NornicDB Full Build
echo ============================================================
echo.

REM Check for Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found. Please install Node.js 18+
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo   Node.js: %%i

REM Check for Go
where go >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Go not found. Please install Go 1.21+
    exit /b 1
)
for /f "tokens=*" %%i in ('go version') do echo   Go: %%i

REM Check for CUDA (optional)
if %NO_CUDA%==0 (
    where nvcc >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo   CUDA: Not found - building without GPU acceleration
        set NO_CUDA=1
    ) else (
        for /f "tokens=*" %%i in ('nvcc --version ^| findstr "release"') do echo   CUDA: %%i
    )
)

echo.

REM ==========================================================================
REM Step 1: Build UI
REM ==========================================================================
echo [1/3] Building UI...
cd ui
call npm ci 2>nul || call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm install failed!
    cd ..
    exit /b 1
)

call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] UI build failed!
    cd ..
    exit /b 1
)
cd ..
echo   UI build complete: ui\dist\
echo.

REM ==========================================================================
REM Step 2: Initialize VS environment (for CGO with MSVC)
REM ==========================================================================
echo [2/3] Setting up build environment...

REM Try VS 2022 Build Tools first, then VS 2022 Community/Professional/Enterprise
set VCVARS=
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    set VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat
) else if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" (
    set VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat
) else if exist "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat" (
    set VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat
) else if exist "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat" (
    set VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat
)

if "%VCVARS%"=="" (
    echo [WARNING] Visual Studio 2022 not found. CGO may use GCC if available.
) else (
    echo   Visual Studio: %VCVARS%
    call "%VCVARS%" >nul 2>&1
)

REM Set CGO environment
set CGO_ENABLED=1

REM ==========================================================================
REM Step 3: Build NornicDB
REM ==========================================================================
echo.
echo [3/3] Building NornicDB...

REM Create bin directory
if not exist bin mkdir bin

if %NO_CUDA%==1 (
    echo   Building without CUDA...
    set BUILD_TAGS=localllm
) else (
    echo   Building with CUDA support...
    set BUILD_TAGS=cuda,localllm
)

REM Build main binary
go build -tags "%BUILD_TAGS%" -ldflags="-s -w" -o bin\nornicdb.exe .\cmd\nornicdb
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] NornicDB build failed!
    exit /b 1
)

REM Build bolt client
go build -ldflags="-s -w" -o bin\nornicdb-bolt.exe .\cmd\nornicdb-bolt
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] nornicdb-bolt build failed!
    exit /b 1
)

echo.
echo ============================================================
echo  Build Complete!
echo ============================================================
echo.
echo   bin\nornicdb.exe       - Main server
if %NO_CUDA%==0 (
    echo     with CUDA acceleration
) else (
    echo     CPU only
)
echo   bin\nornicdb-bolt.exe  - Bolt CLI client
echo.
echo To run:
echo   set NORNICDB_EMBEDDING_PROVIDER=local
echo   set NORNICDB_MODELS_DIR=C:\path\to\models
echo   bin\nornicdb.exe serve
echo.

endlocal
