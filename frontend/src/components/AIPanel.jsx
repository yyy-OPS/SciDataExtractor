import { useState } from 'react'

/**
 * 将 OpenCV HSV 颜色转换为 CSS RGB 颜色
 * OpenCV HSV: H (0-179), S (0-255), V (0-255)
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

const AIPanel = ({
  sessionId,
  aiAvailable,
  aiAnalysis,
  isLoading,
  onAIConfig,
  onAIAnalyze,
  onApplyCalibration,
  onApplyColor,
  onAIRepairCurve,
  extractedData
}) => {
  const [showConfig, setShowConfig] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('gpt-4o')
  const [customModel, setCustomModel] = useState('')
  const [useCustomModel, setUseCustomModel] = useState(false)
  const [testStatus, setTestStatus] = useState(null) // null, 'testing', 'success', 'error'
  const [testMessage, setTestMessage] = useState('')

  const handleConfigSubmit = () => {
    if (!apiKey.trim()) {
      alert('请输入 API Key')
      return
    }
    const finalModel = useCustomModel ? customModel : model
    if (!finalModel.trim()) {
      alert('请选择或输入模型名称')
      return
    }
    onAIConfig({
      api_key: apiKey,
      base_url: baseUrl || null,
      model: finalModel
    })
    setShowConfig(false)
  }

  // 测试 API 连接
  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestStatus('error')
      setTestMessage('请先输入 API Key')
      return
    }

    setTestStatus('testing')
    setTestMessage('正在测试连接...')

    try {
      const response = await fetch('http://localhost:8000/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          base_url: baseUrl || null,
          model: useCustomModel ? customModel : model
        })
      })

      const data = await response.json()

      if (data.success) {
        setTestStatus('success')
        setTestMessage(data.message || '连接成功！')
      } else {
        setTestStatus('error')
        setTestMessage(data.message || '连接失败')
      }
    } catch (error) {
      setTestStatus('error')
      setTestMessage(`连接错误: ${error.message}`)
    }
  }

  // 预设模型列表
  const presetModels = [
    { value: 'gpt-4o', label: 'GPT-4o (推荐)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (快速)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4-vision-preview', label: 'GPT-4 Vision' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { value: 'gemini-pro-vision', label: 'Gemini Pro Vision' },
    { value: 'qwen-vl-max', label: '通义千问 VL Max' },
    { value: 'glm-4v', label: 'GLM-4V' },
  ]

  return (
    <div className="space-y-4">
      {/* AI 状态和配置 */}
      {!aiAvailable ? (
        <div className="space-y-3">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 text-sm">
              AI 助手未配置。配置后可自动识别图表坐标轴、曲线颜色，并支持曲线连续性修复。
            </p>
          </div>

          {!showConfig ? (
            <button
              onClick={() => setShowConfig(true)}
              className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition"
            >
              配置 AI 助手
            </button>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-gray-700">AI 配置</h4>

              <div>
                <label className="block text-sm text-gray-600 mb-1">API Key *</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">API Base URL (可选)</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  支持 OpenAI、Azure、本地模型、国内代理等兼容接口
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">模型选择</label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="useCustomModel"
                    checked={useCustomModel}
                    onChange={(e) => setUseCustomModel(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="useCustomModel" className="text-sm text-gray-600">
                    使用自定义模型名称
                  </label>
                </div>

                {!useCustomModel ? (
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    {presetModels.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="输入模型名称，如: gpt-4o, claude-3-sonnet..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                )}
              </div>

              {/* 测试连接按钮 */}
              <div>
                <button
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 disabled:bg-gray-400 transition flex items-center justify-center gap-2"
                >
                  {testStatus === 'testing' ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>
                      测试中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      测试连接
                    </>
                  )}
                </button>

                {/* 测试结果 */}
                {testStatus && testStatus !== 'testing' && (
                  <div className={`mt-2 p-2 rounded text-sm ${
                    testStatus === 'success'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {testStatus === 'success' ? '✓ ' : '✗ '}{testMessage}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleConfigSubmit}
                  disabled={isLoading}
                  className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition"
                >
                  {isLoading ? '配置中...' : '确认配置'}
                </button>
                <button
                  onClick={() => {
                    setShowConfig(false)
                    setTestStatus(null)
                    setTestMessage('')
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* AI 已配置 */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-green-800 text-sm flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              AI 助手已就绪
            </p>
          </div>

          {!sessionId ? (
            <p className="text-gray-500 text-sm text-center py-2">请先上传图像</p>
          ) : (
            <div className="space-y-2">
              {/* AI 分析按钮 */}
              <button
                onClick={onAIAnalyze}
                disabled={isLoading}
                className="w-full bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    AI 分析中...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    AI 智能分析图表
                  </>
                )}
              </button>

              {/* AI 曲线修复按钮 - 仅在有提取数据时显示 */}
              {extractedData && extractedData.length > 0 && onAIRepairCurve && (
                <button
                  onClick={onAIRepairCurve}
                  disabled={isLoading}
                  className="w-full bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 disabled:bg-gray-400 transition flex items-center justify-center gap-2 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  AI 修复曲线断点
                </button>
              )}
            </div>
          )}

          {/* 重新配置按钮 */}
          <button
            onClick={() => {
              setShowConfig(true)
              setTestStatus(null)
              setTestMessage('')
            }}
            className="w-full text-sm text-purple-600 hover:text-purple-800"
          >
            重新配置 AI
          </button>

          {/* 配置面板 */}
          {showConfig && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3 mt-2">
              <h4 className="font-medium text-gray-700">重新配置 AI</h4>

              <div>
                <label className="block text-sm text-gray-600 mb-1">API Key *</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">API Base URL (可选)</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">模型选择</label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="useCustomModel2"
                    checked={useCustomModel}
                    onChange={(e) => setUseCustomModel(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="useCustomModel2" className="text-sm text-gray-600">
                    使用自定义模型名称
                  </label>
                </div>

                {!useCustomModel ? (
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    {presetModels.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="输入模型名称"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                )}
              </div>

              {/* 测试连接 */}
              <button
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 disabled:bg-gray-400 transition"
              >
                {testStatus === 'testing' ? '测试中...' : '测试连接'}
              </button>

              {testStatus && testStatus !== 'testing' && (
                <div className={`p-2 rounded text-sm ${
                  testStatus === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {testMessage}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleConfigSubmit}
                  className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition"
                >
                  保存
                </button>
                <button
                  onClick={() => {
                    setShowConfig(false)
                    setTestStatus(null)
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI 分析结果 */}
      {aiAnalysis && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-4">
          <h4 className="font-semibold text-purple-900 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            AI 分析结果
          </h4>

          {/* 图表类型 */}
          {aiAnalysis.chart_type && (
            <div className="bg-white rounded p-3">
              <p className="text-sm text-gray-600">图表类型</p>
              <p className="font-medium text-gray-900">{aiAnalysis.chart_type}</p>
            </div>
          )}

          {/* 坐标轴信息 */}
          <div className="grid grid-cols-2 gap-3">
            {aiAnalysis.x_axis && (
              <div className="bg-white rounded p-3">
                <p className="text-sm text-gray-600">X 轴</p>
                <p className="font-medium text-gray-900">{aiAnalysis.x_axis.label || 'X'}</p>
                <p className="text-sm text-gray-700">
                  {aiAnalysis.x_axis.min_value} ~ {aiAnalysis.x_axis.max_value}
                  {aiAnalysis.x_axis.unit && ` ${aiAnalysis.x_axis.unit}`}
                </p>
              </div>
            )}

            {aiAnalysis.y_axis && (
              <div className="bg-white rounded p-3">
                <p className="text-sm text-gray-600">Y 轴</p>
                <p className="font-medium text-gray-900">{aiAnalysis.y_axis.label || 'Y'}</p>
                <p className="text-sm text-gray-700">
                  {aiAnalysis.y_axis.min_value} ~ {aiAnalysis.y_axis.max_value}
                  {aiAnalysis.y_axis.unit && ` ${aiAnalysis.y_axis.unit}`}
                </p>
              </div>
            )}
          </div>

          {/* 应用校准建议 */}
          {aiAnalysis.x_axis && aiAnalysis.y_axis && (
            <button
              onClick={() => onApplyCalibration(aiAnalysis)}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition text-sm"
            >
              应用 AI 建议的坐标范围
            </button>
          )}

          {/* 曲线颜色 */}
          {aiAnalysis.curves && aiAnalysis.curves.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">检测到的曲线</p>
              {aiAnalysis.curves.map((curve, index) => (
                <div key={index} className="bg-white rounded p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded border border-gray-300"
                      style={{
                        backgroundColor: curve.suggested_hsv
                          ? hsvToRgb(curve.suggested_hsv.h, curve.suggested_hsv.s, curve.suggested_hsv.v)
                          : '#ccc'
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium">{curve.color_name || '未知颜色'}</p>
                      <p className="text-xs text-gray-500">{curve.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onApplyColor(curve)}
                    className="text-sm bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition"
                  >
                    应用
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 备注 */}
          {aiAnalysis.notes && (
            <div className="bg-yellow-50 rounded p-3">
              <p className="text-sm text-yellow-800">
                <strong>提示:</strong> {aiAnalysis.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 功能说明 */}
      <div className="text-xs text-gray-500 border-t pt-3">
        <p className="font-medium mb-1">AI 助手功能:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>自动识别坐标轴范围和单位</li>
          <li>检测曲线颜色并建议 HSV 值</li>
          <li>智能修复曲线断点和重叠区域</li>
          <li>支持 OpenAI 兼容的多模态模型</li>
        </ul>
      </div>
    </div>
  )
}

export default AIPanel
