import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_ENDPOINTS } from '../config/api';
import { apiClient } from '../utils/api';

interface DictionaryReviewTabProps {
  token: string;
}

interface Candidate {
  word: string;
  polarity: string;
  score: number;
  frequency: number;
  extraction_count: number;
  status: string;
  contexts?: string[];
}

interface ExtractionConfig {
  model_type: 'FP32' | 'FP16';
  min_word_freq: number;
  max_candidates: number;
  top_k_per_sample: number;
  polarity_threshold_pos: number;
  polarity_threshold_neg: number;
}

interface ExtractionResult {
  total_candidates: number;
  new_candidates: number;
  positive_count: number;
  negative_count: number;
}

interface CandidatesResponse {
  total: number;
  items: Candidate[];
  statistics: {
    total_pending: number;
    total_approved: number;
    total_rejected: number;
    completion_rate: number;
    total_extractions: number;
  };
}

interface DatasetInfo {
  path: string;
  samples: number;
  filename?: string;
  sample_count?: number;
  label_distribution?: { [key: string]: number };
}

interface EnhancedStatus {
  enhanced_enabled: boolean;
  original_count: number;
  enhanced_count: number;
  total_count: number;
}

const PAGE_SIZE = 20;

const DictionaryReviewTab: React.FC<DictionaryReviewTabProps> = ({ token }) => {
  const [extractionConfig, setExtractionConfig] = useState<ExtractionConfig>({
    model_type: 'FP32',
    min_word_freq: 5,
    max_candidates: 500,
    top_k_per_sample: 10,
    polarity_threshold_pos: 0.7,
    polarity_threshold_neg: 0.3,
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [extractionStatus, setExtractionStatus] = useState('');
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [selectAllPage, setSelectAllPage] = useState(false);

  const [filterStatus, setFilterStatus] = useState('pending_review');
  const [filterPolarity, setFilterPolarity] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [statistics, setStatistics] = useState<CandidatesResponse['statistics'] | null>(null);

  const [datasetInfo, setDatasetInfo] = useState<DatasetInfo | null>(null);

  const [isDraggingDataset, setIsDraggingDataset] = useState(false);
  const datasetFileInputRef = useRef<HTMLInputElement>(null);

  const [enhancedEnabled, setEnhancedEnabled] = useState(false);
  const [enhancedStatus, setEnhancedStatus] = useState<EnhancedStatus | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  const [isToggling, setIsToggling] = useState(false);

  const handleDatasetSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadDataset(file);
  };

  const handleDatasetDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingDataset(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      await uploadDataset(file);
    }
  };

  const uploadDataset = async (file: File) => {
    const result = await apiClient.uploadFile(`${API_ENDPOINTS.dictionary}/upload-dataset`, file);
    if (result.success && result.data) {
      setDatasetInfo({
        path: result.data.filepath,
        samples: result.data.sample_count,
        filename: file.name,
        sample_count: result.data.sample_count,
        label_distribution: result.data.label_distribution,
      });
    }
  };

  const handleToggleEnhanced = async () => {
    if (isToggling || toggleLoading) return;

    const newState = !enhancedEnabled;

    setEnhancedEnabled(newState);
    setIsToggling(true);
    setToggleLoading(true);

    const result = await apiClient.post(`${API_ENDPOINTS.dictionary}/toggle-enhanced`, { enabled: newState }, { showErrorMessage: false });

    if (result.success && result.data) {
      setEnhancedStatus({
        ...result.data,
        enhanced_enabled: newState
      });
    } else {
      setEnhancedEnabled(!newState);
    }

    setToggleLoading(false);
    setTimeout(() => setIsToggling(false), 300);
  };

  const loadCandidates = useCallback(async () => {
    const params = new URLSearchParams({
      status: filterStatus,
      limit: String(PAGE_SIZE),
      offset: String((currentPage - 1) * PAGE_SIZE),
      sort_by: 'extraction_count'
    });

    if (filterPolarity !== 'all') {
      params.append('polarity', filterPolarity);
    }

    const result = await apiClient.get<CandidatesResponse>(`${API_ENDPOINTS.dictionary}/candidates?${params}`, { showErrorMessage: false });
    if (result.success && result.data) {
      setCandidates(result.data.items);
      setTotalItems(result.data.total);
      setStatistics(result.data.statistics);
    }
  }, [filterStatus, filterPolarity, currentPage]);

  useEffect(() => {
    let mounted = true;

    loadCandidates();

    apiClient.get<EnhancedStatus>(`${API_ENDPOINTS.dictionary}/enhanced-status`, { showErrorMessage: false })
      .then(result => {
        if (mounted && result.success && result.data) {
          setEnhancedEnabled(result.data.enhanced_enabled);
          setEnhancedStatus(result.data);
        }
      });

    apiClient.get<DatasetInfo>(`${API_ENDPOINTS.dictionary}/dataset-info`, { showErrorMessage: false })
      .then(result => {
        if (mounted && result.success && result.data && result.data.filepath) {
          setDatasetInfo(result.data);
        }
      });

    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedCandidates(new Set());
    setSelectAllPage(false);
  }, [filterStatus, filterPolarity, searchKeyword]);

  const startGradientExtraction = async () => {
    if (isExtracting) return;
    setIsExtracting(true);
    setExtractionProgress(0);
    setExtractionStatus('正在初始化模型...');
    setExtractionResult(null);

    try {
      const authToken = localStorage.getItem('training_token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const response = await fetch(`${API_ENDPOINTS.dictionary}/gradient-extract`, {
        method: 'POST',
        headers,
        body: JSON.stringify(extractionConfig)
      });

      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => ({ detail: '请求失败' }));
        setExtractionStatus(`提取失败: ${error.detail || '未知错误'}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ') && line.trim() !== '') continue;
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'progress') {
              setExtractionProgress(event.progress);
              setExtractionStatus(event.message);
            } else if (event.type === 'complete') {
              setExtractionProgress(100);
              setExtractionResult({
                total_candidates: event.total_candidates || 0,
                new_candidates: event.new_candidates || 0,
                positive_count: event.positive_count || 0,
                negative_count: event.negative_count || 0,
              });
              setExtractionStatus('提取完成！');
              loadCandidates();
            } else if (event.type === 'error') {
              setExtractionStatus(`提取失败: ${event.detail || '未知错误'}`);
            }
          } catch {
          }
        }
      }
    } catch (error: any) {
      console.error('梯度提取失败:', error);
      if (error.name === 'AbortError' || error.message?.includes('abort')) {
        setExtractionStatus('提取被中断，请重试');
      } else {
        setExtractionStatus('提取失败，请重试');
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleApprove = async () => {
    if (selectedCandidates.size === 0) return;

    const result = await apiClient.post(`${API_ENDPOINTS.dictionary}/approve`, { words: Array.from(selectedCandidates) });
    if (result.success && result.data) {
      alert(result.data.message || `已通过 ${result.data.approved_count} 个词`);
      setSelectedCandidates(new Set());
      setSelectAllPage(false);
      loadCandidates();
    }
  };

  const handleReject = async () => {
    if (selectedCandidates.size === 0) return;

    const result = await apiClient.post(`${API_ENDPOINTS.dictionary}/reject`, { words: Array.from(selectedCandidates) });
    if (result.success && result.data) {
      alert(result.data.message || `已拒绝 ${result.data.rejected_count} 个词`);
      setSelectedCandidates(new Set());
      setSelectAllPage(false);
      loadCandidates();
    }
  };

  const toggleCandidateSelection = (word: string) => {
    const newSelected = new Set(selectedCandidates);
    if (newSelected.has(word)) {
      newSelected.delete(word);
    } else {
      newSelected.add(word);
    }
    setSelectedCandidates(newSelected);
  };

  const toggleSelectAllPage = () => {
    if (selectAllPage) {
      setSelectedCandidates(new Set());
      setSelectAllPage(false);
    } else {
      const pageWords = candidates.map(c => c.word);
      setSelectedCandidates(new Set([...selectedCandidates, ...pageWords]));
      setSelectAllPage(true);
    }
  };

  const totalPages = Math.ceil(totalItems / 20);

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-gray-900 mb-2">混合推理</h3>
      <p className="text-gray-500 text-sm mb-6">基于梯度显著性的领域词提取，并通过人工审核构建增强词典。</p>

      {/* 增强词典开关 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${enhancedEnabled ? 'bg-green-100' : 'bg-gray-100'}`}>
            <svg className={`w-5 h-5 ${enhancedEnabled ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h5 className="font-semibold text-gray-900 text-sm">增强词典</h5>
            <p className="text-xs text-gray-500">
              {enhancedEnabled
                ? `已启用 · 原版 ${enhancedStatus?.original_count || 0} 词 + 增强 ${enhancedStatus?.enhanced_count || 0} 词 = 共 ${enhancedStatus?.total_count || 0} 词`
                : '未启用 · 仅使用原版词典'
              }
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleEnhanced}
          disabled={toggleLoading}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 cursor-pointer ${
            enhancedEnabled ? 'bg-green-500' : 'bg-gray-300'
          } ${toggleLoading ? 'opacity-50' : ''}`}
        >
          {toggleLoading ? (
            <svg className="animate-spin h-4 w-4 text-white absolute left-1" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${
                enhancedEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          )}
        </button>
      </div>

      {/* 梯度提取区域 */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200">
        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          梯度提取
        </h4>

        <div className="grid md:grid-cols-[1fr_280px] gap-6">
          {/* 左侧：参数配置 - 三行两列 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-medium mb-1 text-sm">模型类型</label>
              <select
                value={extractionConfig.model_type}
                onChange={(e) => setExtractionConfig({ ...extractionConfig, model_type: e.target.value as 'FP32' | 'FP16' })}
                className="w-full border-2 border-gray-200 rounded-xl p-2 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
              >
                <option value="FP32">FP32 模型</option>
                <option value="FP16">FP16 模型</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1 text-sm">最小词频 (min_word_freq)</label>
              <input
                type="number"
                value={extractionConfig.min_word_freq}
                onChange={(e) => setExtractionConfig({ ...extractionConfig, min_word_freq: parseInt(e.target.value) || 5 })}
                className="w-full border-2 border-gray-200 rounded-xl p-2 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1 text-sm">最大候选词数 (max_candidates)</label>
              <input
                type="number"
                value={extractionConfig.max_candidates}
                onChange={(e) => setExtractionConfig({ ...extractionConfig, max_candidates: parseInt(e.target.value) || 500 })}
                className="w-full border-2 border-gray-200 rounded-xl p-2 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1 text-sm">每样本 Top-K (top_k_per_sample)</label>
              <input
                type="number"
                value={extractionConfig.top_k_per_sample}
                onChange={(e) => setExtractionConfig({ ...extractionConfig, top_k_per_sample: parseInt(e.target.value) || 10 })}
                className="w-full border-2 border-gray-200 rounded-xl p-2 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1 text-sm">正面极性阈值 (polarity_threshold_pos)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={extractionConfig.polarity_threshold_pos}
                onChange={(e) => setExtractionConfig({ ...extractionConfig, polarity_threshold_pos: parseFloat(e.target.value) || 0.7 })}
                className="w-full border-2 border-gray-200 rounded-xl p-2 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1 text-sm">负面极性阈值 (polarity_threshold_neg)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={extractionConfig.polarity_threshold_neg}
                onChange={(e) => setExtractionConfig({ ...extractionConfig, polarity_threshold_neg: parseFloat(e.target.value) || 0.3 })}
                className="w-full border-2 border-gray-200 rounded-xl p-2 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
              />
            </div>
          </div>

          {/* 右侧：数据集上传 */}
          <div>
            <label className="block text-gray-700 font-medium mb-2 text-sm">梯度提取数据集</label>
            <div
              className={`border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all duration-300 ${
                isDraggingDataset ? 'border-purple-400 bg-purple-50' : ''
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingDataset(true); }}
              onDragLeave={() => setIsDraggingDataset(false)}
              onDrop={handleDatasetDrop}
              onClick={() => datasetFileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={datasetFileInputRef}
                className="hidden"
                accept=".xlsx,.xls"
                onChange={handleDatasetSelect}
              />
              <svg className="w-10 h-10 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {datasetInfo ? (
                <div className="p-3 bg-green-50 rounded-xl border border-green-200">
                  <p className="text-green-700 font-medium text-sm">已上传 {datasetInfo.sample_count} 条数据</p>
                  <div className="flex gap-3 mt-1 text-xs text-green-600 justify-center">
                    <span>正面：{datasetInfo.label_distribution?.正面 || 0}</span>
                    <span>负面：{datasetInfo.label_distribution?.负面 || 0}</span>
                    <span>中性：{datasetInfo.label_distribution?.中性 || 0}</span>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-gray-600 font-medium text-sm">点击上传训练数据集</p>
                  <p className="text-gray-400 text-xs mt-1">支持 .xlsx, .xls 格式</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 提取按钮和进度 */}
        <div className="mt-6 space-y-4">
          <button
            onClick={startGradientExtraction}
            disabled={isExtracting}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-600 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isExtracting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                提取中...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                开始提取
              </>
            )}
          </button>

          {isExtracting && (
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-700">{extractionStatus}</span>
                <span className="text-sm text-purple-600">{extractionProgress}%</span>
              </div>
              <div className="w-full bg-purple-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${extractionProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {extractionResult && !isExtracting && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
              <h5 className="font-semibold text-green-800 mb-3">提取结果摘要</h5>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                  <div className="text-xs text-gray-600 mb-1">总候选词数</div>
                  <div className="text-lg font-bold text-green-700">{extractionResult.total_candidates}</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                  <div className="text-xs text-gray-600 mb-1">本次新增</div>
                  <div className="text-lg font-bold text-blue-600">{extractionResult.new_candidates}</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                  <div className="text-xs text-gray-600 mb-1">正面词数</div>
                  <div className="text-lg font-bold text-green-600">{extractionResult.positive_count}</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                  <div className="text-xs text-gray-600 mb-1">负面词数</div>
                  <div className="text-lg font-bold text-red-600">{extractionResult.negative_count}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 候选词审核区域 */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200">
        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          候选词审核
        </h4>

        {/* 统计信息 */}
        {statistics && (
          <div className="grid grid-cols-5 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">待审核</div>
              <div className="text-lg font-bold text-orange-600">{statistics.total_pending}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">已通过</div>
              <div className="text-lg font-bold text-green-600">{statistics.total_approved}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">已拒绝</div>
              <div className="text-lg font-bold text-red-600">{statistics.total_rejected}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">完成率</div>
              <div className="text-lg font-bold text-purple-600">{(statistics.completion_rate * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">总提取次数</div>
              <div className="text-lg font-bold text-blue-600">{statistics.total_extractions}</div>
            </div>
          </div>
        )}

        {/* 筛选工具栏 */}
        <div className="flex flex-wrap gap-4 mb-4 items-center">
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
            >
              <option value="pending_review">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
            </select>
          </div>

          <div>
            <select
              value={filterPolarity}
              onChange={(e) => setFilterPolarity(e.target.value)}
              className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
            >
              <option value="all">全部极性</option>
              <option value="positive">正面</option>
              <option value="negative">负面</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="搜索候选词..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-100 focus:border-purple-400"
            />
          </div>

          <button
            onClick={loadCandidates}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-all duration-300 text-sm"
          >
            刷新
          </button>
        </div>

        {/* 候选词卡片列表 */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4" style={{ minHeight: '400px' }}>
          {candidates.length > 0 ? (
            candidates.map((candidate) => (
              <div
                key={candidate.word}
                className={`border-2 rounded-xl p-4 transition-all duration-200 ${
                  selectedCandidates.has(candidate.word)
                    ? 'border-purple-400 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedCandidates.has(candidate.word)}
                    onChange={() => toggleCandidateSelection(candidate.word)}
                    className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />

                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-lg font-bold text-gray-900">{candidate.word}</h5>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          candidate.polarity === 'positive'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {candidate.polarity === 'positive' ? '🟢 正面' : '🔴 负面'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-gray-600 mb-2">
                      <span className="bg-gray-100 px-2 py-1 rounded">
                        提取次数: <strong>{candidate.extraction_count}</strong>
                      </span>
                      <span className="bg-gray-100 px-2 py-1 rounded">
                        得分: <strong>{candidate.score?.toFixed(3)}</strong>
                      </span>
                      <span className="bg-gray-100 px-2 py-1 rounded">
                        频次: <strong>{candidate.frequency}</strong>
                      </span>
                    </div>

                    {candidate.contexts && candidate.contexts.length > 0 && (
                      <details className="group">
                        <summary className="cursor-pointer text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1">
                          <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          示例上下文 ({candidate.contexts.length})
                        </summary>
                        <div className="mt-2 pl-4 space-y-1">
                          {candidate.contexts.slice(0, 3).map((ctx, idx) => (
                            <p key={idx} className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-200">
                              {ctx}
                            </p>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full flex items-center justify-center py-12 text-gray-400">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-sm">暂无候选词数据</p>
              </div>
            </div>
          )}
        </div>

        {/* 分页控制 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mb-4">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              &lt;
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (currentPage <= 4) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = currentPage - 3 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === pageNum
                      ? 'bg-purple-500 text-white'
                      : 'border border-gray-300 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            {totalPages > 7 && currentPage < totalPages - 3 && (
              <span className="px-2 text-gray-400">...</span>
            )}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              &gt;
            </button>
          </div>
        )}

        {/* 底部固定操作栏 */}
        <div className="sticky bottom-0 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectAllPage}
                  onChange={toggleSelectAllPage}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <span className="text-sm font-medium text-gray-700">全选本页</span>
              </label>
              <span className="text-sm text-gray-600">
                已选中 <strong className="text-purple-600">{selectedCandidates.size}</strong> 项
              </span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                disabled={selectedCandidates.size === 0}
                className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                批量通过
              </button>
              <button
                onClick={handleReject}
                disabled={selectedCandidates.size === 0}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                批量拒绝
              </button>
              <button
                onClick={() => {
                  setSelectedCandidates(new Set());
                  setSelectAllPage(false);
                }}
                disabled={selectedCandidates.size === 0}
                className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                跳过
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DictionaryReviewTab;
