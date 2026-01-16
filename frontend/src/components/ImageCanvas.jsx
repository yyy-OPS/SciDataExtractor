import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text, Rect } from 'react-konva'
import useImage from 'use-image'

const ImageCanvas = ({
  image,
  currentStep,
  calibrationPoints,
  onCalibrationComplete,
  onColorSample,
  extractedData,
  onStepBack,
  aiSuggestedValues,
  onDeletePoints,
  onAddManualPoints,
  extractRegion,
  onSetExtractRegion,
  isManualDrawMode,
  smoothness,
  pointSpacing,
  pointDensity
}) => {
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const [imageObj] = useImage(image)

  // 缩放和平移状态
  const [viewScale, setViewScale] = useState(1)
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 })
  const [baseScale, setBaseScale] = useState(1)
  const [baseOffset, setBaseOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // 校准点击状态
  const [clickedPoints, setClickedPoints] = useState([])
  const [currentCalibrationStep, setCurrentCalibrationStep] = useState(0)
  const [inputValues, setInputValues] = useState({})
  const [showInputModal, setShowInputModal] = useState(false)
  const [tempPoint, setTempPoint] = useState(null)

  // 鼠标位置显示
  const [mousePos, setMousePos] = useState(null)

  // 编辑模式状态
  const [editMode, setEditMode] = useState('none') // 'none', 'delete', 'draw', 'extract-region'
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState(null)
  const [selectionEnd, setSelectionEnd] = useState(null)
  const [drawingPoints, setDrawingPoints] = useState([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStartTime, setDrawStartTime] = useState(null) // 记录按下时间
  const [drawStartPos, setDrawStartPos] = useState(null) // 记录按下位置

  // 提取范围框选状态
  const [extractRegionStart, setExtractRegionStart] = useState(null)
  const [extractRegionEnd, setExtractRegionEnd] = useState(null)

  const containerRef = useRef(null)
  const stageRef = useRef(null)

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Esc键退出编辑模式
      if (e.key === 'Escape' && editMode !== 'none') {
        setEditMode('none')
        // 清理未完成的操作
        setIsSelecting(false)
        setIsDrawing(false)
        setDrawingPoints([])
        setDrawStartTime(null)
        setDrawStartPos(null)
        setSelectionStart(null)
        setSelectionEnd(null)
        setExtractRegionStart(null)
        setExtractRegionEnd(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editMode])

  // 校准步骤标签
  const calibrationLabels = [
    'X轴起点',
    'X轴终点',
    'Y轴起点',
    'Y轴终点'
  ]

  // 响应式画布大小
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth
        setCanvasSize({ width, height: width * 0.75 })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // 计算图像基础缩放和偏移
  useEffect(() => {
    if (imageObj) {
      const scaleX = canvasSize.width / imageObj.width
      const scaleY = canvasSize.height / imageObj.height
      const newScale = Math.min(scaleX, scaleY, 1)

      setBaseScale(newScale)
      setBaseOffset({
        x: (canvasSize.width - imageObj.width * newScale) / 2,
        y: (canvasSize.height - imageObj.height * newScale) / 2
      })
      // 重置视图
      setViewScale(1)
      setViewOffset({ x: 0, y: 0 })
    }
  }, [imageObj, canvasSize])

  // 当步骤变化时重置校准状态
  useEffect(() => {
    if (currentStep === 2) {
      // 如果回到校准步骤，重置校准点
      if (clickedPoints.length === 4 && !calibrationPoints.xStart) {
        setClickedPoints([])
        setCurrentCalibrationStep(0)
      }
    }
  }, [currentStep, calibrationPoints])

  // 计算实际显示的缩放和偏移
  const totalScale = baseScale * viewScale
  const totalOffset = {
    x: baseOffset.x * viewScale + viewOffset.x,
    y: baseOffset.y * viewScale + viewOffset.y
  }

  // 优化：对数据点进行采样以提高性能
  const sampledData = useMemo(() => {
    if (!extractedData || extractedData.length === 0) return []

    const MAX_POINTS = 500 // 最多显示500个点
    if (extractedData.length <= MAX_POINTS) return extractedData

    // 采样策略：均匀采样
    const step = Math.ceil(extractedData.length / MAX_POINTS)
    return extractedData.filter((_, index) => index % step === 0)
  }, [extractedData])

  // 像素坐标转物理坐标
  const pixelToPhysical = useCallback((pixelX, pixelY) => {
    if (!calibrationPoints.xStart) return null

    const xStart = calibrationPoints.xStart
    const xEnd = calibrationPoints.xEnd
    const yStart = calibrationPoints.yStart
    const yEnd = calibrationPoints.yEnd

    const xScale = (xEnd.value - xStart.value) / (xEnd.pixel.x - xStart.pixel.x)
    const yScale = (yEnd.value - yStart.value) / (yEnd.pixel.y - yStart.pixel.y)

    const physicalX = xStart.value + (pixelX - xStart.pixel.x) * xScale
    const physicalY = yStart.value + (pixelY - yStart.pixel.y) * yScale

    return { x: physicalX, y: physicalY }
  }, [calibrationPoints])

  // 物理坐标转像素坐标
  const physicalToPixel = useCallback((physicalX, physicalY) => {
    if (!calibrationPoints.xStart) return null

    const xStart = calibrationPoints.xStart
    const xEnd = calibrationPoints.xEnd
    const yStart = calibrationPoints.yStart
    const yEnd = calibrationPoints.yEnd

    const xScale = (xEnd.pixel.x - xStart.pixel.x) / (xEnd.value - xStart.value)
    const yScale = (yEnd.pixel.y - yStart.pixel.y) / (yEnd.value - yStart.value)

    const pixelX = xStart.pixel.x + (physicalX - xStart.value) * xScale
    const pixelY = yStart.pixel.y + (physicalY - yStart.value) * yScale

    return { x: pixelX, y: pixelY }
  }, [calibrationPoints])

  // 手动绘制曲线的平滑算法
  const smoothDrawnCurve = useCallback((points, smoothFactor = 0.5) => {
    if (points.length < 3) return points

    // 1. 基于点间距进行采样
    let sampledPoints = points
    const spacing = Math.max(1, pointSpacing || 1)
    if (spacing > 1) {
      sampledPoints = points.filter((_, index) => index % spacing === 0)
    }

    // 2. 根据密集度进一步调整
    if (pointDensity === 'low' && sampledPoints.length > 100) {
      const step = Math.ceil(sampledPoints.length / 100)
      sampledPoints = sampledPoints.filter((_, index) => index % step === 0)
    }

    if (sampledPoints.length < 3) return sampledPoints

    // 3. 应用移动平均平滑
    const windowSize = Math.max(3, Math.min(11, Math.floor(sampledPoints.length * smoothFactor * 0.3)))
    if (windowSize >= 3) {
      const smoothed = []
      for (let i = 0; i < sampledPoints.length; i++) {
        const start = Math.max(0, i - Math.floor(windowSize / 2))
        const end = Math.min(sampledPoints.length, i + Math.floor(windowSize / 2) + 1)
        const window = sampledPoints.slice(start, end)

        const avgX = window.reduce((sum, p) => sum + p.x, 0) / window.length
        const avgY = window.reduce((sum, p) => sum + p.y, 0) / window.length

        smoothed.push({ x: avgX, y: avgY })
      }
      sampledPoints = smoothed
    }

    // 4. 应用 Savitzky-Golay 类似的二次多项式平滑
    if (sampledPoints.length > 5 && smoothFactor > 0.3) {
      const smoothed = []
      for (let i = 0; i < sampledPoints.length; i++) {
        const left = Math.max(0, i - 2)
        const right = Math.min(sampledPoints.length - 1, i + 2)

        if (i === 0 || i === sampledPoints.length - 1) {
          smoothed.push(sampledPoints[i])
        } else {
          // 简单的二次多项式拟合
          const weights = [1, 2, 3, 2, 1]
          let weightedX = 0
          let weightedY = 0
          let weightSum = 0

          for (let j = left; j <= right; j++) {
            const weightIndex = j - i + 2
            const weight = weights[weightIndex] || 1
            weightedX += sampledPoints[j].x * weight
            weightedY += sampledPoints[j].y * weight
            weightSum += weight
          }

          smoothed.push({
            x: weightedX / weightSum,
            y: weightedY / weightSum
          })
        }
      }
      sampledPoints = smoothed
    }

    return sampledPoints
  }, [pointSpacing, pointDensity])

  // 处理鼠标滚轮缩放
  const handleWheel = useCallback((e) => {
    e.evt.preventDefault()

    const stage = stageRef.current
    if (!stage) return

    const oldScale = viewScale
    const pointer = stage.getPointerPosition()

    const mousePointTo = {
      x: (pointer.x - totalOffset.x) / totalScale,
      y: (pointer.y - totalOffset.y) / totalScale
    }

    // 缩放因子
    const scaleBy = 1.1
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy

    // 限制缩放范围
    const clampedScale = Math.max(0.5, Math.min(5, newScale))
    setViewScale(clampedScale)

    // 调整偏移以保持鼠标位置不变
    const newTotalScale = baseScale * clampedScale
    setViewOffset({
      x: pointer.x - mousePointTo.x * newTotalScale - baseOffset.x * clampedScale,
      y: pointer.y - mousePointTo.y * newTotalScale - baseOffset.y * clampedScale
    })
  }, [viewScale, totalScale, totalOffset, baseScale, baseOffset])

  // 处理画布点击
  const handleCanvasClick = (e) => {
    if (!imageObj || isDragging || isSelecting || isDrawing) return

    const stage = e.target.getStage()
    const pointerPosition = stage.getPointerPosition()

    // 转换为图像坐标
    const imageX = (pointerPosition.x - totalOffset.x) / totalScale
    const imageY = (pointerPosition.y - totalOffset.y) / totalScale

    // 边界检查
    if (imageX < 0 || imageX > imageObj.width || imageY < 0 || imageY > imageObj.height) {
      return
    }

    if (currentStep === 2) {
      handleCalibrationClick(imageX, imageY)
    } else if (currentStep === 3) {
      onColorSample(imageX, imageY)
    }
  }

  // 处理鼠标按下
  const handleMouseDown = (e) => {
    if (!imageObj) return

    const stage = e.target.getStage()
    const pointer = stage.getPointerPosition()
    const imageX = (pointer.x - totalOffset.x) / totalScale
    const imageY = (pointer.y - totalOffset.y) / totalScale

    // 边界检查
    if (imageX < 0 || imageX > imageObj.width || imageY < 0 || imageY > imageObj.height) {
      return
    }

    // 框选提取范围模式
    if (editMode === 'extract-region') {
      setIsSelecting(true)
      setExtractRegionStart({ x: imageX, y: imageY })
      setExtractRegionEnd({ x: imageX, y: imageY })
      e.evt.preventDefault()
      return
    }

    // 框选删除模式
    if (editMode === 'delete' && extractedData.length > 0) {
      setIsSelecting(true)
      setSelectionStart({ x: imageX, y: imageY })
      setSelectionEnd({ x: imageX, y: imageY })
      e.evt.preventDefault()
      return
    }

    // 手动重描模式
    if (editMode === 'draw' && calibrationPoints.xStart) {
      setDrawStartTime(Date.now())
      setDrawStartPos({ x: imageX, y: imageY })
      setDrawingPoints([{ x: imageX, y: imageY }])
      e.evt.preventDefault()
      return
    }

    // 拖拽平移模式
    if (e.evt.button === 1 || e.evt.button === 2 || e.evt.ctrlKey) {
      setIsDragging(true)
      setDragStart({
        x: e.evt.clientX - viewOffset.x,
        y: e.evt.clientY - viewOffset.y
      })
      e.evt.preventDefault()
    }
  }

  // 处理鼠标移动
  const handleMouseMove = (e) => {
    const stage = stageRef.current
    if (!stage || !imageObj) return

    const pointer = stage.getPointerPosition()
    if (pointer) {
      const imageX = (pointer.x - totalOffset.x) / totalScale
      const imageY = (pointer.y - totalOffset.y) / totalScale

      if (imageX >= 0 && imageX <= imageObj.width && imageY >= 0 && imageY <= imageObj.height) {
        setMousePos({ x: Math.round(imageX), y: Math.round(imageY) })
      } else {
        setMousePos(null)
      }
    }

    // 框选提取范围
    if (isSelecting && extractRegionStart) {
      const imageX = (pointer.x - totalOffset.x) / totalScale
      const imageY = (pointer.y - totalOffset.y) / totalScale
      setExtractRegionEnd({ x: imageX, y: imageY })
      return
    }

    // 框选删除
    if (isSelecting && selectionStart) {
      const imageX = (pointer.x - totalOffset.x) / totalScale
      const imageY = (pointer.y - totalOffset.y) / totalScale
      setSelectionEnd({ x: imageX, y: imageY })
      return
    }

    // 手动重描
    if (drawingPoints.length > 0 && drawStartPos) {
      const imageX = (pointer.x - totalOffset.x) / totalScale
      const imageY = (pointer.y - totalOffset.y) / totalScale

      // 检查是否移动了足够的距离（超过5像素）或时间（超过150ms）
      const distance = Math.sqrt(
        Math.pow(imageX - drawStartPos.x, 2) + Math.pow(imageY - drawStartPos.y, 2)
      )
      const timeDiff = Date.now() - drawStartTime

      // 如果移动距离超过5像素或时间超过150ms，进入绘制模式
      if (distance > 5 || timeDiff > 150) {
        if (!isDrawing) {
          setIsDrawing(true)
        }
        setDrawingPoints([...drawingPoints, { x: imageX, y: imageY }])
      }
      return
    }

    // 拖拽平移
    if (isDragging) {
      setViewOffset({
        x: e.evt.clientX - dragStart.x,
        y: e.evt.clientY - dragStart.y
      })
    }
  }

  // 处理鼠标释放
  const handleMouseUp = () => {
    // 完成框选提取范围
    if (isSelecting && extractRegionStart && extractRegionEnd) {
      const x = Math.min(extractRegionStart.x, extractRegionEnd.x)
      const y = Math.min(extractRegionStart.y, extractRegionEnd.y)
      const width = Math.abs(extractRegionEnd.x - extractRegionStart.x)
      const height = Math.abs(extractRegionEnd.y - extractRegionStart.y)

      if (width > 10 && height > 10 && onSetExtractRegion) {
        onSetExtractRegion({ x, y, width, height })
      }

      setIsSelecting(false)
      setExtractRegionStart(null)
      setExtractRegionEnd(null)
      return
    }

    // 完成框选删除
    if (isSelecting && selectionStart && selectionEnd) {
      const minX = Math.min(selectionStart.x, selectionEnd.x)
      const maxX = Math.max(selectionStart.x, selectionEnd.x)
      const minY = Math.min(selectionStart.y, selectionEnd.y)
      const maxY = Math.max(selectionStart.y, selectionEnd.y)

      // 转��为物理坐标
      const minPhysical = pixelToPhysical(minX, minY)
      const maxPhysical = pixelToPhysical(maxX, maxY)

      if (minPhysical && maxPhysical && onDeletePoints) {
        // 找出在选择框内的点的索引
        const indicesToDelete = []
        extractedData.forEach((point, index) => {
          const pMinX = Math.min(minPhysical.x, maxPhysical.x)
          const pMaxX = Math.max(minPhysical.x, maxPhysical.x)
          const pMinY = Math.min(minPhysical.y, maxPhysical.y)
          const pMaxY = Math.max(minPhysical.y, maxPhysical.y)

          if (point.x >= pMinX && point.x <= pMaxX && point.y >= pMinY && point.y <= pMaxY) {
            indicesToDelete.push(index)
          }
        })

        if (indicesToDelete.length > 0) {
          onDeletePoints(indicesToDelete)
        }
      }

      setIsSelecting(false)
      setSelectionStart(null)
      setSelectionEnd(null)
    }

    // 完成手动重描
    if (drawingPoints.length > 0) {
      // 判断是单点还是路径
      if (!isDrawing && drawingPoints.length === 1) {
        // 单点模式：只添加一个点
        const physicalPoint = pixelToPhysical(drawingPoints[0].x, drawingPoints[0].y)
        if (physicalPoint && onAddManualPoints) {
          onAddManualPoints([physicalPoint])
        }
      } else if (isDrawing && drawingPoints.length > 1) {
        // 路径模式：应用平滑算法
        const physicalPoints = drawingPoints
          .map(p => pixelToPhysical(p.x, p.y))
          .filter(p => p !== null)

        if (physicalPoints.length > 0) {
          // 应用平滑算法
          const smoothedPoints = smoothDrawnCurve(physicalPoints, smoothness || 0.5)

          if (onAddManualPoints) {
            onAddManualPoints(smoothedPoints)
          }
        }
      }

      setIsDrawing(false)
      setDrawingPoints([])
      setDrawStartTime(null)
      setDrawStartPos(null)
    }

    setIsDragging(false)
  }

  // 处理校准点击
  const handleCalibrationClick = (x, y) => {
    if (currentCalibrationStep >= 4) return

    setTempPoint({ x, y })

    // 如果有 AI 建议的值，预填充
    let suggestedValue = ''
    if (aiSuggestedValues) {
      if (currentCalibrationStep === 0 && aiSuggestedValues.x_axis) {
        suggestedValue = aiSuggestedValues.x_axis.min_value
      } else if (currentCalibrationStep === 1 && aiSuggestedValues.x_axis) {
        suggestedValue = aiSuggestedValues.x_axis.max_value
      } else if (currentCalibrationStep === 2 && aiSuggestedValues.y_axis) {
        suggestedValue = aiSuggestedValues.y_axis.min_value
      } else if (currentCalibrationStep === 3 && aiSuggestedValues.y_axis) {
        suggestedValue = aiSuggestedValues.y_axis.max_value
      }
    }

    setInputValues({ ...inputValues, [currentCalibrationStep]: suggestedValue })
    setShowInputModal(true)
  }

  // 提交校准值
  const handleValueSubmit = (value) => {
    if (tempPoint === null || value === '' || isNaN(parseFloat(value))) return

    const newPoint = {
      pixel: { x: tempPoint.x, y: tempPoint.y },
      value: parseFloat(value),
      label: calibrationLabels[currentCalibrationStep]
    }

    const newClickedPoints = [...clickedPoints, newPoint]
    setClickedPoints(newClickedPoints)

    const newStep = currentCalibrationStep + 1
    setCurrentCalibrationStep(newStep)
    setShowInputModal(false)
    setTempPoint(null)

    if (newStep === 4) {
      onCalibrationComplete({
        xStart: newClickedPoints[0],
        xEnd: newClickedPoints[1],
        yStart: newClickedPoints[2],
        yEnd: newClickedPoints[3]
      })
    }
  }

  // 撤销上一个校准点
  const handleUndoCalibration = () => {
    if (clickedPoints.length > 0) {
      const newPoints = clickedPoints.slice(0, -1)
      setClickedPoints(newPoints)
      setCurrentCalibrationStep(newPoints.length)
    }
  }

  // 重置缩放
  const handleResetZoom = () => {
    setViewScale(1)
    setViewOffset({ x: 0, y: 0 })
  }

  return (
    <div ref={containerRef} className="relative">
      {/* 当前步骤提示 */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
        {currentStep === 1 && <p className="text-blue-700">请上传图像</p>}
        {currentStep === 2 && (
          <div className="flex items-center justify-between">
            <p className="text-blue-700">
              校准步骤 {currentCalibrationStep + 1}/4: 请点击 <strong>{calibrationLabels[currentCalibrationStep]}</strong>
            </p>
            {clickedPoints.length > 0 && (
              <button
                onClick={handleUndoCalibration}
                className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                撤销
              </button>
            )}
          </div>
        )}
        {currentStep === 3 && <p className="text-blue-700">请点击要提取的曲线以采样颜色</p>}
        {currentStep === 4 && <p className="text-green-700">采样完成，可以提取数据</p>}
      </div>

      {/* 缩放控制栏 */}
      {image && (
        <div className="mb-2 space-y-2">
          {/* 缩放控制 */}
          <div className="flex items-center justify-between bg-gray-100 rounded-lg p-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewScale(Math.max(0.5, viewScale / 1.2))}
                className="p-1 bg-white rounded hover:bg-gray-200"
                title="缩小"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="text-sm font-medium w-16 text-center">{Math.round(viewScale * 100)}%</span>
              <button
                onClick={() => setViewScale(Math.min(5, viewScale * 1.2))}
                className="p-1 bg-white rounded hover:bg-gray-200"
                title="放大"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={handleResetZoom}
                className="p-1 bg-white rounded hover:bg-gray-200 ml-2"
                title="重置缩放"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <div className="text-xs text-gray-500">
              {mousePos && <span>像素: ({mousePos.x}, {mousePos.y})</span>}
              <span className="ml-2">滚轮缩放 | Ctrl+拖拽平移</span>
            </div>
          </div>

          {/* 编辑模式控制 - 根据当前步骤显示不同选项 */}
          {currentStep >= 3 && (
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-2">
              <span className="text-sm text-gray-600">编辑模式:</span>
              <button
                onClick={() => setEditMode('none')}
                className={`px-3 py-1 text-sm rounded transition ${
                  editMode === 'none'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-200'
                }`}
              >
                正常
              </button>

              {/* 框选提取范围 - 仅在采样后显示 */}
              {currentStep >= 3 && (
                <>
                  <button
                    onClick={() => setEditMode('extract-region')}
                    className={`px-3 py-1 text-sm rounded transition ${
                      editMode === 'extract-region'
                        ? 'bg-purple-500 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-200'
                    }`}
                    title="框选数据提取范围，避免提取标题等区域"
                  >
                    框选范围
                  </button>
                  {extractRegion && (
                    <button
                      onClick={() => onSetExtractRegion && onSetExtractRegion(null)}
                      className="px-3 py-1 text-sm rounded bg-orange-500 text-white hover:bg-orange-600 transition"
                      title="清除已设置的提取范围"
                    >
                      清除范围
                    </button>
                  )}
                </>
              )}

              {/* 框选删除 - 仅在有数据时显示 */}
              {extractedData.length > 0 && (
                <button
                  onClick={() => setEditMode('delete')}
                  className={`px-3 py-1 text-sm rounded transition ${
                    editMode === 'delete'
                      ? 'bg-red-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-200'
                  }`}
                  title="拖拽框选要删除的数据点区域"
                >
                  框选删除
                </button>
              )}

              {/* 手动绘制 - 需要校准后 */}
              <button
                onClick={() => setEditMode('draw')}
                disabled={!calibrationPoints.xStart}
                className={`px-3 py-1 text-sm rounded transition ${
                  editMode === 'draw'
                    ? 'bg-green-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
                title="单击添加单点，长按拖动绘制路径"
              >
                手动绘制
              </button>

              {editMode !== 'none' && (
                <span className="text-xs text-gray-600 ml-2">
                  {editMode === 'extract-region' && '拖拽框选数据提取范围'}
                  {editMode === 'delete' && '拖拽框选要删除的区域'}
                  {editMode === 'draw' && '单击添加单点，长按拖动绘制路径'}
                  <span className="ml-2 text-gray-400">| 按 Esc 退出</span>
                </span>
              )}

              {extractedData.length > 500 && (
                <span className="text-xs text-orange-600 ml-auto">
                  显示已采样 ({sampledData.length}/{extractedData.length} 点)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Konva 画布 */}
      <div
        className={`border-2 rounded-lg overflow-hidden bg-gray-50 ${
          editMode === 'delete' ? 'border-red-400 cursor-crosshair' :
          editMode === 'draw' ? 'border-green-400 cursor-crosshair' :
          editMode === 'extract-region' ? 'border-purple-400 cursor-crosshair' :
          'border-gray-300'
        }`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Stage
          ref={stageRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <Layer>
            {/* 显示图像 */}
            {imageObj && (
              <KonvaImage
                image={imageObj}
                x={totalOffset.x}
                y={totalOffset.y}
                scaleX={totalScale}
                scaleY={totalScale}
              />
            )}

            {/* 显示校准点 */}
            {clickedPoints.map((point, index) => (
              <Circle
                key={index}
                x={totalOffset.x + point.pixel.x * totalScale}
                y={totalOffset.y + point.pixel.y * totalScale}
                radius={8 / viewScale}
                fill="red"
                stroke="white"
                strokeWidth={2 / viewScale}
              />
            ))}

            {/* 显示校准点标签 */}
            {clickedPoints.map((point, index) => (
              <Text
                key={`label-${index}`}
                x={totalOffset.x + point.pixel.x * totalScale + 12}
                y={totalOffset.y + point.pixel.y * totalScale - 8}
                text={`${point.label}: ${point.value}`}
                fontSize={14 / viewScale}
                fill="red"
                fontStyle="bold"
              />
            ))}

            {/* 显示校准线 */}
            {clickedPoints.length >= 2 && (
              <Line
                points={[
                  totalOffset.x + clickedPoints[0].pixel.x * totalScale,
                  totalOffset.y + clickedPoints[0].pixel.y * totalScale,
                  totalOffset.x + clickedPoints[1].pixel.x * totalScale,
                  totalOffset.y + clickedPoints[1].pixel.y * totalScale
                ]}
                stroke="red"
                strokeWidth={2 / viewScale}
                dash={[5 / viewScale, 5 / viewScale]}
              />
            )}

            {clickedPoints.length >= 4 && (
              <Line
                points={[
                  totalOffset.x + clickedPoints[2].pixel.x * totalScale,
                  totalOffset.y + clickedPoints[2].pixel.y * totalScale,
                  totalOffset.x + clickedPoints[3].pixel.x * totalScale,
                  totalOffset.y + clickedPoints[3].pixel.y * totalScale
                ]}
                stroke="red"
                strokeWidth={2 / viewScale}
                dash={[5 / viewScale, 5 / viewScale]}
              />
            )}

            {/* 显示提取的数据点 - 使用采样数据优化性能 */}
            {sampledData.length > 0 &&
              sampledData.map((point, index) => {
                const pixelPos = physicalToPixel(point.x, point.y)
                if (!pixelPos) return null

                return (
                  <Circle
                    key={`data-${index}`}
                    x={totalOffset.x + pixelPos.x * totalScale}
                    y={totalOffset.y + pixelPos.y * totalScale}
                    radius={3 / viewScale}
                    fill="lime"
                    stroke="darkgreen"
                    strokeWidth={1 / viewScale}
                    opacity={0.9}
                    perfectDrawEnabled={false}
                  />
                )
              })}

            {/* 框选矩形 - 删除模式 */}
            {isSelecting && selectionStart && selectionEnd && editMode === 'delete' && (
              <Rect
                x={totalOffset.x + Math.min(selectionStart.x, selectionEnd.x) * totalScale}
                y={totalOffset.y + Math.min(selectionStart.y, selectionEnd.y) * totalScale}
                width={Math.abs(selectionEnd.x - selectionStart.x) * totalScale}
                height={Math.abs(selectionEnd.y - selectionStart.y) * totalScale}
                fill="rgba(239, 68, 68, 0.2)"
                stroke="#ef4444"
                strokeWidth={2 / viewScale}
                dash={[5 / viewScale, 5 / viewScale]}
              />
            )}

            {/* 框选矩形 - 提取范围模式 */}
            {isSelecting && extractRegionStart && extractRegionEnd && editMode === 'extract-region' && (
              <Rect
                x={totalOffset.x + Math.min(extractRegionStart.x, extractRegionEnd.x) * totalScale}
                y={totalOffset.y + Math.min(extractRegionStart.y, extractRegionEnd.y) * totalScale}
                width={Math.abs(extractRegionEnd.x - extractRegionStart.x) * totalScale}
                height={Math.abs(extractRegionEnd.y - extractRegionStart.y) * totalScale}
                fill="rgba(168, 85, 247, 0.2)"
                stroke="#a855f7"
                strokeWidth={2 / viewScale}
                dash={[5 / viewScale, 5 / viewScale]}
              />
            )}

            {/* 已设置的提取范围 */}
            {extractRegion && !isSelecting && (
              <>
                <Rect
                  x={totalOffset.x + extractRegion.x * totalScale}
                  y={totalOffset.y + extractRegion.y * totalScale}
                  width={extractRegion.width * totalScale}
                  height={extractRegion.height * totalScale}
                  fill="rgba(168, 85, 247, 0.1)"
                  stroke="#a855f7"
                  strokeWidth={2 / viewScale}
                  dash={[10 / viewScale, 10 / viewScale]}
                />
                <Text
                  x={totalOffset.x + extractRegion.x * totalScale + 5}
                  y={totalOffset.y + extractRegion.y * totalScale + 5}
                  text={`提取范围: ${Math.round(extractRegion.width)}×${Math.round(extractRegion.height)} px`}
                  fontSize={14 / viewScale}
                  fill="#a855f7"
                  fontStyle="bold"
                />
              </>
            )}

            {/* 手动绘制路径 */}
            {drawingPoints.length > 0 && (
              <>
                <Line
                  points={drawingPoints.flatMap(p => [
                    totalOffset.x + p.x * totalScale,
                    totalOffset.y + p.y * totalScale
                  ])}
                  stroke={isDrawing ? "#10b981" : "#f59e0b"}
                  strokeWidth={3 / viewScale}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.5}
                />
                {/* 显示绘制点数 */}
                {drawingPoints.length > 0 && (
                  <Text
                    x={totalOffset.x + drawingPoints[drawingPoints.length - 1].x * totalScale + 10}
                    y={totalOffset.y + drawingPoints[drawingPoints.length - 1].y * totalScale - 10}
                    text={isDrawing ? `绘制中: ${drawingPoints.length} 点` : '单点'}
                    fontSize={14 / viewScale}
                    fill={isDrawing ? "#10b981" : "#f59e0b"}
                    fontStyle="bold"
                  />
                )}
              </>
            )}
          </Layer>
        </Stage>
      </div>

      {/* 输入模态框 */}
      {showInputModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              输入 {calibrationLabels[currentCalibrationStep]} 的物理值
            </h3>
            <input
              type="number"
              step="any"
              value={inputValues[currentCalibrationStep] || ''}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="例如: 0, 0.5, 300"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleValueSubmit(e.target.value)
                }
              }}
              onChange={(e) => setInputValues({ ...inputValues, [currentCalibrationStep]: e.target.value })}
            />
            {aiSuggestedValues && (
              <p className="text-sm text-purple-600 mt-2">
                AI 建议值已预填充
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                onClick={() => handleValueSubmit(inputValues[currentCalibrationStep])}
              >
                确认
              </button>
              <button
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
                onClick={() => {
                  setShowInputModal(false)
                  setTempPoint(null)
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 无图像时的占位符 */}
      {!image && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg" style={{ top: '60px' }}>
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500 text-lg">请上传图像</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImageCanvas
