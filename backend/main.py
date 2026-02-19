from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="中文情感分析API",
    description="提供文本和音频情感分析服务",
    version="1.0.0"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该设置具体的前端域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "中文情感分析API服务运行中"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# 文本情感分析端点
@app.post("/api/text/analyze")
async def analyze_text(text: str):
    # 这里将实现文本情感分析逻辑
    return {
        "text": text,
        "sentiment": "positive",
        "confidence": 0.95,
        "method": "dummy"
    }

# 音频情感分析端点
@app.post("/api/audio/analyze")
async def analyze_audio():
    # 这里将实现音频情感分析逻辑
    return {
        "transcript": "示例音频转文字结果",
        "sentiment": "neutral",
        "confidence": 0.85,
        "method": "dummy"
    }
