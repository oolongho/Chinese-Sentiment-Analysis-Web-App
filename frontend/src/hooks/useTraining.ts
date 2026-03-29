import { useState, useRef, useCallback } from 'react';
import { API_ENDPOINTS } from '../config/api';
import type {
  TrainingParams,
  TrainingStatus,
  TrainingHistory,
  CachedTrainingResult,
  UploadedData
} from '../types/training';

export const useTraining = (token: string) => {
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
  const [cachedTrainingResult, setCachedTrainingResult] = useState<CachedTrainingResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollTrainingStatus = useCallback(async () => {
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
  }, [token]);

  const fetchTrainingHistory = useCallback(async () => {
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
  }, [token]);

  const loadUploadedData = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/uploaded-data`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUploadedData(data);
      }
    } catch (error) {
      console.error('加载上传数据信息失败:', error);
    }
  }, [token]);

  const loadTrainingStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTrainingStatus(data);
      }
    } catch (error) {
      console.error('加载训练状态失败:', error);
    }
  }, [token]);

  const loadCachedTrainingResult = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/cached-result`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.cached_result) {
          setCachedTrainingResult(data.cached_result);
          if (data.cached_result.history) {
            setTrainingHistory(data.cached_result.history);
          }
        }
      }
    } catch (error) {
      console.error('加载训练缓存失败:', error);
    }
  }, [token]);

  const handleFileUpload = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_ENDPOINTS.training}/upload-data`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        alert(`上传成功！共 ${data.count} 条数据`);
        loadUploadedData();
        return true;
      } else {
        alert(data.detail || '上传失败');
        return false;
      }
    } catch (error) {
      console.error('上传失败:', error);
      alert('上传失败，请重试');
      return false;
    }
  }, [token, loadUploadedData]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [handleFileUpload]);

  const startTraining = useCallback(async () => {
    if (!uploadedData.uploaded) {
      alert('请先上传训练数据');
      return false;
    }

    try {
      const response = await fetch(`${API_ENDPOINTS.training}/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();

      if (response.ok) {
        setTrainingStatus(prev => ({ ...prev, status: 'training', message: '训练已启动...' }));
        return true;
      } else {
        alert(data.detail || '启动训练失败');
        return false;
      }
    } catch (error) {
      console.error('启动训练失败:', error);
      alert('启动训练失败，请重试');
      return false;
    }
  }, [token, uploadedData.uploaded]);

  const cancelTraining = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        alert('训练已取消');
        return true;
      }
      return false;
    } catch (error) {
      console.error('取消训练失败:', error);
      return false;
    }
  }, [token]);

  const updateParams = useCallback(async (params: TrainingParams) => {
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
        return true;
      }
      return false;
    } catch (error) {
      console.error('更新参数失败:', error);
      return false;
    }
  }, [token]);

  const loadParams = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/params`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        return data as TrainingParams;
      }
    } catch (error) {
      console.error('加载参数失败:', error);
    }
    return null;
  }, [token]);

  return {
    // State
    uploadedData,
    trainingStatus,
    trainingHistory,
    isDragging,
    cachedTrainingResult,
    fileInputRef,
    statusPollingRef,
    // Actions
    setTrainingStatus,
    setIsDragging,
    pollTrainingStatus,
    fetchTrainingHistory,
    loadUploadedData,
    loadTrainingStatus,
    loadCachedTrainingResult,
    handleFileUpload,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    startTraining,
    cancelTraining,
    updateParams,
    loadParams
  };
};
