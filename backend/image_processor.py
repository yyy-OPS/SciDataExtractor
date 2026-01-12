"""
图像处理模块 - 核心计算机视觉逻辑
负责图像加载、颜色分割、曲线提取和坐标转换
"""

import cv2
import numpy as np
import pandas as pd
from typing import List, Tuple, Optional
from scipy import ndimage
from scipy.signal import savgol_filter
from skimage.morphology import skeletonize, thin


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
