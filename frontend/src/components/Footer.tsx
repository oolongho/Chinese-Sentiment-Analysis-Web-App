import React, { useState } from 'react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [copied, setCopied] = useState(false);

  const copyEmail = () => {
    navigator.clipboard.writeText('1678132646@qq.com');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <footer className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white mt-16">
      <div className="container mx-auto px-6 py-12">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-xl font-bold">中文情感分析系统</h3>
            </div>
            <p className="text-gray-400 leading-relaxed">
              基于深度学习和情感词典的多通道情感分析解决方案，为您提供精准的文本和音频情感分析服务。
            </p>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4 text-white">核心功能</h4>
            <ul className="space-y-2 text-gray-400">
              <li className="flex items-center gap-2 hover:text-blue-400 transition-colors cursor-pointer">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                文本情感分析
              </li>
              <li className="flex items-center gap-2 hover:text-blue-400 transition-colors cursor-pointer">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                音频情感分析
              </li>
              <li className="flex items-center gap-2 hover:text-blue-400 transition-colors cursor-pointer">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                性能统计报告
              </li>
              <li className="flex items-center gap-2 hover:text-blue-400 transition-colors cursor-pointer">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                批量数据处理
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4 text-white">技术栈</h4>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500 mb-1.5">前端</p>
                <div className="flex flex-wrap gap-1.5">
                  {['React', 'TypeScript', 'Tailwind CSS', 'Vite'].map((tech) => (
                    <span 
                      key={tech}
                      className="px-2 py-0.5 bg-white/10 rounded-full text-xs text-gray-400 hover:bg-blue-500/20 hover:text-blue-400 transition-all duration-300 cursor-pointer"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1.5">后端</p>
                <div className="flex flex-wrap gap-1.5">
                  {['FastAPI', 'PyTorch', 'Transformers', 'Uvicorn'].map((tech) => (
                    <span 
                      key={tech}
                      className="px-2 py-0.5 bg-white/10 rounded-full text-xs text-gray-400 hover:bg-green-500/20 hover:text-green-400 transition-all duration-300 cursor-pointer"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-700 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center space-x-4">
              <a 
                href="https://github.com/oolongho/Chinese-Sentiment-Analysis-Web-App" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-blue-500 transition-all duration-300 group"
              >
                <svg className="w-5 h-5 text-gray-400 group-hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
              <button 
                onClick={copyEmail}
                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-blue-500 transition-all duration-300 group relative"
              >
                <svg className="w-5 h-5 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {copied && (
                  <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-green-500 text-white text-xs rounded whitespace-nowrap">
                    已复制!
                  </span>
                )}
              </button>
              <a 
                href="#" 
                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-blue-500 transition-all duration-300 group"
              >
                <svg className="w-5 h-5 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                </svg>
              </a>
            </div>
            
            <p className="text-gray-500 text-sm">
              © {currentYear} oolongho 保留所有权利.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
