import { useState, useRef, useCallback } from 'react';
import { API_ENDPOINTS } from '../config/api';
import { apiClient } from '../utils/api';
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
    const result = await apiClient.get<TrainingStatus>(
      `${API_ENDPOINTS.training}/status`,
      { showErrorMessage: false }
    );
    if (result.success && result.data) {
      setTrainingStatus(result.data);
      if (result.data.status === 'training') {
        fetchTrainingHistory();
      }
    }
  }, []);

  const fetchTrainingHistory = useCallback(async () => {
    const result = await apiClient.get<TrainingHistory>(
      `${API_ENDPOINTS.training}/history`,
      { showErrorMessage: false }
    );
    if (result.success && result.data) {
      setTrainingHistory(result.data);
    }
  }, []);

  const loadUploadedData = useCallback(async () => {
    const result = await apiClient.get<UploadedData>(
      `${API_ENDPOINTS.training}/uploaded-data`,
      { showErrorMessage: false }
    );
    if (result.success && result.data) {
      setUploadedData(result.data);
    }
  }, []);

  const loadTrainingStatus = useCallback(async () => {
    const result = await apiClient.get<TrainingStatus>(
      `${API_ENDPOINTS.training}/status`,
      { showErrorMessage: false }
    );
    if (result.success && result.data) {
      setTrainingStatus(result.data);
    }
  }, []);

  const loadCachedTrainingResult = useCallback(async () => {
    const result = await apiClient.get<{ success: boolean; cached_result?: CachedTrainingResult }>(
      `${API_ENDPOINTS.training}/cached-result`,
      { showErrorMessage: false }
    );
    if (result.success && result.data?.cached_result) {
      setCachedTrainingResult(result.data.cached_result);
      if (result.data.cached_result.history) {
        setTrainingHistory(result.data.cached_result.history);
      }
    }
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    const result = await apiClient.uploadFile<{ count?: number; detail?: string }>(
      `${API_ENDPOINTS.training}/upload-data`,
      file,
      { showErrorMessage: false }
    );

    if (result.success && result.data) {
      alert(`上传成功！共 ${result.data.count} 条数据`);
      loadUploadedData();
      return true;
    } else {
      alert(result.detail || '上传失败');
      return false;
    }
  }, [loadUploadedData]);

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

    const result = await apiClient.post<{ detail?: string }>(
      `${API_ENDPOINTS.training}/start`,
      undefined,
      { showErrorMessage: false }
    );

    if (result.success) {
      setTrainingStatus(prev => ({ ...prev, status: 'training', message: '训练已启动...' }));
      return true;
    } else {
      alert(result.detail || '启动训练失败');
      return false;
    }
  }, [uploadedData.uploaded]);

  const cancelTraining = useCallback(async () => {
    const result = await apiClient.post(
      `${API_ENDPOINTS.training}/cancel`,
      undefined,
      { showErrorMessage: false }
    );

    if (result.success) {
      alert('训练已取消');
      return true;
    }
    return false;
  }, []);

  const updateParams = useCallback(async (params: TrainingParams) => {
    const result = await apiClient.post(
      `${API_ENDPOINTS.training}/params`,
      params,
      { showErrorMessage: false }
    );

    if (result.success) {
      alert('参数更新成功！');
      return true;
    }
    return false;
  }, []);

  const loadParams = useCallback(async () => {
    const result = await apiClient.get<TrainingParams>(
      `${API_ENDPOINTS.training}/params`,
      { showErrorMessage: false }
    );
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  }, []);

  return {
    uploadedData,
    trainingStatus,
    trainingHistory,
    isDragging,
    cachedTrainingResult,
    fileInputRef,
    statusPollingRef,
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
