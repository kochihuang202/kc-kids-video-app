"""Build the reviewed episode 004 from the original reader page."""
import json
from pathlib import Path
import re
import sys

from section_illustrations import plain_text

engine, source, output = map(Path, sys.argv[1:4])
sys.path[:0] = [str(engine), str(engine / ".venv_stt/Lib/site-packages")]
import taiwan_zhuyin_engine as ze

page = source.read_text(encoding="utf-8")
dictionary = re.compile(r"(window\.GLOSSARY_DATA\s*=\s*)(\{[^\n]*\})(;)")
glossary = json.loads(dictionary.search(page)[2])
original = {word: entry.copy() for word, entry in glossary.items()}
overrides = dict(ze.PHRASE_OVERRIDES)
for word, sounds in {
    "長臉": "ㄔㄤˊ ㄌㄧㄢˇ",
    "長了": "ㄔㄤˊ ㄌㄜ˙",
    "哪動得了": "ㄋㄚˇ ㄉㄨㄥˋ ㄉㄜ˙ ㄌㄧㄠˇ",
    "禁得住": "ㄐㄧㄣ ㄉㄜ˙ ㄓㄨˋ",
    "只得": "ㄓˇ ㄉㄜˊ",
    "了帳": "ㄌㄧㄠˇ ㄓㄤˋ",
    "管不著": "ㄍㄨㄢˇ ㄅㄨˋ ㄓㄠˊ",
    "千萬得": "ㄑㄧㄢ ㄨㄢˋ ㄉㄟˇ",
    "天兵天將": "ㄊㄧㄢ ㄅㄧㄥ ㄊㄧㄢ ㄐㄧㄤˋ",
    "勾畫": "ㄍㄡ ㄏㄨㄚˋ",
    "獼猴": "ㄇㄧˊ ㄏㄡˊ",
    "禺狨": "ㄩˊ ㄖㄨㄥˊ",
    "將那": "ㄐㄧㄤ ㄋㄚˋ",
    "定海神珍鐵": "ㄉㄧㄥˋ ㄏㄞˇ ㄕㄣˊ ㄓㄣ ㄊㄧㄝˇ",
    "酒意": "ㄐㄧㄡˇ ㄧˋ",
    "勾你": "ㄍㄡ ㄋㄧˇ",
}.items():
    overrides[word] = list(zip(word, sounds.split(), strict=True))

YI_SECOND = set("句個樣變共套座樂下陣看瞪萬定")
YI_FOURTH = set("身隻戳根群笑抬聲擱天黑白聽推枚直本驚轉筆扔通")
RUBY_TOKEN = re.compile(r"<ruby\b[^>]*><rb>([^<]+)</rb>.*?</ruby>", re.S)


def pronounce_yi(markup):
    tokens = list(RUBY_TOKEN.finditer(markup))
    edits = []
    for current, following in zip(tokens, tokens[1:]):
        if current[1] != "一" or re.sub(r"<[^>]+>", "", markup[current.end():following.start()]).strip():
            continue
        next_char = following[1]
        tone = "ˊ" if next_char in YI_SECOND else "ˋ" if next_char in YI_FOURTH else ""
        if not tone:
            continue
        edits.append((current.start(), current.end(), ze.ruby_phrase_html([("一", "ㄧ" + tone)])))
    for start, end, replacement in reversed(edits):
        markup = markup[:start] + replacement + markup[end:]
    return markup


def ruby(text):
    return pronounce_yi(ze.ruby_plain_text(text, overrides))

definitions = """
披掛盔甲|打仗時穿戴的衣服、帽子和護具。
順手|做完一件事時，接著把另一件事也做了。
猴子猴孫|在這裡指花果山上跟著悟空的猴群。
探寶|到一個地方找寶物。
定海神珍鐵|故事裡，大禹用來量水深的神鐵。後來成了悟空的金箍棒。
威風|樣子很有氣勢，讓人一看就覺得厲害。
戳|用東西尖尖的一端往前刺或往下點。
耍耍|這裡指拿起來揮幾下，試著玩玩看。
哪動得了|根本沒辦法讓它動一點點。
合力|大家一起出力做同一件事。
扛|把東西放在肩上，用肩膀撐著搬走。
分毫未動|連一點點也沒有動。
身高萬丈|形容身體高得不得了，像一座大山一樣。
巨猴|身體大得驚人的猴子。
巨人|身體比一般人大很多的人。
老遠|離這裡很遠。
恢復原形|變回原來的樣子。
一擱|把東西往一個地方一放。
構造|一個東西裡面有哪些部分，這些部分是怎麼組在一起的。
仙猴|故事裡有法術的猴子。
千萬得|一定要做到，不能忘記。
妖王|故事裡帶領其他妖怪的頭兒。
拜見|帶著尊敬的心去見一個人。
聽從|聽了別人的話，就照著做。
英明|想得清楚，能做出好決定。
領導|帶著大家一起做事。
蛟魔王|悟空結拜的妖王之一。蛟是傳說中住在水裡、像龍的動物。
鵬魔王|悟空結拜的妖王之一。鵬是傳說中非常大的鳥。
獅駝王|悟空結拜的六位妖王之一。
獼猴王|悟空結拜的妖王之一。獼猴是一種猴子。
禺狨王|悟空結拜的妖王之一。禺狨是一種古書裡提到的猴子。
暈暈乎乎|頭昏昏的，感覺站不穩、想不清楚。
醉臥|喝醉後躺下來。
松蔭|松樹擋住陽光，在地上留下的陰涼處。
迷迷糊糊|腦袋還不清楚，像剛睡醒一樣。
不知不覺|事情已經發生了，自己卻沒發現。
酒勁|喝酒後頭暈或不清醒的感覺。
漸漸|一點一點地改變。
清醒|頭腦明白，知道身邊正在發生什麼。
城門樓子|蓋在城門上方的高樓。
巍峨|又高又大。這裡形容城門高得要仰起頭看。
百尺|尺是古人量長短的單位。這裡用來形容城門很高。
不由得|事情一下子就發生，自己也控制不住。
壽命|一個人或動物能活多久。
到頭了|已經到了最後。壽命到頭，就是活到最後一天。
勾我的魂|故事裡，鬼差要把悟空的魂帶到地府。
魂|故事裡看不見的自己，能離開身體到地府去。
閻王爺|故事裡掌管地府的王，也叫閻羅王。
索|在這裡指來要走一樣東西。
憑什麼|為什麼你有權這麼做？這句話常帶著不服氣。
手段|這裡是指悟空會使出的本領。
竄起來|一下子衝上來。這裡說悟空一下子非常生氣。
掏出|伸手從裡面把東西拿出來。
一枚|一個小東西。像一枚硬幣、一枚細針。
禁得住|撐得住，或受得了。
打趴|打得對方倒在地上。
掄起|用力把手上的東西揮起來。
掄開|把手上的東西用力揮開。
碗口|碗上面開口的地方。
斤|古人用來說東西有多重的單位。
叮咣五四|形容很多東西碰撞，發出一陣吵鬧的聲音。
叫喚|大聲叫出來。
撲通|重重跪下、跌倒或掉進水裡時，有時會聽到的聲音。
回合|比試的一輪。大戰三百回合，就是比試了許多輪。
掌管|負責管一個地方或一件事。
全包在我身上|這件事由我來負責，我會想辦法辦好。
一瞪|突然把眼睛睜大，盯著對方看。
滿臉堆笑|臉上一直帶著笑。這裡是閻王怕悟空生氣，努力陪著笑。
同名同姓|兩個人的姓和名字都一樣。
手下|在一個人底下做事的人。
差役|替官府跑腿、傳話或抓人的人。這裡指在地府做事的鬼差。
據理力爭|覺得事情不公平，就把理由說清楚，為自己爭取。
誤會|把別人說的話或做的事想錯了。
胡說|說了不是真的，或沒有根據的話。
帳本|把要記住的事情一筆一筆寫下來的本子。
性命|活著的生命。這裡說的是每個人或動物能活多久。
只得|沒有別的辦法，只好這麼做。
石猴|故事裡從石頭中出生的猴子。
壽終正寢|活到年紀很大，最後自然過世。
眼珠一轉|眼睛動了一下。故事裡常用來表示角色忽然想到了主意。
墨汁|寫毛筆字時用的黑色液體。
抹掉|擦掉或塗掉，讓原來的字看不見。
挨著|緊緊靠在旁邊。這裡指前後相連的幾頁。
凡是|只要是這一類的，全都算進去。
劃掉|用筆在字上畫一條線，表示不再算或不用了。
管不著|沒有權管這件事，也不能叫對方照自己的話做。
特意|為了某件事，專門去做。
吃虧|遇到讓自己受損失或受委屈的事。
無緣無故|沒有可以說明的原因，事情就發生了。
懇請|很認真、很有禮貌地拜託別人。
為臣等|替我們這些在您手下做事的人。
治罪|認定一個人做錯事後，按照規矩處罰他。
報仇雪恨|想讓傷害過自己的人也受處罰，好消掉心裡的怨氣。
安生日子|平平安安、少有麻煩的生活。
酒意|喝酒後頭有點昏、想睡或不太清楚的感覺。
巍峨百尺|形容城門又高又大。「尺」是古人量長短的單位。這裡是說城門高得要仰起頭看。
勾你|鬼差說的「勾你」，是要把你的魂帶去地府。
踏|用腳踩在東西上。
圍過來|從四周走近，把人或東西圈在中間。
微微|只有一點點。微微一笑，就是輕輕笑了一下。
痛快|心裡很開心、很舒服。這裡說妖王們在一起玩得很開心。
一套|把有圈的東西從上面放下去，圈住人或物。
腳下|這裡指城門樓的最下面，也就是城門前。
到這兒|到這裡來。
嘿嘿一樂|嘿嘿地笑了一下。
哪聽|這裡的意思是根本不肯聽。
騰|形容一下子起來。這裡說悟空突然火冒三丈。
晃了晃|拿在手裡輕輕搖幾下。
見門砸門|每看到一道門，就把那道門打壞。
哪敢|因為害怕或尊敬，所以不敢做。
多了去了|表示多得很，數也數不完。
抹沒了|用墨把原來的字塗掉，讓字看不見。
緊接著|前一件事一做完，就立刻做下一件事。
一通亂打|一下子到處揮打，沒有照著一定順序。
給告了|到能作主的人面前，說出對方做了什麼事。
臣|古時在君王手下做事的人，對君王說話時也用它稱自己。
妖猴|被當成妖怪的猴子。這裡是龍王對悟空的叫法。
過不上|沒辦法過得了這樣的生活。
"""
for line in definitions.strip().splitlines():
    word, meaning = line.split("|", 1)
    glossary.setdefault(word, {"title_ruby": ruby(word), "meaning_ruby": ruby(meaning)})
for entry in glossary.values():
    if not entry.get("meaning_ruby") and entry.get("meaning"):
        entry["meaning_ruby"] = ruby(entry["meaning"])

figures = re.findall(r'<figure class="story-picture".*?</figure>', page, re.S)
paragraphs = [(m[1], plain_text(m[2])) for m in re.finditer(r'<p class="(source-block[^"]*)">(.*?)</p>', page, re.S)]
starts = [
    ("悟空回花果山，和六個妖王結拜", "寶貝，"),
    ("悟空睡著了，黑白無常來了", "這一天啊，"),
    ("到了幽冥界，悟空追問原因", "哎喲，也不知走了多遠"),
    ("悟空揮棒闖進地府", "這兩個人哪聽"),
    ("悟空到森羅寶殿找閻王", "這森羅寶殿是哪兒啊"),
    ("悟空劃掉生死簿上的名字", "孫悟空接著問道"),
    ("龍王和閻王上天庭告狀", "咱們呀，返回來再說說"),
]
edits = {
    "搶走了如意金箍棒，又搶走了一身的披掛盔甲，順手啊，又把水晶宮給強拆了": "帶走了如意金箍棒和一身盔甲，還打斷了水晶宮的大柱子",
    "定海神針鐵": "定海神珍鐵",
    "這回不是金箍棒長了": "這回不是金箍棒變長了",
    "迷迷糊糊中，孫悟空就覺得": "孫悟空還帶著幾分酒意。迷迷糊糊中，他覺得",
    "他憑什麼勾我的魂啊": "他憑什麼把我的魂帶走啊",
    "這森羅寶殿是哪兒啊？這就是閻王爺的辦公室啊！": "森羅寶殿，就是閻王爺在地府辦事的大殿。",
    "全給勾劃了一遍": "全都用筆劃掉了",
}
questions = {
    5: ("如果被誤會了", "閻王說鬼差可能抓錯人。如果有人誤會你，你會怎麼把事情說清楚？", "可以先說發生了什麼，再請對方一起確認。"),
    6: ("悟空想到了誰", "悟空除了劃掉自己的名字，還劃掉了誰的名字？", "他也劃掉了猴子猴孫的名字。這時他想到的不只是自己，還有花果山的猴群。"),
}

def question(number):
    if number not in questions:
        return ""
    title, prompt, answer = questions[number]
    def with_cards(text):
        return pronounce_yi(ze.ruby_content(text, overrides, list(glossary)))
    return (f'<div class="interaction-card"><div class="interaction-card-header"><div class="interaction-card-title">💡 {with_cards(title)}</div></div>'
            f'<div class="interaction-prompt">{with_cards(prompt)}</div><div class="interaction-discovery">⭐ {with_cards(answer)}</div></div>')

assert len(figures) == 7
blocks = []
section = 0
for cls, text in paragraphs:
    if section < len(starts) and text.startswith(starts[section][1]):
        heading = pronounce_yi(ze.ruby_content(starts[section][0], overrides, list(glossary)))
        blocks.extend((question(section), f'<h2 class="section-heading">{heading}</h2>', figures[section]))
        section += 1
    if text.startswith("不過，寶貝，我在這兒必須提醒你"):
        text = "悟空把小針藏進耳朵，是故事裡的法術。我們的耳朵有細小的構造，把東西塞進耳朵或鼻子可能會受傷。"
    for old, new in edits.items():
        text = text.replace(old, new)
    annotated = pronounce_yi(ze.ruby_content(text, overrides, list(glossary)))
    blocks.append(f'<p class="{cls}">{annotated}</p>')
assert section == 7
start = page.index("<h2")
end = page.index("<!-- 章節底部翻頁列 -->", start)
result = page[:start] + "\n".join(blocks) + "\n" + page[end:]
linked = set(re.findall(r'data-word="([^"]+)"', result))
original_links = set(re.findall(r'data-word="([^"]+)"', page)) & original.keys()
missing_original_links = sorted((original_links | {"巍峨", "百尺"}) - linked)
if missing_original_links:
    links = "　".join(ze.ruby_content(word, overrides, [word]) for word in missing_original_links)
    extra = f'<p class="source-block" id="extra-glossary">{ruby("本集補充詞語")}　{links}</p>\n'
    result = result.replace("<!-- 章節底部翻頁列 -->", extra + "<!-- 章節底部翻頁列 -->", 1)
    linked = set(re.findall(r'data-word="([^"]+)"', result))
assert original_links <= linked
added = sorted(linked & (glossary.keys() - original.keys()))
glossary = {key: value for key, value in glossary.items() if key in original or key in linked}
assert all(all(glossary[key][field] == value for field, value in entry.items()) for key, entry in original.items())
result = dictionary.sub(lambda m: m[1] + json.dumps(glossary, ensure_ascii=False) + m[3], result, count=1)
output.write_text(result, encoding="utf-8")
print(len(original), "original cards preserved;", len(added), "new cards:", "、".join(added))
