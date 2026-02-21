# 词典管理功能完善计划

## 问题分析

### 当前状态
1. **词典修改已持久化**：`training.py` 的 `add_dictionary_word` 和 `remove_dictionary_word` 已直接写入词典文件
2. **内存未同步**：`LexiconAnalyzer` 在 `text_analysis.py` 和 `audio_analysis.py` 中作为全局实例创建，初始化后不会自动重新加载
3. **缺少同步机制**：修改词典后，需要重启服务或手动触发重新加载才能让修改生效

### 解决方案

## 实现步骤

### 1. 后端：添加词典重新加载功能

#### 1.1 修改 `lexicon_analyzer.py`
- 添加 `reload()` 方法，重新加载所有词典

#### 1.2 修改 `text_analysis.py` 和 `audio_analysis.py`
- 导出 `lexicon_analyzer` 实例供外部调用
- 或提供重新加载函数

#### 1.3 修改 `training.py`
- 添加 `/dictionary/reload` 端点
- 调用各模块的重新加载函数

### 2. 前端：添加保存并同步按钮

#### 2.1 修改 `TrainingPage.tsx`
- 在词典管理区域添加"保存并同步"按钮
- 点击后调用 `/dictionary/reload` 端点
- 显示同步成功/失败提示

## 文件修改清单

1. `backend/sentiment/lexicon_analyzer.py` - 添加 reload() 方法
2. `backend/routers/text_analysis.py` - 导出重新加载函数
3. `backend/routers/audio_analysis.py` - 导出重新加载函数
4. `backend/routers/training.py` - 添加 /dictionary/reload 端点
5. `frontend/src/pages/TrainingPage.tsx` - 添加保存并同步按钮
