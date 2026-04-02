# 中文情感分析系统

一个功能完整的中文情感分析平台，集成深度学习、情感词典、混合模型和外部 API 四种分析通道。支持模型训练、评估、消融实验、词典增强、模型量化等全流程研究。

!\[Python]\(https\://img.shields.io/badge/Python-3.10-blue null)
!\[FastAPI]\(https\://img.shields.io/badge/FastAPI-0.100+-green null)
!\[React]\(https\://img.shields.io/badge/React-18-blue null)
!\[PyTorch]\(https\://img.shields.io/badge/PyTorch-2.6-orange null)

## 功能特性

### 多通道分析

- **深度学习模型分析** - 基于 chinese-roberta-wwm-ext 预训练模型
- **情感词典分析** - 基于情感词典和规则的分析方法
- **混合模型分析** - 词典+深度学习混合分析，平衡速度与准确率
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
- 训练参数配置
  - 基础参数：轮次、批次大小、学习率、最大序列长度
  - 高级优化：Label Smoothing、Cosine 学习率调度、Warmup、权重衰减
- 模型自动保存和加载
- 训练曲线可视化
- GPU 显存监控

### 模型评估

- 上传测试数据集评估模型性能
- 计算准确率、精确率、召回率、F1分数
- 多分析器对比评估（深度学习/词典/混合/外部API）
- 混合模型阈值调优
- 评估结果可视化图表
- 错误样本分析

### 消融实验

- 词典法消融实验，测试各模块贡献度
- 支持配置开关：
  - 否定词处理
  - 程度副词加权
  - 特殊搭配模式
  - 动态阈值
  - 增强词典
- 一键运行完整消融实验（6个配置对比）
- 实验结果可视化图表
- 导出 CSV 和图表（PNG/PDF）

### 模型量化

- FP32/FP16/INT8 量化对比
- 性能对比测试（推理速度、显存占用、准确率）
- GPU vs CPU 推理对比
- 量化模型导出

### 词典管理

#### 基础词典管理

- 情感词典管理（增删改查、热更新）
- 正面词典、负面词典、程度副词词典、否定词词典
- NTUSD 词典已合并（台湾大学情感词典）

#### 增强词典

- 梯度×嵌入法自动提取候选情感词
- 候选词人工审核流程
- 审核通过的词自动加入增强词典
- 增强词典开关控制
- 词典热加载，无需重启服务

#### 词典审核功能

- 候选词列表展示（分页、筛选、排序）
- 批量审核通过/拒绝
- 审核进度统计
- 候选词上下文展示
- 提取配置参数：
  - 模型类型（FP32/FP16）
  - 最小词频
  - 最大候选词数
  - 每样本 Top-K
  - 极性阈值

### 外部 API 配置

- 文本分析 API 配置（OpenAI、DeepSeek、通义千问等）
- 音频分析 API 配置
- API 连接状态检查
- 安全的密钥管理

### 性能监控

- 实时 CPU/GPU 使用率监控
- 分析响应时间统计
- 分析次数统计
- 性能数据导出

## 技术栈

### 前端

- React 18 + TypeScript
- Tailwind CSS
- Vite
- React Router
- Recharts

### 后端

- FastAPI
- PyTorch 2.6.0
- Transformers
- Jieba 分词
- Uvicorn
- Pandas
- Scikit-learn

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
│   │   ├── performance.py      # 性能统计路由
│   │   └── dictionary_review.py # 词典审核路由
│   ├── sentiment/
│   │   ├── model_analyzer.py   # 深度学习分析器
│   │   ├── lexicon_analyzer.py # 词典分析器
│   │   ├── hybrid_analyzer.py  # 混合分析器
│   │   ├── model_trainer.py    # 模型训练脚本
│   │   └── gradient_extractor.py # 梯度提取器
│   ├── services/
│   │   ├── training_service.py # 训练服务
│   │   ├── cache_service.py    # 缓存服务
│   │   ├── system_monitor.py   # 系统监控服务
│   │   └── unified_model_manager.py # 统一模型管理
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
│           ├── EvaluationTab.tsx      # 模型评估
│           ├── AblationStudyTab.tsx   # 消融实验
│           ├── QuantizationContent.tsx # 模型量化
│           ├── DictionaryReviewTab.tsx # 词典审核
│           └── DictionaryTab.tsx      # 词典管理
├── data/
│   ├── lexicon/
│   │   ├── positive_words.txt      # 正面词典
│   │   ├── negative_words.txt      # 负面词典
│   │   ├── degree_words.txt        # 程度副词词典
│   │   ├── negation_words.txt      # 否定词词典
│   │   ├── enhanced_positive_words.txt # 增强正面词典
│   │   ├── enhanced_negative_words.txt # 增强负面词典
│   │   └── candidates.json         # 候选词库
│   ├── labeled_data.xlsx       # 训练数据
│   └── test_data.xlsx          # 测试数据
└── requirements.txt
```

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- CUDA（可选，用于 GPU 加速）

### 后端安装与启动

```bash
# 1. 克隆项目
git clone https://github.com/oolongho/Chinese-Sentiment-Analysis-Web-App.git
cd Chinese-Sentiment-Analysis-Web-App

# 2. 创建虚拟环境
python -m venv venv

# Windows
.\venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# 3. 安装依赖
cd backend
pip install -r requirements.txt

# 4. 配置环境变量（在 backend/ 目录下创建 .env 文件）
# 必需：管理员密码
ADMIN_PASSWORD=your_secure_password

# 必需：JWT 密钥（请使用安全的随机字符串）
SECRET_KEY=your_random_secret_key_here

# 5. 启动后端服务
python main.py
```

### 前端安装与启动

```bash
# 1. 安装依赖
cd frontend
npm install

# 2. 启动开发服务器
npm run dev
```

### 访问应用

- 前端页面: <http://localhost:5173>
- API 文档: <http://localhost:8000/docs>
- 管理平台: <http://localhost:5173/training>

## 使用指南

### 模型训练

#### 使用 Web 界面训练

1. 准备训练数据（Excel 格式）
2. 访问管理平台 → 训练模型
3. 上传训练数据
4. 配置训练参数
   - 基础参数：轮次、批次大小、学习率、最大序列长度
   - 高级优化：Label Smoothing、Cosine 学习率调度、Warmup 比例、权重衰减
5. 点击"开始训练"
6. 查看训练曲线和 GPU 显存使用情况

#### 使用命令行训练

```bash
cd backend
python -m sentiment.model_trainer
```

训练参数可在 `backend/config.py` 中配置。

### 模型评估

1. 准备测试数据（Excel 格式，包含"文本"和"标签"列）
2. 访问管理平台 → 模型评估
3. 上传测试数据
4. 选择评估方式：
   - 本地评估（深度学习模型 + 情感词典）
   - 全部评估（包含外部 API）
   - 混合评估（可调整词典阈值）
5. 查看评估结果和错误样本分析
6. 导出评估报告和图表

### 消融实验

1. 访问管理平台 → 消融实验
2. 上传测试数据
3. 配置开关（否定词、程度副词、特殊搭配、动态阈值、增强词典）
4. 选择测试方式：
   - 测试当前配置
   - 运行完整消融实验（6个配置自动对比）
5. 查看实验结果和可视化图表
6. 导出 CSV 和图表

### 词典审核

#### 梯度提取候选词

1. 访问管理平台 → 词典审核
2. 配置提取参数：
   - 模型类型（FP32/FP16）
   - 最小词频
   - 最大候选词数
   - 每样本 Top-K
   - 正面/负面极性阈值
3. 上传梯度提取数据集
4. 点击"开始梯度提取"
5. 等待提取完成

#### 审核候选词

1. 查看候选词列表（按提取次数排序）
2. 筛选状态（待审核/已通过/已拒绝）
3. 筛选极性（正面/负面）
4. 批量选择候选词
5. 点击"批量通过"或"批量拒绝"
6. 审核通过的词自动加入增强词典
7. 切换增强词典开关启用/禁用

### 模型量化

1. 访问管理平台 → 模型量化
2. 查看当前模型状态（FP32/FP16）
3. 执行量化操作：
   - FP32 → FP16（GPU 推理加速）
   - FP16 → INT8（CPU 推理优化）
4. 上传测试数据
5. 运行对比测试
6. 查看性能对比（推理速度、显存占用、准确率）

## 数据格式

### 训练/测试数据格式

Excel 文件（.xlsx）需要包含以下列：

| 列名   | 说明       | 是否必需 | 示例             |
| ---- | -------- | ---- | -------------- |
| `文本` | 待分析的文本内容 | 必需   | "这个产品质量很好"     |
| `标签` | 情感标签     | 必需   | `正面`、`负面`、`中性` |

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

### 增强词典

增强词典由梯度提取+人工审核生成，格式与基础词典相同：

```
# 增强正面词典 (enhanced_positive_words.txt)
优秀,2
卓越,3

# 增强负面词典 (enhanced_negative_words.txt)
糟糕,-2
恶劣,-3
```

## 外部 API 配置

在管理平台配置外部 API（如 OpenAI、DeepSeek、通义千问等）：

1. 配置环境变量中的管理员密码（见上方"环境变量配置"）
2. 登录管理平台
3. 进入"外部 API"标签
4. 填写 API Key、Base URL、模型名称

### 支持的 API 格式

- OpenAI API
- DeepSeek API
- 通义千问 API
- 其他兼容 OpenAI 格式的 API

## 作者

oolongho

## 致谢

- 毕设导师 陈老师
- 女朋友（人工校验标签）
- [chinese-roberta-wwm-ext](https://github.com/ymcui/Chinese-BERT-wwm) - 预训练模型
- [Hugging Face Transformers](https://huggingface.co/) - 模型框架
- [FastAPI](https://fastapi.tiangolo.com/) - 后端框架
- [React](https://react.dev/) - 前端框架

