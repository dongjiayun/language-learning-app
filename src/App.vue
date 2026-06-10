<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from './stores/appStore'
import { SOURCE_LANGUAGES, TARGET_LANGUAGES, ANNOTATION_LANGUAGES } from './types/index'
import MicButton from './components/MicButton.vue'
import ResponseCard from './components/ResponseCard.vue'
import ChatView from './components/ChatView.vue'
import SpeakingPractice from './components/SpeakingPractice.vue'
import VocabularyTraining from './components/VocabularyTraining.vue'
import IntensiveTraining from './components/IntensiveTraining.vue'
import WritingTraining from './components/WritingTraining.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import HistoryPanel from './components/HistoryPanel.vue'
import ProgressPanel from './components/ProgressPanel.vue'
import VocabBookPanel from './components/VocabBookPanel.vue'
import { version } from '../package.json'

const store = useAppStore()
const route = useRoute()
const router = useRouter()

// 从路由恢复 mode
if (route.params.mode && typeof route.params.mode === 'string') {
  store.setMode(route.params.mode)
}

// mode 变化 → 更新路由
watch(() => store.mode, (mode) => {
  const current = route.params.mode
  if (current !== mode) {
    router.replace({ name: 'app', params: { mode } })
  }
})

// 路由变化 → 更新 mode（处理浏览器前进/后退）
watch(() => route.params.mode, (mode) => {
  if (mode && typeof mode === 'string' && mode !== store.mode) {
    store.setMode(mode)
  }
})

const showWebBanner = ref(typeof window !== 'undefined' && !(window as any).electronAPI)

function dismissWebBanner() {
  showWebBanner.value = false
}

function getLangLabel(lang: string): string {
  const m: Record<string, string> = { 'zh-CN': '中文', 'en-US': 'English', 'fr-FR': 'Français', 'ja-JP': '日本語' }
  return m[lang] || lang
}
</script>

<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <button class="header-btn" @click="store.toggleProgress()" title="学习进度">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" stroke-linecap="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </button>
        <button class="header-btn" @click="store.toggleHistory()" title="历史">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" stroke-linecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
        </button>
        <button class="header-btn" @click="store.toggleVocabBook()" title="生词本">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" stroke-linecap="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            <line x1="8" y1="7" x2="16" y2="7"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
      </div>
      <div class="header-title">外语口语学习助手</div>
      <button class="header-btn" @click="store.toggleSettings()" title="设置">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" stroke-linecap="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </header>

    <!-- Web 版下载客户端引导 -->
    <Transition name="slide-down">
      <div v-if="showWebBanner" class="web-banner">
        <span class="web-banner-text">
          💡 下载客户端获得<strong>更流畅的体验</strong> · 系统级 TTS · 无浏览器限制
        </span>
        <a href="https://dongjiayun.github.io/language-learning-app/#download" target="_blank" class="web-banner-link">下载客户端</a>
        <button class="web-banner-close" @click="dismissWebBanner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </Transition>

    <!-- 口语提示内容 -->
    <main v-if="store.mode === 'speaking'" class="feed">
      <div class="mic-row">
        <MicButton />
      </div>

      <div v-if="store.lastHeardText || store.state === 'recording' || store.state === 'processing' || store.responses.length > 0 || store.recognitionError" class="card">
        <div v-if="store.recognitionError" class="error">
          {{ store.recognitionError }}
        </div>
        <p v-else class="transcript">
          {{ store.recognizedText || store.lastHeardText || '正在识别...' }}
        </p>
        <div v-if="(store.state === 'recording' || store.state === 'processing') && !store.recognitionError" class="loading">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
      </div>

      <TransitionGroup name="fade" tag="div" class="cards">
        <ResponseCard v-for="item in store.responses" :key="item.id" :response="item" />
      </TransitionGroup>
    </main>

    <!-- AI 对话内容 -->
    <main v-else-if="store.mode === 'chat'" class="chat-container">
      <ChatView />
    </main>

    <!-- AI 口语练习内容 -->
    <main v-else-if="store.mode === 'practice'" class="chat-container">
      <SpeakingPractice />
    </main>

    <!-- 词汇训练内容 -->
    <main v-else-if="store.mode === 'vocab'" class="chat-container">
      <VocabularyTraining />
    </main>

    <!-- 强化训练内容 -->
    <main v-else-if="store.mode === 'intensive'" class="chat-container">
      <IntensiveTraining />
    </main>

    <!-- 写作训练内容 -->
    <main v-else-if="store.mode === 'writing'" class="chat-container">
      <WritingTraining />
    </main>

    <!-- 底部 Tab Bar -->
    <nav class="tab-bar">
      <button
        class="tab-item"
        :class="{ active: store.mode === 'speaking' }"
        @click="store.setMode('speaking')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        </svg>
        <span class="tab-label">口语提示</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: store.mode === 'chat' }"
        @click="store.setMode('chat')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="tab-label">AI 对话</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: store.mode === 'practice' }"
        @click="store.setMode('practice')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
        <span class="tab-label">口语练习</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: store.mode === 'vocab' }"
        @click="store.setMode('vocab')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span class="tab-label">词汇训练</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: store.mode === 'intensive' }"
        @click="store.setMode('intensive')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span class="tab-label">强化训练</span>
      </button>
      <button
        class="tab-item"
        :class="{ active: store.mode === 'writing' }"
        @click="store.setMode('writing')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        <span class="tab-label">写作训练</span>
      </button>
    </nav>

    <div class="version">{{ version }}</div>

    <SettingsPanel v-if="store.showSettings" />
    <HistoryPanel v-if="store.showHistory" />
    <ProgressPanel v-if="store.showProgress" />
    <VocabBookPanel />
    <!-- 全局提示 -->
    <Transition name="toast-fade">
      <div v-if="store.vocabAddToast" class="global-toast">{{ store.vocabAddToast }}</div>
    </Transition>
    <!-- API 引导提示 -->
    <Transition name="toast-fade">
      <div v-if="store.showApiGuide" class="api-guide-overlay" @click.self="store.dismissApiGuide()">
        <div class="api-guide-modal">
          <div class="api-guide-header">
            <span class="api-guide-title">需要配置 API</span>
            <button class="api-guide-close" @click="store.showApiGuide = ''">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="api-guide-body">
            <template v-if="store.showApiGuide === 'deepseek'">
              <div class="api-guide-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </div>
              <p class="api-guide-desc">使用 AI 对话、口语练习、词汇训练等功能需要先配置 DeepSeek API 密钥。</p>
              <div class="api-guide-steps">
                <p>1. 访问 <a href="https://platform.deepseek.com/api_keys" target="_blank" class="api-guide-link">DeepSeek 开放平台</a> 并注册/登录</p>
                <p>2. 在「API Keys」页面创建新的 API Key</p>
                <p>3. 复制密钥后粘贴到设置中保存即可</p>
              </div>
            </template>
            <template v-else-if="store.showApiGuide === 'xfyun'">
              <div class="api-guide-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
              </div>
              <p class="api-guide-desc">使用语音识别功能需要先配置科大讯飞语音识别的 AppID、API Key 和 API Secret。</p>
              <div class="api-guide-steps">
                <p>1. 访问 <a href="https://www.xfyun.cn" target="_blank" class="api-guide-link">讯飞开放平台</a> 并注册/登录</p>
                <p>2. 进入控制台 → 「语音识别」服务页面，创建应用</p>
                <p>3. 在应用详情中获取 AppID、APIKey、APISecret 三个值</p>
                <p>4. 分别粘贴到设置中保存即可</p>
              </div>
              <p class="api-guide-tip">💡 讯飞语音识别每月有免费额度</p>
            </template>
          </div>
          <div class="api-guide-footer">
            <button class="api-guide-btn primary" @click="store.dismissApiGuide()">前往设置</button>
            <button class="api-guide-btn ghost" @click="store.showApiGuide = ''">稍后再说</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  -webkit-app-region: drag;
}

/* ===== Header ===== */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--top-bar-height);
  padding: 0 12px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 2px;
}

.header-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  -webkit-app-region: no-drag;
}

.header-btn:hover {
  background: var(--bg-hover);
}

.header-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

/* ===== Feed (speaking) ===== */
.feed {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  -webkit-app-region: no-drag;
}

.mic-row {
  display: flex;
  justify-content: center;
  padding: 20px 0 4px;
}

/* ===== Card ===== */
.card {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  animation: fadeUp 0.3s ease;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.transcript {
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.error {
  font-size: 14px;
  color: var(--danger);
}

.loading {
  display: flex;
  gap: 5px;
  margin-top: 10px;
}

.loading .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: bounce 1.3s ease infinite both;
}

.loading .dot:nth-child(1) { animation-delay: -0.3s; }
.loading .dot:nth-child(2) { animation-delay: -0.15s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fade-enter-active { transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
.fade-leave-active { transition: all 0.2s ease-in; }
.fade-enter-from { opacity: 0; transform: translateY(12px); }
.fade-leave-to { opacity: 0; transform: translateX(20px); }

/* ===== Chat container ===== */
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

/* ===== Bottom Tab Bar ===== */
.tab-bar {
  display: flex;
  border-top: 0.5px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  padding-bottom: env(safe-area-inset-bottom);
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 0 8px;
  color: var(--text-muted);
  transition: all 0.2s;
}

.tab-item:hover {
  color: var(--text-secondary);
}

.tab-item.active {
  color: var(--accent);
}

.tab-label {
  font-size: 10px;
  font-weight: 600;
}

/* ===== Version ===== */
.version {
  position: fixed;
  bottom: 52px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0.25;
  pointer-events: none;
  user-select: none;
  z-index: 0;
}

/* ===== Web 版下载引导条 ===== */
.web-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(29,155,240,0.08), rgba(10,132,255,0.04));
  border-bottom: 0.5px solid rgba(29,155,240,0.12);
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.web-banner-text {
  flex: 1;
  min-width: 0;
}

.web-banner-text strong {
  color: var(--accent);
}

.web-banner-link {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;
  transition: opacity 0.2s;
}

.web-banner-link:hover {
  opacity: 0.9;
}

.web-banner-close {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: background 0.2s;
}

.web-banner-close:hover {
  background: var(--bg-hover);
}

.global-toast {
  position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
  z-index: 9999;
  padding: 8px 16px; border-radius: 8px;
  background: var(--bg-primary); border: 0.5px solid var(--border);
  box-shadow: 0 2px 12px rgba(0,0,0,.15);
  font-size: 13px; color: var(--accent); font-weight: 500;
  white-space: nowrap; pointer-events: none;
}
.toast-fade-enter-active, .toast-fade-leave-active { transition: all .25s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }

/* API 引导弹窗 */
.api-guide-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center;
  -webkit-app-region: no-drag;
}
.api-guide-modal {
  width: 360px; max-height: 80vh;
  background: var(--bg-primary);
  border-radius: var(--radius);
  border: 0.5px solid var(--border);
  box-shadow: 0 8px 32px rgba(0,0,0,.25);
  display: flex; flex-direction: column;
  animation: scaleIn .2s cubic-bezier(.16,1,.3,1);
}
@keyframes scaleIn { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }
.api-guide-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px 8px;
}
.api-guide-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.api-guide-close {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
}
.api-guide-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.api-guide-body {
  padding: 8px 18px 16px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 12px;
}
.api-guide-icon { display: flex; justify-content: center; color: var(--accent); opacity: .8; }
.api-guide-desc { font-size: 13px; line-height: 1.5; color: var(--text-secondary); margin: 0; }
.api-guide-steps {
  background: var(--bg-surface); border-radius: 8px; padding: 12px 14px;
}
.api-guide-steps p {
  font-size: 12px; line-height: 1.6; color: var(--text-secondary); margin: 0;
}
.api-guide-steps p + p { margin-top: 6px; }
.api-guide-link { color: var(--accent); text-decoration: underline; }
.api-guide-tip { font-size: 12px; color: var(--text-muted); margin: 0; }
.api-guide-footer {
  display: flex; gap: 8px; padding: 12px 18px 16px;
  border-top: 0.5px solid var(--border);
}
.api-guide-btn {
  flex: 1; padding: 9px 0; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.api-guide-btn.primary {
  background: var(--accent); color: #fff; border: none;
}
.api-guide-btn.primary:hover { opacity: .9; }
.api-guide-btn.ghost {
  background: transparent; border: 0.5px solid var(--border); color: var(--text-secondary);
}
.api-guide-btn.ghost:hover { background: var(--bg-hover); }

/* ===== 窄屏幕（移动端）响应式 ===== */
@media (max-width: 480px) {
  .header-title {
    font-size: 13px;
  }

  .header-btn {
    width: 32px;
    height: 32px;
  }

  .tab-item {
    padding: 5px 0 6px;
  }

  .tab-label {
    font-size: 9px;
  }

  /* 6 个 tab 时隐藏 label，只显示图标 */
  .tab-item .tab-label {
    display: none;
  }

  .feed {
    padding: 8px 10px 16px;
  }

  .api-guide-modal {
    width: calc(100vw - 32px);
    max-height: 90vh;
  }

  .version {
    bottom: 44px;
    font-size: 8px;
  }
}

/* 更小的屏幕：<360px 额外收紧 */
@media (max-width: 360px) {
  .header {
    padding: 0 8px;
  }

  .header-title {
    font-size: 12px;
  }
}
</style>
