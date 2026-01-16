import { useState, useEffect, useCallback } from 'react'
import ImageCanvas from './components/ImageCanvas'
import ControlPanel from './components/ControlPanel'
import AIConfigHeader from './components/AIConfigHeader'
import DataPreview from './components/DataPreview'
import LayerEditor from './components/LayerEditor'
import './App.css'

const API_BASE = 'http://localhost:8000'

function App() {
  // ========== 状态管理 ==========
  const [sessionId, setSessionId] = useState(null)
  const [uploadedImage, setUploadedImage] = useState(null)
  const [currentStep, setCurrentStep] = useState(1) // 1: 上传, 2: 校准, 3: 采样, 3.5: 框选范围, 4: 提取

  // 校准数据
  const [calibrationPoints, setCalibrationPoints] = useState({
    xStart: null,
    xEnd: null,
    yStart: null,
    yEnd: null
  })

  // 数据提取范围（框选区域）
  const [extractRegion, setExtractRegion] = useState(null) // { x, y, width, height } in pixels

  // 颜色采样
  const [sampledColor, setSampledColor] = useState(null)
  const [tolerance, setTolerance] = useState(20)

  // 数据提取设置
  const [pointSpacing, setPointSpacing] = useState(1) // 点间距（降采样因子）
  const [pointDensity, setPointDensity] = useState('medium') // 点密集度: low, medium, high

  // 提取的数据
  const [extractedData, setExtractedData] = useState([])
  const [repairedData, setRepairedData] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')

  // 历史记录系统 - 用于撤回/重做
  const [history, setHistory] = useState([]) // 历史记录栈
  const [historyIndex, setHistoryIndex] = useState(-1) // 当前历史位置

  // AI 相关状态
  const [aiAvailable, setAiAvailable] = useState(false)

  // 预览面板显示状态 - 默认收起以避免卡顿
  const [showPreview, setShowPreview] = useState(false)

  // 选中的区域（用于AI处理）
  const [selectedRegion, setSelectedRegion] = useState(null)

  // 手动绘制模式
  const [isManualDrawMode, setIsManualDrawMode] = useState(false)
  const [smoothness, setSmoothness] = useState(0.5) // 平滑度 0-1

  // 图层编辑模式
  const [useLayerEditor, setUseLayerEditor] = useState(false) // 是否使用图层编辑器
  const [selectedLayer, setSelectedLayer] = useState(null) // 当前选中的图层

  // 保存历史记录
  const saveHistory = useCallback((newData, action = '') => {
    // 如果当前不在历史记录的末尾，删除后面的记录
    const newHistory = history.slice(0, historyIndex + 1)

    // 添加新的历史记录
    newHistory.push({
      data: [...newData],
      action: action,
      timestamp: Date.now()
    })

    // 限制历史记录数量（最多保存50条）
    if (newHistory.length > 50) {
      newHistory.shift()
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
    } else {
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
    }
  }, [history, historyIndex])

  // 撤回操作
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setExtractedData([...history[newIndex].data])
      setMessage(`已撤回: ${history[historyIndex].action}`)
    } else {
      setMessage('没有可撤回的操作')
    }
  }, [history, historyIndex])

  // 重做操作
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setExtractedData([...history[newIndex].data])
      setMessage(`已重做: ${history[newIndex].action}`)
    } else {
      setMessage('没有可重做的操作')
    }
  }, [history, historyIndex])

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Z 撤回
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      // Ctrl+Y 或 Ctrl+Shift+Z 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo])

  // 启动时检查 AI 状态
  useEffect(() => {
    checkAIStatus()
  }, [])

  // 粘贴上传图片功能
  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          handleImageUpload(file)
        }
        break
      }
    }
  }, [])

  // 监听粘贴事件
  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  const checkAIStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/ai/status`)
      const data = await response.json()
      setAiAvailable(data.available)
    } catch (error) {
      console.log('AI 状态检查失败:', error)
      setAiAvailable(false)
    }
  }

  // ========== 处理函数 ==========

  const handleImageUpload = async (file) => {
    setIsLoading(true)
    setMessage('正在上传图像...')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (response.ok) {
        setSessionId(data.session_id)
        setUploadedImage(URL.createObjectURL(file))
        setCurrentStep(2)
        setMessage('图像上传成功！请点击图像设置校准点，或使用 AI 辅助分析')
        setAiAnalysis(null)
        setExtractedData([])
        setRepairedData([])
      } else {
        setMessage(`上传失败: ${data.detail}`)
      }
    } catch (error) {
      setMessage(`上传错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCalibrationComplete = (points) => {
    setCalibrationPoints(points)
    setCurrentStep(3)
    setMessage('校准完成！请点击要提取的曲线以采样颜色')
  }

  const handleColorSample = async (pixelX, pixelY) => {
    setIsLoading(true)
    setMessage('正在采样颜色...')

    try {
      const response = await fetch(`${API_BASE}/sample-color`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          pixel_x: Math.round(pixelX),
          pixel_y: Math.round(pixelY),
          tolerance: tolerance
        })
      })

      const data = await response.json()

      if (response.ok) {
        setSampledColor(data.hsv_color)
        setCurrentStep(4)
        setMessage(`采样成功: HSV(${data.hsv_color.join(', ')})`)
      } else {
        setMessage(`采样失败: ${data.detail}`)
      }
    } catch (error) {
      setMessage(`采样错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExtractData = async () => {
    if (!calibrationPoints.xStart || !sampledColor) {
      setMessage('请先完成校准和颜色采样')
      return
    }

    setIsLoading(true)
    setMessage('正在提取数据...')

    try {
      // 根据点密集度计算降采样因子
      let downsampleFactor = pointSpacing
      if (pointDensity === 'low') {
        downsampleFactor = Math.max(downsampleFactor, 3)
      } else if (pointDensity === 'high') {
        downsampleFactor = Math.max(1, Math.floor(downsampleFactor / 2))
      }

      const response = await fetch(`${API_BASE}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
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
          sampled_color_hsv: sampledColor,
          tolerance: tolerance,
          downsample_factor: downsampleFactor,
          smooth: false, // 默认不平滑，用户可以后续使用AI平滑
          extract_region: extractRegion // 添加提取范围限制
        })
      })

      const data = await response.json()

      if (response.ok) {
        setExtractedData(data.data)
        saveHistory(data.data, '提取曲线数据')
        setRepairedData([])
        if (data.count > 0) {
          const densityText = pointDensity === 'low' ? '稀疏' : pointDensity === 'high' ? '密集' : '中等'
          const regionText = extractRegion ? '（限定范围内）' : ''
          setMessage(`成功提取 ${data.count} 个数据点${regionText}（${densityText}模式），点击"展开预览"查看图表`)
          // 不自动展开预览，避免大量数据导致卡顿
        } else {
          setMessage('未检测到曲线，请尝试调整颜色容差或调整提取范围')
        }
      } else {
        setMessage(`提取失败: ${data.detail}`)
      }
    } catch (error) {
      setMessage(`提取错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportExcel = async () => {
    if (extractedData.length === 0) {
      setMessage('没有数据可导出')
      return
    }

    setIsLoading(true)
    setMessage('正在生成 Excel 文件...')

    try {
      const response = await fetch(`${API_BASE}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
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
          sampled_color_hsv: sampledColor,
          tolerance: tolerance,
          data: extractedData  // 发送当前编辑后的数据
        })
      })

      const data = await response.json()

      if (response.ok) {
        window.open(`${API_BASE}${data.download_url}`, '_blank')
        setMessage(`Excel 文件已生成 (${extractedData.length} 个数据点)，正在下载...`)
      } else {
        setMessage(`导出失败: ${data.detail}`)
      }
    } catch (error) {
      setMessage(`导出错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // 重置所有
  const handleReset = () => {
    setSessionId(null)
    setUploadedImage(null)
    setCurrentStep(1)
    setCalibrationPoints({ xStart: null, xEnd: null, yStart: null, yEnd: null })
    setSampledColor(null)
    setExtractedData([])
    setRepairedData([])
    setMessage('')
    setShowPreview(false)
  }

  // 重置校准（回到步骤2）
  const handleResetCalibration = () => {
    setCalibrationPoints({ xStart: null, xEnd: null, yStart: null, yEnd: null })
    setSampledColor(null)
    setExtractedData([])
    setRepairedData([])
    setCurrentStep(2)
    setMessage('已重置校准，请重新设置校准点')
  }

  // 重置颜色采样（回到步骤3）
  const handleResetColor = () => {
    setSampledColor(null)
    setExtractedData([])
    setRepairedData([])
    setCurrentStep(3)
    setMessage('已重置颜色采样，请重新点击曲线采样')
  }

  // ========== AI 处理函数 ==========

  // AI 识别应用坐标轴
  const handleAIApplyAxes = (axes) => {
    // 设置校准点（使用虚拟像素位置，实际值由 AI 提供）
    setCalibrationPoints({
      xStart: { x: 0, y: 0, value: axes.xMin },
      xEnd: { x: 100, y: 0, value: axes.xMax },
      yStart: { x: 0, y: 100, value: axes.yMin },
      yEnd: { x: 0, y: 0, value: axes.yMax }
    })
    setCurrentStep(3)
    setMessage(`已应用坐标轴: X(${axes.xMin} ~ ${axes.xMax}), Y(${axes.yMin} ~ ${axes.yMax})`)
  }

  // AI 识别应用颜色
  const handleAIApplyColor = (hsv) => {
    setSampledColor(hsv)
    setCurrentStep(4)
    setMessage(`已应用颜色: HSV(${hsv[0]}, ${hsv[1]}, ${hsv[2]})`)
  }

  const handleAIAnalyze = async () => {
    if (!sessionId) {
      setMessage('请先上传图像')
      return
    }

    setIsLoading(true)
    setMessage('AI 正在分析图表...')

    try {
      const response = await fetch(`${API_BASE}/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      })

      const data = await response.json()

      if (data.success) {
        setMessage('AI 分析完成！')
      } else {
        setMessage(`AI 分析失败: ${data.message}`)
      }
    } catch (error) {
      setMessage(`AI 分析错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAIConfig = async (config) => {
    setIsLoading(true)
    setMessage('正在配置 AI...')

    try {
      const response = await fetch(`${API_BASE}/ai/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })

      const data = await response.json()

      if (data.success) {
        setAiAvailable(true)
        setMessage('AI 配置成功！')
      } else {
        setMessage(`AI 配置失败: ${data.detail}`)
      }
    } catch (error) {
      setMessage(`AI 配置错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleApplyAICalibration = (aiData) => {
    if (aiData.x_axis && aiData.y_axis) {
      setMessage(`AI 建议: X轴 ${aiData.x_axis.min_value} 到 ${aiData.x_axis.max_value}${aiData.x_axis.unit || ''}, Y轴 ${aiData.y_axis.min_value} 到 ${aiData.y_axis.max_value}${aiData.y_axis.unit || ''}。请在图像上点击设置校准点。`)
    }
  }

  const handleApplyAIColor = (curve) => {
    if (curve.suggested_hsv) {
      const hsv = [
        curve.suggested_hsv.h,
        curve.suggested_hsv.s,
        curve.suggested_hsv.v
      ]
      setSampledColor(hsv)
      if (curve.suggested_tolerance) {
        setTolerance(curve.suggested_tolerance)
      }
      if (currentStep < 4 && calibrationPoints.xStart) {
        setCurrentStep(4)
      }
      setMessage(`已应用 AI 建议的颜色: ${curve.color_name} (HSV: ${hsv.join(', ')})`)
    }
  }

  // AI 曲线修复
  const handleAIRepairCurve = async () => {
    if (extractedData.length === 0) {
      setMessage('请先提取数据，然后再使用 AI 修复')
      return
    }

    setIsLoading(true)
    setMessage('AI 正在分析并修复曲线断点...')

    try {
      const response = await fetch(`${API_BASE}/ai/repair-curve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          extracted_points: extractedData,
          calibration_info: calibrationPoints.xStart ? {
            x_min: calibrationPoints.xStart.value,
            x_max: calibrationPoints.xEnd.value,
            y_min: calibrationPoints.yStart.value,
            y_max: calibrationPoints.yEnd.value
          } : null
        })
      })

      const data = await response.json()

      if (data.success) {
        if (data.data.has_gaps) {
          setRepairedData(data.data.repaired_points)
          setMessage(`AI 修复完成！添加了 ${data.data.added_points.length} 个插值点。可在预览面板查看对比。`)
          setShowPreview(true)
        } else {
          setMessage('曲线没有明显断点，无需修复')
        }
      } else {
        setMessage(`AI 修复失败: ${data.message}`)
      }
    } catch (error) {
      setMessage(`AI 修复错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // 应用修复后的数据
  const handleApplyRepairedData = () => {
    if (repairedData.length > 0) {
      setExtractedData(repairedData)
      saveHistory(repairedData, 'AI 修复曲线')
      setRepairedData([])
      setMessage('已应用 AI 修复后的数据')
    }
  }

  // 删除选中的数据点（框选删除功能）
  const handleDeletePoints = (indicesToDelete) => {
    if (indicesToDelete.length === 0) return

    const newData = extractedData.filter((_, index) => !indicesToDelete.includes(index))
    setExtractedData(newData)
    saveHistory(newData, `删除 ${indicesToDelete.length} 个数据点`)
    setMessage(`已删除 ${indicesToDelete.length} 个数据点，剩余 ${newData.length} 个`)
  }

  // 添加手动重描的数据点（支持点间距设置）
  const handleAddManualPoints = (newPoints) => {
    if (newPoints.length === 0) return

    // 合并新点和现有数据，按 X 排序
    const combined = [...extractedData, ...newPoints]
    combined.sort((a, b) => a.x - b.x)

    setExtractedData(combined)
    saveHistory(combined, `手动添加 ${newPoints.length} 个点`)
    const densityText = pointDensity === 'low' ? '稀疏' : pointDensity === 'high' ? '密集' : '中等'
    const pointTypeText = newPoints.length === 1 ? '单点' : '路径点'
    setMessage(`已添加 ${newPoints.length} 个手动绘制的${pointTypeText}（${densityText}模式${newPoints.length > 1 ? `，平滑度 ${Math.round(smoothness * 100)}%` : ''}），总计 ${combined.length} 个`)
  }

  // 切换手动绘制模式
  const handleToggleManualDrawMode = () => {
    setIsManualDrawMode(!isManualDrawMode)
    setMessage(isManualDrawMode ? '已退出手动绘制模式' : '已进入手动绘制模式，单击添加单点，长按拖动绘制路径')
  }

  // ========== 图层编辑相关函数 ==========

  // 切换图层编辑模式
  const handleToggleLayerEditor = () => {
    setUseLayerEditor(!useLayerEditor)
    setMessage(useLayerEditor ? '已切换到传统模式' : '已切换到图层编辑模式')
  }

  // 图层选择回调
  const handleLayerSelect = (layer) => {
    setSelectedLayer(layer)
    setMessage(`已选择图层: ${layer.name}`)
  }

  // 从图层提取数据回调
  const handleExtractFromLayer = (data, layer) => {
    setExtractedData(data)
    saveHistory(data, `从图层 "${layer.name}" 提取数据`)
    setRepairedData([])
    setMessage(`成功从图层 "${layer.name}" 提取 ${data.length} 个数据点`)
    setShowPreview(true)
  }

  // 处理区域选择（用于AI处理）
  const handleSelectRegion = (selectedPoints, bounds) => {
    setSelectedRegion({
      points: selectedPoints,
      bounds: bounds,
      count: selectedPoints.length
    })
    setMessage(`已选中 ${selectedPoints.length} 个数据点，可以进行AI处理`)
  }

  // AI 数据清洗（支持区域选择）
  const handleAICleanData = async () => {
    if (!sessionId || extractedData.length === 0) {
      setMessage('请先提取数据')
      return
    }

    if (!sampledColor) {
      setMessage('请先采样颜色')
      return
    }

    // 确定要处理的数据点
    const pointsToProcess = selectedRegion ? selectedRegion.points : extractedData
    const processingMessage = selectedRegion
      ? `AI 正在清洗选中的 ${selectedRegion.count} 个数据点...`
      : 'AI 正在分析图像并清洗全部数据...'

    setIsLoading(true)
    setMessage(processingMessage)

    try {
      const response = await fetch(`${API_BASE}/ai/clean-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          extracted_points: pointsToProcess,
          sampled_color: {
            h: sampledColor[0],
            s: sampledColor[1],
            v: sampledColor[2]
          },
          calibration_info: calibrationPoints.xStart ? {
            x_min: calibrationPoints.xStart.value,
            x_max: calibrationPoints.xEnd.value,
            y_min: calibrationPoints.yStart.value,
            y_max: calibrationPoints.yEnd.value
          } : null
        })
      })

      const data = await response.json()

      if (data.success) {
        const { original_points, cleaned_points, operations, analysis, statistics } = data.data

        // 如果是区域处理，需要合并结果
        if (selectedRegion) {
          // 创建清洗后点的映射
          const cleanedMap = new Map(cleaned_points.map(p => [`${p.x},${p.y}`, p]))

          // 合并：保留未选中的点，替换选中区域的点
          const mergedData = extractedData.map(point => {
            const isInRegion = selectedRegion.points.some(sp =>
              Math.abs(sp.x - point.x) < 1e-6 && Math.abs(sp.y - point.y) < 1e-6
            )
            if (isInRegion) {
              const key = `${point.x},${point.y}`
              return cleanedMap.get(key) || null  // 如果被删除则返回null
            }
            return point
          }).filter(p => p !== null)  // 移除被删除的点

          setRepairedData(mergedData)
        } else {
          // 全部处理
          setRepairedData(cleaned_points)
        }

        // 构建详细消息
        let detailMsg = selectedRegion
          ? `AI 清洗完成！处理了选中的 ${selectedRegion.count} 个点，建议删除 ${statistics.removed_count} 个噪声点`
          : `AI 清洗分析完成！建议删除 ${statistics.removed_count} 个噪声点 (${statistics.original_count} → ${statistics.cleaned_count})`

        // 显示质量评分
        if (analysis?.quality_score) {
          detailMsg += `\n数据质量评分: ${analysis.quality_score}/10`
        }

        // 显示检测到的噪声类型
        if (analysis?.noise_analysis?.detected_noise_types?.length > 0) {
          detailMsg += `\n检测到的噪声: ${analysis.noise_analysis.detected_noise_types.join(', ')}`
        }

        detailMsg += `\n\n请在数据预览中查看对比效果，确认后点击"应用修复数据"按钮`

        setMessage(detailMsg)
        setShowPreview(true)
      } else {
        setMessage(`AI 清洗失败: ${data.message}`)
      }
    } catch (error) {
      setMessage(`AI 清洗错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }


  // AI 平滑数据（支持区域选择）
  const handleAISmoothData = async () => {
    if (!extractedData || extractedData.length === 0) {
      setMessage('没有数据可以平滑')
      return
    }

    // 确定要处理的数据点
    const pointsToProcess = selectedRegion ? selectedRegion.points : extractedData
    const processingMessage = selectedRegion
      ? `AI 正在平滑选中的 ${selectedRegion.count} 个数据点...`
      : 'AI 正在分析并平滑曲线数据...'

    setIsLoading(true)
    setMessage(processingMessage)

    try {
      const response = await fetch(`${API_BASE}/ai/smooth-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          extracted_points: pointsToProcess,
          calibration_info: calibrationPoints.xStart ? {
            x_min: calibrationPoints.xStart.value,
            x_max: calibrationPoints.xEnd.value,
            y_min: calibrationPoints.yStart.value,
            y_max: calibrationPoints.yEnd.value
          } : null
        })
      })

      const data = await response.json()

      if (data.success) {
        const { original_points, smoothed_points, operations, analysis, method, statistics } = data.data

        // 如果是区域处理，需要合并结果
        if (selectedRegion) {
          // 创建平滑后点的映射（使用原坐标作为key）
          const smoothedMap = new Map()
          smoothed_points.forEach((p, idx) => {
            if (idx < original_points.length) {
              const orig = original_points[idx]
              smoothedMap.set(`${orig.x},${orig.y}`, p)
            }
          })

          // 合并：保留未选中的点，替换选中区域的点
          const mergedData = extractedData.map(point => {
            const isInRegion = selectedRegion.points.some(sp =>
              Math.abs(sp.x - point.x) < 1e-6 && Math.abs(sp.y - point.y) < 1e-6
            )
            if (isInRegion) {
              const key = `${point.x},${point.y}`
              return smoothedMap.get(key) || point
            }
            return point
          })

          setRepairedData(mergedData)
        } else {
          // 全部处理
          setRepairedData(smoothed_points)
        }

        // 构建详细消息
        let detailMsg = selectedRegion
          ? `AI 平滑完成！处理了选中的 ${selectedRegion.count} 个点，使用方法: ${method}`
          : `AI 平滑分析完成！使用方法: ${method}\n建议修改 ${statistics.modified_count} 个点 (${statistics.original_count} 点)`

        // 显示质量评估
        if (analysis?.quality_assessment) {
          const qa = analysis.quality_assessment
          detailMsg += `\n当前质量: ${qa.current_quality}/10 → 预期质量: ${qa.expected_quality}/10`
        }

        // 显示曲线分析
        if (analysis?.curve_analysis) {
          const ca = analysis.curve_analysis
          detailMsg += `\n曲线类型: ${ca.curve_type || '未知'}`
          detailMsg += `\n平滑度: ${ca.smoothness || '未知'}`
        }

        detailMsg += `\n\n请在数据预览中查看对比效果，确认后点击"应用修复数据"按钮`

        setMessage(detailMsg)
        setShowPreview(true)
      } else {
        setMessage(`AI 平滑失败: ${data.message}`)
      }
    } catch (error) {
      setMessage(`AI 平滑错误: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 标题栏 */}
      <header className="bg-blue-600 text-white py-4 shadow-lg">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">SciDataExtractor</h1>
            <p className="text-blue-100 mt-1">科学图表数据提取工具 - 支持图层编辑</p>
          </div>
          <div className="flex items-center gap-4">
            {/* 模式切换按钮 */}
            {uploadedImage && (
              <button
                onClick={handleToggleLayerEditor}
                className="px-4 py-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition font-medium"
              >
                {useLayerEditor ? '📐 传统模式' : '🎨 图层编辑模式'}
              </button>
            )}
            {/* AI 配置按钮 */}
            <AIConfigHeader
              aiAvailable={aiAvailable}
              onAIConfig={handleAIConfig}
              onCheckStatus={checkAIStatus}
            />
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="container mx-auto px-4 py-6">
        {/* 状态消息 */}
        {message && (
          <div className={`mb-4 p-4 rounded-lg whitespace-pre-line ${
            message.includes('失败') || message.includes('错误')
              ? 'bg-red-100 text-red-700 border border-red-200'
              : 'bg-green-100 text-green-700 border border-green-200'
          }`}>
            {message}
          </div>
        )}

        {/* 主布局 */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* 左侧：图像画布或图层编辑器 */}
          <div className="xl:col-span-2 bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              {useLayerEditor ? '图层编辑器' : '图像区域'}
            </h2>

            {useLayerEditor ? (
              /* 图层编辑模式 */
              <LayerEditor
                sessionId={sessionId}
                imageUrl={uploadedImage}
                calibrationPoints={calibrationPoints}
                onLayerSelect={handleLayerSelect}
                onExtractFromLayer={handleExtractFromLayer}
              />
            ) : (
              /* 传统模式 */
              <ImageCanvas
                image={uploadedImage}
                currentStep={currentStep}
                calibrationPoints={calibrationPoints}
                onCalibrationComplete={handleCalibrationComplete}
                onColorSample={handleColorSample}
                extractedData={extractedData}
                aiSuggestedValues={null}
                onDeletePoints={handleDeletePoints}
                onAddManualPoints={handleAddManualPoints}
                extractRegion={extractRegion}
                onSetExtractRegion={setExtractRegion}
                isManualDrawMode={isManualDrawMode}
                smoothness={smoothness}
                pointSpacing={pointSpacing}
                pointDensity={pointDensity}
              />
            )}
          </div>

          {/* 右侧：控制面板 */}
          <div className="space-y-6">
            {/* 控制面板 */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">控制面板</h2>
              <ControlPanel
                currentStep={currentStep}
                isLoading={isLoading}
                calibrationPoints={calibrationPoints}
                sampledColor={sampledColor}
                tolerance={tolerance}
                extractedData={extractedData}
                pointSpacing={pointSpacing}
                pointDensity={pointDensity}
                smoothness={smoothness}
                onImageUpload={handleImageUpload}
                onToleranceChange={setTolerance}
                onPointSpacingChange={setPointSpacing}
                onPointDensityChange={setPointDensity}
                onSmoothnessChange={setSmoothness}
                onToggleManualDrawMode={handleToggleManualDrawMode}
                isManualDrawMode={isManualDrawMode}
                onExtractData={handleExtractData}
                onExportExcel={handleExportExcel}
                onReset={handleReset}
                onResetCalibration={handleResetCalibration}
                onResetColor={handleResetColor}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < history.length - 1}
              />
            </div>
          </div>
        </div>

        {/* 数据预览面板 - 独立显示 */}
        {extractedData.length > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                数据预览
                <span className="text-sm font-normal text-gray-500">
                  ({extractedData.length} 个数据点)
                </span>
              </h2>
              <div className="flex items-center gap-2">
                {/* AI 数据清洗按钮 */}
                {aiAvailable && (
                  <button
                    onClick={handleAICleanData}
                    disabled={isLoading}
                    className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-400 transition text-sm flex items-center gap-1"
                    title="使用 AI 视觉技术分析图像，自动识别并移除噪声点"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    AI 清洗
                  </button>
                )}
                {/* AI 修复按钮 */}
                {aiAvailable && (
                  <button
                    onClick={handleAIRepairCurve}
                    disabled={isLoading}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition text-sm flex items-center gap-1"
                    title="使用 AI 分析曲线断点并自动修复"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    AI 修复
                  </button>
                )}
                {/* AI 平滑按钮 */}
                {aiAvailable && (
                  <button
                    onClick={handleAISmoothData}
                    disabled={isLoading}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 transition text-sm flex items-center gap-1"
                    title="使用 AI 分析曲线走势并平滑数据，修正手动绘制误差"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                    AI 平滑
                  </button>
                )}
                {repairedData.length > 0 && (
                  <button
                    onClick={handleApplyRepairedData}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm"
                  >
                    应用修复数据
                  </button>
                )}
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-sm"
                >
                  {showPreview ? '收起预览' : '展开预览'}
                </button>
              </div>
            </div>

            {showPreview && (
              <DataPreview
                extractedData={extractedData}
                repairedData={repairedData}
                calibrationPoints={calibrationPoints}
                onDeletePoints={handleDeletePoints}
                onSelectRegion={handleSelectRegion}
              />
            )}

            {/* 数据表格 */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-700">数据表格</h3>
                <span className="text-sm text-gray-500">
                  显示前 50 行
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">#</th>
                      <th className="px-4 py-2 text-left">X</th>
                      <th className="px-4 py-2 text-left">Y</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.slice(0, 50).map((point, index) => (
                      <tr key={index} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-500">{index + 1}</td>
                        <td className="px-4 py-2">{point.x.toFixed(6)}</td>
                        <td className="px-4 py-2">{point.y.toFixed(6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {extractedData.length > 50 && (
                  <p className="text-center text-gray-500 text-sm py-2 bg-gray-50">
                    ... 还有 {extractedData.length - 50} 行数据，导出 Excel 查看完整数据
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 页脚 */}
      <footer className="bg-gray-800 text-gray-300 py-4 mt-8">
        <div className="container mx-auto px-4 text-center">
          <p>SciDataExtractor</p>
        </div>
      </footer>
    </div>
  )
}

export default App
