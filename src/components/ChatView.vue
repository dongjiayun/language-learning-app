<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/appStore'

const store = useAppStore()
const messagesEnd = ref<HTMLElement | null>(null)
const textInput = ref<HTMLInputElement | null>(null)
const showSessions = ref(false)
const showTips = ref(false)

function autoScroll() {
  nextTick(() => {
    messagesEnd.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

watch(() => store.chatMessages.length, autoScroll)
watch(() => store.chatLoading, autoScroll)
watch(() => store.currentChatSessionId, () => {
  showSessions.value = false
  autoScroll()
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    store.sendChatMessage()
  }
}

function handleMicClick() {
  if (store.state === 'recording') {
    store.stopChatRecording()
  } else {
    store.startChatRecording()
  }
}

function getCurrentSessionTitle(): string {
  const session = store.chatSessions.find(s => s.id === store.currentChatSessionId)
  return session?.title || '新对话'
}

function toggleSidebar() {
  showSessions.value = !showSessions.value
}

function closeSidebar() {
  showSessions.value = false
}

function toggleTips() {
  showTips.value = !showTips.value
  if (showTips.value && store.chatTips.length === 0 && !store.chatTipsLoading) {
    store.fetchChatTips()
  }
}

function handleSelectText(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.bubble')) return
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) { store.dismissVocabTranslation(); return }
  const text = sel.toString().trim()
  if (text) store.translateVocabWord(text)
}

// Click outside handler
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (showSessions.value && !target.closest('.session-sidebar') && !target.closest('.session-bar-trigger')) {
    closeSidebar()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="chat-view">
    <!-- 会话标题栏 -->
    <div class="session-bar">
      <div class="session-info session-bar-trigger" @click="toggleSidebar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
        <span class="session-title">{{ getCurrentSessionTitle() }}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="session-bar-actions">
        <button class="bar-btn" title="新建对话" @click="store.newChatSession()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 侧边栏遮罩 -->
    <Transition name="fade">
      <div v-if="showSessions" class="sidebar-overlay" @click="closeSidebar" />
    </Transition>

    <!-- 会话侧边栏 -->
    <Transition name="sidebar-slide">
      <div v-if="showSessions" class="session-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">对话记录</span>
          <button class="sidebar-close" @click="closeSidebar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="sidebar-list">
          <div
            v-for="session in store.chatSessions"
            :key="session.id"
            class="sidebar-item"
            :class="{ current: session.id === store.currentChatSessionId }"
          >
            <div class="sidebar-item-left" @click="store.switchChatSession(session.id)">
              <div class="sidebar-item-title">{{ session.title }}</div>
              <div class="sidebar-item-meta">{{ session.messageCount }} 条</div>
            </div>
            <button
              class="sidebar-item-del"
              title="删除对话"
              @click.stop="store.deleteChatSession(session.id)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
          </div>
          <div v-if="store.chatSessions.length === 0" class="sidebar-empty">暂无对话</div>
        </div>
      </div>
    </Transition>

    <!-- 提示面板 -->
    <Transition name="slide-down">
      <div v-if="showTips" class="tips-panel">
        <div class="tips-header">
          <span class="tips-title">学习提示</span>
          <button class="tips-close" @click="showTips = false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div v-if="store.chatTipsLoading" class="tips-loading">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
        <div v-else-if="store.chatTips.length > 0" class="tips-list">
          <div v-for="(tip, i) in store.chatTips" :key="i" class="tip-item">
            <div class="tip-index">{{ i + 1 }}</div>
            <div class="tip-content">
              <div class="tip-text">{{ tip.text }}</div>
              <div class="tip-translation">{{ tip.translation }}</div>
            </div>
          </div>
        </div>
        <div v-else class="tips-empty">
          <p>开始对话后可获取学习提示</p>
        </div>
        <button
          v-if="!store.chatTipsLoading"
          class="tips-refresh"
          @click="store.fetchChatTips()"
        >
          换一批
        </button>
      </div>
    </Transition>

    <!-- 空状态 -->
    <div v-if="store.chatMessages.length === 0 && !store.chatLoading" class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <line x1="12" y1="8" x2="12" y2="14"/>
          <line x1="9" y1="11" x2="15" y2="11"/>
        </svg>
      </div>
      <p class="empty-title">开始对话</p>
      <p class="empty-hint">输入文字或点击麦克风开始语音对话</p>
    </div>

    <!-- 消息列表 -->
    <div v-else-if="store.chatMessages.length > 0" class="messages">
      <div
        v-for="msg in store.chatMessages"
        :key="msg.id"
        class="msg"
        :class="msg.role"
      >
        <div class="bubble">
          <p class="msg-text" @mouseup="handleSelectText">{{ msg.content }}</p>
          <div v-if="store.chatTranslations[msg.id]?.text" class="translation-box">
            {{ store.chatTranslations[msg.id]?.text }}
          </div>
          <div v-if="store.chatTranslations[msg.id]?.translating" class="translation-loading">翻译中...</div>
          <div v-if="msg.role === 'assistant'" class="msg-actions">
            <button class="action-btn" title="翻译" @click="store.translateChatMessage(msg.id, msg.content)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 15L8 15L10 19L14 9L16 13L22 13"/>
                <path d="M5 21L12 3L19 21"/>
              </svg>
            </button>
            <button class="action-btn" title="朗读" @click="store.speakChatMessage(msg.content)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
            </button>
            <button class="action-btn" title="复制" @click="navigator.clipboard.writeText(msg.content)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 加载中 -->
      <div v-if="store.chatLoading" class="msg assistant">
        <div class="bubble loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>

      <div ref="messagesEnd" />
    </div>

    <!-- 底部输入 -->
    <div class="input-bar">
      <button
        class="mic-btn tips-btn"
        :class="{ active: showTips }"
        title="学习提示"
        @click="toggleTips"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </button>
      <button
        class="mic-btn"
        :class="{ active: store.state === 'recording' }"
        :title="store.state === 'recording' ? '停止录音' : '语音输入'"
        @click="handleMicClick"
      >
        <svg v-if="store.state !== 'recording'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>
      </button>
      <input
        ref="textInput"
        v-model="store.chatInputText"
        type="text"
        class="text-input"
        placeholder="输入消息..."
        :disabled="store.chatLoading"
        @keydown="handleKeydown"
      />
      <button
        class="send-btn"
        :disabled="!store.chatInputText.trim() || store.chatLoading"
        @click="store.sendChatMessage()"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>

    <!-- 划词翻译弹窗 -->
    <Transition name="fade">
      <div v-if="store.vocabSelectedText" class="popup-overlay" @click="store.dismissVocabTranslation()">
        <div class="popup" @click.stop>
          <div class="popup-head">
            <span class="popup-word">{{ store.vocabSelectedText }}</span>
            <button class="popup-x" @click="store.dismissVocabTranslation()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <p v-if="store.vocabTranslating" class="popup-loading">翻译中...</p>
          <p v-else class="popup-text">{{ store.vocabSelectedTranslation }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Session bar */
.session-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.session-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.2s;
}

.session-info:hover {
  background: var(--bg-hover);
}

.session-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-bar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.bar-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.bar-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
}

/* Sidebar overlay */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 100;
}

/* Session sidebar */
.session-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 280px;
  max-width: 80vw;
  background: var(--bg-primary);
  border-right: 0.5px solid var(--border);
  z-index: 110;
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 24px rgba(0,0,0,0.2);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: background 0.2s;
}

.sidebar-close:hover {
  background: var(--bg-hover);
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.sidebar-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  transition: background 0.15s;
}

.sidebar-item:hover {
  background: var(--bg-hover);
}

.sidebar-item.current {
  background: rgba(29, 155, 240, 0.08);
}

.sidebar-item-left {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.sidebar-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-item-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.sidebar-item-del {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  opacity: 0;
  transition: all 0.2s;
  flex-shrink: 0;
}

.sidebar-item:hover .sidebar-item-del {
  opacity: 1;
}

.sidebar-item-del:hover {
  background: rgba(255, 48, 64, 0.15);
  color: var(--danger);
}

.sidebar-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 32px 16px;
  font-size: 13px;
}

/* Tips panel */
.tips-panel {
  border-bottom: 0.5px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
  padding: 12px 16px;
}

.tips-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.tips-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.tips-close {
  padding: 2px;
  border-radius: 4px;
  color: var(--text-muted);
}

.tips-close:hover {
  background: var(--bg-hover);
}

.tips-loading {
  display: flex;
  gap: 4px;
  justify-content: center;
  padding: 12px 0;
}

.tips-loading .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: bounce 1.3s ease infinite both;
}

.tips-loading .dot:nth-child(1) { animation-delay: -0.3s; }
.tips-loading .dot:nth-child(2) { animation-delay: -0.15s; }

.tips-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tip-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.tip-index {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.tip-content {
  flex: 1;
  min-width: 0;
}

.tip-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.5;
}

.tip-translation {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.5;
}

.tips-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  padding: 8px 0;
}

.tips-refresh {
  display: block;
  margin: 10px auto 0;
  font-size: 12px;
  color: var(--accent);
  padding: 4px 12px;
  border-radius: 12px;
  border: 0.5px solid var(--accent);
  transition: all 0.2s;
}

.tips-refresh:hover {
  background: var(--accent);
  color: white;
}

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

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
  padding: 12px 14px; border-bottom: 0.5px solid var(--border);
}
.popup-word { font-size: 15px; font-weight: 700; color: var(--accent); }
.popup-x {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); transition: background .2s;
}
.popup-x:hover { background: var(--bg-hover); }
.popup-loading, .popup-text { padding: 14px; font-size: 14px; line-height: 1.6; color: var(--text-primary); }
.popup-loading { color: var(--text-muted); }

.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: transform 0.25s ease;
}
.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  transform: translateX(-100%);
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
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
  opacity: 0.3;
  margin-bottom: 4px;
}

.empty-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
}

.empty-hint {
  font-size: 13px;
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
  max-width: 85%;
  animation: fadeUp 0.25s ease;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg.user {
  align-self: flex-end;
}

.msg.assistant {
  align-self: flex-start;
}

.bubble {
  padding: 10px 14px;
  border-radius: 16px;
  line-height: 1.5;
  font-size: 14px;
}

.msg.user .bubble {
  background: var(--accent);
  color: white;
  border-bottom-right-radius: 4px;
}

.msg.assistant .bubble {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-bottom-left-radius: 4px;
  color: var(--text-primary);
}

.msg-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.msg-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 0.5px solid rgba(255,255,255,0.1);
}

.msg.assistant .msg-actions {
  border-top-color: var(--border);
}

.action-btn {
  padding: 4px 6px;
  border-radius: 6px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

/* Translation */
.translation-box {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0,0,0,0.04);
  border: 0.5px solid var(--border);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  animation: fadeUp 0.2s ease;
}

.msg.user .translation-box {
  background: rgba(255,255,255,0.1);
  border-color: rgba(255,255,255,0.15);
  color: white;
}

.translation-loading {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-muted);
  animation: fadeUp 0.2s ease;
}

/* Loading dots */
.loading-dots {
  display: flex;
  gap: 5px;
  padding: 14px 20px;
}

.loading-dots .dot {
  width: 7px;
  height: 7px;
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

.mic-btn {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  transition: all 0.2s;
  flex-shrink: 0;
}

.mic-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--accent);
}

.mic-btn.active.tips-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.mic-btn.active {
  background: var(--danger);
  border-color: var(--danger);
  color: white;
}

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
</style>
