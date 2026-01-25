import { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect } from 'react-konva'
import useImage from 'use-image'

const API_BASE = ''

/**
 * LayerEditor - Photoshop 风格的图层编辑器 v3.0
 *
 * 新功能:
 * - 自动检测曲线并显示轮廓线
 * - 颜色按钮切换显示不同曲线
 * - 支持用户编辑轮廓线
 * - 基于编辑后的轮廓提取数据
 * - SAM 2 智能分割支持 (Meta 2024)
 *
 * v3.0 新增功能:
 * - 新建图层、手动描绘、删除图层
 * - 撤回/重做操作历史
 * - 显示 XY 轴信息
 * - 框选删除线段
 * - 端点自动匹配连续绘制
 * - 线段粗细和透明度调整
 * - 数据提取密集度和平滑度设置
 */
const LayerEditor = ({
  sessionId,
  imageUrl,
  onLayerSelect,
  onExtractFromLayer,
  calibrationPoints
}) => {
  // ========== 状态管理 ==========
  const [curves, setCurves] = useState([]) // 检测到的曲线列表
  const [selectedCurveId, setSelectedCurveId] = useState(null) // 当前选中曲线
  const [overlayImage, setOverlayImage] = useState(null) // 叠加预览图
  const [tool, setTool] = useState('select') // 当前工具: select, draw, erase, box_erase
  const [brushSize, setBrushSize] = useState(5)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingPoints, setDrawingPoints] = useState([]) // 当前绘制的点
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  // v3.0 新增状态
  const [history, setHistory] = useState([]) // 操作历史
  const [historyIndex, setHistoryIndex] = useState(-1) // 当前历史索引
  const [lineWidth, setLineWidth] = useState(2) // 线段粗细
  const [lineOpacity, setLineOpacity] = useState(0.8) // 线段透明度
  const [downsampleFactor, setDownsampleFactor] = useState(1) // 采样密度
  const [smoothness, setSmoothness] = useState(0) // 平滑度
  const [boxSelection, setBoxSelection] = useState(null) // 框选区域 {x1, y1, x2, y2}
  const [isBoxSelecting, setIsBoxSelecting] = useState(false) // 是否正在框选
  const [showAxes, setShowAxes] = useState(true) // 显示坐标轴

  // Canvas 相关
  const [image] = useImage(imageUrl, 'anonymous')
  const [previewImage] = useImage(overlayImage, 'anonymous')
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [scale, setScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const stageRef = useRef(null)
  const lastPointRef = useRef(null)

  // 图像尺寸
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })

  // ========== 初始化 ==========
  useEffect(() => {
    if (image) {
      const containerWidth = 800
      const containerHeight = 600
      const imageAspect = image.width / image.height
      const containerAspect = containerWidth / containerHeight

      let newWidth, newHeight
      if (imageAspect > containerAspect) {
        newWidth = containerWidth
        newHeight = containerWidth / imageAspect
      } else {
        newHeight = containerHeight
        newWidth = containerHeight * imageAspect
      }

      setStageSize({ width: newWidth, height: newHeight })
      setImageSize({ width: image.width, height: image.height })
    }
  }, [image])


  // ========== 历史记录管理 ==========
  const saveToHistory = useCallback((newCurves) => {
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(JSON.parse(JSON.stringify(newCurves)))
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }, [history, historyIndex])

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1)
      setCurves(JSON.parse(JSON.stringify(history[historyIndex - 1])))
      setMessage('已撤回')
    }
  }, [history, historyIndex])

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1)
      setCurves(JSON.parse(JSON.stringify(history[historyIndex + 1])))
      setMessage('已重做')
    }
  }, [history, historyIndex])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          undo()
        } else if (e.key === 'z' && e.shiftKey || e.key === 'y') {
          e.preventDefault()
          redo()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  // ========== 自动检测曲线 ==========
  const handleDetectCurves = async () => {
    if (!sessionId) {
      setMessage('请先上传图片')
      return
    }

    setIsLoading(true)
    setMessage('正在检测曲线轮廓...')

    try {
      const response = await fetch(`${API_BASE}/process/detect-curves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          k: 5,
          min_saturation: 30,
          min_contour_length: 50
        })
      })

      const data = await response.json()

      if (data.success) {
        setCurves(data.curves)
        saveToHistory(data.curves)
        setOverlayImage(data.original_with_overlay)
        if (data.curves.length > 0) {
          setSelectedCurveId(data.curves[0].id)
        }
        setMessage(`成功检测到 ${data.count} 条曲线，点击颜色按钮切换显示`)
      } else {
        setMessage(`曲线检测失败: ${data.message}`)
      }
    } catch (error) {
      setMessage(`曲线检测错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // ========== 新建图层 ==========
  const handleCreateNewLayer = () => {
    const newLayer = {
      id: `layer_${Date.now()}`,
      name: `图层 ${curves.length + 1}`,
      color_rgb: [Math.random() * 255, Math.random() * 255, Math.random() * 255],
      skeleton_points: [],
      visible: true,
      mask_base64: null
    }
    const newCurves = [...curves, newLayer]
    setCurves(newCurves)
    saveToHistory(newCurves)
    setSelectedCurveId(newLayer.id)
    setMessage(`已创建新图层: ${newLayer.name}`)
  }

  // ========== 删除图层 ==========
  const handleDeleteLayer = (layerId) => {
    if (!confirm('确定要删除这个图层吗？')) return

    const newCurves = curves.filter(c => c.id !== layerId)
    setCurves(newCurves)
    saveToHistory(newCurves)

    if (selectedCurveId === layerId) {
      setSelectedCurveId(newCurves.length > 0 ? newCurves[0].id : null)
    }
    setMessage('图层已删除')
  }

  // ========== 更新叠加预览 ==========
  const updateOverlay = async (curveList, selectedId) => {
    if (!sessionId || curveList.length === 0) return

    try {
      const response = await fetch(`${API_BASE}/process/curve-overlay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          curves: curveList,
          selected_curve_id: selectedId,
          show_skeleton: true,
          show_contour: false,
          line_width: 2
        })
      })

      const data = await response.json()
      if (data.success) {
        setOverlayImage(data.overlay_image)
      }
    } catch (error) {
      console.error('更新叠加预览失败:', error)
    }
  }

  // ========== 曲线选择 ==========
  const handleCurveSelect = (curveId) => {
    setSelectedCurveId(curveId)
    const curve = curves.find(c => c.id === curveId)
    if (curve && onLayerSelect) {
      onLayerSelect(curve)
    }
    updateOverlay(curves, curveId)
  }

  // ========== 曲线可见性切换 ==========
  const handleCurveVisibilityToggle = (curveId) => {
    const updatedCurves = curves.map(c =>
      c.id === curveId ? { ...c, visible: !c.visible } : c
    )
    setCurves(updatedCurves)
    updateOverlay(updatedCurves, selectedCurveId)
  }

  // ========== 绘制功能 ==========
  // 查找最近的端点
  const findNearestEndpoint = (point, curve, threshold = 20) => {
    if (!curve || !curve.skeleton_points || curve.skeleton_points.length === 0) {
      return null
    }

    const points = curve.skeleton_points
    const endpoints = [points[0], points[points.length - 1]]

    let nearest = null
    let minDist = threshold

    endpoints.forEach(ep => {
      const dist = Math.sqrt(Math.pow(ep[0] - point[0], 2) + Math.pow(ep[1] - point[1], 2))
      if (dist < minDist) {
        minDist = dist
        nearest = ep
      }
    })

    return nearest
  }

  const handleMouseDown = (e) => {
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    // 转换为图像坐标
    const imageX = Math.round((pos.x - stagePos.x) / scale * (imageSize.width / stageSize.width))
    const imageY = Math.round((pos.y - stagePos.y) / scale * (imageSize.height / stageSize.height))

    if (tool === 'box_erase') {
      // 框选删除模式
      setIsBoxSelecting(true)
      setBoxSelection({ x1: imageX, y1: imageY, x2: imageX, y2: imageY })
      return
    }

    if (tool === 'select') return

    if (tool === 'draw' || tool === 'erase') {
      if (!selectedCurveId) {
        setMessage('请先选择一条曲线')
        return
      }
      setIsDrawing(true)
      lastPointRef.current = pos

      // 检查是否靠近端点
      const curve = curves.find(c => c.id === selectedCurveId)
      const nearestEndpoint = findNearestEndpoint([imageX, imageY], curve, 30)

      if (nearestEndpoint && tool === 'draw') {
        // 从端点开始绘制
        setDrawingPoints([nearestEndpoint, [imageX, imageY]])
        setMessage('已连接到端点')
      } else {
        setDrawingPoints([[imageX, imageY]])
      }
    }
  }

  const handleMouseMove = (e) => {
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    // 转换为图像坐标
    const imageX = Math.round((pos.x - stagePos.x) / scale * (imageSize.width / stageSize.width))
    const imageY = Math.round((pos.y - stagePos.y) / scale * (imageSize.height / stageSize.height))

    if (isBoxSelecting && tool === 'box_erase') {
      // 更新框选区域
      setBoxSelection(prev => ({ ...prev, x2: imageX, y2: imageY }))
      return
    }

    if (!isDrawing || (tool !== 'draw' && tool !== 'erase')) return

    setDrawingPoints(prev => [...prev, [imageX, imageY]])
    lastPointRef.current = pos
  }

  const handleMouseUp = async () => {
    if (isBoxSelecting && tool === 'box_erase') {
      // 执行框选删除
      await handleBoxErase()
      setIsBoxSelecting(false)
      setBoxSelection(null)
      return
    }

    if (!isDrawing) return
    setIsDrawing(false)

    // 保存绘制的点到曲线
    if (drawingPoints.length > 1 && selectedCurveId) {
      await saveDrawingToCurve()
    }
    setDrawingPoints([])
  }

  const saveDrawingToCurve = async () => {
    const curve = curves.find(c => c.id === selectedCurveId)
    if (!curve) return

    setIsLoading(true)
    setMessage('正在更新曲线...')

    try {
      // 合并绘制的点到曲线
      let newPoints
      if (tool === 'draw') {
        // 添加模式：合并新点
        newPoints = [...(curve.skeleton_points || []), ...drawingPoints]
        // 按 X 排序
        newPoints.sort((a, b) => a[0] - b[0])
      } else {
        // 擦除模式：移除附近的点
        newPoints = (curve.skeleton_points || []).filter(pt => {
          return !drawingPoints.some(dp =>
            Math.abs(pt[0] - dp[0]) < brushSize * 2 &&
            Math.abs(pt[1] - dp[1]) < brushSize * 2
          )
        })
      }

      // 更新曲线数据
      const updatedCurves = curves.map(c =>
        c.id === selectedCurveId
          ? { ...c, skeleton_points: newPoints }
          : c
      )
      setCurves(updatedCurves)
      saveToHistory(updatedCurves)
      setMessage('曲线更新成功')
    } catch (error) {
      setMessage(`更新错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // ========== 框选删除 ==========
  const handleBoxErase = () => {
    if (!boxSelection || !selectedCurveId) return

    const curve = curves.find(c => c.id === selectedCurveId)
    if (!curve || !curve.skeleton_points || curve.skeleton_points.length < 2) return

    const { x1, y1, x2, y2 } = boxSelection
    const minX = Math.min(x1, x2)
    const maxX = Math.max(x1, x2)
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)

    console.log('=== 框选删除开始 ===')
    console.log('框选区域:', { minX, maxX, minY, maxY })
    console.log('曲线点数:', curve.skeleton_points.length)

    // 找出所有与框相交的线段索引
    const segmentsToDelete = new Set()
    const points = curve.skeleton_points

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]
      const p2 = points[i + 1]

      // 检查线段是否与矩形相交
      const intersects = lineSegmentIntersectsRect(p1, p2, minX, minY, maxX, maxY)

      if (i < 5 || intersects) {  // 只打印前5个或相交的
        console.log(`线段 ${i}-${i+1}:`, p1, '→', p2, '相交:', intersects)
      }

      if (intersects) {
        segmentsToDelete.add(i)
        segmentsToDelete.add(i + 1)
      }
    }

    console.log('要删除的点索引:', Array.from(segmentsToDelete).sort((a, b) => a - b))
    console.log('删除前点数:', points.length)

    // 删除相交线段的所有点
    const newPoints = points.filter((pt, idx) => !segmentsToDelete.has(idx))

    console.log('删除后点数:', newPoints.length)
    console.log('=== 框选删除结束 ===')

    const updatedCurves = curves.map(c =>
      c.id === selectedCurveId
        ? { ...c, skeleton_points: newPoints }
        : c
    )
    setCurves(updatedCurves)
    saveToHistory(updatedCurves)
    setMessage(`已删除框选区域内的 ${segmentsToDelete.size} 个点（${Math.floor(segmentsToDelete.size / 2)} 段线段）`)
  }

  // 判断线段是否与矩形相交
  const lineSegmentIntersectsRect = (p1, p2, minX, minY, maxX, maxY) => {
    const [x1, y1] = p1
    const [x2, y2] = p2

    // 检查端点是否在矩形内
    const p1Inside = x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY
    const p2Inside = x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY

    if (p1Inside || p2Inside) return true

    // 检查线段是否与矩形的四条边相交
    // 矩形四条边
    const rectEdges = [
      [[minX, minY], [maxX, minY]], // 上边
      [[maxX, minY], [maxX, maxY]], // 右边
      [[maxX, maxY], [minX, maxY]], // 下边
      [[minX, maxY], [minX, minY]]  // 左边
    ]

    for (const edge of rectEdges) {
      if (lineSegmentsIntersect(p1, p2, edge[0], edge[1])) {
        return true
      }
    }

    return false
  }

  // 判断两条线段是否相交
  const lineSegmentsIntersect = (p1, p2, p3, p4) => {
    const [x1, y1] = p1
    const [x2, y2] = p2
    const [x3, y3] = p3
    const [x4, y4] = p4

    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1)
    if (Math.abs(denom) < 1e-10) return false // 平行或共线

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
  }

  // ========== 从曲线提取数据 ==========
  const handleExtractFromCurve = async () => {
    if (!selectedCurveId || !calibrationPoints) {
      setMessage('请先选择曲线并完成校准')
      return
    }

    const curve = curves.find(c => c.id === selectedCurveId)
    if (!curve || !curve.skeleton_points || curve.skeleton_points.length === 0) {
      setMessage('所选曲线没有有效的轮廓点')
      return
    }

    setIsLoading(true)
    setMessage('正在从曲线提取数据...')

    try {
      const response = await fetch(`${API_BASE}/extract/curve-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          skeleton_points: curve.skeleton_points,
          calibration: {
            x_start: {
              pixel_x: calibrationPoints.xStart.pixel.x,
              pixel_y: calibrationPoints.xStart.pixel.y,
              real_value: calibrationPoints.xStart.value
            },
            x_end: {
              pixel_x: calibrationPoints.xEnd.pixel.x,
              pixel_y: calibrationPoints.xEnd.pixel.y,
              real_value: calibrationPoints.xEnd.value
            },
            y_start: {
              pixel_x: calibrationPoints.yStart.pixel.x,
              pixel_y: calibrationPoints.yStart.pixel.y,
              real_value: calibrationPoints.yStart.value
            },
            y_end: {
              pixel_x: calibrationPoints.yEnd.pixel.x,
              pixel_y: calibrationPoints.yEnd.pixel.y,
              real_value: calibrationPoints.yEnd.value
            }
          },
          downsample_factor: downsampleFactor,
          smoothness: smoothness
        })
      })

      const data = await response.json()

      if (data.success) {
        setMessage(`成功提取 ${data.count} 个数据点`)
        if (onExtractFromLayer) {
          onExtractFromLayer(data.data, curve)
        }
      } else {
        setMessage(`提取失败: ${data.message}`)
      }
    } catch (error) {
      setMessage(`提取错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // ========== 缩放和拖动 ==========
  const handleWheel = (e) => {
    e.evt.preventDefault()
    const scaleBy = 1.1
    const stage = e.target.getStage()
    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale
    }

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy
    const clampedScale = Math.max(0.1, Math.min(5, newScale))

    setScale(clampedScale)
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale
    })
  }

  // ========== 渲染曲线轮廓线 ==========
  const renderCurveLines = () => {
    return curves.map(curve => {
      if (!curve.visible || !curve.skeleton_points || curve.skeleton_points.length < 2) {
        return null
      }

      const isSelected = curve.id === selectedCurveId
      const color = `rgb(${curve.highlight_color?.join(',') || curve.color_rgb?.join(',') || '255,0,0'})`

      // 转换坐标到画布坐标
      const points = curve.skeleton_points.flatMap(pt => [
        pt[0] * (stageSize.width / imageSize.width),
        pt[1] * (stageSize.height / imageSize.height)
      ])

      return (
        <Line
          key={curve.id}
          points={points}
          stroke={color}
          strokeWidth={isSelected ? lineWidth + 1 : lineWidth}
          opacity={isSelected ? lineOpacity : lineOpacity * 0.7}
          lineCap="round"
          lineJoin="round"
          shadowColor={isSelected ? 'white' : undefined}
          shadowBlur={isSelected ? 5 : 0}
        />
      )
    })
  }

  // ========== 渲染坐标轴 ==========
  const renderAxes = () => {
    if (!showAxes || !calibrationPoints) return null

    const toCanvasX = (px) => px * (stageSize.width / imageSize.width)
    const toCanvasY = (py) => py * (stageSize.height / imageSize.height)

    return (
      <>
        {/* X 轴 */}
        <Line
          points={[
            toCanvasX(calibrationPoints.xStart.pixel.x),
            toCanvasY(calibrationPoints.xStart.pixel.y),
            toCanvasX(calibrationPoints.xEnd.pixel.x),
            toCanvasY(calibrationPoints.xEnd.pixel.y)
          ]}
          stroke="#00ff00"
          strokeWidth={2}
          dash={[5, 5]}
          opacity={0.6}
        />
        {/* Y 轴 */}
        <Line
          points={[
            toCanvasX(calibrationPoints.yStart.pixel.x),
            toCanvasY(calibrationPoints.yStart.pixel.y),
            toCanvasX(calibrationPoints.yEnd.pixel.x),
            toCanvasY(calibrationPoints.yEnd.pixel.y)
          ]}
          stroke="#ff00ff"
          strokeWidth={2}
          dash={[5, 5]}
          opacity={0.6}
        />
      </>
    )
  }

  // ========== 渲染框选矩形 ==========
  const renderBoxSelection = () => {
    if (!boxSelection || !isBoxSelecting) return null

    const { x1, y1, x2, y2 } = boxSelection
    const canvasX1 = x1 * (stageSize.width / imageSize.width)
    const canvasY1 = y1 * (stageSize.height / imageSize.height)
    const canvasX2 = x2 * (stageSize.width / imageSize.width)
    const canvasY2 = y2 * (stageSize.height / imageSize.height)

    return (
      <Rect
        x={Math.min(canvasX1, canvasX2)}
        y={Math.min(canvasY1, canvasY2)}
        width={Math.abs(canvasX2 - canvasX1)}
        height={Math.abs(canvasY2 - canvasY1)}
        stroke="#ff0000"
        strokeWidth={2}
        dash={[5, 5]}
        fill="rgba(255, 0, 0, 0.1)"
      />
    )
  }

  // ========== 渲染当前绘制的线 ==========
  const renderDrawingLine = () => {
    if (drawingPoints.length < 2) return null

    const points = drawingPoints.flatMap(pt => [
      pt[0] * (stageSize.width / imageSize.width),
      pt[1] * (stageSize.height / imageSize.height)
    ])

    return (
      <Line
        points={points}
        stroke={tool === 'draw' ? '#00ff00' : '#ff0000'}
        strokeWidth={brushSize}
        lineCap="round"
        lineJoin="round"
        opacity={0.8}
      />
    )
  }

  // ========== 渲染 ==========
  return (
    <div className="layer-editor">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* 自动检测按钮 */}
        <button
          onClick={handleDetectCurves}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition flex items-center gap-2"
        >
          <span>🔍</span>
          <span>自动检测曲线</span>
        </button>

        {/* 新建图层按钮 */}
        <button
          onClick={handleCreateNewLayer}
          disabled={isLoading}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition flex items-center gap-2"
        >
          <span>➕</span>
          <span>新建图层</span>
        </button>

        {/* 撤回/重做 */}
        <div className="flex gap-1 border-l pl-2 ml-2">
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="撤回 (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="重做 (Ctrl+Y)"
          >
            ↷
          </button>
        </div>

        {/* 工具选择 */}
        <div className="flex gap-1 border-l pl-2 ml-2">
          <button
            onClick={() => setTool('select')}
            className={`px-3 py-2 rounded ${tool === 'select' ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
            title="选择工具"
          >
            ↖️
          </button>
          <button
            onClick={() => setTool('draw')}
            className={`px-3 py-2 rounded ${tool === 'draw' ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
            title="绘制工具 - 补充轮廓 (自动连接端点)"
          >
            ✏️
          </button>
          <button
            onClick={() => setTool('erase')}
            className={`px-3 py-2 rounded ${tool === 'erase' ? 'bg-red-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
            title="擦除工具 - 删除轮廓"
          >
            🧹
          </button>
          <button
            onClick={() => setTool('box_erase')}
            className={`px-3 py-2 rounded ${tool === 'box_erase' ? 'bg-orange-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
            title="框选删除 - 删除区域内的线段"
          >
            ⬚
          </button>
        </div>

        {/* 画笔大小 */}
        {(tool === 'draw' || tool === 'erase') && (
          <div className="flex items-center gap-2 border-l pl-2 ml-2">
            <span className="text-sm text-gray-600">大小:</span>
            <input
              type="range"
              min="1"
              max="20"
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              className="w-20"
            />
            <span className="text-sm text-gray-600">{brushSize}px</span>
          </div>
        )}

        {/* 显示坐标轴切换 */}
        <button
          onClick={() => setShowAxes(!showAxes)}
          className={`px-3 py-2 rounded border-l ml-2 ${showAxes ? 'bg-green-100 text-green-700' : 'bg-gray-200'}`}
          title="显示/隐藏坐标轴"
        >
          {showAxes ? '📐 显示坐标轴' : '📐 隐藏坐标轴'}
        </button>

        {/* 提取数据按钮 */}
        {selectedCurveId && calibrationPoints && (
          <button
            onClick={handleExtractFromCurve}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition flex items-center gap-2 ml-auto"
          >
            <span>📊</span>
            <span>提取数据</span>
          </button>
        )}
      </div>

      {/* 线段样式和提取参数设置 */}
      <div className="flex flex-wrap gap-4 mb-4 p-3 bg-blue-50 rounded-lg">
        {/* 线段粗细 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700 font-medium">线段粗细:</span>
          <input
            type="range"
            min="1"
            max="10"
            value={lineWidth}
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            className="w-24"
          />
          <span className="text-sm text-gray-600">{lineWidth}px</span>
        </div>

        {/* 线段透明度 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700 font-medium">透明度:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={lineOpacity * 100}
            onChange={(e) => setLineOpacity(parseInt(e.target.value) / 100)}
            className="w-24"
          />
          <span className="text-sm text-gray-600">{Math.round(lineOpacity * 100)}%</span>
        </div>

        {/* 采样密度 */}
        <div className="flex items-center gap-2 border-l pl-4">
          <span className="text-sm text-gray-700 font-medium">采样密度:</span>
          <input
            type="number"
            min="1"
            max="10"
            value={downsampleFactor}
            onChange={(e) => setDownsampleFactor(parseInt(e.target.value) || 1)}
            className="w-16 px-2 py-1 border rounded"
          />
          <span className="text-xs text-gray-500">(1=最密集)</span>
        </div>

        {/* 平滑度 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700 font-medium">平滑度:</span>
          <input
            type="range"
            min="0"
            max="10"
            value={smoothness}
            onChange={(e) => setSmoothness(parseInt(e.target.value))}
            className="w-24"
          />
          <span className="text-sm text-gray-600">{smoothness}</span>
        </div>
      </div>

      {/* 曲线颜色按钮 */}
      {curves.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-100 rounded-lg">
          <span className="text-sm text-gray-600 self-center mr-2">图层:</span>
          {curves.map(curve => (
            <div
              key={curve.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition ${
                selectedCurveId === curve.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 bg-white hover:border-gray-400'
              }`}
            >
              <button
                onClick={() => handleCurveSelect(curve.id)}
                className="flex items-center gap-2"
              >
                {/* 颜色指示器 */}
                <div
                  className="w-4 h-4 rounded-full border border-gray-400"
                  style={{
                    backgroundColor: `rgb(${curve.color_rgb?.join(',') || '128,128,128'})`
                  }}
                />
                {/* 曲线名称 */}
                <span className="text-sm font-medium">{curve.name}</span>
              </button>

              {/* 可见性切换 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleCurveVisibilityToggle(curve.id)
                }}
                className="ml-1 text-lg hover:scale-110 transition"
                title={curve.visible ? '隐藏' : '显示'}
              >
                {curve.visible ? '👁️' : '🚫'}
              </button>

              {/* 删除按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteLayer(curve.id)
                }}
                className="ml-1 text-red-500 hover:text-red-700 hover:scale-110 transition"
                title="删除图层"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 状态消息 */}
      {message && (
        <div className={`mb-3 p-2 rounded text-sm ${
          message.includes('失败') || message.includes('错误')
            ? 'bg-red-100 text-red-700'
            : 'bg-green-100 text-green-700'
        }`}>
          {message}
        </div>
      )}

      {/* 画布区域 */}
      <div
        className="border border-gray-300 rounded-lg overflow-hidden bg-gray-50"
        style={{ width: stageSize.width, height: stageSize.height }}
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          scaleX={scale}
          scaleY={scale}
          x={stagePos.x}
          y={stagePos.y}
          draggable={tool === 'select'}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDragEnd={(e) => {
            setStagePos({
              x: e.target.x(),
              y: e.target.y()
            })
          }}
          style={{ cursor: tool === 'select' ? 'grab' : 'crosshair' }}
        >
          <Layer>
            {/* 原始图像 */}
            {image && (
              <KonvaImage
                image={image}
                width={stageSize.width}
                height={stageSize.height}
              />
            )}
          </Layer>

          {/* 曲线轮廓层 */}
          <Layer>
            {imageSize.width > 0 && renderCurveLines()}
            {renderAxes()}
            {renderDrawingLine()}
            {renderBoxSelection()}
          </Layer>
        </Stage>
      </div>

      {/* 底部控制 */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setScale(1)
              setStagePos({ x: 0, y: 0 })
            }}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
          >
            重置视图
          </button>
          <span className="text-sm text-gray-600">缩放: {Math.round(scale * 100)}%</span>
        </div>

        {selectedCurveId && (
          <div className="text-sm text-gray-600">
            已选择: <span className="font-medium">{curves.find(c => c.id === selectedCurveId)?.name}</span>
            {' | '}
            轮廓点数: <span className="font-medium">{curves.find(c => c.id === selectedCurveId)?.skeleton_points?.length || 0}</span>
          </div>
        )}
      </div>

      {/* 使用说明 */}
      {curves.length === 0 && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
          <h4 className="font-semibold mb-2">📖 使用说明 (v3.0):</h4>
          <ol className="list-decimal list-inside space-y-1">
            <li>点击 <strong>"自动检测曲线"</strong> 识别图中所有颜色曲线，或点击 <strong>"新建图层"</strong> 手动创建</li>
            <li>点击 <strong>图层按钮</strong> 选择要编辑的图层</li>
            <li>使用 <strong>✏️ 绘制工具</strong> 补充断裂的轮廓线（自动连接端点）</li>
            <li>使用 <strong>🧹 擦除工具</strong> 删除错误的轮廓部分</li>
            <li>使用 <strong>⬚ 框选删除</strong> 批量删除区域内的线段</li>
            <li>使用 <strong>Ctrl+Z / Ctrl+Y</strong> 撤回/重做操作</li>
            <li>调整 <strong>线段粗细、透明度、采样密度、平滑度</strong> 等参数</li>
            <li>编辑完成后点击 <strong>"提取数据"</strong> 获取曲线数据</li>
          </ol>
          <div className="mt-3 pt-3 border-t border-blue-200">
            <p className="font-semibold mb-1">✨ 新功能:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>端点自动匹配：绘制时靠近端点会自动连接</li>
              <li>框选删除：支持删除不连续线段</li>
              <li>显示坐标轴：查看 XY 轴校准信息</li>
              <li>历史记录：支持无限次撤回/重做</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default LayerEditor
