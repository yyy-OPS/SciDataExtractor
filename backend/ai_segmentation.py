"""
AI 智能分割模块 - 基于 Segment Anything Model (SAM)
用于处理 LS-DYNA 冲击力时程曲线中的多线重叠和高频震荡密集区域
"""

import cv2
import numpy as np
from typing import List, Tuple, Optional, Dict
import os


class SmartSegmenter:
    """
    智能分割器类
    封装 Segment Anything Model (SAM) 用于交互式图像分割
    """

    def __init__(self, model_type: str = "sam_b"):
        """
        初始化智能分割器

        参数:
            model_type: SAM 模型类型 ('sam_b', 'sam_l', 'sam_h')
                       b=base, l=large, h=huge
        """
        self.model_type = model_type
        self.model = None
        self.predictor = None
        self.device = None
        self._initialized = False

    def _lazy_init(self):
        """延迟初始化 SAM 模型（首次使用时加载）"""
        if self._initialized:
            return

        try:
            import torch
            from ultralytics import SAM

            # 检测可用设备
            if torch.cuda.is_available():
                self.device = "cuda"
                print("[SmartSegmenter] 使用 GPU 加速")
            else:
                self.device = "cpu"
                print("[SmartSegmenter] 使用 CPU 模式")

            # 模型映射
            model_map = {
                "sam_b": "sam_b.pt",  # Base model (~375MB)
                "sam_l": "sam_l.pt",  # Large model (~1.2GB)
                "sam_h": "sam_h.pt",  # Huge model (~2.4GB)
            }

            model_name = model_map.get(self.model_type, "sam_b.pt")

            # 加载 SAM 模型
            print(f"[SmartSegmenter] 正在加载 SAM 模型: {model_name}")
            self.model = SAM(model_name)

            self._initialized = True
            print("[SmartSegmenter] SAM 模型加载完成")

        except ImportError as e:
            print(f"[SmartSegmenter] 警告: SAM 依赖未安装 - {e}")
            print("[SmartSegmenter] 请运行: pip install ultralytics torch")
            self._initialized = False
        except Exception as e:
            print(f"[SmartSegmenter] SAM 初始化失败: {e}")
            self._initialized = False

    def is_available(self) -> bool:
        """检查 SAM 是否可用"""
        if not self._initialized:
            self._lazy_init()
        return self._initialized and self.model is not None

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
            print("[SmartSegmenter] SAM 不可用，使用备用分割方法")
            return self._fallback_segment(image, point)

        try:
            # 确保图像是 RGB 格式
            if len(image.shape) == 2:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
            elif image.shape[2] == 4:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
            else:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            # 使用 SAM 进行分割
            results = self.model.predict(
                image_rgb,
                points=[list(point)],
                labels=[point_label],
                verbose=False
            )

            if results and len(results) > 0:
                # 获取最佳掩码
                masks = results[0].masks
                if masks is not None and len(masks.data) > 0:
                    # 选择置信度最高的掩码
                    mask = masks.data[0].cpu().numpy()
                    # 转换为 uint8 格式 (0-255)
                    mask_uint8 = (mask * 255).astype(np.uint8)
                    return mask_uint8

            print("[SmartSegmenter] SAM 未返回有效掩码")
            return self._fallback_segment(image, point)

        except Exception as e:
            print(f"[SmartSegmenter] SAM 分割失败: {e}")
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
            # 使用第一个前景点进行备用分割
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
        备用分割方法：基于颜色相似度的区域生长

        参数:
            image: 输入图像
            point: 种子点坐标
            tolerance: 颜色容差

        返回:
            分割掩码 (uint8, 0-255)
        """
        x, y = int(point[0]), int(point[1])

        # 边界检查
        h, w = image.shape[:2]
        x = max(0, min(w - 1, x))
        y = max(0, min(h - 1, y))

        # 转换为 HSV 进行颜色分割
        if len(image.shape) == 2:
            hsv = cv2.cvtColor(cv2.cvtColor(image, cv2.COLOR_GRAY2BGR), cv2.COLOR_BGR2HSV)
        else:
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

        # 获取种子点颜色
        seed_color = hsv[y, x]

        # 创建颜色范围
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

        # 使用 floodFill 进行区域生长，限制在颜色相似区域
        flood_mask = np.zeros((h + 2, w + 2), np.uint8)
        cv2.floodFill(
            mask.copy(),
            flood_mask,
            (x, y),
            255,
            loDiff=tolerance,
            upDiff=tolerance,
            flags=cv2.FLOODFILL_MASK_ONLY | (255 << 8)
        )

        # 提取填充区域
        result_mask = flood_mask[1:-1, 1:-1] * 255

        # 如果区域太小，返回颜色分割结果
        if np.sum(result_mask > 0) < 50:
            return mask

        return result_mask

    def _fallback_segment_box(
        self,
        image: np.ndarray,
        box: Tuple[int, int, int, int]
    ) -> np.ndarray:
        """
        备用框选分割方法：使用 GrabCut

        参数:
            image: 输入图像
            box: 边界框 (x1, y1, x2, y2)

        返回:
            分割掩码 (uint8, 0-255)
        """
        x1, y1, x2, y2 = box
        h, w = image.shape[:2]

        # 确保边界有效
        x1 = max(0, min(w - 1, x1))
        y1 = max(0, min(h - 1, y1))
        x2 = max(x1 + 1, min(w, x2))
        y2 = max(y1 + 1, min(h, y2))

        # 确保图像是 BGR 格式
        if len(image.shape) == 2:
            img_bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        else:
            img_bgr = image.copy()

        # 初始化掩码
        mask = np.zeros((h, w), np.uint8)

        # GrabCut 需要的临时数组
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)

        # 定义矩形区域
        rect = (x1, y1, x2 - x1, y2 - y1)

        try:
            # 运行 GrabCut
            cv2.grabCut(
                img_bgr,
                mask,
                rect,
                bgd_model,
                fgd_model,
                5,
                cv2.GC_INIT_WITH_RECT
            )

            # 提取前景
            mask_result = np.where(
                (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD),
                255,
                0
            ).astype(np.uint8)

            return mask_result

        except Exception as e:
            print(f"[SmartSegmenter] GrabCut 失败: {e}")
            # 返回简单的矩形掩码
            mask_result = np.zeros((h, w), np.uint8)
            mask_result[y1:y2, x1:x2] = 255
            return mask_result


class CurveLayerManager:
    """
    曲线图层管理器
    管理多个分割图层，支持图层合并、编辑等操作
    """

    def __init__(self, image_shape: Tuple[int, int]):
        """
        初始化图层管理器

        参数:
            image_shape: 图像尺寸 (height, width)
        """
        self.height, self.width = image_shape
        self.layers: Dict[str, Dict] = {}  # 图层字典
        self.layer_order: List[str] = []   # 图层顺序

    def add_layer(
        self,
        name: str,
        mask: np.ndarray,
        color: Tuple[int, int, int] = (255, 0, 0),
        opacity: float = 0.5
    ) -> bool:
        """
        添加新图层

        参数:
            name: 图层名称
            mask: 图层掩码 (uint8, 0-255)
            color: 显示颜色 (R, G, B)
            opacity: 不透明度 (0-1)

        返回:
            是否成功
        """
        if mask.shape[:2] != (self.height, self.width):
            print(f"[LayerManager] 掩码尺寸不匹配: {mask.shape} vs ({self.height}, {self.width})")
            return False

        # 确保掩码是 uint8 格式
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
        """删除图层"""
        if name in self.layers:
            del self.layers[name]
            self.layer_order.remove(name)
            return True
        return False

    def get_layer_mask(self, name: str) -> Optional[np.ndarray]:
        """获取图层掩码"""
        if name in self.layers:
            return self.layers[name]["mask"].copy()
        return None

    def update_layer_mask(self, name: str, mask: np.ndarray) -> bool:
        """更新图层掩码"""
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
        """
        将掩码合并到目标图层

        参数:
            target_name: 目标图层名称
            source_mask: 源掩码
            mode: 合并模式 ('add', 'subtract', 'intersect')

        返回:
            是否成功
        """
        if target_name not in self.layers:
            return False

        target_mask = self.layers[target_name]["mask"]

        if mode == "add":
            # 添加模式：并集
            result = cv2.bitwise_or(target_mask, source_mask)
        elif mode == "subtract":
            # 减去模式：差集
            result = cv2.bitwise_and(target_mask, cv2.bitwise_not(source_mask))
        elif mode == "intersect":
            # 交集模式
            result = cv2.bitwise_and(target_mask, source_mask)
        else:
            return False

        self.layers[target_name]["mask"] = result
        return True

    def apply_brush(
        self,
        layer_name: str,
        center: Tuple[int, int],
        radius: int,
        mode: str = "add"
    ) -> bool:
        """
        应用画笔操作

        参数:
            layer_name: 图层名称
            center: 画笔中心 (x, y)
            radius: 画笔半径
            mode: 模式 ('add' 或 'erase')

        返回:
            是否成功
        """
        if layer_name not in self.layers:
            return False

        mask = self.layers[layer_name]["mask"]
        x, y = int(center[0]), int(center[1])

        if mode == "add":
            cv2.circle(mask, (x, y), radius, 255, -1)
        elif mode == "erase":
            cv2.circle(mask, (x, y), radius, 0, -1)

        return True

    def render_composite(
        self,
        background: np.ndarray,
        selected_layer: Optional[str] = None
    ) -> np.ndarray:
        """
        渲染合成图像

        参数:
            background: 背景图像
            selected_layer: 当前选中的图层（高亮显示）

        返回:
            合成后的图像
        """
        result = background.copy()

        for name in self.layer_order:
            layer = self.layers[name]
            if not layer["visible"]:
                continue

            mask = layer["mask"]
            color = layer["color"]
            opacity = layer["opacity"]

            # 如果是选中图层，增加不透明度
            if name == selected_layer:
                opacity = min(1.0, opacity + 0.2)

            # 创建彩色覆盖层
            overlay = np.zeros_like(result)
            overlay[mask > 127] = color

            # 混合
            mask_3ch = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR) / 255.0
            result = (result * (1 - mask_3ch * opacity) +
                     overlay * mask_3ch * opacity).astype(np.uint8)

        return result

    def get_layer_info(self) -> List[Dict]:
        """获取所有图层信息"""
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

    def set_layer_visibility(self, name: str, visible: bool) -> bool:
        """设置图层可见性"""
        if name in self.layers:
            self.layers[name]["visible"] = visible
            return True
        return False

    def set_layer_opacity(self, name: str, opacity: float) -> bool:
        """设置图层不透明度"""
        if name in self.layers:
            self.layers[name]["opacity"] = max(0.0, min(1.0, opacity))
            return True
        return False

    def export_layer_as_base64(self, name: str) -> Optional[str]:
        """将图层掩码导出为 Base64 PNG"""
        import base64

        if name not in self.layers:
            return None

        mask = self.layers[name]["mask"]

        # 编码为 PNG
        _, buffer = cv2.imencode('.png', mask)
        base64_str = base64.b64encode(buffer).decode('utf-8')

        return f"data:image/png;base64,{base64_str}"

    def import_layer_from_base64(
        self,
        name: str,
        base64_data: str,
        color: Tuple[int, int, int] = (255, 0, 0)
    ) -> bool:
        """从 Base64 PNG 导入图层"""
        import base64

        try:
            # 解析 Base64
            if base64_data.startswith('data:'):
                base64_data = base64_data.split(',')[1]

            img_data = base64.b64decode(base64_data)
            nparr = np.frombuffer(img_data, np.uint8)
            mask = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)

            if mask is None:
                return False

            # 调整尺寸
            if mask.shape[:2] != (self.height, self.width):
                mask = cv2.resize(mask, (self.width, self.height))

            return self.add_layer(name, mask, color)

        except Exception as e:
            print(f"[LayerManager] 导入图层失败: {e}")
            return False


# 全局分割器实例（延迟初始化）
_global_segmenter: Optional[SmartSegmenter] = None


def get_segmenter() -> SmartSegmenter:
    """获取全局分割器实例"""
    global _global_segmenter
    if _global_segmenter is None:
        _global_segmenter = SmartSegmenter()
    return _global_segmenter
