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
    # 检查是否可以连接到Origin
    if op and op.oext:
        ORIGIN_AVAILABLE = True
except ImportError:
    op = None
except Exception:
    op = None


# ==================== 枚举定义 ====================

class GraphType(Enum):
    """Origin图表类型枚举"""
    LINE = "line"                      # 折线图
    SCATTER = "scatter"                # 散点图
    LINE_SYMBOL = "line_symbol"        # 线符号图
    COLUMN = "column"                  # 柱状图
    BAR = "bar"                        # 条形图
    AREA = "area"                      # 面积图
    PIE = "pie"                        # 饼图
    PIE_3D = "pie_3d"                  # 3D饼图
    CONTOUR = "contour"                # 等高线图
    HEATMAP = "heatmap"                # 热图
    SURFACE = "surface"                # 3D曲面图
    SURFACE_COLORMAP = "surface_colormap"  # 3D彩色曲面
    XYZ_CONTOUR = "xyz_contour"        # XYZ等高线
    TRI_CONTOUR = "tri_contour"        # 三角网格等高线
    POLAR = "polar"                    # 极坐标图
    SMITH = "smith"                    # 史密斯图
    WATERFALL = "waterfall"            # 瀑布图
    STACKED_COLUMN = "stacked_column"  # 堆叠柱状图
    DOUBLE_Y = "double_y"              # 双Y轴图
    DOUBLE_X = "double_x"              # 双X轴图
    MULTI_PANEL = "multi_panel"        # 多面板图
    HIGHLIGHT = "highlight"            # 高亮图


class ExportFormat(Enum):
    """导出格式枚举"""
    PNG = "png"
    JPG = "jpg"
    PDF = "pdf"
    SVG = "svg"
    EPS = "eps"
    EMF = "emf"
    TIFF = "tiff"


class ScaleType(Enum):
    """坐标轴类型枚举"""
    LINEAR = 1      # 线性坐标
    LOG10 = 2       # 以10为底的对数坐标
    LOG2 = 3        # 以2为底的对数坐标
    LN = 4          # 自然对数坐标
    PROBABILITY = 5 # 概率坐标
    PROBIT = 6      # Probit坐标


# ==================== 数据类定义 ====================

@dataclass
class DataColumn:
    """数据列定义"""
    name: str
    data: List[float]
    units: str = ""
    comments: str = ""
    axis: str = "Y"  # X, Y, Z, E(误差), Label(标签)


@dataclass
class WorksheetData:
    """工作表数据"""
    name: str = "Data"
    columns: List[DataColumn] = field(default_factory=list)

    def to_dict(self) -> Dict:
        """转换为字典格式，便于传输"""
        return {
            "name": self.name,
            "columns": [
                {
                    "name": col.name,
                    "data": col.data,
                    "units": col.units,
                    "comments": col.comments,
                    "axis": col.axis
                }
                for col in self.columns
            ]
        }


@dataclass
class PlotStyle:
    """绘图样式配置"""
    color: str = "#1f77b4"           # 颜色 (支持RGB、十六进制、颜色名)
    symbol_type: int = 0             # 符号类型 (0=无, 1=方, 2=圆, 3=三角等)
    symbol_size: int = 10            # 符号大小
    line_width: float = 1.5          # 线宽
    line_style: int = 0              # 线型 (0=实线, 1=虚线, 2=点线等)
    fill_color: str = ""             # 填充颜色
    transparency: float = 0.0        # 透明度 (0-1)
    show_labels: bool = False        # 是否显示标签
    label_format: str = ""           # 标签格式


@dataclass
class AxisConfig:
    """坐标轴配置"""
    title: str = ""
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    scale_type: ScaleType = ScaleType.LINEAR
    show_grid: bool = True
    show_ticks: bool = True
    tick_format: str = ""
    log_major_ticks: int = 9
    opposite_axis: bool = False  # 是否显示对侧轴线


@dataclass
class GraphConfig:
    """图表配置"""
    name: str = "Graph"
    width: int = 800
    height: int = 600
    title: str = ""
    legend_show: bool = True
    legend_position: str = "top-right"  # top-right, top-left, bottom-right, bottom-left, center
    background_color: int = 0  # 0=白色, 其他值见Origin颜色索引
    x_axis: AxisConfig = field(default_factory=AxisConfig)
    y_axis: AxisConfig = field(default_factory=AxisConfig)
    z_axis: Optional[AxisConfig] = None
    anti_alias: bool = True


@dataclass
class PlotRequest:
    """绘图请求"""
    data: Union[WorksheetData, List[WorksheetData]]
    graph_type: GraphType = GraphType.LINE
    template: str = ""
    config: GraphConfig = field(default_factory=GraphConfig)
    plot_styles: List[PlotStyle] = field(default_factory=list)
    export_format: ExportFormat = ExportFormat.PNG
    export_dpi: int = 300


# ==================== Origin绘图器类 ====================

class OriginPlotter:
    """
    Origin绘图器主类

    使用示例:
        >>> plotter = OriginPlotter()
        >>> data = WorksheetData(
        ...     name="MyData",
        ...     columns=[
        ...         DataColumn("X", [1,2,3,4,5]),
        ...         DataColumn("Y", [10,20,15,25,30])
        ...     ]
        ... )
        >>> result = plotter.plot(data, GraphType.LINE)
        >>> print(result.image_path)
        >>> plotter.close()
    """

    def __init__(self, show_origin: bool = False):
        """
        初始化Origin绘图器

        Args:
            show_origin: 是否显示Origin窗口 (开发调试时建议True)
        """
        self.show_origin = show_origin
        self._connected = False
        self._current_graph = None
        self._current_workbook = None

        if not ORIGIN_AVAILABLE:
            raise ImportError(
                "originpro包未安装或无法连接到Origin。\n"
                "请确保: 1) 已安装Origin 2021或更高版本 2) 运行 pip install originpro"
            )

        # 设置异常钩子确保Origin正确关闭
        self._setup_exception_hook()

        # 连接到Origin
        self._connect()

    def _setup_exception_hook(self):
        """设置异常钩子，确保Origin实例在异常时正确关闭"""
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
            raise ConnectionError(f"无法连接到Origin: {str(e)}")

    def create_worksheet(self, data: WorksheetData) -> Any:
        """
        创建Origin工作表并导入数据

        Args:
            data: WorksheetData对象

        Returns:
            Origin工作表对象
        """
        if not self._connected:
            raise RuntimeError("未连接到Origin")

        # 创建新工作簿
        wks = op.new_sheet('w')
        book = wks.get_book()
        book.lname = data.name

        # 设置列数
        wks.cols = len(data.columns)

        # 导入数据
        for col_idx, column in enumerate(data.columns):
            # 设置列数据
            wks.from_list(col_idx, column.data)

            # 设置列属性
            if column.name:
                wks.set_label(col_idx, column.name, 'L')  # Long Name
            if column.units:
                wks.set_label(col_idx, column.units, 'U')  # Units
            if column.comments:
                wks.set_label(col_idx, column.comments, 'C')  # Comments

            # 设置轴类型
            if column.axis in ['X', 'Y', 'Z', 'E']:
                wks.cols_axis(column.axis, c1=col_idx)

        self._current_workbook = wks
        return wks

    def plot(self, request: PlotRequest) -> Dict[str, Any]:
        """
        执行绘图操作

        Args:
            request: PlotRequest绘图请求对象

        Returns:
            包含结果信息的字典
        """
        if not self._connected:
            raise RuntimeError("未连接到Origin")

        result = {
            "success": False,
            "message": "",
            "image_path": "",
            "project_path": "",
            "graph_name": ""
        }

        try:
            # 处理数据 - 支持单个或多个工作表
            if isinstance(request.data, WorksheetData):
                worksheets = [request.data]
            else:
                worksheets = request.data

            # 根据图表类型绘图
            graph = self._create_graph(request, worksheets)

            # 应用样式配置
            self._apply_graph_config(graph, request.config)

            # 导出图表
            output_dir = "outputs"
            os.makedirs(output_dir, exist_ok=True)

            base_name = request.config.name or f"plot_{request.graph_type.value}"

            # 导出图片
            if request.export_format == ExportFormat.PNG:
                image_path = os.path.join(output_dir, f"{base_name}.png")
                graph.save_fig(image_path, width=request.config.width)
            elif request.export_format == ExportFormat.PDF:
                image_path = os.path.join(output_dir, f"{base_name}.pdf")
                graph.save_fig(image_path)
            elif request.export_format == ExportFormat.SVG:
                image_path = os.path.join(output_dir, f"{base_name}.svg")
                graph.save_fig(image_path)
            else:
                image_path = os.path.join(output_dir, f"{base_name}.{request.export_format.value}")
                graph.save_fig(image_path)

            # 保存项目文件
            project_path = os.path.join(output_dir, f"{base_name}.opju")
            op.save(project_path)

            result.update({
                "success": True,
                "message": f"成功绘制 {request.graph_type.value} 图表",
                "image_path": image_path,
                "project_path": project_path,
                "graph_name": request.config.name
            })

            self._current_graph = graph

        except Exception as e:
            result["message"] = f"绘图失败: {str(e)}\n{traceback.format_exc()}"

        return result

    def _create_graph(self, request: PlotRequest, worksheets: List[WorksheetData]) -> Any:
        """根据图表类型创建图表"""
        graph_type = request.graph_type

        # 确定模板
        template = self._get_template_name(graph_type, request.template)

        # 创建图表
        if graph_type in [GraphType.MULTI_PANEL]:
            gp = op.new_graph(template=template)
        else:
            gp = op.new_graph(template=template)

        # 根据图表类型添加数据
        if graph_type == GraphType.MULTI_PANEL and len(worksheets) > 1:
            # 多面板图 - 每个工作表对应一个面板
            for i, wks_data in enumerate(worksheets):
                if i >= len(gp):
                    break
                wks = self.create_worksheet(wks_data)
                layer = gp[i]
                self._add_plot_to_layer(layer, wks, 0, 1, graph_type)
                layer.rescale()
        elif graph_type in [GraphType.DOUBLE_Y, GraphType.DOUBLE_X]:
            # 双轴图
            wks = self.create_worksheet(worksheets[0])
            if len(worksheets[0].columns) >= 3:
                # 第一条曲线用左轴/下轴
                layer1 = gp[0]
                p1 = layer1.add_plot(wks, coly=1, colx=0, type=200)
                # 第二条曲线用右轴/上轴
                layer2 = gp.add_layer(1) if graph_type == GraphType.DOUBLE_Y else gp.add_layer(1)
                p2 = layer2.add_plot(wks, coly=2, colx=0, type=200)
                if graph_type == GraphType.DOUBLE_Y:
                    layer2.set_int('y.link', 1)
            layer1.rescale()
        elif graph_type in [GraphType.STACKED_COLUMN]:
            # 堆叠柱状图
            wks = self.create_worksheet(worksheets[0])
            layer = gp[0]
            for i in range(1, len(worksheets[0].columns)):
                layer.add_plot(wks, coly=i, colx=0, type='?')
            layer.group(True, 0, 1)
            layer.lt_exec('layer -b s 1')  # 设置堆叠
            layer.rescale()
        elif graph_type in [GraphType.CONTOUR, GraphType.HEATMAP, GraphType.SURFACE,
                           GraphType.SURFACE_COLORMAP, GraphType.XYZ_CONTOUR]:
            # 3D/XYZ图表
            wks = self.create_worksheet(worksheets[0])
            layer = gp[0]

            # 设置XYZ轴
            if len(worksheets[0].columns) >= 3:
                wks.cols_axis('xyz')

            plot_type = self._get_plot_type_code(graph_type)
            p = layer.add_plot(wks, coly=1, colx=0, colz=2, type=plot_type)

            # 设置颜色映射
            if graph_type in [GraphType.CONTOUR, GraphType.HEATMAP]:
                p.colormap = 'Maple.pal'

            layer.rescale()
        else:
            # 普通图表
            wks = self.create_worksheet(worksheets[0])
            layer = gp[0]

            # 添加所有Y列
            for col_idx in range(1, len(worksheets[0].columns)):
                plot_type = self._get_plot_type_code(graph_type)
                layer.add_plot(wks, coly=col_idx, colx=0, type=plot_type)

            # 分组并设置样式
            if len(worksheets[0].columns) > 2:
                layer.group()

            layer.rescale()

        return gp

    def _add_plot_to_layer(self, layer, wks, x_col, y_col, graph_type):
        """向图层添加绘图"""
        plot_type = self._get_plot_type_code(graph_type)
        layer.add_plot(wks, coly=y_col, colx=x_col, type=plot_type)

    def _get_template_name(self, graph_type: GraphType, custom_template: str) -> str:
        """获取图表模板名称"""
        if custom_template:
            return custom_template

        template_map = {
            GraphType.LINE: "line",
            GraphType.SCATTER: "scatter",
            GraphType.LINE_SYMBOL: "linesymb",
            GraphType.COLUMN: "column",
            GraphType.BAR: "bar",
            GraphType.AREA: "area",
            GraphType.PIE: "pie",
            GraphType.CONTOUR: "TriContour",
            GraphType.HEATMAP: "Heat_Map.otpu",
            GraphType.SURFACE: "glCMAP",
            GraphType.STACKED_COLUMN: "StackColumn",
            GraphType.DOUBLE_Y: "doubley",
            GraphType.DOUBLE_X: "doubley",
            GraphType.MULTI_PANEL: "PAN2VERT",
        }
        return template_map.get(graph_type, "origin")

    def _get_plot_type_code(self, graph_type: GraphType) -> int:
        """获取Origin绘图类型代码"""
        type_map = {
            GraphType.LINE: 200,           # Line
            GraphType.SCATTER: 201,        # Scatter
            GraphType.LINE_SYMBOL: 202,    # Line+Symbol
            GraphType.COLUMN: 203,         # Column
            GraphType.BAR: 204,            # Bar
            GraphType.AREA: 205,           # Area
            GraphType.PIE: 206,            # Pie
            GraphType.CONTOUR: 243,        # Contour
            GraphType.SURFACE: 103,        # 3D Surface
            GraphType.HEATMAP: 105,        # Heatmap
        }
        return type_map.get(graph_type, 200)

    def _apply_graph_config(self, graph, config: GraphConfig):
        """应用图表配置"""
        try:
            # 设置页面属性
            if config.anti_alias:
                graph.set_int('aa', 1)

            # 配置第一个图层
            if len(graph) > 0:
                layer = graph[0]

                # 设置标题
                if config.title:
                    # 使用LabTalk设置标题
                    op.lt_exec(f'layer -t "{config.title}"')

                # 设置背景色
                layer.set_int('color', config.background_color)

                # 配置X轴
                if config.x_axis:
                    self._apply_axis_config(layer, 'x', config.x_axis)

                # 配置Y轴
                if config.y_axis:
                    self._apply_axis_config(layer, 'y', config.y_axis)

                # 配置Z轴
                if config.z_axis and hasattr(config, 'z_axis'):
                    self._apply_axis_config(layer, 'z', config.z_axis)

                # 配置图例
                if config.legend_show:
                    self._apply_legend_config(layer, config)
                else:
                    try:
                        layer.label('Legend').remove()
                    except:
                        pass

        except Exception as e:
            print(f"应用图表配置时出错: {e}")

    def _apply_axis_config(self, layer, axis_name: str, config: AxisConfig):
        """应用坐标轴配置"""
        # 设置标题
        if config.title:
            axis = layer.axis(axis_name)
            axis.title = config.title

        # 设置刻度类型
        if config.scale_type != ScaleType.LINEAR:
            layer.set_int(f'{axis_name}.scale', config.scale_type.value)

        # 设置范围
        if config.min_value is not None or config.max_value is not None:
            min_val = config.min_value if config.min_value is not None else layer.get_float(f'{axis_name}.from')
            max_val = config.max_value if config.max_value is not None else layer.get_float(f'{axis_name}.to')
            layer.set_lim(axis_name, min_val, max_val)

        # 显示网格
        layer.set_int(f'{axis_name}.showgrids', 1 if config.show_grid else 0)

        # 显示对侧轴线
        if config.opposite_axis:
            layer.set_int(f'{axis_name}.opposite', 1)

    def _apply_legend_config(self, layer, config: GraphConfig):
        """配置图例"""
        try:
            legend = layer.label('Legend')

            # 设置位置
            pos_map = {
                'top-right': (1, 1),
                'top-left': (0, 1),
                'bottom-right': (1, 0),
                'bottom-left': (0, 0),
                'center': (0.5, 0.5)
            }
            if config.legend_position in pos_map:
                x, y = pos_map[config.legend_position]
                # Origin使用相对坐标
                legend.set_int('left', int(x * 10000))
                legend.set_int('top', int((1 - y) * 10000))

            # 移除边框
            legend.set_int('showframe', 0)

        except Exception:
            pass

    def plot_line(self, x_data: List[float], y_data: Union[List[float], List[List[float]]],
                  x_name: str = "X", y_names: Union[str, List[str]] = "Y",
                  title: str = "", **kwargs) -> Dict[str, Any]:
        """
        绘制折线图

        Args:
            x_data: X轴数据
            y_data: Y轴数据 (单条或多条曲线)
            x_name: X轴名称
            y_names: Y轴名称 (单条或列表)
            title: 图表标题
            **kwargs: 其他配置参数

        Returns:
            绘图结果字典
        """
        # 构建数据列
        columns = [DataColumn(x_name, x_data, axis="X")]

        if isinstance(y_data[0], list):
            # 多条曲线
            for i, y_series in enumerate(y_data):
                name = y_names[i] if isinstance(y_names, list) and i < len(y_names) else f"Y{i+1}"
                columns.append(DataColumn(name, y_series))
        else:
            # 单条曲线
            columns.append(DataColumn(y_names if isinstance(y_names, str) else y_names[0], y_data))

        data = WorksheetData(name="LineData", columns=columns)

        # 构建配置
        graph_config = GraphConfig(
            name=kwargs.get('name', 'LinePlot'),
            title=title,
            width=kwargs.get('width', 800),
            height=kwargs.get('height', 600),
            x_axis=AxisConfig(title=kwargs.get('x_title', x_name)),
            y_axis=AxisConfig(title=kwargs.get('y_title', y_names if isinstance(y_names, str) else ""))
        )

        request = PlotRequest(
            data=data,
            graph_type=GraphType.LINE,
            config=graph_config,
            export_format=ExportFormat(kwargs.get('export_format', 'png'))
        )

        return self.plot(request)

    def plot_scatter(self, x_data: List[float], y_data: List[float],
                     x_name: str = "X", y_name: str = "Y",
                     title: str = "", **kwargs) -> Dict[str, Any]:
        """绘制散点图"""
        return self.plot_line(x_data, [y_data], x_name, y_name, title,
                             graph_type=GraphType.SCATTER, **kwargs)

    def plot_column(self, categories: List[str], values: List[float],
                    title: str = "", **kwargs) -> Dict[str, Any]:
        """绘制柱状图"""
        columns = [
            DataColumn("Category", categories, axis="X"),
            DataColumn("Value", values)
        ]
        data = WorksheetData(name="ColumnData", columns=columns)
        graph_config = GraphConfig(name=kwargs.get('name', 'ColumnPlot'), title=title)

        request = PlotRequest(
            data=data,
            graph_type=GraphType.COLUMN,
            config=graph_config,
            export_format=ExportFormat(kwargs.get('export_format', 'png'))
        )

        return self.plot(request)

    def plot_xyz_contour(self, x_data: List[float], y_data: List[float], z_data: List[float],
                         title: str = "", **kwargs) -> Dict[str, Any]:
        """
        绘制XYZ等高线图/曲面图

        Args:
            x_data: X坐标数据
            y_data: Y坐标数据
            z_data: Z值数据
            title: 图表标题
            **kwargs: 其他配置
        """
        columns = [
            DataColumn("X", x_data, axis="X"),
            DataColumn("Y", y_data, axis="Y"),
            DataColumn("Z", z_data, axis="Z")
        ]
        data = WorksheetData(name="XYZData", columns=columns)

        graph_type = GraphType(kwargs.get('graph_type', 'surface_colormap'))
        graph_config = GraphConfig(
            name=kwargs.get('name', 'XYZPlot'),
            title=title,
            width=kwargs.get('width', 800),
            height=kwargs.get('height', 600)
        )

        request = PlotRequest(
            data=data,
            graph_type=graph_type,
            config=graph_config,
            export_format=ExportFormat(kwargs.get('export_format', 'png'))
        )

        return self.plot(request)

    def plot_multi_layer(self, datasets: List[Dict[str, List[float]]],
                         template: str = "PAN2VERT", **kwargs) -> Dict[str, Any]:
        """
        绘制多层图表

        Args:
            datasets: 数据集列表，每个元素是 {'x': [...], 'y': [...]}
            template: 图表模板
            **kwargs: 其他配置
        """
        worksheets = []
        for i, data in enumerate(datasets):
            columns = [
                DataColumn("X", data['x'], axis="X"),
                DataColumn("Y", data['y'], axis="Y")
            ]
            worksheets.append(WorksheetData(name=f"Data{i+1}", columns=columns))

        graph_config = GraphConfig(name=kwargs.get('name', 'MultiLayerPlot'))
        request = PlotRequest(
            data=worksheets,
            graph_type=GraphType.MULTI_PANEL,
            template=template,
            config=graph_config
        )

        return self.plot(request)

    def apply_template(self, template_path: str) -> bool:
        """
        应用Origin模板文件

        Args:
            template_path: 模板文件路径 (.otp)

        Returns:
            是否成功
        """
        try:
            if os.path.exists(template_path):
                # 如果有当前图表，应用模板
                if self._current_graph:
                    op.load_book(template_path)
                    return True
            return False
        except Exception:
            return False

    def export_data_to_excel(self, file_path: str) -> bool:
        """
        将当前数据导出为Excel

        Args:
            file_path: 输出文件路径

        Returns:
            是否成功
        """
        try:
            if self._current_workbook:
                book = self._current_workbook.get_book()
                book.save(file_path, type='Excel')
                return True
            return False
        except Exception:
            return False

    def batch_plot(self, requests: List[PlotRequest]) -> List[Dict[str, Any]]:
        """
        批量绘图

        Args:
            requests: PlotRequest列表

        Returns:
            结果列表
        """
        results = []
        for request in requests:
            result = self.plot(request)
            results.append(result)

        # 合并所有图表到一个项目
        if self._current_graph:
            op.save(os.path.join("outputs", "batch_plots.opju"))

        return results

    def execute_labtalk(self, command: str) -> bool:
        """
        执行LabTalk脚本命令

        Args:
            command: LabTalk命令

        Returns:
            是否成功
        """
        try:
            op.lt_exec(command)
            return True
        except Exception:
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
    """
    检查Origin状态

    Returns:
        状态信息字典
    """
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
        # 尝试连接
        if op and op.oext:
            result["can_connect"] = True
            result["message"] = "Origin可用"
            # 尝试获取版本信息
            try:
                result["version"] = getattr(op, '__version__', '1.1.12')
            except:
                pass
        else:
            result["message"] = "无法连接到Origin。请确保Origin已安装并运行"
    except Exception as e:
        result["message"] = f"连接Origin时出错: {str(e)}"

    return result


def quick_plot(x_data: List[float], y_data: List[float],
               plot_type: str = "line",
               output_path: str = "quick_plot.png",
               show_origin: bool = False) -> Dict[str, Any]:
    """
    快速绘图函数

    Args:
        x_data: X轴数据
        y_data: Y轴数据
        plot_type: 图表类型 (line, scatter, column等)
        output_path: 输出路径
        show_origin: 是否显示Origin窗口

    Returns:
        结果字典
    """
    try:
        with OriginPlotter(show_origin=show_origin) as plotter:
            if plot_type == "line":
                result = plotter.plot_line(x_data, y_data)
            elif plot_type == "scatter":
                result = plotter.plot_scatter(x_data, y_data)
            elif plot_type == "column":
                result = plotter.plot_column([str(x) for x in x_data], y_data)
            else:
                result = plotter.plot_line(x_data, y_data)

            return result
    except Exception as e:
        return {
            "success": False,
            "message": f"快速绘图失败: {str(e)}"
        }


# ==================== 模块导出 ====================

__all__ = [
    # 类
    'OriginPlotter',
    'WorksheetData',
    'DataColumn',
    'PlotStyle',
    'AxisConfig',
    'GraphConfig',
    'PlotRequest',
    # 枚举
    'GraphType',
    'ExportFormat',
    'ScaleType',
    # 函数
    'check_origin_status',
    'quick_plot',
    'ORIGIN_AVAILABLE'
]
