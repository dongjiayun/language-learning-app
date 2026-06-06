<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { PROFICIENCY_LABELS, TARGET_LANGUAGES } from '@/types'
import type { LanguageProgress, LearningEvent } from '@/types'

const store = useAppStore()

const selectedLang = ref<string>(store.targetLang)

// 每次打开面板时，默认选中当前语种
watch(() => store.showProgress, (open) => {
  if (open) {
    selectedLang.value = store.targetLang
  }
})

const langOptions = computed(() => {
  const langs = store.langProgress.map(p => p.lang)
  // also include languages from proficiency settings that might have no events yet
  return TARGET_LANGUAGES.filter(t => langs.includes(t.value) || store.languageProficiencies[t.value])
})

const activeProgress = computed(() => {
  if (!selectedLang.value) return null
  return store.langProgress.find(p => p.lang === selectedLang.value) || null
})

const recentEvents = computed(() => {
  if (!selectedLang.value) return []
  return store.learningEvents.filter(e => e.lang === selectedLang.value).slice(0, 30)
})

function getLangLabel(lang: string) {
  const t = TARGET_LANGUAGES.find(l => l.value === lang)
  return t?.label || lang
}

function dateStr(ts: number) {
  const d = new Date(ts)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

function timeStr(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function eventTypeLabel(type: LearningEvent['type']) {
  const map: Record<string, string> = {
    chat_message: '💬 AI 对话',
    practice_message: '🎙️ 口语练习',
    practice_session: '📝 练习会话',
    vocab_article: '📖 期刊文章',
    vocab_word_lookup: '🔍 查词',
    speaking_session: '🗣️ 口语提示',
  }
  return map[type] || type
}

const weekDays = ['一', '二', '三', '四', '五', '六', '日']

function weekChartData(progress: LanguageProgress) {
  const today = new Date()
  const BAR_MAX_PX = 72
  const days: { label: string; count: number; px: number }[] = []
  let maxCount = 0
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const dayStats = progress.dailyStats.find(s => s.date === dateStr)
    const total = dayStats
      ? dayStats.chatMessages + dayStats.practiceMessages + dayStats.speakingSessions + dayStats.vocabArticles
      : 0
    if (total > maxCount) maxCount = total
    days.push({
      label: i === 0 ? '今天' : weekDays[d.getDay() === 0 ? 6 : d.getDay() - 1],
      count: total,
      px: 0,
    })
  }
  for (const d of days) {
    d.px = maxCount > 0 ? Math.max(Math.round((d.count / maxCount) * BAR_MAX_PX), 4) : d.count > 0 ? 4 : 0
  }
  return days
}
</script>

<template>
  <div class="progress-overlay" @click.self="store.toggleProgress()">
    <div class="progress-panel">
      <header class="progress-header">
        <span class="progress-title">学习进度</span>
        <button class="close-btn" @click="store.toggleProgress()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </header>

      <!-- 语种选择 -->
      <div class="lang-tabs">
        <button
          v-for="opt in langOptions"
          :key="opt.value"
          class="lang-tab"
          :class="{ active: selectedLang === opt.value }"
          @click="selectedLang = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>

      <template v-if="!selectedLang">
        <!-- 概览：所有语种 -->
        <div class="overview-grid">
          <div
            v-for="p in store.langProgress"
            :key="p.lang"
            class="overview-card"
            @click="selectedLang = p.lang"
          >
            <div class="overview-lang">{{ getLangLabel(p.lang) }}</div>
            <div class="overview-level">{{ PROFICIENCY_LABELS[p.level] || '未设置' }}</div>
            <div class="overview-stats">
              <span class="stat-badge">🔥 {{ p.streakDays }} 天</span>
              <span class="stat-badge">📊 {{ p.totalSessions }} 次练习</span>
            </div>
          </div>
        </div>

        <div v-if="store.langProgress.length === 0" class="empty">
          <p>暂无学习数据</p>
          <p class="empty-hint">开始使用口语练习、AI 对话、词汇训练后，进度将自动记录</p>
        </div>
      </template>

      <template v-else-if="activeProgress">
        <div class="scroll-area">
          <!-- 头部摘要 -->
          <div class="summary-header">
            <div class="summary-title">{{ PROFICIENCY_LABELS[activeProgress.level] || '未设置' }}</div>
            <div class="summary-streak">连续学习 🔥 {{ activeProgress.streakDays }} 天</div>
          </div>

          <!-- 本周走势图 -->
          <div class="chart-section">
            <div class="chart-title">本周学习趋势</div>
            <div class="chart-bars">
              <div
                v-for="day in weekChartData(activeProgress)"
                :key="day.label"
                class="chart-col"
              >
                <div class="chart-bar-wrapper">
                  <div
                    class="chart-bar"
                    :style="{ height: day.px + 'px' }"
                    :title="day.count + ' 次'"
                  ></div>
                </div>
                <div class="chart-label">{{ day.label }}</div>
              </div>
            </div>
          </div>

          <!-- 累计统计 -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-num">{{ activeProgress.totalSessions }}</div>
              <div class="stat-label">练习次数</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">{{ activeProgress.totalMessages }}</div>
              <div class="stat-label">发送消息</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">{{ activeProgress.totalVocabArticles }}</div>
              <div class="stat-label">阅读文章</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">{{ activeProgress.totalVocabLookups }}</div>
              <div class="stat-label">查词次数</div>
            </div>
          </div>

          <!-- 最近动态 -->
          <div class="events-section">
            <div class="events-title">最近动态</div>
            <div v-if="recentEvents.length === 0" class="empty-small">暂无动态</div>
            <div
              v-for="evt in recentEvents"
              :key="evt.id"
              class="event-row"
            >
              <span class="event-type">{{ eventTypeLabel(evt.type) }}</span>
              <span class="event-detail">{{ evt.detail }}</span>
              <span class="event-time">{{ dateStr(evt.timestamp) }} {{ timeStr(evt.timestamp) }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.progress-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  backdrop-filter: blur(2px);
  -webkit-app-region: no-drag;
}

.progress-panel {
  background: var(--bg-primary);
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  width: 420px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  flex-shrink: 0;
}

.progress-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* ===== 语种标签 ===== */
.lang-tabs {
  display: flex;
  gap: 6px;
  padding: 0 16px 10px;
  flex-shrink: 0;
  overflow-x: auto;
}

.lang-tab {
  padding: 5px 14px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.lang-tab.active {
  background: var(--accent);
  color: #fff;
}

.lang-tab:hover:not(.active) {
  background: var(--bg-hover);
}

/* ===== 概览 ===== */
.overview-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 16px;
  overflow-y: auto;
}

.overview-card {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.overview-card:hover {
  border-color: var(--accent);
}

.overview-lang {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.overview-level {
  font-size: 11px;
  color: var(--text-muted);
}

.overview-stats {
  display: flex;
  gap: 10px;
}

.stat-badge {
  font-size: 11px;
  color: var(--text-secondary);
}

/* ===== 详情 ===== */
.scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.summary-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
}

.summary-streak {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

/* ===== 走势图 ===== */
.chart-section {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
}

.chart-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.chart-bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 4px;
  height: 100px;
}

.chart-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.chart-bar-wrapper {
  flex: 1;
  display: flex;
  align-items: flex-end;
  width: 100%;
}

.chart-bar {
  width: 100%;
  max-width: 24px;
  background: var(--accent);
  border-radius: 3px 3px 0 0;
  transition: height 0.4s ease;
  opacity: 0.8;
  margin: 0 auto;
}

.chart-label {
  font-size: 10px;
  color: var(--text-muted);
}

/* ===== 统计卡片 ===== */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat-card {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px;
  text-align: center;
}

.stat-num {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* ===== 动态列表 ===== */
.events-section {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
}

.events-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.event-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 0.5px solid var(--border);
}

.event-row:last-child {
  border-bottom: none;
}

.event-type {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  white-space: nowrap;
  min-width: 80px;
}

.event-detail {
  flex: 1;
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-time {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* ===== Empty ===== */
.empty {
  padding: 40px 16px;
  text-align: center;
  font-size: 14px;
  color: var(--text-muted);
}

.empty-small {
  text-align: center;
  padding: 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.empty-hint {
  font-size: 12px;
  margin-top: 6px;
  opacity: 0.7;
}
</style>
