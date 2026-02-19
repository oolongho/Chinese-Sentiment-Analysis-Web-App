import { useState } from 'react'
import './App.css'

function App() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleAnalyze = async () => {
    if (!text.trim()) return
    
    setLoading(true)
    try {
      // 模拟API调用
      setTimeout(() => {
        setResult({
          text: text,
          sentiment: 'positive',
          confidence: 0.95,
          method: '情感词典法'
        })
        setLoading(false)
      }, 1000)
    } catch (error) {
      console.error('分析失败:', error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-blue-800 mb-4">
            中文情感分析系统
          </h1>
          <p className="text-gray-600 text-lg">
            分析文本和音频的情感极性，支持多通道分析
          </p>
        </header>

        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-blue-700 mb-6">
            文本情感分析
          </h2>
          
          <div className="mb-6">
            <label htmlFor="text-input" className="block text-gray-700 font-medium mb-2">
              输入文本
            </label>
            <textarea
              id="text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="请输入要分析的中文文本..."
              className="w-full border border-gray-300 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              rows={5}
            />
          </div>
          
          <button
            onClick={handleAnalyze}
            disabled={loading || !text.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? '分析中...' : '开始分析'}
          </button>
        </div>

        {result && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-blue-700 mb-6">
              分析结果
            </h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-gray-700 font-medium">输入文本</h3>
                <p className="text-gray-800 bg-gray-50 p-3 rounded-lg">
                  {result.text}
                </p>
              </div>
              
              <div>
                <h3 className="text-gray-700 font-medium">情感极性</h3>
                <p className={`text-lg font-semibold p-3 rounded-lg ${
                  result.sentiment === 'positive' ? 'bg-green-100 text-green-800' :
                  result.sentiment === 'negative' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {result.sentiment === 'positive' ? '正面' :
                   result.sentiment === 'negative' ? '负面' :
                   '中性'}
                </p>
              </div>
              
              <div>
                <h3 className="text-gray-700 font-medium">置信度</h3>
                <p className="text-gray-800">
                  {Math.round(result.confidence * 100)}%
                </p>
              </div>
              
              <div>
                <h3 className="text-gray-700 font-medium">分析方法</h3>
                <p className="text-gray-800">
                  {result.method}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
