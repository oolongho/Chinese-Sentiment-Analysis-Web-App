import { useState, useCallback } from 'react';
import { API_ENDPOINTS } from '../config/api';
import { apiClient } from '../utils/api';
import type { ExternalApiConfig } from '../types/training';

export const useExternalApi = (token: string) => {
  const [config, setConfig] = useState<ExternalApiConfig>({
    text_enabled: false,
    text_api_key: '',
    text_base_url: '',
    text_model: '',
    audio_enabled: false,
    audio_api_key: '',
    audio_base_url: '',
    audio_model: ''
  });
  const [syncing, setSyncing] = useState(false);

  const loadExternalApiConfig = useCallback(async () => {
    const result = await apiClient.get<ExternalApiConfig>(
      `${API_ENDPOINTS.training}/external-api`,
      { showErrorMessage: false }
    );
    if (result.success && result.data) {
      setConfig(result.data);
    }
  }, []);

  const updateConfig = useCallback(async (newConfig: ExternalApiConfig) => {
    const result = await apiClient.post(
      `${API_ENDPOINTS.training}/external-api`,
      newConfig,
      { showErrorMessage: false }
    );

    if (result.success) {
      setConfig(newConfig);
      return { success: true, message: '外部API配置已保存！' };
    }
    return { success: false, message: result.detail || '保存失败' };
  }, []);

  const syncDictionary = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await apiClient.post<{ message?: string }>(
        `${API_ENDPOINTS.training}/dictionary/reload`,
        undefined,
        { showErrorMessage: false }
      );

      if (result.success && result.data) {
        return { success: true, message: result.data.message || '词典同步成功！' };
      }
      return { success: false, message: result.detail || '词典同步失败' };
    } finally {
      setSyncing(false);
    }
  }, []);

  return {
    config,
    syncing,
    setConfig,
    loadExternalApiConfig,
    updateConfig,
    syncDictionary
  };
};
