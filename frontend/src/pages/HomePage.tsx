import React from 'react';
import { Link } from 'react-router-dom';

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-blue-50">
      <section className="relative py-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-cyan-400/10 to-blue-500/10"></div>
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-cyan-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        
        <div className="container mx-auto max-w-6xl text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-600 rounded-full text-sm font-medium mb-6">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
            oolongho的毕业设计
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            中文情感分析系统
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-400">
              精准识别情感倾向
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed">
            融合情感词典与深度学习多通道分析技术，为您提供高精度的文本和音频情感分析服务，助力商业决策与舆情监控
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link 
              to="/text-analysis" 
              className="group px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white font-semibold rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              文本情感分析
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link 
              to="/audio-analysis" 
              className="group px-8 py-4 bg-white hover:bg-gray-50 text-gray-800 font-semibold rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 border border-gray-200 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              音频情感分析
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              核心功能
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              多维度情感分析能力，满足不同场景需求
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="group bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-500 p-8 border border-gray-100 hover:border-blue-200 hover:-translate-y-2">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">文本情感分析</h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                支持单条和批量文本输入，通过多通道分析技术，精准识别情感极性
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-medium">正面/负面/中性</span>
                <span className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-xs font-medium">批量处理</span>
              </div>
            </div>

            <div className="group bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-500 p-8 border border-gray-100 hover:border-blue-200 hover:-translate-y-2">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">音频情感分析</h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                支持音频上传、波形可视化和播放，通过多通道分析技术识别语音情感
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-purple-50 text-purple-600 rounded-full text-xs font-medium">语音识别</span>
                <span className="px-3 py-1 bg-pink-50 text-pink-600 rounded-full text-xs font-medium">波形预览</span>
              </div>
            </div>

            <div className="group bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-500 p-8 border border-gray-100 hover:border-blue-200 hover:-translate-y-2">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-yellow-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">性能统计</h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                提供详细的性能报告，包括分析时长、准确率、F1值等关键指标
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-orange-50 text-orange-600 rounded-full text-xs font-medium">可视化图表</span>
                <span className="px-3 py-1 bg-yellow-50 text-yellow-600 rounded-full text-xs font-medium">实时统计</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gradient-to-r from-gray-50 to-blue-50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              工作原理
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              多通道分析技术，确保结果的准确性和可靠性
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="relative">
              <div className="absolute top-12 left-full w-full h-0.5 bg-gradient-to-r from-blue-300 to-transparent hidden md:block"></div>
              <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                  <span className="text-2xl font-bold text-white">1</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">数据输入</h3>
                <p className="text-gray-600">
                  用户输入文本或上传音频文件，系统接收并预处理输入数据
                </p>
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute top-12 left-full w-full h-0.5 bg-gradient-to-r from-blue-300 to-transparent hidden md:block"></div>
              <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                  <span className="text-2xl font-bold text-white">2</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">多通道分析</h3>
                <p className="text-gray-600">
                  系统同时使用情感词典、深度学习模型和外部API进行分析
                </p>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-yellow-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <span className="text-2xl font-bold text-white">3</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">结果输出</h3>
              <p className="text-gray-600">
                系统生成详细的分析报告，包括情感极性、置信度和性能指标
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400 rounded-3xl p-12 text-center text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2"></div>
            
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                开始使用中文情感分析系统
              </h2>
              <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
                立即体验精准的情感分析服务，助力您的业务决策
              </p>
              <Link 
                to="/text-analysis" 
                className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-500 font-semibold rounded-2xl hover:bg-gray-50 transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1"
              >
                立即开始
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
