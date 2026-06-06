import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { AppState, AppMode, FrenchResponseItem, ConversationRecord, ChatMessage, ChatSession, PracticeMessage, PracticeRecord, VocabJournal, VocabJournalRecord, LanguageProficiency, VocabProficiencyLevel } from '@/types'
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

export const useAppStore = defineStore('app', () => {
  const state = ref<AppState>('idle')
  const responses = ref<FrenchResponseItem[]>([])
  const lastHeardText = ref('')
  const recognizedText = ref('')
  const isSpeaking = ref(false)
  const speakingId = ref<string | null>(null)
  const showSettings = ref(false)
  const showHistory = ref(false)
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
  const practiceTopicInterval = ref(20) // AI 等待时间（秒），0=关闭
  const practiceConversations = ref<PracticeRecord[]>([])
  let practiceTopicTimer: ReturnType<typeof setTimeout> | null = null
  let practiceSilenceTimer: ReturnType<typeof setTimeout> | null = null

  // ===== 词汇训练状态 =====
  const nativeLanguage = ref(localStorage.getItem(STORAGE_KEY_NATIVE_LANG) || 'zh-CN')
  const languageProficiencies = ref<LanguageProficiency>(
    JSON.parse(localStorage.getItem(STORAGE_KEY_LANG_PROFICIENCY) || '{}')
  )
  const vocabWordCount = ref(Number(localStorage.getItem(STORAGE_KEY_VOCAB_WORD_COUNT)) || 400)
  const vocabArticleRange = ref(localStorage.getItem(STORAGE_KEY_VOCAB_ARTICLE_RANGE) || '8-9')
  const vocabJournal = ref<VocabJournal | null>(null)
  const vocabLoading = ref(false)
  const vocabAssessing = ref(false)
  const vocabUserLevel = ref('中级')
  const vocabRecords = ref<VocabJournalRecord[]>([])
  const vocabSelectedText = ref('')
  const vocabSelectedTranslation = ref('')
  const vocabTranslating = ref(false)
  let vocabService: VocabTrainingService | null = null

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

  // 恢复词汇周刊数据
  const savedVocabJournal = localStorage.getItem(STORAGE_KEY_VOCAB_JOURNAL)
  if (savedVocabJournal) {
    try {
      vocabJournal.value = JSON.parse(savedVocabJournal)
    } catch (e) {
      console.error('恢复词汇周刊失败:', e)
    }
  }
  const savedVocabRecords = localStorage.getItem(STORAGE_KEY_VOCAB_RECORDS)
  if (savedVocabRecords) {
    try {
      vocabRecords.value = JSON.parse(savedVocabRecords)
    } catch (e) {
      console.error('恢复词汇记录失败:', e)
    }
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

  function setApiKey(key: string) {
    if (!frenchResponse) {
      frenchResponse = new FrenchResponseService()
    }
    frenchResponse.setApiKey(key)
    localStorage.setItem(STORAGE_KEY_API, key)
  }

  function clearApiKey() {
    if (frenchResponse) {
      frenchResponse.setApiKey('')
    }
    localStorage.removeItem(STORAGE_KEY_API)
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
    if (!frenchResponse) {
      frenchResponse = new FrenchResponseService()
    }

    try {
      const results = await frenchResponse.generate(
        finalText,
        targetLang.value,
        annotateLang.value
      )
      responses.value = results

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
    // 排序：活跃会话靠前
    chatSessions.value.sort((a, b) => b.updatedAt - a.updatedAt)
    saveChatSessions()

    chatLoading.value = true

    try {
      const reply = await getChatService().sendMessage(
        session.messages.slice(0, -1),
        text
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
      return
    }

    isSpeaking.value = true

    if (!tts) {
      tts = new TextToSpeechService()
    }

    try {
      await tts.speak(text, lang || targetLang.value)
    } finally {
      isSpeaking.value = false
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
      const content = data.choices?.[0]?.message?.content?.trim()
      if (content) {
        addPracticeMsg({
          id: genId(),
          role: 'ai',
          content,
          timestamp: Date.now(),
        })
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

  /** 设置 5 秒静默提示（用户没说话时触发） */
  function startSilenceTimer() {
    if (practiceSilenceTimer) clearTimeout(practiceSilenceTimer)
    practiceSilenceTimer = setTimeout(() => {
      if (!practiceIsActive.value) return
       // 检查用户是否已经说了话（有新的 user 消息）
       const lastMsg = practiceMessages.value[practiceMessages.value.length - 1]
      if (lastMsg?.role === 'ai') {
        // 用户还没回复，给出提示
        generatePracticeHints()
      }
    }, 5000)
  }

  /** 生成 3 条回复提示 */
  async function generatePracticeHints() {
    if (practiceHintsLoading.value) return
    practiceHintsLoading.value = true
    const key = localStorage.getItem(STORAGE_KEY_API)
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
    practiceIsActive.value = true
    practiceMessages.value = []
    practiceHints.value = []

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
    })

    clearPracticeTimers()
    await practiceStartTopic()
  }

  /** 开始录音 */
  async function startPracticeRecording() {
    if (!practiceIsActive.value || practiceLoading.value) return
    const appId = localStorage.getItem('xfyun_app_id')
    const apiKey = localStorage.getItem('xfyun_api_key')
    const apiSecret = localStorage.getItem('xfyun_api_secret')
    if (!appId || !apiKey || !apiSecret) return

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
    if (!key) return

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
      const journal = await vocabService.generateWeeklyJournal(
        targetLang.value,
        nativeLanguage.value,
        levelDesc,
        vocabWordCount.value,
        vocabArticleRange.value,
      )
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
    } catch (e: any) {
      console.error('[Store] 生成周刊失败:', e)
    } finally {
      vocabLoading.value = false
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
      const assessment = await vocabService.assessLevel(history)
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
      const result = await vocabService.translateWord(word, targetLang.value)
      vocabSelectedTranslation.value = result
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

  return {
    state,
    responses,
    lastHeardText,
    recognizedText,
    isSpeaking,
    speakingId,
    showSettings,
    showHistory,
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
    vocabAssessing,
    vocabUserLevel,
    vocabRecords,
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
  }
})
