import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Stage, Layer, Line, Circle, Rect, Text } from 'react-konva'

/**
 * 数据预览组件
 * 独立显示提取的数据点，支持调整线段粗细
 * 优化：对大量数据点进行采样以提高性能
 * 支持框选删除多余数据点
 */
const DataPreview = ({
  extractedData,
  repairedData,
  calibrationPoints,
  showOriginal = true,
  showRepaired = true,
  onDeletePoints,  // 删除数据点的回调函数
  onSelectRegion   // 新增：选择区域的回调函数
}) => {
  const containerRef = useRef(null)
  const stageRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: 300 })
  const [lineWidth, setLineWidth] = useState(2)
  const [pointSize, setPointSize] = useState(3)
  const [showPoints, setShowPoints] = useState(false) // 默认关闭点显示以提高性能
  const [showLine, setShowLine] = useState(true)

  // 框选相关状态
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState(null)
  const [selectionEnd, setSelectionEnd] = useState(null)
  const [selectionMode, setSelectionMode] = useState('none') // 'none', 'delete', 'ai-process'

  // 选中的区域（用于AI处理）
  const [selectedRegion, setSelectedRegion] = useState(null)

  // 最大显示点数（超过此数量会进行采样）
  // 注意：为了确保预览与导出一致，我们不再对数据进行采样
  // 而是使用 Konva 的性能优化选项来处理大量数据点
  const MAX_DISPLAY_POINTS = Infinity // 不限制显示点数

  // 响应式画布大小
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth
        setCanvasSize({ width, height: width * 0.5 })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // 对数据进行采样以提高性能
  const sampleData = (data, maxPoints) => {
    if (!data || data.length <= maxPoints) return data
    const step = Math.ceil(data.length / maxPoints)
    return data.filter((_, index) => index % step === 0)
  }

  // 使用 useMemo 缓存计算结果
  const { bounds, displayOriginal, displayRepaired } = useMemo(() => {
    const allData = [...(extractedData || []), ...(repairedData || [])]

    if (allData.length === 0) {
      return { bounds: null, displayOriginal: [], displayRepaired: [] }
    }

    // 计算边界
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity

    allData.forEach(point => {
      if (point.x < minX) minX = point.x
      if (point.x > maxX) maxX = point.x
      if (point.y < minY) minY = point.y
      if (point.y > maxY) maxY = point.y
    })

    const xPadding = (maxX - minX) * 0.1 || 1
    const yPadding = (maxY - minY) * 0.1 || 1

    const bounds = {
      minX: minX - xPadding,
      maxX: maxX + xPadding,
      minY: minY - yPadding,
      maxY: maxY + yPadding
    }

    // 不再采样，显示全部数据以确保与导出一致
    const displayOriginal = extractedData || []
    const displayRepaired = repairedData || []

    return { bounds, displayOriginal, displayRepaired }
  }, [extractedData, repairedData])

  // 将数据坐标转换为画布坐标
  const dataToCanvas = (x, y) => {
    if (!bounds) return { x: 0, y: 0 }
    const padding = 40
    const plotWidth = canvasSize.width - padding * 2
    const plotHeight = canvasSize.height - padding * 2

    const canvasX = padding + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * plotWidth
    const canvasY = canvasSize.height - padding - ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * plotHeight

    return { x: canvasX, y: canvasY }
  }

  // 将画布坐标转换为数据坐标（用于框选）
  const canvasToData = useCallback((canvasX, canvasY) => {
    if (!bounds) return { x: 0, y: 0 }
    const padding = 40
    const plotWidth = canvasSize.width - padding * 2
    const plotHeight = canvasSize.height - padding * 2

    const dataX = bounds.minX + ((canvasX - padding) / plotWidth) * (bounds.maxX - bounds.minX)
    const dataY = bounds.minY + ((canvasSize.height - padding - canvasY) / plotHeight) * (bounds.maxY - bounds.minY)

    return { x: dataX, y: dataY }
  }, [bounds, canvasSize])

  // 框选鼠标事件处理
  const handleMouseDown = useCallback((e) => {
    if (selectionMode === 'none') return
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()
    setIsSelecting(true)
    setSelectionStart(pos)
    setSelectionEnd(pos)
  }, [selectionMode])

  const handleMouseMove = useCallback((e) => {
    if (!isSelecting) return
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()
    setSelectionEnd(pos)
  }, [isSelecting])

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || !selectionStart || !selectionEnd) {
      setIsSelecting(false)
      return
    }

    // 计算选择框的数据坐标范围
    const startData = canvasToData(selectionStart.x, selectionStart.y)
    const endData = canvasToData(selectionEnd.x, selectionEnd.y)

    const minX = Math.min(startData.x, endData.x)
    const maxX = Math.max(startData.x, endData.x)
    const minY = Math.min(startData.y, endData.y)
    const maxY = Math.max(startData.y, endData.y)

    if (selectionMode === 'delete') {
      // 删除模式：找出在选择框内的点的索引
      if (onDeletePoints && extractedData) {
        const indicesToDelete = []
        extractedData.forEach((point, index) => {
          if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
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
    } else if (selectionMode === 'ai-process') {
      // AI处理模式：选中区域内的点
      if (extractedData) {
        const selectedPoints = []
        extractedData.forEach((point, index) => {
          if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
            selectedPoints.push({ ...point, originalIndex: index })
          }
        })

        if (selectedPoints.length > 0) {
          // 保存选中的区域
          setSelectedRegion({
            bounds: { minX, maxX, minY, maxY },
            points: selectedPoints,
            count: selectedPoints.length
          })

          // 通知父组件
          if (onSelectRegion) {
            onSelectRegion(selectedPoints, { minX, maxX, minY, maxY })
          }
        }
      }
      // 保持选择框显示，不清除
      setIsSelecting(false)
    }
  }, [isSelecting, selectionStart, selectionEnd, canvasToData, onDeletePoints, onSelectRegion, extractedData, selectionMode])

  // 计算选择框的位置和大小
  const selectionRect = useMemo(() => {
    if (!selectionStart || !selectionEnd) return null
    return {
      x: Math.min(selectionStart.x, selectionEnd.x),
      y: Math.min(selectionStart.y, selectionEnd.y),
      width: Math.abs(selectionEnd.x - selectionStart.x),
      height: Math.abs(selectionEnd.y - selectionStart.y)
    }
  }, [selectionStart, selectionEnd])

  // 使用 useMemo 缓存转换后的点
  const { originalLinePoints, repairedLinePoints, originalDisplayPoints, repairedDisplayPoints } = useMemo(() => {
    if (!bounds) {
      return { originalLinePoints: [], repairedLinePoints: [], originalDisplayPoints: [], repairedDisplayPoints: [] }
    }

    const originalDisplayPoints = (displayOriginal || []).map(p => dataToCanvas(p.x, p.y))
    const repairedDisplayPoints = (displayRepaired || []).map(p => dataToCanvas(p.x, p.y))

    const originalLinePoints = originalDisplayPoints.flatMap(p => [p.x, p.y])
    const repairedLinePoints = repairedDisplayPoints.flatMap(p => [p.x, p.y])

    return { originalLinePoints, repairedLinePoints, originalDisplayPoints, repairedDisplayPoints }
  }, [bounds, displayOriginal, displayRepaired, canvasSize])

  // 生成坐标轴刻度
  const ticks = useMemo(() => {
    if (!bounds) return { xTicks: [], yTicks: [] }

    const generateTicks = (min, max, count = 5) => {
      const step = (max - min) / (count - 1)
      return Array.from({ length: count }, (_, i) => min + step * i)
    }

    return {
      xTicks: generateTicks(bounds.minX, bounds.maxX, 5),
      yTicks: generateTicks(bounds.minY, bounds.maxY, 5)
    }
  }, [bounds])

  if (!bounds) {
    return (
      <div ref={containerRef} className="bg-gray-50 rounded-lg p-4">
        <p className="text-gray-500 text-center py-8">暂无数据可预览</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="space-y-4">
      {/* 控制栏 */}
      <div className="flex flex-wrap items-center gap-4 bg-gray-50 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">线宽:</label>
          <input
            type="range"
            min="1"
            max="5"
            value={lineWidth}
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            className="w-16"
          />
          <span className="text-sm text-gray-500 w-4">{lineWidth}</span>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={showLine}
              onChange={(e) => setShowLine(e.target.checked)}
              className="rounded"
            />
            连线
          </label>

          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={showPoints}
              onChange={(e) => setShowPoints(e.target.checked)}
              className="rounded"
            />
            数据点
          </label>
        </div>

        {/* 框选按钮组 */}
        <div className="flex items-center gap-2">
          {/* 框选删除按钮 */}
          {onDeletePoints && (
            <button
              onClick={() => {
                if (selectionMode === 'delete') {
                  setSelectionMode('none')
                  setSelectionStart(null)
                  setSelectionEnd(null)
                  setSelectedRegion(null)
                } else {
                  setSelectionMode('delete')
                  setSelectedRegion(null)
                }
              }}
              className={`px-3 py-1 text-sm rounded transition ${
                selectionMode === 'delete'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {selectionMode === 'delete' ? '退出删除' : '框选删除'}
            </button>
          )}

          {/* 框选AI处理按钮 */}
          {onSelectRegion && (
            <button
              onClick={() => {
                if (selectionMode === 'ai-process') {
                  setSelectionMode('none')
                  setSelectionStart(null)
                  setSelectionEnd(null)
                  setSelectedRegion(null)
                } else {
                  setSelectionMode('ai-process')
                }
              }}
              className={`px-3 py-1 text-sm rounded transition ${
                selectionMode === 'ai-process'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {selectionMode === 'ai-process' ? '退出选择' : '框选AI处理'}
            </button>
          )}
        </div>

        {/* 显示数据点总数 */}
        <span className="text-xs text-green-600 font-medium">
          显示全部数据 ({extractedData?.length || 0} 点)
        </span>

        {/* 选中区域信息 */}
        {selectedRegion && (
          <span className="text-xs text-purple-600 font-medium">
            已选中 {selectedRegion.count} 个点
          </span>
        )}

        {/* 提示信息 */}
        {selectionMode === 'delete' && (
          <span className="text-xs text-red-600">
            拖拽框选要删除的数据点区域
          </span>
        )}
        {selectionMode === 'ai-process' && (
          <span className="text-xs text-purple-600">
            拖拽框选需要AI处理的数据点区域
          </span>
        )}
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-4 text-sm">
        {showOriginal && extractedData && extractedData.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-blue-500"></div>
            <span>原始数据 ({extractedData.length} 点)</span>
          </div>
        )}
        {showRepaired && repairedData && repairedData.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-orange-500" style={{borderStyle: 'dashed'}}></div>
            <span>AI 修复 ({repairedData.length} 点)</span>
          </div>
        )}
      </div>

      {/* 画布 */}
      <div className={`border rounded-lg overflow-hidden bg-white ${
        selectionMode === 'delete' ? 'border-red-300 cursor-crosshair' :
        selectionMode === 'ai-process' ? 'border-purple-300 cursor-crosshair' :
        'border-gray-300'
      }`}>
        <Stage
          ref={stageRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <Layer>
            {/* 背景 */}
            <Rect x={0} y={0} width={canvasSize.width} height={canvasSize.height} fill="white" />

            {/* 绘图区域背景 */}
            <Rect
              x={40}
              y={20}
              width={canvasSize.width - 80}
              height={canvasSize.height - 60}
              fill="#fafafa"
              stroke="#e5e5e5"
              strokeWidth={1}
            />

            {/* X 轴刻度 */}
            {ticks.xTicks.map((tick, i) => {
              const pos = dataToCanvas(tick, bounds.minY)
              return (
                <React.Fragment key={`x-${i}`}>
                  <Line
                    points={[pos.x, canvasSize.height - 40, pos.x, canvasSize.height - 35]}
                    stroke="#666"
                    strokeWidth={1}
                  />
                  <Text
                    x={pos.x - 25}
                    y={canvasSize.height - 28}
                    width={50}
                    text={tick.toFixed(3)}
                    fontSize={9}
                    fill="#666"
                    align="center"
                  />
                </React.Fragment>
              )
            })}

            {/* Y 轴刻度 */}
            {ticks.yTicks.map((tick, i) => {
              const pos = dataToCanvas(bounds.minX, tick)
              return (
                <React.Fragment key={`y-${i}`}>
                  <Line points={[35, pos.y, 40, pos.y]} stroke="#666" strokeWidth={1} />
                  <Text
                    x={2}
                    y={pos.y - 5}
                    width={32}
                    text={tick.toFixed(2)}
                    fontSize={9}
                    fill="#666"
                    align="right"
                  />
                </React.Fragment>
              )
            })}

            {/* 原始数据线 */}
            {showOriginal && showLine && originalLinePoints.length >= 4 && (
              <Line
                points={originalLinePoints}
                stroke="#3b82f6"
                strokeWidth={lineWidth}
                lineCap="round"
                lineJoin="round"
                perfectDrawEnabled={false}
              />
            )}

            {/* AI 修复数据线 */}
            {showRepaired && showLine && repairedLinePoints.length >= 4 && (
              <Line
                points={repairedLinePoints}
                stroke="#f97316"
                strokeWidth={lineWidth}
                lineCap="round"
                lineJoin="round"
                dash={[5, 3]}
                perfectDrawEnabled={false}
              />
            )}

            {/* 原始数据点 */}
            {showOriginal && showPoints && originalDisplayPoints.map((point, index) => (
              <Circle
                key={`orig-${index}`}
                x={point.x}
                y={point.y}
                radius={pointSize}
                fill="#3b82f6"
                perfectDrawEnabled={false}
              />
            ))}

            {/* AI 修复数据点 */}
            {showRepaired && showPoints && repairedDisplayPoints.map((point, index) => (
              <Circle
                key={`repair-${index}`}
                x={point.x}
                y={point.y}
                radius={pointSize}
                fill="#f97316"
                perfectDrawEnabled={false}
              />
            ))}

            {/* 框选矩形 */}
            {selectionRect && (
              <Rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.width}
                height={selectionRect.height}
                fill={selectionMode === 'delete' ? "rgba(239, 68, 68, 0.2)" : "rgba(168, 85, 247, 0.2)"}
                stroke={selectionMode === 'delete' ? "#ef4444" : "#a855f7"}
                strokeWidth={2}
                dash={[4, 4]}
              />
            )}
          </Layer>
        </Stage>
      </div>

      {/* 数据统计 */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="bg-gray-50 rounded p-2">
          <p className="text-gray-600 text-xs">X 范围</p>
          <p className="font-medium text-sm">{bounds.minX.toFixed(4)} ~ {bounds.maxX.toFixed(4)}</p>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <p className="text-gray-600 text-xs">Y 范围</p>
          <p className="font-medium text-sm">{bounds.minY.toFixed(4)} ~ {bounds.maxY.toFixed(4)}</p>
        </div>
      </div>
    </div>
  )
}

export default DataPreview
