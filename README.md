# 中文情感分析 Web 应用

基于深度学习和情感词典的中文情感分析系统，支持文本和音频情感分析。

![Python](https://img.shields.io/badge/Python-3.10-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green)
![React](https://img.shields.io/badge/React-18-blue)
![PyTorch](https://img.shields.io/badge/PyTorch-2.6-orange)

## 功能特性

### 多通道分析
- **深度学习模型分析** - 基于 chinese-roberta-wwm-ext 预训练模型
- **情感词典分析** - 基于情感词典和规则的分析方法
- **外部 API 分析** - 支持 OpenAI、DeepSeek、通义千问等 API

### 文本分析
- 支持单条和批量文本输入
- 多通道并行分析，结果对比展示
- 分析结果导出（Excel 格式）
- 性能数据导出

### 音频分析
- 音频文件上传（支持 mp3、wav、m4a 等格式）
- 波形可视化预览
- 语音转文字 + 情感分析

### 模型训练
- 自定义训练数据集
- 训练参数配置（轮次、批次大小、学习率等）
- 模型自动保存和加载

### 模型评估
- 上传测试数据集评估模型性能
- 计算准确率、精确率、召回率、F1分数
- 多分析器对比评估

### 管理平台
- 情感词典管理（增删改查、热更新）
- 外部 API 配置
- 训练参数配置
- 性能统计报告

## 技术栈

### 前端
- React 18 + TypeScript
- Tailwind CSS
- Vite
- React Router

### 后端
- FastAPI
- PyTorch 2.6.0
- Transformers (Hugging Face)
- Jieba 分词
- Uvicorn

## 项目结构

```
├── backend/
│   ├── main.py                 # FastAPI 入口
│   ├── config.py               # 配置文件
│   ├── routers/
│   │   ├── text_analysis.py    # 文本分析路由
│   │   ├── audio_analysis.py   # 音频分析路由
│   │   ├── training.py         # 管理平台路由
│   │   ├── evaluation.py       # 模型评估路由
│   │   └── performance.py      # 性能统计路由
│   ├── sentiment/
│   │   ├── model_analyzer.py   # 深度学习分析器
│   │   ├── lexicon_analyzer.py # 词典分析器
│   │   └── model_trainer.py    # 模型训练脚本
│   ├── services/
│   │   └── system_monitor.py   # 系统监控服务
│   └── models/                 # 训练好的模型
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── HomePage.tsx
│       │   ├── TextAnalysisPage.tsx
│       │   ├── AudioAnalysisPage.tsx
│       │   ├── PerformancePage.tsx
│       │   └── TrainingPage.tsx
│       └── components/
├── data/
│   ├── labeled_data.xlsx       # 训练数据
│   ├── test_data.xlsx          # 测试数据
│   ├── positive_words.txt      # 正面词典
│   ├── negative_words.txt      # 负面词典
│   ├── degree_words.txt        # 程度副词词典
│   └── negation_words.txt      # 否定词词典
└── requirements.txt
```

## 快速开始

### 环境要求
- Python 3.10+
- Node.js 18+
- CUDA（可选，用于 GPU 加速）

### 后端安装

```bash
# 克隆项目
git clone https://github.com/oolongho/Chinese-Sentiment-Analysis-Web-App.git
cd Chinese-Sentiment-Analysis-Web-App

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
.\venv\Scripts\activate   # Windows

# 安装依赖
pip install -r requirements.txt

# 启动后端服务
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 前端安装

```bash
cd frontend
npm install
npm run dev
```

### 访问应用

- 前端页面: http://localhost:5173
- API 文档: http://localhost:8000/docs
- 管理平台: http://localhost:5173/training

## 模型训练

### 使用 Web 界面训练

1. 准备训练数据（Excel 格式）
2. 访问管理平台 → 训练模型
3. 上传训练数据
4. 配置训练参数
5. 点击"开始训练"

### 使用命令行训练

```bash
python -m backend.sentiment.model_trainer
```

训练参数可在 `backend/config.py` 中配置。

## 数据格式

### 训练/测试数据格式

Excel 文件（.xlsx）需要包含以下列：

| 列名 | 说明 | 是否必需 | 示例 |
|------|------|----------|------|
| `产品` | 产品名称 | 可选 | "手机" |
| `文本` | 待分析的文本内容 | 必需 | "这个产品质量很好" |
| `标签` | 情感标签 | 必需 | `正面`、`负面`、`中性` |

### 情感词典格式

```
# 正面词典 (positive_words.txt)
不错,2
满意,3
很好,3

# 负面词典 (negative_words.txt)
差,-2
失望,-2
噪音,-2

# 程度副词 (degree_words.txt)
非常,1.8
很,1.5
超级,2.0

# 否定词 (negation_words.txt)
不
没
无
```

## 外部 API 配置

在管理平台配置外部 API（如 OpenAI、DeepSeek、通义千问等）：

1. 登录管理平台（默认密码：`123456Aa.`）
2. 进入"外部 API"标签
3. 填写 API Key、Base URL、模型名称

### 支持的 API 格式
- OpenAI API
- DeepSeek API
- 通义千问 API
- 其他兼容 OpenAI 格式的 API

## 情感词典管理

在管理平台可以：
- 查看和搜索词典词汇
- 添加新词汇（支持设置权重）
- 删除词汇
- 点击"保存并同步"使修改立即生效

## 性能监控

- 实时 CPU/GPU 使用率监控
- 分析响应时间统计
- 分析次数统计
- 性能数据导出

## 许可证

MIT License

## 作者

oolongho

## 致谢

- 毕设导师
- 女朋友（人工校验标签）
- [chinese-roberta-wwm-ext](https://github.com/ymcui/Chinese-BERT-wwm) - 预训练模型
- [Hugging Face Transformers](https://huggingface.co/) - 模型框架
- [FastAPI](https://fastapi.tiangolo.com/) - 后端框架
- [React](https://react.dev/) - 前端框架
