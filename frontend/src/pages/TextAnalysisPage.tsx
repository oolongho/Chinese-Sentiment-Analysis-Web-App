import React, { useState } from 'react';

const TextAnalysisPage: React.FC = () => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleAnalyze = async () => {
    if (!text.trim()) return;

    setLoading(true);
    try {
      // 模拟API调用
      setTimeout(() => {
        setResults({
          text: text,
          models: {
            deepLearning: {
              sentiment: 'positive',
              confidence: 0.92,
              analysisTime: 0.045,
              accuracy: 0.89,
              f1Score: 0.87
            },
            lexicon: {
              sentiment: 'positive',
              confidence: 0.88,
              analysisTime: 0.012,
              accuracy: 0.82,
              f1Score: 0.80
            }
          }
        });
        setLoading(false);
      }, 1500);
    } catch (error) {
      console.error('分析失败:', error);
      setLoading(false);
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'bg-green-100 text-green-800';
      case 'negative':
        return 'bg-red-100 text-red-800';
      case 'neutral':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getSentimentText = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return '正面';
      case 'negative':
        return '负面';
      case 'neutral':
        return '中性';
      default:
        return '未知';
    }
  };

  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="container mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">
          文本情感分析
        </h1>

        {/* 文本输入区域 */}
        <div className="bg-white rounded-xl shadow-md p-8 mb-8 border border-gray-100">
          <div className="mb-6">
            <label htmlFor="text-input" className="block text-gray-700 font-medium mb-2">
              输入文本
            </label>
            <textarea
              id="text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="请输入要分析的中文文本..."
              className="w-full border border-gray-300 rounded-lg p-4 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors resize-none"
              rows={6}
            />
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleAnalyze}
              disabled={loading || !text.trim()}
              className="px-8 py-3 bg-blue-400 hover:bg-blue-500 text-white font-medium rounded-full transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  分析中...
                </>
              ) : (
                '分析'
              )}
            </button>
          </div>
        </div>

        {/* 分析结果 */}
        {results && (
          <div className="space-y-8">
            {/* 输入文本展示 */}
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                输入文本
              </h2>
              <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
                {results.text}
              </p>
            </div>

            {/* 分析结果卡片 */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* 文字大模型分析 */}
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    文字大模型分析
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 8 0 11-16 0 8 8 0 0116 0z" />
                    </svg>
                    <span>{(results.models.deepLearning.analysisTime * 1000).toFixed(0)}ms</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm text-gray-600 mb-1">情感极性</h4>
                    <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getSentimentColor(results.models.deepLearning.sentiment)}`}>
                      {getSentimentText(results.models.deepLearning.sentiment)}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm text-gray-600 mb-1">置信度</h4>
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-400 h-2 rounded-full" 
                          style={{ width: `${results.models.deepLearning.confidence * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 min-w-[60px]">
                        {(results.models.deepLearning.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <h4 className="text-xs text-gray-500 mb-1">准确率</h4>
                      <p className="text-lg font-semibold text-gray-800">
                        {(results.models.deepLearning.accuracy * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <h4 className="text-xs text-gray-500 mb-1">F1值</h4>
                      <p className="text-lg font-semibold text-gray-800">
                        {(results.models.deepLearning.f1Score * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 情感词典分析 */}
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    情感词典分析
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a8 8 0 11-16 0 8 8 0 0116 0z" />
                    </svg>
                    <span>{(results.models.lexicon.analysisTime * 1000).toFixed(0)}ms</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm text-gray-600 mb-1">情感极性</h4>
                    <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getSentimentColor(results.models.lexicon.sentiment)}`}>
                      {getSentimentText(results.models.lexicon.sentiment)}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm text-gray-600 mb-1">置信度</h4>
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-400 h-2 rounded-full" 
                          style={{ width: `${results.models.lexicon.confidence * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 min-w-[60px]">
                        {(results.models.lexicon.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <h4 className="text-xs text-gray-500 mb-1">准确率</h4>
                      <p className="text-lg font-semibold text-gray-800">
                        {(results.models.lexicon.accuracy * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <h4 className="text-xs text-gray-500 mb-1">F1值</h4>
                      <p className="text-lg font-semibold text-gray-800">
                        {(results.models.lexicon.f1Score * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TextAnalysisPage;
