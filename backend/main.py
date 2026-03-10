# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
中文情感分析API主入口
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, LOG_FILE, validate_security_config
from .utils.logger import setup_logger, get_logger
from .routers import (
    text_analysis_router,
    audio_analysis_router,
    performance_router,
    training_router,
    evaluation_router
)

logger = setup_logger(
    name='sentiment_analysis',
    log_file=LOG_FILE,
    level=20
)

app = FastAPI(
    title="中文情感分析API",
    description="提供文本和音频情感分析服务，支持词典分析和深度学习模型分析",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(text_analysis_router)
app.include_router(audio_analysis_router)
app.include_router(performance_router)
app.include_router(training_router)
app.include_router(evaluation_router)


@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("=" * 50)
    logger.info("中文情感分析API服务启动")
    logger.info(f"允许的CORS来源: {CORS_ORIGINS}")
    
    security_issues = validate_security_config()
    if security_issues:
        logger.warning(f"发现 {len(security_issues)} 个安全配置问题")
    
    logger.info("=" * 50)


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    logger.info("中文情感分析API服务关闭")


@app.get('/')
async def root():
    """API根路径"""
    return {
        'message': '中文情感分析API服务运行中',
        'version': '1.0.0',
        'docs': '/docs'
    }


@app.get('/health')
async def health_check():
    """健康检查"""
    return {'status': 'healthy'}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('backend.main:app', host='0.0.0.0', port=8000, reload=True)
