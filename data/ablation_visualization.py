#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
消融实验结果可视化 - 用于论文图表
支持命令行参数控制是否保存图表和指定输入文件
"""

import sys
import argparse
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
import numpy as np
import os

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False


def find_csv_file(data_dir, csv_path=None):
    """
    查找CSV文件
    
    Args:
        data_dir: 数据目录
        csv_path: 指定的CSV文件路径（可选）
    
    Returns:
        找到的CSV文件路径
    
    Raises:
        FileNotFoundError: 当找不到有效的CSV文件时
    """
    # 1. 如果指定了文件路径，优先使用
    if csv_path:
        if os.path.exists(csv_path):
            return csv_path
        else:
            raise FileNotFoundError(f"指定的文件不存在: {csv_path}")
    
    # 2. 查找默认命名的文件
    default_files = [
        '消融实验结果_2026_3_29.csv',
        '消融实验结果.csv'
    ]
    
    for filename in default_files:
        filepath = os.path.join(data_dir, filename)
        if os.path.exists(filepath):
            print(f"找到默认文件: {filepath}")
            return filepath
    
    # 3. 查找任何消融实验相关的CSV文件
    for filename in os.listdir(data_dir):
        if filename.startswith('消融实验') and filename.endswith('.csv'):
            filepath = os.path.join(data_dir, filename)
            print(f"找到匹配文件: {filepath}")
            return filepath
    
    # 4. 如果没有找到，抛出异常
    raise FileNotFoundError(
        f"未找到消融实验结果CSV文件。请确保文件存在于: {data_dir}\n"
        f"支持的文件名: {', '.join(default_files)}\n"
        f"或使用 --input 参数指定文件路径"
    )


def generate_charts(save_files=False, csv_path=None):
    """生成消融实验图表
    
    Args:
        save_files: 是否保存图表文件，False时只显示不保存
        csv_path: 指定的CSV文件路径（可选）
    """
    # 获取数据目录
    data_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 查找并读取CSV文件
    try:
        csv_file = find_csv_file(data_dir, csv_path)
        print(f"正在读取文件: {csv_file}")
        df = pd.read_csv(csv_file, encoding='utf-8-sig')
    except FileNotFoundError as e:
        print(f"错误: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"读取文件失败: {e}")
        sys.exit(1)

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
        # 根据输入文件名生成输出文件名
        base_name = os.path.splitext(os.path.basename(csv_file))[0]
        png_path = os.path.join(data_dir, f'{base_name}_图表.png')
        pdf_path = os.path.join(data_dir, f'{base_name}_图表.pdf')
        plt.savefig(png_path, dpi=300, bbox_inches='tight', facecolor='white')
        plt.savefig(pdf_path, bbox_inches='tight', facecolor='white')
        print(f"图表已保存: {png_path}")
        print(f"图表已保存: {pdf_path}")
    else:
        plt.show()
    
    plt.close()


def generate_latex_table(csv_path=None):
    """生成LaTeX表格代码"""
    data_dir = os.path.dirname(os.path.abspath(__file__))
    
    try:
        csv_file = find_csv_file(data_dir, csv_path)
        df = pd.read_csv(csv_file, encoding='utf-8-sig')
    except FileNotFoundError as e:
        print(f"错误: {e}")
        return
    
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


def generate_markdown_table(csv_path=None):
    """生成Markdown表格"""
    data_dir = os.path.dirname(os.path.abspath(__file__))
    
    try:
        csv_file = find_csv_file(data_dir, csv_path)
        df = pd.read_csv(csv_file, encoding='utf-8-sig')
    except FileNotFoundError as e:
        print(f"错误: {e}")
        return
    
    print("\n=== Markdown表格 ===")
    print(df.to_markdown(index=False))


if __name__ == '__main__':
    # 使用argparse处理命令行参数
    parser = argparse.ArgumentParser(
        description='消融实验结果可视化工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
使用示例:
  python ablation_visualization.py                    # 显示图表
  python ablation_visualization.py --export           # 保存图表到文件
  python ablation_visualization.py -e -i result.csv   # 指定输入文件并导出
        '''
    )
    
    parser.add_argument(
        '-e', '--export',
        action='store_true',
        help='导出图表到文件（PNG和PDF）'
    )
    
    parser.add_argument(
        '-i', '--input',
        type=str,
        default=None,
        help='指定输入的CSV文件路径（可选，默认自动查找）'
    )
    
    parser.add_argument(
        '--latex',
        action='store_true',
        help='生成LaTeX表格代码'
    )
    
    parser.add_argument(
        '--markdown',
        action='store_true',
        help='生成Markdown表格'
    )
    
    args = parser.parse_args()
    
    # 执行相应操作
    if args.latex:
        generate_latex_table(args.input)
    elif args.markdown:
        generate_markdown_table(args.input)
    else:
        # 默认生成图表
        generate_charts(save_files=args.export, csv_path=args.input)
        
        if not args.export:
            print("\n提示: 添加 --export 或 -e 参数可导出图表文件")
            print("      添加 --input 或 -i 参数可指定输入文件")
            print("例如: python ablation_visualization.py --export --input result.csv")
