import React, { useState, useEffect, useRef } from 'react';
import { API_ENDPOINTS } from '../config/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('training_token');
  if (!token) return undefined;
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

interface EvaluationResult {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  total_samples: number;
  correct_predictions: number;
  avg_response_time?: number;
  confusion_matrix?: number[][];
}

interface EvaluationResults {
  model?: EvaluationResult;
  lexicon?: EvaluationResult;
  external?: EvaluationResult;
  hybrid?: HybridEvaluationResult;
}

interface HybridEvaluationResult extends EvaluationResult {
  fast_path_ratio: number;
  lexicon_threshold: number;
  lexicon_score_threshold: number;
}

interface EvaluationStatus {
  running: boolean;
  progress: number;
  total: number;
  current_analyzer: string;
  error?: string;
  gpu_memory?: {
    current_mb: number;
    peak_mb: number;
  };
}

interface CachedEvaluationResult {
  completed_at: string;
  results: EvaluationResults;
  error_samples: {
    model: Array<{ text: string; true_label: string; pred_label: string; confidence?: number }>;
    lexicon: Array<{ text: string; true_label: string; pred_label: string; score?: number }>;
    external: Array<{ text: string; true_label: string; pred_label: string }>;
    hybrid: Array<{ text: string; true_label: string; pred_label: string; score?: number; method?: string }>;
  };
  gpu_memory_peak_mb: number;
  data_info: { total: number };
}

interface EvaluationDataInfo {
  total: number;
  label_distribution: Record<string, number>;
}

const EvaluationTab: React.FC = () => {
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus>({
    running: false,
    progress: 0,
    total: 0,
    current_analyzer: ''
  });
  const [evaluationResults, setEvaluationResults] = useState<EvaluationResults | null>(null);
  const [evaluationDataInfo, setEvaluationDataInfo] = useState<EvaluationDataInfo | null>(null);
  const [cachedEvaluationResult, setCachedEvaluationResult] = useState<CachedEvaluationResult | null>(null);
  const [evaluationChartImage, setEvaluationChartImage] = useState<string>('');
  const [exportingEvaluation, setExportingEvaluation] = useState(false);
  const [errorSamples, setErrorSamples] = useState<{
    model: Array<{ text: string; true_label: string; pred_label: string; confidence?: number }>;
    lexicon: Array<{ text: string; true_label: string; pred_label: string; score?: number }>;
    external: Array<{ text: string; true_label: string; pred_label: string }>;
    hybrid: Array<{ text: string; true_label: string; pred_label: string; score?: number; method?: string }>;
  }>({ model: [], lexicon: [], external: [], hybrid: [] });
  const [selectedErrorAnalyzer, setSelectedErrorAnalyzer] = useState<'model' | 'lexicon' | 'hybrid'>('model');
  
  // 混合评估相关状态
  const [showHybridModal, setShowHybridModal] = useState(false);
  const [hybridThresholds, setHybridThresholds] = useState({
    lexicon_threshold: 0.75,
    lexicon_score_threshold: 3.0
  });
  
  const evaluationPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载缓存的评估结果
  const loadCachedEvaluationResult = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.evaluation}/cached-result`);
      if (response.ok) {
        const data = await response.json();
        console.log('加载评估缓存:', data);
        if (data.success && data.cached_result) {
          setCachedEvaluationResult(data.cached_result);
          if (data.cached_result.results) {
            setEvaluationResults(data.cached_result.results);
          }
          if (data.cached_result.error_samples) {
            setErrorSamples({
              model: data.cached_result.error_samples.model || [],
              lexicon: data.cached_result.error_samples.lexicon || [],
              external: data.cached_result.error_samples.external || [],
              hybrid: data.cached_result.error_samples.hybrid || []
            });
          }
        }
      }
    } catch (error) {
      console.error('加载评估缓存失败:', error);
    }
  };

  // 页面加载时获取缓存
  useEffect(() => {
    loadCachedEvaluationResult();
    return () => {
      if (evaluationPollingRef.current) {
        clearInterval(evaluationPollingRef.current);
      }
    };
  }, []);

  // 处理文件上传
  const handleEvaluationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_ENDPOINTS.evaluation}/upload`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        setEvaluationDataInfo({
          total: data.total,
          label_distribution: data.label_distribution
        });
        alert(`成功上传 ${data.total} 条测试数据`);
      } else {
        const error = await response.json();
        alert(error.detail || '上传失败');
      }
    } catch (error) {
      console.error('上传失败:', error);
      alert('上传失败，请重试');
    }
  };

  // 开始评估
  const startEvaluation = async (includeExternal: boolean = false) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.evaluation}/run?include_external=${includeExternal}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        setEvaluationStatus({
          running: true,
          progress: 0,
          total: 0,
          current_analyzer: ''
        });
        setEvaluationResults(null);
        setEvaluationChartImage('');
        
        // 开始轮询状态
        evaluationPollingRef.current = setInterval(async () => {
          try {
            const statusResponse = await fetch(`${API_ENDPOINTS.evaluation}/status`);
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              setEvaluationStatus({
                running: statusData.running,
                progress: statusData.progress || 0,
                total: statusData.total || 0,
                current_analyzer: statusData.current_analyzer || '',
                gpu_memory: statusData.gpu_memory
              });
              
              if (!statusData.running) {
                if (evaluationPollingRef.current) {
                  clearInterval(evaluationPollingRef.current);
                }
                // 评估完成，获取结果
                const resultsResponse = await fetch(`${API_ENDPOINTS.evaluation}/results`);
                if (resultsResponse.ok) {
                  const resultsData = await resultsResponse.json();
                  if (resultsData.success) {
                    setEvaluationResults({
                      model: resultsData.model,
                      lexicon: resultsData.lexicon,
                      external: resultsData.external,
                      hybrid: resultsData.hybrid
                    });
                    // 重新加载缓存
                    loadCachedEvaluationResult();
                  }
                }
              }
            }
          } catch (error) {
            console.error('获取评估状态失败:', error);
          }
        }, 1000);
      } else {
        const error = await response.json();
        alert(error.detail || '启动评估失败');
      }
    } catch (error) {
      console.error('启动评估失败:', error);
      alert('启动评估失败，请重试');
    }
  };

  // 开始混合评估
  const startHybridEvaluation = async () => {
    try {
      // 先配置混合分析器参数
      const configResponse = await fetch(`${API_ENDPOINTS.evaluation}/hybrid/config`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(hybridThresholds)
      });
      
      if (!configResponse.ok) {
        throw new Error('配置混合分析器失败');
      }
      
      // 然后启动评估（使用普通的 run 端点，会自动包含混合模型）
      const response = await fetch(`${API_ENDPOINTS.evaluation}/run`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setEvaluationStatus({
            running: true,
            progress: 0,
            total: data.total || 0,
            current_analyzer: 'hybrid'
          });
          setEvaluationResults(null);
          setEvaluationChartImage('');
          setShowHybridModal(false);
          
          // 开始轮询状态
          evaluationPollingRef.current = setInterval(async () => {
            try {
              const statusResponse = await fetch(`${API_ENDPOINTS.evaluation}/status`);
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                setEvaluationStatus({
                  running: statusData.running,
                  progress: statusData.progress || 0,
                  total: statusData.total || 0,
                  current_analyzer: statusData.current_analyzer || '',
                  gpu_memory: statusData.gpu_memory
                });
                
                if (!statusData.running) {
                  if (evaluationPollingRef.current) {
                    clearInterval(evaluationPollingRef.current);
                  }
                  // 评估完成，获取结果
                  const resultsResponse = await fetch(`${API_ENDPOINTS.evaluation}/results`);
                  if (resultsResponse.ok) {
                    const resultsData = await resultsResponse.json();
                    if (resultsData.success) {
                      setEvaluationResults({
                        model: resultsData.model,
                        lexicon: resultsData.lexicon,
                        external: resultsData.external,
                        hybrid: resultsData.hybrid
                      });
                      // 重新加载缓存
                      loadCachedEvaluationResult();
                    } else {
                      // 显示错误信息
                      alert('评估完成但获取结果失败：' + (resultsData.message || '未知错误'));
                      console.error('评估结果错误:', resultsData);
                    }
                  }
                }
              }
            } catch (error) {
              console.error('获取评估状态失败:', error);
            }
          }, 1000);
        } else {
          // 启动失败，显示错误信息
          alert('启动评估失败：' + (data.message || '未知错误'));
          console.error('启动评估失败:', data);
        }
      } else {
        const error = await response.json();
        alert('启动评估失败：' + (error.message || error.detail || '未知错误'));
      }
    } catch (error) {
      console.error('启动混合评估失败:', error);
      alert('启动混合评估失败，请重试');
    }
  };

  // 导出评估结果为CSV
  const exportEvaluationCSV = async () => {
    if (!evaluationResults) {
      alert('暂无评估结果可导出');
      return;
    }
    
    setExportingEvaluation(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.evaluation}/export?format=csv`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const blob = new Blob(['\ufeff' + data.content], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = data.filename;
          link.click();
          alert('CSV导出成功');
        }
      } else {
        const error = await response.json();
        alert('导出失败: ' + (error.detail || '未知错误'));
      }
    } catch (error) {
      console.error('导出CSV失败:', error);
      alert('导出失败，请重试');
    }
    setExportingEvaluation(false);
  };

  // 生成评估对比图表
  const generateEvaluationCharts = async () => {
    if (!evaluationResults) {
      alert('暂无评估结果可生成图表');
      return;
    }
    
    setExportingEvaluation(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.evaluation}/charts`, {
        method: 'POST'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setEvaluationChartImage(`data:image/png;base64,${data.png_base64}`);
        }
      } else {
        const error = await response.json();
        alert('生成图表失败: ' + (error.detail || '未知错误'));
      }
    } catch (error) {
      console.error('生成图表失败:', error);
      alert('生成图表失败，请重试');
    }
    setExportingEvaluation(false);
  };

  // 导出评估图表
  const exportEvaluationChart = () => {
    if (!evaluationChartImage) {
      alert('请先生成图表');
      return;
    }
    
    const link = document.createElement('a');
    link.href = evaluationChartImage;
    link.download = `三通道对比实验图表_${new Date().toLocaleDateString()}.png`;
    link.click();
    alert('图表已下载');
  };

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-gray-900 mb-2">模型评估</h3>
      <p className="text-gray-500 text-sm mb-6">上传测试数据集，评估各分析器的准确率、精确率、召回率、F1分数等指标。</p>
      
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-100 mb-6">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-1">数据格式要求</h4>
            <p className="text-gray-600 text-sm mb-2">
              Excel 文件，必须包含"文本"和"标签"两列，标签值为：正面、负面、中性
            </p>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-2 px-3 text-left font-medium text-gray-700">列名</th>
                  <th className="py-2 px-3 text-left font-medium text-gray-700">说明</th>
                  <th className="py-2 px-3 text-left font-medium text-gray-700">示例</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-200">
                  <td className="py-2 px-3 font-medium text-gray-900">文本</td>
                  <td className="py-2 px-3 text-gray-600">待分析的文本内容</td>
                  <td className="py-2 px-3 text-gray-500">质量很好，物流很快</td>
                </tr>
                <tr className="border-t border-gray-200">
                  <td className="py-2 px-3 font-medium text-gray-900">标签</td>
                  <td className="py-2 px-3 text-gray-600">真实情感标签</td>
                  <td className="py-2 px-3 text-gray-500">正面</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">1. 上传测试数据</h4>
          <label className="block">
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all duration-300">
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600 font-medium">点击上传测试数据集</p>
              <p className="text-gray-400 text-sm mt-1">支持 .xlsx, .xls 格式</p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleEvaluationUpload}
              className="hidden"
            />
          </label>
          {evaluationDataInfo && (
            <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200">
              <p className="text-green-700 font-medium">已上传 {evaluationDataInfo.total} 条测试数据</p>
              <div className="flex gap-4 mt-2 text-sm text-green-600">
                <span>正面: {evaluationDataInfo.label_distribution['正面'] || 0}</span>
                <span>负面: {evaluationDataInfo.label_distribution['负面'] || 0}</span>
                <span>中性: {evaluationDataInfo.label_distribution['中性'] || 0}</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">2. 开始评估</h4>
          {evaluationStatus.running ? (
            <div className="space-y-4">
              <div className="bg-purple-50 rounded-xl p-4">
                <p className="text-purple-700 font-medium mb-2">
                  正在评估: {evaluationStatus.current_analyzer === 'model' ? '深度学习模型' : 
                            evaluationStatus.current_analyzer === 'lexicon' ? '情感词典' : 
                            evaluationStatus.current_analyzer === 'external' ? '外部API' : ''}
                </p>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-pink-400 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${(evaluationStatus.progress / evaluationStatus.total) * 100}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  进度: {evaluationStatus.progress} / {evaluationStatus.total}
                </p>
                {evaluationStatus.gpu_memory && (
                  <div className="mt-3 p-2 bg-white rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                      <span className="text-gray-600">GPU显存: <span className="font-semibold text-purple-600">{evaluationStatus.gpu_memory.current_mb.toFixed(0)} MB</span> (峰值: <span className="font-semibold">{evaluationStatus.gpu_memory.peak_mb.toFixed(0)} MB</span>)</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => startEvaluation(false)}
                disabled={!evaluationDataInfo}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-600 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                本地评估（本地模型 + 情感词典）
              </button>
              <button
                onClick={() => startEvaluation(true)}
                disabled={!evaluationDataInfo}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                全部评估（包含外部 API，会很久哦）
              </button>
              <button
                onClick={() => setShowHybridModal(true)}
                disabled={!evaluationDataInfo}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-500 hover:from-purple-700 hover:to-indigo-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                混合评估（可调整阈值）
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 评估结果操作按钮 - 放在框外 */}
      {evaluationResults && (
        <div className="flex flex-wrap gap-4 mb-4">
          <button
            onClick={exportEvaluationCSV}
            disabled={exportingEvaluation}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            导出CSV
          </button>
          <button
            onClick={generateEvaluationCharts}
            disabled={exportingEvaluation}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            生成图表
          </button>
          <button
            onClick={exportEvaluationChart}
            disabled={!evaluationChartImage}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            导出图表
          </button>
        </div>
      )}

      {evaluationResults && (
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-900">评估结果</h4>
            <div className="flex items-center gap-3">
              {cachedEvaluationResult && (
                <span className="text-sm text-gray-500">
                  上次测试: {new Date(cachedEvaluationResult.completed_at).toLocaleString('zh-CN')}
                </span>
              )}
              <button
                onClick={async () => {
                  try {
                    await fetch(`${API_ENDPOINTS.evaluation}/clear-cache`, { method: 'POST' });
                    setCachedEvaluationResult(null);
                    setEvaluationChartImage('');
                    setEvaluationResults(null);
                  } catch (error) {
                    console.error('清除缓存失败:', error);
                  }
                }}
                className="text-sm text-red-500 hover:text-red-700 underline"
              >
                清除缓存
              </button>
            </div>
          </div>
          
          {evaluationChartImage && (
            <div className="mb-6 bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h5 className="text-sm font-semibold text-gray-700 mb-3">可视化图表</h5>
              <img 
                src={evaluationChartImage} 
                alt="三通道对比实验图表" 
                className="w-full max-w-4xl mx-auto rounded-lg shadow-md"
              />
            </div>
          )}

          {cachedEvaluationResult && cachedEvaluationResult.gpu_memory_peak_mb > 0 && (
            <div className="mb-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <span className="text-sm text-gray-600">评估显存峰值: <span className="font-semibold text-green-600">{cachedEvaluationResult.gpu_memory_peak_mb.toFixed(0)} MB</span></span>
              </div>
            </div>
          )}

          {/* 结果卡片 */}
          <div className="grid md:grid-cols-3 gap-4">
            {evaluationResults.model && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                  深度学习模型
                </h5>
                <div className="space-y-2">
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">准确率</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.model.accuracy * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">精确率</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.model.precision * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">召回率</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.model.recall * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">F1分数</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.model.f1_score * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 flex items-center gap-1 relative group">
                      平均响应时间
                      <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="absolute left-0 top-6 w-56 p-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                        基于批量评估测试统计的平均处理时间，可能与实际使用场景有差异
                      </div>
                    </span>
                    <span className="text-lg font-bold text-blue-600">{evaluationResults.model.avg_response_time?.toFixed(1) || '-'}ms</span>
                  </div>
                  <div className="pt-2 border-t border-blue-200 mt-2">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>样本数: {evaluationResults.model.total_samples}</span>
                      <span>正确: {evaluationResults.model.correct_predictions}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {evaluationResults.lexicon && (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200">
                <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                  情感词典
                </h5>
                <div className="space-y-2">
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">准确率</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.lexicon.accuracy * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">精确率</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.lexicon.precision * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">召回率</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.lexicon.recall * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">F1分数</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.lexicon.f1_score * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 flex items-center gap-1 relative group">
                      平均响应时间
                      <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="absolute left-0 top-6 w-56 p-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                        基于批量评估测试统计的平均处理时间，可能与实际使用场景有差异
                      </div>
                    </span>
                    <span className="text-lg font-bold text-purple-600">{evaluationResults.lexicon.avg_response_time?.toFixed(1) || '-'}ms</span>
                  </div>
                  <div className="pt-2 border-t border-purple-200 mt-2">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>样本数: {evaluationResults.lexicon.total_samples}</span>
                      <span>正确: {evaluationResults.lexicon.correct_predictions}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {evaluationResults.external && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                  外部API
                </h5>
                <div className="space-y-2">
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">准确率</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.external.accuracy * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">精确率</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.external.precision * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">召回率</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.external.recall * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">F1分数</span><span className="text-lg font-bold text-gray-900">{(evaluationResults.external.f1_score * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 flex items-center gap-1 relative group">
                      平均响应时间
                      <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="absolute left-0 top-6 w-56 p-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                        基于批量评估测试统计的平均处理时间，可能与实际使用场景有差异
                      </div>
                    </span>
                    <span className="text-lg font-bold text-green-600">{evaluationResults.external.avg_response_time?.toFixed(1) || '-'}ms</span>
                  </div>
                  <div className="pt-2 border-t border-green-200 mt-2">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>样本数: {evaluationResults.external.total_samples}</span>
                      <span>正确: {evaluationResults.external.correct_predictions}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 混合评估结果卡片 */}
          {evaluationResults.hybrid && (
            <div className="mt-6 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border-2 border-purple-300">
              <h5 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 text-lg">
                <span className="w-4 h-4 bg-purple-600 rounded-full"></span>
                混合模型评估结果（词典 + 深度学习）
              </h5>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="text-sm text-gray-600 mb-1">准确率</div>
                  <div className="text-2xl font-bold text-purple-600">{(evaluationResults.hybrid.accuracy * 100).toFixed(1)}%</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="text-sm text-gray-600 mb-1">精确率</div>
                  <div className="text-2xl font-bold text-purple-600">{(evaluationResults.hybrid.precision * 100).toFixed(1)}%</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="text-sm text-gray-600 mb-1">召回率</div>
                  <div className="text-2xl font-bold text-purple-600">{(evaluationResults.hybrid.recall * 100).toFixed(1)}%</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="text-sm text-gray-600 mb-1">F1 分数</div>
                  <div className="text-2xl font-bold text-purple-600">{(evaluationResults.hybrid.f1_score * 100).toFixed(1)}%</div>
                </div>
              </div>
              <div className="mt-4 grid md:grid-cols-4 gap-4">
                <div className="bg-purple-100 rounded-lg p-3 border border-purple-300">
                  <div className="text-xs text-purple-700 mb-1">快速路径比例</div>
                  <div className="text-lg font-bold text-purple-900">{(evaluationResults.hybrid.fast_path_ratio * 100).toFixed(1)}%</div>
                  <div className="text-xs text-purple-600 mt-1">使用词典直接判断的样本比例</div>
                </div>
                <div className="bg-purple-100 rounded-lg p-3 border border-purple-300">
                  <div className="text-xs text-purple-700 mb-1">平均响应时间</div>
                  <div className="text-lg font-bold text-purple-900">{evaluationResults.hybrid.avg_response_time?.toFixed(2) || '0.00'} ms</div>
                  <div className="text-xs text-purple-600 mt-1">avg_response_time</div>
                </div>
                <div className="bg-purple-100 rounded-lg p-3 border border-purple-300">
                  <div className="text-xs text-purple-700 mb-1">词典阈值</div>
                  <div className="text-lg font-bold text-purple-900">{evaluationResults.hybrid.lexicon_threshold.toFixed(2)}</div>
                  <div className="text-xs text-purple-600 mt-1">lexicon_threshold</div>
                </div>
                <div className="bg-purple-100 rounded-lg p-3 border border-purple-300">
                  <div className="text-xs text-purple-700 mb-1">分数阈值</div>
                  <div className="text-lg font-bold text-purple-900">{evaluationResults.hybrid.lexicon_score_threshold.toFixed(1)}</div>
                  <div className="text-xs text-purple-600 mt-1">lexicon_score_threshold</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-purple-200">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>样本总数：{evaluationResults.hybrid.total_samples}</span>
                  <span>正确预测：{evaluationResults.hybrid.correct_predictions}</span>
                </div>
              </div>
            </div>
          )}

          {/* 错误样本分析 */}
          {(errorSamples.model.length > 0 || errorSamples.lexicon.length > 0 || errorSamples.hybrid?.length > 0) && (
            <div className="mt-6">
              <h5 className="font-semibold text-gray-900 mb-3">错误样本分析</h5>
              <div className="flex gap-2 mb-3 flex-wrap">
                {errorSamples.model.length > 0 && (
                  <button
                    onClick={() => setSelectedErrorAnalyzer('model')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedErrorAnalyzer === 'model'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    深度学习模型 ({errorSamples.model.length})
                  </button>
                )}
                {errorSamples.lexicon.length > 0 && (
                  <button
                    onClick={() => setSelectedErrorAnalyzer('lexicon')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedErrorAnalyzer === 'lexicon'
                        ? 'bg-purple-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    情感词典 ({errorSamples.lexicon.length})
                  </button>
                )}
                {errorSamples.hybrid?.length > 0 && (
                  <button
                    onClick={() => setSelectedErrorAnalyzer('hybrid')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedErrorAnalyzer === 'hybrid'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    混合模型 ({errorSamples.hybrid.length})
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium text-gray-700">文本</th>
                      <th className="py-2 px-3 text-left font-medium text-gray-700">真实标签</th>
                      <th className="py-2 px-3 text-left font-medium text-gray-700">预测标签</th>
                      <th className="py-2 px-3 text-left font-medium text-gray-700">置信度/分数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorSamples[selectedErrorAnalyzer].slice(0, 20).map((sample, index) => (
                      <tr key={index} className="border-t border-gray-200">
                        <td className="py-2 px-3 text-gray-900 max-w-xs truncate">{sample.text}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            sample.true_label === '正面' ? 'bg-green-100 text-green-700' :
                            sample.true_label === '负面' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {sample.true_label}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            sample.pred_label === '正面' ? 'bg-green-100 text-green-700' :
                            sample.pred_label === '负面' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {sample.pred_label}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-600">
                          {'confidence' in sample ? `${(sample.confidence! * 100).toFixed(1)}%` : 
                           'score' in sample ? sample.score!.toFixed(2) : 
                           'method' in sample ? `${sample.method || '-'}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {errorSamples[selectedErrorAnalyzer].length > 20 && (
                  <p className="text-center text-gray-500 text-sm py-2">
                    还有 {errorSamples[selectedErrorAnalyzer].length - 20} 条错误样本...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 混合评估配置面板 - 内嵌式 */}
      {showHybridModal && (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-200 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              混合评估配置
            </h3>
            <button
              onClick={() => setShowHybridModal(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
            
            <div className="space-y-6">
              {/* 配置说明 */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-200">
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  混合模型说明
                </h4>
                <p className="text-sm text-gray-700 leading-relaxed">
                  混合模型结合了<strong className="text-purple-600">情感词典</strong>和<strong className="text-purple-600">深度学习模型</strong>的优势：
                </p>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 mt-1">•</span>
                    <span>当词典评分超过阈值时，直接使用词典结果（<strong className="text-purple-600">快速路径</strong>）</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 mt-1">•</span>
                    <span>否则使用深度学习模型进行预测（<strong className="text-purple-600">精确路径</strong>）</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 mt-1">•</span>
                    <span>在保证准确率的同时，显著提升整体处理速度</span>
                  </li>
                </ul>
              </div>
              
              {/* 当前配置 */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <h4 className="font-semibold text-gray-900 mb-3">当前阈值配置</h4>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-gray-600 mb-1">词典置信度阈值</div>
                    <div className="text-2xl font-bold text-purple-600">{hybridThresholds.lexicon_threshold.toFixed(2)}</div>
                    <div className="text-xs text-gray-500 mt-1">lexicon_threshold</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-gray-600 mb-1">词典分数阈值</div>
                    <div className="text-2xl font-bold text-purple-600">{hybridThresholds.lexicon_score_threshold.toFixed(1)}</div>
                    <div className="text-xs text-gray-500 mt-1">lexicon_score_threshold</div>
                  </div>
                </div>
              </div>
              
              {/* 阈值滑块 */}
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-gray-700">
                      词典置信度阈值 (lexicon_threshold)
                    </label>
                    <span className="text-lg font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-lg">
                      {hybridThresholds.lexicon_threshold.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="0.95"
                    step="0.05"
                    value={hybridThresholds.lexicon_threshold}
                    onChange={(e) => setHybridThresholds({
                      ...hybridThresholds,
                      lexicon_threshold: parseFloat(e.target.value)
                    })}
                    className="w-full h-3 bg-gradient-to-r from-purple-200 to-purple-400 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0.50 (宽松)</span>
                    <span>0.95 (严格)</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2 bg-purple-50 p-2 rounded">
                    💡 提示：值越小，越多使用词典快速判断；值越大，越多使用深度学习模型
                  </p>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-gray-700">
                      词典分数阈值 (lexicon_score_threshold)
                    </label>
                    <span className="text-lg font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-lg">
                      {hybridThresholds.lexicon_score_threshold.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="5.0"
                    step="0.5"
                    value={hybridThresholds.lexicon_score_threshold}
                    onChange={(e) => setHybridThresholds({
                      ...hybridThresholds,
                      lexicon_score_threshold: parseFloat(e.target.value)
                    })}
                    className="w-full h-3 bg-gradient-to-r from-indigo-200 to-indigo-400 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>1.0 (低敏感)</span>
                    <span>5.0 (高敏感)</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2 bg-indigo-50 p-2 rounded">
                    💡 提示：值越小，越容易触发情感判断；值越大，需要更强的情感信号
                  </p>
                </div>
              </div>
              
              {/* 推荐配置 */}
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  推荐配置
                </h4>
                <div className="text-sm text-amber-800">
                  <div className="flex justify-between items-center py-2 border-b border-amber-200">
                    <span>默认推荐：</span>
                    <span className="font-semibold">lexicon_threshold = 0.75, lexicon_score_threshold = 3.0</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-amber-200">
                    <span>追求速度：</span>
                    <span className="font-semibold">lexicon_threshold = 0.60, lexicon_score_threshold = 2.5</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span>追求准确率：</span>
                    <span className="font-semibold">lexicon_threshold = 0.85, lexicon_score_threshold = 3.5</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 操作按钮 */}
            <div className="flex gap-3 mt-8 pt-6 border-t border-purple-200">
              <button
                onClick={() => setHybridThresholds({ lexicon_threshold: 0.75, lexicon_score_threshold: 3.0 })}
                className="flex-1 px-6 py-3 bg-white hover:bg-purple-50 text-gray-700 font-semibold rounded-xl transition-all duration-300 border border-purple-200"
              >
                重置为默认值
              </button>
              <button
                onClick={() => setShowHybridModal(false)}
                className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all duration-300"
              >
                取消
              </button>
              <button
                onClick={startHybridEvaluation}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                开始混合评估
              </button>
            </div>
          </div>
        )}
    </div>
  );
};

export default EvaluationTab;
