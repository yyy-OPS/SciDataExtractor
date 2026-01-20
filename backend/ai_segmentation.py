"""
AI 分割模块 - 使用 SAM 进行智能分割
简化版本，只使用 SAM，避免 DLL 问题
"""

import cv2
import numpy as np
from typing import Tuple, List, Optional
import base64


class SmartSegmenter:
    """SAM 智能分割器（简化版）"""

    def __init__(self, model_type="sam_b"):
        """
        初始化分割器

        Args:
            model_type: 模型类型，默认 sam_b (base)
        """
        self.model = None
        self.model_type = model_type
        self.device = "cpu"  # 强制使用 CPU
        self.available = False

        try:
            from ultralytics import SAM
            print(f"[SmartSegmenter] 正在加载 SAM 模型: {model_type}")
            self.model = SAM(f"{model_type}.pt")
            self.available = True
            print(f"[SmartSegmenter] SAM 模型加载成功，设备: {self.device}")
        except Exception as e:
            print(f"[SmartSegmenter] 初始化失败: {e}")
            self.available = False

    def is_available(self) -> bool:
        """检查模型是否可用"""
        return self.available

    def get_model_info(self) -> dict:
        """获取模型信息"""
        return {
            "model_type": self.model_type,
            "device": self.device,
            "available": self.available,
            "is_sam2": False
        }

    def segment_click(
        self,
        image: np.ndarray,
        point: Tuple[int, int],
        point_label: int = 1
    ) -> Optional[np.ndarray]:
        """
        基于点击进行分割

        Args:
            image: 输入图像 (BGR)
            point: 点击坐标 (x, y)
            point_label: 1=前景, 0=背景

        Returns:
            二值掩码 (0-255)
        """
        if not self.available:
            return None

        try:
            # SAM 需要 RGB 图像
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            # 调用 SAM 预测
            results = self.model(image_rgb, points=[point], labels=[point_label])

            if results and len(results) > 0:
                # 获取掩码
                masks = results[0].masks
                if masks is not None and len(masks.data) > 0:
                    mask = masks.data[0].cpu().numpy()
                    mask = (mask * 255).astype(np.uint8)
                    return mask

            return None

        except Exception as e:
            print(f"[SmartSegmenter] 分割失败: {e}")
            return None

    def segment_multi_points(
        self,
        image: np.ndarray,
        points: List[Tuple[int, int]],
        labels: List[int]
    ) -> Optional[np.ndarray]:
        """
        基于多个点进行分割

        Args:
            image: 输入图像 (BGR)
            points: 点坐标列表 [(x1, y1), (x2, y2), ...]
            labels: 标签列表 [1, 1, 0, ...] (1=前景, 0=背景)

        Returns:
            二值掩码 (0-255)
        """
        if not self.available:
            return None

        try:
            # SAM 需要 RGB 图像
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            # 调用 SAM 预测
            results = self.model(image_rgb, points=points, labels=labels)

            if results and len(results) > 0:
                # 获取掩码
                masks = results[0].masks
                if masks is not None and len(masks.data) > 0:
                    mask = masks.data[0].cpu().numpy()
                    mask = (mask * 255).astype(np.uint8)
                    return mask

            return None

        except Exception as e:
            print(f"[SmartSegmenter] 多点分割失败: {e}")
            return None


# 全局分割器实例
_segmenter = None


def get_segmenter(model_type="sam_b"):
    """获取全局分割器实例"""
    global _segmenter
    if _segmenter is None:
        _segmenter = SmartSegmenter(model_type)
    return _segmenter
