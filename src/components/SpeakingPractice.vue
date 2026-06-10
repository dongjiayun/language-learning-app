<script setup lang="ts">
import { ref, nextTick, watch, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/appStore'

const store = useAppStore()
const messagesEnd = ref<HTMLElement | null>(null)
const textInput = ref<HTMLInputElement | null>(null)
const inputMode = ref<'voice' | 'text'>('voice')

function autoScroll() {
  nextTick(() => {
    messagesEnd.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

watch(() => store.practiceMessages.length, autoScroll)
watch(() => store.practiceHints.length, autoScroll)

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    store.sendPracticeReply(store.practiceInputText)
  }
}

function handleMicClick() {
  if (store.practiceRecording) {
    store.stopPracticeRecording()
  } else {
    store.startPracticeRecording()
  }
}

onUnmounted(() => {
  if (store.practiceIsActive) {
    store.stopPractice()
  }
})

function handleSelectText(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.bubble')) return
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) { store.dismissVocabTranslation(); return }
  const text = sel.toString().trim()
  if (text) store.translateVocabWord(text)
}
</script>

<template>
  <div class="practice-view">
    <!-- 顶部状态栏 -->
    <div class="practice-bar">
      <div class="practice-status">
        <span class="status-dot" :class="{ active: store.practiceIsActive }" />
        <span class="status-text">
          {{ store.practiceIsActive ? '对话中' : '已停止' }}
        </span>
      </div>
      <div class="practice-controls">
        <!-- AI 等待时间选择 -->
        <div v-if="store.practiceIsActive" class="interval-select-wrap">
          <span class="interval-label">AI主动对话间隔</span>
          <select
            v-model="store.practiceTopicInterval"
            class="interval-select"
            title="AI 自动切换话题的等待时间"
          >
            <option :value="20">20s</option>
            <option :value="30">30s</option>
            <option :value="40">40s</option>
            <option :value="50">50s</option>
            <option :value="60">60s</option>
            <option :value="90">90s</option>
            <option :value="120">120s</option>
            <option :value="0">关闭</option>
          </select>
        </div>
        <!-- 提示等待时间选择 -->
        <div v-if="store.practiceIsActive" class="interval-select-wrap">
          <span class="interval-label">回复提示间隔</span>
          <select
            v-model="store.practiceSilenceInterval"
            class="interval-select"
            title="用户沉默时自动给出回复提示的等待时间"
          >
            <option :value="5">5s</option>
            <option :value="10">10s</option>
            <option :value="15">15s</option>
            <option :value="20">20s</option>
            <option :value="0">关闭</option>
          </select>
        </div>
        <!-- 自动朗读开关 -->
        <label class="autoread-toggle" :title="store.practiceAutoRead ? 'AI回复后自动朗读' : '关闭自动朗读'">
          <span class="autoread-label">朗读</span>
          <input type="checkbox" v-model="store.practiceAutoRead" />
          <span class="autoread-switch"></span>
        </label>
        <button
          v-if="!store.practiceIsActive"
          class="start-btn"
          @click="store.startPractice()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span>开始</span>
        </button>
        <button
          v-else
          class="stop-btn"
          @click="store.stopPractice()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
          <span>结束</span>
        </button>
      </div>
    </div>

    <!-- 提示面板 -->
    <Transition name="slide-down">
      <div v-if="store.practiceHints.length > 0" class="hints-panel">
        <div class="hints-header">
          <span class="hints-title">回复提示</span>
          <button class="hints-hide-btn" @click="store.practiceHints = []">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="hints-list">
          <button
            v-for="(hint, i) in store.practiceHints"
            :key="i"
            class="hint-btn"
            @click="store.sendPracticeReply(hint.text)"
          >
            <span class="hint-num">{{ i + 1 }}</span>
            <span class="hint-content">
              <span class="hint-text">{{ hint.text }}</span>
              <span class="hint-translation">{{ hint.translation }}</span>
            </span>
          </button>
        </div>
      </div>
    </Transition>

    <!-- 空状态 / 消息列表 -->
    <div v-if="store.practiceMessages.length === 0" class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="56" height="56" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </div>
      <p class="empty-title">AI 口语对话练习</p>
      <p class="empty-hint">点击「开始」与 AI 进行口语对话练习。<br/>AI 会主动发起话题，引导你练习口语。</p>
    </div>

    <div v-else class="messages">
      <div
        v-for="msg in store.practiceMessages"
        :key="msg.id"
        class="msg"
        :class="msg.role"
      >
        <div class="bubble">
          <div class="msg-role-label">{{ msg.role === 'ai' ? 'AI' : '你' }}</div>
          <p class="msg-text" @mouseup="handleSelectText">{{ msg.content }}</p>
          <div v-if="msg.translation" class="msg-translation">{{ msg.translation }}</div>
        </div>
      </div>

      <!-- AI 加载中 -->
      <div v-if="store.practiceLoading" class="msg ai">
        <div class="bubble">
          <div class="msg-role-label">AI</div>
          <div class="loading-dots">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
        </div>
      </div>

      <div ref="messagesEnd" />
    </div>

    <!-- 底部输入 -->
    <div v-if="store.practiceIsActive" class="input-bar">
      <!-- 语音输入模式（默认） -->
      <template v-if="inputMode === 'voice'">
        <button
          class="primary-mic"
          :class="{ active: store.practiceRecording }"
          :title="store.practiceRecording ? '停止录音' : '点击说话'"
          @click="handleMicClick"
        >
          <div class="mic-inner">
            <svg v-if="!store.practiceRecording" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24" stroke-linecap="round" stroke-linejoin="round">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
            <span class="mic-label">{{ store.practiceRecording ? '录音中...' : '点击说话' }}</span>
          </div>
        </button>
      </template>

      <!-- 文字输入模式 -->
      <template v-if="inputMode === 'text'">
        <input
          ref="textInput"
          v-model="store.practiceInputText"
          type="text"
          class="text-input"
          placeholder="输入回复..."
          :disabled="store.practiceLoading"
          @keydown="handleKeydown"
        />
        <button
          class="send-btn"
          :disabled="!store.practiceInputText.trim() || store.practiceLoading"
          @click="store.sendPracticeReply(store.practiceInputText)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </template>

      <!-- 右侧工具按钮 -->
      <div class="input-tools">
        <button
          class="tool-btn"
          title="切换输入方式"
          @click="inputMode = inputMode === 'voice' ? 'text' : 'voice'"
        >
          <svg v-if="inputMode === 'voice'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="8" x2="10" y2="14"/><line x1="14" y1="8" x2="14" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
        <button
          class="tool-btn hints-trigger"
          :class="{ 'has-hints': store.practiceHints.length > 0 }"
          title="显示回复提示"
          @click="store.generatePracticeHints()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 划词翻译弹窗 -->
    <Transition name="fade">
      <div v-if="store.vocabSelectedText" class="popup-overlay" @click="store.dismissVocabTranslation()">
        <div class="popup" @click.stop>
          <div class="popup-head">
            <span class="popup-word">{{ store.vocabSelectedText }}</span>
            <div class="popup-head-actions">
              <button class="popup-x" @click="store.dismissVocabTranslation()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <p v-if="store.vocabTranslating" class="popup-loading">翻译中...</p>
          <template v-else>
            <p class="popup-text">{{ store.vocabSelectedTranslation }}</p>
            <button class="popup-add-btn" @click="store.addVocabWord(store.vocabSelectedText, store.vocabSelectedTranslation)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              加入生词本
            </button>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.practice-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Top bar */
.practice-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
}

.practice-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: background 0.3s;
}

.status-dot.active {
  background: #34c759;
  box-shadow: 0 0 6px rgba(52, 199, 89, 0.5);
  animation: pulse 2s ease infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.status-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.practice-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Interval select */
.interval-select-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.interval-label {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  font-weight: 500;
}

.interval-select {
  appearance: none;
  -webkit-appearance: none;
  padding: 4px 20px 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.2s;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
}

.interval-select:focus {
  border-color: var(--accent);
  outline: none;
}

/* 自动朗读开关 */
.autoread-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: background .2s;
  flex-shrink: 0;
}
.autoread-toggle:hover { background: var(--bg-hover); }
.autoread-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}
.autoread-toggle input { display: none; }
.autoread-switch {
  width: 28px; height: 16px; border-radius: 10px;
  background: var(--border);
  position: relative;
  transition: background .2s;
}
.autoread-switch::after {
  content: '';
  position: absolute;
  top: 2px; left: 2px;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #fff;
  transition: transform .2s;
  box-shadow: 0 1px 2px rgba(0,0,0,.2);
}
.autoread-toggle input:checked + .autoread-switch { background: var(--accent); }
.autoread-toggle input:checked + .autoread-switch::after { transform: translateX(12px); }

.start-btn,
.stop-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
}

.start-btn {
  background: var(--accent);
  color: white;
}

.start-btn:hover {
  opacity: 0.9;
}

.stop-btn {
  border: 0.5px solid rgba(255, 170, 0, 0.5);
  color: #f5a623;
}

.stop-btn:hover {
  background: rgba(255, 170, 0, 0.08);
}

/* Hints panel */
.hints-panel {
  border-bottom: 0.5px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
  padding: 10px 12px;
}

.hints-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.hints-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.hints-hide-btn {
  padding: 2px;
  border-radius: 4px;
  color: var(--text-muted);
}

.hints-hide-btn:hover {
  background: var(--bg-hover);
}

.hints-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hint-btn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  text-align: left;
  transition: all 0.2s;
}

.hint-btn:hover {
  border-color: var(--accent);
  background: rgba(29, 155, 240, 0.04);
}

.hint-num {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.hint-text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: normal;
  word-break: break-word;
}

.hint-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.hint-translation {
  font-size: 11px;
  color: var(--text-muted);
}

/* Empty */
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  padding: 24px;
}

.empty-icon {
  opacity: 0.25;
  margin-bottom: 4px;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}

.empty-hint {
  font-size: 13px;
  text-align: center;
  line-height: 1.6;
}

/* Messages */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg {
  display: flex;
  max-width: 88%;
  animation: fadeUp 0.25s ease;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg.user {
  align-self: flex-end;
}

.msg.ai {
  align-self: flex-start;
}

.bubble {
  padding: 10px 14px;
  border-radius: 14px;
  line-height: 1.5;
  font-size: 14px;
}

.msg.user .bubble {
  background: var(--accent);
  color: white;
  border-bottom-right-radius: 4px;
}

.msg.ai .bubble {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-bottom-left-radius: 4px;
  color: var(--text-primary);
}

.msg-role-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
  opacity: 0.6;
}

.msg-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.msg-translation {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 0.5px solid rgba(255,255,255,0.15);
  font-size: 12px;
  opacity: 0.85;
  line-height: 1.6;
}

.msg.ai .msg-translation {
  border-top-color: var(--border);
}

/* Loading dots */
.loading-dots {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}

.loading-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: bounce 1.3s ease infinite both;
}

.loading-dots .dot:nth-child(1) { animation-delay: -0.3s; }
.loading-dots .dot:nth-child(2) { animation-delay: -0.15s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* Input bar */
.input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 0.5px solid var(--border);
  flex-shrink: 0;
}

/* Voice mode - full-width mic button */
.primary-mic {
  flex: 1;
  height: 56px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--border);
  transition: all 0.2s;
  cursor: pointer;
}

.primary-mic:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
}

.primary-mic.active {
  background: #e0245e;
  border-color: #e0245e;
  animation: micPulse 1.5s ease infinite;
}

.primary-mic.active:hover {
  background: #c01e4e;
}

@keyframes micPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(224, 36, 94, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(224, 36, 94, 0); }
}

.mic-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--text-secondary);
}

.primary-mic.active .mic-inner {
  color: white;
}

.mic-label {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

/* Text mode */
.text-input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 20px;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  color: var(--text-primary);
  font-size: 14px;
  transition: border-color 0.2s;
}

.text-input::placeholder {
  color: var(--text-muted);
}

.text-input:focus {
  border-color: var(--accent);
}

.text-input:disabled {
  opacity: 0.5;
}

.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: white;
  transition: all 0.2s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.send-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Input tools */
.input-tools {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.tool-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  transition: all 0.2s;
}

.tool-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
  border-color: var(--accent);
}

.hints-trigger.has-hints {
  color: var(--accent);
  border-color: var(--accent);
}

/* Transitions */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ===== 划词翻译弹窗 ===== */
.popup-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.45);
  z-index: 200; display: flex; align-items: center; justify-content: center;
}
.popup {
  width: 300px; max-width: 85vw;
  background: var(--bg-card); border: 0.5px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
  animation: scaleIn .2s cubic-bezier(.16,1,.3,1);
}
@keyframes scaleIn { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
.popup-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
}
.popup-head-actions { display: flex; align-items: center; gap: 4px; }
.popup-word { font-size: 15px; font-weight: 700; color: var(--accent); }
.popup-x {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); transition: background .2s;
}
.popup-x:hover { background: var(--bg-hover); }
.popup-loading, .popup-text { padding: 14px; font-size: 14px; line-height: 1.6; color: var(--text-primary); }
.popup-loading { color: var(--text-muted); }
.popup-add-btn {
  display: flex; align-items: center; gap: 4px; width: 100%;
  padding: 8px 14px 12px; font-size: 12px; font-weight: 500;
  color: var(--accent); border: none; background: none; cursor: pointer;
  transition: opacity .15s;
}
.popup-add-btn:hover { opacity: .8; }

.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ===== 窄屏幕（移动端）响应式 ===== */
@media (max-width: 480px) {
  .practice-bar {
    padding: 6px 8px;
    flex-wrap: wrap;
    gap: 4px;
  }

  .practice-controls {
    gap: 4px;
    flex-wrap: wrap;
  }

  .interval-label {
    display: none;
  }

  .interval-select {
    padding: 3px 18px 3px 6px;
    font-size: 10px;
    background-position: right 4px center;
    background-size: 8px 5px;
  }

  .autoread-label {
    display: none;
  }

  .autoread-toggle {
    padding: 4px;
  }

  .start-btn,
  .stop-btn {
    padding: 3px 8px;
    font-size: 11px;
  }

  .start-btn span,
  .stop-btn span {
    display: none;
  }

  .messages {
    padding: 10px;
    gap: 8px;
  }

  .msg {
    max-width: 92%;
  }

  .bubble {
    padding: 8px 12px;
    font-size: 13px;
  }

  .input-bar {
    padding: 8px 10px;
    gap: 6px;
  }

  .primary-mic {
    height: 48px;
  }

  .mic-label {
    font-size: 13px;
  }

  .text-input {
    padding: 8px 12px;
    font-size: 13px;
  }

  .send-btn {
    width: 36px;
    height: 36px;
  }

  .tool-btn {
    width: 30px;
    height: 30px;
  }

  .hints-panel {
    padding: 8px 10px;
  }

  .hint-btn {
    padding: 6px 8px;
  }

  .popup {
    max-width: 90vw;
  }
}
</style>
