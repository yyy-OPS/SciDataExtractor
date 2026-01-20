"""
SciDataExtractor Backend Service
FastAPI RESTful API with AI-assisted chart recognition
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Union
import os
import uuid
import shutil
import numpy as np
from pathlib import Path
from dotenv import load_dotenv

from image_processor import ImageProcessor

# 导入 AI 分割模块
try:
    from ai_segmentation import SmartSegmenter, get_segmenter
    SAM_AVAILABLE = True
    print("[Main] SAM 模块加载成功")
except ImportError as e:
    SAM_AVAILABLE = False
    print(f"[Main] SAM 模块未加载: {e}")

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

# Mount static files for outputs
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")

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


# ==================== 图层分割相关数据模型 ====================

class AutoLayersRequest(BaseModel):
    """自动分层请求模型"""
    session_id: str
    k: int = 5  # 聚类数量
    exclude_background: bool = True
    min_saturation: int = 30

    mask2_base64: Optional[str] = None
    operation: str = "clean"  # 'clean', 'dilate', 'erode', 'fill_gaps', 'union', 'intersect', 'subtract'
    kernel_size: int = 3


class CompositePreviewRequest(BaseModel):
    """合成预览请求模型"""
    session_id: str
    layers: List[dict]  # [{"mask": base64, "color_rgb": [r,g,b], "opacity": float, "visible": bool}, ...]
    selected_layer: Optional[str] = None


class DetectCurvesRequest(BaseModel):
    """曲线检测请求模型"""
    session_id: str
    k: int = 5  # 聚类数量
    min_saturation: int = 30
    min_contour_length: int = 50


class CurveOverlayRequest(BaseModel):
    """曲线叠加预览请求模型"""
    session_id: str
    curves: List[dict]  # 曲线列表
    selected_curve_id: Optional[str] = None
    show_skeleton: bool = True
    show_contour: bool = False
    line_width: int = 2


class UpdateCurveRequest(BaseModel):
    """更新曲线请求模型"""
    session_id: str
    curve_id: str
    edited_points: List[List[int]]  # [[x1,y1], [x2,y2], ...]
    original_mask_base64: str


class ExtractFromCurveRequest(BaseModel):
    """从曲线提取数据请求模型"""
    session_id: str
    skeleton_points: List[List[int]]
    calibration: CalibrationData
    downsample_factor: int = 1
    smoothness: int = 0  # 平滑度参数 (0-10)


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


# ==================== 图层分割 API Endpoints ====================

@app.post("/process/auto-layers")
async def auto_detect_layers(request: AutoLayersRequest):
    """
    自动分层 - 使用 K-Means 算法识别图中主要颜色

    接收图片，调用 K-Means，返回分层结果（多个 Base64 Mask 图片）
    """
    if request.session_id not in processors:
        raise HTTPException(status_code=404, detail="会话不存在，请先上传图片")

    processor = processors[request.session_id]

    try:
        layers = processor.detect_dominant_colors(
            k=request.k,
            exclude_background=request.exclude_background,
            min_saturation=request.min_saturation
        )

        return {
            "success": True,
            "layers": layers,
            "count": len(layers),
            "message": f"成功识别 {len(layers)} 个颜色图层"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"自动分层失败: {str(e)}")


@app.get("/process/sam-status")
async def get_sam_status():
    """
    检查 SAM 模型状态
    """
    if SAM_AVAILABLE:
        segmenter = get_segmenter()
        is_ready = segmenter.is_available()
        model_info = segmenter.get_model_info()
        return {
            "available": is_ready,
            "model_info": model_info,
            "message": "SAM 模型已就绪" if is_ready else "SAM 模型加载失败"
        }
    else:
        return {
            "available": False,
            "model_info": {
                "model_type": "none",
                "device": "none",
                "available": False,
                "is_sam2": False
            },
            "message": "SAM 模块未安装"
        }


# ==================== 曲线轮廓检测 API ====================

@app.post("/process/detect-curves")
async def detect_curves(request: DetectCurvesRequest):
    """
    检测图像中的曲线并提取轮廓线

    自动识别图中所有颜色曲线，返回：
    - 每条曲线的轮廓点坐标（用于前端绘制）
    - 每条曲线的骨架点坐标（用于数据提取）
    - 带轮廓高亮的预览图
    """
    if request.session_id not in processors:
        raise HTTPException(status_code=404, detail="会话不存在，请先上传图片")

    processor = processors[request.session_id]

    try:
        result = processor.detect_curves_with_contours(
            k=request.k,
            min_saturation=request.min_saturation,
            min_contour_length=request.min_contour_length
        )

        return {
            "success": True,
            "curves": result["curves"],
            "preview_image": result["preview_image"],
            "original_with_overlay": result["original_with_overlay"],
            "count": result["count"],
            "message": f"成功检测到 {result['count']} 条曲线"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"曲线检测失败: {str(e)}")


@app.post("/process/curve-overlay")
async def generate_curve_overlay(request: CurveOverlayRequest):
    """
    生成带有曲线轮廓高亮的叠加图像

    根据用户选择的曲线和显示选项，生成预览图
    """
    if request.session_id not in processors:
        raise HTTPException(status_code=404, detail="会话不存在，请先上传图片")

    processor = processors[request.session_id]

    try:
        overlay_image = processor.generate_curve_overlay(
            curves=request.curves,
            selected_curve_id=request.selected_curve_id,
            show_skeleton=request.show_skeleton,
            show_contour=request.show_contour,
            line_width=request.line_width
        )

        return {
            "success": True,
            "overlay_image": overlay_image,
            "message": "叠加图像生成成功"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成叠加图像失败: {str(e)}")


@app.post("/process/update-curve")
async def update_curve(request: UpdateCurveRequest):
    """
    根据用户编辑的点更新曲线

    用户在前端编辑轮廓线后，更新曲线的掩码和骨架点
    """
    if request.session_id not in processors:
        raise HTTPException(status_code=404, detail="会话不存在，请先上传图片")

    processor = processors[request.session_id]

    try:
        updated_curve = processor.update_curve_from_edited_points(
            curve_id=request.curve_id,
            edited_points=request.edited_points,
            original_mask_base64=request.original_mask_base64
        )

        return {
            "success": True,
            "curve": updated_curve,
            "message": "曲线更新成功"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新曲线失败: {str(e)}")


@app.post("/extract/curve-points")
async def extract_from_curve_points(request: ExtractFromCurveRequest):
    """
    从曲线骨架点提取物理坐标数据

    根据用户编辑后的曲线骨架点，结合校准参数，提取物理坐标数据
    """
    if request.session_id not in processors:
        raise HTTPException(status_code=404, detail="会话不存在，请先上传图片")

    processor = processors[request.session_id]

    try:
        # 设置校准参数
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

        # 从骨架点提取数据
        data_points = processor.extract_data_from_curve_points(
            skeleton_points=request.skeleton_points,
            downsample_factor=request.downsample_factor,
            smoothness=request.smoothness
        )

        if len(data_points) == 0:
            return {
                "success": False,
                "data": [],
                "count": 0,
                "message": "未能从曲线中提取到数据点"
            }

        result = [{"x": float(x), "y": float(y)} for x, y in data_points]

        return {
            "success": True,
            "data": result,
            "count": len(result),
            "message": f"成功提取 {len(result)} 个数据点"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据提取失败: {str(e)}")


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


# ==================== Origin 绘图 API Endpoints ====================

class OriginPlotRequest(BaseModel):
    """Origin绘图请求模型"""
    # 数据
    x_data: List[float]
    y_data: Union[List[float], List[List[float]]]
    x_name: str = "X"
    y_names: Union[str, List[str]] = "Y"

    # 图表配置
    graph_type: str = "line"  # line, scatter, column, surface, contour, etc.
    title: str = ""
    width: int = 800
    height: int = 600
    export_format: str = "png"
    export_dpi: int = 300

    # 轴配置
    x_title: str = ""
    y_title: str = ""
    x_min: Optional[float] = None
    x_max: Optional[float] = None
    y_min: Optional[float] = None
    y_max: Optional[float] = None

    # 样式配置
    color: str = "#1f77b4"
    show_grid: bool = True
    show_legend: bool = True
    background_color: int = 0

    # 模板
    template: str = ""


class OriginXYZPlotRequest(BaseModel):
    """Origin XYZ绘图请求模型"""
    x_data: List[float]
    y_data: List[float]
    z_data: List[float]
    title: str = ""
    graph_type: str = "surface_colormap"
    width: int = 800
    height: int = 600
    export_format: str = "png"
    colormap: str = "Maple.pal"


class OriginBatchPlotRequest(BaseModel):
    """Origin批量绘图请求"""
    datasets: List[dict]  # 每个包含 x_data, y_data
    graph_type: str = "line"
    template: str = "PAN2VERT"
    export_format: str = "png"


class OriginLabTalkRequest(BaseModel):
    """LabTalk脚本执行请求"""
    command: str


@app.get("/origin/status")
async def get_origin_status():
    """
    检查Origin连接状态
    """
    try:
        from origin_plotter import check_origin_status
        status = check_origin_status()
        return status
    except ImportError:
        return {
            "available": False,
            "message": "originpro包未安装。请运行: pip install originpro",
            "can_connect": False
        }
    except Exception as e:
        return {
            "available": False,
            "message": f"检查Origin状态时出错: {str(e)}",
            "can_connect": False
        }


@app.post("/origin/plot")
async def origin_plot(request: OriginPlotRequest):
    """
    使用Origin绘制图表

    支持: 折线图、散点图、柱状图、双轴图等
    """
    try:
        from origin_plotter import OriginPlotter, GraphType, ExportFormat, AxisConfig, GraphConfig

        # 处理y_names
        if isinstance(request.y_data[0], list):
            y_names = request.y_names if isinstance(request.y_names, list) else [f"Y{i+1}" for i in range(len(request.y_data))]
        else:
            y_names = request.y_names if isinstance(request.y_names, str) else "Y"

        # 构建数据列
        from origin_plotter import WorksheetData, DataColumn, PlotRequest

        columns = [DataColumn(request.x_name, request.x_data, axis="X")]

        if isinstance(request.y_data[0], list):
            for i, y_series in enumerate(request.y_data):
                name = y_names[i] if isinstance(y_names, list) and i < len(y_names) else f"Y{i+1}"
                columns.append(DataColumn(name, y_series))
        else:
            columns.append(DataColumn(y_names if isinstance(y_names, str) else y_names[0], request.y_data))

        data = WorksheetData(name="PlotData", columns=columns)

        # 构建配置
        graph_config = GraphConfig(
            name=request.title or "OriginPlot",
            title=request.title,
            width=request.width,
            height=request.height,
            x_axis=AxisConfig(
                title=request.x_title or request.x_name,
                min_value=request.x_min,
                max_value=request.x_max,
                show_grid=request.show_grid
            ),
            y_axis=AxisConfig(
                title=request.y_title or (y_names if isinstance(y_names, str) else ""),
                min_value=request.y_min,
                max_value=request.y_max,
                show_grid=request.show_grid
            ),
            legend_show=request.show_legend,
            background_color=request.background_color
        )

        # 获取图表类型
        graph_type_map = {
            "line": GraphType.LINE,
            "scatter": GraphType.SCATTER,
            "line_symbol": GraphType.LINE_SYMBOL,
            "column": GraphType.COLUMN,
            "bar": GraphType.BAR,
            "area": GraphType.AREA,
            "stacked_column": GraphType.STACKED_COLUMN,
            "double_y": GraphType.DOUBLE_Y,
            "double_x": GraphType.DOUBLE_X,
        }
        graph_type = graph_type_map.get(request.graph_type, GraphType.LINE)

        # 获取导出格式
        export_format_map = {
            "png": ExportFormat.PNG,
            "jpg": ExportFormat.JPG,
            "pdf": ExportFormat.PDF,
            "svg": ExportFormat.SVG,
            "eps": ExportFormat.EPS,
            "emf": ExportFormat.EMF,
            "tiff": ExportFormat.TIFF,
        }
        export_format = export_format_map.get(request.export_format.lower(), ExportFormat.PNG)

        plot_request = PlotRequest(
            data=data,
            graph_type=graph_type,
            template=request.template,
            config=graph_config,
            export_format=export_format
        )

        # 执行绘图
        with OriginPlotter(show_origin=False) as plotter:
            result = plotter.plot(plot_request)

        return result

    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Origin绘图模块不可用: {str(e)}")
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"[Origin Plot] 错误详情:\n{error_detail}")
        raise HTTPException(status_code=500, detail=f"Origin绘图失败: {str(e)}")


@app.post("/origin/plot-xyz")
async def origin_plot_xyz(request: OriginXYZPlotRequest):
    """
    使用Origin绘制3D/XYZ图表

    支持: 3D曲面图、等高线图、热图等
    """
    try:
        from origin_plotter import OriginPlotter, GraphType, GraphConfig, WorksheetData, DataColumn, PlotRequest

        columns = [
            DataColumn("X", request.x_data, axis="X"),
            DataColumn("Y", request.y_data, axis="Y"),
            DataColumn("Z", request.z_data, axis="Z")
        ]
        data = WorksheetData(name="XYZData", columns=columns)

        graph_type_map = {
            "surface": GraphType.SURFACE,
            "surface_colormap": GraphType.SURFACE_COLORMAP,
            "contour": GraphType.CONTOUR,
            "xyz_contour": GraphType.XYZ_CONTOUR,
            "tri_contour": GraphType.TRI_CONTOUR,
            "heatmap": GraphType.HEATMAP,
        }
        graph_type = graph_type_map.get(request.graph_type, GraphType.SURFACE_COLORMAP)

        graph_config = GraphConfig(
            name=request.title or "XYZPlot",
            title=request.title,
            width=request.width,
            height=request.height
        )

        plot_request = PlotRequest(
            data=data,
            graph_type=graph_type,
            config=graph_config
        )

        with OriginPlotter(show_origin=False) as plotter:
            result = plotter.plot(plot_request)
            # 应用颜色映射
            if result["success"] and request.colormap:
                plotter.execute_labtalk(f'{result.get("graph_name", "GraphLayer")} -cmap {request.colormap}')

        return result

    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Origin绘图模块不可用: {str(e)}")
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"[Origin XYZ Plot] 错误详情:\n{error_detail}")
        raise HTTPException(status_code=500, detail=f"Origin XYZ绘图失败: {str(e)}")


@app.post("/origin/plot-multi")
async def origin_plot_multi(request: OriginBatchPlotRequest):
    """
    使用Origin绘制多层图表

    将多个数据集绘制在不同的面板中
    """
    try:
        from origin_plotter import OriginPlotter, WorksheetData, DataColumn

        datasets = []
        for i, ds in enumerate(request.datasets):
            columns = [
                DataColumn("X", ds.get('x_data', []), axis="X"),
                DataColumn("Y", ds.get('y_data', []), axis="Y")
            ]
            datasets.append(WorksheetData(name=f"Data{i+1}", columns=columns))

        with OriginPlotter(show_origin=False) as plotter:
            result = plotter.plot_multi_layer(
                datasets=[{"x": ds.get('x_data', []), "y": ds.get('y_data', [])} for ds in request.datasets],
                template=request.template
            )

        return result

    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Origin绘图模块不可用: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Origin多层绘图失败: {str(e)}")


@app.post("/origin/execute-labtalk")
async def execute_labtalk(request: OriginLabTalkRequest):
    """
    执行LabTalk脚本命令

    LabTalk是Origin的脚本语言，可用于高级操作
    """
    try:
        from origin_plotter import OriginPlotter

        with OriginPlotter(show_origin=False) as plotter:
            success = plotter.execute_labtalk(request.command)

        return {
            "success": success,
            "message": "LabTalk命令执行成功" if success else "LabTalk命令执行失败"
        }

    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Origin绘图模块不可用: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LabTalk命令执行失败: {str(e)}")


@app.post("/origin/plot-from-extracted")
async def origin_plot_from_extracted(request: dict):
    """
    使用从图表中提取的数据在Origin中重新绘图

    这个端点将数据提取功能和Origin绘图功能连接起来
    """
    try:
        from origin_plotter import OriginPlotter, GraphType, ExportFormat, GraphConfig, AxisConfig, WorksheetData, DataColumn, PlotRequest

        data_points = request.get("data", [])
        config = request.get("config", {})

        if not data_points:
            raise HTTPException(status_code=400, detail="没有数据可绘制")

        # 分离X和Y数据
        x_data = [p["x"] for p in data_points]
        y_data = [p["y"] for p in data_points]

        columns = [
            DataColumn("X", x_data, axis="X"),
            DataColumn("Y", y_data, axis="Y")
        ]
        ws_data = WorksheetData(name="ExtractedData", columns=columns)

        graph_type = config.get("graph_type", "line")
        graph_type_map = {
            "line": GraphType.LINE,
            "scatter": GraphType.SCATTER,
            "line_symbol": GraphType.LINE_SYMBOL,
        }
        graph_type_enum = graph_type_map.get(graph_type, GraphType.LINE)

        graph_config = GraphConfig(
            name=config.get("name", "ExtractedDataPlot"),
            title=config.get("title", "从图表提取的数据"),
            width=config.get("width", 800),
            height=config.get("height", 600),
            x_axis=AxisConfig(title=config.get("x_title", "X")),
            y_axis=AxisConfig(title=config.get("y_title", "Y"))
        )

        export_format_map = {
            "png": ExportFormat.PNG,
            "pdf": ExportFormat.PDF,
            "svg": ExportFormat.SVG,
        }
        export_format = export_format_map.get(config.get("export_format", "png"), ExportFormat.PNG)

        plot_request = PlotRequest(
            data=ws_data,
            graph_type=graph_type_enum,
            config=graph_config,
            export_format=export_format
        )

        with OriginPlotter(show_origin=config.get("show_origin", False)) as plotter:
            result = plotter.plot(plot_request)

        return result

    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Origin绘图模块不可用: {str(e)}")
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"[Origin Plot From Extracted] 错误详情:\n{error_detail}")
        raise HTTPException(status_code=500, detail=f"Origin绘图失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
