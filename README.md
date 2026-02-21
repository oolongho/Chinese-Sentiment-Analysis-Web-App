# 中文情感分析系统

一个基于深度学习和情感词典的中文情感分析Web应用，支持文本和音频情感分析。

## 功能特点

- **文本情感分析**：支持多行批量分析，每行文本独立分析情感
- **音频情感分析**：上传音频文件，自动转文字后分析情感(开发中)
- **三通道分析**：
  - 深度学习模型（基于 `hfl/chinese-roberta-wwm-ext`）
  - 情感词典分析（基于规则）
  - 外部API分析（支持OpenAI格式）
- **训练管理平台**：支持模型训练、词典管理、外部API配置

## 技术栈

### 前端
- React 18 + TypeScript
- Tailwind CSS
- Vite

### 后端
- Python 3.10+
- FastAPI
- PyTorch + Transformers
- Whisper（语音识别）

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/oolongho/Chinese-Sentiment-Analysis-Web-App.git
cd Chinese-Sentiment-Analysis-Web-App
```

### 2. 后端配置

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或 venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 启动后端服务
python main.py
```

### 3. 前端配置

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 4. 访问应用

- 前端：http://localhost:5173
- 后端API：http://localhost:8000
- API文档：http://localhost:8000/docs

## 模型训练（待完善）

1. 准备标注数据（`data/labeled_data.xlsx`）
2. 访问管理平台（http://localhost:5173/training）
3. 配置训练参数并开始训练

## 外部API配置

在管理平台的外部API标签页配置：
- API Key
- Base URL
- 模型名称

支持OpenAI兼容的API（如DeepSeek、通义千问等）。

## 项目结构

```
├── backend/
│   ├── routers/          # API路由
│   ├── sentiment/        # 情感分析模块
│   ├── services/         # 外部服务
│   ├── utils/            # 工具函数
│   ├── config.py         # 配置文件
│   └── main.py           # 入口文件
├── frontend/
│   ├── src/
│   │   ├── components/   # 组件
│   │   └── pages/        # 页面
│   └── public/           # 静态资源
└── data/                 # 数据文件
    ├── labeled_data.xlsx # 标注数据
    └── *_words.txt       # 情感词典
```

## License

MIT
