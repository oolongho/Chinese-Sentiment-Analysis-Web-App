# 中文情感分析 Web 应用

基于深度学习和情感词典的中文情感分析系统，支持文本和音频情感分析。

## 功能特性

- **多种分析方式**
  - 深度学习模型分析（基于 chinese-roberta-wwm-ext）
  - 情感词典分析
  - 外部 API 分析（支持 OpenAI 格式）

- **批量处理**
  - 支持多行文本批量分析
  - 分页显示分析结果

- **管理平台**
  - 情感词典管理（增删改查、热更新）
  - 外部 API 配置
  - 模型训练参数配置

## 技术栈

### 后端
- Python 3.10
- FastAPI
- PyTorch 2.6.0
- Transformers (Hugging Face)
- Jieba 分词

### 前端
- React 18
- TypeScript
- Tailwind CSS
- Vite

## 项目结构

```
├── backend/
│   ├── main.py              # FastAPI 入口
│   ├── config.py            # 配置文件
│   ├── routers/
│   │   ├── text_analysis.py # 文本分析路由
│   │   ├── audio_analysis.py# 音频分析路由
│   │   └── training.py      # 管理平台路由
│   ├── sentiment/
│   │   ├── model_analyzer.py    # 深度学习分析器
│   │   ├── lexicon_analyzer.py  # 词典分析器
│   │   └── model_trainer.py     # 模型训练脚本
│   └── models/              # 训练好的模型
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── TextAnalysisPage.tsx
│       │   ├── AudioAnalysisPage.tsx
│       │   └── TrainingPage.tsx
│       └── components/
└── data/
    ├── labeled_data.xlsx    # 训练数据
    ├── test_data.xlsx       # 测试数据
    ├── positive_words.txt   # 正面词典
    └── negative_words.txt   # 负面词典
```

## 快速开始

### 环境要求
- Python 3.10+
- Node.js 18+
- CUDA（可选，用于 GPU 加速）

### 后端安装

```bash
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

使用已有的标注数据训练模型：

```bash
python -m backend.sentiment.model_trainer
```

训练参数可在 `backend/config.py` 中配置。

## 外部 API 配置

在管理平台配置外部 API（如 OpenAI、DeepSeek、通义千问等）：

1. 登录管理平台（默认密码：`123456Aa.`）
2. 进入"外部 API"标签
3. 填写 API Key、Base URL、模型名称

## 情感词典管理

在管理平台可以：
- 查看和搜索词典词汇
- 添加新词汇（支持设置权重）
- 删除词汇
- 点击"保存并同步"使修改立即生效

## 许可证

MIT License
