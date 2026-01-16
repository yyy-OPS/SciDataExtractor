@echo off
chcp 65001 >nul
echo ========================================
echo SciDataExtractor 一键安装脚本
echo ========================================
echo.

echo [1/4] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 未检测到 Python，请先安装 Python 3.11+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo ✅ Python 已安装

echo.
echo [2/4] 检查 Node.js 环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 未检测到 Node.js，请先安装 Node.js 16+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js 已安装

echo.
echo [3/4] 安装后端依赖...
cd backend
if not exist venv (
    echo 创建虚拟环境...
    python -m venv venv
)
call venv\Scripts\activate.bat
echo 安装 Python 包...
pip install -r requirements.txt
if errorlevel 1 (
    echo ❌ 后端依赖安装失败
    pause
    exit /b 1
)
echo ✅ 后端依赖安装完成
cd ..

echo.
echo [4/4] 安装前端依赖...
cd frontend
echo 安装 npm 包...
call npm install
if errorlevel 1 (
    echo ❌ 前端依赖安装失败
    pause
    exit /b 1
)
echo ✅ 前端依赖安装完成
cd ..

echo.
echo ========================================
echo ✅ 安装完成！
echo ========================================
echo.
echo 启动方式：
echo   1. 运行 start_backend.bat 启动后端
echo   2. 运行 start_frontend.bat 启动前端
echo   3. 或直接运行 start_all.bat 同时启动
echo.
echo 访问地址: http://localhost:5173
echo.
pause
