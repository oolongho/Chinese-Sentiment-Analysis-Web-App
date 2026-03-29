import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { API_ENDPOINTS } from '../config/api';

interface TextAnalysisStats {
  count: number;
  total_time: number;
  avg_time: number;
  cpu_peak: number;
  cpu_avg: number;
  gpu_peak: number | null;
  gpu_avg: number | null;
}

interface SentimentCounts {
  positive: number;
  negative: number;
  neutral: number;
}

interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
}

interface CurrentUsage {
  cpu_percent: number;
  gpu_percent: number | null;
  gpu_available: boolean;
}

interface GpuMemory {
  total_mb: number;
  used_mb: number;
  free_mb: number;
  percent: number;
  allocated_mb: number;
  reserved_mb: number;
  gpu_name: string;
}

interface Statistics {
  total_analyses: number;
  text_analyses: {
    model: TextAnalysisStats;
    lexicon: TextAnalysisStats;
    external: TextAnalysisStats;
  };
  sentiment_counts: SentimentCounts;
  model_metrics: {
    model: ModelMetrics;
    lexicon: ModelMetrics;
    external: ModelMetrics;
  };
  current_usage: CurrentUsage;
  gpu_memory: GpuMemory;
}

interface CpuGpuDataPoint {
  timestamp: number;
  cpu_percent: number;
  gpu_percent: number | null;
}

const PerformancePage: React.FC = () => {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [cpuGpuHistory, setCpuGpuHistory] = useState<CpuGpuDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, historyRes] = await Promise.all([
        fetch(`${API_ENDPOINTS.performance}/stats`),
        fetch(`${API_ENDPOINTS.performance}/cpu-gpu-history?limit=50`)
      ]);
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        const formattedData = historyData.map((point: CpuGpuDataPoint) => ({
          ...point,
          time: new Date(point.timestamp * 1000).toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          })
        }));
        setCpuGpuHistory(formattedData);
      }
    } catch (error) {
      console.error('获取性能数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const StatCard = ({ title, value, icon, gradient, delay = 0 }: { title: string; value: string | number; icon: React.ReactNode; gradient: string; delay?: number }) => (
    <div 
      className="group bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-500 p-6 border border-gray-100 hover:border-blue-200 hover:-translate-y-1"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 ${gradient} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-sm text-gray-500">{title}</div>
    </div>
  );

  const MetricBar = ({ label, value, color }: { label: string; value: number; color: string }) => {
    const percentage = value * 100;
    return (
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-gray-600">{label}</span>
          <span className="text-sm font-semibold text-gray-900">{percentage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div 
            className={`h-2 rounded-full transition-all duration-500 ${color}`}
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      </div>
    );
  };

  const ModelCard = ({ title, subtitle, stats, metrics, gradient, icon, showPeak = true }: { 
    title: string; 
    subtitle: string; 
    stats: TextAnalysisStats; 
    metrics: ModelMetrics;
    gradient: string; 
    icon: React.ReactNode 
    showPeak?: boolean
  }) => (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 p-6 border border-gray-100 group">
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-12 h-12 ${gradient} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>
      
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">分析次数</span>
          <span className="text-lg font-bold text-gray-900">{stats.count}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600 flex items-center gap-1 relative group">
            平均响应时间
            <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="absolute left-0 top-6 w-48 p-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
              基于实际用户请求统计的平均处理时间
            </div>
          </span>
          <span className="text-lg font-bold text-gray-900">{(stats.avg_time * 1000).toFixed(1)}ms</span>
        </div>
      </div>
      
      {metrics.accuracy > 0 && (
        <div className="space-y-1 pt-4 border-t border-gray-100">
          <MetricBar label="准确率" value={metrics.accuracy} color="bg-gradient-to-r from-blue-500 to-cyan-400" />
          <MetricBar label="精确率" value={metrics.precision} color="bg-gradient-to-r from-purple-500 to-pink-400" />
          <MetricBar label="召回率" value={metrics.recall} color="bg-gradient-to-r from-orange-500 to-yellow-400" />
          <MetricBar label="F1值" value={metrics.f1_score} color="bg-gradient-to-r from-green-500 to-emerald-400" />
        </div>
      )}
      
      {showPeak && (stats.cpu_peak > 0 || stats.gpu_peak) && (
        <div className="mb-4 pt-4 border-t border-gray-100">
          <div className="text-sm font-medium text-gray-700 mb-2">资源使用峰值</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">CPU 峰值</div>
              <div className="text-xl font-bold text-blue-600">{stats.cpu_peak.toFixed(1)}%</div>
              <div className="text-xs text-gray-400 mt-1">平均 {stats.cpu_avg.toFixed(1)}%</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">GPU 峰值</div>
              <div className="text-xl font-bold text-green-600">
                {stats.gpu_peak !== null ? `${stats.gpu_peak.toFixed(1)}%` : 'N/A'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {stats.gpu_avg !== null ? `平均 ${stats.gpu_avg.toFixed(1)}%` : ''}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  const sentimentCounts = stats?.sentiment_counts || { positive: 0, negative: 0, neutral: 0 };
  const textAnalyses = stats?.text_analyses || { 
    model: { count: 0, total_time: 0, avg_time: 0, cpu_peak: 0, cpu_avg: 0, gpu_peak: null, gpu_avg: null }, 
    lexicon: { count: 0, total_time: 0, avg_time: 0, cpu_peak: 0, cpu_avg: 0, gpu_peak: null, gpu_avg: null }, 
    external: { count: 0, total_time: 0, avg_time: 0, cpu_peak: 0, cpu_avg: 0, gpu_peak: null, gpu_avg: null } 
  };
  const modelMetrics = stats?.model_metrics || { 
    model: { accuracy: 0, precision: 0, recall: 0, f1_score: 0 }, 
    lexicon: { accuracy: 0, precision: 0, recall: 0, f1_score: 0 }, 
    external: { accuracy: 0, precision: 0, recall: 0, f1_score: 0 } 
  };
  const currentUsage = stats?.current_usage || { cpu_percent: 0, gpu_percent: null, gpu_available: false };
  const gpuMemory = stats?.gpu_memory || { total_mb: 0, used_mb: 0, free_mb: 0, percent: 0, allocated_mb: 0, reserved_mb: 0, gpu_name: '' };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-orange-50 py-12 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-600 rounded-full text-sm font-medium mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            性能统计
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            系统性能概览
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            实时监控系统性能指标，全面了解各分析模型的准确性和效率
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="总分析次数"
            value={(stats?.total_analyses || 0).toLocaleString()}
            icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            gradient="bg-gradient-to-br from-blue-500 to-cyan-400"
            delay={0}
          />
          <StatCard
            title="正面情感"
            value={sentimentCounts.positive}
            icon={<span className="text-2xl">😊</span>}
            gradient="bg-gradient-to-br from-green-500 to-emerald-400"
            delay={100}
          />
          <StatCard
            title="负面情感"
            value={sentimentCounts.negative}
            icon={<span className="text-2xl">😔</span>}
            gradient="bg-gradient-to-br from-red-500 to-rose-400"
            delay={200}
          />
          <StatCard
            title="中性情感"
            value={sentimentCounts.neutral}
            icon={<span className="text-2xl">😐</span>}
            gradient="bg-gradient-to-br from-yellow-500 to-amber-400"
            delay={300}
          />
        </div>

        <div className="bg-white rounded-3xl shadow-lg p-8 mb-8 border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">CPU/GPU 使用率监控</h2>
              <div className="relative group">
                <svg className="w-5 h-5 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="absolute right-0 top-8 w-64 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                  每个数据点记录的是单次文本分析完成时的系统资源使用率，而非实时连续监控
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-gray-600">CPU: {currentUsage.cpu_percent}%</span>
              </div>
              {currentUsage.gpu_available && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-gray-600">GPU: {currentUsage.gpu_percent}%</span>
                </div>
              )}
            </div>
          </div>
          
          {cpuGpuHistory.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cpuGpuHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value) => [`${value}%`, ''] as [string, string]}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="cpu_percent" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={false}
                    name="CPU 使用率"
                    activeDot={{ r: 4, fill: '#3b82f6' }}
                  />
                  {currentUsage.gpu_available && (
                    <Line 
                      type="monotone" 
                      dataKey="gpu_percent" 
                      stroke="#22c55e" 
                      strokeWidth={2}
                      dot={false}
                      name="GPU 使用率"
                      activeDot={{ r: 4, fill: '#22c55e' }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p>暂无监控数据，进行文本分析后将显示</p>
              </div>
            </div>
          )}
        </div>

        {gpuMemory.total_mb > 0 && (
          <div className="bg-white rounded-3xl shadow-lg p-8 mb-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">GPU 显存监控</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-400 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">设备信息</h3>
                    <p className="text-sm text-gray-500">{gpuMemory.gpu_name}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">总显存</span>
                    <span className="font-bold text-gray-900">{gpuMemory.total_mb.toLocaleString()} MB</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">已用显存</span>
                    <span className="font-bold text-green-600">{gpuMemory.used_mb.toLocaleString()} MB</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">空闲显存</span>
                    <span className="font-bold text-gray-900">{gpuMemory.free_mb.toLocaleString()} MB</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 border border-blue-100">
                <h3 className="font-semibold text-gray-900 mb-4">显存使用率</h3>
                
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">系统显存</span>
                    <span className="text-sm font-semibold text-gray-900">{gpuMemory.percent.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div 
                      className="h-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
                      style={{ width: `${gpuMemory.percent}%` }}
                    ></div>
                  </div>
                </div>
                
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">PyTorch 分配</span>
                    <span className="text-sm font-semibold text-gray-900">{gpuMemory.allocated_mb.toLocaleString()} MB</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div 
                      className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                      style={{ width: `${(gpuMemory.allocated_mb / gpuMemory.total_mb * 100) || 0}%` }}
                    ></div>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">PyTorch 预留</span>
                    <span className="text-sm font-semibold text-gray-900">{gpuMemory.reserved_mb.toLocaleString()} MB</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div 
                      className="h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-400 transition-all duration-500"
                      style={{ width: `${(gpuMemory.reserved_mb / gpuMemory.total_mb * 100) || 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">显存说明</p>
                  <p className="text-blue-600">系统显存显示的是 GPU 整体显存使用情况；PyTorch 分配/预留显示的是当前进程使用的显存。推理时显存占用较低，训练时会显著增加。</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">方法对比分析</h2>
          </div>
          
          {(modelMetrics.model.accuracy > 0 || modelMetrics.lexicon.accuracy > 0) ? (
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">评估指标对比</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart 
                    data={[
                      {
                        name: '准确率',
                        '深度学习': Math.round(modelMetrics.model.accuracy * 100),
                        '情感词典': Math.round(modelMetrics.lexicon.accuracy * 100),
                      },
                      {
                        name: '精确率',
                        '深度学习': Math.round(modelMetrics.model.precision * 100),
                        '情感词典': Math.round(modelMetrics.lexicon.precision * 100),
                      },
                      {
                        name: '召回率',
                        '深度学习': Math.round(modelMetrics.model.recall * 100),
                        '情感词典': Math.round(modelMetrics.lexicon.recall * 100),
                      },
                      {
                        name: 'F1值',
                        '深度学习': Math.round(modelMetrics.model.f1_score * 100),
                        '情感词典': Math.round(modelMetrics.lexicon.f1_score * 100),
                      },
                    ]}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 50, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => [`${value}%`, '']} />
                    <Legend />
                    <Bar dataKey="深度学习" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="情感词典" fill="#a855f7" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">响应时间对比</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={[
                      {
                        name: '平均响应时间(ms)',
                        '深度学习': Math.round(textAnalyses.model.avg_time * 1000),
                        '情感词典': Math.round(textAnalyses.lexicon.avg_time * 1000),
                      },
                      {
                        name: '分析次数',
                        '深度学习': textAnalyses.model.count,
                        '情感词典': textAnalyses.lexicon.count,
                      },
                    ]}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="深度学习" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="情感词典" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100 mb-8 text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-gray-500 mb-2">暂无对比数据</p>
              <p className="text-sm text-gray-400">请在管理平台进行模型评估后查看对比结果</p>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">文本分析性能</h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <ModelCard
              title="本地深度学习模型"
              subtitle="基于神经网络的情感分析"
              stats={textAnalyses.model}
              metrics={modelMetrics.model}
              gradient="bg-gradient-to-br from-blue-500 to-cyan-400"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>}
            />
            <ModelCard
              title="情感词典分析"
              subtitle="基于词典规则的情感分析"
              stats={textAnalyses.lexicon}
              metrics={modelMetrics.lexicon}
              gradient="bg-gradient-to-br from-purple-500 to-pink-400"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
            />
            <ModelCard
              title="外部API分析"
              subtitle="调用云端AI服务分析"
              stats={textAnalyses.external}
              metrics={modelMetrics.external}
              gradient="bg-gradient-to-br from-green-500 to-emerald-400"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>}
              showPeak={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformancePage;
