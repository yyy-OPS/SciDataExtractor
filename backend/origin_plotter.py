"""
Origin绘图模块 - 使用originpro包实现Origin自动化绘图

支持功能:
1. 基础图表绘制 (折线图、散点图、柱状图等)
2. 多层图表
3. 3D图表
4. 数据导入导出
5. 图表模板应用
6. 图表自定义样式
7. 批量处理
8. 图表导出 (PNG, PDF, SVG等)

高级自定义:
- 文件名自定义
- 坐标轴标题、颜色、字体、粗细
- 图表标题、背景色
- 线条颜色、粗细、样式
- 图例位置、显示/隐藏
- 网格线
- 自定义模板

环境要求:
- Windows系统
- Origin 2021或更高版本
- pip install originpro
"""

import sys
import os
import traceback
from typing import List, Dict, Optional, Tuple, Any, Union
from dataclasses import dataclass, field
from enum import Enum
import numpy as np

# Origin是否可用的标记
ORIGIN_AVAILABLE = False
try:
    import originpro as op
    if op is not None:
        ORIGIN_AVAILABLE = True
except ImportError:
    op = None
except Exception:
    op = None


# ==================== 枚举定义 ====================

class GraphType(Enum):
    """Origin图表类型枚举"""
    LINE = "line"
    SCATTER = "scatter"
    LINE_SYMBOL = "line_symbol"
    COLUMN = "column"
    BAR = "bar"
    AREA = "area"
    STACKED_COLUMN = "stacked_column"
    DOUBLE_Y = "double_y"


class ExportFormat(Enum):
    """导出格式枚举"""
    PNG = "png"
    JPG = "jpg"
    PDF = "pdf"
    SVG = "svg"
    EPS = "eps"
    EMF = "emf"


# ==================== 数据类定义 ====================

@dataclass
class OriginGraphConfig:
    """Origin图表完整配置"""
    # 文件名
    filename: str = "plot"              # 不含扩展名

    # 图表基本信息
    graph_type: str = "line"
    template: str = ""                 # Origin模板路径 (.otp)
    width: int = 800
    height: int = 600
    title: str = ""
    show_origin: bool = False          # 是否显示Origin窗口
    export_format: ExportFormat = ExportFormat.PNG  # 导出格式

    # 标题设置
    title_font: str = ""                # 标题字体，空为默认
    title_font_size: int = 0          # 标题字体大小，0为默认
    title_color: str = ""               # 标题颜色，如 "#000000"

    # 背景和边框
    background_color: int = 0          # 背景色 (Origin颜色索引，0=白色)
    page_border: int = 0                # 页面边框，0=无边框

    # 图例设置
    legend_show: bool = True
    legend_position: str = "top-right" # top-right, top-left, bottom-right, bottom-left, center, none

    # 数据曲线设置
    line_color: str = "#1f77b4"         # 线条颜色
    line_width: float = 1.5              # 线宽
    line_style: int = 0                  # 线型 (0=实线, 1=虚线, 2=点线等)
    symbol_type: int = 0                # 符号类型 (0=无, 1=方, 2=圆等)
    symbol_size: int = 10                # 符号大小
    symbol_color: str = ""               # 符号颜色（与line_color相同则留空）
    symbol_interior: int = 0            # 符号填充

    # 坐标轴设置
    x_title: str = "X"
    y_title: str = "Y"
    x_title_font: str = ""
    y_title_font: str = ""
    x_title_color: str = ""
    y_title_color: str = ""
    x_title_size: int = 0
    y_title_size: int = 0

    # 刻度标签设置
    x_tick_font: str = ""
    y_tick_font: str = ""
    x_tick_color: str = ""
    y_tick_color: str = ""
    x_tick_size: int = 0
    y_tick_size: int = 0

    # 坐标轴范围
    x_min: Optional[float] = None
    x_max: Optional[float] = None
    y_min: Optional[float] = None
    y_max: Optional[float] = None

    # 坐标轴刻度类型
    x_scale_type: int = 1             # 1=线性, 2=Log10, 3=Log2, 4=Ln
    y_scale_type: int = 1

    # 网格线
    show_grid: bool = True
    grid_color: str = ""                 # 网格线颜色

    # 轴线
    x_axis_color: str = ""
    y_axis_color: str = ""
    x_axis_width: float = 1
    y_axis_width: float = 1

    # 对侧轴线
    show_opposite_x: bool = False
    show_opposite_y: bool = False

    # 抗锯齿
    anti_alias: bool = True


# ==================== Origin绘图器类 ====================

class OriginPlotter:
    """
    Origin绘图器主类 - 支持完整的图表自定义
    """

    def __init__(self, show_origin: bool = False):
        """
        初始化Origin绘图器
        """
        self.show_origin = show_origin
        self._connected = False
        self._current_graph = None
        self._current_workbook = None

        if not ORIGIN_AVAILABLE:
            raise ImportError("originpro包未安装或无法连接到Origin")

        # 设置异常钩子
        self._setup_exception_hook()

        # 连接到Origin
        self._connect()

    def _setup_exception_hook(self):
        """设置异常钩子，确保Origin实例正确关闭"""
        if not hasattr(sys, '_origin_hook_set'):
            def origin_shutdown_exception_hook(exctype, value, tb):
                try:
                    self.close()
                except:
                    pass
                sys.__excepthook__(exctype, value, tb)

            sys.excepthook = origin_shutdown_exception_hook
            sys._origin_hook_set = True

    def _connect(self):
        """连接到Origin实例"""
        try:
            if op.oext:
                op.set_show(self.show_origin)
                self._connected = True
        except Exception as e:
            print(f"[Origin] 连接Origin时出现警告: {e}")
            self._connected = True  # 尝试继续执行

    def create_worksheet(self, x_data: List[float], y_data: List[float],
                        x_name: str = "X", y_name: str = "Y") -> Any:
        """
        创建Origin工作表并导入数据
        """
        wks = op.new_sheet('w')
        book = wks.get_book()
        book.lname = "Data"

        # 设置列数
        wks.cols = 2

        # 导入数据
        wks.from_list(0, x_data)
        wks.from_list(1, y_data)

        # 设置列属性
        wks.set_label(0, x_name, 'L')  # Long Name
        wks.set_label(0, '', 'U')  # Units
        wks.cols_axis('X', c1=0)
        wks.set_label(1, y_name, 'L')  # Long Name
        wks.set_label(1, '', 'U')  # Units
        wks.cols_axis('Y', c1=1)

        self._current_workbook = wks
        return wks

    def plot_with_config(self, x_data: List[float], y_data: List[float],
                       config: OriginGraphConfig) -> Dict[str, Any]:
        """
        使用完整配置绘制图表

        Args:
            x_data: X轴数据
            y_data: Y轴数据
            config: OriginGraphConfig 完整配置

        Returns:
            包含结果信息的字典
        """
        import time
        import shutil

        result = {
            "success": False,
            "message": "",
            "image_path": "",
            "project_path": "",
            "image_url": "",
            "project_url": "",
            "debug_info": {}
        }

        try:
            print(f"[Origin Plot] 开始绘图，数据点数: {len(x_data)}")

            # 创建工作表
            wks = self.create_worksheet(x_data, y_data, config.x_title, config.y_title)
            print(f"[Origin Plot] 工作表创建成功")

            # 创建图表
            template = config.template if config.template else self._get_template_name(config.graph_type)
            graph = op.new_graph(template=template)
            graph.lname = "PlotGraph"
            print(f"[Origin Plot] 图表创建成功，模板: {template}")

            # 获取图层
            layer = graph[0]

            # 添加数据曲线
            plot_type_code = self._get_plot_type_code(config.graph_type)
            plot = layer.add_plot(wks, coly=1, colx=0, type=plot_type_code)
            print(f"[Origin Plot] 数据曲线添加成功，类型代码: {plot_type_code}")

            # 先应用用户配置（在rescale之前）
            self._apply_full_config(graph, layer, plot, wks, config)

            # 刷新图层
            layer.rescale()

            # 在导出前再次应用关键配置（确保覆盖模板）
            self._apply_user_config_final(graph, layer, plot, config)

            # 导出文件
            output_dir = os.path.abspath("outputs")
            os.makedirs(output_dir, exist_ok=True)

            # 使用用户指定的文件名
            base_filename = config.filename or "plot"

            # 导出图片 - 转换路径为正斜杠（LabTalk兼容）
            image_ext = config.export_format.value if hasattr(config, 'export_format') else "png"
            image_filename = f"{base_filename}.{image_ext}"
            image_path_abs = os.path.join(output_dir, image_filename)

            # 转换为LabTalk兼容路径（正斜杠，转义反斜杠）
            image_path_labtalk = image_path_abs.replace("\\", "/")

            print(f"[Origin Plot] 导出图片到: {image_path_abs}")
            print(f"[Origin Plot] LabTalk路径: {image_path_labtalk}")

            # 使用多种方法尝试导出图片
            image_exported = False

            # 方法1: 使用graph对象的save_fig方法
            try:
                graph.save_fig(image_path_abs)
                print(f"[Origin Plot] save_fig成功")
                image_exported = True
            except Exception as e1:
                print(f"[Origin Plot] save_fig失败: {e1}")

                # 方法2: 使用op.lt_exec LabTalk命令
                try:
                    if image_ext == "png":
                        op.lt_exec(f'page.save_fig("{image_path_labtalk}", 1)')
                    elif image_ext == "pdf":
                        op.lt_exec(f'page.export.pdf("{image_path_labtalk}", 1)')
                    elif image_ext == "svg":
                        op.lt_exec(f'page.export.svg("{image_path_labtalk}", 1)')
                    elif image_ext == "emf":
                        op.lt_exec(f'page.export.emf("{image_path_labtalk}", 1)')
                    elif image_ext == "eps":
                        op.lt_exec(f'page.export.eps("{image_path_labtalk}", 1)')
                    else:
                        op.lt_exec(f'page.save_fig("{image_path_labtalk}", 1)')
                    print(f"[Origin Plot] LabTalk导出成功")
                    image_exported = True
                except Exception as e2:
                    print(f"[Origin Plot] LabTalk导出失败: {e2}")

                    # 方法3: 尝试使用Origin用户目录
                    try:
                        user_dir = op.path('u')
                        fallback_path = os.path.join(user_dir, image_filename).replace("\\", "/")
                        op.lt_exec(f'page.save_fig("{fallback_path}", 1)')
                        time.sleep(0.5)  # 等待文件写入
                        if os.path.exists(os.path.join(user_dir, image_filename)):
                            shutil.copy(os.path.join(user_dir, image_filename), image_path_abs)
                            image_exported = True
                            print(f"[Origin Plot] 从用户目录复制成功")
                    except Exception as e3:
                        print(f"[Origin Plot] 用户目录方法失败: {e3}")

            # 等待图片文件写入
            time.sleep(0.5)

            # 保存项目文件 - 修复空白问题
            project_filename = f"{base_filename}.opju"
            project_path_abs = os.path.join(output_dir, project_filename)

            print(f"[Origin Plot] 保存项目到: {project_path_abs}")

            project_exported = False

            # 在保存前确保图表已刷新并激活
            try:
                graph.set_int('su', 1)  # 刷新图表
                op.lt_exec('doc -uw')  # 等待所有操作完成
                op.lt_exec('win -a graph')  # 激活图表窗口
            except:
                pass

            # 转换路径格式 - 使用双引号包围路径
            project_path_escaped = project_path_abs.replace("\\", "\\\\")

            # 方法1: 使用op.save (Python API)
            try:
                print(f"[Origin Plot] 尝试使用 op.save")
                op.save(project_path_abs)
                time.sleep(1)  # 等待文件写入
                if os.path.exists(project_path_abs):
                    project_size = os.path.getsize(project_path_abs)
                    if project_size > 1000:
                        print(f"[Origin Plot] op.save成功，文件大小: {project_size} bytes")
                        project_exported = True
                    else:
                        print(f"[Origin Plot] op.save文件过小: {project_size} bytes")
                else:
                    print(f"[Origin Plot] op.save后文件不存在")
            except Exception as e1:
                print(f"[Origin Plot] op.save失败: {e1}")

            # 方法2: 如果op.save失败，尝试LabTalk saveAs命令
            if not project_exported:
                try:
                    print(f"[Origin Plot] 尝试使用LabTalk saveAs命令")
                    # 使用saveAs而不是save，saveAs需要完整路径
                    project_path_labtalk = project_path_abs.replace("\\", "/")
                    op.lt_exec(f'saveAs -o "{project_path_labtalk}"')
                    time.sleep(1.5)  # 给更多时间
                    if os.path.exists(project_path_abs):
                        project_size = os.path.getsize(project_path_abs)
                        print(f"[Origin Plot] saveAs成功，文件大小: {project_size} bytes")
                        if project_size > 1000:
                            project_exported = True
                except Exception as e2:
                    print(f"[Origin Plot] saveAs失败: {e2}")

            # 方法3: 尝试导出为OPJU格式
            if not project_exported:
                try:
                    print(f"[Origin Plot] 尝试使用导出命令")
                    project_path_labtalk = project_path_abs.replace("\\", "/")
                    op.lt_exec(f'doc -e DOPJ "{project_path_labtalk}"')
                    time.sleep(1.5)
                    if os.path.exists(project_path_abs):
                        project_size = os.path.getsize(project_path_abs)
                        print(f"[Origin Plot] 导出成功，文件大小: {project_size} bytes")
                        if project_size > 1000:
                            project_exported = True
                except Exception as e3:
                    print(f"[Origin Plot] 导出失败: {e3}")

            # 验证文件大小（空文件通常小于1000字节）
            if os.path.exists(project_path_abs):
                project_size = os.path.getsize(project_path_abs)
                print(f"[Origin Plot] 最终项目文件大小: {project_size} bytes")
                if project_size < 1000:
                    print(f"[Origin Plot] 警告: 项目文件可能为空!")
                    project_exported = False

            # 验证文件是否存在
            image_exists = os.path.exists(image_path_abs)
            project_exists = os.path.exists(project_path_abs)

            print(f"[Origin Plot] 文件验证 - 图片存在: {image_exists}, 项目存在: {project_exists}")

            # 获取文件大小用于调试
            if image_exists:
                image_size = os.path.getsize(image_path_abs)
                print(f"[Origin Plot] 图片大小: {image_size} bytes")
                result["debug_info"]["image_size"] = image_size
            if project_exists:
                project_size = os.path.getsize(project_path_abs)
                print(f"[Origin Plot] 项目大小: {project_size} bytes")
                result["debug_info"]["project_size"] = project_size

            # 如果本地文件不存在，尝试从Origin用户目录查找
            if not image_exists or not project_exists:
                print(f"[Origin Plot] 本地文件缺失，尝试从Origin用户目录查找")
                try:
                    user_dir = op.path('u')
                    user_image_path = os.path.join(user_dir, image_filename)
                    user_project_path = os.path.join(user_dir, project_filename)

                    if os.path.exists(user_image_path) and not image_exists:
                        shutil.copy(user_image_path, image_path_abs)
                        image_exists = True
                        print(f"[Origin Plot] 从用户目录复制图片: {user_image_path}")

                    if os.path.exists(user_project_path) and not project_exists:
                        shutil.copy(user_project_path, project_path_abs)
                        project_exists = True
                        print(f"[Origin Plot] 从用户目录复制项目: {user_project_path}")
                except Exception as e:
                    print(f"[Origin Plot] 用户目录查找失败: {e}")

            # 生成URL路径
            image_url = f"/outputs/{image_filename}"
            project_url = f"/outputs/{project_filename}"

            # 检查是否至少有一个文件成功生成
            success = image_exists or project_exists

            result.update({
                "success": success,
                "message": f"绘制完成 - 图片: {'成功' if image_exists else '失败'}, 项目: {'成功' if project_exists else '失败'}",
                "image_path": image_filename if image_exists else "",
                "project_path": project_filename if project_exists else "",
                "image_url": image_url if image_exists else "",
                "project_url": project_url if project_exists else "",
                "debug_info": {
                    "abs_image_path": image_path_abs,
                    "abs_project_path": project_path_abs,
                    "image_exists": image_exists,
                    "project_exists": project_exists,
                    "origin_user_dir": op.path('u') if hasattr(op, 'path') else "N/A",
                    "data_points": len(x_data)
                }
            })

            self._current_graph = graph

        except Exception as e:
            import traceback
            error_msg = f"绘图失败: {str(e)}"
            result["message"] = error_msg
            result["debug_info"] = {"error": str(e), "traceback": traceback.format_exc()}
            print(f"[Origin Plot] 异常: {e}\n{traceback.format_exc()}")

        return result

    def _get_template_name(self, graph_type: str) -> str:
        """获取图表模板名称"""
        template_map = {
            "line": "line",
            "scatter": "scatter",
            "line_symbol": "linesymb",
            "column": "column",
            "bar": "bar",
            "stacked_column": "StackColumn",
            "double_y": "doubley",
        }
        return template_map.get(graph_type, "origin")

    def _get_plot_type_code(self, graph_type: str) -> int:
        """获取Origin绘图类型代码"""
        type_map = {
            "line": 200,           # Line
            "scatter": 201,        # Scatter
            "line_symbol": 202,    # Line+Symbol
            "column": 203,         # Column
            "bar": 204,            # Bar
            "area": 205,           # Area
            "stacked_column": 203, # Column (堆叠用其他方式)
        }
        return type_map.get(graph_type, 200)

    def _apply_full_config(self, graph, layer, plot, wks, config: OriginGraphConfig):
        """应用完整的图表配置

        优先级：用户自定义参数 > 模板参数 > 默认参数
        """

        # 1. 设置页面属性
        try:
            if config.anti_alias:
                graph.set_int('aa', 1)
        except:
            pass
        try:
            if config.page_border > 0:
                graph.set_int('border', config.page_border)
        except:
            pass

        # 2. 设置图表标题（用户自定义会覆盖模板）
        if config.title:
            try:
                layer.lt_exec(f'layer -t "{config.title}"')
                print(f"[Origin] 设置图表标题: {config.title}")
            except Exception as e:
                print(f"[Origin] 设置标题失败: {e}")

        # 3. 设置背景色
        if config.background_color != 0:
            try:
                graph.set_int('color', config.background_color)
            except:
                pass

        # 4. 配置X轴（用户自定义会覆盖模板）
        self._apply_axis_config_full(layer, 'x', config)

        # 5. 配置Y轴（用户自定义会覆盖模板）
        self._apply_axis_config_full(layer, 'y', config)

        # 6. 配置曲线样式（用户自定义会覆盖模板）
        self._apply_plot_style(plot, config)

        # 7. 配置图例（用户自定义会覆盖模板）
        self._apply_legend_config(graph, layer, config)

        # 8. 重置坐标轴范围
        try:
            layer.rescale()
        except:
            pass

    def _apply_user_config_final(self, graph, layer, plot, config: OriginGraphConfig):
        """
        在导出前最后应用用户配置，强制覆盖模板设置

        参考成功的 plot.color = value 模式来设置所有参数
        使用 set_int/set_float 方法确保设置能够生效
        """
        print(f"[Origin] ========== 应用最终用户配置（覆盖模板） ==========")

        # 1. 设置曲线颜色 - 这个是成功的，保持不变
        if config.line_color:
            try:
                plot.color = config.line_color
                print(f"[Origin] ✓ 设置曲线颜色: {config.line_color}")
            except Exception as e:
                print(f"[Origin] ✗ 设置曲线颜色失败: {e}")

        # 2. 设置线宽 - 使用和 color 相同的方式
        if config.line_width:
            try:
                plot.width = config.line_width
                print(f"[Origin] ✓ 设置线宽: {config.line_width}")
            except Exception as e:
                print(f"[Origin] ✗ 设置线宽失败: {e}")

        # 3. 设置网格线 - 使用 set_int 方法（更可靠）
        if config.show_grid is not None:
            try:
                # X轴网格 - major grid
                layer.set_int('x.grid.major.show', 1 if config.show_grid else 0)
                layer.set_int('x.grid.minor.show', 0)
                print(f"[Origin] ✓ 设置X轴网格线: {config.show_grid}")
            except Exception as e:
                print(f"[Origin] ✗ 设置X轴网格线失败: {e}")

            try:
                # Y轴网格 - major grid
                layer.set_int('y.grid.major.show', 1 if config.show_grid else 0)
                layer.set_int('y.grid.minor.show', 0)
                print(f"[Origin] ✓ 设置Y轴网格线: {config.show_grid}")
            except Exception as e:
                print(f"[Origin] ✗ 设置Y轴网格线失败: {e}")

        # 4. 设置X轴标题 - 使用 set_str 方法
        if config.x_title:
            try:
                layer.set_str('x.label.text', config.x_title)
                print(f"[Origin] ✓ 设置X轴标题: {config.x_title}")
            except Exception as e:
                print(f"[Origin] ✗ 设置X轴标题失败: {e}")

        # 5. 设置Y轴标题
        if config.y_title:
            try:
                layer.set_str('y.label.text', config.y_title)
                print(f"[Origin] ✓ 设置Y轴标题: {config.y_title}")
            except Exception as e:
                print(f"[Origin] ✗ 设置Y轴标题失败: {e}")

        # 6. 设置图表标题
        if config.title:
            try:
                layer.set_str('legend.text', config.title)
                print(f"[Origin] ✓ 设置图表标题: {config.title}")
            except Exception as e:
                # 尝试另一种方式
                try:
                    layer.lt_exec(f'layer -t "{config.title}"')
                    print(f"[Origin] ✓ 设置图表标题(备用方法): {config.title}")
                except Exception as e2:
                    print(f"[Origin] ✗ 设置图表标题失败: {e2}")

        # 7. 设置坐标轴范围（如果用户指定）
        if config.x_min is not None or config.x_max is not None:
            try:
                x_min = config.x_min if config.x_min is not None else layer.get_float('x.from')
                x_max = config.x_max if config.x_max is not None else layer.get_float('x.to')
                layer.set_float('x.from', x_min)
                layer.set_float('x.to', x_max)
                print(f"[Origin] ✓ 设置X轴范围: [{x_min}, {x_max}]")
            except Exception as e:
                print(f"[Origin] ✗ 设置X轴范围失败: {e}")

        if config.y_min is not None or config.y_max is not None:
            try:
                y_min = config.y_min if config.y_min is not None else layer.get_float('y.from')
                y_max = config.y_max if config.y_max is not None else layer.get_float('y.to')
                layer.set_float('y.from', y_min)
                layer.set_float('y.to', y_max)
                print(f"[Origin] ✓ 设置Y轴范围: [{y_min}, {y_max}]")
            except Exception as e:
                print(f"[Origin] ✗ 设置Y轴范围失败: {e}")

        # 8. 强制刷新图表显示
        try:
            graph.set_int('su', 1)
            print(f"[Origin] ✓ 强制刷新图表")
        except:
            pass

        print(f"[Origin] ========== 用户配置应用完成 ==========")

    def _apply_axis_config_full(self, layer, axis_name: str, config: OriginGraphConfig):
        """应用完整的坐标轴配置

        使用 set_int/set_str/set_float 方法确保用户自定义参数覆盖模板设置
        优先级：用户自定义参数 > 模板参数 > 默认参数
        """
        # 标题 - 使用 set_str 方法
        title = getattr(config, f'{axis_name}_title', '')
        if title:
            try:
                layer.set_str(f'{axis_name}.label.text', title)
                print(f"[Origin] 设置{axis_name.upper()}轴标题: {title}")
            except Exception as e:
                print(f"[Origin] 设置{axis_name.upper()}轴标题失败: {e}")

        # 网格线 - 使用 set_int 方法
        try:
            if config.show_grid:
                layer.set_int(f'{axis_name}.grid.major.show', 1)
                layer.set_int(f'{axis_name}.grid.minor.show', 0)
                print(f"[Origin] 设置{axis_name.upper()}轴网格线: 显示")
            else:
                layer.set_int(f'{axis_name}.grid.major.show', 0)
                print(f"[Origin] 设置{axis_name.upper()}轴网格线: 隐藏")
        except Exception as e:
            print(f"[Origin] 设置{axis_name.upper()}轴网格线失败: {e}")

        # 标题颜色
        title_color = getattr(config, f'{axis_name}_title_color', '')
        if title_color:
            try:
                layer.set_int(f'{axis_name}.label.color', int(title_color, 16) if title_color.startswith('#') else title_color)
                print(f"[Origin] 设置{axis_name.upper()}轴标题颜色: {title_color}")
            except:
                pass

        # 轴线颜色
        axis_color = getattr(config, f'{axis_name}_axis_color', '')
        if axis_color:
            try:
                layer.set_int(f'{axis_name}.color', int(axis_color, 16) if axis_color.startswith('#') else axis_color)
            except:
                pass

        # 轴线宽度
        axis_width = getattr(config, f'{axis_name}_axis_width', 1)
        if axis_width != 1:
            try:
                layer.set_int(f'{axis_name}.width', axis_width)
            except:
                pass

        # 刻度范围 - 用户自定义优先
        min_val = getattr(config, f'{axis_name}_min', None)
        max_val = getattr(config, f'{axis_name}_max', None)
        if min_val is not None or max_val is not None:
            try:
                layer.set_float(f'{axis_name}.from',
                              min_val if min_val is not None else layer.get_float(f'{axis_name}.from'))
                layer.set_float(f'{axis_name}.to',
                              max_val if max_val is not None else layer.get_float(f'{axis_name}.to'))
                print(f"[Origin] 设置{axis_name.upper()}轴范围: [{min_val}, {max_val}]")
            except Exception as e:
                print(f"[Origin] 设置{axis_name.upper()}轴范围失败: {e}")

        # 刻度类型
        scale_type = getattr(config, f'{axis_name}_scale_type', 1)
        if scale_type != 1:
            try:
                layer.set_int(f'{axis_name}.type', scale_type)
            except:
                pass

        # 对侧轴线
        show_opposite = getattr(config, f'show_opposite_{axis_name}', False)
        if show_opposite:
            try:
                layer.set_int(f'{axis_name}.opposite.show', 1)
            except:
                pass

    def _apply_plot_style(self, plot, config: OriginGraphConfig):
        """应用曲线样式配置

        参考 plot.color = value 的成功模式，使用直接属性赋值
        """
        # 线条颜色 - 总是应用用户选择的颜色（这个是成功的模式）
        if config.line_color:
            try:
                plot.color = config.line_color
                print(f"[Origin] 设置线条颜色: {config.line_color}")
            except Exception as e:
                print(f"[Origin] 设置线条颜色失败: {e}")

        # 线宽 - 使用和 color 相同的直接赋值方式
        if config.line_width:
            try:
                plot.width = config.line_width
                print(f"[Origin] 设置线宽: {config.line_width}")
            except Exception as e:
                print(f"[Origin] 设置线宽失败: {e}")

        # 线型 - 尝试直接赋值
        if config.line_style != 0:
            try:
                plot.connect = config.line_style
            except:
                try:
                    plot.set_int('connect', config.line_style)
                except:
                    pass

        # 符号 - 保持直接属性赋值
        if config.symbol_type > 0:
            try:
                plot.symbol_kind = config.symbol_type
                plot.symbol_size = config.symbol_size
                if config.symbol_color:
                    plot.symbol_color = config.symbol_color or config.line_color
                if config.symbol_interior > 0:
                    plot.symbol_interior = config.symbol_interior
            except:
                pass

    def _apply_legend_config(self, graph, layer, config: OriginGraphConfig):
        """配置图例"""
        try:
            # 尝试获取图例，如果模板中没有图例则返回None
            legend = layer.label('Legend')

            if legend is None:
                print(f"[Origin] 模板中没有图例，跳过图例配置")
                return

            if not config.legend_show:
                try:
                    legend.remove()
                except:
                    pass
                return

            # 设置图例位置
            pos_map = {
                'top-right': (1, 1),
                'top-left': (0, 1),
                'bottom-right': (1, 0),
                'bottom-left': (0, 0),
                'center': (0.5, 0.5),
                'none': (-999, -999)
            }

            if config.legend_position in pos_map:
                x, y = pos_map[config.legend_position]
                if config.legend_position != 'none':
                    # Origin使用相对坐标 (0-1)
                    try:
                        legend.set_int('left', int(x * 10000))
                        legend.set_int('top', int((1 - y) * 10000))
                    except:
                        pass

            # 移除边框
            try:
                legend.set_int('showframe', 0)
            except:
                pass

        except Exception as e:
            print(f"[Origin] 配置图例时出错: {e}")

    def execute_labtalk(self, command: str) -> bool:
        """执行LabTalk脚本命令"""
        try:
            op.lt_exec(command)
            return True
        except Exception as e:
            print(f"[Origin] LabTalk执行失败: {e}")
            return False

    def close(self):
        """关闭Origin连接"""
        if self._connected:
            try:
                op.exit()
            except:
                pass
            self._connected = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def is_connected(self) -> bool:
        """检查是否连接到Origin"""
        return self._connected


# ==================== 便捷函数 ====================

def check_origin_status() -> Dict[str, Any]:
    """检查Origin状态"""
    result = {
        "available": ORIGIN_AVAILABLE,
        "version": "unknown",
        "can_connect": False,
        "message": ""
    }

    if not ORIGIN_AVAILABLE:
        result["message"] = "originpro包未安装。请运行: pip install originpro"
        return result

    try:
        can_connect_to_origin = hasattr(op, 'oext') and op.oext is not None

        if can_connect_to_origin:
            result["can_connect"] = True
            result["message"] = "Origin可用，可以绘图"
            try:
                result["version"] = getattr(op, '__version__', '1.1.14')
            except:
                result["version"] = "1.1.14"
        else:
            result["message"] = "originpro包已安装，但无法连接到Origin。请确保Origin 2022已安装并可以启动"
            result["available"] = True
    except Exception as e:
        result["message"] = f"检查Origin时出错: {str(e)}"
        result["available"] = True

    return result


def plot_with_origin(x_data: List[float], y_data: List[float],
                      config: OriginGraphConfig) -> Dict[str, Any]:
    """
    使用Origin绘制数据的便捷函数

    Args:
        x_data: X轴数据
        y_data: Y轴数据
        config: OriginGraphConfig 配置对象
    """
    try:
        with OriginPlotter(show_origin=config.show_origin) as plotter:
            return plotter.plot_with_config(x_data, y_data, config)
    except Exception as e:
        import traceback
        return {
            "success": False,
            "message": f"Origin绘图失败: {str(e)}",
            "debug_info": {"traceback": traceback.format_exc()}
        }


__all__ = [
    'OriginPlotter',
    'OriginGraphConfig',
    'check_origin_status',
    'plot_with_origin',
    'ORIGIN_AVAILABLE'
]
