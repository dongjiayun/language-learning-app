<script setup lang="ts">
import { useAppStore } from '@/stores/appStore'

const store = useAppStore()

function handleClick() {
  if (store.state === 'idle') store.startMonitoring()
  else if (store.state === 'recording') store.stopMonitoring()
}

const isActive = () => store.state === 'recording'
const isDisabled = () => store.state !== 'idle' && store.state !== 'recording'
</script>

<template>
  <div class="wrap">
    <button
      class="mic"
      :class="{ active: isActive(), disabled: isDisabled() }"
      :disabled="isDisabled()"
      @click="handleClick"
    >
      <svg v-if="!isActive()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="6" width="12" height="12" rx="2"/>
      </svg>
    </button>
    <p class="label">{{ isActive() ? '录制中' : '录音' }}</p>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.mic {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.25s;
}

.mic:not(.disabled):hover {
  background: var(--bg-hover);
  border-color: var(--accent);
}

.mic.active {
  background: var(--danger);
  border-color: var(--danger);
  color: white;
}

.mic.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}
</style>
