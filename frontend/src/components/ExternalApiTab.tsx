import React, { useEffect, useState } from 'react';
import { useExternalApi } from '../hooks/useExternalApi';
import type { ExternalApiConfig } from '../types/training';

interface ExternalApiTabProps {
  token: string;
}

const ExternalApiTab: React.FC<ExternalApiTabProps> = ({ token }) => {
  const { config, setConfig, loadExternalApiConfig, updateConfig } = useExternalApi(token);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExternalApiConfig();
  }, [loadExternalApiConfig]);

  const handleSave = async () => {
    setSaving(true);
    const result = await updateConfig(config);
    alert(result.message);
    setSaving(false);
  };

  const updateField = <K extends keyof ExternalApiConfig>(
    field: K,
    value: ExternalApiConfig[K]
  ) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-gray-900 mb-2">外部API配置</h3>
      <p className="text-gray-500 text-sm mb-6">配置外部AI平台的API，用于文本和音频分析。支持OpenAI格式的API。</p>
      
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-100 mb-6">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-1">说明</h4>
            <p className="text-gray-600 text-sm">
              外部API用于调用云端AI服务进行分析，无需本地训练。支持OpenAI、DeepSeek、通义千问等兼容OpenAI格式的API。
            </p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* 文本分析API */}
        <div className="space-y-4">
          <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            文本分析API
            <button
              type="button"
              onClick={() => updateField('text_enabled', !config.text_enabled)}
              className={`ml-auto relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                config.text_enabled ? 'bg-gradient-to-r from-blue-500 to-cyan-400' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                  config.text_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </h4>

          <div>
            <label className="block text-gray-700 font-medium mb-2">API Key</label>
            <input
              type="password"
              value={config.text_api_key}
              onChange={(e) => updateField('text_api_key', e.target.value)}
              placeholder="sk-..."
              className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
            />
          </div>
          
          <div>
            <label className="block text-gray-700 font-medium mb-2">Base URL</label>
            <input
              type="text"
              value={config.text_base_url}
              onChange={(e) => updateField('text_base_url', e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
            />
          </div>
          
          <div>
            <label className="block text-gray-700 font-medium mb-2">模型名称</label>
            <input
              type="text"
              value={config.text_model}
              onChange={(e) => updateField('text_model', e.target.value)}
              placeholder="gpt-4 / deepseek-chat / qwen-turbo"
              className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
            />
          </div>
        </div>
        
        {/* 语音分析API */}
        <div className="space-y-4">
          <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-400 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            语音分析API
            <button
              type="button"
              onClick={() => updateField('audio_enabled', !config.audio_enabled)}
              className={`ml-auto relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                config.audio_enabled ? 'bg-gradient-to-r from-purple-500 to-pink-400' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                  config.audio_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </h4>

          <div>
            <label className="block text-gray-700 font-medium mb-2">API Key</label>
            <input
              type="password"
              value={config.audio_api_key}
              onChange={(e) => updateField('audio_api_key', e.target.value)}
              placeholder="sk-..."
              className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
            />
          </div>
          
          <div>
            <label className="block text-gray-700 font-medium mb-2">Base URL</label>
            <input
              type="text"
              value={config.audio_base_url}
              onChange={(e) => updateField('audio_base_url', e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
            />
          </div>
          
          <div>
            <label className="block text-gray-700 font-medium mb-2">模型名称</label>
            <input
              type="text"
              value={config.audio_model}
              onChange={(e) => updateField('audio_model', e.target.value)}
              placeholder="whisper-1"
              className="w-full border-2 border-gray-200 rounded-xl p-4 focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all duration-300"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-600 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 disabled:opacity-50 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          保存配置
        </button>
      </div>
    </div>
  );
};

export default ExternalApiTab;
