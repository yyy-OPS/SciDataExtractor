# SciDataExtractor - 图层编辑模式使用指南

## 🎯 功能概述

本系统实现了一套完整的 **"Human-in-the-Loop"（人机回圈）分层提取系统**，专门用于处理 LS-DYNA 冲击力时程曲线中的"多线重叠"和"高频震荡密集"区域。

### 核心流程
```
自动分层 → AI 辅助修正 → 人工微调 → 动量追踪提取 → 导出 Excel
```

---

## 🚀 快速开始

### 1. 安装依赖

#### 后端依赖
```bash
cd backend
pip install -r requirements.txt
```

**重要依赖说明：**
- `ultralytics==8.1.0`: SAM (Segment Anything Model) 智能分割
- `torch>=2.1.0`: PyTorch 深度学习框架（建议使用 GPU）
- `scikit-learn`: K-Means 颜色聚类

**首次运行注意：**
- SAM 模型首次使用时会自动下载（约 375MB）
- 建议使用 GPU 加速（CUDA），CPU 模式也可用但较慢

#### 前端依赖
```bash
cd frontend
npm install
```

### 2. 启动服务

#### 启动后端
```bash
cd backend
python main.py
# 或
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### 启动前端
```bash
cd frontend
npm run dev
```

访问：`http://localhost:5173`

---

## 📖 使用教程

### 步骤 1: 上传图片并校准

1. **上传图片**
   - 点击"选择文件"或使用 `Ctrl+V` 粘贴图片
   - 支持 PNG、JPG 格式

2. **设置校准点**（传统模式）
   - 点击 X 轴起点和终点，输入物理值
   - 点击 Y 轴起点和终点，输入物理值
   - 完成后进入下一步

### 步骤 2: 切换到图层编辑模式

点击右上角的 **"🎨 图层编辑模式"** 按钮

### 步骤 3: 自动分层

点击左侧工具栏的 **"🎨 自动分层"** 按钮

**系统会自动：**
- 使用 K-Means 算法识别图中主要颜色
- 生成 5 个颜色图层（可调整）
- 排除背景色（白色/浅灰色）
- 显示每个图层的颜色、像素数量和占比

**图层列表显示：**
- 👁️ / 🚫：切换图层可见性
- 🎨 颜色块：图层颜色预览
- 图层名称：如"红色_1"、"蓝色_2"
- 不透明度滑块：调整图层透明度（0-100%）
- 🗑️：删除图层

### 步骤 4: 使用工具编辑图层

#### 工具箱说明

| 工具 | 图标 | 功能 | 使用方法 |
|------|------|------|----------|
| **选择** | ↖️ | 默认模式 | 点击图层、缩放画布 |
| **画笔** | 🖌️ | 手动涂抹 | 按住鼠标拖动，修补断裂的 Mask |
| **橡皮** | 🧼 | 擦除区域 | 按住鼠标拖动，擦除不需要的噪点 |
| **魔棒** | 🪄 | AI 智能分割 | 点击图片某处，自动识别并合并到当前图层 |

#### 典型编辑场景

**场景 1：修补断裂的曲线**
1. 选择对应颜色的图层（如"红色_1"）
2. 选择 🖌️ 画笔工具
3. 调整画笔大小（1-50px）
4. 在断裂处涂抹连接

**场景 2：去除混入的其他颜色**
1. 选择需要清理的图层
2. 选择 🧼 橡皮工具
3. 擦除混入的噪点或其他颜色

**场景 3：智能添加区域**
1. 选择目标图层
2. 选择 🪄 魔棒工具
3. 点击图片上要添加的区域
4. SAM 模型会自动识别并合并到当前图层

### 步骤 5: 从图层提取数据

1. **选择要提取的图层**
   - 点击图层列表中的图层进行选择
   - 选中的图层会高亮显示

2. **点击"📊 提取当前图层数据"按钮**

3. **系统使用动量追踪算法提取曲线**
   - 自动骨架化（细化为 1 像素宽）
   - 从左到右追踪曲线
   - 利用动量惯性解决交叉点选择问题
   - 转换为物理坐标

4. **查看提取结果**
   - 数据点显示在"数据预览"面板
   - 可以使用 AI 修复、清洗、平滑功能

### 步骤 6: 导出 Excel

点击"导出 Excel"按钮，下载包含所有数据点的 Excel 文件

---

## 🔧 高级功能

### 1. 多图层批量提取

**工作流程：**
```
1. 自动分层 → 识别 5 个颜色图层
2. 选择"红色_1" → 编辑 → 提取 → 保存数据
3. 选择"蓝色_2" → 编辑 → 提取 → 保存数据
4. 选择"绿色_3" → 编辑 → 提取 → 保存数据
...
5. 合并所有数据到一个 Excel 文件
```

### 2. 处理重叠曲线

**问题：** 0-1s 内红蓝线完全重合

**解决方案：**
1. 自动分层后，红色和蓝色会被分到不同图层
2. 使用橡皮工具在重叠区域分别清理
3. 使用魔棒工具精确选择各自的区域
4. 分别提取两条曲线的数据

### 3. 处理高频震荡

**问题：** 密集震荡区域提取困难

**解决方案：**
1. 自动分层识别震荡曲线
2. 使用画笔工具连接断点
3. 动量追踪算法自动跟随曲线走势
4. 提取后使用 AI 平滑功能去除噪声

### 4. 自定义分层参数

修改自动分层参数（需要修改代码）：

```javascript
// LayerEditor.jsx 中的 handleAutoDetectLayers 函数
body: JSON.stringify({
  session_id: sessionId,
  k: 5,                    // 聚类数量（颜色数量）
  exclude_background: true, // 是否排除背景
  min_saturation: 30       // 最小饱和度阈值
})
```

---

## 🎨 核心算法详解

### 1. K-Means 颜色聚类

**位置：** `backend/image_processor.py` → `detect_dominant_colors()`

**算法流程：**
```python
1. 将图像转换为 HSV 色彩空间
2. 过滤低饱和度像素（S < 30）排除背景
3. 使用 K-Means 聚类（k=5）
4. 为每个聚类创建二值掩码
5. 形态学清理（开运算 + 闭运算）
6. 识别颜色名称（红/橙/黄/绿/青/蓝/紫）
7. 编码为 Base64 PNG 返回前端
```

**优点：**
- 自动识别主要颜色，无需手动采样
- 排除背景干扰
- 支持多条曲线同时分离

### 2. 动量追踪算法

**位置：** `backend/image_processor.py` → `_momentum_trace()`

**算法原理：**
```python
1. 骨架化：将曲线细化为 1 像素宽
2. 初始化：从最左边的点开始，动量向量指向右
3. 迭代追踪：
   - 在 8 邻域中搜索下一个像素
   - 计算每个候选点的方向向量
   - 计算与动量向量的夹角（点积）
   - 选择角度最小的候选点（动量权重 0.7）
4. 更新动量：momentum = 0.6 * momentum + 0.4 * next_dir
5. 处理断点：扩大搜索范围（2-5 像素）
6. 转换为物理坐标
```

**关键优势：**
- **解决交叉点问题**：动量惯性确保选择正确的分支
- **处理断点**：自动跳过小间隙
- **鲁棒性强**：适应曲线弯曲和震荡

**示例：**
```
交叉点场景：
    ╱ ╲
   ╱   ╲
  ╱     ╲
 ╱       ╲
╱    ×    ╲  ← 交叉点
     ╱ ╲
    ╱   ╲

传统算法：可能选择错误的分支
动量追踪：根据来向动量选择正确分支
```

### 3. SAM 智能分割

**位置：** `backend/ai_segmentation.py` → `SmartSegmenter`

**工作原理：**
```python
1. 加载 SAM 模型（sam_b.pt, 375MB）
2. 用户点击图片某处
3. SAM 识别该点所属的完整区域
4. 返回高精度的二值掩码
5. 合并到当前图层
```

**备用方案：**
- 如果 SAM 不可用，使用基于颜色的区域生长算法
- 使用 FloodFill + HSV 颜色分割

---

## 🛠️ API 接口文档

### 图层分割相关 API

#### 1. 自动分层
```http
POST /process/auto-layers
Content-Type: application/json

{
  "session_id": "uuid",
  "k": 5,
  "exclude_background": true,
  "min_saturation": 30
}

Response:
{
  "success": true,
  "layers": [
    {
      "name": "红色_1",
      "color_hsv": [0, 255, 255],
      "color_rgb": [255, 0, 0],
      "mask": "data:image/png;base64,...",
      "pixel_count": 12345,
      "percentage": 5.67
    },
    ...
  ],
  "count": 5,
  "message": "成功识别 5 个颜色图层"
}
```

#### 2. SAM 智能分割
```http
POST /process/sam-predict
Content-Type: application/json

{
  "session_id": "uuid",
  "point_x": 100,
  "point_y": 200,
  "point_label": 1
}

Response:
{
  "success": true,
  "mask": "data:image/png;base64,...",
  "pixel_count": 5678,
  "message": "智能分割成功"
}
```

#### 3. 掩码操作
```http
POST /process/mask-operation
Content-Type: application/json

{
  "session_id": "uuid",
  "mask1_base64": "data:image/png;base64,...",
  "mask2_base64": "data:image/png;base64,...",
  "operation": "union",  // union, intersect, subtract, clean, dilate, erode
  "kernel_size": 3
}

Response:
{
  "success": true,
  "mask": "data:image/png;base64,...",
  "pixel_count": 8901,
  "message": "掩码操作 'union' 完成"
}
```

#### 4. 从掩码提取数据
```http
POST /extract/mask
Content-Type: application/json

{
  "session_id": "uuid",
  "mask_base64": "data:image/png;base64,...",
  "calibration": { ... },
  "start_point": {"x": 10, "y": 20},
  "direction": "auto"
}

Response:
{
  "success": true,
  "data": [
    {"x": 0.0, "y": 10.5},
    {"x": 0.01, "y": 10.6},
    ...
  ],
  "count": 1000,
  "message": "成功提取 1000 个数据点（动量追踪算法）"
}
```

#### 5. 检查 SAM 状态
```http
GET /process/sam-status

Response:
{
  "available": true,
  "ready": true,
  "device": "cuda",
  "message": "SAM 模型已就绪"
}
```

---

## 🐛 常见问题

### 1. SAM 模型加载失败

**问题：** `SAM 模块未安装`

**解决：**
```bash
pip install ultralytics torch
```

**GPU 支持：**
```bash
# CUDA 11.8
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# CUDA 12.1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

### 2. 自动分层识别不准确

**问题：** 颜色分层效果不理想

**解决方案：**
- 调整 `k` 参数（聚类数量）：增加到 7-10
- 调整 `min_saturation` 参数：降低到 20
- 使用魔棒工具手动补充

### 3. 动量追踪提取失败

**问题：** 从掩码提取数据返回 0 个点

**可能原因：**
- 掩码太小或太碎片化
- 校准参数未设置
- 曲线不连续

**解决方案：**
- 使用画笔工具连接断点
- 使用形态学操作清理掩码（clean, fill_gaps）
- 检查校准点是否正确

### 4. 图层编辑器画笔不工作

**问题：** 画笔/橡皮工具无响应

**解决方案：**
- 确保已选择一个图层（图层高亮显示）
- 检查浏览器控制台是否有错误
- 刷新页面重试

### 5. 内存不足

**问题：** 处理大图时内存溢出

**解决方案：**
- 压缩图片尺寸（建议 < 2000x2000）
- 减少聚类数量（k=3）
- 使用 CPU 模式（降低内存占用）

---

## 📊 性能优化建议

### 1. 图片预处理
- 裁剪无关区域
- 调整分辨率到合适大小（1000-2000px）
- 增强对比度

### 2. 服务器配置
- **推荐配置：**
  - CPU: 4 核以上
  - 内存: 8GB 以上
  - GPU: NVIDIA GTX 1060 或更高（可选）

### 3. 批量处理
- 使用脚本批量上传图片
- 复用校准参数
- 自动化提取流程

---

## 🎓 最佳实践

### 1. 工作流程建议

```
第一次使用：
1. 上传图片 → 校准 → 切换到图层模式
2. 自动分层 → 查看识别结果
3. 选择第一个图层 → 编辑 → 提取 → 保存
4. 重复步骤 3 处理其他图层

后续使用：
1. 直接切换到图层模式
2. 自动分层
3. 批量提取所有图层
```

### 2. 图层命名规范

建议手动重命名图层：
- `红色曲线_实验组A`
- `蓝色曲线_对照组B`
- `绿色曲线_理论值`

### 3. 数据验证

提取后务必检查：
- 数据点数量是否合理
- X 轴范围是否正确
- Y 轴数值是否在预期范围
- 使用数据预览图表目视检查

---

## 📝 更新日志

### v2.0.0 (2026-01-16)
- ✨ 新增图层编辑模式
- ✨ 集成 K-Means 自动分层
- ✨ 集成 SAM 智能分割
- ✨ 实现动量追踪算法
- ✨ 支持画笔/橡皮/魔棒工具
- ✨ 支持多图层管理
- ✨ 支持从图层直接提取数据

### v1.0.0
- 基础颜色分割提取功能
- AI 辅助识别
- 手动绘制模式

---

## 📧 技术支持

如有问题，请提供：
1. 错误截图
2. 浏览器控制台日志
3. 后端终端输出
4. 测试图片（如可能）

---

## 🙏 致谢

本系统使用了以下开源项目：
- [Segment Anything Model (SAM)](https://github.com/facebookresearch/segment-anything) - Meta AI
- [Ultralytics](https://github.com/ultralytics/ultralytics) - YOLO/SAM 实现
- [FastAPI](https://fastapi.tiangolo.com/) - 后端框架
- [React](https://react.dev/) + [Konva](https://konvajs.org/) - 前端框架
- [OpenCV](https://opencv.org/) - 计算机视觉库
- [scikit-learn](https://scikit-learn.org/) - 机器学习库

---

**祝您使用愉快！🎉**
