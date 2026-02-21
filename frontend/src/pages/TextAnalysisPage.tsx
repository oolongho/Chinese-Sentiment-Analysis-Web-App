import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000/api';

interface AnalysisResult {
  text: string;
  models: {
    deepLearning: {
      sentiment: string;
      confidence: number;
      analysisTime: number;
      scores: { [key: string]: number };
    };
    lexicon: {
      sentiment: string;
      confidence: number;
      analysisTime: number;
      score: number;
      sentimentWords: any[];
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
  const [externalApiConfigured, setExternalApiConfigured] = useState(false);

  useEffect(() => {
    checkExternalApi();
  }, []);

  const checkExternalApi = async () => {
    try {
      const token = localStorage.getItem('training_token');
      if (token) {
        const response = await fetch(`${API_BASE}/training/external-api/check`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setExternalApiConfigured(data.text_configured);
        }
      }
    } catch {
      // 忽略错误
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
    
    try {
      const [localResponse, externalResponse] = await Promise.all([
        fetch(`${API_BASE}/text/analyze/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: textLines })
        }),
        externalApiConfigured ? fetch(`${API_BASE}/text/analyze/external/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: textLines })
        }) : null
      ]);
      
      if (!localResponse.ok) {
        throw new Error('分析请求失败');
      }
      
      const localData = await localResponse.json();
      let externalDataResults: any[] = [];
      
      if (externalResponse && externalResponse.ok) {
        const externalJson = await externalResponse.json();
        externalDataResults = externalJson.results || [];
      }
      
      const results: AnalysisResult[] = localData.results.map((item: any, index: number) => ({
        text: textLines[index],
        models: {
          deepLearning: {
            sentiment: item.model_result.sentiment === '正面' ? 'positive' : 
                       item.model_result.sentiment === '负面' ? 'negative' : 'neutral',
            confidence: item.model_result.confidence,
            analysisTime: item.model_result.processing_time,
            scores: item.model_result.scores
          },
          lexicon: {
            sentiment: item.lexicon_result.sentiment === '正面' ? 'positive' : 
                       item.lexicon_result.sentiment === '负面' ? 'negative' : 'neutral',
            confidence: item.lexicon_result.confidence,
            analysisTime: item.lexicon_result.processing_time,
            score: item.lexicon_result.score,
            sentimentWords: item.lexicon_result.sentiment_words || []
          },
          external: externalDataResults[index] ? {
            success: externalDataResults[index].success,
            sentiment: externalDataResults[index].sentiment === '正面' ? 'positive' : 
                       externalDataResults[index].sentiment === '负面' ? 'negative' : 'neutral',
            confidence: externalDataResults[index].confidence,
            reasoning: externalDataResults[index].reasoning,
            model: externalDataResults[index].model,
            analysisTime: externalDataResults[index].processing_time,
            error: externalDataResults[index].error
          } : null
        }
      }));
      
      setResultsList(results);
    } catch (err: any) {
      console.error('分析失败:', err);
      setError('分析失败，请检查后端服务是否正常运行');
    } finally {
      setLoading(false);
    }
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

          <div className="flex justify-center">
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
        </div>

        {resultsList.length > 0 && currentResult && (
          <div className="space-y-8 animate-fadeIn">
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
                <div className="px-3 py-1 bg-blue-50 rounded-full text-blue-600 text-sm font-medium">
                  共 {resultsList.length} 条结果
                </div>
              </div>
              <p className="text-gray-700 bg-gradient-to-r from-gray-50 to-blue-50 p-5 rounded-2xl border border-gray-100 leading-relaxed">
                {currentResult.text}
              </p>
            </div>

            <div className={`grid gap-6 ${currentResult.models.external ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
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

              {currentResult.models.external && (
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
