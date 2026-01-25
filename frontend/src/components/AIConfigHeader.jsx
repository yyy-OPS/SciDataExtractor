import { useState } from 'react'

/**
 * AI 配置头部组件
 * 显示在页面右上角，提供 AI 配置和状态显示
 */
const AIConfigHeader = ({
  aiAvailable,
  onAIConfig,
  onCheckStatus
}) => {
  const [showConfig, setShowConfig] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('gpt-4o')
  const [customModel, setCustomModel] = useState('')
  const [useCustomModel, setUseCustomModel] = useState(false)
  const [testStatus, setTestStatus] = useState(null)
  const [testMessage, setTestMessage] = useState('')

  const presetModels = [
    { value: 'gpt-4o', label: 'GPT-4o (推荐)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'qwen-vl-max', label: '通义千问 VL Max' },
  ]

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestStatus('error')
      setTestMessage('请先输入 API Key')
      return
    }

    setTestStatus('testing')
    setTestMessage('正在测试连接...')

    try {
      const response = await fetch('/ai/test', {
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
    if (onCheckStatus) onCheckStatus()
  }

  return (
    <div className="relative">
      {/* AI 状态按钮 */}
      <button
        onClick={() => setShowConfig(!showConfig)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
          aiAvailable
            ? 'bg-green-500/20 text-green-100 hover:bg-green-500/30'
            : 'bg-gray-500/20 text-gray-200 hover:bg-gray-500/30'
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span className="text-sm font-medium">
          {aiAvailable ? 'AI 已就绪' : 'AI 未配置'}
        </span>
        {aiAvailable && (
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
        )}
        <svg className={`w-4 h-4 transition-transform ${showConfig ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 配置面板 */}
      {showConfig && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              AI 配置
            </h3>

            <div className="space-y-4">
              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                />
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base URL <span className="text-gray-400">(可选)</span>
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                />
                <p className="text-xs text-gray-500 mt-1">
                  留空使用 OpenAI 官方 API，或填写兼容 API 地址
                </p>
              </div>

              {/* 模型选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  模型
                </label>
                <div className="space-y-2">
                  <select
                    value={useCustomModel ? 'custom' : model}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setUseCustomModel(true)
                      } else {
                        setUseCustomModel(false)
                        setModel(e.target.value)
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  >
                    {presetModels.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                    <option value="custom">自定义模型...</option>
                  </select>

                  {useCustomModel && (
                    <input
                      type="text"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder="输入模型名称"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                    />
                  )}
                </div>
              </div>

              {/* 测试状态 */}
              {testStatus && (
                <div className={`p-3 rounded-lg text-sm ${
                  testStatus === 'testing' ? 'bg-blue-50 text-blue-700' :
                  testStatus === 'success' ? 'bg-green-50 text-green-700' :
                  'bg-red-50 text-red-700'
                }`}>
                  {testStatus === 'testing' && (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {testMessage}
                    </span>
                  )}
                  {testStatus === 'success' && (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {testMessage}
                    </span>
                  )}
                  {testStatus === 'error' && (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {testMessage}
                    </span>
                  )}
                </div>
              )}

              {/* 按钮 */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition text-sm"
                >
                  测试连接
                </button>
                <button
                  onClick={handleConfigSubmit}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                >
                  保存配置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AIConfigHeader
