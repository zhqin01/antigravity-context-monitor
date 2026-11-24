import os
from PIL import Image, ImageDraw, ImageFont

out_dir = r'f:\谷歌做项目\antigravity-context-monitor\assets\xhs_cards'
os.makedirs(out_dir, exist_ok=True)

font_path = r'C:\Windows\Fonts\msyh.ttc'

def get_font(size, bold=False):
    index = 1 if bold else 0
    try:
        return ImageFont.truetype(font_path, size, index=index)
    except Exception:
        return ImageFont.load_default()

W, H = 896, 1216

pill_img_path = r'f:\谷歌做项目\antigravity-context-monitor\assets\preview-pill.png'
popover_img_path = r'f:\谷歌做项目\antigravity-context-monitor\assets\preview-popover.png'

# ==========================================
# 1. Card 1: 封面
# ==========================================
card1 = Image.new('RGB', (W, H), (17, 20, 27))
draw1 = ImageDraw.Draw(card1)

# 背景科技光晕装饰
for r in range(300, 0, -10):
    alpha = int(45 * (1 - r / 300))
    draw1.ellipse([W - 200 - r, 80 - r, W - 200 + r, 80 + r], fill=(37, 99, 235, alpha))

# 顶部标签
draw1.rounded_rectangle([48, 48, 330, 96], radius=24, fill=(30, 41, 59), outline=(59, 130, 246), width=1)
draw1.text((72, 58), "🔥 Antigravity 效率神技", fill=(248, 250, 252), font=get_font(20, bold=True))

# 主标题
draw1.text((48, 120), "VS Code 的 Antigravity", fill=(148, 163, 184), font=get_font(32, bold=True))
draw1.text((48, 168), "终于有一键压缩了！", fill=(255, 255, 255), font=get_font(52, bold=True))

# 亮点横幅
draw1.rounded_rectangle([48, 248, 580, 312], radius=14, fill=(37, 99, 235))
draw1.text((68, 260), "实时上下文监控 · 告别卡顿与爆仓", fill=(255, 255, 255), font=get_font(28, bold=True))

# 居中放置预览图组
if os.path.exists(popover_img_path):
    pop_img = Image.open(popover_img_path)
    pw, ph = pop_img.size
    target_w = W - 140
    target_h = int(ph * (target_w / pw))
    pop_resized = pop_img.resize((target_w, min(target_h, 480)), Image.Resampling.LANCZOS)
    
    # 阴影与边框
    draw1.rounded_rectangle([66, 346, 66 + target_w + 8, 346 + pop_resized.height + 8], radius=16, fill=(10, 12, 16), outline=(71, 85, 105), width=2)
    card1.paste(pop_resized, (70, 350))

# 底部 4 个特性要点
y_bot = H - 290
bullets = [
    "✨ 模型名称旁常驻用量胶囊，一眼看透当前剩余水位",
    "⚡ 类似 dsh-cost-meter 详情卡片，Prompt 缓存命中率一清二楚",
    "🛡️ 官方 Context Folding 提炼，100% 完整保留需求与代码",
    "📦 独立扩展零侵入不崩溃 · 已全套开源 GitHub"
]
for b in bullets:
    draw1.text((48, y_bot), b, fill=(226, 232, 240) if "GitHub" not in b else (250, 204, 21), font=get_font(21, bold=True))
    y_bot += 48

card1.save(os.path.join(out_dir, '01_xhs_cover.png'), 'PNG')
print('Card 1 generated')

# ==========================================
# 2. Card 2: 痛点与实时胶囊
# ==========================================
card2 = Image.new('RGB', (W, H), (18, 21, 28))
draw2 = ImageDraw.Draw(card2)

draw2.text((48, 48), "01 / 告别盲猜 · 模型旁实时胶囊", fill=(96, 165, 250), font=get_font(22, bold=True))
draw2.text((48, 86), "输入框模型右侧常驻，随时掌握水位", fill=(255, 255, 255), font=get_font(34, bold=True))

if os.path.exists(pill_img_path):
    p_img = Image.open(pill_img_path)
    pw, ph = p_img.size
    tw = W - 96
    th = int(ph * (tw / pw))
    p_resized = p_img.resize((tw, min(th, 220)), Image.Resampling.LANCZOS)
    draw2.rounded_rectangle([44, 156, 44 + tw + 8, 156 + p_resized.height + 8], radius=12, fill=(10, 12, 16), outline=(51, 65, 85), width=1)
    card2.paste(p_resized, (48, 160))
    y_feat = 160 + p_resized.height + 36
else:
    y_feat = 180

callouts2 = [
    ("🧠 动态电量进度环", "环形仪表随占用百分比动态闭合，绿（充裕）、黄（偏高）、红（拥挤）三级色阶实时警示。"),
    ("⚡ 并排贴合零干扰", "与 Gemini 3.8 Flash 高 ∨ 严格保持在同一水平线，不突兀、不遮挡打字输入区。"),
    ("📌 状态栏双向联动", "除了输入框胶囊，VS Code 最底部右下侧状态栏同步常驻，随时随地掌握全局。")
]

for title, desc in callouts2:
    draw2.rounded_rectangle([48, y_feat, W - 48, y_feat + 115], radius=14, fill=(28, 33, 44), outline=(51, 65, 85), width=1)
    draw2.text((72, y_feat + 20), title, fill=(248, 250, 252), font=get_font(22, bold=True))
    draw2.text((72, y_feat + 62), desc, fill=(148, 163, 184), font=get_font(18))
    y_feat += 135

card2.save(os.path.join(out_dir, '02_pill_features.png'), 'PNG')
print('Card 2 generated')

# ==========================================
# 3. Card 3: 详情卡片深度透视
# ==========================================
card3 = Image.new('RGB', (W, H), (18, 21, 28))
draw3 = ImageDraw.Draw(card3)

draw3.text((48, 48), "02 / 沉浸式卡片 · 4 项核心数据透视", fill=(96, 165, 250), font=get_font(22, bold=True))
draw3.text((48, 86), "轻点胶囊展开，Prompt 缓存一目了然", fill=(255, 255, 255), font=get_font(34, bold=True))

if os.path.exists(popover_img_path):
    pop_img = Image.open(popover_img_path)
    pw, ph = pop_img.size
    tw = W - 140
    th = int(ph * (tw / pw))
    pop_resized = pop_img.resize((tw, min(th, 420)), Image.Resampling.LANCZOS)
    draw3.rounded_rectangle([66, 156, 66 + tw + 8, 156 + pop_resized.height + 8], radius=14, fill=(10, 12, 16), outline=(51, 65, 85), width=1)
    card3.paste(pop_resized, (70, 160))
    y_feat = 160 + pop_resized.height + 30
else:
    y_feat = 200

callouts3 = [
    ("⚡ Prompt 缓存命中率 (98.5%)", "清晰展示缓存复用率与命中 Tokens，秒级响应，了解省流与提速状态。"),
    ("🛡️ 剩余可用量 (878k Tokens)", "距离 1M 窗口满额还剩多少额度一清二楚，告别盲目担心爆上下文。"),
    ("🧭 智能边缘防溢出", "视口自动边界计算，无论侧边栏拖拽得多窄，弹窗始终自动推回，绝不出界。")
]

for title, desc in callouts3:
    draw3.rounded_rectangle([48, y_feat, W - 48, y_feat + 105], radius=14, fill=(28, 33, 44), outline=(51, 65, 85), width=1)
    draw3.text((72, y_feat + 18), title, fill=(248, 250, 252), font=get_font(22, bold=True))
    draw3.text((72, y_feat + 58), desc, fill=(148, 163, 184), font=get_font(18))
    y_feat += 122

card3.save(os.path.join(out_dir, '03_popover_metrics.png'), 'PNG')
print('Card 3 generated')

# ==========================================
# 4. Card 4: 压缩逻辑深度科普
# ==========================================
card4 = Image.new('RGB', (W, H), (18, 21, 28))
draw4 = ImageDraw.Draw(card4)

draw4.text((48, 48), "03 / 核心解答 · 压缩到底会不会丢东西？", fill=(96, 165, 250), font=get_font(22, bold=True))
draw4.text((48, 86), "官方状态折叠提炼，放心大胆压缩！", fill=(255, 255, 255), font=get_font(34, bold=True))

points = [
    ("🛡️ 官方底层协议，绝非暴力截断", "调用的是 Antigravity 内置的标准 /compact 提炼算法，绝非直接削掉历史记录。"),
    ("✅ 需求与文件 100% 完整保留", "所有用户指令、业务约束、架构决策、代码文件路径与待办事项均完好归纳在案。"),
    ("🗑️ 精准剔除冗余低价值日志", "仅剔除庞大的终端命令执行原始日志（如 npm 跑过的几百行无用输出）与重试日志。"),
    ("⚡ 点击按钮全自动执行", "自动通过 React 状态接口填入 /compact 并模拟回车发送，无需再手动敲命令。")
]

y_p = 160
for num, (title, desc) in enumerate(points, 1):
    draw4.rounded_rectangle([48, y_p, W - 48, y_p + 120], radius=14, fill=(28, 33, 44), outline=(51, 65, 85), width=1)
    draw4.rounded_rectangle([68, y_p + 20, 104, y_p + 56], radius=8, fill=(37, 99, 235))
    draw4.text((78, y_p + 24), str(num), fill=(255, 255, 255), font=get_font(22, bold=True))
    draw4.text((120, y_p + 24), title, fill=(248, 250, 252), font=get_font(22, bold=True))
    draw4.text((68, y_p + 70), desc, fill=(148, 163, 184), font=get_font(18))
    y_p += 140

# 贴心建议卡片
draw4.rounded_rectangle([48, H - 280, W - 48, H - 120], radius=16, fill=(24, 34, 52), outline=(37, 99, 235), width=2)
draw4.text((72, H - 250), "💡 最佳压缩时机建议：", fill=(96, 165, 250), font=get_font(22, bold=True))
draw4.text((72, H - 205), "Gemini 3.8 Flash 拥有 100 万超大窗口，通常在用量达 75%~80%", fill=(226, 232, 240), font=get_font(20))
draw4.text((72, H - 165), "（进入黄区或红区）时再点击压缩即可，绿色充裕期无需频繁压缩！", fill=(250, 204, 21), font=get_font(20, bold=True))

card4.save(os.path.join(out_dir, '04_compression_logic.png'), 'PNG')
print('Card 4 generated')

# ==========================================
# 5. Card 5: 获取与安装
# ==========================================
card5 = Image.new('RGB', (W, H), (18, 21, 28))
draw5 = ImageDraw.Draw(card5)

draw5.text((48, 48), "04 / 一秒开箱即用 · 完全开源", fill=(96, 165, 250), font=get_font(22, bold=True))
draw5.text((48, 86), "零技术门槛，VSIX 拖入即装，即刻生效", fill=(255, 255, 255), font=get_font(34, bold=True))

steps = [
    ("步骤 1：下载 VSIX 插件包", "从 GitHub (zhqin01/antigravity-context-monitor) Releases 下载最新 .vsix 文件。"),
    ("步骤 2：VS Code 一键安装", "扩展面板点击「···」选择「从 VSIX 安装...」，选中插件包即可自动安装完成。"),
    ("步骤 3：重新加载窗口", "按 Ctrl+Shift+P 执行「Developer: Reload Window」，输入框模型旁胶囊立即点亮！"),
    ("🛡️ 安全承诺与零崩溃", "完全不修改 Antigravity 核心 4.6MB 代码，纯扩展层隔离运行，随时可一键卸载。")
]

y_step = 160
for num, (stitle, sdesc) in enumerate(steps, 1):
    draw5.rounded_rectangle([48, y_step, W - 48, y_step + 125], radius=14, fill=(28, 33, 44), outline=(51, 65, 85), width=1)
    draw5.rounded_rectangle([68, y_step + 20, 104, y_step + 56], radius=8, fill=(37, 99, 235))
    draw5.text((78, y_step + 24), str(num), fill=(255, 255, 255), font=get_font(22, bold=True))
    draw5.text((120, y_step + 24), stitle, fill=(248, 250, 252), font=get_font(22, bold=True))
    draw5.text((68, y_step + 72), sdesc, fill=(148, 163, 184), font=get_font(18))
    y_step += 145

# GitHub 地址卡片
draw5.rounded_rectangle([48, H - 280, W - 48, H - 120], radius=16, fill=(24, 34, 52), outline=(37, 99, 235), width=2)
draw5.text((72, H - 250), "🚀 GitHub 开源仓库地址", fill=(96, 165, 250), font=get_font(22, bold=True))
draw5.text((72, H - 205), "github.com/zhqin01/antigravity-context-monitor", fill=(255, 255, 255), font=get_font(26, bold=True))
draw5.text((72, H - 160), "⭐ 觉得实用的小伙伴欢迎点个 Star 支持一下！", fill=(250, 204, 21), font=get_font(20))

card5.save(os.path.join(out_dir, '05_how_to_install.png'), 'PNG')
print('Card 5 generated')
