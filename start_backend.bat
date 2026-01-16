@echo off
chcp 65001 >nul
echo ========================================
echo 启动 SciDataExtractor 后端服务
echo ========================================
echo.

cd backend
if not exist venv (
    echo ❌ 虚拟环境不存在，请先运行 install.bat
    pause
    exit /b 1
)

call venv\Scripts\activate.bat
echo ✅ 虚拟环境已激活
echo.
echo 🚀 启动 FastAPI 服务器...
echo 访问地址: http://localhost:8000
echo API 文档: http://localhost:8000/docs
echo.
python main.py
