<script setup>
import { ref, computed } from 'vue'

// 各国钩针针法缩写映射表（清单 5.6 / 改造项 12）
// 说明：美式(US)与英式(UK)术语体系不同，同一个缩写可能指不同针法，
// 看图解前务必先确认图案作者用的是哪一套；本表仅作速查参考。
// cn = 中文文字图解里常用的字母符号（CH/SL/X/T/F/E/V/A/W/M/K/R/H…），
// 它们与图形符号（○ ╳ ┬ …）一一对应；没有统一写法时留空，表格显示「—」。
const LANGS = [
  { key: 'zh', label: '中文' },
  { key: 'us', label: 'US 美式' },
  { key: 'uk', label: 'UK 英式' },
  { key: 'es', label: 'ES 西语' },
  { key: 'tr', label: 'TR 土语' },
  { key: 'fr', label: 'FR 法语' },
  { key: 'it', label: 'IT 意语' },
  { key: 'de', label: 'DE 德语' },
  { key: 'pt', label: 'PT 葡语' },
  { key: 'ru', label: 'RU 俄语' },
  { key: 'nl', label: 'NL 荷语' }
]

const DEFAULT_LANGS = ['zh', 'us', 'uk', 'es', 'tr', 'fr']
const GROUP_BASIC = '基础针法与常用术语'
const GROUP_ADVANCED = '进阶 / 特殊针法（中文图解符号）'

const ROWS = [
  // ===== 基础针法与常用术语 =====
  { g: GROUP_BASIC, cn: 'CH', zh: '锁针 / 起针链', en: 'chain', us: 'ch', uk: 'ch', es: 'cad / c', tr: 'zn / ilmek', fr: 'ml / ch', it: 'cat / cat.', de: 'Lm / M', pt: 'corr / ch', ru: 'вп', nl: 'l / ketting' },
  { g: GROUP_BASIC, cn: 'SL', zh: '引拔针', en: 'slip stitch', us: 'sl st', uk: 'sl st / ss', es: 'pe / pd', tr: 'kaydırma', fr: 'mc', it: 'm.bss', de: 'Km', pt: 'pbx / pe', ru: 'сс', nl: 'hv' },
  { g: GROUP_BASIC, cn: 'X', zh: '短针', en: 'single / double crochet', us: 'sc', uk: 'dc', es: 'pb / mp', tr: 'sık iğne (si)', fr: 'ms', it: 'm.bassa', de: 'fM', pt: 'pb / mp', ru: 'сбн', nl: 'v' },
  { g: GROUP_BASIC, cn: 'T', zh: '中长针', en: 'half double / half treble', us: 'hdc', uk: 'htr', es: 'mpa / pma', tr: 'yarım trabzan', fr: 'demi-bride', it: 'm.mezza alta', de: 'hStb', pt: 'mpa / pma', ru: 'пстсн', nl: 'hstk' },
  { g: GROUP_BASIC, cn: 'F', zh: '长针', en: 'double / treble crochet', us: 'dc', uk: 'tr', es: 'pa', tr: 'trabzan (t)', fr: 'bride (B)', it: 'm.alta', de: 'Stb', pt: 'pa / p', ru: 'ссн', nl: 'stk' },
  { g: GROUP_BASIC, cn: 'E', zh: '长长针', en: 'treble / double treble', us: 'tr', uk: 'dtr', es: 'pad', tr: 'ikili trabzan', fr: 'double bride (DB / d-br)', it: 'm.altissima', de: 'DStb', pt: 'pad', ru: 'с2н', nl: 'dstk' },
  { g: GROUP_BASIC, cn: 'V', zh: '加针（一针里钩两针）', en: 'increase', us: 'inc', uk: 'inc', es: 'aum', tr: 'artırma', fr: 'aug', it: 'aum', de: 'Zun', pt: 'aum', ru: 'приб', nl: 'meerderen' },
  { g: GROUP_BASIC, cn: 'A', zh: '减针（两针并一针）', en: 'decrease', us: 'dec / sc2tog', uk: 'dec / dc2tog', es: 'dism', tr: 'azaltma', fr: 'dim', it: 'dim', de: 'Abn', pt: 'dim', ru: 'уб / убав', nl: 'minderen' },
  { g: GROUP_BASIC, cn: 'st', zh: '针目', en: 'stitch(es)', us: 'st / sts', uk: 'st / sts', es: 'p / pts', tr: 'ilmek', fr: 'm / ms', it: 'm / maglie', de: 'M', pt: 'p / pts', ru: 'п / петля', nl: 'st / stk' },
  { g: GROUP_BASIC, cn: 'n( )', zh: '重复', en: 'repeat', us: 'rep', uk: 'rep', es: 'rep', tr: 'tekrar', fr: 'rép', it: 'rip', de: 'wdh', pt: 'rep', ru: 'повтор', nl: 'herh' },
  { g: GROUP_BASIC, cn: 'K', zh: '跳过', en: 'skip', us: 'sk', uk: 'miss', es: 'saltar', tr: 'atla', fr: 'sauter', it: 'saltare', de: 'überspr.', pt: 'saltar', ru: 'пропустить', nl: 'overslaan' },
  { g: GROUP_BASIC, cn: 'R', zh: '圈 / 轮（环形编织）', en: 'round', us: 'rnd', uk: 'rnd', es: 'vta / vuelta', tr: 'tur / sıra', fr: 'tour / rg', it: 'giro', de: 'Rd', pt: 'volta / carr.', ru: 'круг (ряд по кругу)', nl: 'toer / rnd' },
  { g: GROUP_BASIC, cn: 'H', zh: '行（往返编织）', en: 'row', us: 'row', uk: 'row', es: 'hilera / h', tr: 'sıra', fr: 'rang', it: 'riga', de: 'R / Reihe', pt: 'carreira', ru: 'ряд', nl: 'rij / toer' },
  { g: GROUP_BASIC, cn: '', zh: '正面', en: 'right side', us: 'RS', uk: 'RS', es: 'LD / derecho', tr: 'ön yüz', fr: 'endroit', it: 'dritto', de: 'Vorderseite', pt: 'direito', ru: 'лиц. сторона', nl: 'goede kant' },
  { g: GROUP_BASIC, cn: '', zh: '反面', en: 'wrong side', us: 'WS', uk: 'WS', es: 'LR / revés', tr: 'arka yüz', fr: 'envers', it: 'rovescio', de: 'Rückseite', pt: 'avesso', ru: 'изн. сторона', nl: 'verkeerde kant' },
  { g: GROUP_BASIC, cn: '', zh: '线圈 / 针上线圈', en: 'loop', us: 'lp', uk: 'lp', es: 'lazo / heb', tr: 'ilmek / halka', fr: 'boucle', it: 'anello / asola', de: 'Schlinge', pt: 'laçada', ru: 'петля', nl: 'lus' },
  { g: GROUP_BASIC, cn: '', zh: '空格 / 锁针空隙', en: 'space', us: 'sp', uk: 'sp', es: 'espacio', tr: 'boşluk', fr: 'espace', it: 'spazio', de: 'Zwischenraum', pt: 'espaço', ru: 'арка / промежуток', nl: 'ruimte' },
  { g: GROUP_BASIC, cn: '', zh: '合并一起钩', en: 'together', us: 'tog', uk: 'tog', es: 'juntos', tr: 'birlikte', fr: 'ensemble', it: 'insieme', de: 'zusammen', pt: 'juntos', ru: 'вместе', nl: 'samen' },
  { g: GROUP_BASIC, cn: '', zh: '收针 / 断线', en: 'fasten off', us: 'FO', uk: 'FO', es: 'rematar', tr: 'bitir / kapat', fr: 'arrêter', it: 'chiudere', de: 'abketten', pt: 'arrematar', ru: 'закрепить нить', nl: 'afhechten' },
  { g: GROUP_BASIC, cn: '', zh: '钩针', en: 'hook', us: 'hook', uk: 'hook', es: 'ganchillo', tr: 'tığ', fr: 'aiguille à crochet', it: 'uncinetto', de: 'Häkelnadel', pt: 'agulha de crochê', ru: 'крючок', nl: 'haaknaald' },
  { g: GROUP_BASIC, cn: '', zh: '毛线 / 线材', en: 'yarn', us: 'yarn', uk: 'yarn', es: 'hilo / lana', tr: 'iplik', fr: 'fil / laine', it: 'filato', de: 'Garn', pt: 'fio / lã', ru: 'пряжа', nl: 'garen' },

  // ===== 进阶 / 特殊针法：中文文字图解符号 + US/UK 通用写法 =====
  // 这些针法在各国出版物里写法差异极大，缺权威统一译名，其余语言列留空，
  // 不臆造缩写；查具体图解时请以原图附带的 stitch key 为准。
  { g: GROUP_ADVANCED, cn: 'R / MR', zh: '环形起针（魔术环）', en: 'magic ring / circle', us: 'MR', uk: 'MR' },
  { g: GROUP_ADVANCED, cn: 'E (3 卷)', zh: '3 卷长针（超长针）', en: 'double / triple treble', us: 'dtr', uk: 'ttr' },
  { g: GROUP_ADVANCED, cn: 'BLO', zh: '只挑后半针（内半针）', en: 'back loop only', us: 'BLO', uk: 'BLO' },
  { g: GROUP_ADVANCED, cn: 'FLO', zh: '只挑前半针（外半针）', en: 'front loop only', us: 'FLO', uk: 'FLO' },
  { g: GROUP_ADVANCED, cn: 'W', zh: '一针里钩 3 短针', en: 'single crochet 3 increase', us: 'sc3inc', uk: 'dc3inc' },
  { g: GROUP_ADVANCED, cn: 'M', zh: '3 短针并 1 针', en: 'single crochet 3 together', us: 'sc3tog', uk: 'dc3tog' },
  { g: GROUP_ADVANCED, cn: 'TV', zh: '中长针加针', en: 'half double 2 increase', us: 'hdc inc', uk: 'htr inc' },
  { g: GROUP_ADVANCED, cn: 'TA', zh: '中长针减针', en: 'half double 2 together', us: 'hdc2tog', uk: 'htr2tog' },
  { g: GROUP_ADVANCED, cn: 'FV', zh: '长针加针', en: 'double 2 increase', us: 'dc inc', uk: 'tr inc' },
  { g: GROUP_ADVANCED, cn: 'FA', zh: '长针减针', en: 'double 2 together', us: 'dc2tog', uk: 'tr2tog' },
  { g: GROUP_ADVANCED, cn: 'WF', zh: '外钩长针（前侧针柱）', en: 'front post double / treble', us: 'FPdc', uk: 'FPtr' },
  { g: GROUP_ADVANCED, cn: 'NF', zh: '内钩长针（后侧针柱）', en: 'back post double / treble', us: 'BPdc', uk: 'BPtr' },
  { g: GROUP_ADVANCED, cn: 'Q', zh: '枣形针 / 泡泡针', en: 'cluster / bubble stitch', us: '3dc cluster', uk: '3tr cluster' },
  { g: GROUP_ADVANCED, cn: 'G', zh: '爆米花针', en: 'popcorn stitch', us: '5dc popcorn', uk: '5tr popcorn' },
  { g: GROUP_ADVANCED, cn: 'Y', zh: '狗牙针', en: 'picot', us: 'picot', uk: 'picot' },
  { g: GROUP_ADVANCED, cn: 'N', zh: '反短针 / 蟹针', en: 'reverse single / crab stitch', us: 'RSC', uk: 'CS' },
  { g: GROUP_ADVANCED, cn: 'yo', zh: '绕线（挂线）', en: 'yarn over (hook)', us: 'yo', uk: 'yoh' },
  { g: GROUP_ADVANCED, cn: '翻转', zh: '翻面 / 翻转织片', en: 'turn', us: 'turn', uk: 'turn' }
]

const keyword = ref('')
const selectedLangs = ref([...DEFAULT_LANGS])

const activeLangs = computed(() => LANGS.filter(l => selectedLangs.value.includes(l.key)))

const filteredRows = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return ROWS
  return ROWS.filter(row => {
    if (row.zh.toLowerCase().includes(q) || row.en.toLowerCase().includes(q)) return true
    if (String(row.cn || '').toLowerCase().includes(q) || String(row.g || '').toLowerCase().includes(q)) return true
    return LANGS.some(l => String(row[l.key] || '').toLowerCase().includes(q))
  })
})

// 在分组交界处插入一条分组标题行，便于区分基础表与进阶表
const groupedRows = computed(() => {
  const out = []
  let lastGroup = ''
  filteredRows.value.forEach(row => {
    if (row.g !== lastGroup) {
      out.push({ type: 'group', label: row.g })
      lastGroup = row.g
    }
    out.push({ type: 'row', row, key: row.g + '|' + row.zh + '|' + row.cn })
  })
  return out
})

const totalColumns = computed(() => activeLangs.value.length + 2)

function toggleLang(key) {
  const i = selectedLangs.value.indexOf(key)
  if (i >= 0) {
    // 至少保留一列，避免表格空掉
    if (selectedLangs.value.length > 1) selectedLangs.value.splice(i, 1)
  } else {
    selectedLangs.value.push(key)
  }
}

function resetLangs() {
  selectedLangs.value = [...DEFAULT_LANGS]
}
</script>

<template>
  <div class="abbr-chart">
    <div class="abbr-notice">
      <strong>⚠️ 先看这一条：US 与 UK 术语不通用。</strong>
      同一个 <code>dc</code> 在美式图解里是「长针」，在英式图解里却是「短针」；美式的 <code>sc</code>（短针）对应英式的 <code>dc</code>。
      拿到图解先确认作者用的是哪一套，再看缩写，否则成品尺寸会完全不对。国际通用的钩针符号图（○ ╳ ┬ 等）不受语言影响，是最可靠的对照依据。
      表格第二列「中文图解符号」就是中文文字图解常用的字母记号（<code>CH</code> 锁针、<code>X</code> 短针、<code>F</code> 长针、<code>V</code> 加针、<code>A</code> 减针…），与图形符号一一对应。
    </div>

    <div class="abbr-controls">
      <input v-model="keyword" class="abbr-search" type="search"
        placeholder="搜索针法 / 缩写 / 中文符号，例如 sc / F / 长针 / trabzan"
        aria-label="搜索针法或缩写" />
      <span class="abbr-count">{{ filteredRows.length }} / {{ ROWS.length }} 条</span>
    </div>

    <div class="abbr-langs" role="group" aria-label="选择显示的语言列">
      <span class="abbr-langs__label">显示语言：</span>
      <button v-for="lang in LANGS" :key="lang.key" type="button"
        class="abbr-lang" :class="{ active: selectedLangs.includes(lang.key) }"
        :aria-pressed="selectedLangs.includes(lang.key)"
        @click="toggleLang(lang.key)">{{ lang.label }}</button>
      <button type="button" class="abbr-reset" @click="resetLangs">重置</button>
    </div>

    <div class="abbr-table-wrap">
      <table class="abbr-table">
        <thead>
          <tr>
            <th class="abbr-th-stitch">针法 / Stitch</th>
            <th class="abbr-th-symbol">中文图解符号</th>
            <th v-for="lang in activeLangs" :key="lang.key">{{ lang.label }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(item, idx) in groupedRows" :key="item.key || ('g-' + idx)">
            <tr v-if="item.type === 'group'" class="abbr-group">
              <td :colspan="totalColumns">{{ item.label }}</td>
            </tr>
            <tr v-else>
              <td class="abbr-name">
                <strong>{{ item.row.zh }}</strong>
                <span>{{ item.row.en }}</span>
              </td>
              <td class="abbr-symbol">
                <span v-if="item.row.cn" class="abbr-symbol__chip">{{ item.row.cn }}</span>
                <span v-else class="abbr-symbol__none">—</span>
              </td>
              <td v-for="lang in activeLangs" :key="lang.key" class="abbr-code">{{ item.row[lang.key] || '—' }}</td>
            </tr>
          </template>
          <tr v-if="filteredRows.length === 0">
            <td :colspan="totalColumns" class="abbr-empty">没有匹配的针法，换个关键词试试</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="abbr-footnote">
      各国图解习惯与译名存在差异，同一针法在不同出版物里可能有多种缩写；本表为常用写法速查，具体仍以原图解附带的符号说明（stitch key）为准。
      进阶 / 特殊针法在各语种里没有统一标准写法，因此只列中文图解符号与 US / UK 通用缩写，其余语言列留空而不臆造。
      中文图解符号是行业通用的字母记号，与图形符号表配套；不同作者可能对同一针法使用不同字母，遇到冲突请以该份图解自己的符号说明为准。
      本页为静态参考内容，不含机器翻译，欢迎通过「联系我们」补充你所在地区的标准写法。
    </p>
  </div>
</template>

<style scoped>
.abbr-chart {
  margin-top: 26px;
}

.abbr-notice {
  padding: 14px 16px;
  border-left: 4px solid var(--primary-color, #ff2e4d);
  background: var(--bg-color-secondary, #f6f8fc);
  border-radius: 0 10px 10px 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-color-primary, #1f2430);
}

.abbr-notice code {
  background: rgba(128, 128, 128, 0.14);
  padding: 1px 5px;
  border-radius: 4px;
}

.abbr-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 12px;
}

.abbr-search {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid rgba(128, 128, 128, 0.28);
  border-radius: 10px;
  background: var(--bg-color-primary, #fff);
  color: var(--text-color-primary, #1f2430);
  font-size: 14px;
  box-sizing: border-box;
}

.abbr-search:focus {
  outline: none;
  border-color: var(--primary-color, #ff2e4d);
}

.abbr-count {
  font-size: 12.5px;
  color: var(--text-color-secondary, #999);
  white-space: nowrap;
}

.abbr-langs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
}

.abbr-langs__label {
  font-size: 13px;
  color: var(--text-color-secondary, #888);
  margin-right: 2px;
}

.abbr-lang {
  padding: 4px 10px;
  border: 1px solid rgba(128, 128, 128, 0.26);
  border-radius: 999px;
  background: transparent;
  color: var(--text-color-secondary, #888);
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.abbr-lang:hover {
  border-color: var(--primary-color, #ff2e4d);
}

.abbr-lang.active {
  background: var(--primary-color, #ff2e4d);
  border-color: var(--primary-color, #ff2e4d);
  color: #fff;
}

.abbr-reset {
  border: none;
  background: transparent;
  color: var(--accent-color, #2d6cdf);
  font-size: 12.5px;
  cursor: pointer;
}

.abbr-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-color-primary, #e6e9ef);
  border-radius: 12px;
}

.abbr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
  white-space: nowrap;
}

.abbr-table th,
.abbr-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color-primary, #eceef3);
}

.abbr-table th {
  position: sticky;
  top: 0;
  background: var(--bg-color-secondary, #f6f8fc);
  color: var(--text-color-primary, #1f2430);
  font-weight: 700;
  z-index: 1;
}

.abbr-table tbody tr:last-child td {
  border-bottom: none;
}

.abbr-table tbody tr:hover td {
  background: var(--bg-color-secondary, #fafbfe);
}

.abbr-th-stitch {
  min-width: 190px;
}

.abbr-th-symbol {
  min-width: 108px;
}

.abbr-name {
  color: var(--text-color-primary, #1f2430);
  white-space: normal;
  min-width: 170px;
}

.abbr-name span {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-color-secondary, #999);
}

.abbr-symbol {
  min-width: 96px;
}

.abbr-symbol__chip {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 6px;
  background: rgba(255, 46, 77, 0.1);
  color: var(--primary-color, #ff2e4d);
  font-family: "SF Mono", Consolas, Menlo, monospace;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.abbr-symbol__none {
  color: var(--text-color-secondary, #bbb);
}

.abbr-group td {
  padding: 9px 12px !important;
  background: var(--bg-color-secondary, #f2f5fa);
  color: var(--text-color-secondary, #7c8494);
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border-color-primary, #e6e9ef);
}

.abbr-code {
  font-family: "SF Mono", Consolas, Menlo, monospace;
  font-size: 13px;
  color: var(--text-color-primary, #1f2430);
}

.abbr-empty {
  padding: 28px 0 !important;
  text-align: center;
  color: var(--text-color-secondary, #999);
}

.abbr-footnote {
  margin: 14px 0 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-color-secondary, #999);
}

@media (max-width: 640px) {
  .abbr-controls {
    flex-wrap: wrap;
  }

  .abbr-search {
    width: 100%;
    flex-basis: 100%;
  }

  .abbr-table th,
  .abbr-table td {
    padding: 9px 10px;
  }
}
</style>
