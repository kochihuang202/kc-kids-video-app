"""Revise the seven-scene episode 003 reading edition."""
import json
from pathlib import Path
import re
import sys

from section_illustrations import plain_text

engine, source, output = map(Path, sys.argv[1:4])
sys.path[:0] = [str(engine), str(engine / ".venv_stt/Lib/site-packages")]
import taiwan_zhuyin_engine as ze

page = source.read_text(encoding="utf-8")
dictionary = re.search(r"(window\.GLOSSARY_DATA\s*=\s*)(\{[^\n]*\})(;)", page)
glossary = json.loads(dictionary[2])
overrides = dict(ze.PHRASE_OVERRIDES)
for phrase, target, sound in [
    ("長約", "長", "ㄔㄤˊ"), ("太長", "長", "ㄔㄤˊ"),
    ("讓它長", "長", "ㄔㄤˊ"), ("它就長", "長", "ㄔㄤˊ"),
    ("蝦兵蟹將", "將", "ㄐㄧㄤˋ"), ("勇將", "將", "ㄐㄧㄤˋ"),
    ("應道", "應", "ㄧㄥˋ"), ("答應", "應", "ㄧㄥˋ"),
    ("商量", "量", "ㄌㄧㄤˊ"), ("準確地", "地", "ㄉㄜ˙"),
    ("嘿喲嘿喲地", "地", "ㄉㄜ˙"), ("不斷地", "地", "ㄉㄜ˙"),
    ("還得", "得", "ㄉㄟˇ"),
    ("精準地", "地", "ㄉㄜ˙"), ("水有多深", "深", "ㄕㄣ"),
]:
    previous = dict(overrides.get(phrase, []))
    overrides[phrase] = [(c, sound if c == target else previous.get(c) or ze.pinyin(c, style=ze.Style.BOPOMOFO)[0][0]) for c in phrase]

def ruby(text):
    return ze.ruby_plain_text(text, overrides)

cards = {
    "斤": ("⚖️", "古人用斤來說東西有多重。", "鋼叉和畫戟，哪一把比較重？", "畫戟！七千二百斤比三千六百斤重。"),
    "龍婆": ("🐉", "龍婆是龍王的妻子。", "誰提醒龍王去海底寶庫找神鐵？", "是龍婆，她知道神鐵最近一直發光。"),
    "灌醉": ("🍶", "一直勸別人喝酒，讓對方喝醉。", "龍王請悟空喝酒，心裡在打什麼主意？", "他們想等悟空喝醉，再把他抓起來。"),
    "擺布": ("🎭", "控制別人，要對方照自己的意思做。", "如果你沒辦法自己選，只能聽別人的，這叫什麼？", "這就叫被別人擺布。"),
    "定海神珍鐵": ("🌊", "故事裡，大禹用這根神鐵量水有多深。", "這根神鐵後來變成什麼寶物？", "如意金箍棒！它能變得又長又粗，也能縮得像針一樣小。"),
    "九股鋼叉": ("🍴", "股在這裡就是叉子的尖頭。九股鋼叉有九個尖頭。", "如果少一個尖頭，還剩幾個？", "八個尖頭。你答對了嗎？"),
    "方天畫戟": ("🌙", "它像一桿長槍，尖頭旁邊有月牙形的刀刃。", "哪一部分像月亮？", "槍頭旁彎彎的刀刃。"),
    "巡海夜叉": ("🐚", "故事裡替龍王看守宮門的守衛。", "悟空來到龍宮，誰先攔下他？", "巡海夜叉。他得先問清楚來客是誰。"),
    "趁手": ("✏️", "拿起來剛剛好，用起來很順。", "太粗的筆不好握，那支筆趁手嗎？", "不趁手。能輕鬆握住的筆才趁手。"),
    "一丈": ("📏", "丈是古人量長短的單位。", "故事用丈來說鋼叉有多長，還是有多重？", "有多長。說重量時，故事用的是斤。"),
}
for word, (icon, meaning, question, answer) in cards.items():
    diagram = {
        "斤": f'<p>🍴 {ruby("三千六百斤")}<br>🌙 {ruby("七千二百斤")}</p>',
        "定海神珍鐵": f'<p>🪨 {ruby("大鐵柱")} → 🪄 {ruby("金箍棒")} → 🪡 {ruby("小針")}</p>',
        "九股鋼叉": f'<p aria-hidden="true">🔺🔺🔺　🔺🔺🔺　🔺🔺🔺</p>',
    }.get(word, "")
    glossary[word] = {"title_ruby": ruby(word), "meaning_ruby":
        f'<p><span aria-hidden="true">{icon}</span> {ruby(meaning)}</p>'
        f'{diagram}'
        f'<details class="ep003-word-quiz"><summary>💡 {ruby(question)}</summary><p>✨ {ruby(answer)}</p></details>'}
for word in ("定海神針", "強制拆遷"):
    glossary.pop(word, None)

figures = re.findall(r'<figure class="story-picture".*?</figure>', page, re.S)
paragraphs = [(m[1], plain_text(m[2])) for m in re.finditer(r'<p class="(source-block[^"]*)">(.*?)</p>', page, re.S)]
starts = [
    ("悟空到龍宮", "寶貝，"),
    ("九股鋼叉太輕了", "「你有什麼事"),
    ("悟空單手舞畫戟", "「好好好。來呀"),
    ("海底寶庫的神鐵", "這個時候啊，有個龍婆"),
    ("金箍棒變大變小", "「哎呀，好是好"),
    ("龍王商量怎麼對付悟空", "「嗯，龍王啊，我還想麻煩"),
    ("悟空帶著寶物回花果山", "沒多大功夫"),
]
edits = {
    "夜叉就是吃人的惡鬼啊！": "巡海夜叉是替龍王看守宮門的守衛！",
    "這個龍王給孫悟空說的九股鋼叉呀": "龍王叫人抬來的九股鋼叉呀",
    "，最多不會超過五個尖": "",
    "它有一丈來長": "它長約一丈",
    "但是這槍頭啊，是個井字形": "槍頭旁還有月牙形的刀刃",
    "定海神針鐵": "定海神珍鐵", "這個神針鐵呀": "這根神鐵呀",
    "定大江大海水深水淺的定子": "用來測量江河和大海深度的神鐵",
    "俺老孫得怎麼謝你啊": "俺老孫該怎麼謝你啊",
    "甭提多樂了": "高興得不得了", "小鱒魚": "小魚",
    "孫悟空全聽著了": "孫悟空全聽見了",
    "沒多大功夫啊": "沒過多久", "擺佈": "擺布", "王八精": "烏龜精",
    "給東海龍王來了個「強制拆遷」": "打斷了龍宮的大柱子",
    "稀里嘩啦": "稀哩嘩啦", "劈里啪啦": "劈哩啪啦",
}
questions = {
    3: ("哪一種工具適合你？", "鋼叉和畫戟都很重，為什麼悟空還覺得太輕？", "悟空的力氣很大，拿重一點的兵器反而更順手。就像寫字時，選一支自己握得住的筆就好。"),
    6: ("如果你是龍王", "悟空說沒有盔甲就不走。龍王想把他灌醉。你會怎麼跟悟空說？", "可以試著說：「我可以借你兵器，但這件盔甲不能送你。我們再想別的辦法吧。」"),
}

def render_question(number):
    if number not in questions:
        return ""
    title, prompt, answer = questions[number]
    return (f'<div class="interaction-card"><div class="interaction-card-header"><div class="interaction-card-title">💡 {ruby(title)}</div></div>'
            f'<div class="interaction-prompt">{ruby(prompt)}</div><details class="interaction-discovery">'
            f'<summary>⭐ {ruby("看看一種想法")}</summary>{ruby(answer)}</details></div>')

assert len(figures) == 7
blocks = []
section = 0
for cls, text in paragraphs:
    if section < len(starts) and text.startswith(starts[section][1]):
        blocks.append(render_question(section))
        blocks.append(f'<h2 class="section-heading">{ruby(starts[section][0])}</h2>')
        blocks.append(figures[section])
        section += 1
    if text.startswith("孫悟空搶走了金箍棒"):
        text = "悟空帶走了金箍棒和盔甲，還打斷了龍宮的大柱子。四海龍王會怎麼做呢？"
    for old, new in edits.items():
        text = text.replace(old, new)
    sentence = ze.ruby_content(text, overrides, list(glossary))
    blocks.append(f'<p class="{cls}">{sentence}</p>')
    if "能擱到耳朵眼裡頭" in text:
        blocks.append(f'<p class="source-block">💡 {ruby("悟空能把金箍棒縮小，是故事裡的法術。小東西放進耳朵可能會受傷。")}</p>')
assert section == 7
start = page.index("<h2")
end = page.index("<!-- 章節底部翻頁列 -->", start)
result = page[:start] + "\n".join(blocks) + "\n" + page[end:]
result = result.replace("</head>", """<style id="ep003-word-style">
.ep003-word-quiz { background: #eff7ed; color: #203f32; padding: .55rem .85rem; border-radius: .85rem; margin-top: .65rem; }
.ep003-word-quiz summary, .interaction-discovery summary { cursor: pointer; padding-block: .35rem; }
.ep003-word-quiz summary:focus-visible, .interaction-discovery summary:focus-visible { outline: 3px solid #226951; outline-offset: 3px; }
.ep003-word-quiz p { margin-block: .5rem .15rem; }
</style>
</head>""", 1)
result = re.sub(r"(window\.GLOSSARY_DATA\s*=\s*)\{[^\n]*\}(;)",
                lambda m: m[1] + json.dumps(glossary, ensure_ascii=False) + m[2], result, count=1)
output.write_text(result, encoding="utf-8")
