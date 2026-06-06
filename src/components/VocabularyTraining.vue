<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/appStore'
import type { VocabArticle } from '@/types'

const store = useAppStore()
const selectedArticle = ref<VocabArticle | null>(null)
const selectedCategory = ref<string | null>(null)
const sidebarOpen = ref(false)
const showGenerateConfirm = ref(false)

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

const tokenEstimate = computed(() => {
  const range = store.vocabArticleRange.split('-').map(Number)
  const numArticles = range.length === 2 ? range[1] : 9
  const wc = store.vocabWordCount
  // 估算：固定 prompt ~600 token + 输出（文章 × 字数 × 6 倍系数 ÷ 1.5 中文字符/token）
  const promptTokens = 600
  const outputTokens = Math.round(numArticles * wc * 6 / 1.5)
  const total = promptTokens + outputTokens
  return { total, outputTokens, numArticles, wc }
})

function confirmGenerate() {
  showGenerateConfirm.value = true
}

function doGenerate() {
  showGenerateConfirm.value = false
  store.generateWeeklyJournal()
}

const categories = computed(() => {
  if (!store.vocabJournal) return []
  const cats = new Set(store.vocabJournal.articles.map((a) => a.category))
  return Array.from(cats)
})

const allArticles = computed(() => {
  if (!store.vocabJournal?.articles.length) return []
  if (!selectedCategory.value) return store.vocabJournal.articles
  return store.vocabJournal.articles.filter((a) => a.category === selectedCategory.value)
})

const difficultyLabel = (d: string) => ({
  beginner: '初级', intermediate: '中级', advanced: '高级',
}[d] || d)

function openArticle(a: VocabArticle) {
  selectedArticle.value = a
  store.recordLearningEvent('vocab_article', store.targetLang, a.title)
}

function closeDetail() {
  selectedArticle.value = null
  store.dismissVocabTranslation()
}

// 划词翻译：使用 document-level mouseup 确保可靠触发
function onDocumentMouseUp(e: MouseEvent) {
  if (!selectedArticle.value) return // 只在详情页中生效
  const target = e.target as HTMLElement
  if (!target.closest('.detail-scroll')) return
  // 延迟一帧确保 selection 已完成
  requestAnimationFrame(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) {
      store.dismissVocabTranslation()
      return
    }
    const text = sel.toString().trim()
    if (text) store.translateVocabWord(text)
  })
}

onMounted(() => {
  document.addEventListener('mouseup', onDocumentMouseUp)
})
onUnmounted(() => {
  document.removeEventListener('mouseup', onDocumentMouseUp)
})

function handleSelectText() {
  // fallback for @mouseup on element - kept for compatibility
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) { store.dismissVocabTranslation(); return }
  const text = sel.toString().trim()
  if (text) store.translateVocabWord(text)
}

function speakArticleContent() {
  if (!selectedArticle.value) return
  store.speakText(selectedArticle.value.content, store.targetLang)
}

function speakVocabWord() {
  if (!store.vocabSelectedText) return
  store.speakText(store.vocabSelectedText, store.targetLang)
}

function speakKeyword(word: string) {
  store.speakText(word, store.targetLang)
}
</script>

<template>
  <div class="vocab-view">
    <template v-if="!selectedArticle">
      <div class="vocab-layout">
        <aside class="vocab-sidebar" :class="{ collapsed: !sidebarOpen }">
          <div class="sidebar-header">
            <span class="sidebar-title">📰 历史期刊</span>
            <button class="sidebar-close-btn" @click="toggleSidebar" title="收起侧栏">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="sidebar-list">
            <div
              v-for="j in store.vocabJournals"
              :key="j.id"
              class="sidebar-item"
              :class="{ active: store.vocabJournal?.id === j.id }"
              @click="store.loadVocabJournal(j.id); selectedCategory = null; sidebarOpen = false;"
            >
              <div class="sidebar-item-top">
                <span class="sidebar-item-date">{{ j.date }}</span>
                <span class="sidebar-item-count">{{ j.articles.length }} 篇</span>
              </div>
              <div class="sidebar-item-lang">{{ store.getLangLabel(j.targetLang) }}</div>
            </div>
            <div v-if="store.vocabJournals.length === 0" class="sidebar-empty">
              暂无历史期刊
            </div>
          </div>
        </aside>
        <div class="vocab-main">
      <!-- 顶栏 -->
      <div class="vocab-bar">
        <div class="vocab-bar-left">
          <button class="sidebar-toggle" :class="{ collapsed: !sidebarOpen }" @click="toggleSidebar" :title="sidebarOpen ? '收起侧栏' : '展开侧栏'">
            <svg v-if="sidebarOpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" stroke-linecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" stroke-linecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
            <span v-if="!sidebarOpen" class="toggle-label">历史</span>
          </button>
          <span class="vocab-status-dot" :class="{ active: store.vocabLoading }" />
          <span class="vocab-status-text">
            <template v-if="store.vocabLoading">更新中...</template>
            <template v-else-if="store.vocabJournal">📰 {{ store.vocabJournal.date }} 期刊</template>
            <template v-else>📰 词汇训练</template>
          </span>
        </div>
        <div class="vocab-bar-right">
          <button class="vocab-tool-btn" :disabled="store.vocabAssessing" @click="store.assessVocabLevel()">
            {{ store.vocabAssessing ? '⏳' : '📊' }} 评估
          </button>
          <button class="vocab-tool-btn primary" :disabled="store.vocabLoading" @click="confirmGenerate()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            更新期刊
          </button>
        </div>
      </div>

      <!-- 水平 -->
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

      <!-- 错误提示 -->
      <div v-if="store.vocabGenerateError && !store.vocabLoading" class="error-banner">
        <span class="error-icon">⚠️</span>
        <span class="error-msg">{{ store.vocabGenerateError }}</span>
        <button class="error-dismiss" @click="store.vocabGenerateError = ''">✕</button>
      </div>

      <!-- 空 -->
      <div v-if="!store.vocabJournal && !store.vocabLoading" class="empty">
        <div class="empty-icon-wrap"><span class="empty-icon">📰</span></div>
        <p class="empty-title">本周期刊尚未更新</p>
        <p class="empty-hint">点击「更新」，AI 将为你精选多篇多主题词汇训练文章</p>
        <button class="empty-btn" @click="confirmGenerate()">📰 更新期刊</button>
      </div>

      <!-- 加载进度 -->
      <div v-if="store.vocabLoading" class="loading">
        <div class="progress-container">
          <div class="progress-bar-track">
            <div class="progress-bar-fill" :style="{ width: store.vocabGeneratingProgress + '%' }"></div>
          </div>
          <div class="progress-info">
            <span class="progress-pct">{{ store.vocabGeneratingProgress }}%</span>
            <span class="progress-status">{{ store.vocabGeneratingStatus }}</span>
          </div>
        </div>
        <p class="loading-sub">每篇约 {{ store.vocabWordCount }} 词 · {{ store.vocabArticleRange }} 篇文章</p>
      </div>

      <!-- 期刊首页 -->
      <div v-if="store.vocabJournal && !store.vocabLoading" class="home">
        <!-- 刊头 -->
        <div class="masthead">
          <div class="masthead-top">
            <span class="masthead-badge">本周精选</span>
            <span class="masthead-issue">{{ store.vocabJournal.date }}</span>
          </div>
          <h1 class="masthead-title">{{ store.getLangLabel(store.vocabJournal.targetLang) }} 词汇期刊</h1>
          <p class="masthead-desc">{{ store.vocabJournal.articles.length }} 篇 · 适配 {{ store.languageProficiencies[store.targetLang] ? store.getProficiencyLabel(store.languageProficiencies[store.targetLang]) : store.vocabUserLevel }}</p>
        </div>

        <!-- 分类栏 -->
        <div class="cat-strip">
          <button class="cat-chip" :class="{ active: selectedCategory === null }" @click="selectedCategory = null">全部</button>
          <button v-for="cat in categories" :key="cat" class="cat-chip" :class="{ active: selectedCategory === cat }" @click="selectedCategory = cat">{{ cat }}</button>
        </div>

        <!-- 卡片网格 -->
        <div class="card-grid">
          <div
            v-for="a in allArticles"
            :key="a.id"
            class="card"
            @click="openArticle(a)"
          >
            <div class="card-img" :style="{ backgroundImage: `url(${a.imageUrl})` }">
              <div class="card-diff" :class="a.difficulty">{{ difficultyLabel(a.difficulty) }}</div>
            </div>
            <div class="card-body">
              <div class="card-cat" :class="a.category">{{ a.category }}</div>
              <h3 class="card-title">{{ a.title }}</h3>
              <p class="card-summary">{{ a.summary }}</p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
    </template>

    <!-- ====== 详情页 ====== -->
    <template v-else>
      <div class="detail">
        <!-- 顶栏 -->
        <div class="detail-bar">
          <button class="detail-back" @click="closeDetail">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="22" height="22" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>返回</span>
          </button>
          <span class="detail-cat">{{ selectedArticle.category }}</span>
        </div>

        <div class="detail-scroll">
          <!-- 图片 -->
          <div class="detail-img" :style="{ backgroundImage: `url(${selectedArticle.imageUrl})` }" />

          <!-- 标题 -->
          <h1 class="detail-title">{{ selectedArticle.title }}</h1>

          <!-- 原文 -->
          <section class="detail-section">
            <h4 class="detail-section-label">
              <span>📝 原文</span>
              <button
                class="tts-btn"
                :class="{ active: store.speakingTarget === selectedArticle.content }"
                title="朗读原文"
                @click="speakArticleContent"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              </button>
            </h4>
            <div class="detail-block" @mouseup="handleSelectText">
              {{ selectedArticle.content }}
            </div>
          </section>

          <!-- 翻译 -->
          <section class="detail-section">
            <h4 class="detail-section-label">🌐 翻译</h4>
            <div class="detail-block trans" @mouseup="handleSelectText">
              {{ selectedArticle.translation }}
            </div>
          </section>

          <!-- 关键词 -->
          <section class="detail-section">
            <h4 class="detail-section-label">📌 关键词汇</h4>
            <div class="kw-list">
              <div v-for="kw in selectedArticle.keyWords" :key="kw.word" class="kw-card">
                <div class="kw-head">
                  <span class="kw-word" @click="store.translateVocabWord(kw.word)">{{ kw.word }}</span>
                  <span class="kw-trans">{{ kw.translation }}</span>
                  <button
                    class="kw-tts"
                    :class="{ active: store.speakingTarget === kw.word }"
                    title="朗读"
                    @click="speakKeyword(kw.word)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                    </svg>
                  </button>
                </div>
                <p class="kw-example">{{ kw.sentence }}</p>
                <p class="kw-example-trans">{{ kw.sentenceTranslation }}</p>
              </div>
            </div>
          </section>

          <div class="detail-bottom" />
        </div>
      </div>
    </template>

    <!-- 划词弹窗 -->
    <Transition name="fade">
      <div v-if="store.vocabSelectedText" class="popup-overlay" @click="store.dismissVocabTranslation()">
        <div class="popup" @click.stop>
          <div class="popup-head">
            <span class="popup-word">{{ store.vocabSelectedText }}</span>
            <div class="popup-head-actions">
              <button
                class="popup-tts-btn"
                :class="{ active: store.speakingTarget === store.vocabSelectedText }"
                title="朗读"
                @click="speakVocabWord"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              </button>
              <button class="popup-x" @click="store.dismissVocabTranslation()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <p v-if="store.vocabTranslating" class="popup-loading">翻译中...</p>
          <p v-else class="popup-text">{{ store.vocabSelectedTranslation }}</p>
        </div>
      </div>
    </Transition>

    <!-- 生成确认对话框 -->
    <Transition name="fade">
      <div v-if="showGenerateConfirm" class="confirm-overlay" @click.self="showGenerateConfirm = false">
        <div class="confirm-dialog">
          <h3 class="confirm-title">确认更新期刊</h3>
          <div class="confirm-body">
            <div class="confirm-row">
              <span class="confirm-label">文章篇数</span>
              <span class="confirm-value">{{ tokenEstimate.numArticles }} 篇</span>
            </div>
            <div class="confirm-row">
              <span class="confirm-label">每篇字数</span>
              <span class="confirm-value">{{ tokenEstimate.wc }} 词</span>
            </div>
            <div class="confirm-row highlight">
              <span class="confirm-label">预估消耗</span>
              <span class="confirm-value">{{ tokenEstimate.total.toLocaleString() }} tokens</span>
            </div>
            <p class="confirm-hint">DeepSeek 模型按 tokens 计费，输出约 ¥2/百万 tokens</p>
            <p class="confirm-cost">预估费用 ≈ ¥{{ ((tokenEstimate.total / 1000000) * 2).toFixed(4) }}</p>
          </div>
          <div class="confirm-actions">
            <button class="confirm-cancel" @click="showGenerateConfirm = false">取消</button>
            <button class="confirm-ok" @click="doGenerate">确认生成</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.vocab-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-app-region: no-drag;
  position: relative;
}

/* ===== 侧边栏布局 ===== */
.vocab-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.vocab-sidebar {
  width: 180px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 0.5px solid var(--border);
  background: var(--bg-secondary);
  overflow: hidden;
  transition: width .25s ease, opacity .2s ease;
  white-space: nowrap;
}

.vocab-sidebar.collapsed {
  width: 0;
  border-right: none;
  opacity: 0;
  pointer-events: none;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.sidebar-close-btn {
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); flex-shrink: 0;
  transition: all .2s;
}
.sidebar-close-btn:hover { background: var(--bg-hover); color: var(--accent); }
.sidebar-close-btn:disabled { opacity: .4; cursor: not-allowed; }

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-item {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all .2s;
}

.sidebar-item:hover {
  background: var(--bg-hover);
}

.sidebar-item.active {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
}

.sidebar-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-item-date {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-item-count {
  font-size: 10px;
  color: var(--text-muted);
}

.sidebar-item-lang {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.sidebar-empty {
  text-align: center;
  padding: 24px 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.vocab-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== 顶栏 ===== */
.vocab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
}

.vocab-bar-left { display: flex; align-items: center; gap: 4px; }

.sidebar-toggle {
  width: 36px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); flex-shrink: 0; gap: 3px;
  transition: all .2s; background: var(--bg-card);
  border: 0.5px solid var(--border); padding: 0 8px;
}
.sidebar-toggle:hover { background: var(--bg-hover); color: var(--accent); border-color: var(--accent); }
.sidebar-toggle.collapsed {
  width: auto; background: var(--bg-secondary);
  border-color: var(--border); padding: 0 10px;
}
.sidebar-toggle.collapsed:hover {
  background: rgba(29,155,240,.08); border-color: var(--accent); color: var(--accent);
}
.toggle-label {
  font-size: 11px; font-weight: 600;
}

.vocab-status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--text-muted); transition: all 0.3s;
}
.vocab-status-dot.active { background: var(--accent); animation: pulse 1s ease infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

.vocab-status-text { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.vocab-bar-right { display: flex; align-items: center; gap: 6px; }

.vocab-tool-btn {
  display: flex; align-items: center; gap: 4px; padding: 7px 12px;
  border-radius: 8px; font-size: 12px; font-weight: 600;
  color: var(--text-secondary); background: var(--bg-card);
  border: 0.5px solid var(--border); transition: all .2s;
}
.vocab-tool-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--accent); color: var(--accent); }
.vocab-tool-btn.primary { background: var(--accent); color: white; border-color: var(--accent); }
.vocab-tool-btn.primary:hover:not(:disabled) { opacity: .9; }
.vocab-tool-btn:disabled { opacity: .4; cursor: not-allowed; }

/* 水平 */
.level-badge {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 6px 16px; background: var(--bg-surface);
  border-bottom: 0.5px solid var(--border); flex-shrink: 0; flex-wrap: wrap;
}
.level-label { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
.level-dot { color: var(--border); font-size: 12px; }
.level-assessing { font-size: 11px; color: var(--accent); font-weight: 600; animation: pulse 1s ease infinite; }

/* 空 */
.empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 48px 24px;
}
.empty-icon-wrap {
  width: 72px; height: 72px; border-radius: 18px;
  background: var(--bg-card); border: 0.5px solid var(--border);
  display: flex; align-items: center; justify-content: center;
}
.empty-icon { font-size: 36px; }
.empty-title { font-size: 17px; font-weight: 700; color: var(--text-primary); }
.empty-hint { font-size: 13px; color: var(--text-muted); text-align: center; max-width: 280px; line-height: 1.5; }
.empty-btn {
  display: flex; align-items: center; gap: 6px; padding: 10px 20px;
  border-radius: 10px; background: var(--accent); color: white;
  font-size: 14px; font-weight: 600; transition: opacity .2s; margin-top: 8px;
}
.empty-btn:hover { opacity: .9; }

/* 加载 */
.loading {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; color: var(--text-muted); font-size: 14px;
}
.loading-sub { font-size: 12px; opacity: .6; }

/* ===== 进度条 ===== */
.progress-container {
  width: 280px; display: flex; flex-direction: column; gap: 6px;
}
.progress-bar-track {
  width: 100%; height: 6px; border-radius: 3px;
  background: var(--bg-secondary); overflow: hidden;
}
.progress-bar-fill {
  height: 100%; border-radius: 3px;
  background: linear-gradient(90deg, var(--accent), #6366f1);
  transition: width .3s ease;
}
.progress-info {
  display: flex; align-items: center; justify-content: space-between;
}
.progress-pct {
  font-size: 13px; font-weight: 700; color: var(--accent);
}
.progress-status {
  font-size: 11px; color: var(--text-muted);
}

/* ===== 错误提示 ===== */
.error-banner {
  display: flex; align-items: center; gap: 8px;
  margin: 8px 16px 0; padding: 10px 12px;
  border-radius: 10px;
  background: rgba(224,36,94,.1);
  border: 0.5px solid rgba(224,36,94,.25);
  flex-shrink: 0;
}
.error-icon { font-size: 14px; flex-shrink: 0; }
.error-msg { flex: 1; font-size: 12px; color: #e0245e; line-height: 1.4; }
.error-dismiss {
  width: 22px; height: 22px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: rgba(224,36,94,.5); flex-shrink: 0;
}
.error-dismiss:hover { background: rgba(224,36,94,.1); color: #e0245e; }

/* ==============================
   主页
   ============================== */
.home {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
}

/* 刊头 */
.masthead {
  padding: 16px 16px 10px; flex-shrink: 0;
}
.masthead-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.masthead-badge {
  padding: 2px 10px; border-radius: 4px;
  background: var(--accent); color: white;
  font-size: 11px; font-weight: 700; letter-spacing: .5px;
}
.masthead-issue { font-size: 12px; color: var(--text-muted); font-weight: 500; }
.masthead-title { font-size: 22px; font-weight: 800; color: var(--text-primary); line-height: 1.2; margin-bottom: 4px; }
.masthead-desc { font-size: 12px; color: var(--text-muted); }

/* 分类栏 */
.cat-strip {
  display: flex; gap: 6px; padding: 0 16px 10px;
  overflow-x: auto; flex-shrink: 0; scrollbar-width: none;
}
.cat-strip::-webkit-scrollbar { display: none; }
.cat-chip {
  flex-shrink: 0; padding: 5px 12px; border-radius: 999px;
  font-size: 12px; font-weight: 600; color: var(--text-secondary);
  background: var(--bg-card); border: 0.5px solid var(--border); transition: all .2s;
}
.cat-chip:hover { background: var(--bg-hover); color: var(--text-primary); }
.cat-chip.active { background: rgba(29,155,240,.12); border-color: var(--accent); color: var(--accent); }

/* 卡片网格 — 瀑布流 */
.card-grid {
  flex: 1; overflow-y: auto;
  padding: 0 16px 24px;
  column-count: 2; column-gap: 12px;
}

.card {
  break-inside: avoid; margin-bottom: 12px;
  background: var(--bg-card); border: 0.5px solid var(--border);
  border-radius: 14px; overflow: hidden; cursor: pointer;
  transition: border-color .2s, transform .15s;
}
.card:hover { border-color: var(--accent); transform: translateY(-2px); }

.card-img {
  position: relative; width: 100%; min-height: 100px;
  background-size: cover; background-position: center; background-repeat: no-repeat;
}

.card-diff {
  position: absolute; top: 8px; right: 8px;
  padding: 2px 8px; border-radius: 6px;
  font-size: 10px; font-weight: 700; backdrop-filter: blur(6px);
}
.card-diff.beginner { background: rgba(0,200,83,.85); color: #000; }
.card-diff.intermediate { background: rgba(245,166,35,.85); color: #000; }
.card-diff.advanced { background: rgba(29,155,240,.85); color: #fff; }

.card-body { padding: 10px 12px 12px; }

.card-cat {
  display: inline-block; padding: 1px 8px; border-radius: 4px;
  font-size: 10px; font-weight: 700; margin-bottom: 4px;
}
.card-cat.时政, .card-cat.新闻, .card-cat.体育 { background: rgba(224,36,94,.15); color: #e0245e; }
.card-cat.美食, .card-cat.文化, .card-cat.财经, .card-cat.商业, .card-cat.娱乐 { background: rgba(245,166,35,.15); color: #f5a623; }
.card-cat.生活, .card-cat.健康 { background: rgba(0,200,83,.15); color: #00ba7c; }
.card-cat.科技, .card-cat.创新, .card-cat.教育, .card-cat.学习 { background: rgba(29,155,240,.15); color: #1d9bf0; }
.card-cat.旅游, .card-cat.地理 { background: rgba(121,75,196,.15); color: #794bc4; }

.card-title {
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  line-height: 1.3; margin-bottom: 4px; display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.card-summary {
  font-size: 12px; color: var(--text-secondary); line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* ==============================
   详情页
   ============================== */
.detail {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
  animation: fadeIn .2s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.detail-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
}
.detail-back {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 8px;
  font-size: 14px; font-weight: 600; color: var(--accent);
  transition: background .2s;
}
.detail-back:hover { background: rgba(29,155,240,.1); }
.detail-cat { font-size: 12px; font-weight: 600; color: var(--text-muted); }

.detail-img {
  width: 100%; height: 200px; flex-shrink: 0;
  background-size: cover; background-position: center;
}

.detail-scroll {
  flex: 1; overflow-y: auto; padding: 16px 16px 40px;
  display: flex; flex-direction: column; gap: 20px;
}

.detail-title {
  font-size: 22px; font-weight: 800; color: var(--text-primary);
  line-height: 1.3;
}

.detail-section { display: flex; flex-direction: column; gap: 8px; }
.detail-section-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: .3px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tts-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: transparent;
  border: none;
  transition: all .2s;
  cursor: pointer;
}

.tts-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
}

.tts-btn.active {
  color: var(--accent);
  background: rgba(29,155,240,.1);
  animation: ttsPulse 1s ease infinite;
}

@keyframes ttsPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.detail-block {
  padding: 12px 14px; border-radius: 10px;
  font-size: 14px; line-height: 1.7; color: var(--text-primary);
  background: var(--bg-primary); border: 0.5px solid var(--border);
  user-select: text; white-space: pre-wrap;
}
.detail-block.trans {
  background: rgba(29,155,240,.05);
  border: 0.5px solid rgba(29,155,240,.15);
  color: var(--text-secondary);
  font-size: 13px; line-height: 1.6;
}

/* 关键词 */
.kw-list { display: flex; flex-direction: column; gap: 10px; }
.kw-card {
  padding: 10px 12px; border-radius: 10px;
  background: var(--bg-primary); border: 0.5px solid var(--border);
  display: flex; flex-direction: column; gap: 4px;
}
.kw-head { display: flex; align-items: center; gap: 8px; }
.kw-word {
  font-size: 14px; font-weight: 700; color: var(--accent);
  cursor: pointer; padding: 2px 4px; border-radius: 4px;
  transition: background .2s;
}
.kw-word:hover { background: rgba(29,155,240,.1); }
.kw-trans { font-size: 13px; color: var(--text-secondary); }
.kw-tts {
  width: 24px; height: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); background: none; border: none;
  cursor: pointer; transition: all .2s; margin-left: auto; flex-shrink: 0;
}
.kw-tts:hover { background: var(--bg-hover); color: var(--accent); }
.kw-tts.active { color: var(--accent); background: rgba(29,155,240,.1); animation: ttsPulse 1s ease infinite; }
.kw-example { font-size: 13px; color: var(--text-primary); line-height: 1.5; }
.kw-example-trans { font-size: 12px; color: var(--text-muted); }

.detail-bottom { height: 8px; }

/* ===== 划词弹窗 ===== */
.popup-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.45);
  z-index: 200; display: flex; align-items: center; justify-content: center;
  animation: fadeIn .15s ease;
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

.popup-head-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.popup-tts-btn {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); transition: all .2s;
  background: none; border: none; cursor: pointer;
}

.popup-tts-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
}

.popup-tts-btn.active {
  color: var(--accent);
  background: rgba(29,155,240,.1);
  animation: ttsPulse 1s ease infinite;
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

/* 过渡 */
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ===== 生成确认对话框 ===== */
.confirm-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,.45); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  -webkit-app-region: no-drag;
}

.confirm-dialog {
  width: 320px; background: var(--bg-primary);
  border: 0.5px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 8px 32px rgba(0,0,0,.25);
  overflow: hidden;
}

.confirm-title {
  font-size: 16px; font-weight: 700; color: var(--text-primary);
  padding: 16px 18px 0;
}

.confirm-body {
  padding: 14px 18px; display: flex; flex-direction: column; gap: 8px;
}

.confirm-row {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13px; padding: 4px 0;
}

.confirm-row.highlight {
  background: var(--bg-secondary); margin: 0 -8px; padding: 8px;
  border-radius: 8px; border: 0.5px solid var(--border);
}

.confirm-label { color: var(--text-secondary); }
.confirm-value { font-weight: 600; color: var(--text-primary); }
.confirm-row.highlight .confirm-value { color: var(--accent); font-size: 15px; }

.confirm-hint { font-size: 11px; color: var(--text-muted); line-height: 1.4; margin-top: 4px; }
.confirm-cost { font-size: 11px; color: var(--text-secondary); font-weight: 500; }

.confirm-actions {
  display: flex; gap: 8px; padding: 0 18px 16px;
}

.confirm-cancel, .confirm-ok {
  flex: 1; padding: 9px 0; border-radius: 8px;
  font-size: 13px; font-weight: 600; transition: all .2s;
}

.confirm-cancel {
  background: var(--bg-secondary); color: var(--text-secondary);
  border: 0.5px solid var(--border);
}

.confirm-cancel:hover { background: var(--bg-hover); }

.confirm-ok {
  background: var(--accent); color: white; border: none;
}

.confirm-ok:hover { opacity: .9; }
</style>
