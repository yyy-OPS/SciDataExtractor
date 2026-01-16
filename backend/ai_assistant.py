"""
AI Assistant Module - AI Assisted Chart Recognition
Uses OpenAI compatible API format for chart analysis
"""

import base64
import json
import os
import re
from typing import Optional, Dict, Any, List
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def safe_parse_json(text: str) -> Dict[str, Any]:
    """
    安全解析 JSON，增强容错性

    Parameters:
        text: 可能包含 JSON 的文本

    Returns:
        解析后的字典，解析失败返回空字典
    """
    if not text:
        return {}

    # 尝试提取 JSON 块
    json_text = text.strip()

    # 处理 markdown 代码块
    if "```json" in json_text:
        match = re.search(r'```json\s*([\s\S]*?)\s*```', json_text)
        if match:
            json_text = match.group(1)
    elif "```" in json_text:
        match = re.search(r'```\s*([\s\S]*?)\s*```', json_text)
        if match:
            json_text = match.group(1)

    # 尝试找到 JSON 对象
    json_text = json_text.strip()
    if not json_text.startswith('{'):
        match = re.search(r'\{[\s\S]*\}', json_text)
        if match:
            json_text = match.group(0)

    # 清理常见问题
    # 移除注释
    json_text = re.sub(r'//.*?$', '', json_text, flags=re.MULTILINE)
    # 移除尾随逗号
    json_text = re.sub(r',\s*([}\]])', r'\1', json_text)
    # 修复未加引号的键
    json_text = re.sub(r'(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', json_text)

    try:
        return json.loads(json_text)
    except json.JSONDecodeError:
        # 尝试更宽松的解析
        try:
            # 替换单引号为双引号
            json_text = json_text.replace("'", '"')
            return json.loads(json_text)
        except:
            return {}


class AIAssistant:
    """
    AI Assistant Class
    Uses OpenAI compatible API for chart image analysis
    Supports any API service compatible with OpenAI format (OpenAI, Azure, local models, etc.)
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: str = "gpt-4o"
    ):
        """
        Initialize AI Assistant

        Parameters:
            api_key: API key, defaults to reading from environment variable OPENAI_API_KEY
            base_url: API base URL, defaults to reading from environment variable OPENAI_BASE_URL
            model: Model name, defaults to gpt-4o
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url or os.getenv("OPENAI_BASE_URL")
        self.model = model or os.getenv("OPENAI_MODEL", "gpt-4o")

        if not self.api_key:
            raise ValueError("API key not set. Please set OPENAI_API_KEY environment variable or pass api_key parameter")

        # Create OpenAI client
        client_kwargs = {"api_key": self.api_key}
        if self.base_url:
            client_kwargs["base_url"] = self.base_url

        self.client = OpenAI(**client_kwargs)

    def encode_image_to_base64(self, image_path: str) -> str:
        """
        Encode image file to Base64 string

        Parameters:
            image_path: Image file path

        Returns:
            Base64 encoded string
        """
        with open(image_path, "rb") as image_file:
            return base64.standard_b64encode(image_file.read()).decode("utf-8")

    def analyze_chart(self, image_path: str) -> Dict[str, Any]:
        """
        Analyze chart image, automatically identify axis ranges and curve colors

        Parameters:
            image_path: Chart image path

        Returns:
            Analysis result dictionary containing:
            - x_axis: X-axis information (label, min, max, unit)
            - y_axis: Y-axis information (label, min, max, unit)
            - curves: Curve list (color description, suggested HSV range)
            - chart_type: Chart type
            - suggestions: Usage suggestions
        """
        # Encode image to Base64
        base64_image = self.encode_image_to_base64(image_path)

        # Determine image type
        if image_path.lower().endswith(".png"):
            image_type = "image/png"
        else:
            image_type = "image/jpeg"

        # Build prompt
        prompt = """Please analyze this scientific chart image and extract the following information. Return the result in JSON format:

{
    "chart_type": "Chart type (e.g., stress-strain curve, force-displacement curve, etc.)",
    "x_axis": {
        "label": "X-axis label",
        "min_value": Minimum value (number),
        "max_value": Maximum value (number),
        "unit": "Unit (if any)"
    },
    "y_axis": {
        "label": "Y-axis label",
        "min_value": Minimum value (number),
        "max_value": Maximum value (number),
        "unit": "Unit (if any)"
    },
    "curves": [
        {
            "description": "Curve description (e.g., 'main data curve')",
            "color_name": "Color name (e.g., blue, red, black)",
            "suggested_hsv": {
                "h": Hue value (0-179),
                "s": Saturation value (0-255),
                "v": Brightness value (0-255)
            },
            "suggested_tolerance": Suggested color tolerance (10-40)
        }
    ],
    "calibration_suggestions": {
        "x_start_position": "Suggested X-axis start point position description",
        "x_end_position": "Suggested X-axis end point position description",
        "y_start_position": "Suggested Y-axis start point position description",
        "y_end_position": "Suggested Y-axis end point position description"
    },
    "notes": "Other notes or suggestions"
}

Please note:
1. Carefully observe the axis scale labels to determine the value range
2. Identify all visible data curves and their colors
3. HSV values are OpenCV format: H(0-179), S(0-255), V(0-255)
4. If certain information cannot be determined, use null
5. Return only JSON, no other text"""

        try:
            # Call API
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{image_type};base64,{base64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=2000,
                temperature=0.1  # Use lower temperature for more stable output
            )

            # Parse response
            result_text = response.choices[0].message.content

            # Try to extract JSON
            # Handle case where response might be wrapped in markdown code blocks
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            result = json.loads(result_text.strip())

            return {
                "success": True,
                "data": result,
                "message": "Chart analysis successful"
            }

        except json.JSONDecodeError as e:
            return {
                "success": False,
                "data": None,
                "message": f"Failed to parse AI response: {str(e)}",
                "raw_response": result_text if 'result_text' in locals() else None
            }
        except Exception as e:
            return {
                "success": False,
                "data": None,
                "message": f"AI analysis failed: {str(e)}"
            }

    def recognize_axes(self, image_path: str) -> Dict[str, Any]:
        """
        AI 识别坐标轴范围（分步识别第一步）

        只识别 X 轴和 Y 轴的范围，返回简单的数值信息，
        支持用户后续修改。

        Parameters:
            image_path: 图像路径

        Returns:
            坐标轴识别结果
        """
        base64_image = self.encode_image_to_base64(image_path)

        if image_path.lower().endswith(".png"):
            image_type = "image/png"
        else:
            image_type = "image/jpeg"

        prompt = """请分析这张科学图表图像，识别坐标轴的范围。

请仔细观察图表的坐标轴刻度标签，返回以下信息（JSON格式）：

{
    "x_axis": {
        "label": "X轴标签（如果有）",
        "min": X轴最小值（数字）,
        "max": X轴最大值（数字）,
        "unit": "单位（如果有）"
    },
    "y_axis": {
        "label": "Y轴标签（如果有）",
        "min": Y轴最小值（数字）,
        "max": Y轴最大值（数字）,
        "unit": "单位（如果有）"
    },
    "chart_type": "图表类型描述",
    "confidence": "high/medium/low"
}

注意：
1. 仔细观察刻度数字，确保数值准确
2. 如果无法确定某个值，使用 null
3. 只返回 JSON，不要其他文字"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{image_type};base64,{base64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=1000,
                temperature=0.1
            )

            result_text = response.choices[0].message.content
            result = safe_parse_json(result_text)

            if not result:
                return {
                    "success": False,
                    "data": None,
                    "message": "无法解析 AI 响应",
                    "raw_response": result_text
                }

            return {
                "success": True,
                "data": result,
                "message": "坐标轴识别成功"
            }

        except Exception as e:
            return {
                "success": False,
                "data": None,
                "message": f"坐标轴识别失败: {str(e)}"
            }

    def recognize_curves(self, image_path: str) -> Dict[str, Any]:
        """
        AI 识别图表中的曲线颜色（分步识别第二步）

        识别图表中所有可见的数据曲线及其颜色，
        返回可选的曲线列表供用户选择。

        Parameters:
            image_path: 图像路径

        Returns:
            曲线颜色识别结果
        """
        base64_image = self.encode_image_to_base64(image_path)

        if image_path.lower().endswith(".png"):
            image_type = "image/png"
        else:
            image_type = "image/jpeg"

        prompt = """请分析这张科学图表图像，识别所有可见的数据曲线。

请仔细观察图表中的曲线，返回以下信息（JSON格式）：

{
    "curves": [
        {
            "id": 1,
            "name": "曲线名称或描述",
            "color_name": "颜色名称（如：红色、蓝色、黑色等）",
            "color_rgb": {
                "r": 红色分量(0-255),
                "g": 绿色分量(0-255),
                "b": 蓝色分量(0-255)
            },
            "color_hsv": {
                "h": 色相(0-179，OpenCV格式),
                "s": 饱和度(0-255),
                "v": 明度(0-255)
            },
            "line_style": "实线/虚线/点线",
            "description": "曲线的简要描述"
        }
    ],
    "background_color": "背景颜色描述",
    "grid_color": "网格线颜色（如果有）",
    "total_curves": 曲线总数,
    "notes": "其他备注"
}

注意：
1. 识别所有可见的数据曲线，包括不同颜色的曲线
2. HSV 使用 OpenCV 格式：H(0-179), S(0-255), V(0-255)
3. 如果有图例，参考图例中的颜色信息
4. 只返回 JSON，不要其他文字"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{image_type};base64,{base64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=2000,
                temperature=0.1
            )

            result_text = response.choices[0].message.content
            result = safe_parse_json(result_text)

            if not result:
                return {
                    "success": False,
                    "data": None,
                    "message": "无法解析 AI 响应",
                    "raw_response": result_text
                }

            return {
                "success": True,
                "data": result,
                "message": f"识别到 {len(result.get('curves', []))} 条曲线"
            }

        except Exception as e:
            return {
                "success": False,
                "data": None,
                "message": f"曲线识别失败: {str(e)}"
            }

    def suggest_calibration_points(
        self,
        image_path: str,
        image_width: int,
        image_height: int
    ) -> Dict[str, Any]:
        """
        Suggest calibration point pixel positions based on image

        Parameters:
            image_path: Image path
            image_width: Image width (pixels)
            image_height: Image height (pixels)

        Returns:
            Suggested calibration point positions
        """
        base64_image = self.encode_image_to_base64(image_path)

        if image_path.lower().endswith(".png"):
            image_type = "image/png"
        else:
            image_type = "image/jpeg"

        prompt = f"""Please analyze this scientific chart image and suggest calibration point positions.

Image dimensions: {image_width} x {image_height} pixels

Please return the suggested calibration point pixel coordinates in JSON format:

{{
    "x_axis_start": {{
        "pixel_x": X-axis start point X coordinate (number),
        "pixel_y": X-axis start point Y coordinate (number),
        "suggested_value": Suggested physical value at this point
    }},
    "x_axis_end": {{
        "pixel_x": X-axis end point X coordinate (number),
        "pixel_y": X-axis end point Y coordinate (number),
        "suggested_value": Suggested physical value at this point
    }},
    "y_axis_start": {{
        "pixel_x": Y-axis start point X coordinate (number),
        "pixel_y": Y-axis start point Y coordinate (number),
        "suggested_value": Suggested physical value at this point
    }},
    "y_axis_end": {{
        "pixel_x": Y-axis end point X coordinate (number),
        "pixel_y": Y-axis end point Y coordinate (number),
        "suggested_value": Suggested physical value at this point
    }},
    "confidence": "Confidence level (high/medium/low)",
    "notes": "Notes"
}}

Please note:
1. Pixel coordinates start from top-left corner (0,0)
2. X increases to the right, Y increases downward
3. Try to select positions with clear scale marks
4. Return only JSON, no other text"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{image_type};base64,{base64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=1000,
                temperature=0.1
            )

            result_text = response.choices[0].message.content

            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            result = json.loads(result_text.strip())

            return {
                "success": True,
                "data": result,
                "message": "Calibration point suggestion successful"
            }

        except Exception as e:
            return {
                "success": False,
                "data": None,
                "message": f"Failed to get calibration suggestions: {str(e)}"
            }

    def identify_curve_color(
        self,
        image_path: str,
        curve_description: str = "main data curve"
    ) -> Dict[str, Any]:
        """
        Identify specific curve color

        Parameters:
            image_path: Image path
            curve_description: Curve description

        Returns:
            Curve color information
        """
        base64_image = self.encode_image_to_base64(image_path)

        if image_path.lower().endswith(".png"):
            image_type = "image/png"
        else:
            image_type = "image/jpeg"

        prompt = f"""Please analyze this scientific chart image and identify the color of "{curve_description}".

Return the result in JSON format:

{{
    "color_name": "Color name (e.g., blue, red)",
    "rgb": {{
        "r": Red value (0-255),
        "g": Green value (0-255),
        "b": Blue value (0-255)
    }},
    "hsv_opencv": {{
        "h": Hue (0-179, OpenCV format),
        "s": Saturation (0-255),
        "v": Brightness (0-255)
    }},
    "suggested_tolerance": Suggested color tolerance (10-40),
    "confidence": "Confidence level (high/medium/low)"
}}

Return only JSON, no other text."""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{image_type};base64,{base64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=500,
                temperature=0.1
            )

            result_text = response.choices[0].message.content

            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            result = json.loads(result_text.strip())

            return {
                "success": True,
                "data": result,
                "message": "Color identification successful"
            }

        except Exception as e:
            return {
                "success": False,
                "data": None,
                "message": f"Color identification failed: {str(e)}"
            }

    def repair_curve_gaps(
        self,
        image_path: str,
        extracted_points: List[Dict[str, float]],
        calibration_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Use AI to repair gaps in extracted curve data

        When curves have discontinuities due to overlapping lines or color issues,
        AI can analyze the image and suggest interpolated points to fill gaps.

        Parameters:
            image_path: Image path
            extracted_points: List of extracted data points [{"x": float, "y": float}, ...]
            calibration_info: Calibration information for coordinate conversion

        Returns:
            Repaired data points with gap-filling suggestions
        """
        base64_image = self.encode_image_to_base64(image_path)

        if image_path.lower().endswith(".png"):
            image_type = "image/png"
        else:
            image_type = "image/jpeg"

        # Analyze gaps in the data
        gaps = []
        if len(extracted_points) > 1:
            sorted_points = sorted(extracted_points, key=lambda p: p['x'])
            for i in range(len(sorted_points) - 1):
                x_diff = sorted_points[i + 1]['x'] - sorted_points[i]['x']
                # Calculate average spacing
                avg_spacing = (sorted_points[-1]['x'] - sorted_points[0]['x']) / len(sorted_points)
                # If gap is more than 3x average, it's a significant gap
                if x_diff > avg_spacing * 3:
                    gaps.append({
                        "start_x": sorted_points[i]['x'],
                        "start_y": sorted_points[i]['y'],
                        "end_x": sorted_points[i + 1]['x'],
                        "end_y": sorted_points[i + 1]['y']
                    })

        if not gaps:
            return {
                "success": True,
                "data": {
                    "has_gaps": False,
                    "repaired_points": extracted_points,
                    "added_points": []
                },
                "message": "No significant gaps detected in the curve"
            }

        # Build prompt for AI to analyze gaps
        gaps_description = "\n".join([
            f"Gap {i+1}: from ({g['start_x']:.4f}, {g['start_y']:.4f}) to ({g['end_x']:.4f}, {g['end_y']:.4f})"
            for i, g in enumerate(gaps)
        ])

        prompt = f"""Please analyze this scientific chart image. The curve extraction has detected gaps in the data.

Detected gaps:
{gaps_description}

Calibration info:
- X-axis range: {calibration_info.get('x_min', 0)} to {calibration_info.get('x_max', 1)}
- Y-axis range: {calibration_info.get('y_min', 0)} to {calibration_info.get('y_max', 1)}

Please analyze the image and suggest interpolated points to fill these gaps. Look at the actual curve in the image to determine the correct Y values for the gap regions.

Return the result in JSON format:

{{
    "gap_analysis": [
        {{
            "gap_index": 1,
            "cause": "Reason for the gap (e.g., 'curve overlap', 'color similarity with background', 'grid line interference')",
            "suggested_points": [
                {{"x": X value, "y": Y value}},
                ...
            ],
            "confidence": "high/medium/low"
        }}
    ],
    "interpolation_method": "Method used (e.g., 'visual tracing', 'linear interpolation', 'curve fitting')",
    "notes": "Additional notes about the repair"
}}

Return only JSON, no other text."""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{image_type};base64,{base64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=2000,
                temperature=0.2
            )

            result_text = response.choices[0].message.content

            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            result = json.loads(result_text.strip())

            # Merge original points with suggested points
            all_points = list(extracted_points)
            added_points = []

            for gap_repair in result.get("gap_analysis", []):
                for point in gap_repair.get("suggested_points", []):
                    if "x" in point and "y" in point:
                        all_points.append(point)
                        added_points.append(point)

            # Sort by X
            all_points.sort(key=lambda p: p['x'])

            return {
                "success": True,
                "data": {
                    "has_gaps": True,
                    "original_gaps": gaps,
                    "gap_analysis": result.get("gap_analysis", []),
                    "repaired_points": all_points,
                    "added_points": added_points,
                    "interpolation_method": result.get("interpolation_method", "unknown"),
                    "notes": result.get("notes", "")
                },
                "message": f"Repaired {len(gaps)} gaps, added {len(added_points)} points"
            }

        except Exception as e:
            # If AI repair fails, try simple linear interpolation
            all_points = list(extracted_points)
            added_points = []

            for gap in gaps:
                # Simple linear interpolation
                num_points = max(2, int((gap['end_x'] - gap['start_x']) /
                    ((extracted_points[-1]['x'] - extracted_points[0]['x']) / len(extracted_points))))

                for i in range(1, num_points):
                    t = i / num_points
                    new_point = {
                        "x": gap['start_x'] + t * (gap['end_x'] - gap['start_x']),
                        "y": gap['start_y'] + t * (gap['end_y'] - gap['start_y'])
                    }
                    all_points.append(new_point)
                    added_points.append(new_point)

            all_points.sort(key=lambda p: p['x'])

            return {
                "success": True,
                "data": {
                    "has_gaps": True,
                    "original_gaps": gaps,
                    "repaired_points": all_points,
                    "added_points": added_points,
                    "interpolation_method": "linear_fallback",
                    "notes": f"AI repair failed ({str(e)}), used linear interpolation as fallback"
                },
                "message": f"Used linear interpolation to fill {len(gaps)} gaps"
            }

    def clean_extracted_data(
        self,
        image_path: str,
        extracted_points: List[Dict[str, float]],
        sampled_color: Dict[str, int],
        calibration_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        使用 AI 视觉技术清洗提取的数据点

        AI 会分析原始图像，识别哪些点是真正属于目标曲线的，
        哪些是噪声点、网格线干扰或其他曲线的误识别。

        Parameters:
            image_path: 图像路径
            extracted_points: 提取的数据点列表 [{"x": float, "y": float}, ...]
            sampled_color: 采样的颜色 {"h": int, "s": int, "v": int}
            calibration_info: 校准信息

        Returns:
            清洗后的数据点和分析报告
        """
        base64_image = self.encode_image_to_base64(image_path)

        if image_path.lower().endswith(".png"):
            image_type = "image/png"
        else:
            image_type = "image/jpeg"

        # 对数据点进行采样以减少 token 使用
        sample_size = min(100, len(extracted_points))
        if len(extracted_points) > sample_size:
            step = len(extracted_points) // sample_size
            sampled_points = [extracted_points[i] for i in range(0, len(extracted_points), step)]
        else:
            sampled_points = extracted_points

        # 计算数据统计信息
        x_values = [p['x'] for p in extracted_points]
        y_values = [p['y'] for p in extracted_points]

        data_stats = {
            "total_points": len(extracted_points),
            "x_range": [min(x_values), max(x_values)],
            "y_range": [min(y_values), max(y_values)],
            "sample_points": sampled_points[:20]  # 只发送前20个点作为示例
        }

        prompt = f"""请分析这张科学图表图像，并帮助清洗提取的数据点。

## 当前提取信息
- 目标曲线颜色 (HSV): H={sampled_color.get('h', 0)}, S={sampled_color.get('s', 0)}, V={sampled_color.get('v', 0)}
- 提取的数据点总数: {data_stats['total_points']}
- X 范围: {data_stats['x_range'][0]:.4f} 到 {data_stats['x_range'][1]:.4f}
- Y 范围: {data_stats['y_range'][0]:.4f} 到 {data_stats['y_range'][1]:.4f}

## 校准信息
- X 轴范围: {calibration_info.get('x_min', 0)} 到 {calibration_info.get('x_max', 1)}
- Y 轴范围: {calibration_info.get('y_min', 0)} 到 {calibration_info.get('y_max', 1)}

## 示例数据点
{json.dumps(data_stats['sample_points'], indent=2)}

请仔细观察图像中的目标曲线，分析以下问题：

1. **曲线识别**: 图中是否有多条曲线？目标颜色的曲线是哪一条？
2. **噪声分析**: 提取的数据中可能包含哪些类型的噪声？
   - 网格线干扰
   - 其他颜色曲线的误识别
   - 坐标轴或标签的干扰
   - 图例或文字的干扰
3. **异常点检测**: 根据曲线的实际走势，哪些区域的点可能是异常的？
4. **数据质量**: 整体数据质量如何？需要什么样的清洗策略？

请返回 JSON 格式的分析结果：

{{
    "curve_analysis": {{
        "target_curve_description": "目标曲线的描述",
        "curve_type": "曲线类型（如：单调递增、有峰值、周期性等）",
        "expected_trend": "预期的曲线走势描述"
    }},
    "noise_analysis": {{
        "detected_noise_types": ["噪声类型1", "噪声类型2"],
        "noise_regions": [
            {{
                "x_range": [起始X, 结束X],
                "y_range": [起始Y, 结束Y],
                "description": "该区域噪声描述",
                "action": "remove" 或 "keep"
            }}
        ]
    }},
    "cleaning_rules": [
        {{
            "rule_type": "规则类型（如：remove_outliers, remove_region, smooth_curve）",
            "parameters": {{
                "具体参数": "值"
            }},
            "description": "规则描述"
        }}
    ],
    "outlier_detection": {{
        "method": "建议的异常点检测方法",
        "y_threshold_low": Y值下限（低于此值的点可能是异常）,
        "y_threshold_high": Y值上限（高于此值的点可能是异常）,
        "x_regions_to_check": [
            {{
                "x_start": 起始X,
                "x_end": 结束X,
                "expected_y_range": [预期Y最小值, 预期Y最大值],
                "reason": "需要检查的原因"
            }}
        ]
    }},
    "quality_score": 1-10的数据质量评分,
    "recommendations": ["建议1", "建议2"],
    "notes": "其他备注"
}}

请只返回 JSON，不要包含其他文字。"""

        try:
            print(f"[AI Clean] 调用 AI API，模型: {self.model}")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{image_type};base64,{base64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=3000,
                temperature=0.1
            )

            result_text = response.choices[0].message.content
            print(f"[AI Clean] AI 响应长度: {len(result_text)} 字符")
            print(f"[AI Clean] AI 响应前500字符: {result_text[:500]}")

            analysis_result = safe_parse_json(result_text)

            if not analysis_result:
                print(f"[AI Clean] JSON 解析失败，原始响应:\n{result_text}")
                return {
                    "success": False,
                    "data": None,
                    "message": "无法解析 AI 响应",
                    "raw_response": result_text
                }

            print(f"[AI Clean] JSON 解析成功，包含键: {list(analysis_result.keys())}")

            # 根据 AI 分析结果清洗数据
            cleaned_points = self._apply_cleaning_rules(
                extracted_points,
                analysis_result
            )

            # 生成删除操作列表
            operations = self._generate_clean_operations(
                extracted_points,
                cleaned_points
            )

            removed_count = len(extracted_points) - len(cleaned_points)
            print(f"[AI Clean] 清洗完成: {len(extracted_points)} -> {len(cleaned_points)} (移除 {removed_count} 点)")

            return {
                "success": True,
                "data": {
                    "original_points": extracted_points,
                    "cleaned_points": cleaned_points,
                    "operations": operations,
                    "analysis": analysis_result,
                    "quality_score": analysis_result.get("quality_score", 5),
                    "statistics": {
                        "original_count": len(extracted_points),
                        "cleaned_count": len(cleaned_points),
                        "removed_count": removed_count
                    }
                },
                "message": f"AI 清洗分析完成，建议删除 {removed_count} 个噪声点"
            }

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            print(f"[AI Clean] 异常详情:\n{error_detail}")
            return {
                "success": False,
                "data": None,
                "message": f"AI 数据清洗失败: {str(e)}"
            }

    def _generate_clean_operations(
        self,
        original_points: List[Dict[str, float]],
        cleaned_points: List[Dict[str, float]]
    ) -> Dict[str, Any]:
        """
        生成清洗操作列表（删除点的信息）

        Parameters:
            original_points: 原始数据点
            cleaned_points: 清洗后的数据点

        Returns:
            包含删除操作的字典
        """
        # 创建清洗后点的集合（用于快速查找）
        cleaned_set = {(p['x'], p['y']) for p in cleaned_points}

        deletions = []
        deleted_count = 0

        # 找出被删除的点
        for i, point in enumerate(original_points):
            if (point['x'], point['y']) not in cleaned_set:
                deletions.append({
                    "index": i,
                    "type": "delete",
                    "point": {"x": point['x'], "y": point['y']},
                    "reason": "噪声点"
                })
                deleted_count += 1

        return {
            "deletions": deletions,
            "deleted_count": deleted_count,
            "modified_count": 0,  # 清洗不修改点
            "added_count": 0      # 清洗不增加点
        }

    def _apply_cleaning_rules(
        self,
        points: List[Dict[str, float]],
        analysis: Dict[str, Any]
    ) -> List[Dict[str, float]]:
        """
        根据 AI 分析结果应用清洗规则

        Parameters:
            points: 原始数据点
            analysis: AI 分析结果

        Returns:
            清洗后的数据点
        """
        cleaned = list(points)

        # 1. 应用异常点检测规则
        outlier_detection = analysis.get("outlier_detection", {})
        y_low = outlier_detection.get("y_threshold_low")
        y_high = outlier_detection.get("y_threshold_high")

        if y_low is not None or y_high is not None:
            cleaned = [
                p for p in cleaned
                if (y_low is None or p['y'] >= y_low) and
                   (y_high is None or p['y'] <= y_high)
            ]

        # 2. 应用区域检查规则
        regions_to_check = outlier_detection.get("x_regions_to_check", [])
        for region in regions_to_check:
            x_start = region.get("x_start")
            x_end = region.get("x_end")
            expected_y = region.get("expected_y_range", [None, None])

            if x_start is not None and x_end is not None:
                new_cleaned = []
                for p in cleaned:
                    if x_start <= p['x'] <= x_end:
                        # 在检查区域内，验证 Y 值是否在预期范围
                        if expected_y[0] is not None and expected_y[1] is not None:
                            if expected_y[0] <= p['y'] <= expected_y[1]:
                                new_cleaned.append(p)
                            # 否则跳过这个点
                        else:
                            new_cleaned.append(p)
                    else:
                        new_cleaned.append(p)
                cleaned = new_cleaned

        # 3. 应用噪声区域移除规则
        noise_regions = analysis.get("noise_analysis", {}).get("noise_regions", [])
        for region in noise_regions:
            if region.get("action") == "remove":
                x_range = region.get("x_range", [None, None])
                y_range = region.get("y_range", [None, None])

                if x_range[0] is not None and x_range[1] is not None:
                    cleaned = [
                        p for p in cleaned
                        if not (x_range[0] <= p['x'] <= x_range[1] and
                               (y_range[0] is None or y_range[1] is None or
                                y_range[0] <= p['y'] <= y_range[1]))
                    ]

        # 4. 应用清洗规则
        for rule in analysis.get("cleaning_rules", []):
            rule_type = rule.get("rule_type")
            params = rule.get("parameters", {})

            if rule_type == "remove_outliers":
                # 使用 IQR 方法移除异常点
                if len(cleaned) > 10:
                    y_values = sorted([p['y'] for p in cleaned])
                    q1_idx = len(y_values) // 4
                    q3_idx = 3 * len(y_values) // 4
                    q1 = y_values[q1_idx]
                    q3 = y_values[q3_idx]
                    iqr = q3 - q1
                    multiplier = params.get("iqr_multiplier", 1.5)
                    lower = q1 - multiplier * iqr
                    upper = q3 + multiplier * iqr
                    cleaned = [p for p in cleaned if lower <= p['y'] <= upper]

            elif rule_type == "remove_isolated":
                # 移除孤立点（与邻近点距离过远的点）
                if len(cleaned) > 5:
                    threshold = params.get("distance_threshold", 0.1)
                    sorted_points = sorted(cleaned, key=lambda p: p['x'])
                    non_isolated = []
                    for i, p in enumerate(sorted_points):
                        has_neighbor = False
                        for j in range(max(0, i-2), min(len(sorted_points), i+3)):
                            if i != j:
                                dist = abs(p['y'] - sorted_points[j]['y'])
                                if dist < threshold:
                                    has_neighbor = True
                                    break
                        if has_neighbor:
                            non_isolated.append(p)
                    if len(non_isolated) > len(cleaned) * 0.5:  # 确保不会移除太多点
                        cleaned = non_isolated

        # 按 X 排序
        cleaned.sort(key=lambda p: p['x'])

        return cleaned

    def smooth_curve_data(
        self,
        image_path: str,
        extracted_points: List[Dict[str, float]],
        calibration_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        使用 AI 分析全部数据并生成精确的平滑建议

        **重要**：发送全部数据点给AI，不进行采样，确保平滑的精确性

        Parameters:
            image_path: 图像路径（保留参数以保持接口一致性，但不使用）
            extracted_points: 提取的数据点列表 [{"x": float, "y": float}, ...]
            calibration_info: 校准信息

        Returns:
            包含原始数据、平滑后数据、每个点的修改信息的字典
        """
        # 计算数据统计信息
        x_values = [p['x'] for p in extracted_points]
        y_values = [p['y'] for p in extracted_points]

        # 按X排序
        sorted_points = sorted(extracted_points, key=lambda p: p['x'])

        # 计算数据的变化率和波动性
        if len(sorted_points) > 1:
            y_diffs = [abs(sorted_points[i+1]['y'] - sorted_points[i]['y'])
                      for i in range(len(sorted_points)-1)]
            avg_diff = sum(y_diffs) / len(y_diffs) if y_diffs else 0
            max_diff = max(y_diffs) if y_diffs else 0

            # 计算二阶导数（曲率）
            if len(sorted_points) > 2:
                second_diffs = [abs(y_diffs[i+1] - y_diffs[i]) for i in range(len(y_diffs)-1)]
                avg_curvature = sum(second_diffs) / len(second_diffs) if second_diffs else 0
            else:
                avg_curvature = 0
        else:
            avg_diff = 0
            max_diff = 0
            avg_curvature = 0

        data_stats = {
            "total_points": len(extracted_points),
            "x_range": [min(x_values), max(x_values)],
            "y_range": [min(y_values), max(y_values)],
            "avg_y_change": avg_diff,
            "max_y_change": max_diff,
            "avg_curvature": avg_curvature
        }

        # **关键改动：发送全部数据点给AI，不进行采样**
        prompt = f"""请分析这组科学图表的**全部数据点**，并提供精确的平滑处理建议。

## 数据信息
- **数据点总数**: {data_stats['total_points']} 个点（全部数据，未采样）
- **X 范围**: {data_stats['x_range'][0]:.6f} 到 {data_stats['x_range'][1]:.6f}
- **Y 范围**: {data_stats['y_range'][0]:.6f} 到 {data_stats['y_range'][1]:.6f}
- **平均Y变化**: {data_stats['avg_y_change']:.8f}
- **最大Y变化**: {data_stats['max_y_change']:.8f}
- **平均曲率**: {data_stats['avg_curvature']:.8f}

## 校准信息
- X 轴范围: {calibration_info.get('x_min', 0)} 到 {calibration_info.get('x_max', 1)}
- Y 轴范围: {calibration_info.get('y_min', 0)} 到 {calibration_info.get('y_max', 1)}

## 全部数据点（按X排序）
{json.dumps(sorted_points, indent=2)}

## 分析要求
请仔细分析**每一个数据点**，判断：
1. **曲线整体特征**: 单调性、峰值、拐点、周期性
2. **局部波动**: 哪些区域波动较大，哪些区域平滑
3. **异常点**: 是否有明显偏离趋势的点
4. **平滑策略**:
   - 需要多大的平滑窗口？
   - 哪些区域需要更强的平滑？
   - 哪些区域需要保留细节（如峰值、拐点）？

## 返回格式
请返回 JSON 格式：

{{
    "curve_analysis": {{
        "curve_type": "曲线类型（单调递增/有峰值/S型/波动型等）",
        "smoothness": "当前平滑度（rough/moderate/smooth）",
        "trend_description": "详细的曲线走势描述",
        "key_features": [
            {{"x": X坐标, "type": "peak/valley/inflection", "description": "特征描述"}}
        ]
    }},
    "smoothing_recommendation": {{
        "method": "moving_average",
        "parameters": {{
            "window_size": 推荐的窗口大小（奇数，5-15之间）,
            "adaptive": true,
            "preserve_features": ["peak", "valley", "inflection"]
        }},
        "reason": "选择该方法和参数的详细原因"
    }},
    "quality_assessment": {{
        "current_quality": 1到10的评分,
        "expected_quality": 平滑后预期评分,
        "roughness_score": 粗糙度评分（0-10，越高越粗糙）,
        "improvement_areas": ["具体改进方面"]
    }}
}}

**重要**: 请基于全部 {data_stats['total_points']} 个数据点进行分析，确保平滑结果的精确性。

请只返回 JSON，不要包含其他文字。"""

        try:
            print(f"[AI Smooth] 调用 AI API，模型: {self.model}")
            print(f"[AI Smooth] 发送全部数据点: {len(extracted_points)} 个")
            print(f"[AI Smooth] 数据统计: avg_change={avg_diff:.6f}, max_change={max_diff:.6f}, curvature={avg_curvature:.6f}")

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                max_tokens=2000,  # 增加token限制以处理更多数据
                temperature=0.1
            )

            result_text = response.choices[0].message.content
            print(f"[AI Smooth] AI 响应长度: {len(result_text)} 字符")

            analysis_result = safe_parse_json(result_text)

            if not analysis_result:
                print(f"[AI Smooth] JSON 解析失败，使用默认参数")
                # 使用默认参数
                analysis_result = {
                    "curve_analysis": {
                        "curve_type": "未知",
                        "smoothness": "moderate",
                        "trend_description": "无法分析"
                    },
                    "smoothing_recommendation": {
                        "method": "moving_average",
                        "parameters": {
                            "window_size": 7,
                            "smoothing_factor": 0.3
                        },
                        "reason": "使用默认参数"
                    },
                    "quality_assessment": {
                        "current_quality": 5,
                        "expected_quality": 7,
                        "improvement_areas": ["平滑曲线"]
                    }
                }

            print(f"[AI Smooth] 分析完成，推荐方法: {analysis_result.get('smoothing_recommendation', {}).get('method', 'unknown')}")

            # 根据 AI 建议应用平滑算法
            smoothed_points = self._apply_smoothing(
                extracted_points,
                analysis_result
            )

            # 生成修改操作列表
            operations = self._generate_smooth_operations(
                extracted_points,
                smoothed_points
            )

            print(f"[AI Smooth] 平滑完成: {len(extracted_points)} -> {len(smoothed_points)} 点")
            print(f"[AI Smooth] 操作统计: 修改 {operations['modified_count']} 点")

            return {
                "success": True,
                "data": {
                    "original_points": extracted_points,
                    "smoothed_points": smoothed_points,
                    "operations": operations,
                    "analysis": analysis_result,
                    "method": analysis_result.get("smoothing_recommendation", {}).get("method", "moving_average"),
                    "statistics": {
                        "original_count": len(extracted_points),
                        "smoothed_count": len(smoothed_points),
                        "modified_count": operations['modified_count']
                    }
                },
                "message": f"AI 平滑分析完成，建议修改 {operations['modified_count']} 个点"
            }

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            print(f"[AI Smooth] 异常详情:\n{error_detail}")

            # 如果AI调用失败，使用默认平滑参数
            print(f"[AI Smooth] AI调用失败，使用默认平滑参数")
            default_analysis = {
                "smoothing_recommendation": {
                    "method": "moving_average",
                    "parameters": {
                        "window_size": 7,
                        "smoothing_factor": 0.3
                    }
                },
                "curve_analysis": {
                    "curve_type": "自动检测",
                    "smoothness": "moderate"
                },
                "quality_assessment": {
                    "current_quality": 5,
                    "expected_quality": 7
                }
            }

            smoothed_points = self._apply_smoothing(extracted_points, default_analysis)

            # 生成修改操作列表
            operations = self._generate_smooth_operations(
                extracted_points,
                smoothed_points
            )

            return {
                "success": True,
                "data": {
                    "original_points": extracted_points,
                    "smoothed_points": smoothed_points,
                    "operations": operations,
                    "analysis": default_analysis,
                    "method": "moving_average",
                    "statistics": {
                        "original_count": len(extracted_points),
                        "smoothed_count": len(smoothed_points),
                        "modified_count": operations['modified_count']
                    }
                },
                "message": f"使用默认参数完成平滑分析，建议修改 {operations['modified_count']} 个点"
            }

    def _generate_smooth_operations(
        self,
        original_points: List[Dict[str, float]],
        smoothed_points: List[Dict[str, float]]
    ) -> Dict[str, Any]:
        """
        生成平滑操作列表（修改点的信息）

        Parameters:
            original_points: 原始数据点
            smoothed_points: 平滑后的数据点

        Returns:
            包含修改操作的字典
        """
        modifications = []
        modified_count = 0

        # 按X排序以便对比
        orig_sorted = sorted(original_points, key=lambda p: p['x'])
        smooth_sorted = sorted(smoothed_points, key=lambda p: p['x'])

        # 对比每个点的Y值变化
        for i, (orig, smooth) in enumerate(zip(orig_sorted, smooth_sorted)):
            y_diff = abs(smooth['y'] - orig['y'])
            # 如果Y值变化超过阈值，记录为修改
            if y_diff > 1e-6:  # 避免浮点数精度问题
                modifications.append({
                    "index": i,
                    "type": "modify",
                    "original": {"x": orig['x'], "y": orig['y']},
                    "modified": {"x": smooth['x'], "y": smooth['y']},
                    "y_change": smooth['y'] - orig['y']
                })
                modified_count += 1

        return {
            "modifications": modifications,
            "modified_count": modified_count,
            "deleted_count": 0,  # 平滑不删除点
            "added_count": 0     # 平滑不增加点
        }


    def _apply_smoothing(
        self,
        points: List[Dict[str, float]],
        analysis: Dict[str, Any]
    ) -> List[Dict[str, float]]:
        """
        根据 AI 分析结果应用平滑算法

        Parameters:
            points: 原始数据点
            analysis: AI 分析结果

        Returns:
            平滑后的数据点
        """
        if len(points) < 3:
            return points

        # 按 X 排序
        sorted_points = sorted(points, key=lambda p: p['x'])

        recommendation = analysis.get("smoothing_recommendation", {})
        method = recommendation.get("method", "moving_average")
        params = recommendation.get("parameters", {})

        try:
            if method == "moving_average":
                # 移动平均平滑
                window_size = params.get("window_size", 5)
                window_size = max(3, min(window_size, len(sorted_points) // 3))
                if window_size % 2 == 0:
                    window_size += 1  # 确保是奇数

                smoothed = []
                half_window = window_size // 2

                for i in range(len(sorted_points)):
                    start_idx = max(0, i - half_window)
                    end_idx = min(len(sorted_points), i + half_window + 1)
                    window_points = sorted_points[start_idx:end_idx]

                    avg_y = sum(p['y'] for p in window_points) / len(window_points)
                    smoothed.append({
                        'x': sorted_points[i]['x'],
                        'y': avg_y
                    })

                return smoothed

            elif method == "savitzky_golay":
                # Savitzky-Golay 滤波器（简化版）
                window_size = params.get("window_size", 7)
                window_size = max(5, min(window_size, len(sorted_points) // 3))
                if window_size % 2 == 0:
                    window_size += 1

                # 使用移动平均作为简化实现
                smoothed = []
                half_window = window_size // 2

                for i in range(len(sorted_points)):
                    start_idx = max(0, i - half_window)
                    end_idx = min(len(sorted_points), i + half_window + 1)
                    window_points = sorted_points[start_idx:end_idx]

                    # 加权平均（中心权重更大）
                    weights = [1.0 / (1.0 + abs(j - i)) for j in range(start_idx, end_idx)]
                    total_weight = sum(weights)
                    weighted_y = sum(p['y'] * w for p, w in zip(window_points, weights)) / total_weight

                    smoothed.append({
                        'x': sorted_points[i]['x'],
                        'y': weighted_y
                    })

                return smoothed

            elif method == "exponential":
                # 指数平滑
                alpha = params.get("smoothing_factor", 0.3)
                alpha = max(0.1, min(0.9, alpha))

                smoothed = [sorted_points[0]]
                for i in range(1, len(sorted_points)):
                    smoothed_y = alpha * sorted_points[i]['y'] + (1 - alpha) * smoothed[-1]['y']
                    smoothed.append({
                        'x': sorted_points[i]['x'],
                        'y': smoothed_y
                    })

                return smoothed

            else:
                # 默认使用移动平均
                window_size = 5
                smoothed = []
                half_window = window_size // 2

                for i in range(len(sorted_points)):
                    start_idx = max(0, i - half_window)
                    end_idx = min(len(sorted_points), i + half_window + 1)
                    window_points = sorted_points[start_idx:end_idx]

                    avg_y = sum(p['y'] for p in window_points) / len(window_points)
                    smoothed.append({
                        'x': sorted_points[i]['x'],
                        'y': avg_y
                    })

                return smoothed

        except Exception as e:
            print(f"[AI Smooth] 平滑算法执行失败: {str(e)}")
            # 如果平滑失败，返回原始数据
            return sorted_points


# Test code
if __name__ == "__main__":
    # Test requires setting environment variables:
    # OPENAI_API_KEY=your_api_key
    # OPENAI_BASE_URL=https://api.openai.com/v1 (optional)

    try:
        assistant = AIAssistant()
        print("AI Assistant initialized successfully")

        # Test chart analysis
        test_image = "test_chart.png"
        if os.path.exists(test_image):
            result = assistant.analyze_chart(test_image)
            print(f"Analysis result: {json.dumps(result, indent=2, ensure_ascii=False)}")
        else:
            print(f"Test image not found: {test_image}")

    except Exception as e:
        print(f"Initialization failed: {e}")
