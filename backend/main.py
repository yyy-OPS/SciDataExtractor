"""
SciDataExtractor Backend Service
FastAPI RESTful API with AI-assisted chart recognition
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid
import shutil
from pathlib import Path
from dotenv import load_dotenv

from image_processor import ImageProcessor

# Load environment variables
load_dotenv()

# Create FastAPI app instance
app = FastAPI(title="SciDataExtractor API", version="2.0.0")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create temp file storage directories
UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# Store image processor instances per session
processors = {}
# Store image paths per session
image_paths = {}

# AI Assistant instance (lazy initialization)
ai_assistant = None


def get_ai_assistant():
    """Get or create AI Assistant instance"""
    global ai_assistant
    if ai_assistant is None:
        try:
            from ai_assistant import AIAssistant
            ai_assistant = AIAssistant()
        except Exception as e:
            print(f"AI Assistant initialization failed: {e}")
            return None
    return ai_assistant


# ==================== Data Models ====================

class CalibrationPoint(BaseModel):
    """Calibration point data model"""
    pixel_x: float
    pixel_y: float
    real_value: float


class CalibrationData(BaseModel):
    """Calibration data model - X and Y axis start/end points"""
    x_start: CalibrationPoint
    x_end: CalibrationPoint
    y_start: CalibrationPoint
    y_end: CalibrationPoint


class ColorSampleRequest(BaseModel):
    """Color sampling request model"""
    session_id: str
    pixel_x: int
    pixel_y: int
    tolerance: int = 20


class ExtractionRequest(BaseModel):
    """Data extraction request model"""
    session_id: str
    calibration: CalibrationData
    sampled_color_hsv: List[int]
    tolerance: int = 20
    data: Optional[List[dict]] = None  # 可选：直接提供要导出的数据
    downsample_factor: int = 1  # 降采样因子
    smooth: bool = False  # 是否平滑
    extract_region: Optional[dict] = None  # 提取范围限制 {x, y, width, height} in pixels


class AIConfigRequest(BaseModel):
    """AI configuration request model"""
    api_key: str
    base_url: Optional[str] = None
    model: Optional[str] = "gpt-4o"


class AIAnalyzeRequest(BaseModel):
    """AI analysis request model"""
    session_id: str


class AIColorRequest(BaseModel):
    """AI color identification request model"""
    session_id: str
    curve_description: Optional[str] = "main data curve"


# ==================== API Endpoints ====================

@app.get("/")
async def root():
    """Root path - API health check"""
    ai_status = "available" if get_ai_assistant() is not None else "not configured"
    return {
        "message": "SciDataExtractor API is running",
        "version": "2.0.0",
        "ai_status": ai_status,
        "endpoints": {
            "basic": ["/upload", "/sample-color", "/extract", "/export", "/download"],
            "ai": ["/ai/config", "/ai/analyze", "/ai/suggest-calibration", "/ai/identify-color"]
        }
    }


@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    """
    Step 1: Upload image
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files supported (PNG/JPG)")

    session_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    file_path = UPLOAD_DIR / f"{session_id}{file_extension}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Create image processor instance
    processor = ImageProcessor(str(file_path))
    processors[session_id] = processor
    image_paths[session_id] = str(file_path)

    return {
        "session_id": session_id,
        "filename": file.filename,
        "width": processor.width,
        "height": processor.height,
        "message": "Image uploaded successfully"
    }


@app.post("/sample-color")
async def sample_color(request: ColorSampleRequest):
    """
    Color sampling - get HSV color at clicked point
    """
    if request.session_id not in processors:
        raise HTTPException(status_code=404, detail="Session not found, please upload image first")

    processor = processors[request.session_id]

    try:
        hsv_color = processor.sample_color_at_point(request.pixel_x, request.pixel_y)
        return {
            "hsv_color": hsv_color.tolist(),
            "message": f"Sampling successful: HSV({hsv_color[0]}, {hsv_color[1]}, {hsv_color[2]})"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Color sampling failed: {str(e)}")


@app.post("/extract")
async def extract_data(request: ExtractionRequest):
    """
    Step 3: Extract data
    """
    if request.session_id not in processors:
        raise HTTPException(status_code=404, detail="Session not found")

    processor = processors[request.session_id]

    try:
        processor.set_calibration(
            x_axis_pixels=(
                (request.calibration.x_start.pixel_x, request.calibration.x_start.pixel_y),
                (request.calibration.x_end.pixel_x, request.calibration.x_end.pixel_y)
            ),
            x_axis_values=(
                request.calibration.x_start.real_value,
                request.calibration.x_end.real_value
            ),
            y_axis_pixels=(
                (request.calibration.y_start.pixel_x, request.calibration.y_start.pixel_y),
                (request.calibration.y_end.pixel_x, request.calibration.y_end.pixel_y)
            ),
            y_axis_values=(
                request.calibration.y_start.real_value,
                request.calibration.y_end.real_value
            )
        )

        # 如果指定了提取范围，设置提取区域
        if request.extract_region:
            processor.plot_region = {
                'x_min': request.extract_region['x'],
                'x_max': request.extract_region['x'] + request.extract_region['width'],
                'y_min': request.extract_region['y'],
                'y_max': request.extract_region['y'] + request.extract_region['height']
            }

        data_points = processor.extract_curve(
            target_hsv=request.sampled_color_hsv,
            tolerance=request.tolerance,
            downsample_factor=request.downsample_factor,
            smooth=request.smooth
        )

        if len(data_points) == 0:
            return {
                "data": [],
                "count": 0,
                "message": "No curve detected, try adjusting color tolerance or re-sampling"
            }

        result = [{"x": float(x), "y": float(y)} for x, y in data_points]

        return {
            "data": result,
            "count": len(result),
            "message": f"Successfully extracted {len(result)} data points"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data extraction failed: {str(e)}")


@app.post("/export")
async def export_to_excel(request: ExtractionRequest):
    """
    Step 4: Export to Excel
    如果请求中包含 data 字段，直接使用该数据（已经过前端编辑）
    否则重新提取数据
    """
    if request.session_id not in processors:
        raise HTTPException(status_code=404, detail="Session not found")

    processor = processors[request.session_id]

    try:
        # 如果前端提供了数据，直接使用
        if request.data is not None and len(request.data) > 0:
            # 前端数据已经是物理坐标，直接转换为元组列表
            data_points = [(point['x'], point['y']) for point in request.data]
        else:
            # 否则重新提取数据
            processor.set_calibration(
                x_axis_pixels=(
                    (request.calibration.x_start.pixel_x, request.calibration.x_start.pixel_y),
                    (request.calibration.x_end.pixel_x, request.calibration.x_end.pixel_y)
                ),
                x_axis_values=(
                    request.calibration.x_start.real_value,
                    request.calibration.x_end.real_value
                ),
                y_axis_pixels=(
                    (request.calibration.y_start.pixel_x, request.calibration.y_start.pixel_y),
                    (request.calibration.y_end.pixel_x, request.calibration.y_end.pixel_y)
                ),
                y_axis_values=(
                    request.calibration.y_start.real_value,
                    request.calibration.y_end.real_value
                )
            )

            data_points = processor.extract_curve(
                target_hsv=request.sampled_color_hsv,
                tolerance=request.tolerance
            )

        if len(data_points) == 0:
            raise HTTPException(status_code=400, detail="No data to export")

        output_path = OUTPUT_DIR / f"{request.session_id}.xlsx"
        processor.export_to_excel(data_points, str(output_path))

        return {
            "download_url": f"/download/{request.session_id}",
            "message": f"Excel file generated successfully with {len(data_points)} data points"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@app.get("/download/{session_id}")
async def download_excel(session_id: str):
    """
    Download generated Excel file
    """
    file_path = OUTPUT_DIR / f"{session_id}.xlsx"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        filename=f"extracted_data_{session_id[:8]}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


@app.delete("/session/{session_id}")
async def cleanup_session(session_id: str):
    """
    Cleanup session data
    """
    if session_id in processors:
        del processors[session_id]
    if session_id in image_paths:
        del image_paths[session_id]

    for directory in [UPLOAD_DIR, OUTPUT_DIR]:
        for file in directory.glob(f"{session_id}*"):
            file.unlink()

    return {"message": "Session cleaned up"}


# ==================== AI Endpoints ====================

@app.post("/ai/config")
async def configure_ai(config: AIConfigRequest):
    """
    Configure AI Assistant
    Set API key, base URL and model
    """
    global ai_assistant
    try:
        from ai_assistant import AIAssistant
        ai_assistant = AIAssistant(
            api_key=config.api_key,
            base_url=config.base_url,
            model=config.model
        )
        return {
            "success": True,
            "message": "AI 配置成功",
            "model": config.model
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 配置失败: {str(e)}")


@app.post("/ai/test")
async def test_ai_connection(config: AIConfigRequest):
    """
    Test AI API connection without saving configuration
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    def sync_test():
        from openai import OpenAI

        # Create temporary client for testing
        client_kwargs = {"api_key": config.api_key, "timeout": 30.0}
        if config.base_url:
            client_kwargs["base_url"] = config.base_url

        client = OpenAI(**client_kwargs)

        # Simple test request
        response = client.chat.completions.create(
            model=config.model,
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=5
        )
        return response

    try:
        # Run sync OpenAI call in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            await loop.run_in_executor(executor, sync_test)

        return {
            "success": True,
            "message": f"连接成功！模型: {config.model}"
        }
    except Exception as e:
        error_msg = str(e)
        print(f"AI test error: {error_msg}")  # Debug log
        if "authentication" in error_msg.lower() or "api key" in error_msg.lower() or "401" in error_msg:
            return {"success": False, "message": "API Key 无效或已过期"}
        elif "model" in error_msg.lower() or "404" in error_msg:
            return {"success": False, "message": f"模型 '{config.model}' 不可用"}
        elif "connection" in error_msg.lower() or "connect" in error_msg.lower() or "timeout" in error_msg.lower():
            return {"success": False, "message": "无法连接到 API 服务器，请检查 Base URL"}
        else:
            return {"success": False, "message": f"连接失败: {error_msg}"}


@app.get("/ai/status")
async def ai_status():
    """
    Check AI Assistant status
    """
    assistant = get_ai_assistant()
    if assistant is None:
        return {
            "available": False,
            "message": "AI not configured. Please set OPENAI_API_KEY environment variable or call /ai/config"
        }
    return {
        "available": True,
        "model": assistant.model,
        "message": "AI Assistant ready"
    }


@app.post("/ai/analyze")
async def ai_analyze_chart(request: AIAnalyzeRequest):
    """
    AI-assisted chart analysis
    Automatically identify axis ranges, curve colors, etc.
    """
    assistant = get_ai_assistant()
    if assistant is None:
        raise HTTPException(
            status_code=503,
            detail="AI not configured. Please set OPENAI_API_KEY or call /ai/config first"
        )

    if request.session_id not in image_paths:
        raise HTTPException(status_code=404, detail="Session not found, please upload image first")

    image_path = image_paths[request.session_id]

    try:
        result = assistant.analyze_chart(image_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@app.post("/ai/suggest-calibration")
async def ai_suggest_calibration(request: AIAnalyzeRequest):
    """
    AI-suggested calibration points
    Returns suggested pixel positions for calibration
    """
    assistant = get_ai_assistant()
    if assistant is None:
        raise HTTPException(
            status_code=503,
            detail="AI not configured"
        )

    if request.session_id not in processors:
        raise HTTPException(status_code=404, detail="Session not found")

    processor = processors[request.session_id]
    image_path = image_paths[request.session_id]

    try:
        result = assistant.suggest_calibration_points(
            image_path,
            processor.width,
            processor.height
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get calibration suggestions: {str(e)}")


@app.post("/ai/recognize-axes")
async def ai_recognize_axes(request: AIAnalyzeRequest):
    """
    AI 识别坐标轴范围（分步识别第一步）

    只识别 X 轴和 Y 轴的范围，返回简单的数值信息，
    支持用户后续修改。
    """
    assistant = get_ai_assistant()
    if assistant is None:
        raise HTTPException(
            status_code=503,
            detail="AI 未配置，请先设置 API Key"
        )

    if request.session_id not in image_paths:
        raise HTTPException(status_code=404, detail="会话不存在，请先上传图片")

    image_path = image_paths[request.session_id]

    try:
        result = assistant.recognize_axes(image_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"坐标轴识别失败: {str(e)}")


@app.post("/ai/recognize-curves")
async def ai_recognize_curves(request: AIAnalyzeRequest):
    """
    AI 识别图表中的曲线颜色（分步识别第二步）

    识别图表中所有可见的数据曲线及其颜色，
    返回可选的曲线列表供用户选择。
    """
    assistant = get_ai_assistant()
    if assistant is None:
        raise HTTPException(
            status_code=503,
            detail="AI 未配置，请先设置 API Key"
        )

    if request.session_id not in image_paths:
        raise HTTPException(status_code=404, detail="会话不存在，请先上传图片")

    image_path = image_paths[request.session_id]

    try:
        result = assistant.recognize_curves(image_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"曲线识别失败: {str(e)}")


@app.post("/ai/identify-color")
async def ai_identify_color(request: AIColorRequest):
    """
    AI-assisted curve color identification
    """
    assistant = get_ai_assistant()
    if assistant is None:
        raise HTTPException(
            status_code=503,
            detail="AI not configured"
        )

    if request.session_id not in image_paths:
        raise HTTPException(status_code=404, detail="Session not found")

    image_path = image_paths[request.session_id]

    try:
        result = assistant.identify_curve_color(
            image_path,
            request.curve_description
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Color identification failed: {str(e)}")


class AIRepairRequest(BaseModel):
    """AI curve repair request model"""
    session_id: str
    extracted_points: List[dict]
    calibration_info: Optional[dict] = None


@app.post("/ai/repair-curve")
async def ai_repair_curve(request: AIRepairRequest):
    """
    AI-assisted curve gap repair

    When extracted curve has discontinuities due to overlapping lines,
    color issues, or other problems, AI can analyze the image and
    suggest interpolated points to fill the gaps.
    """
    assistant = get_ai_assistant()
    if assistant is None:
        raise HTTPException(
            status_code=503,
            detail="AI not configured"
        )

    if request.session_id not in image_paths:
        raise HTTPException(status_code=404, detail="Session not found")

    image_path = image_paths[request.session_id]

    # Build calibration info if not provided
    calibration_info = request.calibration_info or {}
    if not calibration_info and len(request.extracted_points) > 0:
        x_values = [p.get('x', 0) for p in request.extracted_points]
        y_values = [p.get('y', 0) for p in request.extracted_points]
        calibration_info = {
            'x_min': min(x_values),
            'x_max': max(x_values),
            'y_min': min(y_values),
            'y_max': max(y_values)
        }

    try:
        result = assistant.repair_curve_gaps(
            image_path,
            request.extracted_points,
            calibration_info
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Curve repair failed: {str(e)}")


class AICleanRequest(BaseModel):
    """AI 数据清洗请求模型"""
    session_id: str
    extracted_points: List[dict]
    sampled_color: dict  # {"h": int, "s": int, "v": int}
    calibration_info: Optional[dict] = None


class AISmoothRequest(BaseModel):
    """AI 数据平滑请求模型"""
    session_id: str
    extracted_points: List[dict]
    calibration_info: Optional[dict] = None


@app.post("/ai/clean-data")
async def ai_clean_data(request: AICleanRequest):
    """
    AI 辅助数据清洗

    使用 AI 视觉技术分析图像，识别并移除噪声点、网格线干扰、
    其他曲线的误识别等问题，返回清洗后的数据。
    """
    assistant = get_ai_assistant()
    if assistant is None:
        raise HTTPException(
            status_code=503,
            detail="AI 未配置，请先设置 API Key"
        )

    if request.session_id not in image_paths:
        raise HTTPException(status_code=404, detail="会话不存在，请先上传图片")

    image_path = image_paths[request.session_id]

    # 验证图像文件存在
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail=f"图像文件不存在: {image_path}")

    # 验证数据点
    if not request.extracted_points or len(request.extracted_points) == 0:
        return {
            "success": False,
            "data": None,
            "message": "没有数据点需要清洗"
        }

    # 构建校准信息
    calibration_info = request.calibration_info or {}
    if not calibration_info and len(request.extracted_points) > 0:
        x_values = [p.get('x', 0) for p in request.extracted_points]
        y_values = [p.get('y', 0) for p in request.extracted_points]
        calibration_info = {
            'x_min': min(x_values),
            'x_max': max(x_values),
            'y_min': min(y_values),
            'y_max': max(y_values)
        }

    try:
        print(f"[AI Clean] 开始清洗数据，共 {len(request.extracted_points)} 个点")
        print(f"[AI Clean] 图像路径: {image_path}")
        print(f"[AI Clean] 采样颜色: {request.sampled_color}")
        print(f"[AI Clean] 校准信息: {calibration_info}")

        result = assistant.clean_extracted_data(
            image_path,
            request.extracted_points,
            request.sampled_color,
            calibration_info
        )

        print(f"[AI Clean] 清洗结果: success={result.get('success')}, message={result.get('message')}")

        return result
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"[AI Clean] 错误详情:\n{error_detail}")
        raise HTTPException(status_code=500, detail=f"数据清洗失败: {str(e)}")


@app.post("/ai/smooth-data")
async def ai_smooth_data(request: AISmoothRequest):
    """
    AI 辅助数据平滑

    使用 AI 视觉技术分析图像中的曲线走势，对提取的数据点进行平滑处理，
    修正手动绘制的误差，去除抖动和噪声，使曲线更加平滑自然。
    """
    assistant = get_ai_assistant()
    if assistant is None:
        raise HTTPException(
            status_code=503,
            detail="AI 未配置，请先设置 API Key"
        )

    if request.session_id not in image_paths:
        raise HTTPException(status_code=404, detail="会话不存在，请先上传图片")

    image_path = image_paths[request.session_id]

    # 验证图像文件存在
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail=f"图像文件不存在: {image_path}")

    # 验证数据点
    if not request.extracted_points or len(request.extracted_points) == 0:
        return {
            "success": False,
            "data": None,
            "message": "没有数据点需要平滑"
        }

    # 构建校准信息
    calibration_info = request.calibration_info or {}
    if not calibration_info and len(request.extracted_points) > 0:
        x_values = [p.get('x', 0) for p in request.extracted_points]
        y_values = [p.get('y', 0) for p in request.extracted_points]
        calibration_info = {
            'x_min': min(x_values),
            'x_max': max(x_values),
            'y_min': min(y_values),
            'y_max': max(y_values)
        }

    try:
        print(f"[AI Smooth] 开始平滑数据，共 {len(request.extracted_points)} 个点")
        print(f"[AI Smooth] 图像路径: {image_path}")
        print(f"[AI Smooth] 校准信息: {calibration_info}")

        result = assistant.smooth_curve_data(
            image_path,
            request.extracted_points,
            calibration_info
        )

        print(f"[AI Smooth] 平滑结果: success={result.get('success')}, message={result.get('message')}")

        return result
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"[AI Smooth] 错误详情:\n{error_detail}")
        raise HTTPException(status_code=500, detail=f"数据平滑失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
