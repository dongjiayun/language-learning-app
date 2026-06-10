<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/appStore'

const store = useAppStore()

const searchQuery = ref('')

type DateLabel = '今天' | '昨天' | '本周' | '更早'
const GROUP_ORDER: DateLabel[] = ['今天', '昨天', '本周', '更早']

function getDateLabel(date: Date): DateLabel {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  const dayOfWeek = today.getDay()
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(today.getTime() - mondayOffset * 86400000)
  if (d.getTime() >= monday.getTime()) return '本周'
  return '更早'
}

const filtered = computed(() => {
  let list = store.vocabBook
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(e =>
      e.word.toLowerCase().includes(q) || e.translation.toLowerCase().includes(q)
    )
  }
  // Date-grouped
  const groups = new Map<DateLabel, typeof list>()
  for (const label of GROUP_ORDER) groups.set(label, [])
  for (const entry of list) {
    const label = getDateLabel(new Date(entry.addedAt))
    groups.get(label)!.push(entry)
  }
  return GROUP_ORDER.filter(label => groups.get(label)!.length > 0).map(label => ({
    label,
    items: groups.get(label)!,
  }))
})

const statsText = computed(() => {
  const total = store.vocabBook.length
  const langs = new Set(store.vocabBook.map(e => e.sourceLang)).size
  return `${total} 词 · ${langs} 语种`
})

function formatDate(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dateGroupId(label: DateLabel) {
  return `vb-group-${label}`
}

function handleClearAll() {
  if (confirm('确定清空全部生词？')) {
    store.vocabBook = []
    localStorage.setItem('doulingo_vocab_book', '[]')
  }
}
</script>

<template>
  <Transition name="slide-up">
    <div v-if="store.showVocabBook" class="vocabbook-overlay" @click.self="store.toggleVocabBook()">
      <div class="vocabbook-panel">
        <!-- 顶栏 -->
        <div class="vb-header">
          <span class="vb-title">📖 生词本</span>
          <span class="vb-stats">{{ statsText }}</span>
          <button class="vb-close" @click="store.toggleVocabBook()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- 搜索 -->
        <div class="vb-search-wrap">
          <svg class="vb-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            v-model="searchQuery"
            class="vb-search"
            placeholder="搜索生词..."
          />
        </div>

        <!-- 列表 -->
        <div class="vb-list">
          <template v-for="group in filtered" :key="dateGroupId(group.label)">
            <div class="vb-date-header">{{ group.label }}</div>
            <div
              v-for="entry in group.items"
              :key="entry.id"
              class="vb-item"
            >
              <div class="vb-item-main">
                <span class="vb-word">{{ entry.word }}</span>
                <span class="vb-translation">{{ entry.translation }}</span>
              </div>
              <div class="vb-item-meta">
                <span class="vb-lang">{{ store.getLangLabel(entry.sourceLang) }}</span>
                <span class="vb-time">{{ formatDate(entry.addedAt) }}</span>
                <button
                  class="vb-del"
                  title="删除"
                  @click="store.removeVocabWord(entry.id)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" stroke-linecap="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </template>
          <div v-if="filtered.length === 0 || filtered.every(g => g.items.length === 0)" class="vb-empty">
            <p v-if="searchQuery">未找到匹配的生词</p>
            <p v-else>还没有生词<br/>划词翻译后可加入生词本</p>
          </div>
        </div>

        <!-- 底部固定按钮 -->
        <div class="vb-footer">
          <button class="vb-clear-btn" @click="handleClearAll">清空全部</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.vocabbook-overlay {
  position: fixed; inset: 0; z-index: 250;
  display: flex; align-items: flex-start; justify-content: flex-start;
  pointer-events: none;
}
.vocabbook-panel {
  pointer-events: auto;
  width: 320px; max-height: 70vh;
  background: var(--bg-primary);
  border: 0.5px solid var(--border);
  border-radius: 0 0 var(--radius) 0;
  box-shadow: 0 4px 20px rgba(0,0,0,.2);
  display: flex; flex-direction: column;
  margin-top: 56px; /* 在顶栏下方 */
}

.vb-header {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 16px 10px; flex-shrink: 0;
}
.vb-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.vb-stats { font-size: 11px; color: var(--text-muted); flex: 1; }
.vb-close {
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); flex-shrink: 0;
}
.vb-close:hover { background: var(--bg-hover); color: var(--text-primary); }

.vb-search-wrap {
  position: relative; padding: 0 16px 10px; flex-shrink: 0;
}
.vb-search-icon {
  position: absolute; left: 24px; top: 50%; transform: translateY(-50%);
  color: var(--text-muted); pointer-events: none;
}
.vb-search {
  width: 100%; padding: 7px 10px 7px 28px;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary); border: 0.5px solid var(--border);
  color: var(--text-primary); font-size: 12px; outline: none;
}
.vb-search:focus { border-color: var(--accent); }

.vb-list {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: 1px;
  padding: 0 0 8px;
}

.vb-date-header {
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  padding: 10px 16px 4px; letter-spacing: .3px;
}

.vb-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; transition: background .15s;
}
.vb-item:hover { background: var(--bg-hover); }
.vb-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.vb-word { font-size: 14px; font-weight: 600; color: var(--accent); }
.vb-translation { font-size: 12px; color: var(--text-secondary); }
.vb-item-meta {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}
.vb-lang {
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: var(--bg-secondary); color: var(--text-muted);
}
.vb-time { font-size: 10px; color: var(--text-muted); }
.vb-del {
  width: 24px; height: 24px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); opacity: 0;
  transition: opacity .15s;
}
.vb-item:hover .vb-del { opacity: 1; }
.vb-del:hover { background: rgba(224,36,94,.1); color: #e0245e; }
.vb-empty { padding: 24px 16px; text-align: center; font-size: 12px; color: var(--text-muted); line-height: 1.6; }

.vb-footer {
  padding: 8px 16px 12px; flex-shrink: 0; border-top: 0.5px solid var(--border);
}
.vb-clear-btn {
  width: 100%; padding: 6px 0; border-radius: 8px;
  font-size: 12px; color: var(--text-muted);
  background: var(--bg-secondary); border: 0.5px solid var(--border);
  transition: all .15s;
}
.vb-clear-btn:hover { color: #e0245e; border-color: rgba(224,36,94,.3); background: rgba(224,36,94,.05); }

/* 过渡 */
.slide-up-enter-active, .slide-up-leave-active { transition: all .25s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateX(-100%); opacity: 0; }

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

  .vb-stats {
    padding: 8px 14px;
    font-size: 11px;
  }

  .vb-entry {
    padding: 8px 14px;
  }

  .vb-word {
    font-size: 13px;
  }

  .vb-trans {
    font-size: 11px;
  }

  .vb-date {
    font-size: 10px;
  }

  .search-input {
    padding: 8px 12px;
    font-size: 13px;
  }
}
</style>
