# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
外部API调用服务
"""

import httpx
import base64
from typing import Dict, Optional
from ..config import load_external_api_config


async def call_text_api(text: str) -> Dict:
    """
    调用外部文本分析API（OpenAI格式）
    
    Args:
        text: 要分析的文本
        
    Returns:
        分析结果
    """
    config = load_external_api_config()
    
    api_key = config.get('text_api_key', '')
    base_url = config.get('text_base_url', '')
    model = config.get('text_model', '')
    
    if not api_key or not base_url or not model:
        return {
            'success': False,
            'error': '外部API未配置，请在管理平台中配置文本分析API'
        }
    
    url = f"{base_url.rstrip('/')}/chat/completions"
    
    prompt = f"""请分析以下中文文本的情感倾向，并返回JSON格式的结果。

文本：{text}

请返回以下格式的JSON（不要包含markdown代码块标记）：
{{
    "sentiment": "正面/负面/中性",
    "confidence": 0.0-1.0之间的置信度,
    "reasoning": "简短的分析理由"
}}"""
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': model,
                    'messages': [
                        {'role': 'system', 'content': '你是一个专业的情感分析助手，请准确分析文本的情感倾向。'},
                        {'role': 'user', 'content': prompt}
                    ],
                    'temperature': 0.3
                }
            )
            
            if response.status_code != 200:
                return {
                    'success': False,
                    'error': f'API调用失败: {response.status_code}'
                }
            
            data = response.json()
            content = data['choices'][0]['message']['content']
            
            import json
            try:
                content = content.strip()
                if content.startswith('```'):
                    content = content.split('\n', 1)[1] if '\n' in content else content
                    content = content.rsplit('```', 1)[0] if '```' in content else content
                result = json.loads(content)
            except json.JSONDecodeError:
                result = {
                    'sentiment': '中性',
                    'confidence': 0.5,
                    'reasoning': content
                }
            
            return {
                'success': True,
                'sentiment': result.get('sentiment', '中性'),
                'confidence': result.get('confidence', 0.5),
                'reasoning': result.get('reasoning', ''),
                'model': model
            }
            
    except httpx.TimeoutException:
        return {
            'success': False,
            'error': 'API调用超时'
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'API调用异常: {str(e)}'
        }


async def call_audio_api(audio_path: str) -> Dict:
    """
    调用外部语音识别API（OpenAI格式）
    
    Args:
        audio_path: 音频文件路径
        
    Returns:
        转写和分析结果
    """
    config = load_external_api_config()
    
    api_key = config.get('audio_api_key', '')
    base_url = config.get('audio_base_url', '')
    model = config.get('audio_model', '')
    
    if not api_key or not base_url or not model:
        return {
            'success': False,
            'error': '外部语音API未配置，请在管理平台中配置语音分析API'
        }
    
    url = f"{base_url.rstrip('/')}/audio/transcriptions"
    
    try:
        with open(audio_path, 'rb') as audio_file:
            files = {'file': audio_file}
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    url,
                    headers={
                        'Authorization': f'Bearer {api_key}',
                    },
                    data={
                        'model': model,
                    },
                    files=files
                )
                
                if response.status_code != 200:
                    return {
                        'success': False,
                        'error': f'API调用失败: {response.status_code}'
                    }
                
                data = response.json()
                transcription = data.get('text', '')
                
                return {
                    'success': True,
                    'transcription': transcription,
                    'model': model
                }
                
    except httpx.TimeoutException:
        return {
            'success': False,
            'error': 'API调用超时'
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'API调用异常: {str(e)}'
        }
