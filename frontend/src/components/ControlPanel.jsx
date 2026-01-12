import { useRef } from 'react'

/**
 * 将 OpenCV HSV 颜色转换为 CSS RGB 颜色
 * OpenCV HSV: H (0-179), S (0-255), V (0-255)
 * @param {number} h - Hue (0-179)
 * @param {number} s - Saturation (0-255)
 * @param {number} v - Value (0-255)
 * @returns {string} CSS rgb() 颜色字符串
 */
const hsvToRgb = (h, s, v) => {
  // 将 OpenCV HSV 范围转换为标准范围
  const hNorm = (h / 179) * 360  // H: 0-179 -> 0-360
  const sNorm = s / 255          // S: 0-255 -> 0-1
  const vNorm = v / 255          // V: 0-255 -> 0-1

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

  const rFinal = Math.round((r + m) * 255)
  const gFinal = Math.round((g + m) * 255)
  const bFinal = Math.round((b + m) * 255)

  return `rgb(${rFinal}, ${gFinal}, ${bFinal})`
}

const ControlPanel = ({
  currentStep,
  isLoading,
  calibrationPoints,
  sampledColor,
  tolerance,
  extractedData,
  pointSpacing,
  pointDensity,
  smoothness,
  onImageUpload,
  onToleranceChange,
  onPointSpacingChange,
  onPointDensityChange,
  onSmoothnessChange,
  onToggleManualDrawMode,
  isManualDrawMode,
  onExtractData,
  onExportExcel,
  onReset,
  onStepBack,
  onResetCalibration,
  onResetColor,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}) => {
  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      onImageUpload(file)
    }
  }

  // 步骤回退按钮
  const StepBackButton = ({ targetStep, label }) => (
    <button
      onClick={() => onStepBack && onStepBack(targetStep)}
      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
      </svg>
      {label}
    </button>
  )

  return (
    <div className="space-y-6">
      {/* 步骤 1: 上传图像 */}
      <section className="border-b pb-4">
        <h3 className="text-lg font-semibold mb-3 flex items-center">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${
            currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
          }`}>
            1
          </span>
          上传图像
        </h3>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
        >
          {currentStep === 1 ? '选择图像文件' : '重新上传'}
        </button>
        <p className="text-xs text-gray-500 mt-2 text-center">
          或直接 Ctrl+V 粘贴剪贴板中的图片
        </p>
      </section>

      {/* 步骤 2: 坐标校准 */}
      <section className="border-b pb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold flex items-center">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${
              currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              2
            </span>
            坐标校准
          </h3>
          {currentStep > 2 && calibrationPoints.xStart && (
            <button
              onClick={onResetCalibration}
              className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              重新校准
            </button>
          )}
        </div>
        {currentStep >= 2 ? (
          <div className="space-y-2 text-sm">
            <div className="bg-gray-50 p-3 rounded">
              <p className="font-medium text-gray-700">X 轴:</p>
              {calibrationPoints.xStart ? (
                <p className="text-gray-600">
                  起点: {calibrationPoints.xStart.value} → 终点: {calibrationPoints.xEnd?.value || '待设置'}
                </p>
              ) : (
                <p className="text-gray-500">请在图像上点击设置</p>
              )}
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="font-medium text-gray-700">Y 轴:</p>
              {calibrationPoints.yStart ? (
                <p className="text-gray-600">
                  起点: {calibrationPoints.yStart.value} → 终点: {calibrationPoints.yEnd?.value || '待设置'}
                </p>
              ) : (
                <p className="text-gray-500">请在图像上点击设置</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">请先上传图像</p>
        )}
      </section>

      {/* 步骤 3: 颜色采样 */}
      <section className="border-b pb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold flex items-center">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${
              currentStep >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              3
            </span>
            颜色采样
          </h3>
          {currentStep > 3 && sampledColor && (
            <button
              onClick={onResetColor}
              className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              重新采样
            </button>
          )}
        </div>
        {currentStep >= 3 || sampledColor ? (
          <div className="space-y-3">
            {sampledColor ? (
              <div className="bg-gray-50 p-3 rounded">
                <p className="font-medium text-gray-700 mb-2">已采样颜色:</p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded border-2 border-gray-300"
                    style={{
                      backgroundColor: hsvToRgb(sampledColor[0], sampledColor[1], sampledColor[2])
                    }}
                  />
                  <div className="text-sm text-gray-600 flex-1">
                    <div className="mb-1">
                      <span className="font-medium">HSV:</span> H:{sampledColor[0]} S:{sampledColor[1]} V:{sampledColor[2]}
                    </div>
                    <div>
                      <span className="font-medium">RGB:</span> {(() => {
                        const rgb = hsvToRgb(sampledColor[0], sampledColor[1], sampledColor[2])
                        const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
                        return match ? `R:${match[1]} G:${match[2]} B:${match[3]}` : rgb
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">请在图像上点击曲线以采样颜色，或使用 AI 检测</p>
            )}

            {/* 容差调节 */}
            <div className="bg-gray-50 p-3 rounded">
              <label className="block font-medium text-gray-700 mb-2">
                颜色容差: {tolerance}
              </label>
              <input
                type="range"
                min="5"
                max="50"
                value={tolerance}
                onChange={(e) => onToleranceChange(parseInt(e.target.value))}
                className="w-full accent-blue-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                容差越大，匹配的颜色范围越广
              </p>
            </div>

            {/* 点间距设置 */}
            <div className="bg-gray-50 p-3 rounded">
              <label className="block font-medium text-gray-700 mb-2">
                点间距: {pointSpacing}
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={pointSpacing}
                onChange={(e) => onPointSpacingChange(parseInt(e.target.value))}
                className="w-full accent-blue-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                控制数据点的密度，值越大点越稀疏
              </p>
            </div>

            {/* 点密集度设置 */}
            <div className="bg-gray-50 p-3 rounded">
              <label className="block font-medium text-gray-700 mb-2">
                点密集度: {pointDensity === 'low' ? '稀疏' : pointDensity === 'high' ? '密集' : '中等'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onPointDensityChange('low')}
                  className={`px-2 py-1 text-sm rounded ${
                    pointDensity === 'low'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  稀疏
                </button>
                <button
                  onClick={() => onPointDensityChange('medium')}
                  className={`px-2 py-1 text-sm rounded ${
                    pointDensity === 'medium'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  中等
                </button>
                <button
                  onClick={() => onPointDensityChange('high')}
                  className={`px-2 py-1 text-sm rounded ${
                    pointDensity === 'high'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  密集
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                影响工具提取和手动绘制的数据点数量
              </p>
            </div>

            {/* 平滑度设置 */}
            <div className="bg-gray-50 p-3 rounded">
              <label className="block font-medium text-gray-700 mb-2">
                手动绘制平滑度: {Math.round(smoothness * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={smoothness}
                onChange={(e) => onSmoothnessChange(parseFloat(e.target.value))}
                className="w-full accent-blue-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                控制手动绘制曲线的平滑程度，值越大越平滑
              </p>
            </div>

            {/* 手动绘制模式按钮 */}
            <button
              onClick={onToggleManualDrawMode}
              disabled={!calibrationPoints.xStart}
              className={`w-full py-2 px-4 rounded-lg transition ${
                isManualDrawMode
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400'
              }`}
              title="在图像上手动绘制曲线生成数据点"
            >
              {isManualDrawMode ? '✓ 已启用手动绘制' : '手动绘制曲线'}
            </button>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">请先完成校准</p>
        )}
      </section>

      {/* 步骤 4: 提取数据 */}
      <section className="border-b pb-4">
        <h3 className="text-lg font-semibold mb-3 flex items-center">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${
            currentStep >= 4 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
          }`}>
            4
          </span>
          提取数据
        </h3>
        <button
          onClick={onExtractData}
          disabled={currentStep < 4 || isLoading || !sampledColor}
          className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition mb-3"
        >
          {isLoading ? '处理中...' : '提取曲线数据'}
        </button>

        {/* 数据预览 */}
        {extractedData.length > 0 && (
          <div className="space-y-3">
            {/* 撤回/重做按钮 */}
            <div className="flex gap-2">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                title="撤回上一步操作 (Ctrl+Z)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                撤回
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                title="重做 (Ctrl+Y)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                </svg>
                重做
              </button>
            </div>

            <div className="bg-gray-50 p-3 rounded">
              <p className="font-medium text-gray-700 mb-2">
                已提取 {extractedData.length} 个数据点
              </p>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-200 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-left">X</th>
                    <th className="px-2 py-1 text-left">Y</th>
                  </tr>
                </thead>
                <tbody>
                  {extractedData.slice(0, 100).map((point, index) => (
                    <tr key={index} className="border-t border-gray-200">
                      <td className="px-2 py-1 text-gray-600">{index + 1}</td>
                      <td className="px-2 py-1">{point.x.toFixed(4)}</td>
                      <td className="px-2 py-1">{point.y.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {extractedData.length > 100 && (
                <p className="text-xs text-gray-500 p-2 text-center">
                  仅显示前 100 行，完整数据请导出查看
                </p>
              )}
            </div>
          </div>
          </div>
        )}
      </section>

      {/* 导出和重置 */}
      <section>
        <div className="space-y-2">
          <button
            onClick={onExportExcel}
            disabled={extractedData.length === 0 || isLoading}
            className="w-full bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            导出到 Excel
          </button>
          <button
            onClick={onReset}
            disabled={isLoading}
            className="w-full bg-gray-600 text-white px-4 py-3 rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            重置所有
          </button>
        </div>
      </section>

      {/* 使用说明 */}
      <section className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">使用说明</h4>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>上传包含科学图表的图像（支持 Ctrl+V 粘贴）</li>
          <li>依次点击 X 轴起点、终点和 Y 轴起点、终点，输入物理值</li>
          <li>点击曲线采样颜色（或使用 AI 检测），可查看 RGB 值</li>
          <li>可选：框选数据提取范围，避免提取标题等区域</li>
          <li>调整容差、点间距、密集度后点击"提取曲线数据"</li>
          <li>或使用手动绘制：单击添加单点，长按拖动绘制路径</li>
          <li>预览数据后点击"导出到 Excel"下载</li>
        </ol>
        <div className="mt-3 pt-3 border-t border-blue-200">
          <p className="text-xs text-blue-700">
            <strong>快捷操作:</strong>
          </p>
          <ul className="text-xs text-blue-700 mt-1 space-y-1">
            <li>• 滚轮缩放图像，Ctrl+拖拽平移</li>
            <li>• 按 Esc 退出当前编辑模式</li>
            <li>• Ctrl+Z 撤回，Ctrl+Y 重做</li>
            <li>• 框选删除可清理错误数据点</li>
            <li>• AI 平滑可优化手动绘制的曲线</li>
          </ul>
        </div>
      </section>
    </div>
  )
}

export default ControlPanel
