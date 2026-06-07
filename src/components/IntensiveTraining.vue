<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'

const store = useAppStore()
const sidebarOpen = ref(false)
const userAnswers = ref<Record<string, string[]>>({})
const showAnswer = ref<Record<string, boolean>>({})
const answerResult = ref<Record<string, 'correct' | 'wrong' | null>>({})

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

const session = computed(() => store.trainingSession)
const isOutlineView = computed(() => session.value !== null && session.value.currentIndex === -1)
const isDetailView = computed(() => session.value !== null && session.value.currentIndex >= 0)
const hasSession = computed(() => session.value !== null)

const currentQuestion = computed(() => {
  if (!session.value || session.value.currentIndex < 0) return null
  return session.value.questions[session.value.currentIndex] || null
})

const totalQuestions = computed(() => session.value?.questions.length || 0)
const completedCount = computed(() => {
  if (!session.value) return 0
  return Object.values(session.value.progress).filter(v => v === 'correct' || v === 'wrong').length
})
const correctCount = computed(() => {
  if (!session.value) return 0
  return Object.values(session.value.progress).filter(v => v === 'correct').length
})
const wrongCount = computed(() => {
  if (!session.value) return 0
  return Object.values(session.value.progress).filter(v => v === 'wrong').length
})
const pendingCount = computed(() => totalQuestions.value - completedCount.value)
const accuracy = computed(() => {
  if (totalQuestions.value === 0) return 0
  return Math.round(correctCount.value / totalQuestions.value * 100)
})

function parseSentence(sentence: string) {
  const parts = sentence.split(/(___)/g)
  const blankCount = parts.filter(p => p === '___').length
  let blankIdx = 0
  return parts.map((p) => {
    if (p === '___') {
      return { isBlank: true, text: '', index: blankIdx++ }
    }
    return { isBlank: false, text: p, index: -1 }
  })
}

const sentenceSegments = computed(() => {
  if (!currentQuestion.value) return []
  return parseSentence(currentQuestion.value.blankedSentence)
})

function initAnswerInputs() {
  if (!currentQuestion.value) return
  const qId = currentQuestion.value.id
  // 从 store 读取已保存的用户答案
  if (store.trainingSession?.userAnswers[qId]) {
    userAnswers.value[qId] = [...store.trainingSession.userAnswers[qId]]
  } else if (!userAnswers.value[qId]) {
    const blankCount = currentQuestion.value.blanks.length
    userAnswers.value[qId] = new Array(blankCount).fill('')
  }
  // 从 store 读取答题结果
  if (store.trainingSession?.progress[qId] === 'correct') {
    answerResult.value[qId] = 'correct'
  } else if (store.trainingSession?.progress[qId] === 'wrong') {
    answerResult.value[qId] = 'wrong'
    showAnswer.value[qId] = true
  } else {
    answerResult.value[qId] = null
    showAnswer.value[qId] = false
  }
}

onMounted(() => { initAnswerInputs() })
watch(currentQuestion, () => { initAnswerInputs() })

function speakSentence() {
  if (!currentQuestion.value) return
  store.speakText(currentQuestion.value.originalSentence, store.targetLang)
}

function handleNext() {
  if (!currentQuestion.value) return
  const q = currentQuestion.value
  const answers = userAnswers.value[q.id]

  if (!answers || answers.some((a: string) => !a.trim())) return

  // 调用 store 提交，这会更新 trainingSession
  store.submitTrainingAnswer(q.id, answers)

  // 从 store 直接读取最新状态（而非从 computed 读）
  const updatedProgress = store.trainingSession?.progress?.[q.id]
  if (updatedProgress === 'correct') {
    answerResult.value[q.id] = 'correct'
    showAnswer.value[q.id] = false
    nextTick(() => { initAnswerInputs() })
  } else {
    answerResult.value[q.id] = 'wrong'
    showAnswer.value[q.id] = true
  }
}

function toggleShowAnswer() {
  if (!currentQuestion.value) return
  const qId = currentQuestion.value.id
  showAnswer.value[qId] = !showAnswer.value[qId]
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    handleNext()
  }
}

function getStatusIcon(status: string | undefined) {
  switch (status) {
    case 'correct': return '✓'
    case 'wrong': return '✗'
    default: return '○'
  }
}

function getStatusClass(status: string | undefined) {
  switch (status) {
    case 'correct': return 'q-correct'
    case 'wrong': return 'q-wrong'
    default: return 'q-pending'
  }
}

function getDifficultyLabel(d: string) {
  return { beginner: '初级', intermediate: '中级', advanced: '高级' }[d] || d
}

function handleDeleteSession(id: string) {
  store.deleteTrainingSession(id)
}

function goToOutline() {
  store.goToTrainingQuestion(-1)
}

function getQuestionStatus(questionId: string): string {
  return store.trainingSession?.progress?.[questionId] || 'pending'
}

function isCurrentQuestion(questionId: string): boolean {
  if (!store.trainingSession) return false
  return store.trainingSession.questions[store.trainingSession.currentIndex]?.id === questionId
}

function canNavigateToQuestion(questionId: string): boolean {
  // 允许跳转到: 已完成 或 当前的题目
  const status = getQuestionStatus(questionId)
  return status === 'correct' || status === 'wrong' || isCurrentQuestion(questionId)
}

function countCorrect(progress: Record<string, string>): number {
  return Object.values(progress).filter(v => v === 'correct').length
}

function hasAnyFilled(answers: string[]): boolean {
  return answers.some((a: string) => !!a.trim())
}
</script>

<template>
  <div class="intensive-view">
    <!-- ====== Empty State / Generate ====== -->
    <template v-if="!hasSession">
      <div class="vocab-main">
        <div class="vocab-bar">
          <div class="vocab-bar-left">
            <button class="sidebar-toggle" @click="toggleSidebar" title="历史记录">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" stroke-linecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
              <span class="toggle-label">历史</span>
            </button>
            <span class="vocab-status-text">⚡ 强化训练</span>
          </div>
          <div class="vocab-bar-right">
            <button class="vocab-tool-btn" :disabled="store.vocabAssessing" @click="store.assessVocabLevel()">
              {{ store.vocabAssessing ? '⏳' : '📊' }} 评估
            </button>
            <button class="vocab-tool-btn primary" :disabled="store.trainingGenerating" @click="store.generateTrainingQuestions()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
              {{ store.trainingGenerating ? '生成中...' : '生成考题' }}
            </button>
          </div>
        </div>

        <div class="level-badge">
          <span class="level-label">🗣 {{ store.getLangLabel(store.nativeLanguage) }}</span>
          <span class="level-dot">·</span>
          <span class="level-label">🎯 {{ store.getLangLabel(store.targetLang) }}</span>
          <span class="level-dot">·</span>
          <span class="level-label">📈
            <template v-if="store.languageProficiencies[store.targetLang]">{{ store.getProficiencyLabel(store.languageProficiencies[store.targetLang]) }}</template>
            <template v-else>{{ store.vocabUserLevel }}</template>
          </span>
          <span v-if="store.vocabAssessing" class="level-assessing">评估中...</span>
        </div>

        <div v-if="store.trainingGenerateError" class="error-banner">
          <span class="error-icon">⚠️</span>
          <span class="error-msg">{{ store.trainingGenerateError }}</span>
          <button class="error-dismiss" @click="store.trainingGenerateError = ''">✕</button>
        </div>

        <div v-if="store.trainingGenerating" class="progress-section">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: store.trainingGenerateProgress + '%' }"></div>
          </div>
          <div class="progress-info">
            <span class="progress-pct">{{ store.trainingGenerateProgress }}%</span>
            <span class="progress-status">{{ store.trainingGenerateStatus }}</span>
          </div>
        </div>

        <div v-if="!store.trainingGenerating && !hasSession" class="empty">
          <div class="empty-icon-wrap"><span class="empty-icon">⚡</span></div>
          <p class="empty-title">强化训练</p>
          <p class="empty-hint">点击「生成考题」，AI 将根据你的语言能力生成 30 道填空题</p>
          <button class="empty-btn" @click="store.generateTrainingQuestions()">⚡ 生成考题</button>
        </div>
      </div>
    </template>

    <!-- ====== Outline View (Question List) ====== -->
    <template v-else-if="isOutlineView">
      <div class="vocab-main">
        <div class="vocab-bar">
          <div class="vocab-bar-left">
            <button class="sidebar-toggle" @click="toggleSidebar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" stroke-linecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
              <span class="toggle-label">历史</span>
            </button>
            <span class="vocab-status-text">⚡ 强化训练 · 题目大纲</span>
          </div>
          <div class="vocab-bar-right">
            <button class="vocab-tool-btn danger" @click="store.clearTrainingSession()">退出</button>
          </div>
        </div>

        <div class="intensive-stats">
          <div class="stat-item">
            <span class="stat-num correct">{{ correctCount }}</span>
            <span class="stat-label">正确</span>
          </div>
          <div class="stat-item">
            <span class="stat-num wrong">{{ wrongCount }}</span>
            <span class="stat-label">错误</span>
          </div>
          <div class="stat-item">
            <span class="stat-num pending">{{ pendingCount }}</span>
            <span class="stat-label">未做</span>
          </div>
          <div class="stat-item">
            <span class="stat-num total">{{ accuracy }}%</span>
            <span class="stat-label">正确率</span>
          </div>
        </div>

        <div class="intensive-list">
          <div
            v-for="(q, idx) in session.questions"
            :key="q.id"
            class="intensive-item"
            :class="[getStatusClass(getQuestionStatus(q.id)), { active: isCurrentQuestion(q.id) }]"
            @click="store.goToTrainingQuestion(idx)"
          >
            <span class="q-num">{{ idx + 1 }}</span>
            <span class="q-icon">{{ getStatusIcon(getQuestionStatus(q.id)) }}</span>
            <span class="q-preview">{{ q.blankedSentence.slice(0, 50) }}{{ q.blankedSentence.length > 50 ? '...' : '' }}</span>
            <span class="q-diff">{{ getDifficultyLabel(q.difficulty) }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- ====== Detail View (Answer Page) ====== -->
    <template v-else-if="isDetailView && currentQuestion">
      <div class="detail">
        <div class="detail-bar">
          <button class="detail-back" @click="goToOutline">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="22" height="22" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>大纲</span>
          </button>
          <div class="detail-progress-text">
            {{ store.trainingSession.currentIndex + 1 }} / {{ totalQuestions }}
          </div>
          <div class="detail-right">
            <button class="sidebar-toggle" @click="toggleSidebar" title="历史记录">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" stroke-linecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="progress-track">
          <div class="progress-fill" :style="{ width: (completedCount / totalQuestions * 100) + '%' }" />
        </div>

        <div class="detail-scroll">
          <div class="question-area">
            <div class="question-label">请补全以下句子：</div>

            <div class="sentence-block">
              <template v-for="seg in sentenceSegments" :key="seg.index">
                <span v-if="!seg.isBlank" class="sentence-text">{{ seg.text }}</span>
                <span v-else class="blank-wrapper">
                  <input
                    v-model="userAnswers[currentQuestion.id][seg.index]"
                    type="text"
                    class="blank-input"
                    :class="{
                      'input-correct': answerResult[currentQuestion.id] === 'correct',
                      'input-wrong': answerResult[currentQuestion.id] === 'wrong',
                    }"
                    :placeholder="'空' + (seg.index + 1)"
                    @keydown="handleKeydown"
                    @input="if (answerResult[currentQuestion.id] === 'wrong') { answerResult[currentQuestion.id] = null; showAnswer[currentQuestion.id] = false; }"
                  />
                  <span
                    v-if="showAnswer[currentQuestion.id]"
                    class="blank-answer"
                  >{{ currentQuestion.blanks[seg.index] }}</span>
                </span>
              </template>
            </div>

            <div class="question-translation">{{ currentQuestion.translation }}</div>
          </div>

          <div class="action-row">
            <button class="action-btn" @click="speakSentence" title="朗读原文">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
              朗读
            </button>
            <button class="action-btn" @click="toggleShowAnswer">
              {{ showAnswer[currentQuestion.id] ? '隐藏答案' : '查看答案' }}
            </button>
          </div>

          <div v-if="answerResult[currentQuestion.id] === 'wrong'" class="result-banner wrong">
            <span>重新检查，可查看答案</span>
          </div>
          <div v-if="answerResult[currentQuestion.id] === 'correct'" class="result-banner correct">
            <span>回答正确</span>
          </div>

          <button
            class="next-btn"
            :disabled="answerResult[currentQuestion.id] === 'wrong' || !hasAnyFilled(userAnswers[currentQuestion.id] || [])"
            @click="handleNext"
          >
            <template v-if="answerResult[currentQuestion.id] === 'correct'">
              下一题 →
            </template>
            <template v-else>
              提交答案 <span class="shortcut-hint">⌘↵</span>
            </template>
          </button>

          <div class="dots-row">
            <div
              v-for="(q, idx) in store.trainingSession.questions"
              :key="q.id"
              class="dot"
              :class="[
                getStatusClass(getQuestionStatus(q.id)),
                { active: idx === store.trainingSession.currentIndex },
                { 'dot-disabled': !canNavigateToQuestion(q.id) }
              ]"
              @click="canNavigateToQuestion(q.id) && store.goToTrainingQuestion(idx)"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- ====== Global Sidebar (available from all views) ====== -->
    <Transition name="sidebar-pop">
      <aside v-if="sidebarOpen" class="vocab-sidebar">
        <div class="sidebar-backdrop" @click="toggleSidebar" />
        <div class="sidebar-panel">
          <div class="sidebar-header">
            <span class="sidebar-title">⚡ 历史记录</span>
            <button class="sidebar-close-btn" @click="toggleSidebar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="sidebar-list">
            <div
              v-for="s in store.trainingHistory"
              :key="s.id"
              class="sidebar-item"
              @click="store.loadTrainingSession(s.id); sidebarOpen = false;"
            >
              <div class="sidebar-item-top">
                <span class="sidebar-item-date">{{ new Date(s.createdAt).toLocaleDateString() }}</span>
                <span class="sidebar-item-count">{{ countCorrect(s.progress) }}/{{ s.questions.length }}</span>
              </div>
              <div class="sidebar-item-bottom">
                <span class="sidebar-item-lang">{{ store.getLangLabel(s.targetLang) }}</span>
                <span class="sidebar-item-badge" :class="s.status === 'completed' ? 'badge-done' : 'badge-active'">
                  {{ s.status === 'completed' ? '已完成' : '进行中' }}
                </span>
                <button class="sidebar-item-del" @click.stop="handleDeleteSession(s.id)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
            <div v-if="store.trainingHistory.length === 0" class="sidebar-empty">暂无历史记录</div>
          </div>
        </div>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
.intensive-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.vocab-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.vocab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  flex-shrink: 0;
}
.vocab-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.vocab-bar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
.sidebar-toggle:hover {
  background: var(--bg-hover);
}
.toggle-label { font-size: 12px; }

.vocab-status-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.vocab-tool-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-secondary);
}
.vocab-tool-btn:hover { background: var(--bg-hover); }
.vocab-tool-btn.primary { background: var(--accent); color: #fff; }
.vocab-tool-btn.primary:hover { opacity: .9; }
.vocab-tool-btn.danger {
  color: var(--text-muted);
  border: 0.5px solid var(--border);
  background: transparent;
}
.vocab-tool-btn.danger:hover { background: var(--bg-hover); color: var(--text-secondary); }
.vocab-tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.level-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px 10px;
  flex-shrink: 0;
}
.level-label { font-size: 11px; color: var(--text-muted); }
.level-dot { font-size: 10px; color: var(--text-muted); opacity: .4; }
.level-assessing { font-size: 11px; color: var(--accent); font-weight: 600; animation: pulse 1s ease infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 14px 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(184, 134, 11, 0.08);
  border: 0.5px solid rgba(184, 134, 11, 0.2);
  flex-shrink: 0;
}
.error-icon { font-size: 14px; }
.error-msg { flex: 1; font-size: 12px; color: #b8860b; }
.error-dismiss {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: var(--text-muted);
}
.error-dismiss:hover { background: var(--bg-hover); }

/* Progress section */
.progress-section {
  padding: 0 14px 10px;
  flex-shrink: 0;
}
.progress-track {
  height: 4px;
  background: var(--bg-secondary);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width .3s ease;
}
.progress-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.progress-pct {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
}
.progress-status {
  font-size: 11px;
  color: var(--text-muted);
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 20px;
}
.empty-icon-wrap {
  width: 64px; height: 64px;
  border-radius: 50%;
  background: var(--bg-secondary);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 4px;
}
.empty-icon { font-size: 32px; }
.empty-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin: 0; }
.empty-hint {
  font-size: 13px; color: var(--text-muted); text-align: center;
  max-width: 300px; line-height: 1.5; margin: 0;
}
.empty-btn {
  margin-top: 8px; padding: 10px 20px; border-radius: 8px;
  background: var(--accent); color: #fff; font-size: 14px; font-weight: 600;
}
.empty-btn:hover { opacity: .9; }

.vocab-sidebar {
  position: fixed; inset: 0; z-index: 200;
  display: flex; flex-direction: row-reverse;
}
.sidebar-backdrop { flex: 1; background: rgba(0,0,0,0.35); }
.sidebar-panel {
  width: 280px; background: var(--bg-primary);
  border-right: 0.5px solid var(--border);
  display: flex; flex-direction: column;
}
.sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 14px 10px; flex-shrink: 0;
}
.sidebar-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.sidebar-close-btn {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
}
.sidebar-close-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.sidebar-list { flex: 1; overflow-y: auto; padding: 0 10px; }
.sidebar-item { padding: 10px; border-radius: 8px; margin-bottom: 4px; cursor: pointer; }
.sidebar-item:hover { background: var(--bg-hover); }
.sidebar-item-top {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;
}
.sidebar-item-date { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.sidebar-item-count { font-size: 12px; color: var(--accent); font-weight: 600; }
.sidebar-item-bottom { display: flex; align-items: center; gap: 6px; }
.sidebar-item-lang { font-size: 11px; color: var(--text-muted); }
.sidebar-item-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 600; }
.badge-active { background: rgba(59, 130, 246, 0.1); color: var(--accent); }
.badge-done { background: rgba(76, 175, 122, 0.12); color: #4caf7a; }
.sidebar-item-del {
  margin-left: auto; width: 24px; height: 24px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); opacity: 0;
}
.sidebar-item:hover .sidebar-item-del { opacity: 1; }
.sidebar-item-del:hover { background: var(--bg-hover); color: #b8860b; }
.sidebar-empty { text-align: center; padding: 30px 0; font-size: 13px; color: var(--text-muted); }

/* Stats */
.intensive-stats {
  display: flex; gap: 8px; padding: 4px 14px 12px; flex-shrink: 0;
}
.stat-item {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  gap: 2px; padding: 10px 6px; border-radius: 8px; background: var(--bg-secondary);
}
.stat-num { font-size: 20px; font-weight: 800; }
.stat-num.correct { color: #4caf7a; }
.stat-num.wrong { color: #b8860b; }
.stat-num.pending { color: var(--text-muted); }
.stat-num.total { color: var(--accent); }
.stat-label { font-size: 10px; color: var(--text-muted); font-weight: 500; }

/* Question list */
.intensive-list { flex: 1; overflow-y: auto; padding: 0 14px 20px; }
.intensive-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 6px; margin-bottom: 3px; cursor: pointer;
}
.intensive-item:hover { background: var(--bg-hover); }
.intensive-item.active { background: var(--bg-surface); border: 0.5px solid var(--border); }
.q-num {
  width: 24px; font-size: 12px; font-weight: 600; color: var(--text-secondary);
  text-align: center; flex-shrink: 0;
}
.q-icon { width: 18px; font-size: 14px; text-align: center; flex-shrink: 0; }
.q-preview {
  flex: 1; font-size: 12px; color: var(--text-primary);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.q-diff {
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: var(--bg-secondary); color: var(--text-muted); flex-shrink: 0;
}
.q-correct .q-icon { color: #4caf7a; }
.q-wrong .q-icon { color: #b8860b; }
.q-pending .q-icon { color: var(--text-muted); }

/* Detail */
.detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.detail-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; flex-shrink: 0;
}
.detail-back {
  display: flex; align-items: center; gap: 2px;
  font-size: 13px; font-weight: 600; color: var(--text-secondary);
}
.detail-back:hover { color: var(--text-primary); }
.detail-progress-text { font-size: 13px; font-weight: 600; color: var(--text-muted); }
.detail-right { display: flex; align-items: center; }

.progress-track {
  height: 3px; background: var(--bg-secondary);
  margin: 0 12px 8px; border-radius: 2px; flex-shrink: 0;
}
.progress-fill {
  height: 100%; background: var(--accent);
  border-radius: 2px; transition: width 0.3s ease;
}

.detail-scroll {
  flex: 1; overflow-y: auto; padding: 0 16px 24px; display: flex; flex-direction: column;
}

.question-area { margin-bottom: 16px; }
.question-label { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; }

.sentence-block {
  line-height: 2; font-size: 17px; color: var(--text-primary);
  padding: 16px; background: var(--bg-surface);
  border-radius: 10px; border: 0.5px solid var(--border); margin-bottom: 10px;
}
.sentence-text { white-space: pre-wrap; }
.blank-wrapper {
  display: inline-flex; flex-direction: column;
  align-items: center; vertical-align: bottom; margin: 0 2px;
}
.blank-input {
  width: 120px; padding: 4px 8px; border: none;
  border-bottom: 2px solid var(--border); background: transparent;
  color: var(--text-primary); font-size: 16px; font-family: inherit;
  text-align: center; outline: none; transition: border-color 0.2s;
}
.blank-input:focus { border-bottom-color: var(--accent); }
.blank-input.input-correct { border-bottom-color: #4caf7a; color: #4caf7a; }
.blank-input.input-wrong { border-bottom-color: #b8860b; color: #b8860b; }
.blank-input::placeholder { color: var(--text-muted); font-size: 12px; }
.blank-answer { font-size: 12px; color: var(--accent); font-weight: 600; margin-top: 2px; }

.question-translation { font-size: 13px; color: var(--text-muted); line-height: 1.5; padding: 0 4px; }

.action-row { display: flex; gap: 8px; margin-bottom: 12px; }
.action-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 14px; border-radius: 6px; font-size: 12px;
  font-weight: 600; color: var(--text-secondary);
  background: var(--bg-secondary); border: none; cursor: pointer;
}
.action-btn:hover { background: var(--bg-hover); }

.result-banner {
  padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; margin-bottom: 12px;
}
.result-banner.correct {
  background: rgba(76, 175, 122, 0.1); color: #4caf7a;
  border: 0.5px solid rgba(76, 175, 122, 0.25);
}
.result-banner.wrong {
  background: rgba(184, 134, 11, 0.08); color: #b8860b;
  border: 0.5px solid rgba(184, 134, 11, 0.2);
}

.next-btn {
  width: 100%; padding: 12px 0; border-radius: 8px;
  background: var(--accent); color: #fff; font-size: 14px;
  font-weight: 700; border: none; cursor: pointer; margin-bottom: 16px;
}
.next-btn:hover:not(:disabled) { opacity: .9; }
.next-btn:disabled { background: var(--bg-secondary); color: var(--text-muted); cursor: not-allowed; }
.shortcut-hint { font-size: 10px; opacity: 0.6; margin-left: 6px; }

.dots-row {
  display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; padding: 4px 0;
}
.dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--bg-secondary); flex-shrink: 0;
}
.dot.q-correct { background: #4caf7a; }
.dot.q-wrong { background: #b8860b; }
.dot.q-pending { background: var(--bg-secondary); }
.dot.active { outline: 2px solid var(--accent); outline-offset: 1px; }
.dot.dot-disabled { opacity: 0.3; cursor: not-allowed; }
.dot:not(.dot-disabled) { cursor: pointer; }

.sidebar-pop-enter-active,
.sidebar-pop-leave-active { transition: all .25s ease; }
.sidebar-pop-enter-from,
.sidebar-pop-leave-to { opacity: 0; }
.sidebar-pop-enter-from .sidebar-panel,
.sidebar-pop-leave-to .sidebar-panel { transform: translateX(-100%); }
</style>
