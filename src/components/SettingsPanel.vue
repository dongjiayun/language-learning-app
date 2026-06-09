<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { SOURCE_LANGUAGES, TARGET_LANGUAGES, ANNOTATION_LANGUAGES, PROFICIENCY_OPTIONS } from '@/types'
import changelog from '@/../CHANGELOG.md?raw'
import { version } from '@/../package.json'

const store = useAppStore()

interface ChangelogEntry {
  version: string
  date: string
  sections: { heading: string; items: string[] }[]
}

const FEATURE_LABELS: Record<string, string> = {
  speaking: '口语提示',
  chat: 'AI 对话',
  chat_translate: '对话翻译',
  chat_tips: '对话建议',
  practice: '口语练习',
  practice_tips: '练习建议',
  vocab_journal: '词汇期刊',
  vocab_assess: '能力评估',
  vocab_translate: '查词翻译',
  training_intensive: '强化训练',
  writing_topics: '写作命题',
  writing_hint: '写作提示',
  writing_eval: '写作评分',
}

const featureEntries = computed(() => {
  const features: Record<string, { promptTokens: number; completionTokens: number }> = (store.tokenUsage as any).byFeature || {}
  return Object.entries(features)
    .filter(([, v]) => v.promptTokens > 0 || v.completionTokens > 0)
    .sort((a, b) => (b[1].promptTokens + b[1].completionTokens) - (a[1].promptTokens + a[1].completionTokens))
    .map(([key, val]) => ({
      key,
      label: FEATURE_LABELS[key] || key,
      promptTokens: val.promptTokens,
      completionTokens: val.completionTokens,
      totalTokens: val.promptTokens + val.completionTokens,
      cost: (val.promptTokens / 1000000) * 1 + (val.completionTokens / 1000000) * 2,
    }))
})

function resetTokenUsage() {
  store.tokenUsage.promptTokens = 0
  store.tokenUsage.completionTokens = 0
  store.tokenUsage.totalTokens = 0
  store.tokenUsage.totalCost = 0
  ;(store.tokenUsage as any).byFeature = {}
  localStorage.removeItem('doulingo_token_usage')
}

const parsedChangelog = computed<ChangelogEntry[]>(() => {
  const lines = changelog.split('\n')
  const entries: ChangelogEntry[] = []
  let current: ChangelogEntry | null = null
  let currentSection: string | null = null
  let currentItems: string[] = []

  for (const line of lines) {
    const versionMatch = line.match(/^## v([\d.]+) \(([^)]+)\)/)
    if (versionMatch) {
      if (current) {
        if (currentSection && currentItems.length) {
          current.sections.push({ heading: currentSection, items: currentItems })
        }
        entries.push(current)
      }
      current = { version: versionMatch[1], date: versionMatch[2], sections: [] }
      currentSection = null
      currentItems = []
      continue
    }

    if (!current) continue

    const sectionMatch = line.match(/^### (.+)/)
    if (sectionMatch) {
      if (currentSection && currentItems.length) {
        current.sections.push({ heading: currentSection, items: currentItems })
      }
      currentSection = sectionMatch[1]
      currentItems = []
      continue
    }

    const itemMatch = line.match(/^- (.+)/)
    if (itemMatch && currentSection) {
      currentItems.push(itemMatch[1])
    }
  }

  if (current) {
    if (currentSection && currentItems.length) {
      current.sections.push({ heading: currentSection, items: currentItems })
    }
    entries.push(current)
  }

  return entries
})

const apiKey = ref(store.getApiKey())
const xfyunAppId = ref(localStorage.getItem('xfyun_app_id') || '')
const xfyunApiKey = ref(localStorage.getItem('xfyun_api_key') || '')
const xfyunApiSecret = ref(localStorage.getItem('xfyun_api_secret') || '')
const saved = ref(false)
const xfyunSaved = ref(false)
const selectedSourceLang = ref(store.sourceLang)
const selectedTargetLang = ref(store.targetLang)
const selectedAnnotateLang = ref(store.annotateLang)
const showChangelog = ref(false)

// ===== 检查更新 =====
const updating = ref(false)
const updateResult = ref<{ isLatest: boolean; latestVersion?: string; downloadUrl?: string; error?: string } | null>(null)

async function checkUpdate() {
  if (!window.electronAPI?.checkUpdate) {
    updateResult.value = { isLatest: false, error: '仅 Electron 环境可用' }
    return
  }
  updating.value = true
  updateResult.value = null
  try {
    const res = await window.electronAPI.checkUpdate()
    updateResult.value = res
  } catch (err: any) {
    updateResult.value = { isLatest: false, error: err.message }
  } finally {
    updating.value = false
  }
}

// ===== 关于弹出 =====
const showAbout = ref(false)

// ===== 数据导入导出 =====
const importResult = ref<{ success: boolean; message: string } | null>(null)

function handleExport() {
  const json = store.exportAllData()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `doulingo-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  importResult.value = { success: true, message: `导出成功：共 ${json.length.toLocaleString()} 字节` }
  setTimeout(() => { importResult.value = null }, 3000)
}

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const result = store.importAllData(text)
      importResult.value = result
    } catch {
      importResult.value = { success: false, message: '读取文件失败' }
    }
  }
  input.click()
}


watch(apiKey, () => { saved.value = false })

function saveApiKey() {
  store.setApiKey(apiKey.value.trim())
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

function clearApiKey() {
  apiKey.value = ''
  store.clearApiKey()
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

function saveXfyunKeys() {
  localStorage.setItem('xfyun_app_id', xfyunAppId.value.trim())
  localStorage.setItem('xfyun_api_key', xfyunApiKey.value.trim())
  localStorage.setItem('xfyun_api_secret', xfyunApiSecret.value.trim())
  xfyunSaved.value = true
  setTimeout(() => { xfyunSaved.value = false }, 2000)
}

function clearXfyunKeys() {
  xfyunAppId.value = ''
  xfyunApiKey.value = ''
  xfyunApiSecret.value = ''
  localStorage.removeItem('xfyun_app_id')
  localStorage.removeItem('xfyun_api_key')
  localStorage.removeItem('xfyun_api_secret')
  xfyunSaved.value = true
  setTimeout(() => { xfyunSaved.value = false }, 2000)
}

function onSourceLangChange() { store.setSourceLang(selectedSourceLang.value) }
function onTargetLangChange() { store.setTargetLang(selectedTargetLang.value) }
function onAnnotateLangChange() { store.setAnnotateLang(selectedAnnotateLang.value) }

const selectedNativeLang = ref(store.nativeLanguage)
const selectedProficiencies = ref<Record<string, string>>({ ...store.languageProficiencies })

function onNativeLangChange() {
  store.setNativeLanguage(selectedNativeLang.value)
}

function onProficiencyChange(lang: string) {
  store.setLanguageProficiency(lang, selectedProficiencies.value[lang] as any)
}
</script>

<template>
  <div class="overlay" @click.self="store.toggleSettings()">
    <div class="sheet">
      <div class="sheet-header">
        <h2 class="sheet-title">设置</h2>
        <button class="sheet-close" @click="store.toggleSettings()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="sheet-body">
        <!-- ===== 外观 ===== -->
        <section class="section">
          <div class="section-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <span>外观</span>
          </div>
          <div class="section-card">
            <div class="theme-options">
              <button
                class="theme-option"
                :class="{ active: store.theme === 'dark' }"
                @click="store.setTheme('dark')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                <span>深色</span>
              </button>
              <button
                class="theme-option"
                :class="{ active: store.theme === 'light' }"
                @click="store.setTheme('light')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                <span>浅色</span>
              </button>
              <button
                class="theme-option"
                :class="{ active: store.theme === 'system' }"
                @click="store.setTheme('system')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                <span>跟随系统</span>
              </button>
            </div>
          </div>
        </section>

        <!-- ===== 语言 ===== -->
        <section class="section">
          <div class="section-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><circle cx="12" cy="12" r="2"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
            <span>语言</span>
          </div>
          <div class="section-card">
            <div class="lang-grid">
              <div class="lang-item">
                <label class="lang-label">母语</label>
                <select v-model="selectedNativeLang" class="lang-select" @change="onNativeLangChange">
                  <option v-for="opt in SOURCE_LANGUAGES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <div class="lang-item">
                <label class="lang-label">输入</label>
                <select v-model="selectedSourceLang" class="lang-select" @change="onSourceLangChange">
                  <option v-for="opt in SOURCE_LANGUAGES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <div class="lang-item">
                <label class="lang-label">输出</label>
                <select v-model="selectedTargetLang" class="lang-select" @change="onTargetLangChange">
                  <option v-for="opt in TARGET_LANGUAGES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <div class="lang-item">
                <label class="lang-label">翻译</label>
                <select v-model="selectedAnnotateLang" class="lang-select" @change="onAnnotateLangChange">
                  <option v-for="opt in ANNOTATION_LANGUAGES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
            </div>

            <div class="lang-proficiency">
              <span class="lang-proficiency-label">掌握能力</span>
              <div v-for="opt in TARGET_LANGUAGES" :key="opt.value" class="proficiency-row">
                <span class="proficiency-lang">{{ opt.label }}</span>
                <select
                  v-model="selectedProficiencies[opt.value]"
                  class="proficiency-select"
                  @change="onProficiencyChange(opt.value)"
                >
                  <option value="" disabled>未设置</option>
                  <option v-for="p in PROFICIENCY_OPTIONS" :key="p.value" :value="p.value">{{ p.label }}</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <!-- ===== 期刊 ===== -->
        <section class="section">
          <div class="section-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            <span>期刊</span>
          </div>
          <div class="section-card">
            <div class="journal-row">
              <span class="journal-label">每篇字数</span>
              <div class="chip-group">
                <button
                  v-for="opt in [200, 400, 600, 800, 1000]"
                  :key="opt"
                  class="chip"
                  :class="{ active: store.vocabWordCount === opt }"
                  @click="store.setVocabWordCount(opt)"
                >{{ opt }}</button>
              </div>
            </div>
            <div class="journal-row">
              <span class="journal-label">篇数</span>
              <div class="chip-group">
                <button
                  v-for="opt in ['5-6', '8-9', '12-15', '15-20', '20-30']"
                  :key="opt"
                  class="chip"
                  :class="{ active: store.vocabArticleRange === opt }"
                  @click="store.setVocabArticleRange(opt)"
                >{{ opt }}</button>
              </div>
            </div>
          </div>
        </section>

        <!-- ===== API ===== -->
        <section class="section">
          <div class="section-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>API</span>
          </div>

          <!-- DeepSeek -->
          <div class="section-card">
            <div class="api-header">
              <span class="api-name">DeepSeek</span>
              <span class="api-badge" :class="{ ready: store.hasApiKey }">{{ store.hasApiKey ? '已配置' : '未配置' }}</span>
            </div>
            <input v-model="apiKey" type="password" placeholder="sk-..." class="api-input" @keyup.enter="saveApiKey" />
            <div class="api-actions">
              <button class="api-btn primary" @click="saveApiKey">{{ saved ? '✓' : '保存' }}</button>
              <button v-if="apiKey" class="api-btn ghost" @click="clearApiKey">清除</button>
            </div>
            <details class="sop-details">
              <summary class="sop-summary">如何申请 DeepSeek API Key？</summary>
              <ol class="sop-list">
                <li>访问 <a href="https://platform.deepseek.com" target="_blank" class="sop-link">DeepSeek 开放平台</a> 并注册/登录</li>
                <li>进入控制台 →「API Keys」页面</li>
                <li>点击「创建 API Key」，复制生成的密钥</li>
                <li>将密钥粘贴到上方输入框中保存即可</li>
              </ol>
              <p class="sop-tip">💡 DeepSeek 提供充足免费额度，足以满足日常口语练习和期刊生成</p>
            </details>
            <!-- 余额 -->
            <div class="balance-row">
              <template v-if="store.balance.infos.length > 0">
                <span class="balance-label">账户余额</span>
                <span
                  v-for="b in store.balance.infos"
                  :key="b.currency"
                  class="balance-value"
                  :class="{ available: store.balance.available, empty: !store.balance.available }"
                >
                  {{ b.currency === 'CNY' ? '¥' : '$' }}{{ parseFloat(b.totalBalance).toFixed(2) }}
                  <span class="balance-detail">
                    (赠送 {{ b.currency === 'CNY' ? '¥' : '$' }}{{ parseFloat(b.grantedBalance).toFixed(2) }}
                    + 充值 {{ b.currency === 'CNY' ? '¥' : '$' }}{{ parseFloat(b.toppedUpBalance).toFixed(2) }})
                  </span>
                </span>
                <button class="balance-refresh-btn" :disabled="store.balanceLoading" @click="store.fetchBalance()">{{ store.balanceLoading ? '...' : '↻' }}</button>
              </template>
              <template v-else-if="store.hasApiKey && !store.balanceLoading">
                <span class="balance-label">账户余额</span>
                <button class="balance-query-btn" @click="store.fetchBalance()">点击查询</button>
              </template>
            </div>
          </div>

          <!-- 讯飞 -->
          <div class="section-card">
            <div class="api-header">
              <span class="api-name">科大讯飞</span>
              <span class="api-badge" :class="{ ready: xfyunAppId && xfyunApiKey && xfyunApiSecret }">{{ xfyunAppId && xfyunApiKey && xfyunApiSecret ? '已配置' : '未配置' }}</span>
            </div>
            <input v-model="xfyunAppId" type="text" placeholder="AppID" class="api-input" @keyup.enter="saveXfyunKeys" />
            <input v-model="xfyunApiKey" type="password" placeholder="API Key" class="api-input" @keyup.enter="saveXfyunKeys" />
            <input v-model="xfyunApiSecret" type="password" placeholder="API Secret" class="api-input" @keyup.enter="saveXfyunKeys" />
            <div class="api-actions">
              <button class="api-btn primary" @click="saveXfyunKeys">{{ xfyunSaved ? '✓' : '保存' }}</button>
              <button v-if="xfyunAppId || xfyunApiKey || xfyunApiSecret" class="api-btn ghost" @click="clearXfyunKeys">清除</button>
            </div>
            <details class="sop-details">
              <summary class="sop-summary">如何申请科大讯飞 API？</summary>
              <ol class="sop-list">
                <li>访问 <a href="https://www.xfyun.cn" target="_blank" class="sop-link">讯飞开放平台</a> 并注册/登录</li>
                <li>进入控制台 →「语音识别」服务页面，创建应用</li>
                <li>在应用详情中获取 <strong>AppID</strong>、<strong>APIKey</strong>、<strong>APISecret</strong> 三个值</li>
                <li>分别粘贴到上方三个输入框中保存即可</li>
              </ol>
              <p class="sop-tip">💡 讯飞语音识别每月有免费额度，首次注册即可使用</p>
            </details>
          </div>

          <!-- API 用量 -->
          <div class="section-card usage-card">
            <div class="api-header">
              <span class="api-name">DeepSeek API 用量</span>
              <button class="usage-reset-btn" @click="resetTokenUsage()">重置</button>
            </div>
            <!-- 分入口用量 -->
            <div class="usage-features">
              <div class="usage-feature" v-for="f in featureEntries" :key="f.key">
                <div class="usage-f-header">
                  <span class="usage-f-label">{{ f.label }}</span>
                  <span class="usage-f-total">{{ f.totalTokens.toLocaleString() }} tokens</span>
                </div>
                <div class="usage-f-row">
                  <span class="usage-f-detail">输入 {{ f.promptTokens.toLocaleString() }}</span>
                  <span class="usage-f-dot">·</span>
                  <span class="usage-f-detail">输出 {{ f.completionTokens.toLocaleString() }}</span>
                  <span class="usage-f-dot">·</span>
                  <span class="usage-f-cost">¥{{ f.cost.toFixed(4) }}</span>
                </div>
              </div>
              <div v-if="featureEntries.length === 0" class="usage-empty">暂无用量数据</div>
            </div>
            <!-- 汇总 -->
            <div class="usage-summary">
              <div class="usage-summary-item">
                <span class="usage-label">总 tokens</span>
                <span class="usage-value total">{{ store.tokenUsage.totalTokens.toLocaleString() }}</span>
              </div>
              <div class="usage-summary-item">
                <span class="usage-label">预估费用</span>
                <span class="usage-value cost">¥{{ store.tokenUsage.totalCost.toFixed(4) }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- ===== 数据导入导出 ===== -->
        <section class="section">
          <div class="section-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>数据导入导出</span>
          </div>
          <div class="section-card">
            <p class="import-hint">导出所有配置、API 密钥、生词本、历史记录、强化训练、写作训练和学习进度为 JSON 文件。导入时使用合并策略，不会丢失已有数据。API 密钥将一同导入导出，请注意保管好导出文件。</p>
            <div class="import-actions">
              <button class="api-btn primary" @click="handleExport">导出数据</button>
              <button class="api-btn ghost" @click="handleImport">导入数据</button>
            </div>
            <div v-if="importResult" class="import-result" :class="{ success: importResult.success, error: !importResult.success }">
              {{ importResult.message }}
              <button class="import-dismiss" @click="importResult = null">✕</button>
            </div>
          </div>
        </section>

        <!-- ===== 版本 ===== -->
        <section class="section">
          <div class="section-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>版本</span>
          </div>
          <div class="section-card">
            <div class="version-row">
              <span class="version-label">当前版本</span>
              <span class="version-number">v{{ version }}</span>
            </div>
            <button class="changelog-toggle" @click="checkUpdate" :disabled="updating">
              <svg v-if="updating" class="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              {{ updating ? '检查中…' : '检查更新' }}
            </button>
            <div v-if="updateResult" class="update-result" :class="{ success: updateResult.isLatest, warn: !updateResult.isLatest && !updateResult.error, err: !!updateResult.error }">
              <template v-if="updateResult.error">{{ updateResult.error }}</template>
              <template v-else-if="updateResult.isLatest">✓ 已是最新版本</template>
              <template v-else>
                ✦ 发现新版本 v{{ updateResult.latestVersion }}
                <a :href="updateResult.downloadUrl" target="_blank" class="update-link">去下载 →</a>
              </template>
            </div>
            <button class="changelog-toggle" @click="showChangelog = !showChangelog">
              <svg :class="{ rotated: showChangelog }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
              更新日志
            </button>
            <Transition name="slide">
              <div v-if="showChangelog" class="changelog-wrap">
                <div
                  v-for="entry in parsedChangelog"
                  :key="entry.version"
                  class="changelog-entry"
                >
                  <div class="changelog-version">
                    <span class="changelog-tag">v{{ entry.version }}</span>
                    <span class="changelog-date">{{ entry.date }}</span>
                  </div>
                  <div v-for="section in entry.sections" :key="section.heading" class="changelog-section">
                    <span class="changelog-section-heading">{{ section.heading }}</span>
                    <ul class="changelog-list">
                      <li v-for="(item, i) in section.items" :key="i" class="changelog-item">{{ item }}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </section>

        <!-- ===== 关于 ===== -->
        <section class="section">
          <div class="section-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>关于</span>
          </div>
          <div class="section-card">
            <button class="about-btn" @click="showAbout = !showAbout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              编者按
              <svg :class="{ rotated: showAbout }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <!-- About 弹出框 -->
            <Transition name="slide">
              <div v-if="showAbout" class="about-modal">
                <div class="about-content">
                  <p>这个应用的起点，可以追溯到一次价格锚点的心理实验。Duolingo Max 的订阅费用——每月近两百元人民币——构成了一个足够尖锐的对比：当工具的使用成本超过了问题本身的权重，自制便成了一种理性的选择。某个深夜，我盯着付款界面的确认按钮，问了自己一个问题：如果我能用 API 调用替代订阅费，为什么还要付费？</p>
                  <p>当然，理由比一句反问要复杂得多。Vibe Coding 的流行暗示了一个更深刻的技术转向：编程正在从工程学科向表达媒介迁移。所谓 Vibe Coding，本质上是将认知负荷从"如何实现"转移到"想要什么"——这不只是一个开发范式的变化，而是软件生产关系的重构。当 GPT-4 的参数规模超过万亿级别，当推理成本以每年 10 倍的速度下降，一个开发者用自然语言描述需求、让模型生成骨架代码、再以结构化反馈迭代修正的流程，正在成为现实。</p>
                  <p>我打开编辑器，申请了 DeepSeek 的 API Key，写下了第一行调用代码。从这个意义上说，这个项目从一开始就不是一个传统意义上的软件开发过程——它更像是一场持续对话，我与模型各执一端，互相试探、校正、迭代。我需要一个能说目标语言、能听懂我回应的对话工具，就像一个语言陪练，随时在线。从麦克风权限处理到流式语音识别，从 TTS 线程管理到翻译管道——每一个模块的实现都遵循着同一套方法：定义接口边界，让 AI 填充实现，人工审查逻辑完整性。</p>
                  <p>让我略感意外的是，功能会自己生长。基础对话跑通之后的那个下午，我看着调试窗口里输出的法语 JSON，想——如果它能朗读出来呢？于是有了 TTS。如果能纠正发音呢？于是接入了语音评测 API。如果把对话历史整理成结构化期刊呢？于是一套基于提示工程的上下文摘要管道被搭建了起来。如果记录学习轨迹，量化每天的进展呢？于是有了事件溯源式的学习进度追踪。功能像迭代中的梯度下降一样收敛——从粗糙原型到可用产品，每一轮循环都在收缩与目标之间的差距。</p>
                  <p>迭代至今，这个应用已经覆盖了口语提示、AI 对话、语音评测、词汇训练、强化训练和写作训练等多个模块。回头统计了一下——调用 DeepSeek 接口消耗的 token 总数，大约在两亿左右。这个数字如果折算成文字，大约是几百万汉字，相当于几部中等篇幅的著作。而这些计算量消耗的算力成本，总共不到十元人民币。这是一个值得记录的效率数字：它构成了"AI 辅助个体创作"这一命题的一个实证样本。</p>
                  <p>但技术指标只是表象。真正值得追问的是另一个问题：当一个人能够借助 AI 在数天内完成过去需要团队数周才能交付的产品，程序员的不可替代性究竟在哪里？</p>
                  <p>答案或许在于：代码正在从稀缺品变为商品，而需求洞察、架构判断和体验感知正在成为新的稀缺品。框架的熟练度有其保质期，语言的偏好有其边际递减——但理解用户真实需求的能力、在不确定中做决策的勇气、以及对系统复杂性的敬畏，这些东西不会过时。程序员的护城河，从来不在键盘上，而在对"做什么"和"为什么"的判断力上。在未来，一个优秀的开发者首先应该是一个优秀的产品思考者。</p>
                  <p>这也是为什么我一直强调宏观把控能力的价值。技术栈的更迭周期已经从十年缩短到一两年，今天的主流框架明天可能就进入维护模式。但如果你的思维结构足够抽象，能够辨识系统之间的模式共性，能够在高维空间中评估技术路线的取舍——那么无论底层工具如何迭代，你始终站在设计的上游。Vibe Coding 的本质并不是无序或放任，而是将机械的编码环节委托给模型，让人回到它本来的位置：做决策，而不是做转换。</p>
                  <p>当然，这个应用还有很多不完善的地方——界面细节需要打磨，部分流程存在边界情况，体验尚未达到理想中的流畅度。但它是一个独立开发者用不到两天的主体开发时间、两亿 token 的推理量、不到十元的计算成本和若干个深夜的咖啡因攒出来的一个完整系统。它有它的问题，也有它的性格。每次划词翻译的弹出时机、每段 TTS 的语速参数、每篇期刊的文章结构——这些细节里藏着一个创造者对"何谓好的体验"的持续追问。</p>
                  <p>如果你在读这段话，你大概也在学一门语言，或者正在寻找趁手的工具。那么我想说的是：语言学习本质上是一种认知重构——它在你的思维系统中开辟新的映射路径。而软件工具的迷人之处在于，它让我们有能力亲手构建这些路径的载体。这个应用是我用自己的方法搭建的一条小径。如果你觉得它有用，那是它存在的最大意义。</p>
                  <p class="about-signature">—— dongjiayun<br/>于一个安静的深夜</p>
                </div>
              </div>
            </Transition>
          </div>
        </section>

        <!-- ===== 关于应用 ===== -->
        <section class="section">
          <div class="section-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>关于应用</span>
          </div>
          <div class="section-card">
            <div class="slogan">
              <span class="slogan-text">外语好啊，外语得学</span>
            </div>
            <details class="sop-details">
              <summary class="sop-summary">DeepSeek 能做什么？</summary>
              <div class="sop-desc">
                <p>DeepSeek 是本应用的"大脑"，负责所有语言相关的 AI 功能：</p>
                <ul>
                  <li><strong>AI 对话</strong> — 模拟真人对话场景，贴合上下文给出自然回应</li>
                  <li><strong>口语练习</strong> — 主动引导话题，生成练习提示，实时反馈</li>
                  <li><strong>词汇期刊</strong> — 根据你的水平生成图文并茂的阅读材料</li>
                  <li><strong>强化训练</strong> — 生成阅读理解题，精读文章逐题解析</li>
                  <li><strong>写作辅导</strong> — 提供续写建议、语法批改、逐句优化</li>
                  <li><strong>能力评估</strong> — 智能评估词汇水平，推荐合适内容</li>
                </ul>
                <p class="sop-tip">💡 只需在 API 设置中填入 DeepSeek Key 即可使用全部功能</p>
              </div>
            </details>
            <details class="sop-details">
              <summary class="sop-summary">科大讯飞能做什么？</summary>
              <div class="sop-desc">
                <p>讯飞语音引擎是本应用的"耳朵"，负责将你的语音转写成文字：</p>
                <ul>
                  <li><strong>口语练习录音识别</strong> — 实时识别你的跟读和回答</li>
                  <li><strong>语音输入</strong> — 在 AI 对话中用语音代替打字</li>
                  <li><strong>多语种支持</strong> — 支持中、英、法、日等多语种语音识别</li>
                </ul>
                <p class="sop-tip">💡 讯飞提供每月免费额度，注册即可使用</p>
              </div>
            </details>
            <div class="future-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span><strong>腾讯云语音识别</strong> 即将接入，敬请期待 🎉</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: no-drag;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.sheet {
  width: 100%;
  max-width: 420px;
  height: 85vh;
  max-height: 640px;
  background: var(--bg-secondary);
  border-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 8px;
  flex-shrink: 0;
}

.sheet-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.sheet-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: background 0.2s;
}

.sheet-close:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.sheet-body {
  padding: 8px 16px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ===== Section header ===== */
.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.section-header svg {
  opacity: 0.6;
}

/* ===== Card ===== */
.section-card {
  background: var(--bg-primary);
  border: 0.5px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ===== Theme ===== */
.theme-options {
  display: flex;
  gap: 6px;
}

.theme-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  transition: all .2s;
  cursor: pointer;
}

.theme-option:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.theme-option.active {
  background: rgba(29,155,240,.1);
  border-color: var(--accent);
  color: var(--accent);
}

/* ===== Language grid ===== */
.lang-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.lang-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lang-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  padding-left: 2px;
}

.lang-select,
.proficiency-select {
  padding: 8px 28px 8px 10px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  color: var(--text-primary);
  font-size: 13px;
  transition: border-color 0.2s;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='none' stroke='%236b6b6b' stroke-width='2' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 14px;
  width: 100%;
}

.lang-select:focus,
.proficiency-select:focus {
  border-color: var(--accent);
  outline: none;
}

.lang-proficiency {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 0.5px solid var(--border);
}

.lang-proficiency-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  padding-left: 2px;
}

.proficiency-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.proficiency-lang {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 44px;
  flex-shrink: 0;
}

/* ===== Journal ===== */
.journal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.journal-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  flex-shrink: 0;
  min-width: 52px;
}

.chip-group {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.chip {
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  transition: all .15s;
  cursor: pointer;
}

.chip:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.chip.active {
  background: rgba(29,155,240,.1);
  border-color: var(--accent);
  color: var(--accent);
}

/* ===== API ===== */
.api-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.api-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.api-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  color: var(--text-muted);
}

.api-badge.ready {
  background: rgba(0,200,83,.1);
  border-color: rgba(0,200,83,.3);
  color: var(--success);
}

.api-input {
  padding: 9px 12px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  color: var(--text-primary);
  font-size: 13px;
  transition: border-color 0.2s;
  width: 100%;
}

.api-input::placeholder {
  color: var(--text-muted);
}

.api-input:focus {
  border-color: var(--accent);
  outline: none;
}

.api-actions {
  display: flex;
  gap: 6px;
}

.api-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
  cursor: pointer;
}

.api-btn.primary {
  background: var(--accent);
  color: white;
  border: none;
}

.api-btn.primary:hover {
  opacity: 0.9;
}

.api-btn.ghost {
  background: transparent;
  border: 0.5px solid var(--border);
  color: var(--text-secondary);
}

/* ===== API 用量 ===== */
.usage-card { margin-top: 0 !important; }
.usage-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
}
.usage-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-card);
}
.usage-label {
  font-size: 11px;
  color: var(--text-muted);
}
.usage-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.usage-value.total { color: var(--accent); }
.usage-value.cost { color: #f59e0b; }
.usage-reset-btn {
  font-size: 11px;
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.usage-reset-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.usage-reset-btn:disabled {
  opacity: .5;
  cursor: default;
}
.usage-actions {
  display: flex;
  gap: 4px;
}

/* 分入口用量 */
.usage-features {
  margin-top: 10px;
  border-top: 0.5px solid var(--border);
  padding-top: 8px;
}
.usage-feature {
  padding: 6px 0;
  border-bottom: 0.5px solid var(--border-subtle);
}
.usage-feature:last-child { border-bottom: none; }
.usage-f-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.usage-f-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.usage-f-total {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.usage-f-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 11px;
}
.usage-f-detail { color: var(--text-muted); }
.usage-f-dot { color: var(--text-muted); opacity: .3; }
.usage-f-cost { color: #f59e0b; font-weight: 600; }
.usage-empty { font-size: 12px; color: var(--text-muted); text-align: center; padding: 12px 0; }
.usage-summary {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 0.5px solid var(--border);
}
.usage-summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-card);
}
/* ===== 余额 ===== */
.balance-row {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 0.5px solid var(--border);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.balance-label {
  color: var(--text-muted);
  flex-shrink: 0;
}
.balance-value {
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.balance-value.available { color: var(--success); }
.balance-value.empty { color: #ef4444; }
.balance-detail {
  font-weight: 400;
  font-size: 11px;
  color: var(--text-muted);
}
.balance-query-btn {
  font-size: 12px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.balance-query-btn:hover {
  background: rgba(29,155,240,.1);
}
.balance-refresh-btn {
  font-size: 14px;
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
}
.balance-refresh-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.balance-refresh-btn:disabled {
  opacity: .5;
  cursor: default;
}

.api-btn.ghost:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

/* ===== SOP 指引 ===== */
.sop-details {
  margin-top: 2px;
  border-top: 0.5px solid var(--border);
  padding-top: 8px;
}

.sop-summary {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 0;
  user-select: none;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

.sop-summary::-webkit-details-marker {
  display: none;
}

.sop-summary::before {
  content: '';
  display: inline-block;
  width: 0;
  height: 0;
  border-left: 4px solid var(--text-muted);
  border-top: 3px solid transparent;
  border-bottom: 3px solid transparent;
  transition: transform .2s;
}

.sop-details[open] .sop-summary::before {
  transform: rotate(90deg);
}

.sop-summary:hover {
  color: var(--accent);
}

.sop-summary:hover::before {
  border-left-color: var(--accent);
}

.sop-list {
  margin: 6px 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sop-list li {
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.sop-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
}

.sop-link:hover {
  text-decoration: underline;
}

.sop-tip {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

/* ===== 版本 ===== */
.version-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.version-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.version-number {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
}

.changelog-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  transition: all .2s;
  border: 0.5px solid var(--border);
  background: var(--bg-card);
  cursor: pointer;
  width: 100%;
}

.changelog-toggle:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.changelog-toggle:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.changelog-toggle svg {
  transition: transform .2s;
}

.changelog-toggle svg.rotated {
  transform: rotate(180deg);
}

.changelog-toggle svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.update-result {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}

.update-result.success {
  background: rgba(48,209,88,0.08);
  border: 0.5px solid rgba(48,209,88,0.15);
  color: #30d158;
}

.update-result.warn {
  background: rgba(255,159,10,0.08);
  border: 0.5px solid rgba(255,159,10,0.15);
  color: #ff9f0a;
}

.update-result.err {
  background: rgba(255,69,58,0.08);
  border: 0.5px solid rgba(255,69,58,0.15);
  color: #ff453a;
}

.update-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  margin-left: 4px;
}

.update-link:hover {
  text-decoration: underline;
}

.changelog-wrap {
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.changelog-entry:first-child .changelog-tag {
  background: var(--accent);
  color: #fff;
}

.changelog-version {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.changelog-tag {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  background: var(--bg-surface);
  color: var(--text-primary);
}

.changelog-date {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 500;
}

.changelog-section {
  margin-top: 4px;
}

.changelog-section + .changelog-section {
  margin-top: 8px;
}

.changelog-section-heading {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 3px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--bg-surface);
}

.changelog-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.changelog-item {
  position: relative;
  padding-left: 12px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.changelog-item::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 7px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-muted);
  opacity: 0.5;
}

.slide-enter-active,
.slide-leave-active {
  transition: all .25s ease;
  overflow: hidden;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
}
.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 500px;
}
.import-hint {
  font-size: 12px; line-height: 1.5; color: var(--text-muted);
  margin: 0 0 12px;
}
.import-actions {
  display: flex; gap: 8px;
}
.import-result {
  margin-top: 10px; padding: 8px 12px;
  border-radius: 6px; font-size: 12px; line-height: 1.4;
  display: flex; align-items: center; justify-content: space-between;
}
.import-result.success {
  background: rgba(0,200,83,.1); color: var(--success);
}
.import-result.error {
  background: rgba(255,77,77,.1); color: var(--danger);
}
.import-dismiss {
  background: none; border: none; color: inherit; cursor: pointer;
  font-size: 14px; padding: 0 2px; opacity: .6;
}
.import-dismiss:hover { opacity: 1; }

.about-content .about-signature {
  text-indent: 0; text-align: right;
  font-size: 13px; color: var(--text-muted);
  margin-bottom: 0; padding-top: 4px;
}

.about-btn {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 10px 12px; border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 500; color: var(--text-secondary);
  background: transparent; border: 0.5px solid transparent;
  transition: all .15s;
}
.about-btn:hover {
  background: var(--bg-hover); border-color: var(--border);
}
.about-btn svg:last-child { margin-left: auto; transition: transform .2s; }
.about-btn svg:last-child.rotated { transform: rotate(180deg); }

.about-modal {
  margin-top: 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  border: 0.5px solid var(--border);
  overflow: hidden;
  max-height: 400px;
  overflow-y: auto;
}
.about-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 0.5px solid var(--border);
  position: sticky; top: 0; background: var(--bg-surface); z-index: 1;
}
.about-modal-title {
  font-size: 14px; font-weight: 600; color: var(--text-primary);
}
.about-modal-close {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
}
.about-modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.about-content {
  padding: 12px 14px;
}
.about-content p {
  font-size: 13px; line-height: 1.8; color: var(--text-secondary);
  margin: 0 0 14px; text-indent: 2em;
}
.about-content p:first-child {
  margin-top: 0;
}
.about-content .about-signature {
  text-indent: 0; text-align: right;
  font-size: 13px; color: var(--text-muted);
  margin-bottom: 0; padding-top: 4px;
}

/* ===== Slogan ===== */
.slogan {
  text-align: center;
  padding: 20px 0 16px;
}
.slogan-text {
  font-size: 22px;
  font-weight: 800;
  background: linear-gradient(135deg, #1d9bf0, #0a84ff, #60b0ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 2px;
}

/* ===== About app ===== */
.sop-desc {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  padding: 8px 2px;
}
.sop-desc p { margin-bottom: 8px; }
.sop-desc ul { padding-left: 18px; margin-bottom: 8px; }
.sop-desc ul li { margin-bottom: 4px; }

.future-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-top: 4px;
  border-radius: 8px;
  background: rgba(29,155,240,.08);
  border: 0.5px solid rgba(29,155,240,.15);
  font-size: 13px;
  color: var(--text-secondary);
}
.future-note strong { color: var(--accent); }
.future-note svg { color: var(--accent); flex-shrink: 0; }
</style>
