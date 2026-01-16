import { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect } from 'react-konva'
import useImage from 'use-image'

const API_BASE = 'http://localhost:8000'

/**
 * LayerEditor - Photoshop 风格的图层编辑器
 *
 * 功能:
 * - 自动分层 (K-Means)
 * - 图层列表管理 (显隐、选择、删除)
 * - 工具箱: 画笔、橡皮、魔棒 (SAM)
 * - 实时预览合成效果
 * - 导出图层用于数据提取
 */
const LayerEditor = ({
  sessionId,
  imageUrl,
  onLayerSelect,
  onExtractFromLayer,
  calibrationPoints
}) => {
  // ========== 状态管理 ==========
  const [layers, setLayers] = useState([]) // 图层列表
  const [selectedLayerId, setSelectedLayerId] = useState(null) // 当前选中图层
  const [tool, setTool] = useState('select') // 当前工具: select, brush, eraser, magic_wand
  const [brushSize, setBrushSize] = useState(10)
  const [isDrawing, setIsDrawing] = useState(false)
  const [compositePreview, setCompositePreview] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Canvas 相关
  const [image] = useImage(imageUrl, 'anonymous')
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [scale, setScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const stageRef = useRef(null)
  const drawingLayerRef = useRef(null)
  const lastPointRef = useRef(null)

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
    }
  }, [image])

  // ========== 自动分层 ==========
  const handleAutoDetectLayers = async () => {
    if (!sessionId) {
      setMessage('请先上传图片')
      return
    }

    setIsLoading(true)
    setMessage('正在自动识别颜色图层...')

    try {
      const response = await fetch(`${API_BASE}/process/auto-layers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          k: 5,
          exclude_background: true,
          min_saturation: 30
        })
      })

      const data = await response.json()

      if (data.success) {
        // 转换图层数据格式
        const newLayers = data.layers.map((layer, index) => ({
          id: `layer_${Date.now()}_${index}`,
          name: layer.name,
          maskBase64: layer.mask,
          colorRgb: layer.color_rgb,
          colorHsv: layer.color_hsv,
          opacity: 0.5,
          visible: true,
          locked: false,
          pixelCount: layer.pixel_count,
          percentage: layer.percentage
        }))

        setLayers(newLayers)
        if (newLayers.length > 0) {
          setSelectedLayerId(newLayers[0].id)
        }
        setMessage(`成功识别 ${newLayers.length} 个颜色图层`)

        // 生成合成预览
        updateCompositePreview(newLayers, newLayers[0]?.id)
      } else {
        setMessage(`自动分层失败: ${data.message}`)
      }
    } catch (error) {
      setMessage(`自动分层错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // ========== 魔棒工具 (SAM) ==========
  const handleMagicWandClick = async (x, y) => {
    if (!sessionId || !selectedLayerId) {
      setMessage('请先选择一个图层')
      return
    }

    setIsLoading(true)
    setMessage('正在智能分割...')

    try {
      // 转换坐标到原图尺寸
      const imageX = Math.round((x - stagePos.x) / scale)
      const imageY = Math.round((y - stagePos.y) / scale)

      const response = await fetch(`${API_BASE}/process/sam-predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          point_x: imageX,
          point_y: imageY,
          point_label: 1
        })
      })

      const data = await response.json()

      if (data.success) {
        // 合并到当前图层
        await mergeMaskToLayer(selectedLayerId, data.mask, 'union')
        setMessage('智能分割成功，已合并到当前图层')
      } else {
        setMessage(`智能分割失败: ${data.message}`)
      }
    } catch (error) {
      setMessage(`智能分割错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // ========== 合并掩码到图层 ==========
  const mergeMaskToLayer = async (layerId, newMaskBase64, operation = 'union') => {
    const layer = layers.find(l => l.id === layerId)
    if (!layer) return

    try {
      const response = await fetch(`${API_BASE}/process/mask-operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          mask1_base64: layer.maskBase64,
          mask2_base64: newMaskBase64,
          operation: operation,
          kernel_size: 3
        })
      })

      const data = await response.json()

      if (data.success) {
        // 更新图层掩码
        const updatedLayers = layers.map(l =>
          l.id === layerId
            ? { ...l, maskBase64: data.mask, pixelCount: data.pixel_count }
            : l
        )
        setLayers(updatedLayers)
        updateCompositePreview(updatedLayers, selectedLayerId)
      }
    } catch (error) {
      console.error('合并掩码失败:', error)
    }
  }

  // ========== 画笔/橡皮绘制 ==========
  const handleMouseDown = (e) => {
    if (tool === 'select') return

    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    if (tool === 'magic_wand') {
      handleMagicWandClick(pos.x, pos.y)
      return
    }

    if (tool === 'brush' || tool === 'eraser') {
      if (!selectedLayerId) {
        setMessage('请先选择一个图层')
        return
      }
      setIsDrawing(true)
      lastPointRef.current = pos
    }
  }

  const handleMouseMove = (e) => {
    if (!isDrawing || (tool !== 'brush' && tool !== 'eraser')) return

    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()
    const layer = drawingLayerRef.current

    if (layer && lastPointRef.current) {
      const context = layer.getContext()
      context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
      context.strokeStyle = tool === 'brush' ? 'white' : 'black'
      context.lineWidth = brushSize
      context.lineCap = 'round'
      context.lineJoin = 'round'

      context.beginPath()
      context.moveTo(lastPointRef.current.x, lastPointRef.current.y)
      context.lineTo(pos.x, pos.y)
      context.stroke()

      lastPointRef.current = pos
      layer.batchDraw()
    }
  }

  const handleMouseUp = async () => {
    if (!isDrawing) return
    setIsDrawing(false)

    // 将绘制内容保存到图层
    if (drawingLayerRef.current && selectedLayerId) {
      await saveDrawingToLayer()
    }
  }

  const saveDrawingToLayer = async () => {
    // 这里需要将 Canvas 绘制转换为掩码并上传
    // 简化实现：直接更新预览
    updateCompositePreview(layers, selectedLayerId)
  }

  // ========== 更新合成预览 ==========
  const updateCompositePreview = async (layerList, selectedId) => {
    if (!sessionId || layerList.length === 0) return

    try {
      const response = await fetch(`${API_BASE}/process/composite-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          layers: layerList.map(l => ({
            name: l.name,
            mask: l.maskBase64,
            color_rgb: l.colorRgb,
            opacity: l.opacity,
            visible: l.visible
          })),
          selected_layer: layerList.find(l => l.id === selectedId)?.name
        })
      })

      const data = await response.json()

      if (data.success) {
        setCompositePreview(data.preview)
      }
    } catch (error) {
      console.error('更新预览失败:', error)
    }
  }

  // ========== 图层操作 ==========
  const handleLayerVisibilityToggle = (layerId) => {
    const updatedLayers = layers.map(l =>
      l.id === layerId ? { ...l, visible: !l.visible } : l
    )
    setLayers(updatedLayers)
    updateCompositePreview(updatedLayers, selectedLayerId)
  }

  const handleLayerOpacityChange = (layerId, opacity) => {
    const updatedLayers = layers.map(l =>
      l.id === layerId ? { ...l, opacity: parseFloat(opacity) } : l
    )
    setLayers(updatedLayers)
    updateCompositePreview(updatedLayers, selectedLayerId)
  }

  const handleLayerDelete = (layerId) => {
    const updatedLayers = layers.filter(l => l.id !== layerId)
    setLayers(updatedLayers)
    if (selectedLayerId === layerId) {
      setSelectedLayerId(updatedLayers[0]?.id || null)
    }
    updateCompositePreview(updatedLayers, selectedLayerId)
  }

  const handleLayerSelect = (layerId) => {
    setSelectedLayerId(layerId)
    const layer = layers.find(l => l.id === layerId)
    if (layer && onLayerSelect) {
      onLayerSelect(layer)
    }
  }

  // ========== 从图层提取数据 ==========
  const handleExtractFromSelectedLayer = async () => {
    if (!selectedLayerId || !calibrationPoints) {
      setMessage('请先选择图层并完成校准')
      return
    }

    const layer = layers.find(l => l.id === selectedLayerId)
    if (!layer) return

    setIsLoading(true)
    setMessage('正在从图层提取数据...')

    try {
      const response = await fetch(`${API_BASE}/extract/mask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          mask_base64: layer.maskBase64,
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
          direction: 'auto'
        })
      })

      const data = await response.json()

      if (data.success) {
        setMessage(`成功提取 ${data.count} 个数据点`)
        if (onExtractFromLayer) {
          onExtractFromLayer(data.data, layer)
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

  // ========== 渲染 ==========
  return (
    <div className="layer-editor flex gap-4">
      {/* 左侧：工具栏和图层列表 */}
      <div className="sidebar w-64 bg-white rounded-lg shadow-lg p-4 space-y-4">
        {/* 自动分层按钮 */}
        <button
          onClick={handleAutoDetectLayers}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
        >
          🎨 自动分层
        </button>

        {/* 工具箱 */}
        <div className="tools space-y-2">
          <h3 className="font-semibold text-gray-700">工具箱</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setTool('select')}
              className={`px-3 py-2 rounded ${tool === 'select' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              ↖️ 选择
            </button>
            <button
              onClick={() => setTool('brush')}
              className={`px-3 py-2 rounded ${tool === 'brush' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              🖌️ 画笔
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`px-3 py-2 rounded ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              🧼 橡皮
            </button>
            <button
              onClick={() => setTool('magic_wand')}
              className={`px-3 py-2 rounded ${tool === 'magic_wand' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              🪄 魔棒
            </button>
          </div>

          {/* 画笔大小 */}
          {(tool === 'brush' || tool === 'eraser') && (
            <div className="mt-2">
              <label className="text-sm text-gray-600">画笔大小: {brushSize}px</label>
              <input
                type="range"
                min="1"
                max="50"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* 图层列表 */}
        <div className="layers space-y-2">
          <h3 className="font-semibold text-gray-700">图层列表</h3>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {layers.map((layer) => (
              <div
                key={layer.id}
                className={`layer-item p-2 rounded border ${
                  selectedLayerId === layer.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
                onClick={() => handleLayerSelect(layer.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    {/* 可见性切换 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLayerVisibilityToggle(layer.id)
                      }}
                      className="text-lg"
                    >
                      {layer.visible ? '👁️' : '🚫'}
                    </button>

                    {/* 颜色预览 */}
                    <div
                      className="w-4 h-4 rounded border border-gray-300"
                      style={{ backgroundColor: `rgb(${layer.colorRgb.join(',')})` }}
                    />

                    {/* 图层名称 */}
                    <span className="text-sm font-medium truncate">{layer.name}</span>
                  </div>

                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleLayerDelete(layer.id)
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    🗑️
                  </button>
                </div>

                {/* 不透明度滑块 */}
                <div className="mt-1">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={layer.opacity}
                    onChange={(e) => {
                      e.stopPropagation()
                      handleLayerOpacityChange(layer.id, e.target.value)
                    }}
                    className="w-full"
                  />
                  <div className="text-xs text-gray-500">
                    不透明度: {Math.round(layer.opacity * 100)}%
                  </div>
                </div>

                {/* 像素统计 */}
                <div className="text-xs text-gray-500 mt-1">
                  {layer.pixelCount} 像素 ({layer.percentage}%)
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 提取数据按钮 */}
        {selectedLayerId && calibrationPoints && (
          <button
            onClick={handleExtractFromSelectedLayer}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition"
          >
            📊 提取当前图层数据
          </button>
        )}
      </div>

      {/* 右侧：画布区域 */}
      <div className="canvas-area flex-1 bg-white rounded-lg shadow-lg p-4">
        <div className="mb-2 text-sm text-gray-600">
          {message || '使用工具编辑图层，或点击"自动分层"开始'}
        </div>

        <div className="border border-gray-300 rounded overflow-hidden" style={{ width: stageSize.width, height: stageSize.height }}>
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

              {/* 合成预览 */}
              {compositePreview && (
                <KonvaImage
                  image={compositePreview}
                  width={stageSize.width}
                  height={stageSize.height}
                  opacity={0.7}
                />
              )}
            </Layer>

            {/* 绘制层 */}
            <Layer ref={drawingLayerRef} />
          </Stage>
        </div>

        {/* 缩放控制 */}
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => {
              setScale(1)
              setStagePos({ x: 0, y: 0 })
            }}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
            重置缩放
          </button>
          <span className="text-sm text-gray-600">缩放: {Math.round(scale * 100)}%</span>
        </div>
      </div>
    </div>
  )
}

export default LayerEditor
