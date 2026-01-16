"""
AI 智能分割模块 v2.0 - 集成 SAM 2 和高级曲线检测算法
用于处理 LS-DYNA 冲击力时程曲线中的多线重叠和高频震荡密集区域

升级内容:
- SAM 2 (Segment Anything Model 2) - Meta 2024
- 改进的曲线追踪算法
- 贝塞尔曲线拟合
- 自适应阈值分割
"""

import cv2
import numpy as np
from typing import List, Tuple, Optional, Dict, Union
import os
from collections import deque


class SmartSegmenter:
    """
    智能分割器类 v2.0
    支持 SAM 2 和多种分割算法
    """

    def __init__(self, model_type: str = "sam2_b"):
        """
        初始化智能分割器

        参数:
            model_type: 模型类型
                - 'sam2_b': SAM 2 Base (推荐，平衡速度和精度)
                - 'sam2_l': SAM 2 Large (更高精度)
                - 'sam2_t': SAM 2 Tiny (最快速度)
                - 'sam_b': SAM 1 Base (兼容旧版)
        """
        self.model_type = model_type
        self.model = None
        self.sam2_predictor = None
        self.device = None
        self._initialized = False
        self._use_sam2 = model_type.startswith("sam2")

    def _lazy_init(self):
        """延迟初始化模型（首次使用时加载）"""
        if self._initialized:
            return

        try:
            import torch

            # 检测可用设备
            if torch.cuda.is_available():
                self.device = "cuda"
                print("[SmartSegmenter] 使用 GPU 加速 (CUDA)")
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                self.device = "mps"
                print("[SmartSegmenter] 使用 GPU 加速 (Apple MPS)")
            else:
                self.device = "cpu"
                print("[SmartSegmenter] 使用 CPU 模式")

            # 尝试加载 SAM 2
            if self._use_sam2:
                self._init_sam2()
            else:
                self._init_sam1()

        except ImportError as e:
            print(f"[SmartSegmenter] 警告: 依赖未安装 - {e}")
            self._initialized = False
        except Exception as e:
            print(f"[SmartSegmenter] 初始化失败: {e}")
            self._initialized = False

    def _init_sam2(self):
        """初始化 SAM 2 模型"""
        try:
            # 尝试使用 ultralytics 的 SAM2
            from ultralytics import SAM

            model_map = {
                "sam2_t": "sam2_t.pt",   # Tiny (~40MB)
                "sam2_b": "sam2_b.pt",   # Base (~90MB)
                "sam2_l": "sam2_l.pt",   # Large (~220MB)
            }

            model_name = model_map.get(self.model_type, "sam2_b.pt")
            print(f"[SmartSegmenter] 正在加载 SAM 2 模型: {model_name}")

            self.model = SAM(model_name)
            self._initialized = True
            print("[SmartSegmenter] SAM 2 模型加载完成")

        except Exception as e:
            print(f"[SmartSegmenter] SAM 2 加载失败，尝试 SAM 1: {e}")
            self._use_sam2 = False
            self._init_sam1()

    def _init_sam1(self):
        """初始化 SAM 1 模型（备用）"""
        try:
            from ultralytics import SAM

            model_map = {
                "sam_b": "sam_b.pt",
                "sam_l": "sam_l.pt",
                "sam_h": "sam_h.pt",
            }

            # 如果是 sam2 类型但失败了，降级到 sam_b
            if self.model_type.startswith("sam2"):
                model_name = "sam_b.pt"
            else:
                model_name = model_map.get(self.model_type, "sam_b.pt")

            print(f"[SmartSegmenter] 正在加载 SAM 1 模型: {model_name}")
            self.model = SAM(model_name)
            self._initialized = True
            print("[SmartSegmenter] SAM 1 模型加载完成")

        except Exception as e:
            print(f"[SmartSegmenter] SAM 1 加载失败: {e}")
            self._initialized = False

    def is_available(self) -> bool:
        """检查模型是否可用"""
        if not self._initialized:
            self._lazy_init()
        return self._initialized and self.model is not None

    def get_model_info(self) -> Dict:
        """获取当前模型信息"""
        return {
            "model_type": self.model_type,
            "is_sam2": self._use_sam2,
            "device": self.device,
            "initialized": self._initialized
        }

    def segment_click(
        self,
        image: np.ndarray,
        point: Tuple[int, int],
        point_label: int = 1
    ) -> Optional[np.ndarray]:
        """
        基于点击坐标进行智能分割

        参数:
            image: 输入图像 (BGR 或 RGB 格式, uint8)
            point: 点击坐标 (x, y)
            point_label: 点标签 (1=前景, 0=背景)

        返回:
            分割掩码 (uint8, 0-255)，失败返回 None
        """
        if not self.is_available():
            print("[SmartSegmenter] 模型不可用，使用备用分割方法")
            return self._fallback_segment(image, point)

        try:
            # 确保图像是 RGB 格式
            if len(image.shape) == 2:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
            elif image.shape[2] == 4:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
            else:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            # 使用 SAM/SAM2 进行分割
            results = self.model.predict(
                image_rgb,
                points=[list(point)],
                labels=[point_label],
                verbose=False
            )

            if results and len(results) > 0:
                masks = results[0].masks
                if masks is not None and len(masks.data) > 0:
                    # 选择置信度最高的掩码
                    mask = masks.data[0].cpu().numpy()
                    mask_uint8 = (mask * 255).astype(np.uint8)
                    return mask_uint8

            print("[SmartSegmenter] 未返回有效掩码，使用备用方法")
            return self._fallback_segment(image, point)

        except Exception as e:
            print(f"[SmartSegmenter] 分割失败: {e}")
            return self._fallback_segment(image, point)

    def segment_box(
        self,
        image: np.ndarray,
        box: Tuple[int, int, int, int]
    ) -> Optional[np.ndarray]:
        """
        基于边界框进行智能分割

        参数:
            image: 输入图像
            box: 边界框 (x1, y1, x2, y2)

        返回:
            分割掩码 (uint8, 0-255)
        """
        if not self.is_available():
            return self._fallback_segment_box(image, box)

        try:
            if len(image.shape) == 2:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
            else:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            results = self.model.predict(
                image_rgb,
                bboxes=[list(box)],
                verbose=False
            )

            if results and len(results) > 0:
                masks = results[0].masks
                if masks is not None and len(masks.data) > 0:
                    mask = masks.data[0].cpu().numpy()
                    mask_uint8 = (mask * 255).astype(np.uint8)
                    return mask_uint8

            return self._fallback_segment_box(image, box)

        except Exception as e:
            print(f"[SmartSegmenter] 框选分割失败: {e}")
            return self._fallback_segment_box(image, box)

    def segment_multi_points(
        self,
        image: np.ndarray,
        points: List[Tuple[int, int]],
        labels: List[int]
    ) -> Optional[np.ndarray]:
        """
        基于多个点进行智能分割

        参数:
            image: 输入图像
            points: 点坐标列表 [(x1, y1), (x2, y2), ...]
            labels: 点标签列表 [1, 0, 1, ...] (1=前景, 0=背景)

        返回:
            分割掩码 (uint8, 0-255)
        """
        if not self.is_available():
            for pt, label in zip(points, labels):
                if label == 1:
                    return self._fallback_segment(image, pt)
            return None

        try:
            if len(image.shape) == 2:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
            else:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            results = self.model.predict(
                image_rgb,
                points=[list(p) for p in points],
                labels=labels,
                verbose=False
            )

            if results and len(results) > 0:
                masks = results[0].masks
                if masks is not None and len(masks.data) > 0:
                    mask = masks.data[0].cpu().numpy()
                    mask_uint8 = (mask * 255).astype(np.uint8)
                    return mask_uint8

            return None

        except Exception as e:
            print(f"[SmartSegmenter] 多点分割失败: {e}")
            return None

    def _fallback_segment(
        self,
        image: np.ndarray,
        point: Tuple[int, int],
        tolerance: int = 30
    ) -> np.ndarray:
        """
        备用分割方法：基于颜色相似度的区域生长 + 自适应阈值
        """
        x, y = int(point[0]), int(point[1])
        h, w = image.shape[:2]
        x = max(0, min(w - 1, x))
        y = max(0, min(h - 1, y))

        # 转换为 HSV
        if len(image.shape) == 2:
            hsv = cv2.cvtColor(cv2.cvtColor(image, cv2.COLOR_GRAY2BGR), cv2.COLOR_BGR2HSV)
        else:
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

        # 获取种子点颜色
        seed_color = hsv[y, x]

        # 自适应颜色范围
        h_tol = min(tolerance, 15)
        s_tol = tolerance + 10
        v_tol = tolerance + 20

        lower = np.array([
            max(0, seed_color[0] - h_tol),
            max(0, seed_color[1] - s_tol),
            max(0, seed_color[2] - v_tol)
        ])
        upper = np.array([
            min(179, seed_color[0] + h_tol),
            min(255, seed_color[1] + s_tol),
            min(255, seed_color[2] + v_tol)
        ])

        # 颜色分割
        mask = cv2.inRange(hsv, lower, upper)

        # 使用连通组件分析找到包含种子点的区域
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)

        # 找到包含种子点的组件
        seed_label = labels[y, x]
        if seed_label > 0:
            result_mask = (labels == seed_label).astype(np.uint8) * 255
        else:
            result_mask = mask

        # 形态学清理
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        result_mask = cv2.morphologyEx(result_mask, cv2.MORPH_CLOSE, kernel)
        result_mask = cv2.morphologyEx(result_mask, cv2.MORPH_OPEN, kernel)

        return result_mask

    def _fallback_segment_box(
        self,
        image: np.ndarray,
        box: Tuple[int, int, int, int]
    ) -> np.ndarray:
        """备用框选分割方法：使用 GrabCut"""
        x1, y1, x2, y2 = box
        h, w = image.shape[:2]

        x1 = max(0, min(w - 1, x1))
        y1 = max(0, min(h - 1, y1))
        x2 = max(x1 + 1, min(w, x2))
        y2 = max(y1 + 1, min(h, y2))

        if len(image.shape) == 2:
            img_bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        else:
            img_bgr = image.copy()

        mask = np.zeros((h, w), np.uint8)
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)
        rect = (x1, y1, x2 - x1, y2 - y1)

        try:
            cv2.grabCut(img_bgr, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
            mask_result = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
            return mask_result
        except Exception as e:
            print(f"[SmartSegmenter] GrabCut 失败: {e}")
            mask_result = np.zeros((h, w), np.uint8)
            mask_result[y1:y2, x1:x2] = 255
            return mask_result


class AdvancedCurveDetector:
    """
    高级曲线检测器
    使用多种算法组合提高曲线检测精度
    """

    def __init__(self):
        self.edge_detector = None

    def detect_curves_multi_scale(
        self,
        image: np.ndarray,
        scales: List[float] = [0.5, 1.0, 1.5]
    ) -> List[np.ndarray]:
        """
        多尺度曲线检测

        参数:
            image: 输入图像
            scales: 检测尺度列表

        返回:
            不同尺度检测到的边缘列表
        """
        results = []
        h, w = image.shape[:2]

        for scale in scales:
            # 缩放图像
            new_w = int(w * scale)
            new_h = int(h * scale)
            scaled = cv2.resize(image, (new_w, new_h))

            # 边缘检测
            if len(scaled.shape) == 3:
                gray = cv2.cvtColor(scaled, cv2.COLOR_BGR2GRAY)
            else:
                gray = scaled

            # 自适应 Canny
            median = np.median(gray)
            lower = int(max(0, (1.0 - 0.33) * median))
            upper = int(min(255, (1.0 + 0.33) * median))
            edges = cv2.Canny(gray, lower, upper)

            # 缩放回原始尺寸
            edges_resized = cv2.resize(edges, (w, h))
            results.append(edges_resized)

        # 合并多尺度结果
        combined = np.zeros((h, w), dtype=np.uint8)
        for edge in results:
            combined = cv2.bitwise_or(combined, edge)

        return combined

    def trace_curve_with_direction(
        self,
        skeleton: np.ndarray,
        start_point: Tuple[int, int],
        preferred_direction: Optional[np.ndarray] = None
    ) -> List[Tuple[int, int]]:
        """
        带方向引导的曲线追踪

        参数:
            skeleton: 骨架图像
            start_point: 起始点
            preferred_direction: 优先方向向量

        返回:
            追踪到的点列表
        """
        h, w = skeleton.shape
        visited = np.zeros_like(skeleton, dtype=bool)
        traced = []

        # 8邻域方向
        directions = [
            (1, 0), (1, 1), (0, 1), (-1, 1),
            (-1, 0), (-1, -1), (0, -1), (1, -1)
        ]

        current = start_point
        if preferred_direction is None:
            momentum = np.array([1.0, 0.0])
        else:
            momentum = preferred_direction / (np.linalg.norm(preferred_direction) + 1e-10)

        momentum_weight = 0.75
        max_iterations = h * w

        for _ in range(max_iterations):
            x, y = int(current[0]), int(current[1])

            if x < 0 or x >= w or y < 0 or y >= h:
                break

            if visited[y, x]:
                break

            visited[y, x] = True
            traced.append((x, y))

            # 寻找下一个点
            candidates = []
            for dx, dy in directions:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    if skeleton[ny, nx] > 0 and not visited[ny, nx]:
                        dir_vec = np.array([dx, dy], dtype=np.float64)
                        dir_vec = dir_vec / (np.linalg.norm(dir_vec) + 1e-10)
                        momentum_norm = momentum / (np.linalg.norm(momentum) + 1e-10)
                        angle_score = np.dot(dir_vec, momentum_norm)
                        score = momentum_weight * angle_score + (1 - momentum_weight)
                        candidates.append((nx, ny, score, dir_vec))

            if not candidates:
                # 扩大搜索范围
                for radius in range(2, 6):
                    for dx in range(-radius, radius + 1):
                        for dy in range(-radius, radius + 1):
                            if dx == 0 and dy == 0:
                                continue
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < w and 0 <= ny < h:
                                if skeleton[ny, nx] > 0 and not visited[ny, nx]:
                                    dir_vec = np.array([dx, dy], dtype=np.float64)
                                    dir_vec = dir_vec / (np.linalg.norm(dir_vec) + 1e-10)
                                    candidates.append((nx, ny, 0.3, dir_vec))
                    if candidates:
                        break

                if not candidates:
                    break

            # 选择最佳候选点
            candidates.sort(key=lambda c: c[2], reverse=True)
            best = candidates[0]
            next_x, next_y, _, next_dir = best

            # 更新动量
            momentum = 0.7 * momentum + 0.3 * next_dir
            current = (next_x, next_y)

        return traced

    def fit_bezier_curve(
        self,
        points: List[Tuple[int, int]],
        num_control_points: int = 4
    ) -> List[Tuple[float, float]]:
        """
        贝塞尔曲线拟合

        参数:
            points: 原始点列表
            num_control_points: 控制点数量

        返回:
            拟合后的平滑点列表
        """
        if len(points) < 4:
            return points

        points_array = np.array(points, dtype=np.float64)

        # 使用最小二乘法拟合贝塞尔曲线
        n = len(points_array)
        t = np.linspace(0, 1, n)

        # 构建贝塞尔基函数矩阵
        degree = num_control_points - 1
        B = np.zeros((n, num_control_points))

        for i in range(num_control_points):
            B[:, i] = self._bernstein_poly(i, degree, t)

        # 最小二乘求解控制点
        try:
            control_points, _, _, _ = np.linalg.lstsq(B, points_array, rcond=None)
        except:
            return points

        # 生成平滑曲线
        t_smooth = np.linspace(0, 1, max(n, 100))
        B_smooth = np.zeros((len(t_smooth), num_control_points))

        for i in range(num_control_points):
            B_smooth[:, i] = self._bernstein_poly(i, degree, t_smooth)

        smooth_points = B_smooth @ control_points

        return [(float(p[0]), float(p[1])) for p in smooth_points]

    def _bernstein_poly(self, i: int, n: int, t: np.ndarray) -> np.ndarray:
        """计算伯恩斯坦多项式"""
        from scipy.special import comb
        return comb(n, i) * (t ** i) * ((1 - t) ** (n - i))

    def detect_line_segments(
        self,
        image: np.ndarray,
        min_length: int = 20
    ) -> List[Dict]:
        """
        检测图像中的线段

        参数:
            image: 输入图像
            min_length: 最小线段长度

        返回:
            线段列表，每个包含起点、终点、角度等信息
        """
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # 使用 LSD (Line Segment Detector)
        lsd = cv2.createLineSegmentDetector(0)
        lines, widths, precs, nfas = lsd.detect(gray)

        segments = []
        if lines is not None:
            for i, line in enumerate(lines):
                x1, y1, x2, y2 = line[0]
                length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

                if length >= min_length:
                    angle = np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi
                    segments.append({
                        "start": (float(x1), float(y1)),
                        "end": (float(x2), float(y2)),
                        "length": float(length),
                        "angle": float(angle),
                        "width": float(widths[i][0]) if widths is not None else 1.0
                    })

        return segments


class CurveLayerManager:
    """
    曲线图层管理器
    管理多个分割图层，支持图层合并、编辑等操作
    """

    def __init__(self, image_shape: Tuple[int, int]):
        self.height, self.width = image_shape
        self.layers: Dict[str, Dict] = {}
        self.layer_order: List[str] = []

    def add_layer(
        self,
        name: str,
        mask: np.ndarray,
        color: Tuple[int, int, int] = (255, 0, 0),
        opacity: float = 0.5
    ) -> bool:
        if mask.shape[:2] != (self.height, self.width):
            print(f"[LayerManager] 掩码尺寸不匹配")
            return False

        if mask.dtype != np.uint8:
            mask = mask.astype(np.uint8)

        self.layers[name] = {
            "mask": mask.copy(),
            "color": color,
            "opacity": opacity,
            "visible": True,
            "locked": False
        }

        if name not in self.layer_order:
            self.layer_order.append(name)

        return True

    def remove_layer(self, name: str) -> bool:
        if name in self.layers:
            del self.layers[name]
            self.layer_order.remove(name)
            return True
        return False

    def get_layer_mask(self, name: str) -> Optional[np.ndarray]:
        if name in self.layers:
            return self.layers[name]["mask"].copy()
        return None

    def update_layer_mask(self, name: str, mask: np.ndarray) -> bool:
        if name not in self.layers:
            return False
        if mask.shape[:2] != (self.height, self.width):
            return False
        self.layers[name]["mask"] = mask.astype(np.uint8)
        return True

    def merge_to_layer(
        self,
        target_name: str,
        source_mask: np.ndarray,
        mode: str = "add"
    ) -> bool:
        if target_name not in self.layers:
            return False

        target_mask = self.layers[target_name]["mask"]

        if mode == "add":
            result = cv2.bitwise_or(target_mask, source_mask)
        elif mode == "subtract":
            result = cv2.bitwise_and(target_mask, cv2.bitwise_not(source_mask))
        elif mode == "intersect":
            result = cv2.bitwise_and(target_mask, source_mask)
        else:
            return False

        self.layers[target_name]["mask"] = result
        return True

    def render_composite(
        self,
        background: np.ndarray,
        selected_layer: Optional[str] = None
    ) -> np.ndarray:
        result = background.copy()

        for name in self.layer_order:
            layer = self.layers[name]
            if not layer["visible"]:
                continue

            mask = layer["mask"]
            color = layer["color"]
            opacity = layer["opacity"]

            if name == selected_layer:
                opacity = min(1.0, opacity + 0.2)

            overlay = np.zeros_like(result)
            overlay[mask > 127] = color

            mask_3ch = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR) / 255.0
            result = (result * (1 - mask_3ch * opacity) +
                     overlay * mask_3ch * opacity).astype(np.uint8)

        return result

    def get_layer_info(self) -> List[Dict]:
        info = []
        for name in self.layer_order:
            layer = self.layers[name]
            info.append({
                "name": name,
                "color": layer["color"],
                "opacity": layer["opacity"],
                "visible": layer["visible"],
                "locked": layer["locked"],
                "pixel_count": int(np.sum(layer["mask"] > 127))
            })
        return info


# 全局分割器实例
_global_segmenter: Optional[SmartSegmenter] = None
_global_curve_detector: Optional[AdvancedCurveDetector] = None


def get_segmenter(model_type: str = "sam2_b") -> SmartSegmenter:
    """获取全局分割器实例"""
    global _global_segmenter
    if _global_segmenter is None or _global_segmenter.model_type != model_type:
        _global_segmenter = SmartSegmenter(model_type)
    return _global_segmenter


def get_curve_detector() -> AdvancedCurveDetector:
    """获取全局曲线检测器实例"""
    global _global_curve_detector
    if _global_curve_detector is None:
        _global_curve_detector = AdvancedCurveDetector()
    return _global_curve_detector
