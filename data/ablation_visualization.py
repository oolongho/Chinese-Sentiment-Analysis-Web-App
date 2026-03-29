#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
消融实验结果可视化 - 用于论文图表
支持命令行参数控制是否保存图表
"""

import sys
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
import numpy as np
import os

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

def generate_charts(save_files=False):
    """生成消融实验图表
    
    Args:
        save_files: 是否保存图表文件，False时只显示不保存
    """
    # 读取数据
    data_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(data_dir, '消融实验结果_2026_3_29.csv')
    df = pd.read_csv(csv_path, encoding='utf-8-sig')

    # 创建图表 (1行2列)
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    fig.suptitle('词典法消融实验结果分析', fontsize=16, fontweight='bold')

    # 1. 准确率对比柱状图 (a)
    ax1 = axes[0]
    colors = ['#e5e7eb', '#93c5fd', '#60a5fa', '#3b82f6', '#8b5cf6']
    bars = ax1.bar(df['配置'], df['准确率'], color=colors, edgecolor='white', linewidth=1.5)
    ax1.set_ylabel('准确率 (%)', fontsize=11)
    ax1.set_title('(a) 各配置准确率对比', fontsize=12, fontweight='bold')
    ax1.set_ylim(70, 85)
    ax1.grid(axis='y', alpha=0.3, linestyle='--')

    # 在柱子上添加数值标签
    for bar, acc in zip(bars, df['准确率']):
        height = bar.get_height()
        ax1.text(bar.get_x() + bar.get_width()/2., height + 0.3,
                 f'{acc}%', ha='center', va='bottom', fontsize=10, fontweight='bold')

    # 2. 相对提升折线图 (b)
    ax2 = axes[1]
    # 提取提升数值（去掉%和+号）
    improvements = []
    for imp in df['相对提升']:
        if imp == '-':
            improvements.append(0)
        else:
            improvements.append(float(imp.replace('%', '').replace('+', '')))

    ax2.plot(df['配置'], improvements, marker='o', markersize=10, linewidth=2.5, 
             color='#8b5cf6', markerfacecolor='#a78bfa', markeredgecolor='#8b5cf6', markeredgewidth=2)
    ax2.fill_between(range(len(df)), improvements, alpha=0.3, color='#8b5cf6')
    ax2.set_ylabel('相对提升 (%)', fontsize=11)
    ax2.set_title('(b) 各模块贡献度分析', fontsize=12, fontweight='bold')
    ax2.grid(True, alpha=0.3, linestyle='--')
    ax2.set_xticks(range(len(df)))
    ax2.set_xticklabels(df['配置'])

    # 添加数值标签
    for i, (x, y) in enumerate(zip(range(len(df)), improvements)):
        if y > 0:
            ax2.annotate(f'+{y:.2f}%', (x, y), textcoords="offset points", 
                         xytext=(0, 10), ha='center', fontsize=9, fontweight='bold', color='#7c3aed')

    plt.tight_layout()
    
    if save_files:
        png_path = os.path.join(data_dir, '消融实验结果_图表.png')
        pdf_path = os.path.join(data_dir, '消融实验结果_图表.pdf')
        plt.savefig(png_path, dpi=300, bbox_inches='tight', facecolor='white')
        plt.savefig(pdf_path, bbox_inches='tight', facecolor='white')
        print(f"图表已保存: {png_path}")
        print(f"图表已保存: {pdf_path}")
    else:
        plt.show()
    
    plt.close()

def generate_latex_table():
    """生成LaTeX表格代码"""
    data_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(data_dir, '消融实验结果_2026_3_29.csv')
    df = pd.read_csv(csv_path, encoding='utf-8-sig')
    
    print("\n=== LaTeX表格代码 ===")
    print(r"\begin{table}[htbp]")
    print(r"\centering")
    print(r"\caption{词典法消融实验结果}")
    print(r"\label{tab:ablation}")
    print(r"\begin{tabular}{clccccc}")
    print(r"\toprule")
    print(r"配置 & 描述 & 样本数 & 准确率 & 精确率 & 召回率 & F1值 \\")
    print(r"\midrule")
    for _, row in df.iterrows():
        print(f"{row['配置']} & {row['描述']} & {row['样本数']} & {row['准确率']}\% & {row['精确率']}\% & {row['召回率']}\% & {row['F1值']}\% \\\\")
    print(r"\bottomrule")
    print(r"\end{tabular}")
    print(r"\end{table}")

def generate_markdown_table():
    """生成Markdown表格"""
    data_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(data_dir, '消融实验结果_2026_3_29.csv')
    df = pd.read_csv(csv_path, encoding='utf-8-sig')
    
    print("\n=== Markdown表格 ===")
    print(df.to_markdown(index=False))

if __name__ == '__main__':
    # 检查是否有 --export 参数
    if '--export' in sys.argv or '-e' in sys.argv:
        generate_charts(save_files=True)
        generate_latex_table()
        generate_markdown_table()
    else:
        # 默认只显示图表，不保存
        generate_charts(save_files=False)
        print("\n提示: 添加 --export 或 -e 参数可导出图表文件")
        print("例如: python ablation_visualization.py --export")
