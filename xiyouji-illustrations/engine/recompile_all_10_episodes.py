# -*- coding: utf-8 -*-
"""
《西遊記》第 001 ～ 010 回 全套臺灣注音極致精校編譯引擎
使用標準教育部辭典注音規範，全自動編譯 10 回繪本並部署
"""

import os
import sys
import json
import re

sys.path.append(r"c:\Users\ji3cp\Documents\FXN-Antigravity")
import taiwan_zhuyin_engine as ze
from journey_glossary_master import MASTER_GLOSSARY
from section_illustrations import apply_section_illustrations
import build_shimajiro_edition as ep1_data
import build_episode_002 as ep2_data
from episode_data_003_004 import EPISODE_003, EPISODE_004
from episode_data_005_006 import EPISODE_005, EPISODE_006
from episode_data_007_008 import EPISODE_007, EPISODE_008
from episode_data_009_010 import EPISODE_009, EPISODE_010

# 載入所有回目
episodes_json_path = r"c:\Users\ji3cp\Documents\xiyouji-reader\episodes.json"
with open(episodes_json_path, "r", encoding="utf-8") as f:
    portal_data = json.load(f)

# 標記 001~010 為 ready
for i in range(1, 11):
    for ep in portal_data["episodes"]:
        if ep["number"] == i:
            ep["is_ready"] = True
            ep["url"] = f"episodes/{i:03d}.html"
            break
    for season in portal_data["seasons"]:
        for ep in season["episodes"]:
            if ep["number"] == i:
                ep["is_ready"] = True
                ep["url"] = f"episodes/{i:03d}.html"
                break

with open(episodes_json_path, "w", encoding="utf-8") as f:
    json.dump(portal_data, f, ensure_ascii=False, indent=2)

all_episodes = portal_data["episodes"]

def build_nav_components(current_num):
    prev_ep = next((e for e in all_episodes if e["number"] == current_num - 1), None)
    next_ep = next((e for e in all_episodes if e["number"] == current_num + 1), None)
    
    # Top prev
    if prev_ep and prev_ep["is_ready"]:
        prev_top = f'<a href="{prev_ep["number_str"]}.html" class="nav-btn">‹ 上回</a>'
        prev_bottom = f'<a href="{prev_ep["number_str"]}.html">‹ 上回：第 {prev_ep["number_str"]} 回 {prev_ep["title"]}</a>'
    else:
        prev_top = '<span class="nav-btn disabled">‹ 上回</span>'
        prev_bottom = '<span class="nav-btn disabled" style="opacity: 0.35;">‹ 上回</span>'
        
    # Top next
    if next_ep and next_ep["is_ready"]:
        next_top = f'<a href="{next_ep["number_str"]}.html" class="nav-btn">下回 ›</a>'
        next_bottom = f'<a href="{next_ep["number_str"]}.html">下回：第 {next_ep["number_str"]} 回 {next_ep["title"]} ›</a>'
    elif next_ep:
        msg = f'第 {next_ep["number_str"]} 回「{next_ep["title"]}」正由製作團隊深度校訂注音與繪本中，敬請期待！'
        next_top = f'<a href="javascript:void(0)" onclick="alert(\'{msg}\')" class="nav-btn upcoming">下回 ›</a>'
        next_bottom = f'<a href="javascript:void(0)" onclick="alert(\'{msg}\')">下回：第 {next_ep["number_str"]} 回 {next_ep["title"]}（製作中）›</a>'
    else:
        next_top = '<span class="nav-btn disabled">下回 ›</span>'
        next_bottom = '<span class="nav-btn disabled" style="opacity: 0.35;">下回 ›</span>'
        
    options = []
    for ep in all_episodes:
        sel = ' selected' if ep["number"] == current_num else ''
        mark = '🌟 ' if ep["is_ready"] else '⏳ '
        if ep["is_ready"]:
            val = f"{ep['number_str']}.html"
        else:
            val = f"upcoming:{ep['number_str']}:{ep['title']}"
        options.append(f'<option value="{val}"{sel}>{mark}第 {ep["number_str"]} 回 {ep["title"]}</option>')
        
    select_html = f'''<select class="ep-select" onchange="if(this.value.startsWith('upcoming:')){{var p=this.value.split(':'); alert('第 '+p[1]+' 回「'+p[2]+'」深度校訂製作中，敬請期待！'); this.value='{current_num:03d}.html';}}else{{location.href=this.value}}">
      {''.join(options)}
    </select>'''
    
    return prev_top, next_top, select_html, prev_bottom, next_bottom

def render_unified_page(ep_num, ep_title, heading_ruby, body_inner_html, glossary_dict):
    prev_top, next_top, select_html, prev_bottom, next_bottom = build_nav_components(ep_num)
    glossary_json_str = json.dumps(glossary_dict, ensure_ascii=False)
    
    html = f'''<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>《西遊記》第 {ep_num:03d} 集：{ep_title} - 兒童繪本版</title>
  
  <link rel="stylesheet" href="../vendor/han-3.3.0/zhuyin.css">
  <link rel="stylesheet" href="../styles.css">
  <link rel="stylesheet" href="../reader.css">
</head>
<body data-font-size="md">

  <!-- 頂部統一導覽控制列 -->
  <header class="top-nav-bar">
    <div class="nav-left">
      <a href="../index.html" class="portal-btn">📚 目錄</a>
    </div>
    <div class="nav-center">
      {prev_top}
      {select_html}
      {next_top}
    </div>
    <div class="nav-right">
      <div class="control-group">
        <button id="btnFontSm" onclick="setFontSize('sm')">小</button>
        <button id="btnFontMd" class="active" onclick="setFontSize('md')">中</button>
        <button id="btnFontLg" onclick="setFontSize('lg')">大</button>
      </div>
      <button id="btnZhuyinToggle" class="toggle-btn active" onclick="toggleZhuyin()">🔤 注音</button>
      <button id="btnGlossaryToggle" class="toggle-btn active" onclick="toggleGlossary()">📖 生詞</button>
      <button id="btnInteractionToggle" class="toggle-btn active" onclick="toggleInteractions()">💡 互動</button>
    </div>
  </header>

  <!-- 正文閱讀畫布 -->
  <main class="reader">
    <article class="prose">
      <div class="chapter-heading">
        <h1>{heading_ruby}</h1>
      </div>
      
      {body_inner_html}

      <!-- 章節底部翻頁列 -->
      <footer class="chapter-nav-footer">
        {prev_bottom}
        <a href="../index.html">📚 回西遊記總目錄</a>
        {next_bottom}
      </footer>
    </article>
  </main>

  <!-- 巧虎風兒童大字生詞彈窗 -->
  <div id="vocabModal" class="vocab-modal" role="dialog" aria-modal="true" aria-hidden="true">
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal()" aria-label="關閉說明">×</button>
      <h3 id="modalWordTitle" class="modal-word-title"></h3>
      <div id="modalWordDef" class="modal-word-def"></div>
      <div class="modal-footer">
        <button class="modal-btn-confirm" onclick="closeModal()">我學會了！</button>
      </div>
    </div>
  </div>

  <script>
    window.GLOSSARY_DATA = {glossary_json_str};
    recordProgress({ep_num}, "{ep_title}");
  </script>
  <script src="../reader.js"></script>
</body>
</html>
'''
    return html

def compile_episode(ep_num, ep_title, paragraphs, raw_glossary, extra_phrases=None):
    phrase_dict = dict(ze.PHRASE_OVERRIDES)
    if extra_phrases:
        phrase_dict.update(extra_phrases)
        
    # 合併全域 7 歲兒童生詞庫與本回專屬生詞庫
    merged_glossary = dict(MASTER_GLOSSARY)
    if raw_glossary:
        merged_glossary.update(raw_glossary)
        
    # 提取本回全部文本（包含小節標題、對話、正文段落與插圖圖說）
    all_text_content = ""
    for item in paragraphs:
        if isinstance(item[1], str):
            all_text_content += item[1] + "\n"
        elif isinstance(item[1], (list, tuple)):
            for sub in item[1]:
                if isinstance(sub, str):
                    all_text_content += sub + "\n"
                    
    # 智慧篩選：抓取在本回中真實出現過的所有生詞（確保加載輕量精確）
    active_glossary = {}
    for word, item in merged_glossary.items():
        if word in all_text_content:
            active_glossary[word] = item
            
    # 長詞優先匹配
    glossary_keys = sorted(active_glossary.keys(), key=lambda w: len(w), reverse=True)
    
    # 編譯生詞卡（含標題與釋義注音）
    compiled_glossary = {}
    for word, item in active_glossary.items():
        meaning_text = item["meaning"]
        title_ruby = ze.ruby_plain_text(word, phrase_dict)
        meaning_ruby = ze.ruby_plain_text(meaning_text, phrase_dict)
        compiled_glossary[word] = {
            "title_ruby": title_ruby,
            "meaning_ruby": meaning_ruby
        }
        
    # 編譯段落
    body_blocks = []
    for item in paragraphs:
        block_type = item[0]
        
        if block_type in ["header"]:
            continue
            
        elif block_type == "h2":
            h2_text = item[1]
            h2_ruby = ze.ruby_content(h2_text, phrase_dict, glossary_keys)
            body_blocks.append(f'<h2 class="section-heading">{h2_ruby}</h2>')
            
        elif block_type == "p":
            p_text = item[1]
            p_ruby = ze.ruby_content(p_text, phrase_dict, glossary_keys)
            body_blocks.append(f'<p class="source-block">{p_ruby}</p>')
            
        elif block_type == "dialogue":
            d_text = item[1]
            d_ruby = ze.ruby_content(d_text, phrase_dict, glossary_keys)
            body_blocks.append(f'<p class="source-block dialogue-block">{d_ruby}</p>')
            
        elif block_type == "figure":
            img_src, caption = item[1]
            if not img_src.startswith("../"):
                img_src = "../" + img_src
            cap_ruby = ze.ruby_plain_text(caption, phrase_dict)
            body_blocks.append(f'''<figure class="story-picture">
  <img src="{img_src}" alt="{caption}" loading="lazy">
  <figcaption>{cap_ruby}</figcaption>
</figure>''')
            
        elif block_type == "interaction":
            if len(item[1]) == 4:
                c_tag, c_title_sub, c_prompt, c_discovery = item[1]
                c_title = f"{c_tag}：{c_title_sub}"
            else:
                c_title, c_prompt, c_discovery = item[1]
            t_ruby = ze.ruby_plain_text(c_title, phrase_dict)
            p_ruby = ze.ruby_plain_text(c_prompt, phrase_dict)
            d_ruby = ze.ruby_plain_text(c_discovery, phrase_dict)
            card_html = f'''<div class="interaction-card">
  <div class="interaction-card-header">
    <div class="interaction-card-title">{t_ruby}</div>
  </div>
  <div class="interaction-prompt">{p_ruby}</div>
  <div class="interaction-discovery">
    <span class="discovery-tag">⭐ 故事小發現：</span>{d_ruby}
  </div>
</div>'''
            body_blocks.append(card_html)
            
    body_inner_html = "\n".join(body_blocks)
    heading_raw = f"《西遊記》第 {ep_num:03d} 集：{ep_title}"
    heading_ruby = ze.ruby_plain_text(heading_raw, phrase_dict)
    
    full_html = render_unified_page(ep_num, ep_title, heading_ruby, body_inner_html, compiled_glossary)
    full_html = apply_section_illustrations(ep_num, full_html)
    dest_path = rf"c:\Users\ji3cp\Documents\xiyouji-reader\episodes\{ep_num:03d}.html"
    with open(dest_path, "w", encoding="utf-8") as f:
        f.write(full_html)
    print(f"Compiled Episode {ep_num:03d} {ep_title} -> {dest_path} (len={len(full_html)})")

# ==========================================
# 批次執行全 10 回編譯
# ==========================================
print("=== Recompiling Episode 001 ===")
compile_episode(1, "石猴出世", ep1_data.PARAGRAPHS, ep1_data.GLOSSARY)

print("=== Recompiling Episode 002 ===")
compile_episode(2, "悟空學藝", ep2_data.PARAGRAPHS, ep2_data.GLOSSARY)

batch_list = [
    EPISODE_003,
    EPISODE_004,
    EPISODE_005,
    EPISODE_006,
    EPISODE_007,
    EPISODE_008,
    EPISODE_009,
    EPISODE_010,
]

for ep in batch_list:
    print(f"=== Recompiling Episode {ep['num']:03d} ===")
    compile_episode(
        ep["num"],
        ep["title"],
        ep["paragraphs"],
        ep["glossary"],
        ep.get("phrase_overrides")
    )

# 重新生成全節目錄首頁 index.html
print("\nRegenerating portal index.html...")
import generate_portal_index

print("\n🎉 All 10 episodes successfully compiled with standard Taiwan Zhuyin Engine!")
