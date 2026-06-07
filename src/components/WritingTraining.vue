<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'

const store = useAppStore()

const writingContent = ref('')
const showHints = ref(false)

// 从 store 同步内容
let lastSessionId = ''
watch(() => store.writingSession, (session) => {
  if (session) {
    writingContent.value = session.content
    if (session.id !== lastSessionId) {
      showHints.value = false
      lastSessionId = session.id
    }
  }
}, { immediate: true })

const hasTopics = computed(() => store.writingTopics.length > 0)
const hasSession = computed(() => store.writingSession !== null)
const isWritingView = computed(() => hasSession.value && store.writingSession!.status === 'writing')
const isEvaluationView = computed(() => hasSession.value && store.writingSession!.status === 'completed')
const activeSession = computed(() => store.writingSession)

function handleContentInput(e: Event) {
  const text = (e.target as HTMLTextAreaElement).value
  writingContent.value = text
  store.updateWritingContent(text)
}

function handleStartWriting(topicId: string) {
  store.startWritingSession(topicId)
}

function handleGetHint() {
  store.updateWritingContent(writingContent.value)
  store.getWritingHint()
  showHints.value = true
}

function handleSubmit() {
  store.updateWritingContent(writingContent.value)
  store.submitWriting()
}

function handleBackToTopics() {
  store.clearWritingSession()
}

function handleLoadSession(id: string) {
  store.loadWritingSession(id)
}

function handleDeleteSession(id: string) {
  store.deleteWritingSession(id)
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('zh-CN')
}

const correctionTypeLabel: Record<string, string> = {
  grammar: '语法',
  spelling: '拼写',
  expression: '表达',
  word_choice: '用词',
}
</script>

<template>
  <div class="writing-view">
    <!-- ====== 空状态 / 命题列表 ====== -->
    <template v-if="!hasSession">
      <div class="writing-header">
        <div class="writing-header-left">
          <span class="writing-title">✍ 写作训练</span>
        </div>
        <button class="vocab-tool-btn" :disabled="store.vocabAssessing" @click="store.assessVocabLevel()">
          {{ store.vocabAssessing ? '⏳' : '📊' }} 评估
        </button>
      </div>

      <div class="level-badge">
        <span class="level-label">🗣 {{ store.getLangLabel(store.targetLang) }}</span>
        <span class="level-dot">·</span>
        <span class="level-label">📈
          <template v-if="store.languageProficiencies[store.targetLang]">{{ store.getProficiencyLabel(store.languageProficiencies[store.targetLang]) }}</template>
          <template v-else>{{ store.vocabUserLevel }}</template>
        </span>
        <span v-if="store.vocabAssessing" class="level-assessing">评估中...</span>
      </div>

      <div v-if="store.writingError" class="error-banner">
        <span>⚠️ {{ store.writingError }}</span>
        <button class="error-dismiss" @click="store.writingError = ''">✕</button>
      </div>

      <!-- 生成按钮 -->
      <div v-if="!hasTopics" class="empty">
        <div class="empty-icon-wrap"><span class="empty-icon">✍</span></div>
        <p class="empty-title">写作训练</p>
        <p class="empty-hint">AI 将根据你的语言水平生成 3 个写作命题，选择后开始写作</p>
        <button class="empty-btn" :disabled="store.writingGenerating" @click="store.generateWritingTopics()">
          {{ store.writingGenerating ? '生成中...' : '生成写作命题' }}
        </button>
      </div>

      <!-- 命题列表 -->
      <div v-else class="topics-list">
        <div class="topics-header">
          <span class="topics-count">共 {{ store.writingTopics.length }} 个命题</span>
          <button class="topics-regenerate" :disabled="store.writingGenerating" @click="store.generateWritingTopics()">
            {{ store.writingGenerating ? '生成中...' : '重新生成' }}
          </button>
        </div>

        <div
          v-for="topic in store.writingTopics"
          :key="topic.id"
          class="topic-card"
          @click="handleStartWriting(topic.id)"
        >
          <div class="topic-title">{{ topic.title }}</div>
          <div class="topic-desc">{{ topic.description }}</div>
          <div class="topic-translation">{{ topic.translation }}</div>
          <div class="topic-tips">
            <span class="tip-tag" v-for="(tip, i) in topic.tips" :key="i">{{ tip }}</span>
          </div>
        </div>
      </div>

      <!-- 历史记录 -->
      <div v-if="store.writingHistory.length > 0" class="writing-history">
        <div class="history-title">历史写作</div>
        <div
          v-for="s in store.writingHistory"
          :key="s.id"
          class="history-item"
          @click="handleLoadSession(s.id)"
        >
          <div class="history-item-top">
            <span class="history-topic">{{ s.topic.title }}</span>
            <span class="history-score" v-if="s.evaluation">{{ s.evaluation.score }}分</span>
          </div>
          <div class="history-item-bottom">
            <span class="history-date">{{ formatDate(s.createdAt) }}</span>
            <button class="history-del" @click.stop="handleDeleteSession(s.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- ====== 写作视图 ====== -->
    <template v-else-if="isWritingView && activeSession">
      <div class="writing-editor">
        <div class="editor-bar">
          <button class="editor-back" @click="handleBackToTopics">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="22" height="22" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>命题</span>
          </button>
          <div class="editor-title">{{ activeSession.topic.title }}</div>
        </div>

        <div class="editor-topic-info">
          <div class="editor-desc">{{ activeSession.topic.description }}</div>
          <div class="editor-translation">{{ activeSession.topic.translation }}</div>
        </div>

        <textarea
          class="editor-textarea"
          :value="writingContent"
          @input="handleContentInput"
          :placeholder="'请用' + store.getLangLabel(store.targetLang) + '开始写作...'"
        />

        <div class="editor-actions">
          <div class="editor-actions-row">
            <button class="hint-circle-btn" :disabled="store.writingLoadingHint" @click="handleGetHint" title="写作提示">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </button>
            <button class="submit-btn" :disabled="store.writingEvaluating || !writingContent.trim()" @click="handleSubmit">
              {{ store.writingEvaluating ? '评分中...' : '提交评分' }}
            </button>
          </div>
        </div>

        <!-- 写作提示 -->
        <div v-if="showHints && activeSession.hints.length > 0" class="hints-section">
          <div v-for="(hint, idx) in activeSession.hints" :key="idx" class="hint-block">
            <div class="hint-continuation">{{ hint.continuation }}</div>
            <div v-if="hint.continuationTranslation" class="hint-translation">{{ hint.continuationTranslation }}</div>
            <div class="hint-options">
              <div v-for="(opt, oi) in hint.options" :key="oi" class="hint-option">
                <span class="hint-opt-num">{{ oi + 1 }}.</span>
                <div class="hint-opt-content">
                  <div class="hint-opt-text">{{ opt }}</div>
                  <div v-if="hint.optionsTranslation?.[oi]" class="hint-opt-translation">{{ hint.optionsTranslation[oi] }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ====== 评分/评价视图 ====== -->
    <template v-else-if="isEvaluationView && activeSession">
      <div class="writing-eval">
        <div class="eval-bar">
          <button class="eval-back" @click="handleBackToTopics">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="22" height="22" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>命题</span>
          </button>
          <div class="eval-title">写作评估</div>
        </div>

        <div class="eval-scroll" v-if="activeSession.evaluation">
          <div class="eval-score-section">
            <div class="eval-score-circle">
              <span class="eval-score-num">{{ activeSession.evaluation.score }}</span>
              <span class="eval-score-unit">分</span>
            </div>
          </div>

          <div class="eval-comment">{{ activeSession.evaluation.comment }}</div>

          <div class="eval-section">
            <div class="eval-section-title">💪 优点</div>
            <div class="eval-tags">
              <span v-for="s in activeSession.evaluation.strengths" :key="s" class="eval-tag strength">{{ s }}</span>
            </div>
          </div>

          <div class="eval-section">
            <div class="eval-section-title">📝 待改进</div>
            <div class="eval-tags">
              <span v-for="w in activeSession.evaluation.weaknesses" :key="w" class="eval-tag weakness">{{ w }}</span>
            </div>
          </div>

          <div v-if="activeSession.evaluation.corrections.length > 0" class="eval-section">
            <div class="eval-section-title">✏️ 批改</div>
            <div v-for="(c, idx) in activeSession.evaluation.corrections" :key="idx" class="correction-card">
              <div class="correction-label">{{ correctionTypeLabel[c.type] || c.type }}</div>
              <div class="correction-row">
                <span class="correction-original-label">原文</span>
                <span class="correction-original">{{ c.original }}</span>
              </div>
              <div class="correction-row">
                <span class="correction-corrected-label">修改</span>
                <span class="correction-corrected">{{ c.corrected }}</span>
              </div>
              <div class="correction-explain">{{ c.explanation }}</div>
            </div>
          </div>

          <div class="eval-your-writing">
            <div class="eval-section-title">📄 你的作文</div>
            <div class="eval-writing-content">{{ activeSession.content }}</div>
          </div>

          <button class="eval-new-btn" @click="handleBackToTopics">写新作文</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.writing-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.writing-header {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  flex-shrink: 0;
}
.writing-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }

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
.error-banner span { flex: 1; font-size: 12px; color: #b8860b; }
.error-dismiss {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: var(--text-muted);
}
.error-dismiss:hover { background: var(--bg-hover); }

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
.empty-hint { font-size: 13px; color: var(--text-muted); text-align: center; max-width: 300px; line-height: 1.5; margin: 0; }
.empty-btn {
  margin-top: 8px; padding: 10px 20px; border-radius: 8px;
  background: var(--accent); color: #fff; font-size: 14px; font-weight: 600;
  border: none;
}
.empty-btn:hover:not(:disabled) { opacity: .9; }
.empty-btn:disabled { opacity: .5; cursor: not-allowed; }

/* Topics */
.topics-list { flex: 1; overflow-y: auto; padding: 0 14px 20px; }
.topics-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 2px 10px;
}
.topics-count { font-size: 12px; color: var(--text-muted); }
.topics-regenerate {
  font-size: 11px; padding: 3px 10px; border-radius: 6px;
  color: var(--accent); background: rgba(29, 155, 240, 0.08); font-weight: 600;
}
.topics-regenerate:hover:not(:disabled) { background: rgba(29, 155, 240, 0.15); }
.topics-regenerate:disabled { opacity: .5; cursor: not-allowed; }

.topic-card {
  padding: 14px; border-radius: 10px;
  background: var(--bg-surface);
  border: 0.5px solid var(--border);
  margin-bottom: 10px; cursor: pointer; transition: all .15s;
}
.topic-card:hover { border-color: var(--accent); transform: translateY(-1px); }
.topic-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.topic-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 6px; }
.topic-translation { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; }
.topic-tips { display: flex; flex-wrap: wrap; gap: 4px; }
.tip-tag {
  font-size: 10px; padding: 2px 8px; border-radius: 4px;
  background: var(--bg-secondary); color: var(--text-muted);
}

/* History */
.writing-history { border-top: 0.5px solid var(--border); padding: 12px 14px; flex-shrink: 0; }
.history-title { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; }
.history-item { padding: 8px; border-radius: 6px; cursor: pointer; }
.history-item:hover { background: var(--bg-hover); }
.history-item-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
.history-topic { font-size: 13px; font-weight: 600; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-score { font-size: 12px; color: var(--accent); font-weight: 700; }
.history-item-bottom { display: flex; align-items: center; justify-content: space-between; }
.history-date { font-size: 11px; color: var(--text-muted); }
.history-del {
  width: 24px; height: 24px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); opacity: 0;
}
.history-item:hover .history-del { opacity: 1; }
.history-del:hover { background: var(--bg-hover); color: #b8860b; }

/* Editor */
.writing-editor { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.editor-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; flex-shrink: 0;
}
.editor-back {
  display: flex; align-items: center; gap: 2px;
  font-size: 13px; font-weight: 600; color: var(--text-secondary);
}
.editor-back:hover { color: var(--text-primary); }
.editor-title { flex: 1; font-size: 14px; font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.editor-topic-info { padding: 0 14px 8px; flex-shrink: 0; }
.editor-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 4px; }
.editor-translation { font-size: 11px; color: var(--text-muted); }

.editor-textarea {
  flex: 1; margin: 0 14px 8px; padding: 12px;
  border-radius: 8px; border: 0.5px solid var(--border);
  background: var(--bg-surface); color: var(--text-primary);
  font-size: 14px; line-height: 1.7; font-family: inherit;
  resize: none; outline: none;
}
.editor-textarea:focus { border-color: var(--accent); }
.editor-textarea::placeholder { color: var(--text-muted); }

.editor-actions {
  display: flex; padding: 0 14px 10px; flex-shrink: 0; justify-content: flex-end;
}
.editor-actions-row {
  display: flex; align-items: center; gap: 8px;
}
.hint-circle-btn {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--bg-secondary); color: var(--text-secondary);
  border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background .15s;
}
.hint-circle-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.hint-circle-btn:disabled { opacity: .5; cursor: not-allowed; }
.submit-btn {
  background: var(--accent); color: #fff; padding: 10px 18px; border-radius: 8px;
  font-size: 13px; font-weight: 700; border: none; cursor: pointer;
}
.submit-btn:hover:not(:disabled) { opacity: .9; }
.submit-btn:disabled { opacity: .5; cursor: not-allowed; }

.hints-section {
  padding: 0 14px 16px; flex-shrink: 0; max-height: 240px; overflow-y: auto;
}
.hint-block {
  padding: 12px; border-radius: 8px;
  background: rgba(29, 155, 240, 0.06);
  border: 0.5px solid rgba(29, 155, 240, 0.15);
  margin-bottom: 8px;
}
.hint-continuation { font-size: 13px; color: var(--text-primary); line-height: 1.6; margin-bottom: 4px; }
.hint-translation { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-bottom: 8px; padding-left: 2px; }
.hint-options { display: flex; flex-direction: column; gap: 4px; }
.hint-option { font-size: 12px; color: var(--text-secondary); line-height: 1.5; display: flex; gap: 4px; }
.hint-opt-num { color: var(--accent); font-weight: 600; flex-shrink: 0; }
.hint-opt-content { display: flex; flex-direction: column; gap: 1px; }
.hint-opt-text { color: var(--text-secondary); }
.hint-opt-translation { font-size: 11px; color: var(--text-muted); }

/* Evaluation */
.writing-eval { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.eval-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; flex-shrink: 0;
}
.eval-back {
  display: flex; align-items: center; gap: 2px;
  font-size: 13px; font-weight: 600; color: var(--text-secondary);
}
.eval-back:hover { color: var(--text-primary); }
.eval-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }

.eval-scroll { flex: 1; overflow-y: auto; padding: 0 16px 24px; }

.eval-score-section { display: flex; justify-content: center; padding: 20px 0; }
.eval-score-circle {
  width: 100px; height: 100px; border-radius: 50%;
  background: conic-gradient(var(--accent) 0deg, var(--bg-secondary) 0deg);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border: 3px solid var(--accent);
}
.eval-score-num { font-size: 32px; font-weight: 800; color: var(--accent); line-height: 1; }
.eval-score-unit { font-size: 12px; color: var(--text-muted); }

.eval-comment { font-size: 14px; color: var(--text-primary); line-height: 1.6; text-align: center; margin-bottom: 20px; }

.eval-section { margin-bottom: 16px; }
.eval-section-title { font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
.eval-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.eval-tag {
  font-size: 12px; padding: 4px 10px; border-radius: 6px;
}
.eval-tag.strength {
  background: rgba(76, 175, 122, 0.1); color: #4caf7a;
}
.eval-tag.weakness {
  background: rgba(184, 134, 11, 0.08); color: #b8860b;
}

.correction-card {
  padding: 10px; border-radius: 8px;
  background: var(--bg-surface);
  border: 0.5px solid var(--border);
  margin-bottom: 8px;
}
.correction-label {
  display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: rgba(29, 155, 240, 0.1); color: var(--accent); font-weight: 600;
  margin-bottom: 6px;
}
.correction-row { display: flex; gap: 6px; margin-bottom: 4px; font-size: 12px; line-height: 1.5; }
.correction-original-label, .correction-corrected-label {
  width: 32px; flex-shrink: 0; font-size: 10px; color: var(--text-muted);
  padding-top: 2px;
}
.correction-original { color: #b8860b; text-decoration: line-through; }
.correction-corrected { color: #4caf7a; font-weight: 600; }
.correction-explain { font-size: 11px; color: var(--text-muted); line-height: 1.5; }

.eval-your-writing { margin-bottom: 16px; }
.eval-writing-content {
  font-size: 13px; color: var(--text-secondary); line-height: 1.6;
  padding: 12px; border-radius: 8px;
  background: var(--bg-surface); border: 0.5px solid var(--border);
  white-space: pre-wrap;
}

.eval-new-btn {
  width: 100%; padding: 12px 0; border-radius: 8px;
  background: var(--accent); color: #fff; font-size: 14px;
  font-weight: 700; border: none; cursor: pointer;
}
.eval-new-btn:hover { opacity: .9; }
</style>
