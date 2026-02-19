import React, { useState, useEffect, useRef } from 'react';

// 模拟wavesurfer.js导入
// const WaveSurfer = (window as any).WaveSurfer || {
//   create: () => ({
//     loadBlob: () => {},
//     playPause: () => {},
//     on: () => {},
//     destroy: () => {}
//   })
// };

const AudioAnalysisPage: React.FC = () => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [waveformReady, setWaveformReady] = useState(false);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }
    };
  }, []);

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
      
      // 初始化波形
      if (waveformRef.current) {
        if (wavesurferRef.current) {
          wavesurferRef.current.destroy();
        }
        
        // 这里应该使用实际的WaveSurfer初始化
        // 由于是模拟环境，我们只设置状态
        setWaveformReady(true);
      }
    }
  };

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const handleAnalyze = async () => {
    if (!audioFile) return;

    setLoading(true);
    try {
      // 模拟API调用
      setTimeout(() => {
        setResults({
          transcript: '这是一段测试音频，内容非常好，我很喜欢这个产品，质量很不错。',
          models: {
            voiceModel: {
              sentiment: 'positive',
              confidence: 0.94,
              analysisTime: 0.12,
              accuracy: 0.91,
              f1Score: 0.89
            },
            deepLearning: {
              sentiment: 'positive',
              confidence: 0.92,
              analysisTime: 0.05,
              accuracy: 0.89,
              f1Score: 0.87
            },
            lexicon: {
              sentiment: 'positive',
              confidence: 0.88,
              analysisTime: 0.01,
              accuracy: 0.82,
              f1Score: 0.80
            }
          }
        });
        setLoading(false);
      }, 2000);
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
          音频情感分析
        </h1>

        {/* 音频上传区域 */}
        <div className="bg-white rounded-xl shadow-md p-8 mb-8 border border-gray-100">
          <div className="mb-6">
            <label htmlFor="audio-upload" className="block text-gray-700 font-medium mb-2">
              上传音频文件
            </label>
            <div className="flex items-center gap-4">
              <input
                id="audio-upload"
                type="file"
                accept="audio/*"
                onChange={handleAudioUpload}
                className="flex-1 border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
              />
              {audioFile && (
                <button
                  onClick={handlePlayPause}
                  className="px-4 py-2 bg-blue-400 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 8 0 11-18 0 8 8 0 0118 0z" />
                  </svg>
                  播放
                </button>
              )}
            </div>
          </div>

          {/* 波形预览 */}
          {audioFile && (
            <div className="mb-6">
              <h3 className="text-gray-700 font-medium mb-2">音频波形</h3>
              <div 
                ref={waveformRef}
                className="bg-gray-50 rounded-lg p-4 min-h-[120px] flex items-center justify-center"
              >
                {waveformReady ? (
                  <div className="w-full h-20 bg-gray-200 rounded-lg relative">
                    {/* 模拟波形 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex space-x-1 w-full px-4">
                        {[...Array(50)].map((_, i) => (
                          <div 
                            key={i}
                            className="flex-1 bg-blue-400 rounded-sm"
                            style={{ 
                              height: `${Math.random() * 60 + 20}%`,
                              animationDelay: `${i * 0.01}s`
                            }}
                          ></div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">加载波形中...</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-center">
            <button
              onClick={handleAnalyze}
              disabled={loading || !audioFile}
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
            {/* 识别的文字 */}
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                识别的文字
              </h2>
              <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
                {results.transcript}
              </p>
            </div>

            {/* 分析结果卡片 */}
            <div className="grid md:grid-cols-3 gap-6">
              {/* 语音大模型分析 */}
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    语音大模型分析
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 8 0 11-16 0 8 8 0 0116 0z" />
                    </svg>
                    <span>{(results.models.voiceModel.analysisTime * 1000).toFixed(0)}ms</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm text-gray-600 mb-1">情感极性</h4>
                    <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getSentimentColor(results.models.voiceModel.sentiment)}`}>
                      {getSentimentText(results.models.voiceModel.sentiment)}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm text-gray-600 mb-1">置信度</h4>
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-400 h-2 rounded-full" 
                          style={{ width: `${results.models.voiceModel.confidence * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 min-w-[60px]">
                        {(results.models.voiceModel.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <h4 className="text-xs text-gray-500 mb-1">准确率</h4>
                      <p className="text-lg font-semibold text-gray-800">
                        {(results.models.voiceModel.accuracy * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <h4 className="text-xs text-gray-500 mb-1">F1值</h4>
                      <p className="text-lg font-semibold text-gray-800">
                        {(results.models.voiceModel.f1Score * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>

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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 8 0 11-16 0 8 8 0 0116 0z" />
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

export default AudioAnalysisPage;
