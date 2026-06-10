<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import type { ConversationRecord, PracticeRecord, VocabJournalRecord, WritingSession } from '@/types'

type HistoryTab = 'speaking' | 'chat' | 'practice' | 'vocab' | 'intensive' | 'writing'

const store = useAppStore()
const activeTab = ref<HistoryTab>(store.mode as HistoryTab)

// 每次打开面板时，默认选中当前板块
watch(() => store.showHistory, (open) => {
  if (open) {
    activeTab.value = store.mode as HistoryTab
  }
})

function getLangLabel(lang: string): string {
  const langMap: Record<string, string> = {
    'zh-CN': '中文', 'en-US': '英语', 'fr-FR': '法语', 'ja-JP': '日语',
  }
  return langMap[lang] || lang
}

function handleLoadSpeaking(record: ConversationRecord) {
  store.loadConversation(record)
}

function handleDeleteSpeaking(id: string) {
  if (confirm('确定删除这条记录？')) store.deleteConversation(id)
}

function handleClearSpeaking() {
  if (confirm('确定清空所有口语练习记录？')) store.clearConversations()
}

function handleSwitchChat(sessionId: string) {
  store.switchChatSession(sessionId)
  store.toggleHistory()
}

function handleDeleteChat(sessionId: string) {
  if (confirm('确定删除这个对话？')) store.deleteChatSession(sessionId)
}

function handleClearChat() {
  if (confirm('确定清空所有对话？')) store.clearChatSessions()
}

function handleNewChat() {
  store.newChatSession()
  store.setMode('chat')
  store.toggleHistory()
}

function handleLoadPractice(record: PracticeRecord) {
  store.loadPracticeConversation(record)
  store.setMode('practice')
}

function handleDeletePractice(id: string) {
  if (confirm('确定删除这条练习记录？')) store.deletePracticeConversation(id)
}

function handleClearPractice() {
  if (confirm('确定清空所有练习记录？')) store.clearPracticeConversations()
}

function handleLoadVocab(recordId: string) {
  store.loadVocabJournal(recordId)
  store.setMode('vocab')
  store.toggleHistory()
}

function handleDeleteVocab(id: string) {
  if (confirm('确定删除这份期刊记录？')) {
    store.deleteVocabJournal(id)
  }
}

function handleClearVocab() {
  if (confirm('确定清空所有期刊记录？')) {
    store.vocabRecords = []
    store.vocabJournals = []
    localStorage.removeItem('doulingo_vocab_records')
    localStorage.removeItem('doulingo_vocab_journals')
  }
}

function handleLoadTraining(id: string) {
  store.loadTrainingSession(id)
  store.setMode('intensive')
  store.toggleHistory()
}

function handleDeleteTraining(id: string) {
  if (confirm('确定删除这条训练记录？')) store.deleteTrainingSession(id)
}

function handleClearTraining() {
  if (confirm('确定清空所有强化训练记录？')) {
    store.trainingHistory = []
    store.trainingSession = null
    localStorage.removeItem('doulingo_intensive_session')
    localStorage.removeItem('doulingo_intensive_history')
  }
}

function getTrainingCorrectCount(progress: Record<string, string>): number {
  return Object.values(progress).filter(v => v === 'correct').length
}

function handleLoadWriting(id: string) {
  store.loadWritingSession(id)
  store.setMode('writing')
  store.toggleHistory()
}

function handleDeleteWriting(id: string) {
  if (confirm('确定删除这条写作记录？')) store.deleteWritingSession(id)
}

function handleClearWriting() {
  if (confirm('确定清空所有写作记录？')) {
    store.writingHistory = []
    store.writingSession = null
    localStorage.removeItem('doulingo_writing_session')
    localStorage.removeItem('doulingo_writing_history')
  }
}

function formatChatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 7) return `${diffDays}天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// ===== 日期分组工具 =====
type DateGroupLabel = '今天' | '昨天' | '本周' | '更早'

interface DateGroup<T> {
  label: DateGroupLabel
  items: T[]
}

function getDateGroupLabel(date: Date): DateGroupLabel {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)

  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'

  // 本周一
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(today.getTime() - mondayOffset * 86400000)

  if (d.getTime() >= monday.getTime()) return '本周'
  return '更早'
}

const GROUP_ORDER: DateGroupLabel[] = ['今天', '昨天', '本周', '更早']

function groupByDate<T>(items: T[], getTimestamp: (item: T) => number): DateGroup<T>[] {
  const groups = new Map<DateGroupLabel, T[]>()
  for (const label of GROUP_ORDER) groups.set(label, [])

  for (const item of items) {
    const label = getDateGroupLabel(new Date(getTimestamp(item)))
    groups.get(label)!.push(item)
  }

  return GROUP_ORDER.filter(label => groups.get(label)!.length > 0).map(label => ({
    label,
    items: groups.get(label)!,
  }))
}

function dateGroupId(label: DateGroupLabel): string {
  return `date-group-${label}`
}
</script>

<template>
  <div class="overlay" @click.self="store.toggleHistory()">
    <div class="modal">
      <div class="modal-header">
        <button class="modal-back" @click="store.toggleHistory()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="22" height="22" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 class="modal-title">历史记录</h2>
        <div class="modal-right" />
      </div>

      <!-- 历史分区 tabs -->
      <div class="sub-tabs">
        <button
          class="sub-tab"
          :class="{ active: activeTab === 'speaking' }"
          @click="activeTab = 'speaking'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          </svg>
          口语记录
        </button>
        <button
          class="sub-tab"
          :class="{ active: activeTab === 'chat' }"
          @click="activeTab = 'chat'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          对话记录
        </button>
        <button
          class="sub-tab"
          :class="{ active: activeTab === 'practice' }"
          @click="activeTab = 'practice'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          口语练习
        </button>
        <button
          class="sub-tab"
          :class="{ active: activeTab === 'vocab' }"
          @click="activeTab = 'vocab'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          词汇训练
        </button>
        <button
          class="sub-tab"
          :class="{ active: activeTab === 'intensive' }"
          @click="activeTab = 'intensive'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          强化训练
        </button>
        <button
          class="sub-tab"
          :class="{ active: activeTab === 'writing' }"
          @click="activeTab = 'writing'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          写作训练
        </button>
      </div>

      <!-- ===== 口语记录 ===== -->
      <template v-if="activeTab === 'speaking'">
        <div v-if="store.conversations.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
          <p class="empty-title">暂无口语记录</p>
          <p class="empty-hint">录制对话后会自动保存</p>
        </div>

        <div v-else class="modal-body">
          <template v-for="group in groupByDate(store.conversations, r => r.timestamp)" :key="dateGroupId(group.label)">
            <div class="date-group-header">{{ group.label }}</div>
            <div v-for="record in group.items" :key="record.id" class="record-item">
              <div class="record-content" @click="handleLoadSpeaking(record)">
                <div class="record-meta">
                  <span class="record-time">{{ store.formatTime(record.timestamp) }}</span>
                  <span class="record-langs">
                    <span class="record-tag">{{ getLangLabel(record.sourceLang) }}</span>
                    <span class="record-arrow">→</span>
                    <span class="record-tag target">{{ getLangLabel(record.targetLang) }}</span>
                  </span>
                </div>
                <p class="record-text">{{ record.inputText || '录制对话' }}</p>
                <div class="record-chips">
                  <span v-for="(resp, idx) in record.responses.slice(0, 3)" :key="resp.id" class="chip">
                    {{ idx + 1 }}. {{ resp.french.slice(0, 18) }}{{ resp.french.length > 18 ? '…' : '' }}
                  </span>
                </div>
              </div>
              <button class="record-delete" @click="handleDeleteSpeaking(record.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </template>
        </div>

        <div v-if="store.conversations.length > 0" class="modal-footer">
          <button class="clear-btn" @click="handleClearSpeaking">清空口语记录</button>
        </div>
      </template>

      <!-- ===== 对话记录 ===== -->
      <template v-if="activeTab === 'chat'">
        <div v-if="store.chatSessions.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <line x1="12" y1="8" x2="12" y2="14"/>
            <line x1="9" y1="11" x2="15" y2="11"/>
          </svg>
          <p class="empty-title">暂无对话记录</p>
          <p class="empty-hint">在 AI 对话中发送消息后会自动保存</p>
        </div>

        <div v-else class="modal-body">
          <template v-for="group in groupByDate(store.chatSessions, s => s.updatedAt)" :key="dateGroupId(group.label)">
            <div class="date-group-header">{{ group.label }}</div>
            <div
              v-for="session in group.items"
              :key="session.id"
              class="record-item"
              :class="{ current: session.id === store.currentChatSessionId }"
            >
              <div class="record-content" @click="handleSwitchChat(session.id)">
                <div class="record-meta">
                  <span class="record-time">{{ formatChatTime(session.updatedAt) }}</span>
                  <span class="record-count">{{ session.messageCount }} 条消息</span>
                </div>
                <p class="record-title">{{ session.title }}</p>
                <p class="record-preview" v-if="session.messages.length > 0">
                  {{ session.messages[session.messages.length - 1].content.slice(0, 40) }}…
                </p>
              </div>
              <button class="record-delete" @click="handleDeleteChat(session.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </template>
        </div>

        <div v-if="store.chatSessions.length > 0" class="modal-footer">
          <button class="clear-btn" @click="handleClearChat">清空对话记录</button>
        </div>
      </template>

      <!-- ===== 口语练习记录 ===== -->
      <template v-if="activeTab === 'practice'">
        <div v-if="store.practiceConversations.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          <p class="empty-title">暂无练习记录</p>
          <p class="empty-hint">在口语练习中对话结束后会自动保存</p>
        </div>

        <div v-else class="modal-body">
          <template v-for="group in groupByDate(store.practiceConversations, r => r.createdAt)" :key="dateGroupId(group.label)">
            <div class="date-group-header">{{ group.label }}</div>
            <div
              v-for="record in group.items"
              :key="record.id"
              class="record-item"
            >
              <div class="record-content" @click="handleLoadPractice(record)">
                <div class="record-meta">
                  <span class="record-time">{{ formatChatTime(record.createdAt) }}</span>
                  <span class="record-count">{{ record.messageCount }} 条对话</span>
                </div>
                <p class="record-title">{{ record.summary }}</p>
              </div>
              <button class="record-delete" @click="handleDeletePractice(record.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </template>
        </div>

        <div v-if="store.practiceConversations.length > 0" class="modal-footer">
          <button class="clear-btn" @click="handleClearPractice">清空练习记录</button>
        </div>
      </template>

      <!-- ===== 词汇训练记录 ===== -->
      <template v-if="activeTab === 'vocab'">
        <div v-if="store.vocabRecords.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <p class="empty-title">暂无期刊记录</p>
          <p class="empty-hint">在词汇训练中更新期刊后会自动保存</p>
        </div>

        <div v-else class="modal-body">
          <template v-for="group in groupByDate(store.vocabRecords, r => r.createdAt)" :key="dateGroupId(group.label)">
            <div class="date-group-header">{{ group.label }}</div>
            <div v-for="record in group.items" :key="record.id" class="record-item">
              <div class="record-content" @click="handleLoadVocab(record.id)">
                <div class="record-meta">
                  <span class="record-time">{{ formatChatTime(record.createdAt) }}</span>
                  <span class="record-count">{{ record.articlesCount }} 篇</span>
                </div>
                <p class="record-title">{{ record.summary }}</p>
              </div>
              <button class="record-delete" @click="handleDeleteVocab(record.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </template>
        </div>

        <div v-if="store.vocabRecords.length > 0" class="modal-footer">
          <button class="clear-btn" @click="handleClearVocab">清空期刊记录</button>
        </div>
      </template>

      <!-- ===== 强化训练记录 ===== -->
      <template v-if="activeTab === 'intensive'">
        <div v-if="store.trainingHistory.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <p class="empty-title">暂无强化训练记录</p>
          <p class="empty-hint">在强化训练中生成考题后会自动保存</p>
        </div>

        <div v-else class="modal-body">
          <template v-for="group in groupByDate(store.trainingHistory, s => s.createdAt)" :key="dateGroupId(group.label)">
            <div class="date-group-header">{{ group.label }}</div>
            <div
              v-for="s in group.items"
              :key="s.id"
              class="record-item"
            >
              <div class="record-content" @click="handleLoadTraining(s.id)">
                <div class="record-meta">
                  <span class="record-time">{{ formatChatTime(s.createdAt) }}</span>
                  <span class="record-count">{{ getTrainingCorrectCount(s.progress) }}/{{ s.questions.length }}</span>
                </div>
                <p class="record-title">{{ store.getLangLabel(s.targetLang) }} · 强化训练</p>
                <div class="record-tags">
                  <span class="sidebar-item-badge" :class="s.status === 'completed' ? 'badge-done' : 'badge-active'">
                    {{ s.status === 'completed' ? '已完成' : '进行中' }}
                  </span>
                </div>
              </div>
              <button class="record-delete" @click="handleDeleteTraining(s.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </template>
        </div>

        <div v-if="store.trainingHistory.length > 0" class="modal-footer">
          <button class="clear-btn" @click="handleClearTraining">清空训练记录</button>
        </div>
      </template>

      <!-- ===== 写作训练记录 ===== -->
      <template v-if="activeTab === 'writing'">
        <div v-if="store.writingHistory.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          <p class="empty-title">暂无写作训练记录</p>
          <p class="empty-hint">在写作训练中提交评分后会自动保存</p>
        </div>

        <div v-else class="modal-body">
          <template v-for="group in groupByDate(store.writingHistory, s => s.createdAt)" :key="dateGroupId(group.label)">
            <div class="date-group-header">{{ group.label }}</div>
            <div
              v-for="s in group.items"
              :key="s.id"
              class="record-item"
            >
              <div class="record-content" @click="handleLoadWriting(s.id)">
                <div class="record-meta">
                  <span class="record-time">{{ formatChatTime(s.createdAt) }}</span>
                  <span class="record-count" v-if="s.evaluation">{{ s.evaluation.score }}分</span>
                  <span class="record-count" v-else>未评分</span>
                </div>
                <p class="record-title">{{ s.topic.title }}</p>
                <div class="record-tags">
                  <span class="sidebar-item-badge" :class="s.status === 'completed' ? 'badge-done' : 'badge-active'">
                    {{ s.status === 'completed' ? '已评分' : '写作中' }}
                  </span>
                </div>
              </div>
              <button class="record-delete" @click="handleDeleteWriting(s.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </template>
        </div>

        <div v-if="store.writingHistory.length > 0" class="modal-footer">
          <button class="clear-btn" @click="handleClearWriting">清空写作记录</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-primary);
  z-index: 100;
  display: flex;
  flex-direction: column;
  -webkit-app-region: no-drag;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--top-bar-height);
  padding: 0 16px;
  border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
}

.modal-back {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  transition: background 0.2s;
}

.modal-back:hover {
  background: var(--bg-surface);
}

.modal-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-right {
  width: 40px;
}

/* Sub tabs */
.sub-tabs {
  display: flex;
  padding: 8px 16px;
  gap: 8px;
  border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
}

.sub-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}

.sub-tab:hover {
  color: var(--text-secondary);
  background: var(--bg-surface);
}

.sub-tab.active {
  color: var(--accent);
  background: rgba(29, 155, 240, 0.1);
}

/* Empty */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 8px;
}

.empty-title {
  font-size: 15px;
  font-weight: 500;
}

.empty-hint {
  font-size: 13px;
}

/* Body */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 16px 12px;
}

.date-group-header {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  padding: 12px 4px 6px; letter-spacing: .3px;
}

.record-item {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  transition: border-color 0.2s;
}

.record-item:hover {
  border-color: var(--accent);
}

.record-item.current {
  border-color: var(--accent);
  background: rgba(29, 155, 240, 0.05);
}

.record-content {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.record-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.record-time {
  font-size: 12px;
  color: var(--text-muted);
}

.record-langs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.record-tag {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 11px;
}

.record-tag.target {
  background: rgba(0, 200, 83, 0.15);
  color: var(--success);
}

.record-arrow {
  color: var(--text-muted);
  font-size: 11px;
}

.record-text {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 8px;
  line-height: 1.4;
}

.record-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  line-height: 1.3;
}

.record-preview {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.record-count {
  font-size: 11px;
  color: var(--text-muted);
}

.record-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0, 149, 246, 0.1);
  color: var(--accent);
  font-size: 12px;
}

.record-tags {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.sidebar-item-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.badge-active {
  background: rgba(59, 130, 246, 0.1);
  color: var(--accent);
}

.badge-done {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.record-delete {
  align-self: flex-start;
  padding: 6px;
  border-radius: 6px;
  color: var(--text-muted);
  opacity: 0;
  transition: all 0.2s;
}

.record-item:hover .record-delete {
  opacity: 1;
}

.record-delete:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

/* Footer */
.modal-footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 0.5px solid var(--border);
  flex-shrink: 0;
}

.clear-btn {
  flex: 1;
  padding: 10px;
  border-radius: 10px;
  background: transparent;
  border: 0.5px solid rgba(255, 170, 0, 0.25);
  color: rgba(255, 170, 0, 0.65);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: rgba(255, 170, 0, 0.06);
  border-color: rgba(255, 170, 0, 0.45);
  color: rgba(255, 170, 0, 0.85);
}

/* ===== 窄屏幕（移动端）响应式 ===== */
@media (max-width: 480px) {
  .overlay {
    align-items: flex-end;
  }

  .panel {
    width: 100vw;
    max-width: 100%;
    max-height: 92vh;
    border-radius: 16px 16px 0 0;
    margin-top: auto;
    animation: slideUp .3s ease;
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .panel-header {
    padding: 12px 14px;
  }

  .panel-body {
    padding: 8px 0;
  }

  .tab-bar {
    padding: 0 12px;
    overflow-x: auto;
    gap: 0;
  }

  .tab {
    padding: 8px 10px;
    font-size: 12px;
    white-space: nowrap;
  }

  .list-item {
    padding: 10px 14px;
  }

  .item-title {
    font-size: 13px;
  }

  .item-meta {
    font-size: 11px;
  }
}
</style>
