/**
 * Origin绘图面板组件
 *
 * 功能:
 * - 2D图表绘制 (折线图、散点图、柱状图等)
 * - 3D图表绘制 (曲面图、等高线图、热图等)
 * - 多层图表绘制
 * - 图表样式自定义
 * - 使用提取的数据绘图
 * - 导出多种格式
 */

import { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = 'http://localhost:8000'

const OriginPlotPanel = ({ extractedData = null, onClose = null }) => {
  // ==================== 状态管理 ====================

  // Origin状态
  const [originStatus, setOriginStatus] = useState({
    available: false,
    can_connect: false,
    message: ''
  })

  // 当前激活的标签页
  const [activeTab, setActiveTab] = useState('quick') // quick, advanced, xyz, multi, extracted

  // 绘图结果
  const [plotResult, setPlotResult] = useState(null)
  const [isPlotting, setIsPlotting] = useState(false)

  // 快速绘图表单
  const [quickForm, setQuickForm] = useState({
    xData: '1,2,3,4,5,6,7,8,9,10',
    yData: '23,45,78,133,178,199,234,278,341,400',
    plotType: 'line',
    title: 'My Plot',
    xTitle: 'X Axis',
    yTitle: 'Y Axis'
  })

  // 高级设置
  const [advancedSettings, setAdvancedSettings] = useState({
    width: 800,
    height: 600,
    exportFormat: 'png',
    showGrid: true,
    showLegend: true,
    xMin: '',
    xMax: '',
    yMin: '',
    yMax: '',
    color: '#1f77b4',
    template: ''
  })

  // XYZ绘图表单
  const [xyzForm, setXyzForm] = useState({
    xData: '',
    yData: '',
    zData: '',
    plotType: 'surface_colormap',
    title: '3D Surface Plot',
    colormap: 'Maple.pal'
  })

  // 多层绘图表单
  const [multiDatasets, setMultiDatasets] = useState([
    { name: 'Dataset 1', xData: '1,2,3,4,5', yData: '10,20,15,25,30' },
    { name: 'Dataset 2', xData: '1,2,3,4,5', yData: '15,25,20,30,35' }
  ])

  // 使用提取数据的配置
  const [extractedConfig, setExtractedConfig] = useState({
    plotType: 'line',
    title: '从图表提取的数据',
    exportFormat: 'png',
    width: 800,
    height: 600
  })

  // LabTalk命令
  const [labtalkCommand, setLabtalkCommand] = useState('')
  const [labtalkResult, setLabtalkResult] = useState(null)

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

  const plotQuick = async () => {
    setIsPlotting(true)
    setPlotResult(null)

    try {
      const xData = parseData(quickForm.xData)
      const yData = parseData(quickForm.yData)

      if (xData.length === 0 || yData.length === 0) {
        setPlotResult({ success: false, message: '数据格式错误，请输入逗号分隔的数值' })
        setIsPlotting(false)
        return
      }

      const res = await axios.post(`${API_BASE}/origin/plot`, {
        x_data: xData,
        y_data: yData,
        x_name: quickForm.xTitle,
        y_names: quickForm.yTitle,
        graph_type: quickForm.plotType,
        title: quickForm.title,
        x_title: quickForm.xTitle,
        y_title: quickForm.yTitle,
        width: advancedSettings.width,
        height: advancedSettings.height,
        export_format: advancedSettings.exportFormat,
        show_grid: advancedSettings.showGrid,
        show_legend: advancedSettings.showLegend,
        color: advancedSettings.color,
        x_min: advancedSettings.xMin ? parseFloat(advancedSettings.xMin) : null,
        x_max: advancedSettings.xMax ? parseFloat(advancedSettings.xMax) : null,
        y_min: advancedSettings.yMin ? parseFloat(advancedSettings.yMin) : null,
        y_max: advancedSettings.yMax ? parseFloat(advancedSettings.yMax) : null,
        template: advancedSettings.template
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

  const plotXYZ = async () => {
    setIsPlotting(true)
    setPlotResult(null)

    try {
      const xData = parseData(xyzForm.xData)
      const yData = parseData(xyzForm.yData)
      const zData = parseData(xyzForm.zData)

      if (xData.length === 0 || yData.length === 0 || zData.length === 0) {
        setPlotResult({ success: false, message: '数据格式错误' })
        setIsPlotting(false)
        return
      }

      const res = await axios.post(`${API_BASE}/origin/plot-xyz`, {
        x_data: xData,
        y_data: yData,
        z_data: zData,
        graph_type: xyzForm.plotType,
        title: xyzForm.title,
        width: advancedSettings.width,
        height: advancedSettings.height,
        export_format: advancedSettings.exportFormat,
        colormap: xyzForm.colormap
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

  const plotMulti = async () => {
    setIsPlotting(true)
    setPlotResult(null)

    try {
      const datasets = multiDatasets.map(ds => ({
        x_data: parseData(ds.xData),
        y_data: parseData(ds.yData)
      }))

      const res = await axios.post(`${API_BASE}/origin/plot-multi`, {
        datasets,
        template: 'PAN2VERT',
        export_format: advancedSettings.exportFormat
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

  const plotFromExtracted = async () => {
    if (!extractedData || extractedData.length === 0) {
      setPlotResult({ success: false, message: '没有提取的数据可绘制' })
      return
    }

    setIsPlotting(true)
    setPlotResult(null)

    try {
      const res = await axios.post(`${API_BASE}/origin/plot-from-extracted`, {
        data: extractedData,
        config: extractedConfig
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

  const executeLabTalk = async () => {
    if (!labtalkCommand.trim()) return

    setIsPlotting(true)
    setLabtalkResult(null)

    try {
      const res = await axios.post(`${API_BASE}/origin/execute-labtalk`, {
        command: labtalkCommand
      })

      setLabtalkResult(res.data)
    } catch (err) {
      setLabtalkResult({
        success: false,
        message: err.response?.data?.detail || err.message || '命令执行失败'
      })
    } finally {
      setIsPlotting(false)
    }
  }

  // ==================== 工具函数 ====================

  const parseData = (str) => {
    if (!str) return []
    return str.split(/[,\s;]+/)
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n))
  }

  const generateSampleXYZ = () => {
    // 生成示例XYZ数据
    const x = [], y = [], z = []
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        x.push(i / 10)
        y.push(j / 10)
        z.push(Math.sin(i / 10) * Math.cos(j / 10))
      }
    }
    setXyzForm({
      ...xyzForm,
      xData: x.join(','),
      yData: y.join(','),
      zData: z.join(',')
    })
  }

  const addMultiDataset = () => {
    setMultiDatasets([
      ...multiDatasets,
      { name: `Dataset ${multiDatasets.length + 1}`, xData: '', yData: '' }
    ])
  }

  const removeMultiDataset = (index) => {
    setMultiDatasets(multiDatasets.filter((_, i) => i !== index))
  }

  const updateMultiDataset = (index, field, value) => {
    const newDatasets = [...multiDatasets]
    newDatasets[index][field] = value
    setMultiDatasets(newDatasets)
  }

  // ==================== 渲染 ====================

  if (!originStatus.available) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-2xl mx-auto my-8">
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
              <li>在后端运行: <code className="bg-blue-100 px-1 rounded">pip install originpro</code></li>
              <li>重启后端服务</li>
            </ol>
          </div>
          <button
            onClick={checkOriginStatus}
            className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
          >
            重新检查
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-4 ml-2 px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              关闭
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* 头部 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Origin 绘图工具
          </h2>
          <p className="text-blue-100 text-sm mt-1">使用Origin 2022+进行专业科学绘图</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            originStatus.can_connect ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white'
          }`}>
            {originStatus.can_connect ? '已连接' : '未连接'}
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

      {/* 标签页导航 */}
      <div className="border-b border-gray-200 bg-gray-50">
        <nav className="flex space-x-0 overflow-x-auto">
          {[
            { id: 'quick', label: '快速绘图', icon: '⚡' },
            { id: 'advanced', label: '高级设置', icon: '⚙️' },
            { id: 'xyz', label: '3D/XYZ图表', icon: '🎨' },
            { id: 'multi', label: '多层图表', icon: '📊' },
            { id: 'extracted', label: '使用提取数据', icon: '📈', disabled: !extractedData || extractedData.length === 0 },
            { id: 'labtalk', label: 'LabTalk', icon: '💻' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              } ${tab.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 内容区 */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧: 输入区 */}
        <div className="space-y-6">

          {/* 快速绘图 */}
          {activeTab === 'quick' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 mb-2">快速绘图</h3>
                <p className="text-sm text-blue-600">输入数据（逗号分隔）快速创建图表</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图表类型</label>
                <select
                  value={quickForm.plotType}
                  onChange={(e) => setQuickForm({ ...quickForm, plotType: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="line">折线图 (Line)</option>
                  <option value="scatter">散点图 (Scatter)</option>
                  <option value="line_symbol">线符号图 (Line+Symbol)</option>
                  <option value="column">柱状图 (Column)</option>
                  <option value="bar">条形图 (Bar)</option>
                  <option value="area">面积图 (Area)</option>
                  <option value="stacked_column">堆叠柱状图</option>
                  <option value="double_y">双Y轴图</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">X轴数据 (逗号分隔)</label>
                <input
                  type="text"
                  value={quickForm.xData}
                  onChange={(e) => setQuickForm({ ...quickForm, xData: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="例如: 1,2,3,4,5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Y轴数据 (逗号分隔)</label>
                <input
                  type="text"
                  value={quickForm.yData}
                  onChange={(e) => setQuickForm({ ...quickForm, yData: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="例如: 10,20,15,25,30"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">图表标题</label>
                  <input
                    type="text"
                    value={quickForm.title}
                    onChange={(e) => setQuickForm({ ...quickForm, title: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">X轴标题</label>
                  <input
                    type="text"
                    value={quickForm.xTitle}
                    onChange={(e) => setQuickForm({ ...quickForm, xTitle: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Y轴标题</label>
                <input
                  type="text"
                  value={quickForm.yTitle}
                  onChange={(e) => setQuickForm({ ...quickForm, yTitle: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={plotQuick}
                disabled={isPlotting}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-indigo-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPlotting ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    绘图中...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    绘制图表
                  </>
                )}
              </button>
            </div>
          )}

          {/* 高级设置 */}
          {activeTab === 'advanced' && (
            <div className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h3 className="font-semibold text-purple-800 mb-2">高级设置</h3>
                <p className="text-sm text-purple-600">自定义图表样式和导出选项</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">图表宽度</label>
                  <input
                    type="number"
                    value={advancedSettings.width}
                    onChange={(e) => setAdvancedSettings({ ...advancedSettings, width: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">图表高度</label>
                  <input
                    type="number"
                    value={advancedSettings.height}
                    onChange={(e) => setAdvancedSettings({ ...advancedSettings, height: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">导出格式</label>
                <select
                  value={advancedSettings.exportFormat}
                  onChange={(e) => setAdvancedSettings({ ...advancedSettings, exportFormat: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="pdf">PDF</option>
                  <option value="svg">SVG</option>
                  <option value="eps">EPS</option>
                  <option value="emf">EMF</option>
                  <option value="tiff">TIFF</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">曲线颜色</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={advancedSettings.color}
                    onChange={(e) => setAdvancedSettings({ ...advancedSettings, color: e.target.value })}
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={advancedSettings.color}
                    onChange={(e) => setAdvancedSettings({ ...advancedSettings, color: e.target.value })}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">X轴最小值</label>
                  <input
                    type="number"
                    value={advancedSettings.xMin}
                    onChange={(e) => setAdvancedSettings({ ...advancedSettings, xMin: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="自动"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">X轴最大值</label>
                  <input
                    type="number"
                    value={advancedSettings.xMax}
                    onChange={(e) => setAdvancedSettings({ ...advancedSettings, xMax: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="自动"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Y轴最小值</label>
                  <input
                    type="number"
                    value={advancedSettings.yMin}
                    onChange={(e) => setAdvancedSettings({ ...advancedSettings, yMin: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="自动"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Y轴最大值</label>
                  <input
                    type="number"
                    value={advancedSettings.yMax}
                    onChange={(e) => setAdvancedSettings({ ...advancedSettings, yMax: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="自动"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedSettings.showGrid}
                    onChange={(e) => setAdvancedSettings({ ...advancedSettings, showGrid: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">显示网格</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedSettings.showLegend}
                    onChange={(e) => setAdvancedSettings({ ...advancedSettings, showLegend: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">显示图例</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Origin模板 (.otp文件路径)</label>
                <input
                  type="text"
                  value={advancedSettings.template}
                  onChange={(e) => setAdvancedSettings({ ...advancedSettings, template: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
                  placeholder="留空使用默认模板"
                />
              </div>
            </div>
          )}

          {/* XYZ图表 */}
          {activeTab === 'xyz' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-800 mb-2">3D/XYZ图表</h3>
                <p className="text-sm text-green-600">创建3D曲面图、等高线图、热图等</p>
              </div>

              <button
                onClick={generateSampleXYZ}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                生成示例XYZ数据
              </button>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图表类型</label>
                <select
                  value={xyzForm.plotType}
                  onChange={(e) => setXyzForm({ ...xyzForm, plotType: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="surface_colormap">3D彩色曲面 (Surface Colormap)</option>
                  <option value="surface">3D曲面 (Surface)</option>
                  <option value="contour">等高线图 (Contour)</option>
                  <option value="xyz_contour">XYZ等高线 (XYZ Contour)</option>
                  <option value="tri_contour">三角网格等高线 (Tri Contour)</option>
                  <option value="heatmap">热图 (Heatmap)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">X数据 (逗号分隔)</label>
                <textarea
                  value={xyzForm.xData}
                  onChange={(e) => setXyzForm({ ...xyzForm, xData: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm h-20"
                  placeholder="例如: 1,2,3,1,2,3,..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Y数据 (逗号分隔)</label>
                <textarea
                  value={xyzForm.yData}
                  onChange={(e) => setXyzForm({ ...xyzForm, yData: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm h-20"
                  placeholder="例如: 1,1,1,2,2,2,..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Z数据 (逗号分隔)</label>
                <textarea
                  value={xyzForm.zData}
                  onChange={(e) => setXyzForm({ ...xyzForm, zData: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm h-20"
                  placeholder="例如: 0.5,0.6,0.7,0.4,0.5,0.6,..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">颜色映射</label>
                <select
                  value={xyzForm.colormap}
                  onChange={(e) => setXyzForm({ ...xyzForm, colormap: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="Maple.pal">Maple</option>
                  <option value="Rainbow.pal">Rainbow</option>
                  <option value="BlueYellow.pal">BlueYellow</option>
                  <option value="RedBlue.pal">RedBlue</option>
                  <option value="Gray.pal">Gray</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图表标题</label>
                <input
                  type="text"
                  value={xyzForm.title}
                  onChange={(e) => setXyzForm({ ...xyzForm, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <button
                onClick={plotXYZ}
                disabled={isPlotting}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-600 transition disabled:opacity-50"
              >
                {isPlotting ? '绘图中...' : '绘制3D图表'}
              </button>
            </div>
          )}

          {/* 多层图表 */}
          {activeTab === 'multi' && (
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h3 className="font-semibold text-orange-800 mb-2">多层图表</h3>
                <p className="text-sm text-orange-600">创建包含多个数据面板的图表</p>
              </div>

              {multiDatasets.map((dataset, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <input
                      type="text"
                      value={dataset.name}
                      onChange={(e) => updateMultiDataset(index, 'name', e.target.value)}
                      className="font-medium text-gray-700 bg-transparent border-none focus:outline-none"
                    />
                    {multiDatasets.length > 1 && (
                      <button
                        onClick={() => removeMultiDataset(index)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        删除
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">X数据</label>
                    <input
                      type="text"
                      value={dataset.xData}
                      onChange={(e) => updateMultiDataset(index, 'xData', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Y数据</label>
                    <input
                      type="text"
                      value={dataset.yData}
                      onChange={(e) => updateMultiDataset(index, 'yData', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
                    />
                  </div>
                </div>
              ))}

              <button
                onClick={addMultiDataset}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-500 transition"
              >
                + 添加数据集
              </button>

              <button
                onClick={plotMulti}
                disabled={isPlotting}
                className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-medium hover:from-orange-600 hover:to-amber-600 transition disabled:opacity-50"
              >
                {isPlotting ? '绘图中...' : '绘制多层图表'}
              </button>
            </div>
          )}

          {/* 使用提取数据 */}
          {activeTab === 'extracted' && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h3 className="font-semibold text-indigo-800 mb-2">使用提取的数据</h3>
                <p className="text-sm text-indigo-600">
                  当前有 <strong>{extractedData?.length || 0}</strong> 个数据点
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图表类型</label>
                <select
                  value={extractedConfig.plotType}
                  onChange={(e) => setExtractedConfig({ ...extractedConfig, plotType: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="line">折线图</option>
                  <option value="scatter">散点图</option>
                  <option value="line_symbol">线符号图</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图表标题</label>
                <input
                  type="text"
                  value={extractedConfig.title}
                  onChange={(e) => setExtractedConfig({ ...extractedConfig, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">导出格式</label>
                <select
                  value={extractedConfig.exportFormat}
                  onChange={(e) => setExtractedConfig({ ...extractedConfig, exportFormat: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="png">PNG</option>
                  <option value="pdf">PDF</option>
                  <option value="svg">SVG</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">宽度</label>
                  <input
                    type="number"
                    value={extractedConfig.width}
                    onChange={(e) => setExtractedConfig({ ...extractedConfig, width: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">高度</label>
                  <input
                    type="number"
                    value={extractedConfig.height}
                    onChange={(e) => setExtractedConfig({ ...extractedConfig, height: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <button
                onClick={plotFromExtracted}
                disabled={isPlotting}
                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg font-medium hover:from-indigo-600 hover:to-purple-600 transition disabled:opacity-50"
              >
                {isPlotting ? '绘图中...' : '使用Origin绘制提取的数据'}
              </button>
            </div>
          )}

          {/* LabTalk */}
          {activeTab === 'labtalk' && (
            <div className="space-y-4">
              <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 mb-2">LabTalk 脚本</h3>
                <p className="text-sm text-gray-600">
                  LabTalk是Origin的脚本语言，可用于高级操作
                </p>
                <a
                  href="https://www.originlab.com/doc/LabTalk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  查看LabTalk文档 &rarr;
                </a>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LabTalk命令</label>
                <textarea
                  value={labtalkCommand}
                  onChange={(e) => setLabtalkCommand(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm h-32 bg-gray-50"
                  placeholder='例如: doc -uw;  // 保存项目'
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <h4 className="font-medium text-yellow-800 mb-2">常用命令示例:</h4>
                <ul className="text-sm text-yellow-700 space-y-1">
                  <li><code>doc -uw;</code> - 保存项目</li>
                  <li><code>layer -s 1;</code> - 选择图层1</li>
                  <li><code>worksheet -s 1;</code> - 选择工作表1</li>
                  <li><code>type -b "Hello";</code> - 显示消息</li>
                </ul>
              </div>

              <button
                onClick={executeLabTalk}
                disabled={isPlotting || !labtalkCommand.trim()}
                className="w-full py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg font-medium hover:from-gray-700 hover:to-gray-800 transition disabled:opacity-50"
              >
                {isPlotting ? '执行中...' : '执行LabTalk命令'}
              </button>

              {labtalkResult && (
                <div className={`p-3 rounded-lg ${labtalkResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {labtalkResult.message}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右侧: 结果区 */}
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <h3 className="font-semibold text-gray-800 mb-3">绘图结果</h3>

            {plotResult ? (
              <div className="space-y-4">
                {plotResult.success ? (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-green-700 text-sm">{plotResult.message}</p>
                    </div>

                    {/* 图片预览 */}
                    {plotResult.image_path && (
                      <div>
                        <p className="text-sm text-gray-600 mb-2">导出的图表:</p>
                        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                          <img
                            src={`/${plotResult.image_path.replace('\\', '/')}`}
                            alt="Origin Plot"
                            className="w-full h-auto"
                            onError={(e) => {
                              e.target.src = `http://localhost:8000/${plotResult.image_path.replace('\\', '/')}`
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* 下载链接 */}
                    <div className="space-y-2">
                      {plotResult.image_path && (
                        <a
                          href={`http://localhost:8000/${plotResult.image_path.replace('\\', '/')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          下载图表图片
                        </a>
                      )}
                      {plotResult.project_path && (
                        <a
                          href={`http://localhost:8000/${plotResult.project_path.replace('\\', '/')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          下载Origin项目文件 (.opju)
                        </a>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-sm">{plotResult.message}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p>输入数据并点击"绘制图表"</p>
                <p className="text-sm mt-1">生成的图表将显示在这里</p>
              </div>
            )}
          </div>

          {/* 使用说明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="font-semibold text-blue-800 mb-2">使用说明</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• 支持多种2D图表: 折线图、散点图、柱状图等</li>
              <li>• 支持多种3D图表: 曲面图、等高线图、热图等</li>
              <li>• 可以直接使用从图表中提取的数据绘图</li>
              <li>• 支持导出PNG、PDF、SVG等多种格式</li>
              <li>• 支持使用自定义Origin模板</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OriginPlotPanel
