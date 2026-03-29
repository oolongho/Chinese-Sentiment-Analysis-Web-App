import { useState, useCallback } from 'react';
import { API_ENDPOINTS } from '../config/api';
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
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/dictionary/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDictionaryStats(data);
      }
    } catch (error) {
      console.error('加载词典统计失败:', error);
    }
  }, [token]);

  const loadDictionary = useCallback(async (type: DictionaryType) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/dictionary?type=${type}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDictionaryWords(prev => ({ ...prev, [type]: data.words }));
      }
    } catch (error) {
      console.error('加载词典失败:', error);
    }
  }, [token]);

  const addWord = useCallback(async (type: DictionaryType, word: string, score: number) => {
    if (!word.trim()) return false;

    try {
      const response = await fetch(`${API_ENDPOINTS.training}/dictionary/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type,
          word,
          score
        })
      });

      if (response.ok) {
        loadDictionary(type);
        loadDictionaryStats();
        return true;
      }
      return false;
    } catch (error) {
      console.error('添加词汇失败:', error);
      return false;
    }
  }, [token, loadDictionary, loadDictionaryStats]);

  const removeWord = useCallback(async (type: DictionaryType, word: string) => {
    if (!confirm(`确定要删除词汇 "${word}" 吗？`)) return false;

    try {
      const response = await fetch(`${API_ENDPOINTS.training}/dictionary/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type,
          word
        })
      });

      if (response.ok) {
        loadDictionary(type);
        loadDictionaryStats();
        return true;
      }
      return false;
    } catch (error) {
      console.error('删除词汇失败:', error);
      return false;
    }
  }, [token, loadDictionary, loadDictionaryStats]);

  const syncDictionary = useCallback(async () => {
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
    }
  }, [token]);

  const handleDictionaryChange = useCallback((type: DictionaryType) => {
    setActiveDictionary(type);
    loadDictionary(type);
  }, [loadDictionary]);

  return {
    // State
    dictionaryStats,
    dictionaryWords,
    activeDictionary,
    // Actions
    setActiveDictionary,
    loadDictionaryStats,
    loadDictionary,
    addWord,
    removeWord,
    syncDictionary,
    handleDictionaryChange
  };
};
