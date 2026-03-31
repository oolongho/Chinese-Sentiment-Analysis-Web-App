import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { API_ENDPOINTS } from '../config/api';
import AblationStudyTab from '../components/AblationStudyTab';
import EvaluationTab from '../components/EvaluationTab';
import ExternalApiTab from '../components/ExternalApiTab';
import DictionaryTab from '../components/DictionaryTab';
import QuantizationContent from '../components/QuantizationContent';
import {
  type TrainingParams,
  type TrainingStatus,
  type TrainingHistory,
  type CachedTrainingResult,
  type UploadedData
} from '../types/training';

const TrainingPage: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'training' | 'dictionary' | 'external' | 'evaluation' | 'ablation' | 'quantization'>('external');
  const [params, setParams] = useState<TrainingParams>({
    epochs: 3,
    batch_size: 16,
    learning_rate: 2e-5,
    max_length: 128,
    warmup_ratio: 0.1,
    weight_decay: 0.01
  });
  
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
  
  const [cachedTrainingResult, setCachedTrainingResult] = useState<CachedTrainingResult | null>(null);

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
        // 确保数据完整性
        if (data && Array.isArray(data.epochs)) {
          setTrainingHistory(data);
        }
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
        setLoginError('登录已过期，请重新输入密码');
        alert('登录已过期，请重新输入密码');
      }
    } catch {
      localStorage.removeItem('training_token');
      setLoginError('登录验证失败，请重新输入密码');
      alert('登录验证失败，请重新输入密码');
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
    loadUploadedData(authToken);
    loadTrainingStatus(authToken);
    loadCachedTrainingResult(authToken);
  };

  const loadCachedTrainingResult = async (authToken: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/cached-result`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.cached_result) {
          setCachedTrainingResult(data.cached_result);
          if (data.cached_result.history && Array.isArray(data.cached_result.history.epochs)) {
            setTrainingHistory(data.cached_result.history);
          }
        }
      }
    } catch (error) {
      console.error('加载训练缓存失败:', error);
    }
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
      } else if (response.status === 401) {
        // Token 过期
        localStorage.removeItem('training_token');
        setIsLoggedIn(false);
        setToken('');
        setLoginError('登录已过期，请重新输入密码');
        alert('登录已过期，请重新输入密码');
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
              <p className="text-gray-500">模型训练、情感词典、外部API、评估、消融实验、量化</p>
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
            <button
              onClick={() => setActiveTab('ablation')}
              className={`flex-1 py-4 px-6 font-semibold transition-all duration-300 ${
                activeTab === 'ablation'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-400 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                消融实验
              </div>
            </button>
            <button
              onClick={() => setActiveTab('quantization')}
              className={`flex-1 py-4 px-6 font-semibold transition-all duration-300 ${
                activeTab === 'quantization'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-400 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                量化实验
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
                    {trainingStatus.gpu_memory && (
                      <div className="mt-4 p-3 bg-white rounded-xl border border-purple-200">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                          <span className="text-sm font-medium text-gray-700">GPU 显存</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-600">当前: <span className="font-semibold text-purple-600">{trainingStatus.gpu_memory.current_mb.toFixed(0)} MB</span></span>
                          <span className="text-gray-600">峰值: <span className="font-semibold text-purple-600">{trainingStatus.gpu_memory.peak_mb.toFixed(0)} MB</span></span>
                        </div>
                      </div>
                    )}
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
                    {trainingStatus.gpu_memory && trainingStatus.gpu_memory.peak_mb > 0 && (
                      <div className="mt-4 p-3 bg-white rounded-xl border border-green-200">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                          <span className="text-sm text-gray-600">训练显存峰值: <span className="font-semibold text-green-600">{trainingStatus.gpu_memory.peak_mb.toFixed(0)} MB</span></span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {trainingStatus.status === 'idle' && cachedTrainingResult && (
                  <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl p-6 border border-blue-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900">上次训练结果</h4>
                          <p className="text-gray-500 text-sm">完成于 {new Date(cachedTrainingResult.completed_at).toLocaleString('zh-CN')}</p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await fetch(`${API_ENDPOINTS.training}/clear-cache`, {
                              method: 'POST',
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            setCachedTrainingResult(null);
                          } catch (error) {
                            console.error('清除缓存失败:', error);
                          }
                        }}
                        className="text-sm text-gray-500 hover:text-red-500 transition-colors"
                      >
                        清除缓存
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white rounded-xl p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">状态</div>
                        <div className={`text-sm font-semibold ${cachedTrainingResult.status === 'completed' ? 'text-green-600' : 'text-red-600'}`}>
                          {cachedTrainingResult.status === 'completed' ? '成功' : '失败'}
                        </div>
                      </div>
                      {cachedTrainingResult.metrics && (
                        <>
                          <div className="bg-white rounded-xl p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">最终 Loss</div>
                            <div className="text-sm font-semibold text-blue-600">
                              {cachedTrainingResult.metrics.train_loss?.toFixed(4) || '-'}
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">验证准确率</div>
                            <div className="text-sm font-semibold text-purple-600">
                              {cachedTrainingResult.metrics.eval_accuracy ? `${(cachedTrainingResult.metrics.eval_accuracy * 100).toFixed(1)}%` : '-'}
                            </div>
                          </div>
                        </>
                      )}
                      <div className="bg-white rounded-xl p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">显存峰值</div>
                        <div className="text-sm font-semibold text-green-600">
                          {cachedTrainingResult.gpu_memory_peak_mb ? `${cachedTrainingResult.gpu_memory_peak_mb.toFixed(0)} MB` : '-'}
                        </div>
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

                {(trainingStatus.status === 'training' || trainingStatus.status === 'completed') && trainingHistory?.epochs?.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-semibold text-gray-900">训练过程可视化</h4>
                      <button
                        onClick={async () => {
                          try {
                            const response = await fetch(`${API_ENDPOINTS.training}/export-training-data`, {
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            const data = await response.json();
                            
                            if (response.ok && data.success) {
                              const csvBlob = new Blob(['\ufeff' + data.csv_content], { type: 'text/csv;charset=utf-8' });
                              const csvUrl = URL.createObjectURL(csvBlob);
                              const csvLink = document.createElement('a');
                              csvLink.href = csvUrl;
                              csvLink.download = data.csv_filename;
                              csvLink.click();
                              URL.revokeObjectURL(csvUrl);
                              
                              const pngLink = document.createElement('a');
                              pngLink.href = `data:image/png;base64,${data.png_base64}`;
                              pngLink.download = data.png_filename;
                              pngLink.click();
                              
                              alert('训练数据导出成功！CSV文件和PNG图表已下载。');
                            } else {
                              alert(data.detail || '导出失败');
                            }
                          } catch (error) {
                            console.error('导出训练数据失败:', error);
                            alert('导出失败，请重试');
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-400 hover:from-green-600 hover:to-emerald-500 text-white font-medium rounded-xl transition-all duration-300 shadow-sm hover:shadow-md"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        导出训练数据
                      </button>
                    </div>
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

            {activeTab === 'dictionary' && <DictionaryTab token={token} />}

            {activeTab === 'external' && <ExternalApiTab token={token} />}

            {activeTab === 'ablation' && (
              <AblationStudyTab token={token} />
            )}

            {activeTab === 'evaluation' && <EvaluationTab />}

            {activeTab === 'quantization' && <QuantizationContent />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingPage;
