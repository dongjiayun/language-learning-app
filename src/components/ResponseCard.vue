<script setup lang="ts">
import { computed } from 'vue'
import type { FrenchResponseItem } from '@/types'
import { useAppStore } from '@/stores/appStore'

const props = defineProps<{ response: FrenchResponseItem }>()
const store = useAppStore()
const playing = computed(() => store.speakingId === props.response.id && store.isSpeaking)

function handleSelectText(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.text')) return
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) { store.dismissVocabTranslation(); return }
  const text = sel.toString().trim()
  if (text) store.translateVocabWord(text)
}
</script>

<template>
  <div class="card">
    <p class="text" @mouseup="handleSelectText">{{ response.french }}</p>
    <p class="trans">{{ response.translation }}</p>
    <div class="action">
      <button class="btn" :class="{ playing }" @click="store.speakFrench(response)">
        <svg v-if="!playing" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
        </svg>
        <span>{{ playing ? '停止' : '朗读' }}</span>
      </button>
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
.card {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.text {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
  padding: 14px 16px 6px;
  user-select: text;
}

.trans {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
  padding: 0 16px 10px;
}

.action {
  display: flex;
  padding: 6px 16px;
  border-top: 0.5px solid var(--border);
}

.btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn.playing {
  background: var(--accent);
  color: white;
}

.popup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.popup {
  width: 300px;
  max-width: 85vw;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  animation: scaleIn .2s cubic-bezier(.16,1,.3,1);
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(.9); }
  to { opacity: 1; transform: scale(1); }
}

.popup-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
}
.popup-head-actions { display: flex; align-items: center; gap: 4px; }

.popup-word {
  font-size: 15px;
  font-weight: 700;
  color: var(--accent);
}

.popup-x {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); transition: background .2s;
}

.popup-x:hover { background: var(--bg-hover); }

.popup-loading, .popup-text {
  padding: 14px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
}

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
  .card {
    padding: 12px;
  }

  .text {
    font-size: 14px;
  }

  .trans {
    font-size: 12px;
  }
}
</style>
