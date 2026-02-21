import React from 'react';
import { Link, NavLink } from 'react-router-dom';

const Header: React.FC = () => {
  return (
    <header className="bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400 shadow-lg sticky top-0 z-50 backdrop-blur-sm">
      <div className="container mx-auto px-6 py-4 flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold text-white flex items-center group">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mr-3 group-hover:bg-white/30 transition-all duration-300">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="group-hover:tracking-wide transition-all duration-300">中文情感分析系统</span>
        </Link>
        
        <nav>
          <ul className="flex space-x-2">
            <li>
              <NavLink 
                to="/" 
                className={({ isActive }) => 
                  `relative px-5 py-2.5 rounded-full font-medium transition-all duration-300 ${
                    isActive 
                      ? 'bg-white text-blue-500 shadow-md' 
                      : 'text-white/90 hover:bg-white/20 hover:text-white'
                  }`
                }
              >
                首页
              </NavLink>
            </li>
            <li>
              <NavLink 
                to="/text-analysis" 
                className={({ isActive }) => 
                  `relative px-5 py-2.5 rounded-full font-medium transition-all duration-300 ${
                    isActive 
                      ? 'bg-white text-blue-500 shadow-md' 
                      : 'text-white/90 hover:bg-white/20 hover:text-white'
                  }`
                }
              >
                文本分析
              </NavLink>
            </li>
            <li>
              <NavLink 
                to="/audio-analysis" 
                className={({ isActive }) => 
                  `relative px-5 py-2.5 rounded-full font-medium transition-all duration-300 ${
                    isActive 
                      ? 'bg-white text-blue-500 shadow-md' 
                      : 'text-white/90 hover:bg-white/20 hover:text-white'
                  }`
                }
              >
                音频分析
              </NavLink>
            </li>
            <li>
              <NavLink 
                to="/performance" 
                className={({ isActive }) => 
                  `relative px-5 py-2.5 rounded-full font-medium transition-all duration-300 ${
                    isActive 
                      ? 'bg-white text-blue-500 shadow-md' 
                      : 'text-white/90 hover:bg-white/20 hover:text-white'
                  }`
                }
              >
                性能统计
              </NavLink>
            </li>
            <li>
              <NavLink 
                to="/training" 
                className={({ isActive }) => 
                  `relative px-5 py-2.5 rounded-full font-medium transition-all duration-300 ${
                    isActive 
                      ? 'bg-white text-blue-500 shadow-md' 
                      : 'text-white/90 hover:bg-white/20 hover:text-white'
                  }`
                }
              >
                管理平台
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
