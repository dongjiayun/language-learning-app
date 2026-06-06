<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { SOURCE_LANGUAGES, TARGET_LANGUAGES, ANNOTATION_LANGUAGES, PROFICIENCY_OPTIONS } from '@/types'
import changelog from '@/../CHANGELOG.md?raw'
import { version } from '@/../package.json'

const store = useAppStore()

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
      <div class="sheet-handle" />

      <div class="sheet-header">
        <h2 class="sheet-title">设置</h2>
        <button class="sheet-close" @click="store.toggleSettings()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="sheet-body">
        <!-- ===== 外观设置 ===== -->
        <section class="section">
          <h3 class="section-title">外观</h3>
          <div class="field">
            <label class="field-label">主题</label>
            <div class="theme-options">
              <button
                class="theme-option"
                :class="{ active: store.theme === 'dark' }"
                @click="store.setTheme('dark')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                <span>深色</span>
              </button>
              <button
                class="theme-option"
                :class="{ active: store.theme === 'light' }"
                @click="store.setTheme('light')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                <span>浅色</span>
              </button>
              <button
                class="theme-option"
                :class="{ active: store.theme === 'system' }"
                @click="store.setTheme('system')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                <span>跟随系统</span>
              </button>
            </div>
          </div>
        </section>

        <!-- ===== 语言设置 ===== -->
        <section class="section">
          <h3 class="section-title">语言设置</h3>

          <div class="field">
            <label class="field-label">母语</label>
            <select v-model="selectedNativeLang" class="field-select" @change="onNativeLangChange">
              <option v-for="opt in SOURCE_LANGUAGES" :key="opt.value" :value="opt.value">{{ opt.label }} ({{ opt.nativeLabel }})</option>
            </select>
          </div>

          <div class="field">
            <label class="field-label">对话语种（输入）</label>
            <select v-model="selectedSourceLang" class="field-select" @change="onSourceLangChange">
              <option v-for="opt in SOURCE_LANGUAGES" :key="opt.value" :value="opt.value">{{ opt.label }} ({{ opt.nativeLabel }})</option>
            </select>
          </div>

          <div class="field">
            <label class="field-label">回答语种（输出 / 词汇训练目标）</label>
            <select v-model="selectedTargetLang" class="field-select" @change="onTargetLangChange">
              <option v-for="opt in TARGET_LANGUAGES" :key="opt.value" :value="opt.value">{{ opt.label }} ({{ opt.nativeLabel }})</option>
            </select>
          </div>

          <div class="field">
            <label class="field-label">翻译标注语种</label>
            <select v-model="selectedAnnotateLang" class="field-select" @change="onAnnotateLangChange">
              <option v-for="opt in ANNOTATION_LANGUAGES" :key="opt.value" :value="opt.value">{{ opt.label }} ({{ opt.nativeLabel }})</option>
            </select>
          </div>

          <div class="field">
            <label class="field-label">目标语种掌握能力</label>
            <div v-for="opt in TARGET_LANGUAGES" :key="opt.value" class="proficiency-row">
              <span class="proficiency-lang">{{ opt.label }}</span>
              <select
                v-model="selectedProficiencies[opt.value]"
                class="field-select proficiency-select"
                @change="onProficiencyChange(opt.value)"
              >
                <option value="" disabled>未设置</option>
                <option v-for="p in PROFICIENCY_OPTIONS" :key="p.value" :value="p.value">{{ p.label }}</option>
              </select>
            </div>
          </div>
        </section>

        <!-- ===== 期刊设置 ===== -->
        <section class="section">
          <h3 class="section-title">期刊设置</h3>

          <div class="field">
            <label class="field-label">每篇文章字数</label>
            <div class="option-chips">
              <button
                v-for="opt in [200, 400, 600, 800, 1000]"
                :key="opt"
                class="chip"
                :class="{ active: store.vocabWordCount === opt }"
                @click="store.setVocabWordCount(opt)"
              >{{ opt }}</button>
            </div>
          </div>

          <div class="field">
            <label class="field-label">每次生成篇数</label>
            <div class="option-chips">
              <button
                v-for="opt in ['5-6', '8-9', '12-15', '15-20']"
                :key="opt"
                class="chip"
                :class="{ active: store.vocabArticleRange === opt }"
                @click="store.setVocabArticleRange(opt)"
              >{{ opt }}</button>
            </div>
          </div>
        </section>

        <!-- ===== API 设置 ===== -->
        <section class="section">
          <h3 class="section-title">API 设置</h3>

          <div class="field">
            <label class="field-label">DeepSeek API Key</label>
            <input v-model="apiKey" type="password" placeholder="sk-..." class="field-input" @keyup.enter="saveApiKey" />
            <div class="field-actions">
              <button class="btn primary" @click="saveApiKey">{{ saved ? '✓ 已保存' : '保存' }}</button>
              <button v-if="apiKey" class="btn ghost" @click="clearApiKey">清除</button>
            </div>
            <p class="field-status" :class="{ ready: store.hasApiKey }">
              {{ store.hasApiKey ? '✓ API Key 已配置' : '未配置（使用本地回答）' }}
            </p>
          </div>

          <div class="field-divider" />

          <div class="field">
            <label class="field-label">科大讯飞语音识别</label>
            <input v-model="xfyunAppId" type="text" placeholder="AppID" class="field-input" @keyup.enter="saveXfyunKeys" />
            <input v-model="xfyunApiKey" type="password" placeholder="API Key" class="field-input" @keyup.enter="saveXfyunKeys" />
            <input v-model="xfyunApiSecret" type="password" placeholder="API Secret" class="field-input" @keyup.enter="saveXfyunKeys" />
            <div class="field-actions">
              <button class="btn primary" @click="saveXfyunKeys">{{ xfyunSaved ? '✓ 已保存' : '保存' }}</button>
              <button v-if="xfyunAppId || xfyunApiKey || xfyunApiSecret" class="btn ghost" @click="clearXfyunKeys">清除</button>
            </div>
            <p class="field-status" :class="{ ready: xfyunAppId && xfyunApiKey && xfyunApiSecret }">
              {{ xfyunAppId && xfyunApiKey && xfyunApiSecret ? '✓ 已配置' : '未配置（语音识别不可用）' }}
            </p>
          </div>
        </section>

        <!-- ===== 版本信息 ===== -->
        <section class="section">
          <h3 class="section-title">版本信息</h3>
          <div class="version-row">
            <span class="version-label">当前版本</span>
            <span class="version-number">v{{ version }}</span>
          </div>
          <button class="changelog-toggle" @click="showChangelog = !showChangelog">
            <svg :class="{ rotated: showChangelog }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            更新日志
          </button>
          <Transition name="slide">
            <pre v-if="showChangelog" class="changelog-content">{{ changelog }}</pre>
          </Transition>
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
  align-items: flex-end;
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
  max-height: 85vh;
  background: var(--bg-secondary);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  margin: 8px auto 0;
  flex-shrink: 0;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 8px;
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
  padding: 8px 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.field-select,
.field-input {
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  color: var(--text-primary);
  font-size: 14px;
  transition: border-color 0.2s;
  width: 100%;
}

.field-input::placeholder {
  color: var(--text-muted);
}

.field-select:focus,
.field-input:focus {
  border-color: var(--accent);
}

.field-select {
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='none' stroke='%236b6b6b' stroke-width='2' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px;
  padding-right: 36px;
}

.field-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s;
}

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover {
  opacity: 0.9;
}

.btn.ghost {
  background: transparent;
  border: 0.5px solid var(--border);
  color: var(--text-secondary);
}

.btn.ghost:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

.field-status {
  font-size: 12px;
  color: var(--text-muted);
}

.field-status.ready {
  color: var(--success);
}

.section {
  padding-bottom: 16px;
  border-bottom: 0.5px solid var(--border);
}

.section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.field-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

.proficiency-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 0.5px solid var(--border);
}

.proficiency-row:last-child {
  border-bottom: none;
}

.proficiency-lang {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 60px;
  flex-shrink: 0;
}

.proficiency-select {
  flex: 1;
}

.theme-options {
  display: flex;
  gap: 8px;
}

.theme-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  transition: all .2s;
}

.theme-option:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.theme-option.active {
  background: rgba(29,155,240,.12);
  border-color: var(--accent);
  color: var(--accent);
}

.option-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  transition: all .2s;
}

.chip:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.chip.active {
  background: rgba(29,155,240,.12);
  border-color: var(--accent);
  color: var(--accent);
}

/* ===== 版本信息 ===== */
.version-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
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
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all .2s;
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

.changelog-content {
  margin-top: 8px;
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-primary);
  border: 0.5px solid var(--border);
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  max-height: 320px;
  overflow-y: auto;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
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
  max-height: 400px;
}
</style>
