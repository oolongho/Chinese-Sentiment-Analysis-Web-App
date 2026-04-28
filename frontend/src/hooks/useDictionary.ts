import { useState, useCallback } from 'react';
import { API_ENDPOINTS } from '../config/api';
import { apiClient } from '../utils/api';
import type {
  DictionaryWord,
  DictionaryStats,
  DictionaryType
} from '../types/training';

export const useDictionary = (token: string) => {
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

  const loadDictionaryStats = useCallback(async () => {
    const result = await apiClient.get<DictionaryStats>(
      `${API_ENDPOINTS.training}/dictionary/stats`,
      { showErrorMessage: false }
    );
    if (result.success && result.data) {
      setDictionaryStats(result.data);
    }
  }, []);

  const loadDictionary = useCallback(async (type: DictionaryType) => {
    const result = await apiClient.get<{ words: DictionaryWord[] }>(
      `${API_ENDPOINTS.training}/dictionary?type=${type}`,
      { showErrorMessage: false }
    );
    if (result.success && result.data) {
      setDictionaryWords(prev => ({ ...prev, [type]: result.data!.words }));
    }
  }, []);

  const addWord = useCallback(async (type: DictionaryType, word: string, score: number) => {
    if (!word.trim()) return false;

    const result = await apiClient.post(
      `${API_ENDPOINTS.training}/dictionary/add`,
      { type, word, score },
      { showErrorMessage: false }
    );

    if (result.success) {
      loadDictionary(type);
      loadDictionaryStats();
      return true;
    }
    return false;
  }, [loadDictionary, loadDictionaryStats]);

  const removeWord = useCallback(async (type: DictionaryType, word: string) => {
    if (!confirm(`确定要删除词汇 "${word}" 吗？`)) return false;

    const result = await apiClient.post(
      `${API_ENDPOINTS.training}/dictionary/remove`,
      { type, word },
      { showErrorMessage: false }
    );

    if (result.success) {
      loadDictionary(type);
      loadDictionaryStats();
      return true;
    }
    return false;
  }, [loadDictionary, loadDictionaryStats]);

  const syncDictionary = useCallback(async () => {
    const result = await apiClient.post<{ message?: string }>(
      `${API_ENDPOINTS.training}/dictionary/reload`,
      undefined,
      { showErrorMessage: false }
    );

    if (result.success && result.data) {
      return { success: true, message: result.data.message || '词典同步成功！' };
    }
    return { success: false, message: result.detail || '词典同步失败' };
  }, []);

  const handleDictionaryChange = useCallback((type: DictionaryType) => {
    setActiveDictionary(type);
    loadDictionary(type);
  }, [loadDictionary]);

  return {
    dictionaryStats,
    dictionaryWords,
    activeDictionary,
    setActiveDictionary,
    loadDictionaryStats,
    loadDictionary,
    addWord,
    removeWord,
    syncDictionary,
    handleDictionaryChange
  };
};
