import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config/api';

interface AblationResult {
  key: string;
  config: string;
  description: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  improvement: string;
}

interface AblationStudyTabProps {
  token: string;
}

const STORAGE_KEY = 'ablation_study_results';

const AblationStudyTab: React.FC<AblationStudyTabProps> = ({ token }) => {
  const [config, setConfig] = useState({
    enable_negation: true,
    enable_enhanced: true,
    enable_degree: true,
    enable_pattern: true,
    enable_dynamic_threshold: true
  });
  
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<{ count: number; label_distribution?: Record<string, number> } | null>(null);
  const [results, setResults] = useState<AblationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastTestTime, setLastTestTime] = useState<string>('');
  const [exportingCharts, setExportingCharts] = useState(false);
  const [chartImage, setChartImage] = useState<string>('');

  // 页面加载时从localStorage恢复结果
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.results && Array.isArray(parsed.results)) {
          setResults(parsed.results);
          setLastTestTime(parsed.timestamp || '');
        }
      } catch (e) {
        console.error('Failed to load saved ablation results:', e);
      }
    }
  }, []);

  // 结果变化时保存到localStorage
  useEffect(() => {
    if (results.length > 0) {
      const data = {
        results,
        timestamp: new Date().toLocaleString('zh-CN')
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setLastTestTime(data.timestamp);
    }
  }, [results]);

  // 清除缓存
  const clearCache = () => {
    localStorage.removeItem(STORAGE_KEY);
    setResults([]);
    setLastTestTime('');
    setFile(null);
    setFileInfo(null);
    alert('缓存已清除');
  };

  // 处理文件上传
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('training_token');
      const headers: HeadersInit = token ? {
        'Authorization': `Bearer ${token}`
      } : {};
      
      const response = await fetch(`${API_ENDPOINTS.training}/upload-data`, {
        method: 'POST',
        headers: headers,
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        const labelDist = data.label_distribution || {};
        const safeLabelDistribution: Record<string, number> = {
          '正面': Number(labelDist['正面']) || 0,
          '负面': Number(labelDist['负面']) || 0,
          '中性': Number(labelDist['中性']) || 0
        };
        const safeCount = Number(data.count) || 0;
        
        setFile(file);
        setFileInfo({
          count: safeCount,
          label_distribution: safeLabelDistribution
        });
        alert(`成功上传 ${safeCount} 条数据`);
      } else {
        const error = await response.json();
        alert(`上传失败：${error.detail || '未知错误'}`);
      }
    } catch (error) {
      console.error('上传失败:', error);
      alert('上传失败，请重试');
    }
  };

  // 获取 token
  const getAuthHeader = () => {
    return { Authorization: `Bearer ${token}` };
  };

  // 测试当前配置
  const testCurrentConfig = async () => {
    if (!file) {
      alert('请先上传测试数据');
      return;
    }
    
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('enable_negation', String(config.enable_negation));
    formData.append('enable_degree', String(config.enable_degree));
    formData.append('enable_pattern', String(config.enable_pattern));
    formData.append('enable_dynamic_threshold', String(config.enable_dynamic_threshold));
    
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/ablation-test`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: '未知错误' }));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const result: AblationResult = {
        key: 'current',
        config: '当前配置',
        description: getConfigDescription(config),
        accuracy: data.accuracy,
        precision: data.precision,
        recall: data.recall,
        f1_score: data.f1_score,
        improvement: '-'
      };
      setResults([result, ...results]);
      alert('测试完成');
    } catch (error) {
      console.error('测试失败:', error);
      alert('测试失败: ' + (error as Error).message);
    }
    setLoading(false);
  };

  // 运行完整消融实验（5个配置）
  const runFullAblation = async () => {
    if (!file) {
      alert('请先上传测试数据');
      return;
    }
    
    setLoading(true);
    setResults([]);
    
    const configs = [
      {
        name: 'C0_Baseline',
        desc: '基础词典（无优化）',
        config: { enable_negation: false, enable_degree: false, enable_pattern: false, enable_dynamic_threshold: false, enable_enhanced: false }
      },
      {
        name: 'C1_Enhanced',
        desc: '+增强词典（梯度提取词）',
        config: { enable_negation: false, enable_degree: false, enable_pattern: false, enable_dynamic_threshold: false, enable_enhanced: true }
      },
      {
        name: 'C2_Negation',
        desc: '+否定词处理',
        config: { enable_negation: true, enable_degree: false, enable_pattern: false, enable_dynamic_threshold: false, enable_enhanced: false }
      },
      {
        name: 'C3_Degree',
        desc: '+程度副词加权',
        config: { enable_negation: true, enable_degree: true, enable_pattern: false, enable_dynamic_threshold: false, enable_enhanced: false }
      },
      {
        name: 'C4_Pattern',
        desc: '+特殊搭配模式',
        config: { enable_negation: true, enable_degree: true, enable_pattern: true, enable_dynamic_threshold: false, enable_enhanced: false }
      },
      {
        name: 'C5_Full',
        desc: '完整系统（+动态阈值）',
        config: { enable_negation: true, enable_degree: true, enable_pattern: true, enable_dynamic_threshold: true, enable_enhanced: false }
      }
    ];
    
    const allResults: AblationResult[] = [];
    let baselineAcc = 0;
    
    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];
      const formData = new FormData();
      formData.append('file', file);
      Object.entries(cfg.config).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      
      try {
        const response = await fetch(`${API_ENDPOINTS.training}/ablation-test`, {
          method: 'POST',
          headers: getAuthHeader(),
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ detail: '未知错误' }));
          throw new Error(`${cfg.name}: ${errorData.detail || `HTTP ${response.status}`}`);
        }
        
        const data = await response.json();
        const acc = data.accuracy;
        
        if (i === 0) {
          baselineAcc = acc;
        }
        
        const result: AblationResult = {
          key: cfg.name,
          config: cfg.name,
          description: cfg.desc,
          accuracy: data.accuracy,
          precision: data.precision,
          recall: data.recall,
          f1_score: data.f1_score,
          improvement: i === 0 ? '-' : `+${(acc - baselineAcc).toFixed(2)}%`
        };
        
        allResults.push(result);
        setResults([...allResults]);
      } catch (error) {
        alert(`${cfg.name} 测试失败: ` + (error as Error).message);
      }
    }
    
    setLoading(false);
    alert('消融实验完成！');
  };

  const getConfigDescription = (cfg: typeof config) => {
    const parts: string[] = [];
    if (cfg.enable_negation) parts.push('否定词');
    if (cfg.enable_degree) parts.push('程度副词');
    if (cfg.enable_pattern) parts.push('特殊搭配');
    if (cfg.enable_dynamic_threshold) parts.push('动态阈值');
    return parts.length > 0 ? parts.join('+') : '无优化';
  };

  const exportResults = () => {
    if (results.length === 0) {
      alert('没有可导出的结果');
      return;
    }
    
    const csvContent = [
      ['配置', '描述', '准确率', '精确率', '召回率', 'F1值', '相对提升'].join(','),
      ...results.map(r => [
        r.config, r.description,
        `${r.accuracy}%`, `${r.precision}%`, `${r.recall}%`, `${r.f1_score}%`,
        r.improvement
      ].join(','))
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `消融实验结果_${new Date().toLocaleDateString()}.csv`;
    link.click();
    alert('导出成功');
  };

  // 生成图表（用于前端显示）
  const generateCharts = async () => {
    if (results.length === 0) {
      alert('没有可生成图表的结果');
      return;
    }
    
    setExportingCharts(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/export-ablation-charts`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ results })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: '未知错误' }));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setChartImage(`data:image/png;base64,${data.png_base64}`);
    } catch (error) {
      console.error('生成图表失败:', error);
      alert('生成图表失败: ' + (error as Error).message);
    }
    setExportingCharts(false);
  };

  // 导出图表（下载PNG和PDF）
  const exportCharts = async () => {
    if (results.length === 0) {
      alert('没有可导出的结果');
      return;
    }
    
    // 如果已经生成了图表，直接使用
    if (chartImage) {
      // 下载PNG
      const pngLink = document.createElement('a');
      pngLink.href = chartImage;
      pngLink.download = `消融实验结果_图表_${new Date().toLocaleDateString()}.png`;
      pngLink.click();
      alert('PNG图表已下载');
      return;
    }
    
    setExportingCharts(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.training}/export-ablation-charts`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ results })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: '未知错误' }));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // 下载PNG
      const pngBlob = new Blob([Uint8Array.from(atob(data.png_base64), c => c.charCodeAt(0))], { type: 'image/png' });
      const pngLink = document.createElement('a');
      pngLink.href = URL.createObjectURL(pngBlob);
      pngLink.download = `消融实验结果_图表_${new Date().toLocaleDateString()}.png`;
      pngLink.click();
      
      // 下载PDF
      const pdfBlob = new Blob([Uint8Array.from(atob(data.pdf_base64), c => c.charCodeAt(0))], { type: 'application/pdf' });
      const pdfLink = document.createElement('a');
      pdfLink.href = URL.createObjectURL(pdfBlob);
      pdfLink.download = `消融实验结果_图表_${new Date().toLocaleDateString()}.pdf`;
      pdfLink.click();
      
      alert('图表导出成功！PNG和PDF已下载');
    } catch (error) {
      console.error('导出图表失败:', error);
      alert('导出图表失败: ' + (error as Error).message);
    }
    setExportingCharts(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-indigo-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-1">消融实验</h4>
            <p className="text-gray-600 text-sm">
              通过开关控制不同的优化模块，测试各模块对情感分析准确率的贡献。支持手动测试单个配置，或一键运行完整的6配置对比实验。
            </p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-2xl p-6 border border-gray-200">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">配置开关</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enable_negation}
              onChange={(e) => setConfig({...config, enable_negation: e.target.checked})}
              className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
            />
            <span className="text-gray-700">否定词处理</span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enable_enhanced}
              onChange={(e) => setConfig({...config, enable_enhanced: e.target.checked})}
              className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-gray-700">增强词典</span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enable_degree}
              onChange={(e) => setConfig({...config, enable_degree: e.target.checked})}
              className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
            />
            <span className="text-gray-700">程度副词加权</span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enable_pattern}
              onChange={(e) => setConfig({...config, enable_pattern: e.target.checked})}
              className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
            />
            <span className="text-gray-700">特殊搭配模式</span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enable_dynamic_threshold}
              onChange={(e) => setConfig({...config, enable_dynamic_threshold: e.target.checked})}
              className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
            />
            <span className="text-gray-700">动态阈值</span>
          </label>
        </div>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">1. 上传测试数据</h4>
          <label className="block">
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all duration-300">
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {fileInfo ? (
                <div className="p-3 bg-green-50 rounded-xl border border-green-200">
                  <p className="text-green-700 font-medium text-sm">已上传 {fileInfo.count} 条数据</p>
                  <div className="flex gap-3 mt-1 text-xs text-green-600 justify-center">
                    <span>正面：{fileInfo.label_distribution?.['正面'] || 0}</span>
                    <span>负面：{fileInfo.label_distribution?.['负面'] || 0}</span>
                    <span>中性：{fileInfo.label_distribution?.['中性'] || 0}</span>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-gray-600 font-medium">点击上传测试数据集</p>
                  <p className="text-gray-400 text-sm mt-1">支持 .xlsx, .xls 格式</p>
                </>
              )}
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
          <p className="text-gray-500 mt-3 text-sm">
            文件需包含"文本"和"标签"两列，标签为"正面"/"负面"/"中性"
          </p>
        </div>
        
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">2. 开始评估</h4>
          <div className="space-y-3">
            <button 
              onClick={testCurrentConfig}
              disabled={loading || !file}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-600 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              测试当前配置
            </button>
            <button 
              onClick={runFullAblation}
              disabled={loading || !file}
              className="w-full py-3 bg-gradient-to-r from-indigo-500 to-cyan-400 hover:from-indigo-600 hover:to-cyan-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              运行完整消融实验
            </button>
          </div>
        </div>
      </div>
      
      {/* 导出按钮 - 放在框外，横向排列 */}
      {results.length > 0 && (
        <div className="flex flex-wrap gap-4">
          <button 
            onClick={exportResults}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            导出CSV
          </button>
          <button 
            onClick={generateCharts}
            disabled={exportingCharts}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {exportingCharts ? '生成中...' : '生成图表'}
          </button>
          <button 
            onClick={exportCharts}
            disabled={exportingCharts || !chartImage}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            导出图表
          </button>
        </div>
      )}
      
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
          <span className="ml-3 text-gray-600">正在运行消融实验...</span>
        </div>
      )}
      
      {chartImage && (
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-900">可视化图表</h4>
            <span className="text-sm text-gray-500">(a) 各配置准确率对比  (b) 各模块贡献度分析</span>
          </div>
          <div className="overflow-x-auto">
            <img 
              src={chartImage} 
              alt="消融实验结果图表" 
              className="w-full max-w-4xl mx-auto rounded-lg shadow-lg"
            />
          </div>
        </div>
      )}
      
      {results.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-900">实验结果</h4>
            <div className="flex items-center gap-3">
              {lastTestTime && (
                <span className="text-sm text-gray-500">
                  上次测试: {lastTestTime}
                </span>
              )}
              <button
                onClick={clearCache}
                className="text-sm text-red-500 hover:text-red-700 underline"
              >
                清除缓存
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold text-gray-700">配置</th>
                  <th className="py-3 px-4 text-left font-semibold text-gray-700">描述</th>
                  <th className="py-3 px-4 text-left font-semibold text-gray-700">准确率</th>
                  <th className="py-3 px-4 text-left font-semibold text-gray-700">精确率</th>
                  <th className="py-3 px-4 text-left font-semibold text-gray-700">召回率</th>
                  <th className="py-3 px-4 text-left font-semibold text-gray-700">F1值</th>
                  <th className="py-3 px-4 text-left font-semibold text-gray-700">相对提升</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {results.map((result) => (
                  <tr key={result.key} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-900">{result.config}</td>
                    <td className="py-3 px-4 text-gray-600">{result.description}</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-purple-600">{result.accuracy}%</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{result.precision}%</td>
                    <td className="py-3 px-4 text-gray-600">{result.recall}%</td>
                    <td className="py-3 px-4 text-gray-600">{result.f1_score}%</td>
                    <td className="py-3 px-4">
                      {result.improvement === '-' ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        <span className="font-semibold text-green-600">{result.improvement}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AblationStudyTab;
