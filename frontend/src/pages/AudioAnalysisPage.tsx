import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:8000/api';

const AudioAnalysisPage: React.FC = () => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [waveformReady, setWaveformReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  const [externalApiConfigured, setExternalApiConfigured] = useState(false);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    checkExternalApi();
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }
    };
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
          setExternalApiConfigured(data.audio_configured);
        }
      }
    } catch {
      // 忽略错误
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
      setResults(null);
      setWaveformReady(true);
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleAnalyze = async () => {
    if (!audioFile) return;

    setLoading(true);
    setError('');
    
    try {
      const formData = new FormData();
      formData.append('file', audioFile);
      
      const [localResponse, externalResponse] = await Promise.all([
        fetch(`${API_BASE}/audio/analyze`, {
          method: 'POST',
          body: formData
        }),
        externalApiConfigured ? fetch(`${API_BASE}/audio/analyze/external`, {
          method: 'POST',
          body: formData
        }) : null
      ]);
      
      if (!localResponse.ok) {
        throw new Error('分析请求失败');
      }
      
      const localData = await localResponse.json();
      let externalData = null;
      
      if (externalResponse && externalResponse.ok) {
        externalData = await externalResponse.json();
      }
      
      setResults({
        transcript: localData.transcription,
        models: {
          deepLearning: {
            sentiment: localData.model_result?.sentiment === '正面' ? 'positive' : 
                       localData.model_result?.sentiment === '负面' ? 'negative' : 'neutral',
            confidence: localData.model_result?.confidence || 0,
            analysisTime: localData.model_result?.processing_time || 0,
            scores: localData.model_result?.scores
          },
          lexicon: {
            sentiment: localData.lexicon_result?.sentiment === '正面' ? 'positive' : 
                       localData.lexicon_result?.sentiment === '负面' ? 'negative' : 'neutral',
            confidence: localData.lexicon_result?.confidence || 0,
            analysisTime: localData.lexicon_result?.processing_time || 0,
            score: localData.lexicon_result?.score || 0,
            sentimentWords: localData.lexicon_result?.sentiment_words || []
          },
          external: externalData ? {
            success: externalData.success,
            sentiment: externalData.sentiment === '正面' ? 'positive' : 
                       externalData.sentiment === '负面' ? 'negative' : 'neutral',
            confidence: externalData.confidence,
            reasoning: externalData.reasoning,
            model: externalData.model,
            analysisTime: externalData.processing_time,
            error: externalData.error
          } : null
        }
      });
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-purple-50 py-12 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-600 rounded-full text-sm font-medium mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            音频情感分析
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            上传音频，分析情感
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            支持多种音频格式，系统将通过三通道分析技术精准识别语音中的情感倾向
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8 mb-8 border border-gray-100">
          <div className="mb-6">
            <label className="block text-gray-700 font-semibold mb-3 text-lg">
              上传音频文件
            </label>
            <div className="relative">
              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioUpload}
                className="hidden"
                id="audio-upload"
              />
              <label
                htmlFor="audio-upload"
                className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer bg-gradient-to-br from-gray-50 to-purple-50 hover:from-purple-50 hover:to-blue-50 hover:border-purple-400 transition-all duration-300"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-400 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="mb-2 text-lg font-semibold text-gray-700">
                    {audioFile ? audioFile.name : '点击上传音频文件'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {audioFile ? formatFileSize(audioFile.size) : '支持 MP3, WAV, M4A 等格式'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {audioFile && (
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">音频波形预览</h3>
              </div>
              
              <div className="bg-gradient-to-r from-gray-50 to-purple-50 rounded-2xl p-6 border border-gray-100">
                <div 
                  ref={waveformRef}
                  className="h-24 flex items-center justify-center relative overflow-hidden"
                >
                  {waveformReady ? (
                    <div className="w-full h-full flex items-center justify-center gap-0.5">
                      {[...Array(60)].map((_, i) => (
                        <div 
                          key={i}
                          className="flex-1 bg-gradient-to-t from-purple-500 to-pink-400 rounded-sm transition-all duration-300 hover:from-purple-400 hover:to-pink-300"
                          style={{ 
                            height: `${Math.random() * 60 + 20}%`,
                            animationDelay: `${i * 0.02}s`
                          }}
                        ></div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">加载波形中...</p>
                  )}
                </div>
                
                <div className="flex items-center justify-center mt-4 gap-4">
                  <button
                    onClick={handlePlayPause}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-600 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl"
                  >
                    {isPlaying ? (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        暂停
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        播放
                      </>
                    )}
                  </button>
                </div>
              </div>
              
              <audio ref={audioRef} src={audioFile ? URL.createObjectURL(audioFile) : undefined} onEnded={() => setIsPlaying(false)} />
            </div>
          )}

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
              disabled={loading || !audioFile}
              className="group px-10 py-4 bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-600 hover:to-pink-500 text-white font-semibold rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-lg flex items-center gap-3"
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  开始分析
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>

        {results && (
          <div className="space-y-8 animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">语音识别结果</h2>
              </div>
              <p className="text-gray-700 bg-gradient-to-r from-gray-50 to-purple-50 p-5 rounded-2xl border border-gray-100 leading-relaxed">
                {results.transcript}
              </p>
            </div>

            <div className={`grid gap-6 ${results.models.external ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
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
                    <span className="text-sm font-medium text-blue-600">{(results.models.deepLearning.analysisTime * 1000).toFixed(0)}ms</span>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <h4 className="text-sm text-gray-500 mb-2 font-medium">情感极性</h4>
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold ${getSentimentConfig(results.models.deepLearning.sentiment).bg}`}>
                      <span className="text-lg">{getSentimentConfig(results.models.deepLearning.sentiment).icon}</span>
                      {getSentimentConfig(results.models.deepLearning.sentiment).text}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm text-gray-500 font-medium">置信度</h4>
                      <span className="text-lg font-bold text-gray-900">{(results.models.deepLearning.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-cyan-400 h-3 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${results.models.deepLearning.confidence * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {results.models.deepLearning.scores && (
                    <div className="bg-gradient-to-br from-gray-50 to-blue-50 p-4 rounded-xl border border-gray-100">
                      <h4 className="text-xs text-gray-500 mb-2 font-medium">各类别得分</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-green-600">正面</span>
                          <span className="text-sm font-medium">{(results.models.deepLearning.scores['正面'] * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-yellow-600">中性</span>
                          <span className="text-sm font-medium">{(results.models.deepLearning.scores['中性'] * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-red-600">负面</span>
                          <span className="text-sm font-medium">{(results.models.deepLearning.scores['负面'] * 100).toFixed(1)}%</span>
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
                    <span className="text-sm font-medium text-purple-600">{(results.models.lexicon.analysisTime * 1000).toFixed(0)}ms</span>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <h4 className="text-sm text-gray-500 mb-2 font-medium">情感极性</h4>
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold ${getSentimentConfig(results.models.lexicon.sentiment).bg}`}>
                      <span className="text-lg">{getSentimentConfig(results.models.lexicon.sentiment).icon}</span>
                      {getSentimentConfig(results.models.lexicon.sentiment).text}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm text-gray-500 font-medium">置信度</h4>
                      <span className="text-lg font-bold text-gray-900">{(results.models.lexicon.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-purple-500 to-pink-400 h-3 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${results.models.lexicon.confidence * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-xl border border-purple-100">
                      <h4 className="text-xs text-gray-500 mb-1 font-medium">情感得分</h4>
                      <p className="text-2xl font-bold text-purple-600">
                        {results.models.lexicon.score > 0 ? '+' : ''}{results.models.lexicon.score.toFixed(1)}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-yellow-50 p-4 rounded-xl border border-orange-100">
                      <h4 className="text-xs text-gray-500 mb-1 font-medium">情感词数</h4>
                      <p className="text-2xl font-bold text-orange-600">
                        {results.models.lexicon.sentimentWords?.length || 0}
                      </p>
                    </div>
                  </div>

                  {results.models.lexicon.sentimentWords && results.models.lexicon.sentimentWords.length > 0 && (
                    <div className="bg-gradient-to-br from-gray-50 to-purple-50 p-4 rounded-xl border border-gray-100">
                      <h4 className="text-xs text-gray-500 mb-2 font-medium">识别到的情感词</h4>
                      <div className="flex flex-wrap gap-2">
                        {results.models.lexicon.sentimentWords.slice(0, 8).map((word: any, index: number) => (
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

              {results.models.external && (
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
                        <p className="text-sm text-gray-500">{results.models.external.model || '云端模型'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 rounded-full">
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-emerald-600">{(results.models.external.analysisTime * 1000).toFixed(0)}ms</span>
                    </div>
                  </div>

                  {results.models.external.success ? (
                    <div className="space-y-5">
                      <div>
                        <h4 className="text-sm text-gray-500 mb-2 font-medium">情感极性</h4>
                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold ${getSentimentConfig(results.models.external.sentiment).bg}`}>
                          <span className="text-lg">{getSentimentConfig(results.models.external.sentiment).icon}</span>
                          {getSentimentConfig(results.models.external.sentiment).text}
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm text-gray-500 font-medium">置信度</h4>
                          <span className="text-lg font-bold text-gray-900">{(results.models.external.confidence * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-3 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${results.models.external.confidence * 100}%` }}
                          ></div>
                        </div>
                      </div>

                      {results.models.external.reasoning && (
                        <div className="bg-gradient-to-br from-gray-50 to-emerald-50 p-4 rounded-xl border border-gray-100">
                          <h4 className="text-xs text-gray-500 mb-2 font-medium">分析理由</h4>
                          <p className="text-sm text-gray-700 leading-relaxed">{results.models.external.reasoning}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {results.models.external.error || '外部API调用失败'}
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

export default AudioAnalysisPage;
