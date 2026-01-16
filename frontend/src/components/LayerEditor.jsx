import { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect } from 'react-konva'
import useImage from 'use-image'

const API_BASE = 'http://localhost:8000'

/**
 * LayerEditor - Photoshop 风格的图层编辑器 v2.0
 *
 * 新功能:
 * - 自动检测曲线并显示轮廓线
 * - 颜色按钮切换显示不同曲线
 * - 支持用户编辑轮廓线
 * - 基于编辑后的轮廓提取数据
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
  const [tool, setTool] = useState('select') // 当前工具: select, draw, erase
  const [brushSize, setBrushSize] = useState(5)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingPoints, setDrawingPoints] = useState([]) // 当前绘制的点
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')

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
  const handleMouseDown = (e) => {
    if (tool === 'select') return

    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    if (tool === 'draw' || tool === 'erase') {
      if (!selectedCurveId) {
        setMessage('请先选择一条曲线')
        return
      }
      setIsDrawing(true)
      lastPointRef.current = pos

      // 转换为图像坐标
      const imageX = Math.round((pos.x - stagePos.x) / scale * (imageSize.width / stageSize.width))
      const imageY = Math.round((pos.y - stagePos.y) / scale * (imageSize.height / stageSize.height))
      setDrawingPoints([[imageX, imageY]])
    }
  }

  const handleMouseMove = (e) => {
    if (!isDrawing || (tool !== 'draw' && tool !== 'erase')) return

    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    // 转换为图像坐标
    const imageX = Math.round((pos.x - stagePos.x) / scale * (imageSize.width / stageSize.width))
    const imageY = Math.round((pos.y - stagePos.y) / scale * (imageSize.height / stageSize.height))

    setDrawingPoints(prev => [...prev, [imageX, imageY]])
    lastPointRef.current = pos
  }

  const handleMouseUp = async () => {
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
        newPoints = [...curve.skeleton_points, ...drawingPoints]
        // 按 X 排序
        newPoints.sort((a, b) => a[0] - b[0])
      } else {
        // 擦除模式：移除附近的点
        newPoints = curve.skeleton_points.filter(pt => {
          return !drawingPoints.some(dp =>
            Math.abs(pt[0] - dp[0]) < brushSize * 2 &&
            Math.abs(pt[1] - dp[1]) < brushSize * 2
          )
        })
      }

      // 调用后端更新曲线
      const response = await fetch(`${API_BASE}/process/update-curve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          curve_id: selectedCurveId,
          edited_points: newPoints,
          original_mask_base64: curve.mask_base64
        })
      })

      const data = await response.json()

      if (data.success) {
        // 更新曲线数据
        const updatedCurves = curves.map(c =>
          c.id === selectedCurveId
            ? { ...c, skeleton_points: data.curve.skeleton_points, mask_base64: data.curve.mask_base64 }
            : c
        )
        setCurves(updatedCurves)
        updateOverlay(updatedCurves, selectedCurveId)
        setMessage('曲线更新成功')
      } else {
        setMessage(`更新失败: ${data.message}`)
      }
    } catch (error) {
      setMessage(`更新错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
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
          downsample_factor: 1
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

  // ========== 缩放和平移 ==========
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
          strokeWidth={isSelected ? 3 : 2}
          opacity={isSelected ? 1 : 0.7}
          lineCap="round"
          lineJoin="round"
          shadowColor={isSelected ? 'white' : undefined}
          shadowBlur={isSelected ? 5 : 0}
        />
      )
    })
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
            title="绘制工具 - 补充轮廓"
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

      {/* 曲线颜色按钮 */}
      {curves.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-100 rounded-lg">
          <span className="text-sm text-gray-600 self-center mr-2">曲线:</span>
          {curves.map(curve => (
            <button
              key={curve.id}
              onClick={() => handleCurveSelect(curve.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition ${
                selectedCurveId === curve.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 bg-white hover:border-gray-400'
              }`}
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
              {/* 可见性切换 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleCurveVisibilityToggle(curve.id)
                }}
                className="ml-1 text-lg"
                title={curve.visible ? '隐藏' : '显示'}
              >
                {curve.visible ? '👁️' : '🚫'}
              </button>
            </button>
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
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
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
            {renderDrawingLine()}
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
          <h4 className="font-semibold mb-2">使用说明:</h4>
          <ol className="list-decimal list-inside space-y-1">
            <li>点击 <strong>"自动检测曲线"</strong> 识别图中所有颜色曲线</li>
            <li>点击 <strong>颜色按钮</strong> 切换显示不同曲线的轮廓</li>
            <li>使用 <strong>✏️ 绘制工具</strong> 补充断裂的轮廓线</li>
            <li>使用 <strong>🧹 擦除工具</strong> 删除错误的轮廓部分</li>
            <li>编辑完成后点击 <strong>"提取数据"</strong> 获取曲线数据</li>
          </ol>
        </div>
      )}
    </div>
  )
}

export default LayerEditor
