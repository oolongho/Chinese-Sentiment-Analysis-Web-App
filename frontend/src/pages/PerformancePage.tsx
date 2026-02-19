import React from 'react';

const PerformancePage: React.FC = () => {
  // 模拟性能数据
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

  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="container mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">
          性能统计
        </h1>

        {/* 总体统计 */}
        <div className="bg-white rounded-xl shadow-md p-8 mb-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            总体统计
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {performanceData.statistics.totalAnalyses}
              </div>
              <div className="text-gray-600">总分析次数</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {performanceData.statistics.positiveCount}
              </div>
              <div className="text-gray-600">正面情感</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-red-600 mb-2">
                {performanceData.statistics.negativeCount}
              </div>
              <div className="text-gray-600">负面情感</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-yellow-600 mb-2">
                {performanceData.statistics.neutralCount}
              </div>
              <div className="text-gray-600">中性情感</div>
            </div>
          </div>
          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div className="text-gray-600">平均响应时间</div>
              <div className="text-lg font-semibold text-gray-800">
                {(performanceData.statistics.averageResponseTime * 1000).toFixed(1)}ms
              </div>
            </div>
          </div>
        </div>

        {/* 文本分析性能 */}
        <div className="bg-white rounded-xl shadow-md p-8 mb-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            文本分析性能
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {/* 文字大模型分析 */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                文字大模型分析
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">平均分析时间</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.textAnalysis.deepLearning.averageTime * 1000).toFixed(1)}ms
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">准确率</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.textAnalysis.deepLearning.accuracy * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">F1值</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.textAnalysis.deepLearning.f1Score * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">精确率</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.textAnalysis.deepLearning.precision * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">召回率</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.textAnalysis.deepLearning.recall * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* 情感词典分析 */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                情感词典分析
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">平均分析时间</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.textAnalysis.lexicon.averageTime * 1000).toFixed(1)}ms
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">准确率</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.textAnalysis.lexicon.accuracy * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">F1值</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.textAnalysis.lexicon.f1Score * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">精确率</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.textAnalysis.lexicon.precision * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">召回率</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.textAnalysis.lexicon.recall * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 音频分析性能 */}
        <div className="bg-white rounded-xl shadow-md p-8 mb-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            音频分析性能
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {/* 语音大模型分析 */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                语音大模型分析
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">平均分析时间</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.audioAnalysis.voiceModel.averageTime * 1000).toFixed(1)}ms
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">准确率</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.audioAnalysis.voiceModel.accuracy * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">F1值</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.audioAnalysis.voiceModel.f1Score * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* 文字大模型分析 */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                文字大模型分析
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">平均分析时间</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.audioAnalysis.deepLearning.averageTime * 1000).toFixed(1)}ms
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">准确率</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.audioAnalysis.deepLearning.accuracy * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">F1值</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.audioAnalysis.deepLearning.f1Score * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* 情感词典分析 */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                情感词典分析
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">平均分析时间</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.audioAnalysis.lexicon.averageTime * 1000).toFixed(1)}ms
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">准确率</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.audioAnalysis.lexicon.accuracy * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">F1值</div>
                  <div className="text-sm font-medium text-gray-800">
                    {(performanceData.audioAnalysis.lexicon.f1Score * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 性能对比 */}
        <div className="bg-white rounded-xl shadow-md p-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            性能对比
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    分析方法
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    平均分析时间
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    准确率
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    F1值
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    语音大模型
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(performanceData.audioAnalysis.voiceModel.averageTime * 1000).toFixed(1)}ms
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(performanceData.audioAnalysis.voiceModel.accuracy * 100).toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(performanceData.audioAnalysis.voiceModel.f1Score * 100).toFixed(1)}%
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    文字大模型
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(performanceData.textAnalysis.deepLearning.averageTime * 1000).toFixed(1)}ms
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(performanceData.textAnalysis.deepLearning.accuracy * 100).toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(performanceData.textAnalysis.deepLearning.f1Score * 100).toFixed(1)}%
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    情感词典
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(performanceData.textAnalysis.lexicon.averageTime * 1000).toFixed(1)}ms
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(performanceData.textAnalysis.lexicon.accuracy * 100).toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(performanceData.textAnalysis.lexicon.f1Score * 100).toFixed(1)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformancePage;
