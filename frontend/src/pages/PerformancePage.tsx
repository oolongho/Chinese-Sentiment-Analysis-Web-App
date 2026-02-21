import React from 'react';

const PerformancePage: React.FC = () => {
  const performanceData = {
    textAnalysis: {
      deepLearning: {
        averageTime: 0.045,
        accuracy: 0.89,
        f1Score: 0.87,
        precision: 0.88,
        recall: 0.86
      },
      lexicon: {
        averageTime: 0.012,
        accuracy: 0.82,
        f1Score: 0.80,
        precision: 0.81,
        recall: 0.79
      }
    },
    audioAnalysis: {
      voiceModel: {
        averageTime: 0.120,
        accuracy: 0.91,
        f1Score: 0.89,
        precision: 0.90,
        recall: 0.88
      },
      deepLearning: {
        averageTime: 0.050,
        accuracy: 0.89,
        f1Score: 0.87,
        precision: 0.88,
        recall: 0.86
      },
      lexicon: {
        averageTime: 0.010,
        accuracy: 0.82,
        f1Score: 0.80,
        precision: 0.81,
        recall: 0.79
      }
    },
    statistics: {
      totalAnalyses: 1247,
      positiveCount: 789,
      negativeCount: 234,
      neutralCount: 224,
      averageResponseTime: 0.068
    }
  };

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

  const MetricBar = ({ label, value, color, maxValue = 1 }: { label: string; value: number; color: string; maxValue?: number }) => {
    const percentage = (value / maxValue) * 100;
    return (
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">{label}</span>
          <span className="text-sm font-semibold text-gray-900">{(value * 100).toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div 
            className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${color}`}
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      </div>
    );
  };

  const ModelCard = ({ title, subtitle, data, gradient, icon }: { title: string; subtitle: string; data: any; gradient: string; icon: React.ReactNode }) => (
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
      
      <div className="space-y-1">
        <MetricBar label="准确率" value={data.accuracy} color="bg-gradient-to-r from-blue-500 to-cyan-400" />
        <MetricBar label="精确率" value={data.precision} color="bg-gradient-to-r from-purple-500 to-pink-400" />
        <MetricBar label="召回率" value={data.recall} color="bg-gradient-to-r from-orange-500 to-yellow-400" />
        <MetricBar label="F1值" value={data.f1Score} color="bg-gradient-to-r from-green-500 to-emerald-400" />
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">平均分析时间</span>
          <span className="text-lg font-bold text-gray-900">{(data.averageTime * 1000).toFixed(1)}ms</span>
        </div>
      </div>
    </div>
  );

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          <StatCard
            title="总分析次数"
            value={performanceData.statistics.totalAnalyses.toLocaleString()}
            icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            gradient="bg-gradient-to-br from-blue-500 to-cyan-400"
            delay={0}
          />
          <StatCard
            title="正面情感"
            value={performanceData.statistics.positiveCount}
            icon={<span className="text-2xl">😊</span>}
            gradient="bg-gradient-to-br from-green-500 to-emerald-400"
            delay={100}
          />
          <StatCard
            title="负面情感"
            value={performanceData.statistics.negativeCount}
            icon={<span className="text-2xl">😔</span>}
            gradient="bg-gradient-to-br from-red-500 to-rose-400"
            delay={200}
          />
          <StatCard
            title="中性情感"
            value={performanceData.statistics.neutralCount}
            icon={<span className="text-2xl">😐</span>}
            gradient="bg-gradient-to-br from-yellow-500 to-amber-400"
            delay={300}
          />
        </div>

        <div className="bg-white rounded-3xl shadow-lg p-8 mb-8 border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">平均响应时间</h2>
            </div>
            <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-400">
              {(performanceData.statistics.averageResponseTime * 1000).toFixed(1)}ms
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {['10ms', '25ms', '50ms', '100ms', '200ms'].map((time, index) => (
              <div key={time} className="text-center">
                <div className={`h-2 rounded-full ${index < 3 ? 'bg-gradient-to-r from-green-500 to-emerald-400' : index < 4 ? 'bg-gradient-to-r from-yellow-500 to-amber-400' : 'bg-gradient-to-r from-red-500 to-rose-400'}`}></div>
                <span className="text-xs text-gray-500 mt-1 block">{time}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between text-sm text-gray-500">
            <span>快速</span>
            <span>中等</span>
            <span>较慢</span>
          </div>
        </div>

        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">文本分析性能</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <ModelCard
              title="深度学习模型"
              subtitle="基于神经网络的情感分析"
              data={performanceData.textAnalysis.deepLearning}
              gradient="bg-gradient-to-br from-blue-500 to-cyan-400"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>}
            />
            <ModelCard
              title="情感词典分析"
              subtitle="基于词典规则的情感分析"
              data={performanceData.textAnalysis.lexicon}
              gradient="bg-gradient-to-br from-purple-500 to-pink-400"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">音频分析性能</h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <ModelCard
              title="语音大模型"
              subtitle="直接分析语音情感"
              data={performanceData.audioAnalysis.voiceModel}
              gradient="bg-gradient-to-br from-purple-500 to-pink-400"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>}
            />
            <ModelCard
              title="文字大模型"
              subtitle="转文字后分析"
              data={performanceData.audioAnalysis.deepLearning}
              gradient="bg-gradient-to-br from-blue-500 to-cyan-400"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>}
            />
            <ModelCard
              title="情感词典"
              subtitle="基于词典规则"
              data={performanceData.audioAnalysis.lexicon}
              gradient="bg-gradient-to-br from-orange-500 to-yellow-400"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformancePage;
