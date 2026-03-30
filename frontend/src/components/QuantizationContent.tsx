import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config/api';

type PrecisionMode = 'fp32' | 'fp16' | 'int8';
type ComparisonType = 'fp32_vs_fp16' | 'fp32_vs_int8' | 'fp16_vs_int8';

interface GlobalModeStatus {
  current_mode: PrecisionMode;
  fp16_available: boolean;
  int8_available: boolean;
  fp32_size_mb: number;
  fp16_size_mb: number;
  int8_size_mb: number;
  current_model_size_mb: number;
}

interface TestsetDataInfo {
  total: number;
  label_distribution: Record<string, number>;
}

interface ComparisonResult {
  mode: string;
  accuracy: number;
  correct: number;
  total: number;
  avg_inference_time_ms: number;
  model_size_mb: number;
  device: string;
}

interface Improvement {
  size_reduction_percent: number;
  speed_improvement_percent: number;
  accuracy_loss_percent: number;
}

const QuantizationContent: React.FC = () => {
  const [globalMode, setGlobalMode] = useState<GlobalModeStatus | null>(null);
  const [testsetDataInfo, setTestsetDataInfo] = useState<TestsetDataInfo | null>(null);
  const [comparisonType, setComparisonType] = useState<ComparisonType>('fp32_vs_fp16');
  const [loading, setLoading] = useState(false);
  const [quantizingFp16, setQuantizingFp16] = useState(false);
  const [quantizingInt8, setQuantizingInt8] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string>('');
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult[] | null>(null);
  const [improvement, setImprovement] = useState<Improvement | null>(null);
  const [experimentTime, setExperimentTime] = useState<number>(0);

  const getAuthHeader = () => ({
    'Authorization': `Bearer ${localStorage.getItem('training_token')}`,
    'Content-Type': 'application/json'
  });

  const fetchGlobalMode = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.api}/quantization/mode`, {
        headers: getAuthHeader()
      });
      
      if (response.ok) {
        const data = await response.json();
        setGlobalMode(data);
      }
    } catch (err) {
      console.error('获取全局模式失败:', err);
    }
  };

  useEffect(() => {
    fetchGlobalMode();
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    setError('');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_ENDPOINTS.api}/quantization/testset/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('training_token')}`
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setTestsetDataInfo({
          total: data.info.sample_count,
          label_distribution: data.info.label_distribution
        });
        setComparisonResults(null);
        setImprovement(null);
      } else {
        setError(data.detail || '上传失败');
        alert(data.detail || '上传失败');
      }
    } catch (err) {
      console.error('上传失败:', err);
      setError('网络错误');
      alert('网络错误');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const handleQuantizeFp16 = async () => {
    if (!confirm('确定要执行 FP16 量化吗？这可能需要几分钟时间。')) return;
    
    setQuantizingFp16(true);
    setError('');
    
    try {
      const response = await fetch(`${API_ENDPOINTS.api}/quantization/quantize/fp16`, {
        method: 'POST',
        headers: getAuthHeader()
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        alert(`FP16 量化成功！\n${data.message}`);
        await fetchGlobalMode();
      } else {
        setError(data.detail || 'FP16 量化失败');
        alert(data.detail || 'FP16 量化失败');
      }
    } catch (err) {
      console.error('FP16 量化失败:', err);
      setError('网络错误');
      alert('网络错误');
    } finally {
      setQuantizingFp16(false);
    }
  };

  const handleQuantizeInt8 = async () => {
    if (!confirm('确定要执行 INT8 量化吗？这可能需要几分钟时间。\n\n注意：INT8 模型只能在 CPU 上运行。')) return;
    
    setQuantizingInt8(true);
    setError('');
    
    try {
      const response = await fetch(`${API_ENDPOINTS.api}/quantization/quantize/int8`, {
        method: 'POST',
        headers: getAuthHeader()
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        alert(`INT8 量化成功！\n${data.message}`);
        await fetchGlobalMode();
      } else {
        setError(data.detail || 'INT8 量化失败');
        alert(data.detail || 'INT8 量化失败');
      }
    } catch (err) {
      console.error('INT8 量化失败:', err);
      setError('网络错误');
      alert('网络错误');
    } finally {
      setQuantizingInt8(false);
    }
  };

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
        await fetchGlobalMode();
      } else {
        setError(data.detail || '切换失败');
        alert(data.detail || '切换失败');
      }
    } catch (err) {
      console.error('切换失败:', err);
      setError('网络错误');
      alert('网络错误');
    } finally {
      setSwitching(false);
    }
  };

  const handleRunComparison = async () => {
    if (!testsetDataInfo) {
      alert('请先上传测试数据集');
      return;
    }
    
    setTesting(true);
    setError('');
    setComparisonResults(null);
    setImprovement(null);
    
    try {
      const response = await fetch(`${API_ENDPOINTS.api}/quantization/compare`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ comparison_type: comparisonType })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setComparisonResults(data.results);
        setImprovement(data.improvement);
        setExperimentTime(data.experiment_time);
      } else {
        setError(data.detail || '对比测试失败');
        alert(data.detail || '对比测试失败');
      }
    } catch (err) {
      console.error('对比测试失败:', err);
      setError('网络错误');
      alert('网络错误');
    } finally {
      setTesting(false);
    }
  };

  const handleExportResults = () => {
    if (!comparisonResults || !improvement) return;

    const comparisonTypeLabels = {
      'fp32_vs_fp16': 'FP32 vs FP16',
      'fp32_vs_int8': 'FP32 vs INT8',
      'fp16_vs_int8': 'FP16 vs INT8'
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `quantization_experiment_${comparisonType}_${timestamp}.txt`;
    
    const content = `
================================================================================
                      模型量化对比实验报告
================================================================================

实验时间：${new Date().toLocaleString('zh-CN')}
对比类型：${comparisonTypeLabels[comparisonType]}
测试样本数：${testsetDataInfo?.total} 条
实验耗时：${experimentTime.toFixed(2)} 秒

--------------------------------------------------------------------------------
                          对比结果详情
--------------------------------------------------------------------------------

【模型 1】${comparisonResults[0].mode} (${comparisonResults[0].device.toUpperCase()})
  准确率：     ${(comparisonResults[0].accuracy * 100).toFixed(2)}%
  正确/总数：  ${comparisonResults[0].correct} / ${comparisonResults[0].total}
  平均推理时间：${comparisonResults[0].avg_inference_time_ms.toFixed(3)} ms
  模型大小：   ${comparisonResults[0].model_size_mb.toFixed(2)} MB

【模型 2】${comparisonResults[1].mode} (${comparisonResults[1].device.toUpperCase()})
  准确率：     ${(comparisonResults[1].accuracy * 100).toFixed(2)}%
  正确/总数：  ${comparisonResults[1].correct} / ${comparisonResults[1].total}
  平均推理时间：${comparisonResults[1].avg_inference_time_ms.toFixed(3)} ms
  模型大小：   ${comparisonResults[1].model_size_mb.toFixed(2)} MB

--------------------------------------------------------------------------------
                          性能提升总结
--------------------------------------------------------------------------------

模型大小减少：   ${improvement.size_reduction_percent.toFixed(1)}%
推理速度变化：   ${improvement.speed_improvement_percent > 0 ? '+' : ''}${improvement.speed_improvement_percent.toFixed(1)}%
准确率损失：     ${improvement.accuracy_loss_percent.toFixed(2)}%

================================================================================
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const getComparisonTypeLabel = (type: ComparisonType) => {
    const labels = {
      'fp32_vs_fp16': 'FP32 vs FP16 (GPU vs GPU)',
      'fp32_vs_int8': 'FP32 vs INT8 (GPU vs CPU)',
      'fp16_vs_int8': 'FP16 vs INT8 (GPU vs CPU)'
    };
    return labels[type];
  };

  const getModelTypeBadge = (mode: string, device: string) => {
    const badges = {
      'FP32': { color: 'bg-blue-500', label: 'FP32', device: device.toUpperCase() },
      'FP16': { color: 'bg-green-500', label: 'FP16', device: device.toUpperCase() },
      'INT8': { color: 'bg-orange-500', label: 'INT8', device: device.toUpperCase() }
    };
    const badge = badges[mode as keyof typeof badges];
    return badge || { color: 'bg-gray-500', label: mode, device: device.toUpperCase() };
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">模型量化实验</h3>
            <p className="text-gray-500 text-sm mt-1">FP16 在 GPU 运行，INT8 在 CPU 运行</p>
          </div>
          {globalMode && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">当前模式:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                globalMode.current_mode === 'fp32' 
                  ? 'bg-blue-100 text-blue-700' 
                  : globalMode.current_mode === 'fp16'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-orange-100 text-orange-700'
              }`}>
                {globalMode.current_mode.toUpperCase()}
              </span>
            </div>
          )}
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-200">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">1. 模型选择器</h4>
            
            {globalMode && (
              <div className="mb-4 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">FP32 (GPU)</span>
                  <span className="font-semibold text-gray-900">{globalMode.fp32_size_mb.toFixed(0)} MB</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">FP16 (GPU) {globalMode.fp16_available ? '✓' : '未量化'}</span>
                  <span className="font-semibold text-gray-900">{globalMode.fp16_size_mb.toFixed(0)} MB</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">INT8 (CPU) {globalMode.int8_available ? '✓' : '未量化'}</span>
                  <span className="font-semibold text-gray-900">{globalMode.int8_size_mb.toFixed(0)} MB</span>
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleSwitchMode('fp32')}
                  disabled={switching || globalMode?.current_mode === 'fp32'}
                  className={`py-2 text-sm font-medium rounded-xl transition-all duration-300 ${
                    globalMode?.current_mode === 'fp32'
                      ? 'bg-blue-500 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  FP32
                </button>
                <button
                  onClick={() => handleSwitchMode('fp16')}
                  disabled={switching || !globalMode?.fp16_available || globalMode?.current_mode === 'fp16'}
                  className={`py-2 text-sm font-medium rounded-xl transition-all duration-300 ${
                    globalMode?.current_mode === 'fp16'
                      ? 'bg-green-500 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-green-50 hover:text-green-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  FP16
                </button>
                <button
                  onClick={() => handleSwitchMode('int8')}
                  disabled={switching || !globalMode?.int8_available || globalMode?.current_mode === 'int8'}
                  className={`py-2 text-sm font-medium rounded-xl transition-all duration-300 ${
                    globalMode?.current_mode === 'int8'
                      ? 'bg-orange-500 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  INT8
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleQuantizeFp16}
                  disabled={quantizingFp16}
                  className="py-2 text-sm bg-gradient-to-r from-green-500 to-emerald-400 hover:from-green-600 hover:to-emerald-500 text-white font-medium rounded-xl transition-all duration-300 shadow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {quantizingFp16 ? '量化中...' : '执行 FP16 量化'}
                </button>
                <button
                  onClick={handleQuantizeInt8}
                  disabled={quantizingInt8}
                  className="py-2 text-sm bg-gradient-to-r from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white font-medium rounded-xl transition-all duration-300 shadow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {quantizingInt8 ? '量化中...' : '执行 INT8 量化'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-200">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">2. 上传测试数据</h4>
            <label className="block">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all duration-300">
                <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-gray-600 font-medium text-sm">点击上传测试数据集</p>
                <p className="text-gray-400 text-xs mt-1">支持 .xlsx, .xls 格式</p>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                disabled={loading}
              />
            </label>
            {testsetDataInfo && (
              <div className="mt-3 p-3 bg-green-50 rounded-xl border border-green-200">
                <p className="text-green-700 font-medium text-sm">已上传 {testsetDataInfo.total} 条测试数据</p>
                <div className="flex gap-3 mt-1 text-xs text-green-600">
                  <span>正面：{testsetDataInfo.label_distribution['正面'] || 0}</span>
                  <span>负面：{testsetDataInfo.label_distribution['负面'] || 0}</span>
                  <span>中性：{testsetDataInfo.label_distribution['中性'] || 0}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-200">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">3. 运行对比测试</h4>
        
        <div className="mb-4">
          <label className="block text-sm text-gray-600 mb-2">选择对比类型</label>
          <select
            value={comparisonType}
            onChange={(e) => setComparisonType(e.target.value as ComparisonType)}
            className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="fp32_vs_fp16">FP32 vs FP16 (GPU vs GPU) - 公平对比</option>
            <option value="fp32_vs_int8">FP32 vs INT8 (GPU vs CPU) - 压缩效果</option>
            <option value="fp16_vs_int8">FP16 vs INT8 (GPU vs CPU) - 部署对比</option>
          </select>
        </div>
        
        {testsetDataInfo && (
          <button
            onClick={handleRunComparison}
            disabled={testing}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? '测试中...' : '开始对比测试'}
          </button>
        )}
        
        {!testsetDataInfo && (
          <button
            disabled
            className="w-full py-3 bg-gray-300 text-gray-500 font-semibold rounded-xl cursor-not-allowed"
          >
            请先上传测试数据
          </button>
        )}
      </div>

      {comparisonResults && comparisonResults.length === 2 && (
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-gray-900">对比结果</h4>
              <p className="text-sm text-gray-500 mt-1">
                对比类型：<span className="font-medium text-purple-600">{getComparisonTypeLabel(comparisonType)}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">耗时：{experimentTime.toFixed(2)}s</span>
              <button
                onClick={handleExportResults}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-xl transition-all duration-300 shadow-md hover:shadow-lg"
              >
                📥 导出实验结果
              </button>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            {comparisonResults.map((result, index) => {
              const badge = getModelTypeBadge(result.mode, result.device);
              return (
                <div key={index} className={`bg-gradient-to-br ${
                  result.mode === 'FP32' ? 'from-blue-50 to-cyan-50 border-blue-200' :
                  result.mode === 'FP16' ? 'from-green-50 to-emerald-50 border-green-200' :
                  'from-orange-50 to-amber-50 border-orange-200'
                } rounded-xl p-5 border`}>
                  <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className={`w-3 h-3 ${badge.color} rounded-full`}></span>
                    {badge.label} 模型
                    <span className="text-xs font-normal text-gray-500">({badge.device})</span>
                  </h5>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">准确率</span>
                      <span className="text-lg font-bold text-gray-900">{(result.accuracy * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">正确/总数</span>
                      <span className="text-sm font-semibold text-gray-900">{result.correct} / {result.total}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">平均推理时间</span>
                      <span className="text-lg font-bold text-gray-900">{result.avg_inference_time_ms.toFixed(2)} ms</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">模型大小</span>
                      <span className="text-lg font-bold text-gray-900">{result.model_size_mb.toFixed(0)} MB</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {improvement && (
            <div className="mt-4 p-4 bg-purple-50 rounded-xl border border-purple-200">
              <h5 className="font-semibold text-purple-900 mb-2">性能提升</h5>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-purple-600">模型大小减少</span>
                  <p className="text-lg font-bold text-purple-900">{improvement.size_reduction_percent}%</p>
                </div>
                <div>
                  <span className="text-purple-600">推理速度变化</span>
                  <p className="text-lg font-bold text-purple-900">
                    {improvement.speed_improvement_percent > 0 ? '+' : ''}{improvement.speed_improvement_percent}%
                  </p>
                </div>
                <div>
                  <span className="text-purple-600">准确率损失</span>
                  <p className="text-lg font-bold text-purple-900">{improvement.accuracy_loss_percent}%</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
};

export default QuantizationContent;
