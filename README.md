# 中文情感分析系统

基于深度学习与情感词典的中文情感分析 Web 平台，集成词典法、深度学习、外部 API 三条独立分析通道，并设计五种混合推理策略实现速度与准确率的平衡。支持模型训练、评估、消融实验、词典增强、模型量化、对比实验等全流程研究。

![Python](https://img.shields.io/badge/Python-3.10-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![PyTorch](https://img.shields.io/badge/PyTorch-2.6-orange)
![License](https://img.shields.io/badge/License-Apache%202.0-green)

## 功能特性

### 三通道情感分析

| 通道 | 方法 | 特点 |
|:---:|:---:|:---|
| 深度学习 | RoBERTa-wwm-ext 微调 | 准确率最高（96.80%），推理延迟 ~10.83ms |
| 情感词典 | 多源词典 + 四层规则优化 | 速度最快（0.13ms），可解释性强 |
| 外部 API | OpenAI 兼容格式（DeepSeek 等） | 部署便捷，延迟较高（~2443ms） |

### 五种混合推理策略

| 策略 | 说明 |
|:---:|:---|
| CASCADE | 级联加速：词典置信度足够则直接返回，否则调用 DL |
| ENHANCED_CASCADE | 增强级联（推荐）：三层漏斗架构 L1(词典预检)→L2(DL直返)→L3(加权融合) |
| WEIGHTED | 置信度加权：同时运行两种方法，按置信度与配置权重动态混合 |
| RULE_BASED | 规则修正：DL 为主，词典规则修正明显错误（双重否定、领域词等） |
| ADAPTIVE | 自适应路由：根据文本长度自动选择子策略（短文→级联，中文→增强级联，长文→加权） |

### 文本分析

- 单条 / 批量文本输入，三通道并行分析
- 分析结果对比展示（情感极性、置信度、推理耗时）
- 混合推理统计（快速路径占比、各层分布）
- 结果导出（Excel 格式）

### 音频分析

- 音频文件上传（mp3、wav、m4a 等）
- 基于 FunASR（Paraformer-medium）的语音识别，支持标点恢复
- WaveSurfer.js 波形可视化与播放
- 语音转文字 + 情感分析一站式处理

### 模型训练

- 基于 HuggingFace Transformers Trainer 的微调流程
- 可配置参数：轮次、批次大小、学习率、最大序列长度、Warmup 比例、权重衰减、Label Smoothing、Cosine 学习率调度
- 早停机制（patience=2，基于 F1 指标）
- 训练曲线实时可视化（Recharts）
- GPU 显存监控
- 支持本地预训练模型 / HuggingFace 缓存 / 在线镜像源自动降级加载

### 模型评估

- 上传测试数据集评估模型性能
- 计算准确率、精确率、召回率、F1 分数
- 多通道对比评估（DL / 词典 / 混合 / 外部 API）
- 混合模型阈值调优
- 错误样本分析
- 评估结果可视化与导出

### 消融实验

- 词典法消融实验，测试各模块贡献度
- 可配置开关：否定词处理、程度副词加权、特殊搭配模式、动态阈值、增强词典
- 一键运行完整消融实验（6 个配置自动对比）
- 实验结果可视化图表
- 导出 CSV 和图表（PNG / PDF）

### 模型量化

- FP32 → FP16：体积压缩 92.8%，准确率零损失
- FP16 → INT8：体积进一步压缩 25.3%，但准确率显著下降（Transformer 对 INT8 敏感）
- 统一模型管理器（`UnifiedModelManager`）：单例模式，全局精度切换，FP32/FP16 在 GPU 运行，INT8 在 CPU 运行
- 量化对比实验：推理速度、模型体积、准确率三维对比

### 对比实验

- 三通道（DL / 词典 / 混合）性能对比
- 五种混合策略横向对比
- 统一测试集上的准确率、推理速度、F1 等指标

### 词典管理

#### 基础词典

- 正面词典、负面词典、程度副词词典、否定词词典
- 支持增删改查与热更新
- 已整合 HowNet、NTUSD、清华大学情感词典三套权威资源

#### 增强词典（梯度显著性自动提取）

- 基于 RoBERTa 梯度显著性自动提取候选情感词
- jieba 词性过滤（仅保留形容词、动词、状态词等可能携带情感的词性）
- 候选词人工审核流程（批量通过 / 拒绝）
- 审核通过的词自动加入增强词典
- 增强词典开关控制，热加载无需重启

### 外部 API 配置

- 支持 OpenAI 兼容格式（DeepSeek、通义千问等）
- 文本分析 / 音频分析独立配置
- API 连接状态检查
- 安全的密钥管理（配置文件持久化）

### 性能监控

- 实时 CPU / GPU 使用率监控
- 分析响应时间统计
- 分析次数统计
- 性能数据导出

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|:---|:---|:---|
| React | 19 | UI 框架 |
| TypeScript | 5.9 | 类型安全 |
| Vite | 8 | 构建工具 |
| Tailwind CSS | 4 | 样式 |
| React Router | 7 | 路由 |
| Recharts | 3 | 图表可视化 |
| WaveSurfer.js | 7 | 音频波形 |
| Axios | 1.x | HTTP 请求 |

### 后端

| 技术 | 版本 | 用途 |
|:---|:---|:---|
| FastAPI | 0.100+ | Web 框架 |
| PyTorch | 2.6 | 深度学习 |
| Transformers | latest | 模型加载与训练 |
| Jieba | latest | 中文分词 |
| FunASR | latest | 语音识别（可选） |
| Uvicorn | latest | ASGI 服务器 |
| Pandas / openpyxl | latest | 数据处理 |
| scikit-learn | latest | 评估指标 |
| httpx | latest | 异步 HTTP 客户端 |
| PyJWT | latest | JWT 认证 |
| pynvml / psutil | latest | 系统监控 |

## 项目结构

```
├── backend/
│   ├── main.py                          # FastAPI 入口，注册路由与中间件
│   ├── config.py                        # 配置管理（环境变量、训练参数、CORS）
│   ├── routers/
│   │   ├── text_analysis.py             # 文本分析（单条/批量/混合）
│   │   ├── audio_analysis.py            # 音频分析（上传/识别/波形）
│   │   ├── training.py                  # 模型训练（参数配置/进度回调）
│   │   ├── evaluation.py                # 模型评估（多通道对比/错误分析）
│   │   ├── quantization.py              # 模型量化（FP16/INT8/对比实验）
│   │   ├── hybrid_experiment.py         # 混合推理对比实验
│   │   ├── dictionary_review.py         # 词典审核（梯度提取/候选词管理）
│   │   ├── performance.py              # 性能统计（CPU/GPU/响应时间）
│   │   └── logger.py                    # 日志路由
│   ├── sentiment/
│   │   ├── model_analyzer.py            # 深度学习分析器（统一模型管理器代理）
│   │   ├── lexicon_analyzer.py          # 词典分析器（四层规则+动态阈值+缓存）
│   │   ├── hybrid_analyzer.py           # 混合分析器（五种策略+三层漏斗）
│   │   ├── model_trainer.py             # 模型训练（Trainer+早停+进度回调）
│   │   └── gradient_extractor.py        # 梯度显著性候选词提取器
│   ├── services/
│   │   ├── unified_model_manager.py     # 统一模型管理器（FP32/FP16/INT8 单例）
│   │   ├── training_service.py          # 训练服务（异步任务管理）
│   │   ├── quantization_service.py      # 量化服务（FP16/INT8 转换）
│   │   ├── onnx_quantization_service.py # ONNX 量化服务
│   │   ├── external_api.py             # 外部 API 调用（OpenAI 兼容格式）
│   │   ├── speech_service.py           # 语音识别服务（FunASR Paraformer）
│   │   ├── cache_service.py            # 缓存服务
│   │   └── system_monitor.py           # 系统监控（CPU/GPU/内存）
│   ├── utils/
│   │   ├── auth.py                     # JWT 认证与密码哈希
│   │   └── file_utils.py              # 文件工具
│   ├── models/                         # 训练好的模型（gitignore）
│   └── .env.example                    # 环境变量模板
├── frontend/
│   └── src/
│       ├── App.tsx                      # 路由配置
│       ├── pages/
│       │   ├── HomePage.tsx            # 首页（功能介绍）
│       │   ├── TextAnalysisPage.tsx    # 文本分析页
│       │   ├── AudioAnalysisPage.tsx   # 音频分析页
│       │   ├── PerformancePage.tsx     # 性能统计页
│       │   └── TrainingPage.tsx        # 管理平台页（训练/评估/消融/量化/词典）
│       ├── components/
│       │   ├── EvaluationTab.tsx       # 模型评估
│       │   ├── AblationStudyTab.tsx    # 消融实验
│       │   ├── QuantizationContent.tsx # 模型量化
│       │   ├── QuantizationTab.tsx     # 量化标签页
│       │   ├── DictionaryTab.tsx       # 词典管理
│       │   ├── DictionaryReviewTab.tsx # 词典审核
│       │   ├── ExternalApiTab.tsx      # 外部 API 配置
│       │   ├── Header.tsx             # 导航栏
│       │   └── Footer.tsx             # 页脚
│       ├── hooks/
│       │   ├── useDictionary.ts        # 词典相关 Hook
│       │   ├── useExternalApi.ts       # 外部 API Hook
│       │   └── useTraining.ts          # 训练相关 Hook
│       ├── config/
│       │   └── api.ts                  # API 端点与类型定义
│       ├── types/
│       │   ├── training.ts             # 训练相关类型
│       │   └── quantization.ts         # 量化相关类型
│       └── utils/
│           ├── api.ts                  # HTTP 请求封装
│           └── cache.ts               # 前端缓存
├── data/
│   ├── lexicon/
│   │   ├── positive_words.txt          # 正面词典
│   │   ├── negative_words.txt          # 负面词典
│   │   ├── degree_words.txt            # 程度副词词典
│   │   ├── negation_words.txt          # 否定词词典
│   │   ├── candidates.json            # 梯度提取候选词库
│   │   └── enhanced_status.json       # 增强词典状态
│   ├── other_lexicon/                  # 外部词典源（HowNet/NTUSD/清华）
│   ├── labeled_data.xlsx              # 训练数据
│   └── test_data(普通测试).xlsx        # 测试数据
├── scripts/                            # 辅助脚本
│   ├── check_gpu_memory.py
│   ├── check_model_memory.py
│   ├── import_hownet_lexicon.py
│   ├── performance_benchmark.py
│   ├── test_onnx_quantization.py
│   └── test_quantization.py
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
# 必需：JWT 密钥
SECRET_KEY=your_random_secret_key_here

# 必需：管理员密码（二选一）
ADMIN_PASSWORD=your_admin_password
# 或使用密码哈希（推荐生产环境）
# ADMIN_PASSWORD_HASH=<sha256_hash>

# 可选：CORS 来源（默认 http://localhost:3000,http://localhost:5173）
# CORS_ORIGINS=http://localhost:3000,http://localhost:5173

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

- 前端页面：<http://localhost:5173>
- API 文档：<http://localhost:8000/docs>
- 管理平台：<http://localhost:5173/training>

## 使用指南

### 模型训练

1. 准备训练数据（Excel 格式，包含"文本"和"标签"列）
2. 访问管理平台 → 训练模型
3. 上传训练数据，配置参数
4. 点击"开始训练"，查看训练曲线和 GPU 显存

### 模型评估

1. 准备测试数据（Excel 格式）
2. 访问管理平台 → 模型评估
3. 选择评估方式（本地 / 全部 / 混合）
4. 查看评估结果和错误样本

### 消融实验

1. 访问管理平台 → 消融实验
2. 上传测试数据，配置开关
3. 运行完整消融实验或测试当前配置
4. 导出 CSV 和图表

### 词典审核

1. 访问管理平台 → 词典审核
2. 配置梯度提取参数，上传数据集，开始提取
3. 审核候选词（批量通过 / 拒绝）
4. 审核通过的词自动加入增强词典

### 模型量化

1. 访问管理平台 → 模型量化
2. 执行 FP32 → FP16 或 FP16 → INT8 量化
3. 上传测试数据运行对比实验
4. 查看推理速度、模型体积、准确率对比

### 混合推理

1. 在文本分析页选择"混合分析"通道
2. 选择推理策略（推荐 ENHANCED_CASCADE）
3. 查看分析结果中的推理路径（L1/L2/L3）和统计信息

## 数据格式

### 训练 / 测试数据

Excel 文件（.xlsx）需包含以下列：

| 列名 | 说明 | 是否必需 | 示例 |
|:---|:---|:---|:---|
| `文本` | 待分析的文本内容 | 必需 | "这个产品质量很好" |
| `标签` | 情感标签 | 必需 | `正面`、`负面`、`中性` |

### 情感词典

```
# 正面词典 (positive_words.txt) — 格式：词,权重
不错,2
满意,3

# 负面词典 (negative_words.txt) — 格式：词,权重（负数）
差,-2
失望,-2

# 程度副词 (degree_words.txt) — 格式：词,倍率
非常,1.8
很,1.5

# 否定词 (negation_words.txt) — 每行一个词
不
没
```

## 系统架构

```
┌─────────────────────────────────────────────────────┐
│                    前端 (React 19)                    │
│  HomePage │ TextAnalysis │ AudioAnalysis │ Training  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / REST API
┌──────────────────────▼──────────────────────────────┐
│                  后端 (FastAPI)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │  Routers  │ │ Services  │ │     Sentiment       │ │
│  │ text      │ │ model_mgr │ │ model_analyzer      │ │
│  │ audio     │ │ training  │ │ lexicon_analyzer    │ │
│  │ training  │ │ quantize  │ │ hybrid_analyzer     │ │
│  │ eval      │ │ external  │ │ gradient_extractor  │ │
│  │ quant     │ │ speech    │ │ model_trainer       │ │
│  │ hybrid    │ │ monitor   │ │                     │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## 作者

oolongho

## 致谢

- 毕设导师 陈老师
- [chinese-roberta-wwm-ext](https://github.com/ymcui/Chinese-BERT-wwm) — 预训练模型
- [Hugging Face Transformers](https://huggingface.co/) — 模型框架
- [FastAPI](https://fastapi.tiangolo.com/) — 后端框架
- [React](https://react.dev/) — 前端框架
- [FunASR](https://github.com/modelscope/FunASR) — 语音识别
- [HowNet](https://openhownet.thunlp.org/) — 知网情感词典
- [NTUSD](https://github.com/ntunlplab/NTUSD) — 台湾大学情感词典
