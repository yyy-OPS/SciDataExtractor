@echo off
chcp 65001 >nul
echo ========================================
echo SciDataExtractor 一键启动
echo ========================================
echo.
echo 正在启动后端和前端服务...
echo.

start "SciDataExtractor Backend" cmd /k "start_backend.bat"
timeout /t 3 /nobreak >nul
start "SciDataExtractor Frontend" cmd /k "start_frontend.bat"

echo.
echo ✅ 服务已启动！
echo.
echo 后端: http://localhost:8000
echo 前端: http://localhost:5173
echo.
echo 按任意键关闭此窗口...
pause >nul
