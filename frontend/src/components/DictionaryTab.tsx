import React, { useState, useEffect, useMemo } from 'react';
import { useDictionary } from '../hooks/useDictionary';
import { DICTIONARY_CONFIG, type DictionaryType } from '../types/training';
import { API_ENDPOINTS } from '../config/api';
import { dictionaryStatsCache } from '../utils/cache';
import { apiClient } from '../utils/api';

interface DictionaryStats {
  positive_count: number;
  negative_count: number;
  degree_count: number;
  negation_count: number;
  enhanced_positive_count?: number;   // 新增
  enhanced_negative_count?: number;   // 新增
  enhanced_enabled?: boolean;         // 新增
}

interface DictionaryTabProps {
  token: string;
}

const DictionaryTab: React.FC<DictionaryTabProps> = ({ token }) => {
  const {
    dictionaryWords,
    activeDictionary,
    loadDictionary,
    addWord,
    removeWord,
    syncDictionary,
    handleDictionaryChange
  } = useDictionary(token);

  const [searchWord, setSearchWord] = useState('');
  const [newWord, setNewWord] = useState('');
  const [newScore, setNewScore] = useState(2);
  const [syncing, setSyncing] = useState(false);
  const [dictionaryStats, setDictionaryStats] = useState<DictionaryStats | null>(() => {
    // 使用带过期时间的缓存
    return dictionaryStatsCache.getCache();
  });

  const currentConfig = DICTIONARY_CONFIG[activeDictionary];
  const currentWords = dictionaryWords[activeDictionary];

  const filteredWords = useMemo(() => {
    return currentWords.filter(w => 
      w.word.toLowerCase().includes(searchWord.toLowerCase())
    );
  }, [currentWords, searchWord]);

  useEffect(() => {
    loadDictionary(activeDictionary);
  }, [activeDictionary, loadDictionary]);

  useEffect(() => {
    const fetchDictionaryStats = async () => {
      const result = await apiClient.get<DictionaryStats>(
        `${API_ENDPOINTS.training}/dictionary/stats`,
        { showErrorMessage: false }
      );
      if (result.success && result.data) {
        setDictionaryStats(result.data);
        dictionaryStatsCache.setCache(result.data);
      }
    };
    fetchDictionaryStats();
  }, []);

  useEffect(() => {
    // 根据词典类型设置默认分数
    if (activeDictionary === 'degree') {
      setNewScore(1.5);
    } else if (activeDictionary === 'positive') {
      setNewScore(2);
    } else if (activeDictionary === 'negative') {
      setNewScore(-2);
    } else {
      setNewScore(0);
    }
  }, [activeDictionary]);

  const handleAddWord = async () => {
    const success = await addWord(activeDictionary, newWord, newScore);
    if (success) {
      setNewWord('');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    const result = await syncDictionary();
    alert(result.message);
    setSyncing(false);
  };

  return (
    <div className="space-y-6">
      {/* 词典统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-100 hover:shadow-lg transition-all duration-300">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-400 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-600">正面词典</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{dictionaryStats?.positive_count || 0}</div>
          {(dictionaryStats?.enhanced_enabled && (dictionaryStats?.enhanced_positive_count || 0) > 0) && (
            <div className="text-xs text-green-600 font-medium">
              +{dictionaryStats.enhanced_positive_count} 增强 · 共 {((dictionaryStats?.positive_count || 0) + (dictionaryStats?.enhanced_positive_count || 0))} 词
            </div>
          )}
        </div>
        <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-5 border border-red-100 hover:shadow-lg transition-all duration-300">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-rose-400 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.593a4 4 0 115.656 5.656m-5.656-5.656L15 15" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-600">负面词典</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{dictionaryStats?.negative_count || 0}</div>
          {(dictionaryStats?.enhanced_enabled && (dictionaryStats?.enhanced_negative_count || 0) > 0) && (
            <div className="text-xs text-red-600 font-medium">
              +{dictionaryStats.enhanced_negative_count} 增强 · 共 {((dictionaryStats?.negative_count || 0) + (dictionaryStats?.enhanced_negative_count || 0))} 词
            </div>
          )}
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-5 border border-blue-100 hover:shadow-lg transition-all duration-300">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-600">程度副词</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{dictionaryStats?.degree_count || 0}</div>
        </div>
        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-2xl p-5 border border-yellow-100 hover:shadow-lg transition-all duration-300">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-amber-400 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-600">否定词</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{dictionaryStats?.negation_count || 0}</div>
        </div>
      </div>

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
            onClick={handleSync}
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
            onClick={handleAddWord}
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
                      onClick={() => removeWord(activeDictionary, item.word)}
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
  );
};

export default DictionaryTab;
