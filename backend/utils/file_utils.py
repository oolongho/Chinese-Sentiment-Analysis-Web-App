#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
文件验证工具
提供文件大小验证和临时文件清理功能
"""

import os
from fastapi import HTTPException


def validate_file_size(
    content: bytes, 
    max_size: int, 
    file_type: str = "文件"
) -> None:
    """
    验证文件大小
    
    Args:
        content: 文件内容（字节）
        max_size: 最大允许大小（字节）
        file_type: 文件类型描述（用于错误信息）
    
    Raises:
        HTTPException: 文件过大时抛出 413 错误
    """
    file_size = len(content)
    if file_size > max_size:
        max_size_mb = max_size / (1024 * 1024)
        actual_size_mb = file_size / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f'{file_type}过大：{actual_size_mb:.2f} MB，最大允许 {max_size_mb:.0f} MB'
        )


def safe_save_file(
    filepath: str, 
    content: bytes, 
    cleanup_on_error: bool = True
) -> None:
    """
    安全保存文件，支持错误时自动清理
    
    Args:
        filepath: 目标文件路径
        content: 文件内容（字节）
        cleanup_on_error: 出错时是否删除文件
    
    Raises:
        IOError: 文件写入失败
    """
    try:
        with open(filepath, 'wb') as f:
            f.write(content)
    except Exception as e:
        if cleanup_on_error and os.path.exists(filepath):
            try:
                os.remove(filepath)
            except:
                pass
        raise e


def cleanup_file(filepath: str) -> bool:
    """
    清理文件（如果存在）
    
    Args:
        filepath: 文件路径
    
    Returns:
        是否成功删除
    """
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
            return True
    except Exception:
        pass
    return False
