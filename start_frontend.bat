@echo off
chcp 65001 >nul
echo ========================================
echo 启动 SciDataExtractor 前端服务
echo ========================================
echo.

cd frontend
if not exist node_modules (
    echo ❌ 依赖未安装，请先运行 install.bat
    pause
    exit /b 1
)

echo 🚀 启动 Vite 开发服务器...
echo 访问地址: http://localhost:5173
echo.
call npm run dev
