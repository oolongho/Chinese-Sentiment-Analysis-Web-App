import React, { useState, useEffect, useRef } from 'react';
import { API_ENDPOINTS } from '../config/api';

interface ModelStatus {
  available: boolean;
  loaded: boolean;
  loading: boolean;
  load_progress: number;
  gpu_memory_mb: number;
  idle_seconds: number;
  model_name: string;
}

interface SentenceResult {
  text: string;
  lexicon_result: {
    sentiment: string;
    score: number;
    confidence: number;
    sentiment_words: Array<{ word: string; final_score: number }>;
  };
  model_result: {
    sentiment: string;
    confidence: number;
    scores: { [key: string]: number };
  };
}

interface CachedResult {
  completed_at: string;
  transcription: string;
  sentences: SentenceResult[];
  overall_sentiment: {
    sentiment: string;
    confidence: number;
    positive_ratio: number;
    negative_ratio: number;
    neutral_ratio: number;
  };
  audio_duration: number;
  sentence_count: number;
  gpu_memory_peak_mb: number;
}

const AudioAnalysisPage: React.FC = () => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [transcription, setTranscription] = useState('');
  const [sentences, setSentences] = useState<SentenceResult[]>([]);
  const [overallSentiment, setOverallSentiment] = useState<any>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [gpuMemory, setGpuMemory] = useState({ current_mb: 0, peak_mb: 0 });
  const [confidence, setConfidence] = useState(0);
  const [waveformReady, setWaveformReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  const [cachedResult, setCachedResult] = useState<CachedResult | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const waveformRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    loadModelStatus();
    loadCachedResult();
    return () => {
      if (audioRef.current) {
        URL.revokeObjectURL(audioRef.current.src);
      }
    };
  }, []);

  const loadModelStatus = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.audio}/model-status`);
      if (response.ok) {
        const data = await response.json();
        setModelStatus(data);
      }
    } catch (err) {
      console.error('加载模型状态失败:', err);
    }
  };

  const loadCachedResult = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.audio}/cached-result`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.cached_result) {
          setCachedResult(data.cached_result);
        }
      }
    } catch (err) {
      console.error('加载缓存失败:', err);
    }
  };

  const loadFromCache = () => {
    if (cachedResult) {
      setTranscription(cachedResult.transcription);
      setSentences(cachedResult.sentences);
      setOverallSentiment(cachedResult.overall_sentiment);
      setAudioDuration(cachedResult.audio_duration);
      setGpuMemory({ current_mb: 0, peak_mb: cachedResult.gpu_memory_peak_mb || 0 });
      setConfidence(cachedResult.overall_sentiment?.confidence || 0);
      setIsFromCache(true);
      setCurrentPage(0);
    }
  };

  const clearCache = async () => {
    try {
      await fetch(`${API_ENDPOINTS.audio}/clear-cache`, { method: 'POST' });
      setCachedResult(null);
    } catch (err) {
      console.error('清除缓存失败:', err);
    }
  };

  const loadModel = async () => {
    try {
      setModelLoading(true);
      setError('');
      
      // 开始轮询模型状态
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`${API_ENDPOINTS.audio}/model-status`);
          if (response.ok) {
            const data = await response.json();
            setModelStatus(data);
            if (data.loaded || (!data.loading && !data.loaded)) {
              clearInterval(pollInterval);
              setModelLoading(false);
            }
          }
        } catch (err) {
          console.error('轮询模型状态失败:', err);
        }
      }, 500);
      
      const response = await fetch(`${API_ENDPOINTS.audio}/load-model`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json();
        setError(data.detail || '模型加载失败');
        clearInterval(pollInterval);
        setModelLoading(false);
      }
    } catch (err) {
      setError('模型加载失败');
      setModelLoading(false);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
      setTranscription('');
      setSentences([]);
      setOverallSentiment(null);
      setIsFromCache(false);
      setWaveformReady(true);
      setError('');
      
      const audio = new Audio(URL.createObjectURL(file));
      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration);
        if (audio.duration > 300) {
          setError(`音频时长 ${audio.duration.toFixed(1)} 秒超过限制（最大 300 秒），请裁剪后重试`);
        }
      };
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
    setIsFromCache(false);
    
    try {
      const formData = new FormData();
      formData.append('file', audioFile);
      
      const response = await fetch(`${API_ENDPOINTS.audio}/analyze`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '分析请求失败');
      }
      
      const data = await response.json();
      
      setTranscription(data.transcription);
      setSentences(data.sentences);
      setOverallSentiment(data.overall_sentiment);
      setAudioDuration(data.audio_duration);
      setGpuMemory(data.gpu_memory);
      setConfidence(data.confidence);
      setCurrentPage(0);
      
      await loadModelStatus();
      
    } catch (err: any) {
      console.error('分析失败:', err);
      setError(err.message || '分析失败，请检查后端服务是否正常运行');
    } finally {
      setLoading(false);
    }
  };

  const getSentimentConfig = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
      case '正面':
        return { 
          bg: 'bg-gradient-to-r from-green-500 to-emerald-400', 
          text: '正面情感',
          icon: '😊',
          lightBg: 'bg-green-50',
          textColor: 'text-green-700'
        };
      case 'negative':
      case '负面':
        return { 
          bg: 'bg-gradient-to-r from-red-500 to-rose-400', 
          text: '负面情感',
          icon: '😔',
          lightBg: 'bg-red-50',
          textColor: 'text-red-700'
        };
      case 'neutral':
      case '中性':
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

  const currentSentence = sentences.length > 0 ? sentences[currentPage] : null;

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
            支持多种音频格式，系统将通过语音识别和三通道分析技术精准识别语音中的情感倾向
          </p>
        </div>

        {/* 模型状态卡片 */}
        {modelStatus && (
          <div className="bg-white rounded-3xl shadow-lg p-6 mb-8 border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  modelStatus.loaded ? 'bg-green-100' : 
                  modelStatus.loading ? 'bg-yellow-100' : 'bg-gray-100'
                }`}>
                  <svg className={`w-6 h-6 ${
                    modelStatus.loaded ? 'text-green-500' : 
                    modelStatus.loading ? 'text-yellow-500' : 'text-gray-400'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">语音识别模型</h3>
                  <p className="text-sm text-gray-500">
                    {modelStatus.loading ? '加载中...' : 
                     modelStatus.loaded ? `已加载 · 显存: ${modelStatus.gpu_memory_mb.toFixed(0)} MB` : 
                     '未加载'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {modelStatus.loaded && (
                  <span className="text-sm text-gray-500">
                    闲置: {Math.floor(modelStatus.idle_seconds)}s
                  </span>
                )}
                {!modelStatus.available && (
                  <span className="text-sm text-red-500">FunASR 未安装</span>
                )}
                {modelStatus.available && !modelStatus.loaded && !modelStatus.loading && !modelLoading && (
                  <button
                    onClick={loadModel}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-600 hover:to-pink-500 text-white font-medium rounded-xl transition-all duration-300"
                  >
                    加载模型
                  </button>
                )}
                {modelLoading && (
                  <button
                    disabled
                    className="px-4 py-2 bg-gray-400 text-white font-medium rounded-xl flex items-center gap-2"
                  >
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    加载中...
                  </button>
                )}
              </div>
            </div>
            {modelStatus.loading && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">加载进度</span>
                  <span className="text-sm font-medium text-purple-600">{(modelStatus.load_progress * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-pink-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${modelStatus.load_progress * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 缓存结果提示 */}
        {cachedResult && !transcription && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-3xl shadow-lg p-6 mb-8 border border-purple-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">上次分析结果</h3>
                  <p className="text-sm text-gray-500">
                    完成于 {cachedResult.completed_at ? new Date(cachedResult.completed_at).toLocaleString('zh-CN') : ''} · 
                    共 {cachedResult.sentence_count || 0} 句
                    {cachedResult.gpu_memory_peak_mb && ` · 显存峰值: ${cachedResult.gpu_memory_peak_mb.toFixed(0)} MB`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadFromCache}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-600 hover:to-pink-500 text-white font-medium rounded-xl transition-all duration-300"
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
                    {audioFile ? `${formatFileSize(audioFile.size)} · ${audioDuration.toFixed(1)}秒` : '支持 MP3, WAV, M4A 等格式，最大 5 分钟'}
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
              disabled={loading || !audioFile || audioDuration > 300}
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

        {transcription && (
          <div className="space-y-8 animate-fadeIn">
            {/* 来自缓存提示 */}
            {isFromCache && (
              <div className="bg-purple-50 rounded-2xl p-4 border border-purple-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-purple-700 font-medium">这是上次分析的结果（来自缓存）</span>
                </div>
                <button
                  onClick={clearCache}
                  className="text-sm text-purple-600 hover:text-red-500 transition-colors"
                >
                  清除缓存
                </button>
              </div>
            )}

            {/* 语音识别结果 */}
            <div className="bg-white rounded-3xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">语音识别结果</h2>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>置信度: <span className="font-semibold text-purple-600">{(confidence * 100).toFixed(1)}%</span></span>
                  <span>时长: <span className="font-semibold">{audioDuration.toFixed(1)}s</span></span>
                  <span>GPU: <span className="font-semibold text-green-600">{gpuMemory.peak_mb.toFixed(0)} MB</span></span>
                </div>
              </div>
              <p className="text-gray-700 bg-gradient-to-r from-gray-50 to-purple-50 p-5 rounded-2xl border border-gray-100 leading-relaxed">
                {transcription}
              </p>
            </div>

            {/* 整体情感统计 */}
            {overallSentiment && (
              <div className="bg-white rounded-3xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-400 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">整体情感分析</h2>
                    <p className="text-sm text-gray-500">共 {sentences.length} 句，加权计算整体情感</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-gradient-to-br from-gray-50 to-purple-50 rounded-2xl p-6 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-gray-600">整体情感</span>
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold ${getSentimentConfig(overallSentiment.sentiment).bg}`}>
                        <span className="text-lg">{getSentimentConfig(overallSentiment.sentiment).icon}</span>
                        {getSentimentConfig(overallSentiment.sentiment).text}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-500">置信度</span>
                        <span className="text-lg font-bold text-gray-900">{(overallSentiment.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-gradient-to-r from-purple-500 to-pink-400 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${overallSentiment.confidence * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-green-600">正面情感占比</span>
                        <span className="text-sm font-medium">{(overallSentiment.positive_ratio * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: `${overallSentiment.positive_ratio * 100}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-yellow-600">中性情感占比</span>
                        <span className="text-sm font-medium">{(overallSentiment.neutral_ratio * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-yellow-500 h-2 rounded-full" style={{ width: `${overallSentiment.neutral_ratio * 100}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-red-600">负面情感占比</span>
                        <span className="text-sm font-medium">{(overallSentiment.negative_ratio * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-red-500 h-2 rounded-full" style={{ width: `${overallSentiment.negative_ratio * 100}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 分句结果 */}
            {sentences.length > 0 && currentSentence && (
              <div className="bg-white rounded-3xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">分句分析结果</h2>
                      <p className="text-sm text-gray-500">第 {currentPage + 1} / {sentences.length} 句</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                      className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setCurrentPage(Math.min(sentences.length - 1, currentPage + 1))}
                      disabled={currentPage === sentences.length - 1}
                      className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-2xl p-4 mb-6 border border-gray-100">
                  <p className="text-gray-700 leading-relaxed">{currentSentence.text}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-5 border border-blue-100">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <h3 className="font-semibold text-gray-900">深度学习模型</h3>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm font-medium ${getSentimentConfig(currentSentence.model_result.sentiment).bg}`}>
                        <span>{getSentimentConfig(currentSentence.model_result.sentiment).icon}</span>
                        {getSentimentConfig(currentSentence.model_result.sentiment).text}
                      </div>
                      <span className="text-sm text-gray-500">置信度: {(currentSentence.model_result.confidence * 100).toFixed(1)}%</span>
                    </div>
                    {currentSentence.model_result.scores && (
                      <div className="text-xs text-gray-500 space-y-1">
                        <div className="flex justify-between"><span>正面</span><span>{(currentSentence.model_result.scores['正面'] * 100).toFixed(1)}%</span></div>
                        <div className="flex justify-between"><span>中性</span><span>{(currentSentence.model_result.scores['中性'] * 100).toFixed(1)}%</span></div>
                        <div className="flex justify-between"><span>负面</span><span>{(currentSentence.model_result.scores['负面'] * 100).toFixed(1)}%</span></div>
                      </div>
                    )}
                  </div>

                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-5 border border-purple-100">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-400 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <h3 className="font-semibold text-gray-900">情感词典</h3>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm font-medium ${getSentimentConfig(currentSentence.lexicon_result.sentiment).bg}`}>
                        <span>{getSentimentConfig(currentSentence.lexicon_result.sentiment).icon}</span>
                        {getSentimentConfig(currentSentence.lexicon_result.sentiment).text}
                      </div>
                      <span className="text-sm text-gray-500">得分: {currentSentence.lexicon_result.score.toFixed(2)}</span>
                    </div>
                    {currentSentence.lexicon_result.sentiment_words && currentSentence.lexicon_result.sentiment_words.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {currentSentence.lexicon_result.sentiment_words.slice(0, 5).map((word, idx) => (
                          <span key={idx} className={`px-2 py-0.5 rounded text-xs ${word.final_score > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {word.word}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioAnalysisPage;
