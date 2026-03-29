import { useState, useCallback } from 'react';
import { API_ENDPOINTS } from '../config/api';
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
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/external-api`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (error) {
      console.error('加载外部API配置失败:', error);
    }
  }, [token]);

  const updateConfig = useCallback(async (newConfig: ExternalApiConfig) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/external-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newConfig)
      });

      if (response.ok) {
        setConfig(newConfig);
        return { success: true, message: '外部API配置已保存！' };
      }
      return { success: false, message: '保存失败' };
    } catch (error) {
      console.error('更新外部API配置失败:', error);
      return { success: false, message: '保存失败，请重试' };
    }
  }, [token]);

  const syncDictionary = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/dictionary/reload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, message: data.message || '词典同步成功！' };
      } else {
        const error = await response.json();
        return { success: false, message: error.detail || '词典同步失败' };
      }
    } catch (error) {
      console.error('同步词典失败:', error);
      return { success: false, message: '词典同步失败，请重试' };
    } finally {
      setSyncing(false);
    }
  }, [token]);

  return {
    // State
    config,
    syncing,
    // Actions
    setConfig,
    loadExternalApiConfig,
    updateConfig,
    syncDictionary
  };
};
