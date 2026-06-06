export interface FrenchResponseItem {
  id: string
  french: string
  translation: string
}

export interface ConversationRecord {
  id: string
  inputText: string
  responses: FrenchResponseItem[]
  timestamp: number
  sourceLang: string
  targetLang: string
}

export type AppState = 'idle' | 'recording' | 'processing'

export type AppMode = 'speaking' | 'chat' | 'practice' | 'vocab'

export interface PracticeMessage {
  id: string
  role: 'ai' | 'user'
  content: string
  translation?: string
  hints?: string[]
  timestamp: number
}

export interface PracticeRecord {
  id: string
  messages: PracticeMessage[]
  createdAt: number
  messageCount: number
  summary: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  messageCount: number
}

// ===== 词汇训练 =====
export type VocabProficiencyLevel = 'native' | 'beginner' | 'elementary' | 'intermediate' | 'advanced' | 'fluent'

export interface LanguageProficiency {
  [langCode: string]: VocabProficiencyLevel
}

export const PROFICIENCY_OPTIONS: { value: VocabProficiencyLevel; label: string }[] = [
  { value: 'native', label: '母语' },
  { value: 'beginner', label: '初级 (A1-A2)' },
  { value: 'elementary', label: '初中级 (A2-B1)' },
  { value: 'intermediate', label: '中级 (B1-B2)' },
  { value: 'advanced', label: '高级 (C1-C2)' },
  { value: 'fluent', label: '精通 (C2+)' },
]

export const PROFICIENCY_LABELS: Record<VocabProficiencyLevel, string> = {
  native: '母语',
  beginner: '初级',
  elementary: '初中级',
  intermediate: '中级',
  advanced: '高级',
  fluent: '精通',
}

export interface VocabArticle {
  id: string
  title: string
  category: string // 时政、新闻、美食、文化、娱乐、生活等
  imageUrl: string // 配图 URL
  summary: string // 文章摘要（1-2句话）
  content: string // 目标语言文章内容
  translation: string // 全文翻译
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  keyWords: VocabWord[]
}

export interface VocabWord {
  word: string
  translation: string
  sentence: string
  sentenceTranslation: string
}

export interface VocabJournal {
  id: string
  date: string // YYYY-MM-DD 周次
  articles: VocabArticle[]
  generatedAt: number
  userLevel: string // AI 评估的用户语言水平
  nativeLang: string // 用户母语
  targetLang: string // 目标语言
}

export interface VocabAssessment {
  level: string
  score: number // 0-100
  strengths: string[]
  weaknesses: string[]
  recommendedFocus: string[]
}

export interface VocabJournalRecord {
  id: string
  date: string
  articlesCount: number
  level: string
  targetLang: string
  seqNum: number
  summary: string
  createdAt: number
}

export interface ElectronAPI {
  platform: string
  bufferToBase64: (buffer: ArrayBuffer) => string
  speechStart: () => Promise<{ success: boolean; error?: string }>
  speechStop: () => Promise<{ success: boolean; audioBase64?: string; audioLen?: number; error?: string }>
  speechIsListening: () => Promise<{ listening: boolean }>
  ttsSpeak: (params: { text: string; lang: string }) => Promise<{ success: boolean; error?: string }>
  ttsStop: () => Promise<{ success: boolean }>
  diagnosticCheck: () => Promise<{
    results: Array<{ name: string; pass: boolean; detail: string }>
  }>
  recognizeAudioBlob: (params: {
    audioBase64: string
    blobMimeType: string
    lang: string
    appId: string
    apiKey: string
    apiSecret: string
  }) => Promise<{ success: boolean; text?: string; error?: string }>
  xfyunAsrRecognize: (params: {
    audioBase64: string
    audioLen: number
    lang: string
    appId: string
    apiKey: string
    apiSecret: string
  }) => Promise<{ success: boolean; text?: string; error?: string }>
}

// 支持的语种列表
export interface LanguageOption {
  value: string
  label: string
  nativeLabel: string
}

export const SOURCE_LANGUAGES: LanguageOption[] = [
  { value: 'zh-CN', label: '中文', nativeLabel: '中文' },
  { value: 'en-US', label: '英语', nativeLabel: 'English' },
  { value: 'fr-FR', label: '法语', nativeLabel: 'Français' },
  { value: 'ja-JP', label: '日语', nativeLabel: '日本語' },
]

export const TARGET_LANGUAGES: LanguageOption[] = [
  { value: 'fr-FR', label: '法语', nativeLabel: 'Français' },
  { value: 'en-US', label: '英语', nativeLabel: 'English' },
  { value: 'zh-CN', label: '中文', nativeLabel: '中文' },
  { value: 'ja-JP', label: '日语', nativeLabel: '日本語' },
]

export const ANNOTATION_LANGUAGES: LanguageOption[] = [
  { value: 'zh-CN', label: '中文', nativeLabel: '中文' },
  { value: 'en-US', label: '英语', nativeLabel: 'English' },
  { value: 'ja-JP', label: '日语', nativeLabel: '日本語' },
  { value: 'fr-FR', label: '法语', nativeLabel: 'Français' },
]

// 全局声明 window.electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
