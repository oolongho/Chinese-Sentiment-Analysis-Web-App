import React from 'react';
import { Link, NavLink } from 'react-router-dom';

const Header: React.FC = () => {
  return (
    <header className="bg-white shadow-md py-4 sticky top-0 z-50">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold text-blue-500 flex items-center">
          <svg className="w-8 h-8 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
          </svg>
          中文情感分析系统
        </Link>
        
        <nav>
          <ul className="flex space-x-6">
            <li>
              <NavLink 
                to="/" 
                className={({ isActive }) => 
                  isActive ? 'text-blue-500 font-medium' : 'text-gray-600 hover:text-blue-500'
                }
              >
                首页
              </NavLink>
            </li>
            <li>
              <NavLink 
                to="/text-analysis" 
                className={({ isActive }) => 
                  isActive ? 'text-blue-500 font-medium' : 'text-gray-600 hover:text-blue-500'
                }
              >
                文本分析
              </NavLink>
            </li>
            <li>
              <NavLink 
                to="/audio-analysis" 
                className={({ isActive }) => 
                  isActive ? 'text-blue-500 font-medium' : 'text-gray-600 hover:text-blue-500'
                }
              >
                音频分析
              </NavLink>
            </li>
            <li>
              <NavLink 
                to="/performance" 
                className={({ isActive }) => 
                  isActive ? 'text-blue-500 font-medium' : 'text-gray-600 hover:text-blue-500'
                }
              >
                性能统计
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
