import { useState } from 'react'

/**
 * 将 OpenCV HSV 颜色转换为 CSS RGB 颜色
 */
const hsvToRgb = (h, s, v) => {
  const hNorm = (h / 179) * 360
  const sNorm = s / 255
  const vNorm = v / 255

  const c = vNorm * sNorm
  const x = c * (1 - Math.abs((hNorm / 60) % 2 - 1))
  const m = vNorm - c

  let r, g, b
  if (hNorm < 60) {
    [r, g, b] = [c, x, 0]
  } else if (hNorm < 120) {
    [r, g, b] = [x, c, 0]
  } else if (hNorm < 180) {
    [r, g, b] = [0, c, x]
  } else if (hNorm < 240) {
    [r, g, b] = [0, x, c]
  } else if (hNorm < 300) {
    [r, g, b] = [x, 0, c]
  } else {
    [r, g, b] = [c, 0, x]
  }

  return `rgb(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((b + m) * 255)})`
}

/**
 * RGB 转 CSS 颜色
 */
const rgbToCss = (rgb) => {
  if (!rgb) return '#ccc'
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
}

/**
 * AI 识别面板组件
 * 支持分步识别：1. 识别坐标轴 2. 识别曲线颜色
 */
const AIRecognitionPanel = ({
  sessionId,
  aiAvailable,
  isLoading,
  onApplyAxes,
  onApplyColor,
  onMessage
}) => {
  const [recognizing, setRecognizing] = useState(false)
  const [axesResult, setAxesResult] = useState(null)
  const [curvesResult, setCurvesResult] = useState(null)

  // 编辑状态
  const [editedAxes, setEditedAxes] = useState(null)

  const API_BASE = 'http://localhost:8000'

  // AI 识别坐标轴
  const handleRecognizeAxes = async () => {
    if (!sessionId) {
      onMessage?.('请先上传图片')
      return
    }

    setRecognizing(true)
    onMessage?.('AI 正在识别坐标轴...')

    try {
      const response = await fetch(`${API_BASE}/ai/recognize-axes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      })

      const data = await response.json()

      if (data.success) {
        setAxesResult(data.data)
        setEditedAxes({
          xMin: data.data.x_axis?.min ?? 0,
          xMax: data.data.x_axis?.max ?? 1,
          yMin: data.data.y_axis?.min ?? 0,
          yMax: data.data.y_axis?.max ?? 1
        })
        onMessage?.(`坐标轴识别成功 (置信度: ${data.data.confidence || '未知'})`)
      } else {
        onMessage?.(`识别失败: ${data.message}`)
      }
    } catch (error) {
      onMessage?.(`识别错误: ${error.message}`)
    } finally {
      setRecognizing(false)
    }
  }

  // AI 识别曲线颜色
  const handleRecognizeCurves = async () => {
    if (!sessionId) {
      onMessage?.('请先上传图片')
      return
    }

    setRecognizing(true)
    onMessage?.('AI 正在识别曲线颜色...')

    try {
      const response = await fetch(`${API_BASE}/ai/recognize-curves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      })

      const data = await response.json()

      if (data.success) {
        setCurvesResult(data.data)
        onMessage?.(`识别到 ${data.data.curves?.length || 0} 条曲线`)
      } else {
        onMessage?.(`识别失败: ${data.message}`)
      }
    } catch (error) {
      onMessage?.(`识别错误: ${error.message}`)
    } finally {
      setRecognizing(false)
    }
  }

  // 应用坐标轴设置
  const handleApplyAxes = () => {
    if (!editedAxes) return
    onApplyAxes?.({
      xMin: parseFloat(editedAxes.xMin),
      xMax: parseFloat(editedAxes.xMax),
      yMin: parseFloat(editedAxes.yMin),
      yMax: parseFloat(editedAxes.yMax)
    })
    onMessage?.('已应用坐标轴设置')
  }

  // 应用曲线颜色
  const handleApplyCurve = (curve) => {
    if (curve.color_hsv) {
      onApplyColor?.([
        curve.color_hsv.h,
        curve.color_hsv.s,
        curve.color_hsv.v
      ])
      onMessage?.(`已应用曲线颜色: ${curve.color_name || curve.name}`)
    } else if (curve.color_rgb) {
      // 如果只有 RGB，转换为 HSV
      const { r, g, b } = curve.color_rgb
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const d = max - min
      let h = 0
      if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6
        else if (max === g) h = (b - r) / d + 2
        else h = (r - g) / d + 4
        h = Math.round(h * 30)
        if (h < 0) h += 180
      }
      const s = max === 0 ? 0 : Math.round((d / max) * 255)
      const v = max
      onApplyColor?.([h, s, v])
      onMessage?.(`已应用曲线颜色: ${curve.color_name || curve.name}`)
    }
  }

  if (!aiAvailable) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
        <p>请先配置 AI 服务</p>
        <p className="text-sm mt-1">点击右上角 "AI 未配置" 按钮进行设置</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 步骤 1: 识别坐标轴 */}
      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-blue-900 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">1</span>
            识别坐标轴
          </h4>
          <button
            onClick={handleRecognizeAxes}
            disabled={recognizing || isLoading}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 transition text-sm"
          >
            {recognizing ? '识别中...' : 'AI 识别'}
          </button>
        </div>

        {axesResult && editedAxes && (
          <div className="space-y-3">
            {/* 图表类型 */}
            {axesResult.chart_type && (
              <p className="text-sm text-blue-700">
                图表类型: {axesResult.chart_type}
              </p>
            )}

            {/* X 轴 */}
            <div className="bg-white rounded p-3">
              <p className="text-sm font-medium text-gray-700 mb-2">
                X 轴 {axesResult.x_axis?.label && `(${axesResult.x_axis.label})`}
                {axesResult.x_axis?.unit && ` [${axesResult.x_axis.unit}]`}
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">最小值</label>
                  <input
                    type="number"
                    value={editedAxes.xMin}
                    onChange={(e) => setEditedAxes({...editedAxes, xMin: e.target.value})}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">最大值</label>
                  <input
                    type="number"
                    value={editedAxes.xMax}
                    onChange={(e) => setEditedAxes({...editedAxes, xMax: e.target.value})}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Y 轴 */}
            <div className="bg-white rounded p-3">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Y 轴 {axesResult.y_axis?.label && `(${axesResult.y_axis.label})`}
                {axesResult.y_axis?.unit && ` [${axesResult.y_axis.unit}]`}
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">最小值</label>
                  <input
                    type="number"
                    value={editedAxes.yMin}
                    onChange={(e) => setEditedAxes({...editedAxes, yMin: e.target.value})}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">最大值</label>
                  <input
                    type="number"
                    value={editedAxes.yMax}
                    onChange={(e) => setEditedAxes({...editedAxes, yMax: e.target.value})}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleApplyAxes}
              className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm"
            >
              应用坐标轴设置
            </button>
          </div>
        )}
      </div>

      {/* 步骤 2: 识别曲线颜色 */}
      <div className="bg-green-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-green-900 flex items-center gap-2">
            <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm">2</span>
            识别曲线颜色
          </h4>
          <button
            onClick={handleRecognizeCurves}
            disabled={recognizing || isLoading}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 transition text-sm"
          >
            {recognizing ? '识别中...' : 'AI 识别'}
          </button>
        </div>

        {curvesResult && curvesResult.curves && curvesResult.curves.length > 0 && (
          <div className="space-y-2">
            {/* 背景信息 */}
            {(curvesResult.background_color || curvesResult.grid_color) && (
              <p className="text-xs text-green-700 mb-2">
                {curvesResult.background_color && `背景: ${curvesResult.background_color}`}
                {curvesResult.grid_color && ` | 网格: ${curvesResult.grid_color}`}
              </p>
            )}

            {/* 曲线列表 */}
            {curvesResult.curves.map((curve, index) => (
              <div key={index} className="bg-white rounded p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded border-2 border-gray-300"
                    style={{
                      backgroundColor: curve.color_hsv
                        ? hsvToRgb(curve.color_hsv.h, curve.color_hsv.s, curve.color_hsv.v)
                        : rgbToCss(curve.color_rgb)
                    }}
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {curve.name || curve.color_name || `曲线 ${index + 1}`}
                    </p>
                    <p className="text-xs text-gray-500">
                      {curve.line_style && `${curve.line_style} | `}
                      {curve.description || ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleApplyCurve(curve)}
                  className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition text-sm"
                >
                  选择
                </button>
              </div>
            ))}

            {curvesResult.notes && (
              <p className="text-xs text-green-700 mt-2">
                备注: {curvesResult.notes}
              </p>
            )}
          </div>
        )}

        {curvesResult && (!curvesResult.curves || curvesResult.curves.length === 0) && (
          <p className="text-sm text-gray-500">未识别到曲线</p>
        )}
      </div>

      {/* 提示 */}
      <div className="text-xs text-gray-500 bg-gray-50 rounded p-3">
        <p className="font-medium mb-1">使用说明:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>点击 "AI 识别" 自动识别坐标轴范围或曲线颜色</li>
          <li>识别结果可以手动修改后再应用</li>
          <li>也可以跳过 AI 识别，直接在图像上手动操作</li>
        </ul>
      </div>
    </div>
  )
}

export default AIRecognitionPanel
