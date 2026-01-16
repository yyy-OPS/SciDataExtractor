"""
图像处理模块 - 核心计算机视觉逻辑
负责图像加载、颜色分割、曲线提取和坐标转换

增强功能:
- K-Means 颜色聚类自动分层
- 动量追踪算法处理曲线交叉
- 支持 Human-in-the-Loop 分层提取
"""

import cv2
import numpy as np
import pandas as pd
import base64
from typing import List, Tuple, Optional, Dict
from scipy import ndimage
from scipy.signal import savgol_filter
from skimage.morphology import skeletonize, thin

# 尝试导入 sklearn，如果不可用则使用备用方案
try:
    from sklearn.cluster import KMeans
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("[ImageProcessor] sklearn 未安装，K-Means 功能将使用备用实现")


class ImageProcessor:
    """
    图像处理器类
    封装了从科学图表中提取数据曲线的所有计算机视觉算法
    """

    def __init__(self, image_path: str):
        """
        初始化图像处理器

        参数:
            image_path: 图像文件路径
        """
        # 读取图像（BGR 格式）
        self.image_bgr = cv2.imread(image_path)
        if self.image_bgr is None:
            raise ValueError(f"无法读取图像: {image_path}")

        # 转换为 RGB 格式（用于显示）
        self.image_rgb = cv2.cvtColor(self.image_bgr, cv2.COLOR_BGR2RGB)

        # 转换为 HSV 颜色空间（用于颜色分割）
        self.image_hsv = cv2.cvtColor(self.image_bgr, cv2.COLOR_BGR2HSV)

        # 获取图像尺寸
        self.height, self.width = self.image_bgr.shape[:2]

        # 校准参数
        self.calibration_set = False
        self.x_scale = None
        self.y_scale = None
        self.x_offset = None
        self.y_offset = None
        self.x_pixel_start = None
        self.y_pixel_start = None

        # 校准区域边界（用于过滤绘图区域外的点）
        self.plot_region = None

    def sample_color_at_point(self, x: int, y: int, sample_radius: int = 2) -> np.ndarray:
        """
        在指定像素位置采样 HSV 颜色值（使用邻域平均）

        参数:
            x: 像素 X 坐标
            y: 像素 Y 坐标
            sample_radius: 采样半径，取周围像素的平均值

        返回:
            HSV 颜色值数组 [H, S, V]
        """
        x, y = int(x), int(y)

        # 边界检查
        if x < 0 or x >= self.width or y < 0 or y >= self.height:
            raise ValueError(f"坐标超出图像范围: ({x}, {y})")

        # 获取邻域范围
        x_min = max(0, x - sample_radius)
        x_max = min(self.width, x + sample_radius + 1)
        y_min = max(0, y - sample_radius)
        y_max = min(self.height, y + sample_radius + 1)

        # 获取邻域的 HSV 值并计算平均
        region = self.image_hsv[y_min:y_max, x_min:x_max]
        hsv_value = np.mean(region, axis=(0, 1)).astype(np.uint8)

        return hsv_value

    def set_calibration(
        self,
        x_axis_pixels: Tuple[Tuple[float, float], Tuple[float, float]],
        x_axis_values: Tuple[float, float],
        y_axis_pixels: Tuple[Tuple[float, float], Tuple[float, float]],
        y_axis_values: Tuple[float, float]
    ):
        """
        设置坐标系校准参数
        """
        (x1_pixel, y1_pixel), (x2_pixel, y2_pixel) = x_axis_pixels
        x1_value, x2_value = x_axis_values

        (x3_pixel, y3_pixel), (x4_pixel, y4_pixel) = y_axis_pixels
        y1_value, y2_value = y_axis_values

        pixel_distance_x = x2_pixel - x1_pixel
        value_distance_x = x2_value - x1_value

        if abs(pixel_distance_x) < 1:
            raise ValueError("X 轴的两个点太接近，无法校准")

        self.x_scale = value_distance_x / pixel_distance_x
        self.x_offset = x1_value
        self.x_pixel_start = x1_pixel

        pixel_distance_y = y4_pixel - y3_pixel
        value_distance_y = y2_value - y1_value

        if abs(pixel_distance_y) < 1:
            raise ValueError("Y 轴的两个点太接近，无法校准")

        self.y_scale = value_distance_y / pixel_distance_y
        self.y_offset = y1_value
        self.y_pixel_start = y3_pixel

        # 设置绘图区域边界（用于过滤）
        x_pixels = [x1_pixel, x2_pixel, x3_pixel, x4_pixel]
        y_pixels = [y1_pixel, y2_pixel, y3_pixel, y4_pixel]
        margin = 10  # 边距
        self.plot_region = {
            'x_min': min(x_pixels) - margin,
            'x_max': max(x_pixels) + margin,
            'y_min': min(y_pixels) - margin,
            'y_max': max(y_pixels) + margin
        }

        self.calibration_set = True

    def pixel_to_physical(self, pixel_x: float, pixel_y: float) -> Tuple[float, float]:
        """将像素坐标转换为物理坐标"""
        if not self.calibration_set:
            raise ValueError("请先设置校准参数")

        physical_x = (pixel_x - self.x_pixel_start) * self.x_scale + self.x_offset
        physical_y = (pixel_y - self.y_pixel_start) * self.y_scale + self.y_offset

        return physical_x, physical_y

    def is_in_plot_region(self, x: float, y: float) -> bool:
        """检查像素点是否在绘图区域内"""
        if self.plot_region is None:
            return True
        return (self.plot_region['x_min'] <= x <= self.plot_region['x_max'] and
                self.plot_region['y_min'] <= y <= self.plot_region['y_max'])

    def extract_curve(
        self,
        target_hsv: List[int],
        tolerance: int = 20,
        downsample_factor: int = 1,
        smooth: bool = True
    ) -> List[Tuple[float, float]]:
        """
        基于颜色分割提取曲线数据（优化版）

        参数:
            target_hsv: 目标颜色的 HSV 值 [H, S, V]
            tolerance: 颜色容差
            downsample_factor: 降采样因子（减少数据点数量）
            smooth: 是否平滑数据

        返回:
            物理坐标点列表 [(x1, y1), (x2, y2), ...]
        """
        if not self.calibration_set:
            raise ValueError("请先设置校准参数")

        h, s, v = target_hsv

        # ========== 步骤 1: 创建颜色掩码（优化版）==========
        # 自动检测是否为黑白/灰色
        is_grayscale = (s < 30 and v > 80) or (s < 30)  # 低饱和度通常表示灰色/黑白

        if is_grayscale:
            # 黑白/灰色模式：使用较低饱和度，主要基于明度匹配
            h_tol = 179  # H 通道宽松
            s_tol = 100  # S 通道宽松
            v_tol = tolerance  # V 通道使用用户指定的容差

            lower_bound = np.array([
                0,  # H 通道不限制
                0,  # S 通道不限制（接受所有饱和度）
                max(0, v - v_tol)
            ])

            upper_bound = np.array([
                179,  # H 通道不限制
                100,  # 接受低饱和度
                min(255, v + v_tol)
            ])
        else:
            # 彩色模式：对 H 通道使用更严格的容差，对 S 和 V 使用较宽松的容差
            h_tol = min(tolerance, 15)  # H 通道容差更严格
            s_tol = tolerance + 10
            v_tol = tolerance + 20

            lower_bound = np.array([
                max(0, h - h_tol),
                max(30, s - s_tol),  # 排除低饱和度（灰色/白色）
                max(30, v - v_tol)   # 排除太暗的像素
            ])

            upper_bound = np.array([
                min(179, h + h_tol),
                min(255, s + s_tol),
                min(255, v + v_tol)
            ])

        mask = cv2.inRange(self.image_hsv, lower_bound, upper_bound)

        # ========== 步骤 2: 形态学操作去噪（增强版）==========
        # 使用更大的核去除更多噪点
        kernel_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        kernel_medium = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

        # 先用小核开运算去除小噪点
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_small, iterations=2)

        # 闭运算填充小空洞
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_small, iterations=1)

        # 再次开运算去除残留噪点
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_small, iterations=1)

        # ========== 步骤 3: 连通组件分析，只保留最大的组件 ==========
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)

        if num_labels <= 1:
            return []

        # 找到最大的连通组件（排除背景，标签0）
        # 按面积排序，取最大的几个
        areas = stats[1:, cv2.CC_STAT_AREA]  # 排除背景
        if len(areas) == 0:
            return []

        # 只保留面积大于阈值的组件
        min_area = max(50, np.max(areas) * 0.1)  # 至少是最大组件的10%
        large_components = np.where(areas >= min_area)[0] + 1  # +1 因为排除了背景

        # 创建新掩码，只包含大组件
        filtered_mask = np.zeros_like(mask)
        for comp_id in large_components:
            filtered_mask[labels == comp_id] = 255

        mask = filtered_mask

        if np.sum(mask > 0) < 10:
            return []

        # ========== 步骤 4: 骨架化 ==========
        binary_mask = (mask > 0).astype(np.uint8)
        skeleton = skeletonize(binary_mask)
        skeleton = (skeleton * 255).astype(np.uint8)

        # ========== 步骤 5: 提取并过滤像素坐标 ==========
        y_coords, x_coords = np.where(skeleton > 0)

        if len(x_coords) == 0:
            return []

        # 过滤：只保留绘图区域内的点
        valid_indices = []
        for i, (x, y) in enumerate(zip(x_coords, y_coords)):
            if self.is_in_plot_region(x, y):
                valid_indices.append(i)

        x_coords = x_coords[valid_indices]
        y_coords = y_coords[valid_indices]

        if len(x_coords) == 0:
            return []

        # ========== 步骤 6: 处理多值问题并降采样 ==========
        x_to_y = {}
        for x, y in zip(x_coords, y_coords):
            if x not in x_to_y:
                x_to_y[x] = []
            x_to_y[x].append(y)

        # 对每个 X，取 Y 的中位数（比平均值更稳健）
        pixel_points = []
        sorted_x = sorted(x_to_y.keys())

        # 降采样
        step = max(1, downsample_factor)
        for i, x in enumerate(sorted_x):
            if i % step == 0:
                y_median = np.median(x_to_y[x])
                pixel_points.append((x, y_median))

        # ========== 步骤 7: 转换为物理坐标 ==========
        physical_points = []
        for px, py in pixel_points:
            phys_x, phys_y = self.pixel_to_physical(px, py)
            physical_points.append((phys_x, phys_y))

        # 按 X 排序
        physical_points.sort(key=lambda p: p[0])

        # ========== 步骤 8: 数据清洗 - 去除异常点 ==========
        if len(physical_points) > 5:
            physical_points = self.remove_outliers(physical_points)

        # ========== 步骤 9: 可选平滑 ==========
        if smooth and len(physical_points) > 10:
            physical_points = self.smooth_curve(physical_points)

        return physical_points

    def remove_outliers(self, points: List[Tuple[float, float]], threshold: float = 2.5) -> List[Tuple[float, float]]:
        """
        去除异常点（基于局部斜率变化）

        参数:
            points: 数据点列表
            threshold: 异常阈值（标准差的倍数）

        返回:
            清洗后的数据点列表
        """
        if len(points) < 5:
            return points

        x_vals = np.array([p[0] for p in points])
        y_vals = np.array([p[1] for p in points])

        # 计算局部斜率
        slopes = np.diff(y_vals) / (np.diff(x_vals) + 1e-10)

        # 计算斜率的变化率
        slope_changes = np.abs(np.diff(slopes))

        # 使用中位数绝对偏差（MAD）来检测异常
        median_change = np.median(slope_changes)
        mad = np.median(np.abs(slope_changes - median_change))

        if mad < 1e-10:
            return points

        # 标记异常点
        outlier_mask = np.zeros(len(points), dtype=bool)
        for i, change in enumerate(slope_changes):
            if np.abs(change - median_change) > threshold * mad * 1.4826:
                # 标记这个点和下一个点为可疑
                outlier_mask[i + 1] = True

        # 返回非异常点
        cleaned_points = [p for i, p in enumerate(points) if not outlier_mask[i]]

        return cleaned_points if len(cleaned_points) > 3 else points

    def smooth_curve(self, points: List[Tuple[float, float]], window: int = 5) -> List[Tuple[float, float]]:
        """
        使用 Savitzky-Golay 滤波器平滑曲线

        参数:
            points: 数据点列表
            window: 窗口大小

        返回:
            平滑后的数据点列表
        """
        if len(points) < window:
            return points

        x_vals = np.array([p[0] for p in points])
        y_vals = np.array([p[1] for p in points])

        # 确保窗口大小是奇数
        if window % 2 == 0:
            window += 1

        # 确保窗口不超过数据长度
        window = min(window, len(points) - 2)
        if window < 3:
            return points

        try:
            y_smooth = savgol_filter(y_vals, window, 2)
            return list(zip(x_vals, y_smooth))
        except Exception:
            return points

    def export_to_excel(self, data_points: List[Tuple[float, float]], output_path: str):
        """将提取的数据导出到 Excel 文件"""
        df = pd.DataFrame(data_points, columns=['X', 'Y'])
        df.to_excel(output_path, index=False, sheet_name='提取数据')

    # ==================== K-Means 颜色聚类方法 ====================

    def detect_dominant_colors(
        self,
        k: int = 5,
        exclude_background: bool = True,
        min_saturation: int = 30
    ) -> List[Dict]:
        """
        使用 K-Means 算法自动识别图中主要颜色，返回 N 个初始图层

        参数:
            k: 聚类数量（颜色数量）
            exclude_background: 是否排除背景色（白色/浅灰色）
            min_saturation: 最小饱和度阈值，用于过滤背景

        返回:
            图层列表，每个图层包含:
            - name: 图层名称
            - color_hsv: HSV 颜色值
            - color_rgb: RGB 颜色值
            - mask: 二值掩码 (Base64 PNG)
            - pixel_count: 像素数量
            - percentage: 占比
        """
        # 获取图像像素
        pixels = self.image_hsv.reshape(-1, 3).astype(np.float32)

        # 如果排除背景，过滤低饱和度像素
        if exclude_background:
            # 创建掩码：排除低饱和度（背景）和极高/极低明度
            saturation = pixels[:, 1]
            value = pixels[:, 2]
            valid_mask = (saturation >= min_saturation) & (value > 30) & (value < 250)
            valid_pixels = pixels[valid_mask]

            if len(valid_pixels) < 100:
                # 如果有效像素太少，使用所有像素
                valid_pixels = pixels
                valid_mask = np.ones(len(pixels), dtype=bool)
        else:
            valid_pixels = pixels
            valid_mask = np.ones(len(pixels), dtype=bool)

        # 执行 K-Means 聚类
        if SKLEARN_AVAILABLE:
            kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
            kmeans.fit(valid_pixels)
            centers = kmeans.cluster_centers_
            labels = kmeans.labels_
        else:
            # 备用实现：使用 OpenCV 的 K-Means
            criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
            _, labels, centers = cv2.kmeans(
                valid_pixels,
                k,
                None,
                criteria,
                10,
                cv2.KMEANS_RANDOM_CENTERS
            )
            labels = labels.flatten()

        # 创建完整标签数组
        full_labels = np.full(len(pixels), -1, dtype=np.int32)
        full_labels[valid_mask] = labels

        # 为每个聚类创建图层
        layers = []
        total_valid_pixels = np.sum(valid_mask)

        # 预定义颜色名称映射
        color_names = self._get_color_names()

        for i in range(k):
            center_hsv = centers[i].astype(np.uint8)

            # 创建该颜色的掩码
            cluster_mask = (full_labels == i).reshape(self.height, self.width)
            mask_uint8 = (cluster_mask * 255).astype(np.uint8)

            # 形态学操作清理掩码
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            mask_uint8 = cv2.morphologyEx(mask_uint8, cv2.MORPH_OPEN, kernel)
            mask_uint8 = cv2.morphologyEx(mask_uint8, cv2.MORPH_CLOSE, kernel)

            pixel_count = int(np.sum(mask_uint8 > 0))

            if pixel_count < 50:
                continue

            # HSV 转 RGB
            hsv_pixel = np.array([[[center_hsv[0], center_hsv[1], center_hsv[2]]]], dtype=np.uint8)
            rgb_pixel = cv2.cvtColor(hsv_pixel, cv2.COLOR_HSV2RGB)[0, 0]

            # 获取颜色名称
            color_name = self._hsv_to_color_name(center_hsv, color_names)

            # 编码掩码为 Base64
            _, buffer = cv2.imencode('.png', mask_uint8)
            mask_base64 = base64.b64encode(buffer).decode('utf-8')

            layers.append({
                "name": f"{color_name}_{i+1}",
                "color_hsv": center_hsv.tolist(),
                "color_rgb": rgb_pixel.tolist(),
                "mask": f"data:image/png;base64,{mask_base64}",
                "pixel_count": pixel_count,
                "percentage": round(pixel_count / total_valid_pixels * 100, 2)
            })

        # 按像素数量排序
        layers.sort(key=lambda x: x["pixel_count"], reverse=True)

        return layers

    def _get_color_names(self) -> Dict[str, Tuple[int, int, int, int]]:
        """获取颜色名称映射表 (H_min, H_max, S_min, V_min)"""
        return {
            "红色": (0, 10, 100, 100),
            "红色2": (170, 180, 100, 100),
            "橙色": (10, 25, 100, 100),
            "黄色": (25, 35, 100, 100),
            "绿色": (35, 85, 100, 100),
            "青色": (85, 100, 100, 100),
            "蓝色": (100, 130, 100, 100),
            "紫色": (130, 155, 100, 100),
            "粉色": (155, 170, 50, 100),
            "黑色": (0, 180, 0, 0),
            "白色": (0, 180, 0, 200),
            "灰色": (0, 180, 0, 50),
        }

    def _hsv_to_color_name(
        self,
        hsv: np.ndarray,
        color_names: Dict
    ) -> str:
        """将 HSV 值转换为颜色名称"""
        h, s, v = hsv

        # 检查灰度色
        if s < 30:
            if v < 50:
                return "黑色"
            elif v > 200:
                return "白色"
            else:
                return "灰色"

        # 检查彩色
        for name, (h_min, h_max, s_min, v_min) in color_names.items():
            if name in ["黑色", "白色", "灰色"]:
                continue
            if h_min <= h <= h_max and s >= s_min and v >= v_min:
                return name

        return "未知色"

    # ==================== 动量追踪算法 ====================

    def extract_curve_from_mask(
        self,
        mask: np.ndarray,
        start_point: Optional[Tuple[int, int]] = None,
        direction: str = "auto"
    ) -> List[Tuple[float, float]]:
        """
        从二值 Mask 上使用动量追踪算法提取曲线

        核心算法：从起点开始，沿着线条切线方向搜索下一个像素，
        利用动量惯性解决交叉点选择问题。

        参数:
            mask: 二值掩码 (uint8, 0-255)
            start_point: 起始点 (x, y)，如果为 None 则自动检测
            direction: 追踪方向 ('left_to_right', 'right_to_left', 'auto')

        返回:
            物理坐标点列表 [(x1, y1), (x2, y2), ...]
        """
        if not self.calibration_set:
            raise ValueError("请先设置校准参数")

        # 确保掩码是二值的
        if mask.dtype != np.uint8:
            mask = mask.astype(np.uint8)
        binary_mask = (mask > 127).astype(np.uint8)

        # 骨架化
        skeleton = skeletonize(binary_mask)
        skeleton_uint8 = (skeleton * 255).astype(np.uint8)

        # 获取所有骨架点
        y_coords, x_coords = np.where(skeleton_uint8 > 0)

        if len(x_coords) == 0:
            return []

        # 确定起始点
        if start_point is None:
            start_point = self._find_start_point(x_coords, y_coords, direction)

        # 动量追踪
        traced_points = self._momentum_trace(
            skeleton_uint8,
            start_point,
            x_coords,
            y_coords
        )

        # 转换为物理坐标
        physical_points = []
        for px, py in traced_points:
            if self.is_in_plot_region(px, py):
                phys_x, phys_y = self.pixel_to_physical(px, py)
                physical_points.append((phys_x, phys_y))

        # 按 X 排序
        physical_points.sort(key=lambda p: p[0])

        # 去除异常点
        if len(physical_points) > 5:
            physical_points = self.remove_outliers(physical_points)

        return physical_points

    def _find_start_point(
        self,
        x_coords: np.ndarray,
        y_coords: np.ndarray,
        direction: str
    ) -> Tuple[int, int]:
        """找到追踪起始点"""
        if direction == "left_to_right" or direction == "auto":
            # 找最左边的点
            min_x_idx = np.argmin(x_coords)
            return (x_coords[min_x_idx], y_coords[min_x_idx])
        else:
            # 找最右边的点
            max_x_idx = np.argmax(x_coords)
            return (x_coords[max_x_idx], y_coords[max_x_idx])

    def _momentum_trace(
        self,
        skeleton: np.ndarray,
        start_point: Tuple[int, int],
        all_x: np.ndarray,
        all_y: np.ndarray
    ) -> List[Tuple[int, int]]:
        """
        动量追踪算法核心实现

        参数:
            skeleton: 骨架图像
            start_point: 起始点
            all_x, all_y: 所有骨架点坐标

        返回:
            追踪到的像素坐标列表
        """
        h, w = skeleton.shape
        visited = np.zeros_like(skeleton, dtype=bool)
        traced = []

        # 8邻域方向向量
        directions = [
            (1, 0), (1, 1), (0, 1), (-1, 1),
            (-1, 0), (-1, -1), (0, -1), (1, -1)
        ]

        # 初始化
        current = start_point
        momentum = np.array([1.0, 0.0])  # 初始动量向右
        momentum_weight = 0.7  # 动量权重

        max_iterations = len(all_x) * 2
        iteration = 0

        while iteration < max_iterations:
            iteration += 1
            x, y = int(current[0]), int(current[1])

            # 边界检查
            if x < 0 or x >= w or y < 0 or y >= h:
                break

            # 标记已访问
            if visited[y, x]:
                # 如果已访问，尝试跳过
                break
            visited[y, x] = True
            traced.append((x, y))

            # 寻找下一个点
            candidates = []
            for dx, dy in directions:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    if skeleton[ny, nx] > 0 and not visited[ny, nx]:
                        # 计算方向向量
                        dir_vec = np.array([dx, dy], dtype=np.float64)
                        dir_vec = dir_vec / (np.linalg.norm(dir_vec) + 1e-10)

                        # 计算与动量的夹角（点积）
                        momentum_norm = momentum / (np.linalg.norm(momentum) + 1e-10)
                        angle_score = np.dot(dir_vec, momentum_norm)

                        # 综合评分：动量一致性 + 距离
                        score = momentum_weight * angle_score + (1 - momentum_weight)
                        candidates.append((nx, ny, score, dir_vec))

            if not candidates:
                # 没有候选点，尝试扩大搜索范围
                found = False
                for radius in range(2, 5):
                    for dx in range(-radius, radius + 1):
                        for dy in range(-radius, radius + 1):
                            if dx == 0 and dy == 0:
                                continue
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < w and 0 <= ny < h:
                                if skeleton[ny, nx] > 0 and not visited[ny, nx]:
                                    dir_vec = np.array([dx, dy], dtype=np.float64)
                                    dir_vec = dir_vec / (np.linalg.norm(dir_vec) + 1e-10)
                                    candidates.append((nx, ny, 0.5, dir_vec))
                                    found = True
                    if found:
                        break
                if not candidates:
                    break

            # 选择最佳候选点
            candidates.sort(key=lambda c: c[2], reverse=True)
            best = candidates[0]
            next_x, next_y, _, next_dir = best

            # 更新动量（指数移动平均）
            momentum = 0.6 * momentum + 0.4 * next_dir

            current = (next_x, next_y)

        return traced

    def create_mask_from_color(
        self,
        target_hsv: List[int],
        tolerance: int = 20
    ) -> np.ndarray:
        """
        根据颜色创建掩码

        参数:
            target_hsv: 目标 HSV 颜色
            tolerance: 颜色容差

        返回:
            二值掩码 (uint8, 0-255)
        """
        h, s, v = target_hsv

        # 判断是否为灰度色
        is_grayscale = s < 30

        if is_grayscale:
            lower = np.array([0, 0, max(0, v - tolerance)])
            upper = np.array([179, 100, min(255, v + tolerance)])
        else:
            h_tol = min(tolerance, 15)
            s_tol = tolerance + 10
            v_tol = tolerance + 20

            lower = np.array([
                max(0, h - h_tol),
                max(30, s - s_tol),
                max(30, v - v_tol)
            ])
            upper = np.array([
                min(179, h + h_tol),
                min(255, s + s_tol),
                min(255, v + v_tol)
            ])

        mask = cv2.inRange(self.image_hsv, lower, upper)

        # 形态学清理
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)

        return mask

    def refine_mask_with_morphology(
        self,
        mask: np.ndarray,
        operation: str = "clean",
        kernel_size: int = 3
    ) -> np.ndarray:
        """
        使用形态学操作优化掩码

        参数:
            mask: 输入掩码
            operation: 操作类型 ('clean', 'dilate', 'erode', 'fill_gaps')
            kernel_size: 核大小

        返回:
            优化后的掩码
        """
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))

        if operation == "clean":
            # 清理噪点
            result = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            result = cv2.morphologyEx(result, cv2.MORPH_CLOSE, kernel)
        elif operation == "dilate":
            # 膨胀
            result = cv2.dilate(mask, kernel, iterations=1)
        elif operation == "erode":
            # 腐蚀
            result = cv2.erode(mask, kernel, iterations=1)
        elif operation == "fill_gaps":
            # 填充间隙
            result = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        else:
            result = mask

        return result

    def merge_masks(
        self,
        mask1: np.ndarray,
        mask2: np.ndarray,
        operation: str = "union"
    ) -> np.ndarray:
        """
        合并两个掩码

        参数:
            mask1, mask2: 输入掩码
            operation: 合并操作 ('union', 'intersect', 'subtract')

        返回:
            合并后的掩码
        """
        if operation == "union":
            return cv2.bitwise_or(mask1, mask2)
        elif operation == "intersect":
            return cv2.bitwise_and(mask1, mask2)
        elif operation == "subtract":
            return cv2.bitwise_and(mask1, cv2.bitwise_not(mask2))
        else:
            return mask1

    def mask_to_base64(self, mask: np.ndarray) -> str:
        """将掩码转换为 Base64 PNG"""
        _, buffer = cv2.imencode('.png', mask)
        base64_str = base64.b64encode(buffer).decode('utf-8')
        return f"data:image/png;base64,{base64_str}"

    def base64_to_mask(self, base64_data: str) -> np.ndarray:
        """从 Base64 PNG 解码掩码"""
        if base64_data.startswith('data:'):
            base64_data = base64_data.split(',')[1]

        img_data = base64.b64decode(base64_data)
        nparr = np.frombuffer(img_data, np.uint8)
        mask = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)

        # 确保尺寸匹配
        if mask.shape[:2] != (self.height, self.width):
            mask = cv2.resize(mask, (self.width, self.height))

        return mask

    def get_composite_preview(
        self,
        layers: List[Dict],
        selected_layer: Optional[str] = None
    ) -> str:
        """
        生成图层合成预览图

        参数:
            layers: 图层列表，每个包含 mask (base64) 和 color_rgb
            selected_layer: 当前选中的图层名称

        返回:
            合成图像的 Base64 PNG
        """
        result = self.image_rgb.copy()

        for layer in layers:
            if not layer.get("visible", True):
                continue

            mask = self.base64_to_mask(layer["mask"])
            color = layer.get("color_rgb", [255, 0, 0])
            opacity = layer.get("opacity", 0.5)

            # 如果是选中图层，增加不透明度
            if layer.get("name") == selected_layer:
                opacity = min(1.0, opacity + 0.2)

            # 创建彩色覆盖层
            overlay = np.zeros_like(result)
            overlay[mask > 127] = color

            # 混合
            mask_3ch = np.stack([mask, mask, mask], axis=-1) / 255.0
            result = (result * (1 - mask_3ch * opacity) +
                     overlay * mask_3ch * opacity).astype(np.uint8)

        # 编码为 Base64
        _, buffer = cv2.imencode('.png', cv2.cvtColor(result, cv2.COLOR_RGB2BGR))
        base64_str = base64.b64encode(buffer).decode('utf-8')
        return f"data:image/png;base64,{base64_str}"


# ==================== 测试代码 ====================
if __name__ == "__main__":
    test_image_path = "test_chart.png"

    try:
        processor = ImageProcessor(test_image_path)
        print(f"图像加载成功: {processor.width} x {processor.height}")

        processor.set_calibration(
            x_axis_pixels=((100, 400), (500, 400)),
            x_axis_values=(0, 0.5),
            y_axis_pixels=((100, 400), (100, 50)),
            y_axis_values=(0, 300)
        )

        target_hsv = [100, 200, 200]
        data = processor.extract_curve(target_hsv, tolerance=20)

        if len(data) > 0:
            print(f"\n提取成功！共 {len(data)} 个数据点")
            processor.export_to_excel(data, "output.xlsx")
        else:
            print("未提取到数据")

    except Exception as e:
        print(f"错误: {e}")
