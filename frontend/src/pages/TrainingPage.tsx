import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { API_ENDPOINTS } from '../config/api';

interface DictionaryWord {
  word: string;
  score: number;
}

interface TrainingParams {
  epochs: number;
  batch_size: number;
  learning_rate: number;
  max_length: number;
  warmup_ratio: number;
  weight_decay: number;
}

interface DictionaryStats {
  positive_count: number;
  negative_count: number;
  degree_count: number;
  negation_count: number;
}

interface ExternalApiConfig {
  text_api_key: string;
  text_base_url: string;
  text_model: string;
  audio_api_key: string;
  audio_base_url: string;
  audio_model: string;
}

interface TrainingStatus {
  status: string;
  progress: number;
  current_epoch: number;
  total_epochs: number;
  metrics: Record<string, number>;
  message: string;
  error?: string;
}

interface TrainingHistory {
  epochs: number[];
  train_loss: (number | null)[];
  eval_loss: (number | null)[];
  accuracy: (number | null)[];
  f1: (number | null)[];
  learning_rate: (number | null)[];
}

interface UploadedData {
  uploaded: boolean;
  count: number;
  filepath?: string;
  columns?: string[];
  is_default?: boolean;
}

interface EvaluationStatus {
  running: boolean;
  progress: number;
  total: number;
  current_analyzer: string;
  error?: string;
}

interface EvaluationResult {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  total_samples: number;
  correct_predictions: number;
}

interface EvaluationResults {
  model?: EvaluationResult;
  lexicon?: EvaluationResult;
  external?: EvaluationResult;
}

type DictionaryType = 'positive' | 'negative' | 'degree' | 'negation';

const DICTIONARY_CONFIG: Record<DictionaryType, { name: string; color: string; bgClass: string; scoreRange: string; hasScore: boolean }> = {
  positive: { name: '正面词典', color: 'green', bgClass: 'from-green-500 to-emerald-400', scoreRange: '1-3', hasScore: true },
  negative: { name: '负面词典', color: 'red', bgClass: 'from-red-500 to-rose-400', scoreRange: '-3 到 -1', hasScore: true },
  degree: { name: '程度副词', color: 'blue', bgClass: 'from-blue-500 to-cyan-400', scoreRange: '0.1-3.0', hasScore: true },
  negation: { name: '否定词', color: 'purple', bgClass: 'from-purple-500 to-pink-400', scoreRange: '', hasScore: false }
};

const TrainingPage: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'training' | 'dictionary' | 'external' | 'evaluation'>('external');
  const [params, setParams] = useState<TrainingParams>({
    epochs: 3,
    batch_size: 16,
    learning_rate: 2e-5,
    max_length: 128,
    warmup_ratio: 0.1,
    weight_decay: 0.01
  });
  
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus>({
    running: false,
    progress: 0,
    total: 0,
    current_analyzer: ''
  });
  const [evaluationResults, setEvaluationResults] = useState<EvaluationResults | null>(null);
  const [evaluationDataInfo, setEvaluationDataInfo] = useState<{ total: number; label_distribution: Record<string, number> } | null>(null);
  const evaluationPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const [errorSamples, setErrorSamples] = useState<{
    model: Array<{ text: string; true_label: string; pred_label: string; confidence?: number }>;
    lexicon: Array<{ text: string; true_label: string; pred_label: string; score?: number }>;
  }>({ model: [], lexicon: [] });
  const [selectedErrorAnalyzer, setSelectedErrorAnalyzer] = useState<'model' | 'lexicon'>('model');
  
  const [dictionaryStats, setDictionaryStats] = useState<DictionaryStats>({
    positive_count: 0,
    negative_count: 0,
    degree_count: 0,
    negation_count: 0
  });
  
  const [dictionaryWords, setDictionaryWords] = useState<Record<DictionaryType, DictionaryWord[]>>({
    positive: [],
    negative: [],
    degree: [],
    negation: []
  });
  
  const [activeDictionary, setActiveDictionary] = useState<DictionaryType>('positive');
  const [newWord, setNewWord] = useState('');
  const [newScore, setNewScore] = useState(2);
  const [searchWord, setSearchWord] = useState('');
  
  const [externalApiConfig, setExternalApiConfig] = useState<ExternalApiConfig>({
    text_api_key: '',
    text_base_url: '',
    text_model: '',
    audio_api_key: '',
    audio_base_url: '',
    audio_model: ''
  });
  
  const [syncing, setSyncing] = useState(false);
  
  const [uploadedData, setUploadedData] = useState<UploadedData>({ uploaded: false, count: 0 });
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus>({
    status: 'idle',
    progress: 0,
    current_epoch: 0,
    total_epochs: 0,
    metrics: {},
    message: ''
  });
  const [trainingHistory, setTrainingHistory] = useState<TrainingHistory>({
    epochs: [],
    train_loss: [],
    eval_loss: [],
    accuracy: [],
    f1: [],
    learning_rate: []
  });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('training_token');
    if (savedToken) {
      verifyToken(savedToken);
    }
    return () => {
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (trainingStatus.status === 'training') {
      statusPollingRef.current = setInterval(() => {
        pollTrainingStatus();
      }, 2000);
    } else {
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
        statusPollingRef.current = null;
      }
    }
  }, [trainingStatus.status]);

  useEffect(() => {
    if (evaluationStatus.running) {
      evaluationPollingRef.current = setInterval(() => {
        pollEvaluationStatus();
      }, 1000);
    } else {
      if (evaluationPollingRef.current) {
        clearInterval(evaluationPollingRef.current);
        evaluationPollingRef.current = null;
      }
    }
    return () => {
      if (evaluationPollingRef.current) {
        clearInterval(evaluationPollingRef.current);
      }
    };
  }, [evaluationStatus.running]);

  const pollEvaluationStatus = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.evaluation}/status`);
      if (response.ok) {
        const data = await response.json();
        setEvaluationStatus({
          running: data.running,
          progress: data.progress,
          total: data.total,
          current_analyzer: data.current_analyzer,
          error: data.error
        });
        if (!data.running && data.progress === data.total && data.total > 0) {
          fetchEvaluationResults();
        }
      }
    } catch (error) {
      console.error('获取评估状态失败:', error);
    }
  };

  const fetchEvaluationResults = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.evaluation}/results`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setEvaluationResults({
            model: data.model,
            lexicon: data.lexicon,
            external: data.external
          });
          fetchErrorSamples();
        }
      }
    } catch (error) {
      console.error('获取评估结果失败:', error);
    }
  };

  const fetchErrorSamples = async () => {
    try {
      const [modelRes, lexiconRes] = await Promise.all([
        fetch(`${API_ENDPOINTS.evaluation}/error-samples?analyzer=model&limit=10`),
        fetch(`${API_ENDPOINTS.evaluation}/error-samples?analyzer=lexicon&limit=10`)
      ]);
      
      if (modelRes.ok && lexiconRes.ok) {
        const modelData = await modelRes.json();
        const lexiconData = await lexiconRes.json();
        
        setErrorSamples({
          model: modelData.samples || [],
          lexicon: lexiconData.samples || []
        });
      }
    } catch (error) {
      console.error('获取错误样本失败:', error);
    }
  };

  const handleEvaluationUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_ENDPOINTS.evaluation}/upload`, {
        method: 'POST',
        body: formData
      });
      if (response.ok) {
        const data = await response.json();
        setEvaluationDataInfo({
          total: data.total,
          label_distribution: data.label_distribution
        });
        alert(`上传成功！共 ${data.total} 条测试数据`);
      } else {
        const error = await response.json();
        alert(`上传失败: ${error.detail}`);
      }
    } catch (error) {
      alert('上传失败，请检查网络连接');
    }
  };

  const startEvaluation = async (includeExternal: boolean = false) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.evaluation}/run?include_external=${includeExternal}`, {
        method: 'POST'
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setEvaluationStatus({
            running: true,
            progress: 0,
            total: data.total,
            current_analyzer: ''
          });
        } else {
          alert(data.message);
        }
      }
    } catch (error) {
      alert('启动评估失败');
    }
  };

  const pollTrainingStatus = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTrainingStatus(data);
        if (data.status === 'training') {
          fetchTrainingHistory();
        }
      }
    } catch (error) {
      console.error('获取训练状态失败:', error);
    }
  };

  const fetchTrainingHistory = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTrainingHistory(data);
      }
    } catch (error) {
      console.error('获取训练历史失败:', error);
    }
  };

  const verifyToken = async (savedToken: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/verify`, {
        headers: { 'Authorization': `Bearer ${savedToken}` }
      });
      if (response.ok) {
        setToken(savedToken);
        setIsLoggedIn(true);
        loadData(savedToken);
      } else {
        localStorage.removeItem('training_token');
      }
    } catch {
      localStorage.removeItem('training_token');
    }
  };

  const handleLogin = async () => {
    if (!password.trim()) {
      setLoginError('请输入密码');
      return;
    }
    
    setLoading(true);
    setLoginError('');
    
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setToken(data.token);
        setIsLoggedIn(true);
        localStorage.setItem('training_token', data.token);
        loadData(data.token);
      } else {
        setLoginError(data.detail || '登录失败');
      }
    } catch {
      setLoginError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setToken('');
    localStorage.removeItem('training_token');
  };

  const loadData = async (authToken: string) => {
    loadParams(authToken);
    loadDictionaryStats(authToken);
    loadDictionary('positive', authToken);
    loadExternalApiConfig(authToken);
    loadUploadedData(authToken);
    loadTrainingStatus(authToken);
  };

  const loadParams = async (authToken: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/params`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setParams(data);
      }
    } catch (error) {
      console.error('加载参数失败:', error);
    }
  };

  const loadDictionaryStats = async (authToken: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/dictionary/stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDictionaryStats(data);
      }
    } catch (error) {
      console.error('加载词典统计失败:', error);
    }
  };

  const loadDictionary = async (type: DictionaryType, authToken: string = token) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/dictionary?type=${type}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDictionaryWords(prev => ({ ...prev, [type]: data.words }));
      }
    } catch (error) {
      console.error('加载词典失败:', error);
    }
  };

  const loadExternalApiConfig = async (authToken: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/external-api`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setExternalApiConfig(data);
      }
    } catch (error) {
      console.error('加载外部API配置失败:', error);
    }
  };

  const loadUploadedData = async (authToken: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/uploaded-data`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUploadedData(data);
      }
    } catch (error) {
      console.error('加载上传数据信息失败:', error);
    }
  };

  const loadTrainingStatus = async (authToken: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/status`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTrainingStatus(data);
      }
    } catch (error) {
      console.error('加载训练状态失败:', error);
    }
  };

  const updateParams = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/params`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(params)
      });
      
      if (response.ok) {
        alert('参数更新成功！');
      }
    } catch (error) {
      console.error('更新参数失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    setLoading(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/upload-data`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(`上传成功！共 ${data.count} 条数据`);
        loadUploadedData(token);
      } else {
        alert(data.detail || '上传失败');
      }
    } catch (error) {
      console.error('上传失败:', error);
      alert('上传失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const startTraining = async () => {
    if (!uploadedData.uploaded) {
      alert('请先上传训练数据');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setTrainingStatus(prev => ({ ...prev, status: 'training', message: '训练已启动...' }));
      } else {
        alert(data.detail || '启动训练失败');
      }
    } catch (error) {
      console.error('启动训练失败:', error);
      alert('启动训练失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const cancelTraining = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        alert('训练已取消');
      }
    } catch (error) {
      console.error('取消训练失败:', error);
    }
  };

  const addWord = async () => {
    if (!newWord.trim()) return;
    
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/dictionary/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: activeDictionary,
          word: newWord,
          score: newScore
        })
      });
      
      if (response.ok) {
        setNewWord('');
        setNewScore(activeDictionary === 'degree' ? 1.5 : activeDictionary === 'positive' ? 2 : -2);
        loadDictionary(activeDictionary);
        loadDictionaryStats(token);
      }
    } catch (error) {
      console.error('添加词汇失败:', error);
    }
  };

  const removeWord = async (word: string) => {
    if (!confirm(`确定要删除词汇 "${word}" 吗？`)) return;
    
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/dictionary/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: activeDictionary,
          word
        })
      });
      
      if (response.ok) {
        loadDictionary(activeDictionary);
        loadDictionaryStats(token);
      }
    } catch (error) {
      console.error('删除词汇失败:', error);
    }
  };

  const handleDictionaryChange = (type: DictionaryType) => {
    setActiveDictionary(type);
    loadDictionary(type);
    if (type === 'degree') {
      setNewScore(1.5);
    } else if (type === 'positive') {
      setNewScore(2);
    } else if (type === 'negative') {
      setNewScore(-2);
    }
  };

  const updateExternalApiConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/external-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(externalApiConfig)
      });
      
      if (response.ok) {
        alert('外部API配置已保存！');
        loadExternalApiConfig(token);
      }
    } catch (error) {
      console.error('更新外部API配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncDictionary = async () => {
    setSyncing(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/dictionary/reload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(data.message || '词典同步成功！');
      } else {
        const error = await response.json();
        alert(error.detail || '词典同步失败');
      }
    } catch (error) {
      console.error('同步词典失败:', error);
      alert('词典同步失败，请重试');
    } finally {
      setSyncing(false);
    }
  };

  const currentWords = dictionaryWords[activeDictionary];
  const currentConfig = DICTIONARY_CONFIG[activeDictionary];
  const filteredWords = currentWords.filter(w => 
    w.word.toLowerCase().includes(searchWord.toLowerCase())
  );

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-purple-50 flex items-center justify-center py-12 px-4">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-pink-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        
        <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md relative z-10 border border-gray-100">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">管理平台</h1>
            <p className="text-gray-500">管理员登录</p>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">管理员密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="请输入管理员密码"
                className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300 text-gray-700"
              />
            </div>
            
            {loginError && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {loginError}
              </div>
            )}
            
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-600 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  登录中...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  登录
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-purple-50 py-8 px-4">
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-400 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">管理平台</h1>
              <p className="text-gray-500">管理模型训练、情感词典和外部API</p>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-all duration-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            退出登录
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {(Object.keys(DICTIONARY_CONFIG) as DictionaryType[]).map(type => {
            const config = DICTIONARY_CONFIG[type];
            const count = dictionaryStats[`${type}_count` as keyof DictionaryStats];
            return (
              <div 
                key={type}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 cursor-pointer"
                onClick={() => { setActiveTab('dictionary'); handleDictionaryChange(type); }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 bg-gradient-to-br ${config.bgClass} rounded-xl flex items-center justify-center`}>
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{config.name}</p>
                    <p className="text-2xl font-bold text-gray-900">{count}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100 flex-wrap">
            <button
              onClick={() => setActiveTab('external')}
              className={`flex-1 py-4 px-6 font-semibold transition-all duration-300 ${
                activeTab === 'external'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-400 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
                外部API
              </div>
            </button>
            <button
              onClick={() => setActiveTab('dictionary')}
              className={`flex-1 py-4 px-6 font-semibold transition-all duration-300 ${
                activeTab === 'dictionary'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-400 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                词典管理
              </div>
            </button>
            <button
              onClick={() => setActiveTab('training')}
              className={`flex-1 py-4 px-6 font-semibold transition-all duration-300 ${
                activeTab === 'training'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-400 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                训练模型
              </div>
            </button>
            <button
              onClick={() => setActiveTab('evaluation')}
              className={`flex-1 py-4 px-6 font-semibold transition-all duration-300 ${
                activeTab === 'evaluation'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-400 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                模型评估
              </div>
            </button>
          </div>

          <div className="p-8">
            {activeTab === 'training' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-gray-900">本地模型训练</h3>
                <p className="text-gray-500 text-sm">训练本地深度学习模型（chinese-roberta-wwm-ext），训练完成后自动生效。</p>
                
                {trainingStatus.status === 'training' && (
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">训练中...</h4>
                        <p className="text-gray-600 text-sm">模型正在训练，请耐心等待，训练完成后会自动提示。</p>
                      </div>
                    </div>
                    <button
                      onClick={cancelTraining}
                      className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 font-medium rounded-xl transition-all duration-300"
                    >
                      取消训练
                    </button>
                  </div>
                )}

                {trainingStatus.status === 'completed' && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-100">
                    <div className="flex items-center gap-3">
                      <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">训练完成</h4>
                        <p className="text-gray-600 text-sm">模型已保存并自动加载，可以在分析页面使用新模型了。</p>
                      </div>
                    </div>
                  </div>
                )}

                {trainingStatus.status === 'failed' && (
                  <div className="bg-gradient-to-r from-red-50 to-rose-50 rounded-2xl p-6 border border-red-100">
                    <div className="flex items-center gap-3">
                      <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">训练失败</h4>
                        <p className="text-red-600 text-sm">{trainingStatus.error || trainingStatus.message}</p>
                      </div>
                    </div>
                  </div>
                )}

                {(trainingStatus.status === 'training' || trainingStatus.status === 'completed') && trainingHistory.epochs.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">训练过程可视化</h4>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Loss 曲线</h5>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart
                            data={trainingHistory.epochs.map((epoch, i) => ({
                              epoch: `Epoch ${epoch}`,
                              train_loss: trainingHistory.train_loss[i],
                              eval_loss: trainingHistory.eval_loss[i]
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="epoch" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="train_loss" stroke="#3b82f6" name="训练Loss" strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="eval_loss" stroke="#ef4444" name="验证Loss" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 mb-2">准确率 & F1 曲线</h5>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart
                            data={trainingHistory.epochs.map((epoch, i) => ({
                              epoch: `Epoch ${epoch}`,
                              accuracy: trainingHistory.accuracy[i] ? trainingHistory.accuracy[i] * 100 : null,
                              f1: trainingHistory.f1[i] ? trainingHistory.f1[i] * 100 : null
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="epoch" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <Tooltip formatter={(value) => value != null ? [`${Number(value).toFixed(1)}%`, ''] : ['-']} />
                            <Legend />
                            <Line type="monotone" dataKey="accuracy" stroke="#22c55e" name="准确率" strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="f1" stroke="#a855f7" name="F1值" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-gray-900">训练参数配置</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-gray-700 font-medium mb-2 text-sm">训练轮数</label>
                        <input
                          type="number"
                          value={params.epochs}
                          onChange={(e) => setParams({ ...params, epochs: parseInt(e.target.value) || 1 })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 font-medium mb-2 text-sm">批次大小</label>
                        <input
                          type="number"
                          value={params.batch_size}
                          onChange={(e) => setParams({ ...params, batch_size: parseInt(e.target.value) || 1 })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 font-medium mb-2 text-sm">学习率</label>
                        <input
                          type="text"
                          value={params.learning_rate}
                          onChange={(e) => setParams({ ...params, learning_rate: parseFloat(e.target.value) || 0 })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 font-medium mb-2 text-sm">最大序列长度</label>
                        <input
                          type="number"
                          value={params.max_length}
                          onChange={(e) => setParams({ ...params, max_length: parseInt(e.target.value) || 1 })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                        />
                      </div>
                    </div>
                    <button
                      onClick={updateParams}
                      disabled={loading}
                      className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-all duration-300"
                    >
                      保存参数
                    </button>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-gray-900">训练数据</h4>
                    <div
                      className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-300 cursor-pointer ${
                        isDragging ? 'border-purple-400 bg-purple-50' : 'border-gray-300 hover:border-purple-400'
                      }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".xlsx,.xls"
                        onChange={handleFileSelect}
                      />
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="text-gray-600 text-sm">点击或拖拽上传 Excel 文件</p>
                      <p className="text-xs text-gray-400 mt-1">支持 .xlsx, .xls 格式</p>
                    </div>
                    
                    {uploadedData.uploaded && (
                      <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                        <div className="flex items-center gap-2 text-green-700">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-medium">已准备 {uploadedData.count} 条数据</span>
                          {uploadedData.is_default && <span className="text-xs text-gray-500">(默认数据)</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-100">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    数据格式要求
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 text-gray-700">列名</th>
                          <th className="text-left py-2 px-3 text-gray-700">说明</th>
                          <th className="text-left py-2 px-3 text-gray-700">是否必需</th>
                          <th className="text-left py-2 px-3 text-gray-700">示例</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-100">
                          <td className="py-2 px-3 font-medium text-gray-900">文本</td>
                          <td className="py-2 px-3 text-gray-600">待分析的文本内容</td>
                          <td className="py-2 px-3"><span className="text-green-600 font-medium">必需</span></td>
                          <td className="py-2 px-3 text-gray-500">质量很好，物流很快</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-medium text-gray-900">标签</td>
                          <td className="py-2 px-3 text-gray-600">情感标签</td>
                          <td className="py-2 px-3"><span className="text-green-600 font-medium">必需</span></td>
                          <td className="py-2 px-3 text-gray-500">正面 / 负面 / 中性</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-center pt-4">
                  <button
                    onClick={startTraining}
                    disabled={loading || trainingStatus.status === 'training'}
                    className="px-12 py-4 bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-600 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                  >
                    {trainingStatus.status === 'training' ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        训练中...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        开始训练
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'dictionary' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <h3 className="text-xl font-bold text-gray-900">词典管理</h3>
                  <div className="flex gap-2 flex-wrap items-center">
                    {(Object.keys(DICTIONARY_CONFIG) as DictionaryType[]).map(type => {
                      const config = DICTIONARY_CONFIG[type];
                      return (
                        <button
                          key={type}
                          onClick={() => handleDictionaryChange(type)}
                          className={`px-4 py-2.5 rounded-xl font-medium transition-all duration-300 ${
                            activeDictionary === type
                              ? `bg-gradient-to-r ${config.bgClass} text-white shadow-lg`
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {config.name}
                        </button>
                      );
                    })}
                    <button
                      onClick={syncDictionary}
                      disabled={syncing}
                      className="px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-400 hover:from-green-600 hover:to-emerald-500 text-white font-medium rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center gap-2"
                    >
                      {syncing ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          同步中...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          保存并同步
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={searchWord}
                      onChange={(e) => setSearchWord(e.target.value)}
                      placeholder="搜索词汇..."
                      className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                    />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-gray-50 to-purple-50 rounded-2xl p-6 border border-gray-100">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">添加新词汇</h4>
                  <div className="flex gap-4 items-center">
                    <input
                      type="text"
                      value={newWord}
                      onChange={(e) => setNewWord(e.target.value)}
                      placeholder="输入词汇"
                      className="flex-1 border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                    />
                    {currentConfig.hasScore && (
                      <input
                        type="number"
                        step={activeDictionary === 'degree' ? 0.1 : 1}
                        value={newScore}
                        onChange={(e) => setNewScore(parseFloat(e.target.value) || 1)}
                        placeholder="权重"
                        className="w-28 border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                      />
                    )}
                    <button
                      onClick={addWord}
                      disabled={!newWord.trim()}
                      className={`px-6 py-4 font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed text-white bg-gradient-to-r ${currentConfig.bgClass}`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                  {currentConfig.hasScore && (
                    <p className="text-sm text-gray-500 mt-2">
                      权重范围: {currentConfig.scoreRange}
                    </p>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">词汇</th>
                          {currentConfig.hasScore && (
                            <th className="text-left py-3 px-4 font-semibold text-gray-700">权重</th>
                          )}
                          <th className="text-right py-3 px-4 font-semibold text-gray-700">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWords.map((item, index) => (
                          <tr key={index} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-4 text-gray-900 font-medium">{item.word}</td>
                            {currentConfig.hasScore && (
                              <td className="py-3 px-4">
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                  item.score > 0 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {item.score}
                                </span>
                              </td>
                            )}
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => removeWord(item.word)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredWords.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        暂无词汇数据
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'external' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">外部API配置</h3>
                <p className="text-gray-500 text-sm mb-6">配置外部AI平台的API，用于文本和音频分析。支持OpenAI格式的API。</p>
                
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-100 mb-6">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-1">说明</h4>
                      <p className="text-gray-600 text-sm">
                        外部API用于调用云端AI服务进行分析，无需本地训练。支持OpenAI、DeepSeek、通义千问等兼容OpenAI格式的API。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      文本分析API
                    </h4>
                    
                    <div>
                      <label className="block text-gray-700 font-medium mb-2">API Key</label>
                      <input
                        type="password"
                        value={externalApiConfig.text_api_key}
                        onChange={(e) => setExternalApiConfig({ ...externalApiConfig, text_api_key: e.target.value })}
                        placeholder="sk-..."
                        className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-gray-700 font-medium mb-2">Base URL</label>
                      <input
                        type="text"
                        value={externalApiConfig.text_base_url}
                        onChange={(e) => setExternalApiConfig({ ...externalApiConfig, text_base_url: e.target.value })}
                        placeholder="https://api.openai.com/v1"
                        className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-gray-700 font-medium mb-2">模型名称</label>
                      <input
                        type="text"
                        value={externalApiConfig.text_model}
                        onChange={(e) => setExternalApiConfig({ ...externalApiConfig, text_model: e.target.value })}
                        placeholder="gpt-4 / deepseek-chat / qwen-turbo"
                        className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-400 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      </div>
                      语音分析API
                    </h4>
                    
                    <div>
                      <label className="block text-gray-700 font-medium mb-2">API Key</label>
                      <input
                        type="password"
                        value={externalApiConfig.audio_api_key}
                        onChange={(e) => setExternalApiConfig({ ...externalApiConfig, audio_api_key: e.target.value })}
                        placeholder="sk-..."
                        className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-gray-700 font-medium mb-2">Base URL</label>
                      <input
                        type="text"
                        value={externalApiConfig.audio_base_url}
                        onChange={(e) => setExternalApiConfig({ ...externalApiConfig, audio_base_url: e.target.value })}
                        placeholder="https://api.openai.com/v1"
                        className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-gray-700 font-medium mb-2">模型名称</label>
                      <input
                        type="text"
                        value={externalApiConfig.audio_model}
                        onChange={(e) => setExternalApiConfig({ ...externalApiConfig, audio_model: e.target.value })}
                        placeholder="whisper-1"
                        className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={updateExternalApiConfig}
                    disabled={loading}
                    className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-600 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    保存配置
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'evaluation' && (
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
                          全部评估（包含外部API，会很久哦）
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {evaluationResults && (
                  <div className="bg-white rounded-2xl p-6 border border-gray-200">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">评估结果</h4>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {evaluationResults.model && (
                        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-5 border border-blue-100">
                          <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                              </svg>
                            </div>
                            深度学习模型
                          </h5>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-600">准确率</span><span className="font-semibold">{(evaluationResults.model.accuracy * 100).toFixed(1)}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">精确率</span><span className="font-semibold">{(evaluationResults.model.precision * 100).toFixed(1)}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">召回率</span><span className="font-semibold">{(evaluationResults.model.recall * 100).toFixed(1)}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">F1分数</span><span className="font-semibold">{(evaluationResults.model.f1_score * 100).toFixed(1)}%</span></div>
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
                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border border-purple-100">
                          <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-400 rounded-lg flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                              </svg>
                            </div>
                            情感词典
                          </h5>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-600">准确率</span><span className="font-semibold">{(evaluationResults.lexicon.accuracy * 100).toFixed(1)}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">精确率</span><span className="font-semibold">{(evaluationResults.lexicon.precision * 100).toFixed(1)}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">召回率</span><span className="font-semibold">{(evaluationResults.lexicon.recall * 100).toFixed(1)}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">F1分数</span><span className="font-semibold">{(evaluationResults.lexicon.f1_score * 100).toFixed(1)}%</span></div>
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
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-100">
                          <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-400 rounded-lg flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                              </svg>
                            </div>
                            外部API
                          </h5>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-600">准确率</span><span className="font-semibold">{(evaluationResults.external.accuracy * 100).toFixed(1)}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">精确率</span><span className="font-semibold">{(evaluationResults.external.precision * 100).toFixed(1)}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">召回率</span><span className="font-semibold">{(evaluationResults.external.recall * 100).toFixed(1)}%</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">F1分数</span><span className="font-semibold">{(evaluationResults.external.f1_score * 100).toFixed(1)}%</span></div>
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

                    {(errorSamples.model.length > 0 || errorSamples.lexicon.length > 0) && (
                      <div className="mt-6 bg-white rounded-2xl p-6 border border-gray-200">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4">错误样本分析</h4>
                        <div className="flex gap-2 mb-4">
                          <button
                            onClick={() => setSelectedErrorAnalyzer('model')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              selectedErrorAnalyzer === 'model'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            深度学习模型 ({errorSamples.model.length})
                          </button>
                          <button
                            onClick={() => setSelectedErrorAnalyzer('lexicon')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              selectedErrorAnalyzer === 'lexicon'
                                ? 'bg-purple-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            情感词典 ({errorSamples.lexicon.length})
                          </button>
                        </div>
                        <div className="space-y-3 max-h-80 overflow-y-auto">
                          {errorSamples[selectedErrorAnalyzer].map((sample, index) => (
                            <div key={index} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                              <p className="text-gray-800 text-sm mb-2">{sample.text}</p>
                              <div className="flex items-center gap-4 text-xs">
                                <span className="text-green-600">实际: {sample.true_label}</span>
                                <span className="text-red-500">预测: {sample.pred_label}</span>
                                {'confidence' in sample && sample.confidence !== undefined && (
                                  <span className="text-gray-400">置信度: {(sample.confidence * 100).toFixed(1)}%</span>
                                )}
                                {'score' in sample && sample.score !== undefined && (
                                  <span className="text-gray-400">得分: {sample.score.toFixed(2)}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingPage;
