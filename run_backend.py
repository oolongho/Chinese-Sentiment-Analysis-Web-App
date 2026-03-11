# !/usr/bin/env python
# -*- coding: utf-8 -*-
"""
后端启动脚本
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn

if __name__ == '__main__':
    uvicorn.run('backend.main:app', host='0.0.0.0', port=8000)
