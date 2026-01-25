@echo off
echo Starting build process...

cd backend

if not exist build_env (
    echo Creating virtual environment...
    python -m venv build_env
)

echo Installing dependencies...
call build_env\Scripts\activate
pip install pyinstaller
echo Installing PyTorch (CPU version)...
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
echo Installing other requirements...
pip install -r requirements.txt

echo Building EXE...
pyinstaller --clean SciDataExtractor.spec

echo Build complete! The executable is located in backend\dist\SciDataExtractor
pause
