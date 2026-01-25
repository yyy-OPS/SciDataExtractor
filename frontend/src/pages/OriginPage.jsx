/**
 * Origin绘图独立页面
 *
 * 这是一个完整的Origin绘图工具页面
 * 可以作为独立功能使用
 */

import { useState } from 'react'
import OriginPlotPanel from '../components/OriginPlotPanel'

const OriginPage = () => {
  const [showPanel, setShowPanel] = useState(true)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200">
      {/* 页面头部 */}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* 返回按钮 */}
              <a
                href="/"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                返回
              </a>

              {/* Logo和标题 */}
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Origin 绘图工具</h1>
                <p className="text-sm text-gray-500">Professional Scientific Plotting with Origin</p>
              </div>
            </div>

            {/* GitHub链接 */}
            <a
              href="https://www.originlab.com/doc/ExternalPython"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-700 transition"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="container mx-auto px-4 py-8">
        {/* 功能介绍卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[
            {
              icon: '📈',
              title: '2D图表',
              description: '折线图、散点图、柱状图、面积图等',
              color: 'from-blue-500 to-blue-600'
            },
            {
              icon: '🎨',
              title: '3D图表',
              description: '曲面图、等高线图、热图等',
              color: 'from-green-500 to-green-600'
            },
            {
              icon: '📊',
              title: '多层图表',
              description: '多面板对比展示',
              color: 'from-purple-500 to-purple-600'
            }
          ].map((feature, index) => (
            <div key={index} className="bg-white rounded-xl shadow-md p-6 flex items-start gap-4">
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center text-2xl flex-shrink-0`}>
                {feature.icon}
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Origin绘图面板 */}
        {showPanel ? (
          <OriginPlotPanel
            extractedData={null}
            onClose={() => setShowPanel(false)}
          />
        ) : (
          <div className="text-center py-12">
            <button
              onClick={() => setShowPanel(true)}
              className="px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
            >
              打开Origin绘图面板
            </button>
          </div>
        )}

        {/* 使用指南 */}
        <div className="mt-8 bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">使用指南</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">环境配置</h3>
              <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
                <li>确保已安装 Origin 2021 或更高版本（推荐 Origin 2022）</li>
                <li>在后端运行: <code className="bg-gray-100 px-1 rounded">pip install originpro</code></li>
                <li>重启后端服务</li>
                <li>确保Origin可以正常启动</li>
              </ol>
            </div>

            <div>
              <h3 className="font-semibold text-gray-700 mb-2">数据格式</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 使用逗号、空格或分号分隔数值</li>
                <li>• 例如: <code className="bg-gray-100 px-1 rounded">1,2,3,4,5</code></li>
                <li>• 支持Excel复制粘贴的数据</li>
                <li>• XYZ图表需要三个等长的数据数组</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-800 mb-2">注意事项</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Origin绘图功能仅在Windows系统上可用</li>
              <li>• 首次绘图可能需要启动Origin，请耐心等待</li>
              <li>• 如遇到错误，请检查Origin是否正常安装</li>
              <li>• 导出的Origin项目文件(.opju)可以用Origin打开进一步编辑</li>
            </ul>
          </div>
        </div>

        {/* API文档链接 */}
        <div className="mt-6 bg-gray-800 rounded-xl p-6 text-white">
          <h2 className="text-xl font-bold mb-4">更多资源</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a
              href="https://www.originlab.com/doc/ExternalPython"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-700 hover:bg-gray-600 rounded-lg p-4 transition"
            >
              <h3 className="font-semibold">Origin Python文档</h3>
              <p className="text-sm text-gray-300 mt-1">External Python API</p>
            </a>
            <a
              href="https://www.originlab.com/doc/python/Examples/Graphing"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-700 hover:bg-gray-600 rounded-lg p-4 transition"
            >
              <h3 className="font-semibold">绘图示例</h3>
              <p className="text-sm text-gray-300 mt-1">Graphing Examples</p>
            </a>
            <a
              href="https://github.com/originlab/Python-Samples"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-700 hover:bg-gray-600 rounded-lg p-4 transition"
            >
              <h3 className="font-semibold">GitHub示例</h3>
              <p className="text-sm text-gray-300 mt-1">Python-Samples</p>
            </a>
          </div>
        </div>
      </main>

      {/* 页脚 */}
      <footer className="bg-gray-800 text-gray-300 py-4 mt-8">
        <div className="container mx-auto px-4 text-center">
          <p>Origin Plotting Tool - Powered by originpro package</p>
        </div>
      </footer>
    </div>
  )
}

export default OriginPage
