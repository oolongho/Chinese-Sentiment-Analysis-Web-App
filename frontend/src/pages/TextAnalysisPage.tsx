import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config/api';
import { apiClient } from '../utils/api';

interface AnalysisResult {
  text: string;
  modelType: 'hybrid' | 'batch';
  hybridStats?: {
    fastPathRatio: number;
    totalSamples: number;
    fastPathSamples: number;
  };
  models: {
    deepLearning: {
      sentiment: string;
      confidence: number;
      analysisTime: number;
      scores: { [key: string]: number };
      cpuPeak: number;
      cpuAvg: number;
      gpuPeak: number | null;
      gpuAvg: number | null;
    };
    lexicon: {
      sentiment: string;
      confidence: number;
      analysisTime: number;
      score: number;
      sentimentWords: any[];
      cpuPeak: number;
      cpuAvg: number;
      gpuPeak: number | null;
      gpuAvg: number | null;
    };
    external: {
      success: boolean;
      sentiment: string;
      confidence: number;
      reasoning: string;
      model: string;
      analysisTime: number;
      error: string;
    } | null;
  };
}

const TextAnalysisPage: React.FC = () => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultsList, setResultsList] = useState<AnalysisResult[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState('');
  const [textApiEnabled, setTextApiEnabled] = useState(false);
  const [cachedResult, setCachedResult] = useState<any>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [useHybridMode, setUseHybridMode] = useState(() => {
    const saved = localStorage.getItem('useHybridMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    checkExternalApi();
    loadCachedResult();
  }, []);

  useEffect(() => {
    localStorage.setItem('useHybridMode', JSON.stringify(useHybridMode));
  }, [useHybridMode]);

  const loadCachedResult = async () => {
    const result = await apiClient.get(`${API_ENDPOINTS.text}/cached-result`, { showErrorMessage: false });
    if (result.success && result.data?.cached_result) {
      setCachedResult(result.data.cached_result);
    }
  };

  const loadFromCache = () => {
    if (cachedResult) {
      setText(cachedResult.input_text || '');
      if (cachedResult.results && cachedResult.results.length > 0) {
        const results: AnalysisResult[] = cachedResult.results.map((item: any) => ({
          text: item.text,
          models: {
            deepLearning: {
              sentiment: item.model_result.sentiment === '正面' ? 'positive' : 
                         item.model_result.sentiment === '负面' ? 'negative' : 'neutral',
              confidence: item.model_result.confidence,
              analysisTime: item.model_result.processing_time,
              scores: item.model_result.scores,
              cpuPeak: item.model_result.cpu_peak || 0,
              cpuAvg: item.model_result.cpu_avg || 0,
              gpuPeak: item.model_result.gpu_peak,
              gpuAvg: item.model_result.gpu_avg
            },
            lexicon: {
              sentiment: item.lexicon_result.sentiment === '正面' ? 'positive' : 
                         item.lexicon_result.sentiment === '负面' ? 'negative' : 'neutral',
              confidence: item.lexicon_result.confidence,
              analysisTime: item.lexicon_result.processing_time,
              score: item.lexicon_result.score,
              sentimentWords: item.lexicon_result.sentiment_words || [],
              cpuPeak: item.lexicon_result.cpu_peak || 0,
              cpuAvg: item.lexicon_result.cpu_avg || 0,
              gpuPeak: item.lexicon_result.gpu_peak,
              gpuAvg: item.lexicon_result.gpu_avg
            },
            external: null
          }
        }));
        setResultsList(results);
        setCurrentPage(0);
        setIsFromCache(true);
      }
    }
  };

  const clearCache = async () => {
    await apiClient.post(`${API_ENDPOINTS.text}/clear-cache`, undefined, { showErrorMessage: false });
    setCachedResult(null);
  };

  const checkExternalApi = async () => {
    const result = await apiClient.get(`${API_ENDPOINTS.training}/external-api/status`, { showErrorMessage: false });
    if (result.success && result.data) {
      setTextApiEnabled(result.data.text_enabled || false);
    }
  };

  const textLines = text.split('\n').filter(line => line.trim().length > 0);
  const lineCount = textLines.length;

  const handleAnalyze = async () => {
    if (lineCount === 0) return;

    setLoading(true);
    setError('');
    setResultsList([]);
    setCurrentPage(0);
    setIsFromCache(false);
    
    let localData;
    let externalResults: any[] = [];
    let analysisError: string | null = null;
    
    if (textApiEnabled) {
      const externalResult = await apiClient.post(`${API_ENDPOINTS.text}/analyze/external/batch`, { texts: textLines }, { showErrorMessage: false });
      if (externalResult.success && externalResult.data) {
        externalResults = externalResult.data.results;
      }
    }
    
    if (useHybridMode) {
      const hybridResults: any[] = [];
      for (const text of textLines) {
        const result = await apiClient.post(`${API_ENDPOINTS.text}/analyze/hybrid`, { text }, { showErrorMessage: false });
        if (!result.success) {
          analysisError = `混合分析请求失败: ${result.detail || '未知错误'}`;
          break;
        }
        hybridResults.push(result.data);
      }
      
      if (!analysisError) {
        localData = {
          results: hybridResults,
          hybrid_stats: hybridResults[0]?.hybrid_stats || null
        };
      }
    } else {
      const result = await apiClient.post(`${API_ENDPOINTS.text}/analyze/batch`, { texts: textLines }, { showErrorMessage: false });
      if (!result.success) {
        analysisError = result.detail || '分析请求失败';
      } else {
        localData = result.data;
      }
    }
    
    if (analysisError) {
      setError(analysisError);
      setLoading(false);
      return;
    }
      
      const results: AnalysisResult[] = localData.results.map((item: any, index: number) => {
        const externalResult = externalResults[index] || null;
        
        if (useHybridMode) {
          const robertaSentiment = item.roberta_result?.sentiment || item.sentiment;
          const robertaConfidence = item.roberta_result?.confidence ?? item.confidence;
          const lexiconSentiment = item.lexicon_result?.sentiment || item.sentiment;
          const lexiconConfidence = item.lexicon_result?.confidence ?? item.confidence;

          const mapSentiment = (s: string) => 
            s === '正面' ? 'positive' : s === '负面' ? 'negative' : 'neutral';

          return {
            text: textLines[index],
            modelType: 'hybrid',
            hybridStats: localData.hybrid_stats ? {
              fastPathRatio: localData.hybrid_stats.fast_path_ratio || 0,
              totalSamples: localData.hybrid_stats.total_predictions || 0,
              fastPathSamples: localData.hybrid_stats.cascade_fast_path || 0
            } : undefined,
            models: {
              deepLearning: {
                sentiment: mapSentiment(robertaSentiment),
                confidence: robertaConfidence,
                analysisTime: (item.inference_time_ms || 0) / 1000,
                scores: item.roberta_result?.scores || item.scores || {},
                cpuPeak: 0,
                cpuAvg: 0,
                gpuPeak: 0,
                gpuAvg: 0
              },
              lexicon: {
                sentiment: mapSentiment(lexiconSentiment),
                confidence: lexiconConfidence,
                analysisTime: (item.inference_time_ms || 0) / 1000,
                score: item.lexicon_result?.score || 0,
                sentimentWords: item.lexicon_result?.sentiment_words || [],
                cpuPeak: 0,
                cpuAvg: 0,
                gpuPeak: 0,
                gpuAvg: 0
              },
              external: externalResult ? {
                success: externalResult.success,
                sentiment: externalResult.sentiment === '正面' ? 'positive' : 
                           externalResult.sentiment === '负面' ? 'negative' : 'neutral',
                confidence: externalResult.confidence || 0,
                reasoning: externalResult.reasoning || '',
                model: externalResult.model || '',
                analysisTime: externalResult.processing_time || 0,
                error: externalResult.error || ''
              } : null
            }
          };
        } else {
          return {
            text: textLines[index],
            modelType: 'batch',
            models: {
              deepLearning: {
                sentiment: item.model_result.sentiment === '正面' ? 'positive' : 
                           item.model_result.sentiment === '负面' ? 'negative' : 'neutral',
                confidence: item.model_result.confidence,
                analysisTime: item.model_result.processing_time,
                scores: item.model_result.scores,
                cpuPeak: item.model_result.cpu_peak || 0,
                cpuAvg: item.model_result.cpu_avg || 0,
                gpuPeak: item.model_result.gpu_peak,
                gpuAvg: item.model_result.gpu_avg
              },
              lexicon: {
                sentiment: item.lexicon_result.sentiment === '正面' ? 'positive' : 
                           item.lexicon_result.sentiment === '负面' ? 'negative' : 'neutral',
                confidence: item.lexicon_result.confidence,
                analysisTime: item.lexicon_result.processing_time,
                score: item.lexicon_result.score,
                sentimentWords: item.lexicon_result.sentiment_words || [],
                cpuPeak: item.lexicon_result.cpu_peak || 0,
                cpuAvg: item.lexicon_result.cpu_avg || 0,
                gpuPeak: item.lexicon_result.gpu_peak,
                gpuAvg: item.lexicon_result.gpu_avg
              },
              external: externalResult ? {
                success: externalResult.success,
                sentiment: externalResult.sentiment === '正面' ? 'positive' : 
                           externalResult.sentiment === '负面' ? 'negative' : 'neutral',
                confidence: externalResult.confidence || 0,
                reasoning: externalResult.reasoning || '',
                model: externalResult.model || '',
                analysisTime: externalResult.processing_time || 0,
                error: externalResult.error || ''
              } : null
            }
          };
        }
      });
      
      setResultsList(results);
    setLoading(false);
  };

  const getSentimentConfig = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return { 
          bg: 'bg-gradient-to-r from-green-500 to-emerald-400', 
          text: '正面情感',
          icon: '😊',
          lightBg: 'bg-green-50',
          textColor: 'text-green-700'
        };
      case 'negative':
        return { 
          bg: 'bg-gradient-to-r from-red-500 to-rose-400', 
          text: '负面情感',
          icon: '😔',
          lightBg: 'bg-red-50',
          textColor: 'text-red-700'
        };
      case 'neutral':
        return { 
          bg: 'bg-gradient-to-r from-yellow-500 to-amber-400', 
          text: '中性情感',
          icon: '😐',
          lightBg: 'bg-yellow-50',
          textColor: 'text-yellow-700'
        };
      default:
        return { 
          bg: 'bg-gray-500', 
          text: '未知',
          icon: '❓',
          lightBg: 'bg-gray-50',
          textColor: 'text-gray-700'
        };
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < resultsList.length - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 0 && page < resultsList.length) {
      setCurrentPage(page);
    }
  };

  const downloadBlob = async (url: string, body: any, filename: string) => {
    const token = localStorage.getItem('training_token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (response.ok) {
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    }
  };

  const exportResults = async () => {
    if (resultsList.length === 0) return;

    const exportData = resultsList.map(r => ({
      text: r.text,
      model_sentiment: r.models.deepLearning.sentiment === 'positive' ? '正面' : 
                       r.models.deepLearning.sentiment === 'negative' ? '负面' : '中性',
      model_confidence: r.models.deepLearning.confidence,
      lexicon_sentiment: r.models.lexicon.sentiment === 'positive' ? '正面' : 
                         r.models.lexicon.sentiment === 'negative' ? '负面' : '中性',
      lexicon_confidence: r.models.lexicon.confidence,
      external_sentiment: r.models.external?.sentiment === 'positive' ? '正面' : 
                          r.models.external?.sentiment === 'negative' ? '负面' : '中性',
      external_confidence: r.models.external?.confidence || 0
    }));

    try {
      await downloadBlob(`${API_ENDPOINTS.text}/export-results`, { results: exportData, format: 'xlsx' }, 'analysis_results.xlsx');
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  const exportPerformance = async () => {
    if (resultsList.length === 0) return;

    const exportData = resultsList.map(r => ({
      text: r.text,
      model_time: Math.round(r.models.deepLearning.analysisTime * 1000),
      model_cpu_peak: r.models.deepLearning.cpuPeak,
      model_gpu_peak: r.models.deepLearning.gpuPeak || 0,
      lexicon_time: Math.round(r.models.lexicon.analysisTime * 1000),
      lexicon_cpu_peak: r.models.lexicon.cpuPeak,
      lexicon_gpu_peak: r.models.lexicon.gpuPeak || 0,
      external_time: r.models.external ? Math.round(r.models.external.analysisTime * 1000) : 0
    }));

    try {
      await downloadBlob(`${API_ENDPOINTS.text}/export-performance`, { results: exportData, format: 'xlsx' }, 'performance_data.xlsx');
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  const currentResult = resultsList[currentPage];

  const renderPagination = () => {
    if (resultsList.length <= 1) return null;

    const totalPages = resultsList.length;
    const maxVisiblePages = 7;
    let startPage = Math.max(0, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(0, endPage - maxVisiblePages + 1);
    }

    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="bg-white rounded-2xl shadow-lg p-4 border border-gray-100 mb-6">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={goToPrevPage}
            disabled={currentPage === 0}
            className="px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            上一页
          </button>

          <div className="flex items-center gap-1">
            {startPage > 0 && (
              <>
                <button
                  onClick={() => goToPage(0)}
                  className="w-10 h-10 rounded-xl font-medium transition-all duration-300 bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-600"
                >
                  1
                </button>
                {startPage > 1 && (
                  <span className="px-2 text-gray-400">...</span>
                )}
              </>
            )}
            
            {pages.map(page => (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={`w-10 h-10 rounded-xl font-medium transition-all duration-300 ${
                  page === currentPage
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-lg'
                    : 'bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-600'
                }`}
              >
                {page + 1}
              </button>
            ))}

            {endPage < totalPages - 1 && (
              <>
                {endPage < totalPages - 2 && (
                  <span className="px-2 text-gray-400">...</span>
                )}
                <button
                  onClick={() => goToPage(totalPages - 1)}
                  className="w-10 h-10 rounded-xl font-medium transition-all duration-300 bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-600"
                >
                  {totalPages}
                </button>
              </>
            )}
          </div>

          <button
            onClick={goToNextPage}
            disabled={currentPage === totalPages - 1}
            className="px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-600"
          >
            下一页
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="ml-4 px-4 py-2 bg-blue-50 rounded-xl text-blue-600 font-medium">
            第 {currentPage + 1} / {totalPages} 条
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-blue-50 py-12 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-600 rounded-full text-sm font-medium mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            文本情感分析
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            输入文本，分析情感
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            支持多行批量分析，每行文本作为一个独立样本进行分析，结果支持翻页浏览。
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8 mb-8 border border-gray-100">
          <div className="mb-6">
            <label htmlFor="text-input" className="block text-gray-700 font-semibold mb-3 text-lg">
              输入文本内容
            </label>
            <textarea
              id="text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="请输入要分析的中文文本，每行一条：&#10;例如：&#10;这个产品质量很好，物流也很快！&#10;服务态度太差了，再也不买了。&#10;一般般吧，没什么特别的。"
              className="w-full border-2 border-gray-200 rounded-2xl p-5 focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all duration-300 resize-none text-gray-700 placeholder-gray-400"
              rows={8}
            />
            <div className="flex justify-between items-center mt-2 text-sm text-gray-500">
              <span>每行一条文本，支持批量分析</span>
              <span>{lineCount} 条文本 | {text.length} 字符</span>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={handleAnalyze}
                disabled={loading || lineCount === 0}
                className="group px-10 py-4 bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white font-semibold rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-lg flex items-center gap-3"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    分析中...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    开始分析 ({lineCount} 条)
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-3 bg-gradient-to-r from-purple-50 to-pink-50 px-5 py-3 rounded-xl border border-purple-100">
              <div className="flex flex-col">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  混合分析模式
                </label>
                <span className="text-xs text-gray-500">
                  {useHybridMode ? '使用混合推理模型（更快）' : '使用词典快速模型'}
                </span>
              </div>
              <button
                onClick={() => setUseHybridMode(!useHybridMode)}
                className={`relative w-14 h-7 rounded-full transition-all duration-300 ${
                  useHybridMode 
                    ? 'bg-gradient-to-r from-purple-500 to-pink-400' 
                    : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300 ${
                    useHybridMode ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {cachedResult && !resultsList.length && (
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-3xl shadow-lg p-6 mb-8 border border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">上次分析结果</h3>
                  <p className="text-sm text-gray-500">
                    完成于 {cachedResult.completed_at ? new Date(cachedResult.completed_at).toLocaleString('zh-CN') : ''} · 
                    共 {cachedResult.total_count || 0} 条结果
                    {cachedResult.gpu_memory_peak_mb && ` · 显存峰值: ${cachedResult.gpu_memory_peak_mb.toFixed(0)} MB`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadFromCache}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white font-medium rounded-xl transition-all duration-300 shadow-md hover:shadow-lg"
                >
                  加载结果
                </button>
                <button
                  onClick={clearCache}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium rounded-xl transition-all duration-300"
                >
                  清除缓存
                </button>
              </div>
            </div>
          </div>
        )}

        {resultsList.length > 0 && currentResult && (
          <div className="space-y-8 animate-fadeIn">
            {isFromCache && (
              <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-blue-700 font-medium">这是上次分析的结果（来自缓存）</span>
                </div>
                <button
                  onClick={clearCache}
                  className="text-sm text-blue-600 hover:text-red-500 transition-colors"
                >
                  清除缓存
                </button>
              </div>
            )}
            {renderPagination()}

            <div className="bg-white rounded-3xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">文本 #{currentPage + 1}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-blue-50 rounded-full text-blue-600 text-sm font-medium">
                    共 {resultsList.length} 条结果
                  </span>
                  {currentResult.modelType === 'hybrid' ? (
                    <span className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-400 text-white text-sm font-semibold rounded-full flex items-center gap-1 shadow-md">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      混合推理
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-gradient-to-r from-blue-500 to-cyan-400 text-white text-sm font-semibold rounded-full flex items-center gap-1 shadow-md">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      词典快速
                    </span>
                  )}
                </div>
              </div>
              
              {currentResult.modelType === 'hybrid' && currentResult.hybridStats && (
                <div className="mb-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-4 border border-purple-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">混合分析统计</h3>
                        <p className="text-xs text-gray-500">快速路径处理比例</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-purple-600">
                          {(currentResult.hybridStats.fastPathRatio * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          {currentResult.hybridStats.fastPathSamples} / {currentResult.hybridStats.totalSamples} 样本
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-purple-500 to-pink-400 h-2.5 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${currentResult.hybridStats.fastPathRatio * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mb-4">
                <button
                  onClick={exportResults}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-400 hover:from-green-600 hover:to-emerald-500 text-white font-medium rounded-xl transition-all duration-300 shadow-md hover:shadow-lg"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  导出结果
                </button>
                <button
                  onClick={exportPerformance}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white font-medium rounded-xl transition-all duration-300 shadow-md hover:shadow-lg"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  导出性能数据
                </button>
              </div>
              <p className="text-gray-700 bg-gradient-to-r from-gray-50 to-blue-50 p-5 rounded-2xl border border-gray-100 leading-relaxed">
                {currentResult.text}
              </p>
            </div>

            <div className={`grid gap-6 ${textApiEnabled && currentResult.models.external ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
              <div className="bg-white rounded-3xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all duration-300 group">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">深度学习模型</h3>
                      <p className="text-sm text-gray-500">本地神经网络分析</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 rounded-full">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-blue-600">{(currentResult.models.deepLearning.analysisTime * 1000).toFixed(0)}ms</span>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <h4 className="text-sm text-gray-500 mb-2 font-medium">情感极性</h4>
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold ${getSentimentConfig(currentResult.models.deepLearning.sentiment).bg}`}>
                      <span className="text-lg">{getSentimentConfig(currentResult.models.deepLearning.sentiment).icon}</span>
                      {getSentimentConfig(currentResult.models.deepLearning.sentiment).text}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm text-gray-500 font-medium">置信度</h4>
                      <span className="text-lg font-bold text-gray-900">{(currentResult.models.deepLearning.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-cyan-400 h-3 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${currentResult.models.deepLearning.confidence * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {currentResult.models.deepLearning.scores && (
                    <div className="bg-gradient-to-br from-gray-50 to-blue-50 p-4 rounded-xl border border-gray-100">
                      <h4 className="text-xs text-gray-500 mb-2 font-medium">各类别得分</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-green-600">正面</span>
                          <span className="text-sm font-medium">{(currentResult.models.deepLearning.scores['正面'] * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-yellow-600">中性</span>
                          <span className="text-sm font-medium">{(currentResult.models.deepLearning.scores['中性'] * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-red-600">负面</span>
                          <span className="text-sm font-medium">{(currentResult.models.deepLearning.scores['负面'] * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all duration-300 group">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-400 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">情感词典分析</h3>
                      <p className="text-sm text-gray-500">本地词典规则分析</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 rounded-full">
                    <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-purple-600">{(currentResult.models.lexicon.analysisTime * 1000).toFixed(0)}ms</span>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <h4 className="text-sm text-gray-500 mb-2 font-medium">情感极性</h4>
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold ${getSentimentConfig(currentResult.models.lexicon.sentiment).bg}`}>
                      <span className="text-lg">{getSentimentConfig(currentResult.models.lexicon.sentiment).icon}</span>
                      {getSentimentConfig(currentResult.models.lexicon.sentiment).text}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm text-gray-500 font-medium">置信度</h4>
                      <span className="text-lg font-bold text-gray-900">{(currentResult.models.lexicon.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-purple-500 to-pink-400 h-3 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${currentResult.models.lexicon.confidence * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-xl border border-purple-100">
                      <h4 className="text-xs text-gray-500 mb-1 font-medium">情感得分</h4>
                      <p className="text-2xl font-bold text-purple-600">
                        {currentResult.models.lexicon.score > 0 ? '+' : ''}{currentResult.models.lexicon.score.toFixed(1)}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-yellow-50 p-4 rounded-xl border border-orange-100">
                      <h4 className="text-xs text-gray-500 mb-1 font-medium">情感词数</h4>
                      <p className="text-2xl font-bold text-orange-600">
                        {currentResult.models.lexicon.sentimentWords?.length || 0}
                      </p>
                    </div>
                  </div>

                  {currentResult.models.lexicon.sentimentWords && currentResult.models.lexicon.sentimentWords.length > 0 && (
                    <div className="bg-gradient-to-br from-gray-50 to-purple-50 p-4 rounded-xl border border-gray-100">
                      <h4 className="text-xs text-gray-500 mb-2 font-medium">识别到的情感词</h4>
                      <div className="flex flex-wrap gap-2">
                        {currentResult.models.lexicon.sentimentWords.slice(0, 8).map((word: any, index: number) => (
                          <span 
                            key={index}
                            className={`px-2 py-1 rounded-lg text-xs font-medium ${
                              word.final_score > 0 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {word.word} ({word.final_score > 0 ? '+' : ''}{word.final_score})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {textApiEnabled && currentResult.models.external && (
                <div className="bg-white rounded-3xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all duration-300 group">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-400 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">外部API分析</h3>
                        <p className="text-sm text-gray-500">{currentResult.models.external.model || '云端模型'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 rounded-full">
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-emerald-600">{(currentResult.models.external.analysisTime * 1000).toFixed(0)}ms</span>
                    </div>
                  </div>

                  {currentResult.models.external.success ? (
                    <div className="space-y-5">
                      <div>
                        <h4 className="text-sm text-gray-500 mb-2 font-medium">情感极性</h4>
                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold ${getSentimentConfig(currentResult.models.external.sentiment).bg}`}>
                          <span className="text-lg">{getSentimentConfig(currentResult.models.external.sentiment).icon}</span>
                          {getSentimentConfig(currentResult.models.external.sentiment).text}
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm text-gray-500 font-medium">置信度</h4>
                          <span className="text-lg font-bold text-gray-900">{(currentResult.models.external.confidence * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-3 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${currentResult.models.external.confidence * 100}%` }}
                          ></div>
                        </div>
                      </div>

                      {currentResult.models.external.reasoning && (
                        <div className="bg-gradient-to-br from-gray-50 to-emerald-50 p-4 rounded-xl border border-gray-100">
                          <h4 className="text-xs text-gray-500 mb-2 font-medium">分析理由</h4>
                          <p className="text-sm text-gray-700 leading-relaxed">{currentResult.models.external.reasoning}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {currentResult.models.external.error || '外部API调用失败'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TextAnalysisPage;
