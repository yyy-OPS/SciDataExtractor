/**
 * Origin绘图面板组件 - 简化版
 * 专注于使用从图表中提取的数据进行绘图
 */

import { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = ''

const OriginPlotPanel = ({ extractedData = null, onClose = null }) => {
  // ==================== 状态管理 ====================

  // Origin状态
  const [originStatus, setOriginStatus] = useState({
    available: false,
    can_connect: false,
    message: ''
  })

  // 绘图结果
  const [plotResult, setPlotResult] = useState(null)
  const [isPlotting, setIsPlotting] = useState(false)

  // 绘图配置
  const [config, setConfig] = useState({
    filename: '',                 // 自定义文件名（不含扩展名）
    plotType: 'line',        // line, scatter, line_symbol
    title: '从图表提取的数据',
    xTitle: 'X',
    yTitle: 'Y',
    exportFormat: 'png',     // png, pdf, svg, emf, eps
    width: 800,
    height: 600,
    showOrigin: false,        // 是否显示Origin窗口
    showGrid: true,
    showLegend: true,
    legendPosition: 'top-right',
    color: '#1f77b4',         // 线条颜色
    lineWidth: 1.5,           // 线宽
    antiAlias: true,          // 抗锯齿
    // 高级选项
    xMin: '',
    xMax: '',
    yMin: '',
    yMax: '',
    titleFont: '',
    titleFontSize: 0,
    titleColor: '',
    xTitleFont: '',
    yTitleFont: '',
    template: '',              // Origin模板路径
    customLabTalk: ''          // 自定义LabTalk代码
  })

  // ==================== 副作用 ====================

  useEffect(() => {
    checkOriginStatus()
  }, [])

  // ==================== API调用 ====================

  const checkOriginStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/origin/status`)
      setOriginStatus(res.data)
    } catch (err) {
      setOriginStatus({
        available: false,
        can_connect: false,
        message: '无法连接到后端服务'
      })
    }
  }

  const plotFromExtracted = async () => {
    if (!extractedData || extractedData.length === 0) {
      setPlotResult({ success: false, message: '没有提取的数据可绘制' })
      return
    }

    setIsPlotting(true)
    setPlotResult(null)

    try {
      // 构建配置对象
      const requestConfig = {
        graph_type: config.plotType,
        title: config.title,
        x_title: config.xTitle,
        y_title: config.yTitle,
        export_format: config.exportFormat,
        width: config.width,
        height: config.height,
        show_origin: config.showOrigin,
        show_grid: config.showGrid,
        show_legend: config.showLegend,
        legend_position: config.legendPosition,
        color: config.color,
        line_width: config.lineWidth,
        anti_alias: config.antiAlias
      }

      // 添加自定义文件名
      if (config.filename.trim()) {
        requestConfig.filename = config.filename.trim()
      }

      // 添加坐标轴范围
      if (config.xMin !== '') requestConfig.x_min = parseFloat(config.xMin)
      if (config.xMax !== '') requestConfig.x_max = parseFloat(config.xMax)
      if (config.yMin !== '') requestConfig.y_min = parseFloat(config.yMin)
      if (config.yMax !== '') requestConfig.y_max = parseFloat(config.yMax)

      // 添加高级字体设置
      if (config.titleFont) requestConfig.title_font = config.titleFont
      if (config.titleFontSize > 0) requestConfig.title_font_size = config.titleFontSize
      if (config.titleColor) requestConfig.title_color = config.titleColor
      if (config.xTitleFont) requestConfig.x_title_font = config.xTitleFont
      if (config.yTitleFont) requestConfig.y_title_font = config.yTitleFont

      // 添加模板
      if (config.template.trim()) {
        requestConfig.template = config.template.trim()
      }

      // 添加自定义LabTalk代码
      if (config.customLabTalk && config.customLabTalk.trim()) {
        requestConfig.custom_labtalk = config.customLabTalk.trim()
      }

      const res = await axios.post(`${API_BASE}/origin/plot-from-extracted`, {
        data: extractedData,
        config: requestConfig
      })

      setPlotResult(res.data)
    } catch (err) {
      setPlotResult({
        success: false,
        message: err.response?.data?.detail || err.message || '绘图失败'
      })
    } finally {
      setIsPlotting(false)
    }
  }

  // ==================== 渲染 ====================

  if (!originStatus.available) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-2xl mx-auto">
        <div className="text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Origin绘图功能不可用</h2>
          <p className="text-gray-600 mb-4">{originStatus.message}</p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
            <h3 className="font-semibold text-blue-800 mb-2">使用说明：</h3>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>确保已安装 Origin 2021 或更高版本</li>
              <li>在后端虚拟环境运行: <code className="bg-blue-100 px-1 rounded">pip install originpro</code></li>
              <li>重启后端服务</li>
            </ol>
          </div>
          <div className="flex gap-2 justify-center mt-4">
            <button
              onClick={checkOriginStatus}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            >
              重新检查
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                关闭
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[90vh]">
      {/* 头部 */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4 flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Origin 绘图工具
          </h2>
          <p className="text-orange-100 text-sm mt-1">使用Origin 2022绘制提取的数据</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            originStatus.can_connect ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white'
          }`}>
            {originStatus.can_connect ? '已连接Origin' : 'Origin未连接'}
          </span>
          {onClose && (
            <button onClick={onClose} className="text-white hover:bg-white/20 rounded-lg p-2 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 主内容区 - 可滚动 */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto flex-1">
        {/* 左侧: 配置区 */}
        <div className="space-y-6">
          {/* 数据信息 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">当前数据</h3>
            <p className="text-sm text-blue-600">
              {extractedData && extractedData.length > 0
                ? `共 ${extractedData.length} 个数据点`
                : '没有可用的数据'}
            </p>
            {extractedData && extractedData.length > 0 && (
              <p className="text-xs text-blue-500 mt-1">
                X范围: [{extractedData[0].x.toFixed(2)}, {extractedData[extractedData.length - 1].x.toFixed(2)}]
                &nbsp;|&nbsp;
                Y范围: [{Math.min(...extractedData.map(d => d.y)).toFixed(2)}, {Math.max(...extractedData.map(d => d.y)).toFixed(2)}]
              </p>
            )}
          </div>

          {/* 图表类型选择 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3">图表类型</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'line', label: '折线图', icon: '📈' },
                { value: 'scatter', label: '散点图', icon: '🔵' },
                { value: 'line_symbol', label: '线+符号', icon: '📊' }
              ].map(type => (
                <button
                  key={type.value}
                  onClick={() => setConfig({ ...config, plotType: type.value })}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    config.plotType === type.value
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-xl">{type.icon}</div>
                  <div className="text-xs mt-1">{type.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 导出设置 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3">导出设置</h3>
            <div className="space-y-3">
              {/* 文件名自定义 */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">文件名（不含扩展名）</label>
                <input
                  type="text"
                  value={config.filename}
                  onChange={(e) => setConfig({ ...config, filename: e.target.value })}
                  placeholder="留空自动生成"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">自定义图片和项目文件名，留空则自动生成</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">导出格式</label>
                  <select
                    value={config.exportFormat}
                    onChange={(e) => setConfig({ ...config, exportFormat: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="png">PNG图片</option>
                    <option value="pdf">PDF文档</option>
                    <option value="svg">SVG矢量图</option>
                    <option value="emf">EMF矢量图</option>
                    <option value="eps">EPS矢量图</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">图表尺寸</label>
                  <select
                    value={config.width}
                    onChange={(e) => setConfig({ ...config, width: parseInt(e.target.value), height: parseInt(e.target.value) * 0.75 })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  >
                    <option value={600}>600×450</option>
                    <option value={800}>800×600</option>
                    <option value={1200}>1200×900</option>
                    <option value={1600}>1600×1200</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 图表标题和轴标签 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3">标题和标签</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">图表标题</label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) => setConfig({ ...config, title: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">X轴标题</label>
                  <input
                    type="text"
                    value={config.xTitle}
                    onChange={(e) => setConfig({ ...config, xTitle: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Y轴标题</label>
                  <input
                    type="text"
                    value={config.yTitle}
                    onChange={(e) => setConfig({ ...config, yTitle: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 高级选项 */}
          <details className="bg-gray-50 rounded-lg p-4">
            <summary className="font-semibold text-gray-800 cursor-pointer">高级选项</summary>
            <div className="mt-3 space-y-4">
              {/* 显示选项 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">显示Origin窗口</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showOrigin}
                      onChange={(e) => setConfig({ ...config, showOrigin: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                  </label>
                </div>
                <p className="text-xs text-gray-500 -mt-1">勾选后会在绘图时显示Origin软件窗口，可用于调试</p>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">显示网格线</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showGrid}
                      onChange={(e) => setConfig({ ...config, showGrid: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">显示图例</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showLegend}
                      onChange={(e) => setConfig({ ...config, showLegend: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                  </label>
                </div>

                {config.showLegend && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">图例位置</label>
                    <select
                      value={config.legendPosition}
                      onChange={(e) => setConfig({ ...config, legendPosition: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    >
                      <option value="top-right">右上角</option>
                      <option value="top-left">左上角</option>
                      <option value="bottom-right">右下角</option>
                      <option value="bottom-left">左下角</option>
                      <option value="center">居中</option>
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">抗锯齿</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.antiAlias}
                      onChange={(e) => setConfig({ ...config, antiAlias: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                  </label>
                </div>
              </div>

              {/* 曲线样式 */}
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">曲线样式</h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">曲线颜色</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.color}
                        onChange={(e) => setConfig({ ...config, color: e.target.value })}
                        className="w-10 h-8 rounded cursor-pointer border"
                      />
                      <input
                        type="text"
                        value={config.color}
                        onChange={(e) => setConfig({ ...config, color: e.target.value })}
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">线宽: {config.lineWidth}</label>
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.5"
                      value={config.lineWidth}
                      onChange={(e) => setConfig({ ...config, lineWidth: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* 坐标轴范围 */}
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">坐标轴范围</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">X最小值</label>
                    <input
                      type="number"
                      value={config.xMin}
                      onChange={(e) => setConfig({ ...config, xMin: e.target.value })}
                      placeholder="自动"
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">X最大值</label>
                    <input
                      type="number"
                      value={config.xMax}
                      onChange={(e) => setConfig({ ...config, xMax: e.target.value })}
                      placeholder="自动"
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Y最小值</label>
                    <input
                      type="number"
                      value={config.yMin}
                      onChange={(e) => setConfig({ ...config, yMin: e.target.value })}
                      placeholder="自动"
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Y最大值</label>
                    <input
                      type="number"
                      value={config.yMax}
                      onChange={(e) => setConfig({ ...config, yMax: e.target.value })}
                      placeholder="自动"
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Origin模板 */}
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Origin模板 (.otp)</h4>
                <input
                  type="text"
                  value={config.template}
                  onChange={(e) => setConfig({ ...config, template: e.target.value })}
                  placeholder="例如: D:\Desktop\BG\tu\ENLARGED.otp"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
                />
                <p className="text-xs text-gray-500 mt-2">
                  💡 模板使用说明：
                </p>
                <ul className="text-xs text-gray-500 mt-1 space-y-1 list-disc list-inside">
                  <li>支持Origin内置模板名: <code className="bg-gray-100 px-1 rounded">line</code>, <code className="bg-gray-100 px-1 rounded">scatter</code>, <code className="bg-gray-100 px-1 rounded">column</code></li>
                  <li>或输入完整路径: <code className="bg-gray-100 px-1 rounded">D:\Desktop\BG\tu\ENLARGED.otp</code></li>
                  <li>模板会预定义图表样式、颜色、字体等设置</li>
                  <li>留空则使用默认模板</li>
                </ul>
              </div>

              {/* 自定义LabTalk代码 */}
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">自定义LabTalk代码 (高级)</h4>
                <textarea
                  value={config.customLabTalk || ''}
                  onChange={(e) => setConfig({ ...config, customLabTalk: e.target.value })}
                  placeholder='// 自定义Origin LabTalk命令&#10;// 例如: layer.x.label="Time (s)";&#10;// 例如: legend.fcolor=1;'
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono h-20 resize-y"
                />
                <p className="text-xs text-gray-500 mt-1">
                  在绘图完成后执行的自定义LabTalk脚本命令
                </p>
              </div>
            </div>
          </details>

          {/* 绘图按钮 */}
          <button
            onClick={plotFromExtracted}
            disabled={isPlotting || !extractedData || extractedData.length === 0}
            className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-bold text-lg hover:from-orange-600 hover:to-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
          >
            {isPlotting ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                正在绘图...
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                使用Origin绘制图表
              </>
            )}
          </button>
        </div>

        {/* 右侧: 结果区 */}
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 min-h-[400px]">
            <h3 className="font-semibold text-gray-800 mb-3">绘图结果</h3>

            {plotResult ? (
              <div className="space-y-4">
                {plotResult.success ? (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-green-700 text-sm">{plotResult.message}</p>
                    </div>

                    {/* 图片预览 - 支持PDF和SVG */}
                    {plotResult.image_path && (
                      <div>
                        <p className="text-sm text-gray-600 mb-2">导出的图表:</p>
                        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                          {plotResult.image_path.toLowerCase().endsWith('.pdf') ? (
                            // PDF预览
                            <div className="flex flex-col items-center justify-center p-8 bg-gray-50">
                              <svg className="w-16 h-16 text-red-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              <p className="text-sm text-gray-600 mb-2">PDF文件已生成</p>
                              <p className="text-xs text-gray-500">点击下方"下载图表图片"按钮查看</p>
                            </div>
                          ) : plotResult.image_path.toLowerCase().endsWith('.svg') ||
                            plotResult.image_path.toLowerCase().endsWith('.emf') ||
                            plotResult.image_path.toLowerCase().endsWith('.eps') ? (
                            // 矢量图预览
                            <div className="flex flex-col items-center justify-center p-8 bg-gray-50">
                              <svg className="w-16 h-16 text-purple-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <p className="text-sm text-gray-600 mb-2">矢量图文件已生成</p>
                              <p className="text-xs text-gray-500">可在矢量图软件中编辑</p>
                            </div>
                          ) : (
                            // 普通图片预览
                            <img
                              src={`/outputs/${plotResult.image_path.split(/[\\/]/).pop()}`}
                              alt="Origin Plot"
                              className="w-full h-auto"
                              onError={(e) => {
                                const pathParts = plotResult.image_path.replace(/\\/g, '/').split('/')
                                const filename = pathParts.pop()
                                e.target.src = `/outputs/${filename}`
                              }}
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {/* 下载链接 */}
                    <div className="space-y-2">
                      {plotResult.image_path && (
                        <a
                          href={`http://localhost:8000/outputs/${plotResult.image_path.split(/[\\/]/).pop()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          下载图表图片
                        </a>
                      )}
                      {plotResult.project_path && (
                        <a
                          href={`/outputs/${plotResult.project_path.split(/[\\/]/).pop()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          下载Origin项目文件 (.opju)
                        </a>
                      )}
                    </div>

                    {/* 提示 */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-yellow-700 text-xs">
                        💡 提示: 下载的.opju文件可以用Origin 2022打开，可以进行进一步编辑和分析
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-700 text-sm">{plotResult.message}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-80 text-gray-400">
                <svg className="w-20 h-20 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">点击"使用Origin绘制图表"按钮</p>
                <p className="text-xs mt-1">生成的图表将显示在这里</p>
              </div>
            )}
          </div>

          {/* 使用说明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="font-semibold text-blue-800 mb-2">关于Origin绘图</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Origin是专业的科学绘图和分析软件</li>
              <li>• 支持多种2D图表类型和样式定制</li>
              <li>• 导出的.opju文件可在Origin中继续编辑</li>
              <li>• 勾选"显示Origin窗口"可查看Origin绘图过程</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OriginPlotPanel
