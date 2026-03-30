import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config/api';
import { handleApiResponse } from '../utils/api';

// ==================== 类型定义（使用共享类型）====================

// 注意：PrecisionMode 已统一为后端定义的类型
// 这里为了向后兼容，保留旧的类型定义但映射到新的类型
type PrecisionMode = 'fp32' | 'fp16' | 'int8';

interface GpuMemoryInfo {
  total_mb: number;
  allocated_mb: number;
  reserved_mb: number;
  free_mb: number;
  percent: number;
  gpu_name: string;
  cuda_available: boolean;
}

interface QuantizationStatus {
  mode: PrecisionMode;
  model_path: string;
  model_size_mb: number;
  quantization_completed: boolean;
  quantization_time: number;
  last_error: string;
}

interface QuantizationResult {
  success: boolean;
  original_size_mb: number;
  quantized_size_mb: number;
  size_reduction_percent: number;
  quantization_time: number;
  message: string;
  error?: string;
}

interface ModelComparison {
  available: boolean;
  fp32: {
    accuracy: number;
    inference_time_ms: number;
    memory_usage_mb: number;
    model_size_mb: number;
  };
  int8: {
    accuracy: number;
    inference_time_ms: number;
    memory_usage_mb: number;
    model_size_mb: number;
  };
  improvement: {
    size_reduction_percent: number;
    inference_speedup_percent: number;
    memory_reduction_percent: number;
    accuracy_change_percent: number;
  };
}

// ==================== 组件实现 ====================

interface QuantizationTabProps {
  token: string;
}

const QuantizationTab: React.FC<QuantizationTabProps> = ({ token }) => {
  // 量化状态
  const [quantStatus, setQuantStatus] = useState<QuantizationStatus | null>(null);
  const [gpuMemory, setGpuMemory] = useState<GpuMemoryInfo | null>(null);
  
  // 量化结果
  const [quantResult, setQuantResult] = useState<QuantizationResult | null>(null);
  
  // 对比结果
  const [comparison, setComparison] = useState<ModelComparison | null>(null);
  
  // 加载状态
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // 错误信息
  const [error, setError] = useState<string>('');

  // 获取认证头
  const getAuthHeader = () => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });

  // 查询量化状态
  const fetchQuantizationStatus = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.api}/quantization/status`, {
        headers: getAuthHeader()
      });
      
      if (response.ok) {
        const data = await response.json();
        setQuantStatus(data);
      }
    } catch (err) {
      console.error('获取量化状态失败:', err);
    }
  };

  // 查询 GPU 显存信息
  const fetchGpuMemoryInfo = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.performance}/gpu-memory`, {
        headers: getAuthHeader()
      });
      
      if (response.ok) {
        const data = await response.json();
        setGpuMemory(data);
      }
    } catch (err) {
      console.error('获取 GPU 信息失败:', err);
    }
  };

  // 查询对比结果
  const fetchComparisonResult = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.api}/quantization/compare`, {
        headers: getAuthHeader()
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.available) {
          setComparison(data);
        }
      }
    } catch (err) {
      console.error('获取对比结果失败:', err);
    }
  };

  // 页面加载时获取状态
  useEffect(() => {
    fetchQuantizationStatus();
    fetchGpuMemoryInfo();
    fetchComparisonResult();
  }, []);

  // 执行 INT8 量化
  const handleQuantize = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_ENDPOINTS.api}/quantization/quantize`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({})
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setQuantResult(data);
        await fetchQuantizationStatus();
        alert('量化成功！');
      } else {
        setError(data.message || '量化失败');
        alert(data.message || '量化失败');
      }
    } catch (err) {
      console.error('量化失败:', err);
      setError('网络错误，请检查后端服务是否正常');
      alert('网络错误，请检查后端服务是否正常');
    } finally {
      setLoading(false);
    }
  };

  // 切换量化模式
  const handleSwitchMode = async (mode: PrecisionMode) => {
    setSwitching(true);
    setError('');
    try {
      const response = await fetch(`${API_ENDPOINTS.api}/quantization/switch`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ mode })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        await fetchQuantizationStatus();
        alert(`已切换到 ${mode.toUpperCase()} 模式`);
      } else {
        setError(data.message || '切换失败');
        alert(data.message || '切换失败');
      }
    } catch (err) {
      console.error('切换失败:', err);
      setError('网络错误');
      alert('网络错误');
    } finally {
      setSwitching(false);
    }
  };

  // 运行对比实验
  const handleRunComparison = async () => {
    setComparing(true);
    setError('');
    try {
      const response = await fetch(`${API_ENDPOINTS.api}/quantization/compare/run`, {
        method: 'POST',
        headers: getAuthHeader()
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setComparison(data.improvement ? {
          available: true,
          fp32: data.fp32,
          int8: data.int8,
          improvement: data.improvement
        } : null);
        alert('对比实验完成！');
        await fetchComparisonResult();
      } else {
        setError(data.message || '对比实验失败');
        alert(data.message || '对比实验失败');
      }
    } catch (err) {
      console.error('对比实验失败:', err);
      setError('网络错误');
      alert('网络错误');
    } finally {
      setComparing(false);
    }
  };

  // 导出实验数据
  const handleExport = () => {
    if (!comparison) {
      alert('请先运行对比实验');
      return;
    }
    
    setExporting(true);
    try {
      const csvContent = [
        ['指标', 'FP32', 'INT8', '变化'],
        ['准确率 (%)', (comparison.fp32.accuracy * 100).toFixed(2), (comparison.int8.accuracy * 100).toFixed(2), `${(comparison.improvement.accuracy_change_percent).toFixed(2)}%`],
        ['推理时间 (ms)', comparison.fp32.inference_time_ms.toFixed(2), comparison.int8.inference_time_ms.toFixed(2), `${((comparison.fp32.inference_time_ms - comparison.int8.inference_time_ms) / comparison.fp32.inference_time_ms * 100).toFixed(2)}%`],
        ['显存占用 (MB)', comparison.fp32.memory_usage_mb.toFixed(2), comparison.int8.memory_usage_mb.toFixed(2), `${comparison.improvement.memory_reduction_percent.toFixed(2)}%`],
        ['模型大小 (MB)', comparison.fp32.model_size_mb.toFixed(2), comparison.int8.model_size_mb.toFixed(2), `${comparison.improvement.size_reduction_percent.toFixed(2)}%`]
      ].map(row => row.join(',')).join('\n');
      
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `量化对比实验_${new Date().getTime()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      
      alert('导出成功！');
    } catch (err) {
      console.error('导出失败:', err);
      alert('导出失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 量化状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 当前精度模式 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">当前精度模式</p>
              <p className="text-2xl font-bold text-gray-900">
                {quantStatus?.mode === 'fp32' ? 'FP32' : quantStatus?.mode === 'int8' ? 'INT8' : '-'}
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-400 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* 模型大小 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">模型大小</p>
              <p className="text-2xl font-bold text-gray-900">
                {quantStatus?.model_size_mb ? `${quantStatus.model_size_mb.toFixed(1)} MB` : '-'}
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-400 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
          </div>
        </div>

        {/* 显存占用 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">显存占用</p>
              <p className="text-2xl font-bold text-gray-900">
                {gpuMemory?.allocated_mb ? `${gpuMemory.allocated_mb.toFixed(0)} MB` : '-'}
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-400 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">量化操作</h3>
        <div className="flex flex-wrap gap-4">
          {/* 执行量化按钮 */}
          <button
            onClick={handleQuantize}
            disabled={loading || switching}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-400 hover:from-blue-600 hover:to-blue-500 disabled:from-gray-400 disabled:to-gray-300 text-white font-medium rounded-xl transition-all duration-300 shadow-sm hover:shadow-md disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                量化中...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                执行 INT8 量化
              </>
            )}
          </button>

          {/* 模式切换按钮 */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => handleSwitchMode('fp32')}
              disabled={switching || quantStatus?.mode === 'fp32'}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                quantStatus?.mode === 'fp32'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
              } ${switching ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              FP32
            </button>
            <button
              onClick={() => handleSwitchMode('int8')}
              disabled={switching || quantStatus?.mode === 'int8' || !quantStatus?.quantization_completed}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                quantStatus?.mode === 'int8'
                  ? 'bg-white text-green-600 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
              } ${switching || !quantStatus?.quantization_completed ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              INT8
            </button>
          </div>

          {/* 运行对比实验按钮 */}
          <button
            onClick={handleRunComparison}
            disabled={comparing || !quantStatus?.quantization_completed}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-400 hover:from-purple-600 hover:to-purple-500 disabled:from-gray-400 disabled:to-gray-300 text-white font-medium rounded-xl transition-all duration-300 shadow-sm hover:shadow-md disabled:cursor-not-allowed flex items-center gap-2"
          >
            {comparing ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                实验中...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                运行对比实验
              </>
            )}
          </button>

          {/* 导出按钮 */}
          <button
            onClick={handleExport}
            disabled={exporting || !comparison}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-400 hover:from-green-600 hover:to-green-500 disabled:from-gray-400 disabled:to-gray-300 text-white font-medium rounded-xl transition-all duration-300 shadow-sm hover:shadow-md disabled:cursor-not-allowed flex items-center gap-2"
          >
            {exporting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                导出中...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                导出实验数据
              </>
            )}
          </button>
        </div>
      </div>

      {/* 对比结果表格 */}
      {comparison && (
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">量化对比结果</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">指标</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">FP32</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">INT8</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">变化</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm text-gray-900">准确率</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{(comparison.fp32.accuracy * 100).toFixed(2)}%</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{(comparison.int8.accuracy * 100).toFixed(2)}%</td>
                  <td className={`py-3 px-4 text-sm font-medium ${
                    comparison.improvement.accuracy_change_percent >= 0 
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {comparison.improvement.accuracy_change_percent >= 0 ? '+' : ''}
                    {comparison.improvement.accuracy_change_percent.toFixed(2)}%
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm text-gray-900">推理时间</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{comparison.fp32.inference_time_ms.toFixed(2)} ms</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{comparison.int8.inference_time_ms.toFixed(2)} ms</td>
                  <td className="py-3 px-4 text-sm font-medium text-green-600">
                    -{((comparison.fp32.inference_time_ms - comparison.int8.inference_time_ms) / comparison.fp32.inference_time_ms * 100).toFixed(2)}%
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm text-gray-900">显存占用</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{comparison.fp32.memory_usage_mb.toFixed(2)} MB</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{comparison.int8.memory_usage_mb.toFixed(2)} MB</td>
                  <td className="py-3 px-4 text-sm font-medium text-green-600">
                    -{comparison.improvement.memory_reduction_percent.toFixed(2)}%
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm text-gray-900">模型大小</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{comparison.fp32.model_size_mb.toFixed(2)} MB</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{comparison.int8.model_size_mb.toFixed(2)} MB</td>
                  <td className="py-3 px-4 text-sm font-medium text-green-600">
                    -{comparison.improvement.size_reduction_percent.toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">发生错误</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuantizationTab;
