<script setup lang="ts">
import { useAppStore } from './stores/appStore'
import { SOURCE_LANGUAGES, TARGET_LANGUAGES, ANNOTATION_LANGUAGES } from './types/index'
import MicButton from './components/MicButton.vue'
import ResponseCard from './components/ResponseCard.vue'
import ChatView from './components/ChatView.vue'
import SpeakingPractice from './components/SpeakingPractice.vue'
import VocabularyTraining from './components/VocabularyTraining.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import HistoryPanel from './components/HistoryPanel.vue'
import { version } from '../package.json'

const store = useAppStore()

function getLangLabel(lang: string): string {
  const m: Record<string, string> = { 'zh-CN': '中文', 'en-US': 'English', 'fr-FR': 'Français', 'ja-JP': '日本語' }
  return m[lang] || lang
}
</script>

<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <button class="header-btn" @click="store.toggleHistory()" title="历史">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" stroke-linecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
      </button>
      <div class="header-title">外语口语学习助手</div>
      <button class="header-btn" @click="store.toggleSettings()" title="设置">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" stroke-linecap="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </header>

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
    </nav>

    <div class="version">{{ version }}</div>

    <SettingsPanel v-if="store.showSettings" />
    <HistoryPanel v-if="store.showHistory" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
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
</style>
