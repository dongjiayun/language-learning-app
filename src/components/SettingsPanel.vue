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
                  v-for="opt in ['5-6', '8-9', '12-15', '15-20']"
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

.changelog-toggle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.changelog-toggle svg {
  transition: transform .2s;
}

.changelog-toggle svg.rotated {
  transform: rotate(180deg);
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
</style>
