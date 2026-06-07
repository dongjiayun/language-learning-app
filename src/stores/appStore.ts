import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import type { AppState, AppMode, FrenchResponseItem, ConversationRecord, ChatMessage, ChatSession, PracticeMessage, PracticeRecord, VocabJournal, VocabJournalRecord, LanguageProficiency, VocabProficiencyLevel, LearningEvent, LanguageProgress, DailyStats, VocabEntry, TrainingSession, TrainingQuestion, WritingTopic, WritingSession, WritingHint, WritingEvaluation } from '@/types'
import { STORAGE_KEY_LEARNING_EVENTS, STORAGE_KEY_TRAINING_SESSION, STORAGE_KEY_TRAINING_HISTORY, STORAGE_KEY_WRITING_SESSION, STORAGE_KEY_WRITING_HISTORY } from '@/types'
import { FrenchResponseService } from '@/services/FrenchResponseService'
import { ChatService } from '@/services/ChatService'
import { VocabTrainingService } from '@/services/VocabTrainingService'
import { TextToSpeechService } from '@/services/TextToSpeechService'
import { SpeechRecognitionService } from '@/services/SpeechRecognitionService'

const STORAGE_KEY_API = 'doulingo_deepseek_api_key'
const STORAGE_KEY_SOURCE_LANG = 'doulingo_source_lang'
const STORAGE_KEY_TARGET_LANG = 'doulingo_target_lang'
const STORAGE_KEY_ANNOTATE_LANG = 'doulingo_annotate_lang'
const STORAGE_KEY_CONVERSATIONS = 'doulingo_conversations'
const STORAGE_KEY_CHAT_SESSIONS = 'doulingo_chat_sessions'
const STORAGE_KEY_PRACTICE = 'doulingo_practice_sessions'
const STORAGE_KEY_VOCAB_JOURNAL = 'doulingo_vocab_journal'
const STORAGE_KEY_VOCAB_RECORDS = 'doulingo_vocab_records'
const STORAGE_KEY_NATIVE_LANG = 'doulingo_native_lang'
const STORAGE_KEY_LANG_PROFICIENCY = 'doulingo_lang_proficiency'
const STORAGE_KEY_THEME = 'doulingo_theme'
const STORAGE_KEY_VOCAB_WORD_COUNT = 'doulingo_vocab_word_count'
const STORAGE_KEY_VOCAB_ARTICLE_RANGE = 'doulingo_vocab_article_range'
const STORAGE_KEY_VOCAB_JOURNALS = 'doulingo_vocab_journals'
const STORAGE_KEY_VOCAB_BOOK = 'doulingo_vocab_book'
const STORAGE_KEY_TOKEN_USAGE = 'doulingo_token_usage'

// DeepSeek 计费（参考：https://api-docs.deepseek.com/zh-cn/quick_start/pricing/）
// deepseek-v4-flash（deepseek-chat 映射至此）：
//   - 输入（缓存未命中）：¥1/百万 tokens
//   - 输入（缓存命中）：¥0.02/百万 tokens
//   - 输出：¥2/百万 tokens
// 这里按缓存未命中（最坏情况）估算
const DEEPSEEK_PRICE_INPUT = 1       // ¥1/百万 input tokens
const DEEPSEEK_PRICE_OUTPUT = 2      // ¥2/百万 output tokens

export const useAppStore = defineStore('app', () => {
  const state = ref<AppState>('idle')
  const responses = ref<FrenchResponseItem[]>([])
  const lastHeardText = ref('')
  const recognizedText = ref('')
  const isSpeaking = ref(false)
  const speakingId = ref<string | null>(null)
  const speakingTarget = ref<string>('')
  const showSettings = ref(false)
  const showHistory = ref(false)
  const showProgress = ref(false)
  const recognitionError = ref('')

  const sourceLang = ref(localStorage.getItem(STORAGE_KEY_SOURCE_LANG) || 'zh-CN')
  const targetLang = ref(localStorage.getItem(STORAGE_KEY_TARGET_LANG) || 'fr-FR')
  const annotateLang = ref(localStorage.getItem(STORAGE_KEY_ANNOTATE_LANG) || 'zh-CN')

  const recordingDuration = ref(0)

  // 主题: dark | light | system
  const theme = ref(localStorage.getItem(STORAGE_KEY_THEME) || 'dark')

  function applyTheme() {
    if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const root = document.documentElement
    let effective = theme.value
    if (effective === 'system') {
      effective = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    }
    root.setAttribute('data-theme', effective)
  }

  function setTheme(t: string) {
    theme.value = t
    localStorage.setItem(STORAGE_KEY_THEME, t)
    applyTheme()
  }

  // 初始化时应用主题
  if (typeof window !== 'undefined') {
    applyTheme()
    // 监听系统主题变化
    if (typeof window.matchMedia === 'function') {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (theme.value === 'system') applyTheme()
      })
    }
  }

  const conversations = ref<ConversationRecord[]>([])

  // ===== AI 对话状态（支持多会话） =====
  const mode = ref<AppMode>('speaking')
  const chatSessions = ref<ChatSession[]>([])
  const currentChatSessionId = ref<string | null>(null)
  const chatInputText = ref('')
  const chatLoading = ref(false)
  const chatTranslations = ref<Record<string, { translating: boolean; text: string | null }>>({})
  interface ChatTip {
    text: string
    translation: string
  }
  const chatTips = ref<ChatTip[]>([])
  const chatTipsLoading = ref(false)

  // ===== AI 口语练习状态 =====
  const practiceMessages = ref<PracticeMessage[]>([])
  const practiceLoading = ref(false)
  const practiceRecording = ref(false)
  const practiceInputText = ref('')
  const practiceHints = ref<string[]>([])
  const practiceHintsLoading = ref(false)
  const practiceIsActive = ref(false)
  const practiceTopicInterval = ref(60) // AI 等待时间（秒），0=关闭
  const practiceSilenceInterval = ref(Number(localStorage.getItem('doulingo_practice_silence_interval')) || 20) // 用户静默提示时间（秒），0=关闭
  const practiceAutoRead = ref(localStorage.getItem('doulingo_practice_autoread') === 'true') // 自动朗读AI回复
  const practiceConversations = ref<PracticeRecord[]>([])
  let practiceTopicTimer: ReturnType<typeof setTimeout> | null = null
  let practiceSilenceTimer: ReturnType<typeof setTimeout> | null = null

  // ===== 词汇训练状态 =====
  const nativeLanguage = ref(localStorage.getItem(STORAGE_KEY_NATIVE_LANG) || 'zh-CN')
  const languageProficiencies = ref<LanguageProficiency>(
    JSON.parse(localStorage.getItem(STORAGE_KEY_LANG_PROFICIENCY) || '{}')
  )
  const vocabWordCount = ref(Number(localStorage.getItem(STORAGE_KEY_VOCAB_WORD_COUNT)) || 400)
  const vocabArticleRange = ref(localStorage.getItem(STORAGE_KEY_VOCAB_ARTICLE_RANGE) || '20-30')
  const vocabJournal = ref<VocabJournal | null>(null)
  const vocabLoading = ref(false)
  const vocabGeneratingProgress = ref(0) // 0-100
  const vocabGeneratingStatus = ref('')
  const vocabGenerateError = ref('')
  const vocabAssessing = ref(false)
  const vocabUserLevel = ref('中级')
  const vocabRecords = ref<VocabJournalRecord[]>([])
  const vocabSelectedText = ref('')
  const vocabSelectedTranslation = ref('')
  const vocabTranslating = ref(false)
  const vocabJournals = ref<VocabJournal[]>([])
  let vocabService: VocabTrainingService | null = null

  // ===== 强化训练 =====
  const trainingSession = ref<TrainingSession | null>(null)
  const trainingHistory = ref<TrainingSession[]>([])
  const trainingGenerating = ref(false)
  const trainingGenerateError = ref('')
  const trainingGenerateProgress = ref(0)
  const trainingGenerateStatus = ref('')

  // ===== 写作训练 =====
  const writingTopics = ref<WritingTopic[]>([])
  const writingSession = ref<WritingSession | null>(null)
  const writingHistory = ref<WritingSession[]>([])
  const writingGenerating = ref(false)
  const writingLoadingHint = ref(false)
  const writingEvaluating = ref(false)
  const writingError = ref('')

  // 初始化时从 localStorage 恢复
  const savedSession = localStorage.getItem(STORAGE_KEY_TRAINING_SESSION)
  if (savedSession) {
    try { trainingSession.value = JSON.parse(savedSession) } catch {}
  }
  const savedHistory = localStorage.getItem(STORAGE_KEY_TRAINING_HISTORY)
  if (savedHistory) {
    try { trainingHistory.value = JSON.parse(savedHistory) } catch {}
  }

  async function generateTrainingQuestions() {
    const key = getApiKey()
    if (!key) {
      showApiGuide.value = 'deepseek'
      return
    }

    if (!vocabService) {
      vocabService = new VocabTrainingService()
    }
    vocabService.setApiKey(key)

    const targetLangCode = targetLang.value
    const userSetLevel = languageProficiencies.value[targetLangCode]
    const levelDesc = userSetLevel
      ? `用户自评水平：${getProficiencyLabel(userSetLevel)}`
      : vocabUserLevel.value

    try {
      trainingGenerating.value = true
      trainingGenerateProgress.value = 0
      trainingGenerateStatus.value = '正在生成强化训练题目...'
      trainingGenerateError.value = ''
      const questions = await vocabService.generateTrainingQuestions(
        targetLang.value,
        annotateLang.value,
        levelDesc,
        30,
        (chars: number, total: number) => {
          const pct = Math.min(Math.round((chars / total) * 100), 99)
          trainingGenerateProgress.value = pct
          trainingGenerateStatus.value = `正在生成... ${chars < 1000 ? chars + '字' : (chars / 1000).toFixed(1) + 'K字'}`
        },
        (p, c) => recordTokenUsage(p, c, 'training_intensive')
      )

      trainingGenerateProgress.value = 100
      trainingGenerateStatus.value = '生成完成'

      recordLearningEvent('training_intensive', targetLang.value, `生成 30 道强化训练题目`)

      const session: TrainingSession = {
        id: `train-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        questions,
        createdAt: Date.now(),
        targetLang: targetLang.value,
        userLevel: levelDesc,
        status: 'active',
        progress: Object.fromEntries(questions.map(q => [q.id, 'pending'])),
        userAnswers: {},
        currentIndex: 0,
      }

      trainingSession.value = session
      localStorage.setItem(STORAGE_KEY_TRAINING_SESSION, JSON.stringify(session))
    } catch (e: any) {
      console.error('[Store] 生成强化训练失败:', e)
      trainingGenerateError.value = e?.message || '生成失败，请重试'
    } finally {
      trainingGenerating.value = false
    }
  }

  function submitTrainingAnswer(questionId: string, answers: string[]) {
    if (!trainingSession.value) return
    const session = JSON.parse(JSON.stringify(trainingSession.value))
    session.userAnswers[questionId] = answers

    // 校验答案
    const question = session.questions.find((q: any) => q.id === questionId)
    if (!question) return

    const isCorrect = answers.every((a: string, i: number) => {
      const expected = question.blanks[i] || ''
      return a.trim().toLowerCase() === expected.trim().toLowerCase()
    })
    session.progress[questionId] = isCorrect ? 'correct' : 'wrong'

    // 如果是正确的，前进到下一题
    if (isCorrect) {
      let nextIdx = session.questions.findIndex((q: any) => q.id === questionId) + 1
      while (nextIdx < session.questions.length) {
        if (session.progress[session.questions[nextIdx].id] === 'pending') break
        nextIdx++
      }
      if (nextIdx < session.questions.length) {
        session.currentIndex = nextIdx
      }
    }

    // 检查是否全部完成
    const allDone = session.questions.every((q: any) => session.progress[q.id] !== 'pending')
    if (allDone) {
      session.status = 'completed'
    }

    // 更新 trainingSession
    trainingSession.value = session
    localStorage.setItem(STORAGE_KEY_TRAINING_SESSION, JSON.stringify(session))

    // 保存/更新历史记录（每次提交都同步）
    const existingIdx = trainingHistory.value.findIndex(h => h.id === session.id)
    if (existingIdx >= 0) {
      trainingHistory.value[existingIdx] = session
    } else {
      trainingHistory.value.unshift(session)
    }
    if (trainingHistory.value.length > 50) {
      trainingHistory.value = trainingHistory.value.slice(0, 50)
    }
    localStorage.setItem(STORAGE_KEY_TRAINING_HISTORY, JSON.stringify(trainingHistory.value))
  }

  function goToTrainingQuestion(index: number) {
    if (!trainingSession.value) return
    trainingSession.value = JSON.parse(JSON.stringify({ ...trainingSession.value, currentIndex: index }))
    localStorage.setItem(STORAGE_KEY_TRAINING_SESSION, JSON.stringify(trainingSession.value))
  }

  function loadTrainingSession(id: string) {
    const found = trainingHistory.value.find(s => s.id === id)
    if (found) {
      trainingSession.value = found
      localStorage.setItem(STORAGE_KEY_TRAINING_SESSION, JSON.stringify(found))
    }
  }

  function deleteTrainingSession(id: string) {
    trainingHistory.value = trainingHistory.value.filter(s => s.id !== id)
    localStorage.setItem(STORAGE_KEY_TRAINING_HISTORY, JSON.stringify(trainingHistory.value))
    if (trainingSession.value?.id === id) {
      trainingSession.value = null
      localStorage.removeItem(STORAGE_KEY_TRAINING_SESSION)
    }
  }

  function clearTrainingSession() {
    trainingSession.value = null
    localStorage.removeItem(STORAGE_KEY_TRAINING_SESSION)
  }

  // ===== 写作训练 =====
  // 从 localStorage 恢复
  const savedWritingTopics = localStorage.getItem('doulingo_writing_topics')
  if (savedWritingTopics) {
    try { writingTopics.value = JSON.parse(savedWritingTopics) } catch {}
  }
  const savedWritingSession = localStorage.getItem(STORAGE_KEY_WRITING_SESSION)
  if (savedWritingSession) {
    try { writingSession.value = JSON.parse(savedWritingSession) } catch {}
  }
  const savedWritingHistory = localStorage.getItem(STORAGE_KEY_WRITING_HISTORY)
  if (savedWritingHistory) {
    try { writingHistory.value = JSON.parse(savedWritingHistory) } catch {}
  }

  async function generateWritingTopics() {
    const key = getApiKey()
    if (!key) {
      showApiGuide.value = 'deepseek'
      return
    }

    if (!vocabService) {
      vocabService = new VocabTrainingService()
    }
    vocabService.setApiKey(key)

    const levelDesc = languageProficiencies.value[targetLang.value]
      ? `用户自评水平：${getProficiencyLabel(languageProficiencies.value[targetLang.value])}`
      : vocabUserLevel.value

    try {
      writingGenerating.value = true
      writingError.value = ''
      const topics = await vocabService.generateWritingTopics(
        targetLang.value,
        annotateLang.value,
        levelDesc,
        (p, c) => recordTokenUsage(p, c, 'writing_topics')
      )
      writingTopics.value = topics
      localStorage.setItem('doulingo_writing_topics', JSON.stringify(topics))
      recordLearningEvent('writing_training', targetLang.value, `生成 3 个写作命题`)
    } catch (e: any) {
      console.error('[Store] 生成写作命题失败:', e)
      writingError.value = e?.message || '生成失败，请重试'
    } finally {
      writingGenerating.value = false
    }
  }

  function startWritingSession(topicId: string) {
    const topic = writingTopics.value.find(t => t.id === topicId)
    if (!topic) return

    const levelDesc = languageProficiencies.value[targetLang.value]
      ? `用户自评水平：${getProficiencyLabel(languageProficiencies.value[targetLang.value])}`
      : vocabUserLevel.value

    const session: WritingSession = {
      id: `write-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      topic,
      content: '',
      hints: [],
      evaluation: null,
      createdAt: Date.now(),
      targetLang: targetLang.value,
      userLevel: levelDesc,
      status: 'writing',
    }
    writingSession.value = session
    localStorage.setItem(STORAGE_KEY_WRITING_SESSION, JSON.stringify(session))
  }

  async function getWritingHint() {
    if (!writingSession.value) return
    const ws = writingSession.value

    const key = getApiKey()
    if (!key) {
      showApiGuide.value = 'deepseek'
      return
    }
    if (!vocabService) {
      vocabService = new VocabTrainingService()
    }
    vocabService.setApiKey(key)

    try {
      writingLoadingHint.value = true
      const hint = await vocabService.getWritingHint(
        targetLang.value,
        annotateLang.value,
        ws.topic.title,
        ws.content,
        (p, c) => recordTokenUsage(p, c, 'writing_hint')
      )
      ws.hints.push(hint)
      writingSession.value = { ...ws }
      localStorage.setItem(STORAGE_KEY_WRITING_SESSION, JSON.stringify(ws))
    } catch (e: any) {
      console.error('[Store] 获取写作提示失败:', e)
      writingError.value = e?.message || '获取提示失败'
    } finally {
      writingLoadingHint.value = false
    }
  }

  function updateWritingContent(content: string) {
    if (!writingSession.value) return
    writingSession.value = { ...writingSession.value, content }
    localStorage.setItem(STORAGE_KEY_WRITING_SESSION, JSON.stringify(writingSession.value))
  }

  async function submitWriting() {
    if (!writingSession.value) return
    const ws = writingSession.value
    if (!ws.content.trim()) return

    const key = getApiKey()
    if (!key) {
      showApiGuide.value = 'deepseek'
      return
    }
    if (!vocabService) {
      vocabService = new VocabTrainingService()
    }
    vocabService.setApiKey(key)

    try {
      writingEvaluating.value = true
      writingError.value = ''
      const evaluation = await vocabService.evaluateWriting(
        targetLang.value,
        annotateLang.value,
        ws.topic.title,
        ws.content,
        (p, c) => recordTokenUsage(p, c, 'writing_eval')
      )
      ws.evaluation = evaluation
      ws.status = 'completed'
      writingSession.value = { ...ws }
      localStorage.setItem(STORAGE_KEY_WRITING_SESSION, JSON.stringify(ws))
      recordLearningEvent('writing_training', targetLang.value, `完成写作：${ws.topic.title}`)

      // 加入历史
      const existingIdx = writingHistory.value.findIndex(h => h.id === ws.id)
      if (existingIdx >= 0) {
        writingHistory.value[existingIdx] = { ...ws }
      } else {
        writingHistory.value.unshift({ ...ws })
      }
      if (writingHistory.value.length > 50) {
        writingHistory.value = writingHistory.value.slice(0, 50)
      }
      localStorage.setItem(STORAGE_KEY_WRITING_HISTORY, JSON.stringify(writingHistory.value))
    } catch (e: any) {
      console.error('[Store] 提交写作评估失败:', e)
      writingError.value = e?.message || '评估失败，请重试'
    } finally {
      writingEvaluating.value = false
    }
  }

  function loadWritingSession(id: string) {
    const found = writingHistory.value.find(s => s.id === id)
    if (found) {
      writingSession.value = { ...found }
      localStorage.setItem(STORAGE_KEY_WRITING_SESSION, JSON.stringify(found))
    }
  }

  function deleteWritingSession(id: string) {
    writingHistory.value = writingHistory.value.filter(s => s.id !== id)
    localStorage.setItem(STORAGE_KEY_WRITING_HISTORY, JSON.stringify(writingHistory.value))
    if (writingSession.value?.id === id) {
      writingSession.value = null
      localStorage.removeItem(STORAGE_KEY_WRITING_SESSION)
    }
  }

  function clearWritingSession() {
    writingSession.value = null
    localStorage.removeItem(STORAGE_KEY_WRITING_SESSION)
  }

  // ===== 生词本 =====
  const showVocabBook = ref(false)
  const vocabBook = ref<VocabEntry[]>(
    JSON.parse(localStorage.getItem(STORAGE_KEY_VOCAB_BOOK) || '[]')
  )
  const vocabAddToast = ref('')

  let vocabToastTimer: ReturnType<typeof setTimeout> | null = null
  function clearVocabToast() {
    if (vocabToastTimer) clearTimeout(vocabToastTimer)
    vocabToastTimer = setTimeout(() => { vocabAddToast.value = '' }, 2000)
  }

  // ===== API token 用量追踪 =====
  interface FeatureUsage {
    promptTokens: number
    completionTokens: number
  }

  interface TokenUsageData {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    totalCost: number
    byFeature: Record<string, FeatureUsage>
  }

  const DEFAULT_FEATURE_USAGE: FeatureUsage = { promptTokens: 0, completionTokens: 0 }

  const tokenUsage = ref<TokenUsageData>(
    (() => {
      const raw = localStorage.getItem(STORAGE_KEY_TOKEN_USAGE)
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          // 兼容旧数据：迁移到新格式
          if (!parsed.byFeature) {
            parsed.byFeature = {}
          }
          return parsed as TokenUsageData
        } catch {}
      }
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCost: 0, byFeature: {} }
    })()
  )

  function recordTokenUsage(promptTokens: number, completionTokens: number, feature?: string) {
    if (!promptTokens && !completionTokens) return
    const cost = (promptTokens / 1000000) * DEEPSEEK_PRICE_INPUT + (completionTokens / 1000000) * DEEPSEEK_PRICE_OUTPUT
    tokenUsage.value.promptTokens += promptTokens
    tokenUsage.value.completionTokens += completionTokens
    tokenUsage.value.totalTokens += (promptTokens + completionTokens)
    tokenUsage.value.totalCost += cost
    if (feature) {
      if (!tokenUsage.value.byFeature) {
        tokenUsage.value.byFeature = {}
      }
      if (!tokenUsage.value.byFeature[feature]) {
        tokenUsage.value.byFeature[feature] = { promptTokens: 0, completionTokens: 0 }
      }
      tokenUsage.value.byFeature[feature].promptTokens += promptTokens
      tokenUsage.value.byFeature[feature].completionTokens += completionTokens
    }
    localStorage.setItem(STORAGE_KEY_TOKEN_USAGE, JSON.stringify(tokenUsage.value))
  }

  // ===== 余额查询 =====
  interface BalanceInfo {
    currency: string
    totalBalance: string
    grantedBalance: string
    toppedUpBalance: string
  }
  const balance = ref<{ available: boolean; infos: BalanceInfo[] }>({ available: false, infos: [] })
  const balanceLoading = ref(false)

  async function fetchBalance() {
    const key = getApiKey()
    if (!key) {
      balance.value = { available: false, infos: [] }
      return
    }
    balanceLoading.value = true
    try {
      const res = await fetch('https://api.deepseek.com/user/balance', {
        headers: { 'Authorization': `Bearer ${key}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      balance.value = {
        available: data.is_available,
        infos: (data.balance_infos || []).map((b: any) => ({
          currency: b.currency,
          totalBalance: b.total_balance,
          grantedBalance: b.granted_balance,
          toppedUpBalance: b.topped_up_balance,
        })),
      }
    } catch {
      balance.value = { available: false, infos: [] }
    } finally {
      balanceLoading.value = false
    }
  }

  function addVocabWord(word: string, translation: string) {
    if (!word.trim() || !translation.trim()) return
    // 去重：已存在的词不重复添加
    if (vocabBook.value.some(e => e.word === word)) {
      vocabAddToast.value = '已在生词本中'
      clearVocabToast()
      return
    }
    const entry: VocabEntry = {
      id: `vb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      word,
      translation,
      sourceLang: targetLang.value,
      annotateLang: annotateLang.value,
      addedAt: Date.now(),
    }
    vocabBook.value.unshift(entry)
    localStorage.setItem(STORAGE_KEY_VOCAB_BOOK, JSON.stringify(vocabBook.value))
    vocabAddToast.value = `✓ 已加入生词本：${word}`
    clearVocabToast()
  }

  function removeVocabWord(id: string) {
    vocabBook.value = vocabBook.value.filter(e => e.id !== id)
    localStorage.setItem(STORAGE_KEY_VOCAB_BOOK, JSON.stringify(vocabBook.value))
  }

  function toggleVocabBook() {
    showVocabBook.value = !showVocabBook.value
  }

  // 计算属性：当前会话的消息列表
  const chatMessages = computed({
    get: () => {
      const session = chatSessions.value.find(s => s.id === currentChatSessionId.value)
      return session?.messages ?? []
    },
    set: (messages: ChatMessage[]) => {
      const session = chatSessions.value.find(s => s.id === currentChatSessionId.value)
      if (session) {
        session.messages = messages
        session.updatedAt = Date.now()
        session.messageCount = messages.length
        saveChatSessions()
      }
    },
  })

  let frenchResponse: FrenchResponseService | null = null
  let chatService: ChatService | null = null
  let tts: TextToSpeechService | null = null
  let speechService: SpeechRecognitionService | null = null
  let durationInterval: any = null

  const savedApiKey = localStorage.getItem(STORAGE_KEY_API)
  if (savedApiKey) {
    try {
      frenchResponse = new FrenchResponseService()
      frenchResponse.setApiKey(savedApiKey)
      fetchBalance()
    } catch (e) {
      console.error('恢复 API Key 失败:', e)
    }
  }

  const savedConversations = localStorage.getItem(STORAGE_KEY_CONVERSATIONS)
  if (savedConversations) {
    try {
      conversations.value = JSON.parse(savedConversations)
    } catch (e) {
      console.error('恢复对话记录失败:', e)
    }
  }

  // 恢复 AI 对话会话
  const savedSessions = localStorage.getItem(STORAGE_KEY_CHAT_SESSIONS)
  if (savedSessions) {
    try {
      const parsed = JSON.parse(savedSessions) as ChatSession[]
      chatSessions.value = parsed
      // 如果有会话，默认打开最近一个
      if (chatSessions.value.length > 0) {
        currentChatSessionId.value = chatSessions.value[0].id
      }
    } catch (e) {
      console.error('恢复对话会话失败:', e)
    }
  }

  // 恢复口语练习记录
  const savedPractice = localStorage.getItem(STORAGE_KEY_PRACTICE)
  if (savedPractice) {
    try {
      practiceConversations.value = JSON.parse(savedPractice)
    } catch (e) {
      console.error('恢复练习记录失败:', e)
    }
  }

  // 恢复词汇周刊数据 — 先恢复历史期刊列表
  const savedJournals = localStorage.getItem(STORAGE_KEY_VOCAB_JOURNALS)
  if (savedJournals) {
    try {
      vocabJournals.value = JSON.parse(savedJournals)
    } catch (e) {
      console.error('恢复历史期刊列表失败:', e)
    }
  }
  // 再恢复当前期刊
  const savedVocabJournal = localStorage.getItem(STORAGE_KEY_VOCAB_JOURNAL)
  if (savedVocabJournal) {
    try {
      vocabJournal.value = JSON.parse(savedVocabJournal)
    } catch (e) {
      console.error('恢复当前期刊失败:', e)
    }
  }
  // 恢复期刊记录列表
  const savedVocabRecords = localStorage.getItem(STORAGE_KEY_VOCAB_RECORDS)
  if (savedVocabRecords) {
    try {
      vocabRecords.value = JSON.parse(savedVocabRecords)
    } catch (e) {
      console.error('恢复词汇记录失败:', e)
    }
  }
  // 迁移：将当前期刊补入历史列表（如果缺失）
  if (vocabJournal.value) {
    const exists = vocabJournals.value.some(j => j.id === vocabJournal.value!.id)
    if (!exists) {
      vocabJournals.value.unshift(vocabJournal.value)
      localStorage.setItem(STORAGE_KEY_VOCAB_JOURNALS, JSON.stringify(vocabJournals.value))
    }
  }
  // 迁移：如果记录存在但历史列表为空，从当前期刊重建
  if (vocabJournals.value.length === 0 && vocabRecords.value.length > 0 && vocabJournal.value) {
    vocabJournals.value = [vocabJournal.value]
    localStorage.setItem(STORAGE_KEY_VOCAB_JOURNALS, JSON.stringify(vocabJournals.value))
  }

  function saveChatSessions() {
    localStorage.setItem(STORAGE_KEY_CHAT_SESSIONS, JSON.stringify(chatSessions.value))
  }

  const statusText = computed(() => {
    if (recognitionError.value) {
      return recognitionError.value
    }
    switch (state.value) {
      case 'idle':
        return '点击麦克风开始录制对话'
      case 'recording':
        return `正在录制对话... ${recordingDuration.value}秒`
      case 'processing':
        return `正在分析对话并生成${getTargetLangLabel()}回答...`
      default:
        return ''
    }
  })

  const hasApiKey = computed(() => {
    if (!frenchResponse) return false
    return !!frenchResponse.getApiKey()
  })

  const conversationCount = computed(() => conversations.value.length)

  function getTargetLangLabel(): string {
    const langMap: Record<string, string> = {
      'fr-FR': '法语',
      'en-US': '英语',
      'zh-CN': '中文',
      'ja-JP': '日语',
    }
    return langMap[targetLang.value] || targetLang.value
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function toggleSettings() {
    showSettings.value = !showSettings.value
  }

  function toggleHistory() {
    showHistory.value = !showHistory.value
  }

  function toggleProgress() {
    showProgress.value = !showProgress.value
  }

  function setApiKey(key: string) {
    if (!frenchResponse) {
      frenchResponse = new FrenchResponseService()
    }
    frenchResponse.setApiKey(key)
    localStorage.setItem(STORAGE_KEY_API, key)
    // 保存后自动查询余额
    fetchBalance()
  }

  function clearApiKey() {
    if (frenchResponse) {
      frenchResponse.setApiKey('')
    }
    localStorage.removeItem(STORAGE_KEY_API)
    balance.value = { available: false, infos: [] }
  }

  function getApiKey(): string {
    if (!frenchResponse) return ''
    return frenchResponse.getApiKey()
  }

  function setSourceLang(lang: string) {
    sourceLang.value = lang
    localStorage.setItem(STORAGE_KEY_SOURCE_LANG, lang)
  }

  function setTargetLang(lang: string) {
    targetLang.value = lang
    localStorage.setItem(STORAGE_KEY_TARGET_LANG, lang)
  }

  function setAnnotateLang(lang: string) {
    annotateLang.value = lang
    localStorage.setItem(STORAGE_KEY_ANNOTATE_LANG, lang)
  }

  async function startRecording() {
    if (state.value !== 'idle') return
    if (!localStorage.getItem('xfyun_app_id') || !localStorage.getItem('xfyun_api_key') || !localStorage.getItem('xfyun_api_secret')) {
      showApiGuide.value = 'xfyun'
      return
    }

    state.value = 'recording'
    recordingDuration.value = 0
    responses.value = []
    recognizedText.value = ''
    lastHeardText.value = ''
    recognitionError.value = ''

    // 计时器
    durationInterval = setInterval(() => {
      if (state.value === 'recording') {
        recordingDuration.value++
      } else {
        clearInterval(durationInterval)
      }
    }, 1000)

    // 启动录音
    speechService = new SpeechRecognitionService()

    try {
      await speechService.start(
        (text) => {
          console.log('[appStore] 识别结果:', text)
          recognizedText.value = text
          lastHeardText.value = text
        },
        (error) => {
          console.error('[appStore] 识别错误:', error)
          recognitionError.value = error
          if (state.value === 'recording') {
            state.value = 'idle'
            recordingDuration.value = 0
          }
        },
        sourceLang.value
      )
    } catch (err) {
      console.error('[appStore] 启动录音失败:', err)
      recognitionError.value = '启动录音失败'
      state.value = 'idle'
      recordingDuration.value = 0
    }
  }

  async function stopRecording() {
    if (state.value !== 'recording') return

    // 最低录音时长保护：小于1秒不停止，提示用户继续说话
    if (recordingDuration.value < 1) {
      recognitionError.value = '录音时间太短，请至少说话1秒'
      state.value = 'idle'
      recordingDuration.value = 0
      // 清理录音资源
      if (speechService) {
        try { await speechService.stop() } catch {}
        speechService = null
      }
      if (durationInterval) {
        clearInterval(durationInterval)
        durationInterval = null
      }
      return
    }

    state.value = 'processing'

    if (durationInterval) {
      clearInterval(durationInterval)
      durationInterval = null
    }

    // 停止语音识别并获取结果
    let inputText = ''
    if (speechService) {
      try {
        inputText = await speechService.stop()
      } catch (e: any) {
        console.warn('[appStore] 语音识别未返回结果:', e.message)
      }
      if (inputText) {
        recognizedText.value = inputText
        lastHeardText.value = inputText
      }
      speechService = null
    }

    // 如果 stop() 没有返回结果，使用已在回调中收到的文本
    const finalText = inputText || recognizedText.value || lastHeardText.value
    console.log('[appStore] 最终识别文本:', finalText)

    // 未识别到有效语音
    if (!finalText || finalText.trim().length === 0) {
      state.value = 'idle'
      recognitionError.value = '未检测到语音输入，请重试'
      recordingDuration.value = 0
      return
    }

    // 生成回答
    if (!getApiKey()) {
      showApiGuide.value = 'deepseek'
      state.value = 'idle'
      recordingDuration.value = 0
      return
    }
    if (!frenchResponse) {
      frenchResponse = new FrenchResponseService()
    }

    try {
      const results = await frenchResponse.generate(
        finalText,
        targetLang.value,
        annotateLang.value,
        (p, c) => recordTokenUsage(p, c, 'speaking')
      )
      responses.value = results
      recordLearningEvent('speaking_session', targetLang.value, finalText.slice(0, 50))

      const record: ConversationRecord = {
        id: Date.now().toString(),
        inputText: finalText,
        responses: results,
        timestamp: Date.now(),
        sourceLang: sourceLang.value,
        targetLang: targetLang.value,
      }
      conversations.value.unshift(record)

      if (conversations.value.length > 99) {
        conversations.value = conversations.value.slice(0, 99)
      }

      localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(conversations.value))
    } catch (err) {
      console.error('生成回答失败:', err)
      const defaultResponses: FrenchResponseItem[] = [
        { id: '1', french: 'Bonjour! Comment ça va?', translation: 'Hello! How are you?' },
        { id: '2', french: 'Merci beaucoup!', translation: 'Thank you very much!' },
        { id: '3', french: 'Au revoir et à bientôt!', translation: 'Goodbye and see you soon!' },
      ]
      responses.value = defaultResponses
    }

    state.value = 'idle'
    recordingDuration.value = 0
  }

  async function startMonitoring() {
    await startRecording()
  }

  async function stopMonitoring() {
    await stopRecording()
  }

  function deleteConversation(id: string) {
    conversations.value = conversations.value.filter((c) => c.id !== id)
    localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(conversations.value))
  }

  function clearConversations() {
    conversations.value.splice(0, conversations.value.length)
    localStorage.removeItem(STORAGE_KEY_CONVERSATIONS)
  }

  function loadConversation(record: ConversationRecord) {
    responses.value = record.responses
    lastHeardText.value = record.inputText
    sourceLang.value = record.sourceLang
    targetLang.value = record.targetLang
    showHistory.value = false
  }

  function deletePracticeConversation(id: string) {
    practiceConversations.value = practiceConversations.value.filter((c) => c.id !== id)
    localStorage.setItem(STORAGE_KEY_PRACTICE, JSON.stringify(practiceConversations.value))
  }

  function clearPracticeConversations() {
    practiceConversations.value = []
    localStorage.removeItem(STORAGE_KEY_PRACTICE)
  }

  function loadPracticeConversation(record: PracticeRecord) {
    practiceMessages.value = record.messages
    showHistory.value = false
  }

  async function speakFrench(item: FrenchResponseItem) {
    if (isSpeaking.value) {
      if (tts) {
        tts.stop()
      }
      isSpeaking.value = false
      speakingId.value = null
      return
    }

    isSpeaking.value = true
    speakingId.value = item.id

    if (!tts) {
      tts = new TextToSpeechService()
    }

    try {
      await tts.speak(item.french, targetLang.value)
    } finally {
      isSpeaking.value = false
      speakingId.value = null
    }
  }

  // ===== AI 对话（多会话管理） =====
  function setMode(newMode: AppMode) {
    if (newMode === mode.value) return
    // 离开 speaking 时停止正在进行的录音
    if (mode.value === 'speaking' && state.value === 'recording') {
      stopRecording()
    }
    // 离开 practice 时停止练习
    if (mode.value === 'practice') {
      stopPractice()
    }
    mode.value = newMode
  }

  function getChatService(): ChatService {
    if (!chatService) {
      chatService = new ChatService()
      const key = localStorage.getItem(STORAGE_KEY_API)
      if (key) chatService.setApiKey(key)
    }
    return chatService
  }

  /** 自动从第一条用户消息生成标题 */
  function generateTitle(messages: ChatMessage[]): string {
    const first = messages.find(m => m.role === 'user')
    if (!first) return '新对话'
    const text = first.content.trim()
    // 取前 20 个字符，超出加省略号
    if (text.length <= 20) return text
    return text.slice(0, 20) + '…'
  }

  /** 创建新会话 */
  function newChatSession(): string {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = Date.now()
    const session: ChatSession = {
      id,
      title: '新对话',
      messages: [],
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    }
    chatSessions.value.unshift(session)
    currentChatSessionId.value = id
    saveChatSessions()
    chatInputText.value = ''
    return id
  }

  /** 切换到指定会话 */
  function switchChatSession(sessionId: string) {
    const session = chatSessions.value.find(s => s.id === sessionId)
    if (session) {
      currentChatSessionId.value = sessionId
      // 按 updatedAt 排序：活跃会话靠前
      session.updatedAt = Date.now()
      chatSessions.value.sort((a, b) => b.updatedAt - a.updatedAt)
      saveChatSessions()
    }
  }

  /** 删除会话 */
  function deleteChatSession(sessionId: string) {
    chatSessions.value = chatSessions.value.filter(s => s.id !== sessionId)
    saveChatSessions()
    if (currentChatSessionId.value === sessionId) {
      // 切换到最近一个会话或创建新会话
      if (chatSessions.value.length > 0) {
        currentChatSessionId.value = chatSessions.value[0].id
      } else {
        newChatSession()
      }
    }
  }

  /** 清空所有会话 */
  function clearChatSessions() {
    chatSessions.value = []
    saveChatSessions()
    newChatSession()
  }

  async function sendChatMessage() {
    const text = chatInputText.value.trim()
    if (!text || chatLoading.value) return

    if (!getApiKey()) {
      showApiGuide.value = 'deepseek'
      return
    }

    // 确保有当前会话
    if (!currentChatSessionId.value) {
      newChatSession()
    }

    chatInputText.value = ''

    const userMsg: ChatMessage = {
      id: `chat-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    const session = chatSessions.value.find(s => s.id === currentChatSessionId.value)!
    session.messages.push(userMsg)
    session.updatedAt = Date.now()
    session.messageCount = session.messages.length
    // 如果是第一条用户消息，自动生成标题
    if (session.title === '新对话' && userMsg.role === 'user') {
      session.title = generateTitle(session.messages)
    }
    recordLearningEvent('chat_message', targetLang.value, text.slice(0, 50))
    // 排序：活跃会话靠前
    chatSessions.value.sort((a, b) => b.updatedAt - a.updatedAt)
    saveChatSessions()

    chatLoading.value = true

    try {
      const reply = await getChatService().sendMessage(
        session.messages.slice(0, -1),
        text,
        (p, c) => recordTokenUsage(p, c, 'chat')
      )

      const assistantMsg: ChatMessage = {
        id: `chat-${Date.now()}-reply`,
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      }

      const currentSession = chatSessions.value.find(s => s.id === currentChatSessionId.value)
      if (currentSession) {
        currentSession.messages.push(assistantMsg)
        currentSession.updatedAt = Date.now()
        currentSession.messageCount = currentSession.messages.length
        chatSessions.value.sort((a, b) => b.updatedAt - a.updatedAt)
        saveChatSessions()
      }
    } catch (err: any) {
      console.error('[Chat] 对话失败:', err)
    } finally {
      chatLoading.value = false
    }
  }

  async function startChatRecording() {
    if (chatLoading.value) return

    const appId = localStorage.getItem('xfyun_app_id')
    const apiKey = localStorage.getItem('xfyun_api_key')
    const apiSecret = localStorage.getItem('xfyun_api_secret')
    if (!appId || !apiKey || !apiSecret) {
      showApiGuide.value = 'xfyun'
      return
    }

    speechService = new SpeechRecognitionService()
    try {
      state.value = 'recording'
      recordingDuration.value = 0

      durationInterval = setInterval(() => {
        if (state.value === 'recording') {
          recordingDuration.value++
        }
      }, 1000)

      await speechService.start(
        (text) => {
          recognizedText.value = text
        },
        (error) => {
          console.error('[Chat] 语音识别错误:', error)
          recognitionError.value = error
        },
        sourceLang.value
      )
    } catch (err) {
      console.error('[Chat] 启动录音失败:', err)
      speechService = null
      state.value = 'idle'
      recordingDuration.value = 0
    }
  }

  async function stopChatRecording() {
    if (state.value !== 'recording') return

    state.value = 'processing'

    if (durationInterval) {
      clearInterval(durationInterval)
      durationInterval = null
    }

    if (!speechService) {
      state.value = 'idle'
      recordingDuration.value = 0
      return
    }

    try {
      const text = await speechService.stop()
      if (text) {
        chatInputText.value = text
        await sendChatMessage()
      }
    } catch (e: any) {
      console.warn('[Chat] 语音识别未返回结果:', e.message)
    }
    speechService = null

    state.value = 'idle'
    recordingDuration.value = 0
  }

  async function speakChatMessage(text: string) {
    if (isSpeaking.value) {
      if (tts) {
        tts.stop()
      }
      isSpeaking.value = false
      speakingId.value = null
      return
    }

    isSpeaking.value = true

    if (!tts) {
      tts = new TextToSpeechService()
    }

    try {
      await tts.speak(text, targetLang.value)
    } finally {
      isSpeaking.value = false
    }
  }

  async function speakText(text: string, lang?: string) {
    if (isSpeaking.value) {
      if (tts) {
        tts.stop()
      }
      isSpeaking.value = false
      speakingTarget.value = ''
      return
    }

    isSpeaking.value = true
    speakingTarget.value = text

    if (!tts) {
      tts = new TextToSpeechService()
    }

    try {
      await tts.speak(text, lang || targetLang.value)
    } finally {
      isSpeaking.value = false
      speakingTarget.value = ''
    }
  }

  async function translateChatMessage(msgId: string, text: string) {
    if (chatTranslations.value[msgId]?.translating) return
    if (chatTranslations.value[msgId]?.text) {
      // 已翻译，点击收起
      delete chatTranslations.value[msgId]
      return
    }

    chatTranslations.value = {
      ...chatTranslations.value,
      [msgId]: { translating: true, text: null },
    }

    const key = localStorage.getItem(STORAGE_KEY_API)
    if (!key) {
      chatTranslations.value = {
        ...chatTranslations.value,
        [msgId]: { translating: false, text: '请先在设置中配置 API Key' },
      }
      return
    }

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `You are a translator. Translate the following text to ${annotateLang.value === 'zh-CN' ? 'Simplified Chinese' : annotateLang.value === 'ja-JP' ? 'Japanese' : annotateLang.value === 'fr-FR' ? 'French' : 'English'}. Respond with ONLY the translation, no explanation.`,
            },
            { role: 'user', content: text },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      })

      const data = await response.json()
      recordTokenUsage(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, 'chat_translate')
      const translated = data.choices?.[0]?.message?.content?.trim()

      chatTranslations.value = {
        ...chatTranslations.value,
        [msgId]: { translating: false, text: translated || '翻译失败' },
      }
    } catch {
      chatTranslations.value = {
        ...chatTranslations.value,
        [msgId]: { translating: false, text: '翻译失败，请重试' },
      }
    }
  }

  async function fetchChatTips() {
    const session = chatSessions.value.find(s => s.id === currentChatSessionId.value)
    if (!session || session.messages.length === 0) {
      // 没有对话上下文，返回通用提示
      return
    }

    chatTipsLoading.value = true
    const key = localStorage.getItem(STORAGE_KEY_API)
    if (!key) {
      chatTipsLoading.value = false
      return
    }

    const langLabel = annotateLang.value === 'zh-CN' ? '简体中文' : annotateLang.value === 'ja-JP' ? '日语' : annotateLang.value === 'fr-FR' ? '法语' : '英语'

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `你是一名语言学习助手。请根据以下对话上下文，生成3条实用的${langLabel}学习提示。每条提示包含目标和翻译。

返回格式为JSON数组，每个元素包含text（${langLabel}原文）和translation（中文翻译）字段。只返回JSON数组，不要有其他文字。

示例：
[{"text": "Bonjour, comment allez-vous?", "translation": "你好，您怎么样？"}]`,
            },
            {
              role: 'user',
              content: `对话上下文：\n${session.messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n')}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      })

      const data = await response.json()
      recordTokenUsage(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, 'chat_tips')
      const content = data.choices?.[0]?.message?.content?.trim()
      if (content) {
        // 尝试提取 JSON 数组
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as ChatTip[]
          chatTips.value = parsed.slice(0, 3)
        }
      }
    } catch {
      // 失败保持原有 tips
    } finally {
      chatTipsLoading.value = false
    }
  }

  // ===== AI 口语练习方法 =====

  /** 获取目标语种中文名（用于 prompt） */
  function getTargetLangChinese(): string {
    const m: Record<string, string> = { 'fr-FR': '法语', 'en-US': '英语', 'zh-CN': '中文', 'ja-JP': '日语' }
    return m[targetLang.value] || targetLang.value
  }

  function getLangLabel(lang: string): string {
    const map: Record<string, string> = { 'zh-CN': '中文', 'en-US': 'English', 'fr-FR': 'Français', 'ja-JP': '日本語' }
    return map[lang] || lang
  }

  /** 生成唯一 ID */
  function genId(): string {
    return `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  }

  function addPracticeMsg(msg: PracticeMessage) {
    practiceMessages.value.push(msg)
  }

  function clearPracticeTimers() {
    if (practiceTopicTimer) { clearTimeout(practiceTopicTimer); practiceTopicTimer = null }
    if (practiceSilenceTimer) { clearTimeout(practiceSilenceTimer); practiceSilenceTimer = null }
  }

  /** 开始一个新话题（AI 主动说话） */
  async function practiceStartTopic() {
    if (!practiceIsActive.value) return
    practiceLoading.value = true
    practiceHints.value = []
    const key = localStorage.getItem(STORAGE_KEY_API)
    const langChinese = getTargetLangChinese()
    const langCode = targetLang.value

    try {
      const context = practiceMessages.value.slice(-8).map(m =>
        `${m.role === 'ai' ? 'AI' : '用户'}: ${m.content}`
      ).join('\n')

      const topicCount = practiceMessages.value.filter(m => m.role === 'ai').length

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `你是一名${langChinese}口语对话练习助手。你是引导者，必须主动说话、提问、推进对话。

规则：
1. 这已经是第${topicCount + 1}轮话题
2. 用${langChinese}说话，自然口语化
3. 每轮说1-2句话，不要长篇大论
4. 提出开放性问题引导用户回答
5. 可以切换话题：聊聊爱好、旅行、美食、电影、文化等
6. 如果用户说错了，先用正确表达复述一遍，再继续对话

${context ? '对话历史：\n' + context : '这是对话开始，先用简单问候开场。'}`,
            },
          ],
          temperature: 0.8,
          max_tokens: 500,
        }),
      })

      const data = await response.json()
      recordTokenUsage(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, 'practice')
      const content = data.choices?.[0]?.message?.content?.trim()
      if (content) {
        addPracticeMsg({
          id: genId(),
          role: 'ai',
          content,
          timestamp: Date.now(),
        })
        // 自动朗读
        if (practiceAutoRead.value) {
          speakText(content, targetLang.value)
        }
      }
    } catch {
      addPracticeMsg({
        id: genId(),
        role: 'ai',
        content: targetLang.value === 'fr-FR' ? 'Désolé, j\'ai eu un problème technique. On continue?' :
                 targetLang.value === 'en-US' ? 'Sorry, I had a technical issue. Shall we continue?' :
                 targetLang.value === 'ja-JP' ? 'すみません、技術的な問題が発生しました。続けましょうか？' :
                 '抱歉，出了点技术问题。我们继续好吗？',
        timestamp: Date.now(),
      })
    } finally {
      practiceLoading.value = false
      scheduleNextTopic()
      startSilenceTimer()
    }
  }

  /** 设置 AI 话题切换定时器（按配置的间隔） */
  function scheduleNextTopic() {
    if (practiceTopicTimer) clearTimeout(practiceTopicTimer)
    const interval = practiceTopicInterval.value
    if (interval <= 0) return // 关闭自动切换
    practiceTopicTimer = setTimeout(() => {
      if (practiceIsActive.value) {
         practiceStartTopic()
      }
    }, interval * 1000)
  }

  /** 设置静默提示（用户没说话时触发） */
  function startSilenceTimer() {
    if (practiceSilenceTimer) clearTimeout(practiceSilenceTimer)
    const interval = practiceSilenceInterval.value
    if (interval <= 0) return // 关闭静默提示
    practiceSilenceTimer = setTimeout(() => {
      if (!practiceIsActive.value) return
       // 检查用户是否已经说了话（有新的 user 消息）
       const lastMsg = practiceMessages.value[practiceMessages.value.length - 1]
      if (lastMsg?.role === 'ai') {
        // 用户还没回复，给出提示
        generatePracticeHints()
      }
    }, interval * 1000)
  }

  /** 生成 3 条回复提示 */
  async function generatePracticeHints() {
    if (practiceHintsLoading.value) return
    practiceHintsLoading.value = true
    const key = localStorage.getItem(STORAGE_KEY_API)
    if (!key) {
      showApiGuide.value = 'deepseek'
      practiceHintsLoading.value = false
      return
    }
    const langChinese = getTargetLangChinese()
    const lastAi = [...practiceMessages.value].reverse().find(m => m.role === 'ai')

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `你是一名${langChinese}学习助手。用户正在练习口语对话，AI刚刚说了一段话。

请根据AI的话生成3条用户可能的回复建议，帮助用户接话。

返回JSON数组，每个元素包含text（${langChinese}原文）和translation（中文翻译）字段。只返回JSON数组。
示例：[{"text": "J'aime beaucoup la cuisine française.", "translation": "我非常喜欢法国菜。"}]`,
            },
            {
              role: 'user',
              content: `AI说：${lastAi?.content || 'Bonjour!'}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      })

      const data = await response.json()
      recordTokenUsage(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, 'practice_tips')
      const content = data.choices?.[0]?.message?.content?.trim()
      if (content) {
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as ChatTip[]
          practiceHints.value = parsed.map(h => `${h.text}（${h.translation}）`)
        }
      }
    } catch {
      // 失败保持原样
    } finally {
      practiceHintsLoading.value = false
    }
  }

  /** 开始口语练习 */
  async function startPractice() {
    if (practiceIsActive.value) return
    if (!getApiKey()) {
      showApiGuide.value = 'deepseek'
      return
    }
    practiceIsActive.value = true
    practiceMessages.value = []
    practiceHints.value = []
    recordLearningEvent('practice_session', targetLang.value, '开始口语练习')

    // 释放可能的录音资源
    if (speechService) {
      try { await speechService.stop() } catch {}
      speechService = null
    }
    if (state.value === 'recording') {
      state.value = 'idle'
    }
    if (durationInterval) {
      clearInterval(durationInterval)
      durationInterval = null
    }

    // AI 先说话
    await practiceStartTopic()
  }

  /** 停止口语练习 */
  function stopPractice() {
    practiceIsActive.value = false
    clearPracticeTimers()

    // 保存当前练习记录
    if (practiceMessages.value.length > 0) {
      const firstAi = practiceMessages.value.find(m => m.role === 'ai')
      const record: PracticeRecord = {
        id: `practice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        messages: [...practiceMessages.value],
        createdAt: Date.now(),
        messageCount: practiceMessages.value.length,
        summary: firstAi?.content.slice(0, 30) + '…' || '口语练习',
      }
      practiceConversations.value.unshift(record)
      if (practiceConversations.value.length > 99) {
        practiceConversations.value = practiceConversations.value.slice(0, 99)
      }
      localStorage.setItem(STORAGE_KEY_PRACTICE, JSON.stringify(practiceConversations.value))
    }

    if (practiceRecording.value) {
      stopPracticeRecording()
    }
  }

  /** 用户发送文字回复 */
  async function sendPracticeReply(text: string) {
    if (!text.trim() || !practiceIsActive) return
    practiceHints.value = []
    practiceInputText.value = ''

    addPracticeMsg({
      id: genId(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      translation: '',
    })
    recordLearningEvent('practice_message', targetLang.value, text.slice(0, 50))

    clearPracticeTimers()
    await practiceStartTopic()
  }

  /** 开始录音 */
  async function startPracticeRecording() {
    if (!practiceIsActive.value || practiceLoading.value) return
    const appId = localStorage.getItem('xfyun_app_id')
    const apiKey = localStorage.getItem('xfyun_api_key')
    const apiSecret = localStorage.getItem('xfyun_api_secret')
    if (!appId || !apiKey || !apiSecret) {
      showApiGuide.value = 'xfyun'
      return
    }

    // 清除静默提示
    practiceHints.value = []

    speechService = new SpeechRecognitionService()
    try {
      practiceRecording.value = true
      recordingDuration.value = 0

      durationInterval = setInterval(() => {
        if (practiceRecording.value) {
          recordingDuration.value++
        }
      }, 1000)

      await speechService.start(
        (text) => {
          practiceInputText.value = text
        },
        (error) => {
          console.error('[Practice] 语音识别错误:', error)
        },
        sourceLang.value
      )
    } catch {
      speechService = null
      practiceRecording.value = false
      recordingDuration.value = 0
    }
  }

  /** 停止录音并发送 */
  async function stopPracticeRecording() {
    if (!practiceRecording.value) return
    practiceRecording.value = false
    if (durationInterval) { clearInterval(durationInterval); durationInterval = null }
    if (!speechService) { recordingDuration.value = 0; return }

    try {
      const text = await speechService.stop()
      speechService = null
      recordingDuration.value = 0
      if (text) {
        await sendPracticeReply(text)
        return
      }
    } catch {
      speechService = null
      recordingDuration.value = 0
    }

    // 没有识别到文字，重新开始静默计时
    startSilenceTimer()
  }

  // ===== 语言能力与词汇训练方法 =====
  function setNativeLanguage(lang: string) {
    nativeLanguage.value = lang
    localStorage.setItem(STORAGE_KEY_NATIVE_LANG, lang)
  }

  function setLanguageProficiency(lang: string, level: VocabProficiencyLevel) {
    languageProficiencies.value[lang] = level
    localStorage.setItem(STORAGE_KEY_LANG_PROFICIENCY, JSON.stringify(languageProficiencies.value))
  }

  function getProficiencyLabel(level?: VocabProficiencyLevel): string {
    const labels: Record<string, string> = {
      native: '母语', beginner: '初级 (A1-A2)', elementary: '初中级 (A2-B1)',
      intermediate: '中级 (B1-B2)', advanced: '高级 (C1-C2)', fluent: '精通 (C2+)',
    }
    return level ? (labels[level] || level) : '未知'
  }

  /** 生成词汇训练周刊 */
  async function generateWeeklyJournal() {
    const key = getApiKey()
    if (!key) {
      showApiGuide.value = 'deepseek'
      return
    }

    // 初始化服务
    if (!vocabService) {
      vocabService = new VocabTrainingService()
    }
    vocabService.setApiKey(key)

    // 获取用户语言能力描述
    const targetLangCode = targetLang.value
    const userSetLevel = languageProficiencies.value[targetLangCode]
    const levelDesc = userSetLevel
      ? `用户自评水平：${getProficiencyLabel(userSetLevel)}`
      : vocabUserLevel.value

    try {
      vocabLoading.value = true
      vocabGeneratingProgress.value = 0
      vocabGeneratingStatus.value = '正在生成期刊...'
      vocabGenerateError.value = ''
      const journal = await vocabService.generateWeeklyJournal(
        targetLang.value,
        nativeLanguage.value,
        annotateLang.value,
        levelDesc,
        vocabWordCount.value,
        vocabArticleRange.value,
        (chars: number, total: number) => {
          const pct = Math.min(Math.round((chars / total) * 100), 99)
          vocabGeneratingProgress.value = pct
          vocabGeneratingStatus.value = `正在生成期刊... ${chars < 1000 ? chars + '字' : (chars / 1000).toFixed(1) + 'K字'}`
        },
        (p, c) => recordTokenUsage(p, c, 'vocab_journal')
      )
      vocabGeneratingProgress.value = 100
      vocabGeneratingStatus.value = '生成完成'
      vocabJournal.value = journal
      localStorage.setItem(STORAGE_KEY_VOCAB_JOURNAL, JSON.stringify(journal))

      // 加入记录列表 — 按日期+语种+序号命名
      const sameDateRecords = vocabRecords.value.filter(
        (r) => r.date === journal.date && r.targetLang === targetLang.value
      )
      const seqNum = sameDateRecords.length + 1
      const langLabel = getLangLabel(targetLang.value)
      const record: VocabJournalRecord = {
        id: journal.id,
        date: journal.date,
        articlesCount: journal.articles.length,
        level: vocabUserLevel.value,
        targetLang: targetLang.value,
        seqNum,
        summary: `${journal.date} ${langLabel}${seqNum > 1 ? ` (${seqNum})` : ''} · ${journal.articles.length} 篇`,
        createdAt: Date.now(),
      }
      vocabRecords.value.unshift(record)
      if (vocabRecords.value.length > 99) {
        vocabRecords.value = vocabRecords.value.slice(0, 99)
      }
      localStorage.setItem(STORAGE_KEY_VOCAB_RECORDS, JSON.stringify(vocabRecords.value))

      // 保存到历史期刊列表
      const existingIdx = vocabJournals.value.findIndex(j => j.id === journal.id)
      if (existingIdx >= 0) {
        vocabJournals.value[existingIdx] = journal
      } else {
        vocabJournals.value.unshift(journal)
      }
      if (vocabJournals.value.length > 20) {
        vocabJournals.value = vocabJournals.value.slice(0, 20)
      }
      localStorage.setItem(STORAGE_KEY_VOCAB_JOURNALS, JSON.stringify(vocabJournals.value))
    } catch (e: any) {
      console.error('[Store] 生成周刊失败:', e)
      vocabGenerateError.value = e?.message || '生成失败，请重试'
      vocabGeneratingProgress.value = 0
      vocabGeneratingStatus.value = '生成失败'
    } finally {
      vocabLoading.value = false
    }
  }

  function loadVocabJournal(id: string) {
    const found = vocabJournals.value.find(j => j.id === id)
    if (found) {
      vocabJournal.value = found
    }
  }

  function deleteVocabJournal(id: string) {
    vocabJournals.value = vocabJournals.value.filter(j => j.id !== id)
    localStorage.setItem(STORAGE_KEY_VOCAB_JOURNALS, JSON.stringify(vocabJournals.value))
    vocabRecords.value = vocabRecords.value.filter(r => r.id !== id)
    localStorage.setItem(STORAGE_KEY_VOCAB_RECORDS, JSON.stringify(vocabRecords.value))
    if (vocabJournal.value?.id === id) {
      vocabJournal.value = vocabJournals.value[0] || null
    }
  }

  /** AI 评估语言水平 */
  async function assessVocabLevel() {
    const key = getApiKey()
    if (!key) return

    if (!vocabService) {
      vocabService = new VocabTrainingService()
    }
    vocabService.setApiKey(key)

    // 收集练习和对话记录作为评估素材
    const history: string[] = []
    // 从口语练习中取最近消息
    for (const msg of practiceMessages.value.slice(-20)) {
      history.push(`[${msg.role}] ${msg.content}`)
    }
    // 从 AI 对话中取最近消息
    for (const session of chatSessions.value) {
      for (const msg of session.messages.slice(-10)) {
        history.push(`[${msg.role}] ${msg.content}`)
      }
    }
    if (history.length === 0) {
      history.push('（暂无练习记录，请先使用口语练习或 AI 对话）')
    }

    try {
      vocabAssessing.value = true
      const assessment = await vocabService.assessLevel(history, (p, c) => recordTokenUsage(p, c, 'vocab_assess'))
      vocabUserLevel.value = assessment.level

      // 同步到对应语种的语言能力设置
      const targetLangCode = targetLang.value
      if (!languageProficiencies.value[targetLangCode]) {
        // 如果用户没有手动设置过，自动设置评估结果
        const levelMap: Record<string, VocabProficiencyLevel> = {
          'A1': 'beginner', 'A2': 'beginner',
          'B1': 'elementary', 'B2': 'elementary',
          'C1': 'intermediate', 'C2': 'advanced',
          '初级': 'beginner', '中级': 'intermediate', '高级': 'advanced', '精通': 'fluent',
        }
        const autoLevel = levelMap[assessment.level] || 'intermediate'
        setLanguageProficiency(targetLangCode, autoLevel)
      }
    } catch (e: any) {
      console.error('[Store] AI 评估失败:', e)
    } finally {
      vocabAssessing.value = false
    }
  }

  /** 划词翻译（通用，任何 AI 生成的目标语言文本皆可用） */
  async function translateVocabWord(word: string) {
    if (!word.trim()) return
    const key = getApiKey()
    if (!key) return

    if (!vocabService) {
      vocabService = new VocabTrainingService()
    }
    if (!vocabService.getApiKey()) {
      vocabService.setApiKey(key)
    }

    try {
      vocabTranslating.value = true
      vocabSelectedText.value = word
      const result = await vocabService.translateWord(word, targetLang.value, annotateLang.value, (p, c) => recordTokenUsage(p, c, 'vocab_translate'))
      vocabSelectedTranslation.value = result
      recordLearningEvent('vocab_word_lookup', targetLang.value, word)
    } catch (e: any) {
      vocabSelectedTranslation.value = '翻译失败，请重试'
    } finally {
      vocabTranslating.value = false
    }
  }

  function dismissVocabTranslation() {
    vocabSelectedText.value = ''
    vocabSelectedTranslation.value = ''
  }

  function setVocabWordCount(count: number) {
    vocabWordCount.value = count
    localStorage.setItem(STORAGE_KEY_VOCAB_WORD_COUNT, String(count))
  }

  function setVocabArticleRange(range: string) {
    vocabArticleRange.value = range
    localStorage.setItem(STORAGE_KEY_VOCAB_ARTICLE_RANGE, range)
  }

  // ===== 学习进度追踪 =====
  const learningEvents = ref<LearningEvent[]>(
    JSON.parse(localStorage.getItem(STORAGE_KEY_LEARNING_EVENTS) || '[]')
  )

  function recordLearningEvent(type: LearningEvent['type'], lang: string, detail: string) {
    const event: LearningEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      lang,
      timestamp: Date.now(),
      detail,
    }
    learningEvents.value.unshift(event)
    // 只保留最近 2000 条
    if (learningEvents.value.length > 2000) {
      learningEvents.value = learningEvents.value.slice(0, 2000)
    }
    localStorage.setItem(STORAGE_KEY_LEARNING_EVENTS, JSON.stringify(learningEvents.value))
  }

  const langProgress = computed<LanguageProgress[]>(() => {
    const langMap = new Map<string, LanguageProgress>()
    const events = learningEvents.value

    for (const evt of events) {
      if (!langMap.has(evt.lang)) {
        langMap.set(evt.lang, {
          lang: evt.lang,
          totalSessions: 0,
          totalMessages: 0,
          totalVocabArticles: 0,
          totalVocabLookups: 0,
          totalIntensiveTrainings: 0,
          totalWritingTrainings: 0,
          totalPracticeMinutes: 0,
          level: languageProficiencies.value[evt.lang] || 'beginner',
          lastActiveDate: '',
          dailyStats: [],
          streakDays: 0,
        })
      }

      const p = langMap.get(evt.lang)!
      const dateStr = new Date(evt.timestamp).toISOString().slice(0, 10)

      if (dateStr > p.lastActiveDate) p.lastActiveDate = dateStr

      switch (evt.type) {
        case 'practice_session':
          p.totalSessions++
          break
        case 'speaking_session':
          p.totalSessions++
          break
        case 'chat_message':
        case 'practice_message':
          p.totalMessages++
          break
        case 'vocab_article':
          p.totalVocabArticles++
          break
        case 'vocab_word_lookup':
          p.totalVocabLookups++
          break
        case 'training_intensive':
          p.totalIntensiveTrainings = (p.totalIntensiveTrainings || 0) + 1
          break
        case 'writing_training':
          p.totalWritingTrainings = (p.totalWritingTrainings || 0) + 1
          break
      }

      // Daily stats
      let day = p.dailyStats.find((d: DailyStats) => d.date === dateStr)
      if (!day) {
        day = {
          date: dateStr,
          lang: evt.lang,
          chatMessages: 0,
          practiceMessages: 0,
          practiceSessions: 0,
          vocabArticles: 0,
          vocabLookups: 0,
          speakingSessions: 0,
          intensiveTrainings: 0,
          writingTrainings: 0,
          totalMinutes: 0,
        }
        p.dailyStats.push(day)
      }

      switch (evt.type) {
        case 'chat_message': day.chatMessages++; break
        case 'practice_message': day.practiceMessages++; break
        case 'practice_session': day.practiceSessions++; break
        case 'vocab_article': day.vocabArticles++; break
        case 'vocab_word_lookup': day.vocabLookups++; break
        case 'speaking_session': day.speakingSessions++; break
        case 'training_intensive': day.intensiveTrainings++; break
        case 'writing_training': day.writingTrainings++; break
      }
    }

    // Sort daily stats descending
    for (const p of langMap.values()) {
      p.dailyStats.sort((a, b) => b.date.localeCompare(a.date))
      // Compute streak
      let streak = 0
      const today = new Date().toISOString().slice(0, 10)
      let checkDate = today
      while (true) {
        const hasActivity = p.dailyStats.some(d => d.date === checkDate)
        if (!hasActivity && checkDate !== today) break
        if (hasActivity) streak++
        const d = new Date(checkDate)
        d.setDate(d.getDate() - 1)
        checkDate = d.toISOString().slice(0, 10)
        if (streak > 365) break
      }
      p.streakDays = streak
      p.level = languageProficiencies.value[p.lang] || 'beginner'
    }

    return Array.from(langMap.values()).sort((a, b) => b.lastActiveDate.localeCompare(a.lastActiveDate))
  })

  function getLangProgress(lang: string): LanguageProgress | undefined {
    return langProgress.value.find(p => p.lang === lang)
  }

  // ===== 数据导入导出 =====
  function exportAllData(): string {
    const data = {
      exportedAt: new Date().toISOString(),
      version: '1.4.29',
      // 配置
      config: {
        sourceLang: sourceLang.value,
        targetLang: targetLang.value,
        annotateLang: annotateLang.value,
        nativeLanguage: nativeLanguage.value,
        theme: theme.value,
        languageProficiencies: languageProficiencies.value,
        vocabWordCount: vocabWordCount.value,
        vocabArticleRange: vocabArticleRange.value,
      },
      // 生词本
      vocabBook: vocabBook.value,
      // 历史记录
      conversations: conversations.value,
      chatSessions: chatSessions.value,
      practiceConversations: practiceConversations.value,
      vocabJournals: vocabJournals.value,
      vocabRecords: vocabRecords.value,
      // 学习进度
      learningEvents: learningEvents.value,
    }
    return JSON.stringify(data, null, 2)
  }

  function importAllData(jsonStr: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(jsonStr)
      if (!data || typeof data !== 'object') {
        return { success: false, message: '无效的数据格式' }
      }

      // 1. 配置 — 直接覆盖
      if (data.config) {
        const c = data.config
        if (c.sourceLang) { sourceLang.value = c.sourceLang; localStorage.setItem(STORAGE_KEY_SOURCE_LANG, c.sourceLang) }
        if (c.targetLang) { targetLang.value = c.targetLang; localStorage.setItem(STORAGE_KEY_TARGET_LANG, c.targetLang) }
        if (c.annotateLang) { annotateLang.value = c.annotateLang; localStorage.setItem(STORAGE_KEY_ANNOTATE_LANG, c.annotateLang) }
        if (c.nativeLanguage) { nativeLanguage.value = c.nativeLanguage; localStorage.setItem(STORAGE_KEY_NATIVE_LANG, c.nativeLanguage) }
        if (c.theme) { setTheme(c.theme) }
        if (c.languageProficiencies) {
          languageProficiencies.value = { ...languageProficiencies.value, ...c.languageProficiencies }
          localStorage.setItem(STORAGE_KEY_LANG_PROFICIENCY, JSON.stringify(languageProficiencies.value))
        }
        if (c.vocabWordCount) { setVocabWordCount(c.vocabWordCount) }
        if (c.vocabArticleRange) { setVocabArticleRange(c.vocabArticleRange) }
      }

      // 2. 生词本 — 按 word 去重合并
      if (Array.isArray(data.vocabBook)) {
        const existingWords = new Set(vocabBook.value.map(e => e.word))
        for (const entry of data.vocabBook) {
          if (!existingWords.has(entry.word)) {
            vocabBook.value.push(entry)
            existingWords.add(entry.word)
          }
        }
        localStorage.setItem(STORAGE_KEY_VOCAB_BOOK, JSON.stringify(vocabBook.value))
      }

      // 3. 口语提示记录 — 按 id 去重合并
      if (Array.isArray(data.conversations)) {
        const existingIds = new Set(conversations.value.map(c => c.id))
        for (const item of data.conversations) {
          if (!existingIds.has(item.id)) {
            conversations.value.push(item)
            existingIds.add(item.id)
          }
        }
        localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(conversations.value))
      }

      // 4. AI 对话会话 — 按 id 去重合并
      if (Array.isArray(data.chatSessions)) {
        const existingIds = new Set(chatSessions.value.map(s => s.id))
        for (const item of data.chatSessions) {
          if (!existingIds.has(item.id)) {
            chatSessions.value.push(item)
            existingIds.add(item.id)
          }
        }
        localStorage.setItem(STORAGE_KEY_CHAT_SESSIONS, JSON.stringify(chatSessions.value))
      }

      // 5. 口语练习记录 — 按 id 去重合并
      if (Array.isArray(data.practiceConversations)) {
        const existingIds = new Set(practiceConversations.value.map(p => p.id))
        for (const item of data.practiceConversations) {
          if (!existingIds.has(item.id)) {
            practiceConversations.value.push(item)
            existingIds.add(item.id)
          }
        }
        localStorage.setItem(STORAGE_KEY_PRACTICE, JSON.stringify(practiceConversations.value))
      }

      // 6. 期刊 — 按 id 去重合并
      if (Array.isArray(data.vocabJournals)) {
        const existingIds = new Set(vocabJournals.value.map(j => j.id))
        for (const item of data.vocabJournals) {
          if (!existingIds.has(item.id)) {
            vocabJournals.value.push(item)
            existingIds.add(item.id)
          }
        }
        localStorage.setItem(STORAGE_KEY_VOCAB_JOURNALS, JSON.stringify(vocabJournals.value))
      }

      if (Array.isArray(data.vocabRecords)) {
        const existingIds = new Set(vocabRecords.value.map(r => r.id))
        for (const item of data.vocabRecords) {
          if (!existingIds.has(item.id)) {
            vocabRecords.value.push(item)
            existingIds.add(item.id)
          }
        }
        localStorage.setItem(STORAGE_KEY_VOCAB_RECORDS, JSON.stringify(vocabRecords.value))
      }

      // 7. 学习进度 — 按 id 去重合并
      if (Array.isArray(data.learningEvents)) {
        const existingIds = new Set(learningEvents.value.map(e => e.id))
        for (const item of data.learningEvents) {
          if (!existingIds.has(item.id)) {
            learningEvents.value.push(item)
            existingIds.add(item.id)
          }
        }
        localStorage.setItem(STORAGE_KEY_LEARNING_EVENTS, JSON.stringify(learningEvents.value))
      }

      return { success: true, message: `导入完成：配置已覆盖，共合并 ${data.vocabBook?.length || 0} 条生词、${data.conversations?.length || 0} 条口语记录、${data.chatSessions?.length || 0} 条对话、${data.practiceConversations?.length || 0} 条练习记录、${data.vocabJournals?.length || 0} 篇期刊` }
    } catch (e: any) {
      return { success: false, message: '导入失败：文件格式错误' }
    }
  }

  // ===== API 引导提示 =====
  const showApiGuide = ref<'deepseek' | 'xfyun' | ''>('')

  function openApiGuide(guide: 'deepseek' | 'xfyun') {
    showApiGuide.value = guide
  }

  function dismissApiGuide() {
    showApiGuide.value = ''
    showSettings.value = true
  }

  // 持久化练习设置
  watch(practiceAutoRead, (v) => localStorage.setItem('doulingo_practice_autoread', String(v)))
  watch(practiceSilenceInterval, (v) => localStorage.setItem('doulingo_practice_silence_interval', String(v)))

  return {
    state,
    responses,
    lastHeardText,
    recognizedText,
    isSpeaking,
    speakingId,
    speakingTarget,
    showSettings,
    showHistory,
    showProgress,
    hasApiKey,
    statusText,
    recognitionError,
    recordingDuration,
    sourceLang,
    targetLang,
    annotateLang,
    conversations,
    conversationCount,
    toggleSettings,
    toggleHistory,
    toggleProgress,
    theme,
    setTheme,
    setApiKey,
    clearApiKey,
    getApiKey,
    setSourceLang,
    setTargetLang,
    setAnnotateLang,
    startMonitoring,
    stopMonitoring,
    speakFrench,
    deleteConversation,
    clearConversations,
    loadConversation,
    deletePracticeConversation,
    clearPracticeConversations,
    loadPracticeConversation,
    formatTime,
    getTargetLangLabel,
    getLangLabel,
    // chat
    mode,
    chatSessions,
    chatMessages,
    chatInputText,
    chatLoading,
    chatTranslations,
    chatTips,
    chatTipsLoading,
    currentChatSessionId,
    setMode,
    sendChatMessage,
    startChatRecording,
    stopChatRecording,
    speakChatMessage,
    speakText,
    translateChatMessage,
    fetchChatTips,
    newChatSession,
    switchChatSession,
    deleteChatSession,
    clearChatSessions,
    // practice
    practiceMessages,
    practiceConversations,
    practiceLoading,
    practiceRecording,
    practiceInputText,
    practiceHints,
    practiceHintsLoading,
    practiceIsActive,
    practiceTopicInterval,
    practiceSilenceInterval,
    practiceAutoRead,
    startPractice,
    stopPractice,
    sendPracticeReply,
    startPracticeRecording,
    stopPracticeRecording,
    generatePracticeHints,
    // vocab
    nativeLanguage,
    languageProficiencies,
    vocabJournal,
    vocabLoading,
    vocabGeneratingProgress,
    vocabGeneratingStatus,
    vocabGenerateError,
    vocabAssessing,
    vocabUserLevel,
    vocabRecords,
    vocabJournals,
    loadVocabJournal,
    deleteVocabJournal,
    vocabSelectedText,
    vocabSelectedTranslation,
    vocabTranslating,
    vocabWordCount,
    vocabArticleRange,
    setNativeLanguage,
    setLanguageProficiency,
    getProficiencyLabel,
    generateWeeklyJournal,
    assessVocabLevel,
    translateVocabWord,
    dismissVocabTranslation,
    setVocabWordCount,
    setVocabArticleRange,
    // vocab book
    showVocabBook,
    vocabBook,
    vocabAddToast,
    addVocabWord,
    removeVocabWord,
    toggleVocabBook,
    // intensive training
    trainingSession,
    trainingHistory,
    trainingGenerating,
    trainingGenerateError,
    trainingGenerateProgress,
    trainingGenerateStatus,
    generateTrainingQuestions,
    submitTrainingAnswer,
    goToTrainingQuestion,
    loadTrainingSession,
    deleteTrainingSession,
    clearTrainingSession,
    // writing training
    writingTopics,
    writingSession,
    writingHistory,
    writingGenerating,
    writingLoadingHint,
    writingEvaluating,
    writingError,
    generateWritingTopics,
    startWritingSession,
    getWritingHint,
    updateWritingContent,
    submitWriting,
    loadWritingSession,
    deleteWritingSession,
    clearWritingSession,
    // progress
    learningEvents,
    langProgress,
    getLangProgress,
    recordLearningEvent,
    // import/export
    exportAllData,
    importAllData,
    // api guide
    showApiGuide,
    openApiGuide,
    dismissApiGuide,
    // token usage
    tokenUsage,
    recordTokenUsage,
    // balance
    balance,
    balanceLoading,
    fetchBalance,
  }
})
