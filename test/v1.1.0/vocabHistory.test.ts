import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '@/stores/appStore'

// ===== Mocks =====
const mockGenerateJournal = vi.fn()

vi.mock('@/services/VocabTrainingService', () => ({
  VocabTrainingService: vi.fn().mockImplementation(() => ({
    setApiKey: vi.fn(),
    getApiKey: vi.fn().mockReturnValue('sk-test-key'),
    generateWeeklyJournal: mockGenerateJournal,
    assessLevel: vi.fn().mockResolvedValue({
      level: '中级', score: 50, strengths: [], weaknesses: [], recommendedFocus: [],
    }),
    translateWord: vi.fn().mockResolvedValue('翻译'),
  })),
}))

vi.mock('@/services/FrenchResponseService', () => ({
  FrenchResponseService: vi.fn().mockImplementation(() => ({
    setApiKey: vi.fn(),
    getApiKey: vi.fn().mockReturnValue('sk-test-key'),
    generate: vi.fn(),
  })),
}))

vi.mock('@/services/ChatService', () => ({
  ChatService: vi.fn().mockImplementation(() => ({
    setApiKey: vi.fn(),
    getApiKey: vi.fn().mockReturnValue('sk-test-key'),
    sendMessage: vi.fn(),
  })),
}))

/** 生成 mock 期刊，每次调用自动生成唯一 id */
function createMockJournal(overrides: Partial<{
  id: string
  date: string
  targetLang: string
  articlesCount: number
  generatedAt: number
}> = {}) {
  const ts = overrides.generatedAt ?? Date.now()
  const targetLang = overrides.targetLang || 'fr-FR'
  const date = overrides.date || '2026-W23'
  const id = overrides.id || `journal-${date}-${targetLang}-${ts}`
  const articlesCount = overrides.articlesCount || 3
  return {
    id,
    date,
    articles: Array.from({ length: articlesCount }, (_, i) => ({
      id: `article-${date}-${targetLang}-${i}`,
      title: `Article ${i + 1}`,
      category: '科技',
      imageQuery: 'tech',
      summary: 'Summary',
      content: 'Content '.repeat(50),
      translation: '翻译',
      difficulty: 'beginner' as const,
      keyWords: [
        { word: 'word', translation: '单词', sentence: 'A sentence.', sentenceTranslation: '一个句子。' },
      ],
      imageUrl: `https://picsum.photos/seed/tech/400/250`,
    })),
    generatedAt: ts,
    userLevel: '中级',
    nativeLang: 'zh-CN',
    targetLang,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())

  const ls: Record<string, string> = {
    doulingo_deepseek_api_key: 'sk-test-key',
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => ls[key] ?? null,
      setItem: (key: string, val: string) => { ls[key] = val },
      removeItem: (key: string) => { delete ls[key] },
      clear: () => { Object.keys(ls).forEach(k => delete ls[k]) },
    },
    writable: true,
    configurable: true,
  })

  Object.defineProperty(globalThis, 'window', {
    value: {
      electronAPI: {
        platform: 'darwin',
        bufferToBase64: vi.fn(),
        speechStart: vi.fn(),
        speechStop: vi.fn(),
        speechIsListening: vi.fn(),
        ttsSpeak: vi.fn(),
        ttsStop: vi.fn(),
        diagnosticCheck: vi.fn(),
        recognizeAudioBlob: vi.fn(),
        xfyunAsrRecognize: vi.fn(),
      },
    },
    writable: true,
    configurable: true,
  })

  vi.clearAllMocks()
})

// ============== 1. 基础保存 ==============
describe('vocabJournals - 基础保存', () => {
  it('生成后应保存到历史列表', async () => {
    mockGenerateJournal.mockResolvedValue(
      createMockJournal({ id: 'journal-2026-W23-fr-FR-1000', date: '2026-W23', generatedAt: 1000 })
    )
    const store = useAppStore()
    await store.generateWeeklyJournal()

    expect(store.vocabJournals.length).toBe(1)
    expect(store.vocabJournals[0].id).toBe('journal-2026-W23-fr-FR-1000')
    expect(store.vocabRecords.length).toBe(1)
    expect(store.vocabRecords[0].id).toBe('journal-2026-W23-fr-FR-1000')
  })

  it('多次生成不同 id 的期刊全部保留', async () => {
    mockGenerateJournal
      .mockResolvedValueOnce(createMockJournal({ id: 'j-1', date: '2026-W22', generatedAt: 1000 }))
      .mockResolvedValueOnce(createMockJournal({ id: 'j-2', date: '2026-W23', generatedAt: 2000 }))
      .mockResolvedValueOnce(createMockJournal({ id: 'j-3', date: '2026-W24', generatedAt: 3000 }))

    const store = useAppStore()

    await store.generateWeeklyJournal() // j-1
    expect(store.vocabJournals.length).toBe(1)

    await store.generateWeeklyJournal() // j-2
    expect(store.vocabJournals.length).toBe(2)

    await store.generateWeeklyJournal() // j-3
    expect(store.vocabJournals.length).toBe(3)

    const ids = store.vocabJournals.map(j => j.id)
    expect(ids).toEqual(['j-3', 'j-2', 'j-1']) // 倒序（最新在前）
    expect(store.vocabRecords.length).toBe(3)
  })
})

// ============== 2. 更新期刊（修复后行为） ==============
describe('vocabJournals - 更新期刊（修复后，每次生成独立保留）', () => {
  it('同周再次生成，两份期刊各自独立保留', async () => {
    // 第 1 次：id 唯一
    mockGenerateJournal.mockResolvedValueOnce(
      createMockJournal({ id: 'j-W23-v1', date: '2026-W23', articlesCount: 3, generatedAt: 1000 })
    )
    // 第 2 次：id 不同
    mockGenerateJournal.mockResolvedValueOnce(
      createMockJournal({ id: 'j-W23-v2', date: '2026-W23', articlesCount: 5, generatedAt: 2000 })
    )

    const store = useAppStore()

    await store.generateWeeklyJournal()
    expect(store.vocabJournals.length).toBe(1)
    expect(store.vocabJournals[0].articles.length).toBe(3)

    await store.generateWeeklyJournal()
    // 修复后：journals 累加到 2 条，而不是替换
    expect(store.vocabJournals.length).toBe(2)
    expect(store.vocabJournals[0].articles.length).toBe(5) // 最新在前
    expect(store.vocabJournals[1].articles.length).toBe(3) // 老的保留
    // records 也有 2 条
    expect(store.vocabRecords.length).toBe(2)
  })

  it('同周再生后，加载旧记录拿到与之对应的旧内容（而非最新）', async () => {
    mockGenerateJournal.mockResolvedValueOnce(
      createMockJournal({ id: 'j-W23-old', date: '2026-W23', articlesCount: 3, generatedAt: 1000 })
    )
    mockGenerateJournal.mockResolvedValueOnce(
      createMockJournal({ id: 'j-W23-new', date: '2026-W23', articlesCount: 5, generatedAt: 2000 })
    )

    const store = useAppStore()
    await store.generateWeeklyJournal()
    await store.generateWeeklyJournal()

    // 加载旧记录 → 拿到旧期刊内容
    store.loadVocabJournal('j-W23-old')
    expect(store.vocabJournal?.articles.length).toBe(3) // 正确！

    // 加载新记录 → 拿到新期刊内容
    store.loadVocabJournal('j-W23-new')
    expect(store.vocabJournal?.articles.length).toBe(5)
  })
})

// ============== 3. 多语种同周（原 BUG，修复后通过） ==============
describe('vocabJournals - 多语种同周（修复后共存）', () => {
  it('不同语种同周生成，各自独立保留', async () => {
    mockGenerateJournal.mockResolvedValueOnce(
      createMockJournal({ id: 'j-W23-fr', date: '2026-W23', targetLang: 'fr-FR', articlesCount: 3, generatedAt: 1000 })
    )
    mockGenerateJournal.mockResolvedValueOnce(
      createMockJournal({ id: 'j-W23-en', date: '2026-W23', targetLang: 'en-US', articlesCount: 5, generatedAt: 2000 })
    )

    const store = useAppStore()

    await store.generateWeeklyJournal()
    expect(store.vocabJournals.length).toBe(1)
    expect(store.vocabJournals[0].targetLang).toBe('fr-FR')

    await store.generateWeeklyJournal()
    // 修复后：两份同时存在
    expect(store.vocabJournals.length).toBe(2)
    expect(store.vocabJournals.some((j: any) => j.targetLang === 'fr-FR')).toBe(true)
    expect(store.vocabJournals.some((j: any) => j.targetLang === 'en-US')).toBe(true)
  })

  it('不同语种不同周正常保留', async () => {
    mockGenerateJournal
      .mockResolvedValueOnce(createMockJournal({ id: 'j-W22-fr', date: '2026-W22', targetLang: 'fr-FR', generatedAt: 1000 }))
      .mockResolvedValueOnce(createMockJournal({ id: 'j-W23-en', date: '2026-W23', targetLang: 'en-US', generatedAt: 2000 }))

    const store = useAppStore()
    await store.generateWeeklyJournal()
    await store.generateWeeklyJournal()

    expect(store.vocabJournals.length).toBe(2)
    expect(store.vocabJournals.some((j: any) => j.targetLang === 'fr-FR')).toBe(true)
    expect(store.vocabJournals.some((j: any) => j.targetLang === 'en-US')).toBe(true)
  })
})

// ============== 4. 上限限制 ==============
describe('vocabJournals - 上限限制', () => {
  it('期刊历史列表上限 20 份', async () => {
    const store = useAppStore()
    for (let i = 0; i < 25; i++) {
      mockGenerateJournal.mockResolvedValueOnce(
        createMockJournal({ id: `j-${i}`, date: '2026-W23', generatedAt: i * 1000 })
      )
      await store.generateWeeklyJournal()
    }
    expect(store.vocabJournals.length).toBe(20)
    // 记录限制 99，不受 20 影响
    expect(store.vocabRecords.length).toBe(25)
  })

  it('记录列表上限 99 条', async () => {
    const store = useAppStore()
    for (let i = 0; i < 110; i++) {
      mockGenerateJournal.mockResolvedValueOnce(
        createMockJournal({ id: `j-${i}`, date: '2026-W23', generatedAt: i * 1000 })
      )
      await store.generateWeeklyJournal()
    }
    expect(store.vocabRecords.length).toBe(99)
  })
})

// ============== 5. 删除 ==============
describe('vocabJournals - 删除', () => {
  it('删除单份不影响其他', async () => {
    mockGenerateJournal
      .mockResolvedValueOnce(createMockJournal({ id: 'j-W22', date: '2026-W22', generatedAt: 1000 }))
      .mockResolvedValueOnce(createMockJournal({ id: 'j-W23', date: '2026-W23', generatedAt: 2000 }))
      .mockResolvedValueOnce(createMockJournal({ id: 'j-W24', date: '2026-W24', generatedAt: 3000 }))

    const store = useAppStore()
    await store.generateWeeklyJournal()
    await store.generateWeeklyJournal()
    await store.generateWeeklyJournal()
    expect(store.vocabJournals.length).toBe(3)

    store.deleteVocabJournal('j-W23')
    expect(store.vocabJournals.length).toBe(2)
    expect(store.vocabJournals.some((j: any) => j.id === 'j-W23')).toBe(false)
    expect(store.vocabJournals.some((j: any) => j.id === 'j-W22')).toBe(true)
    expect(store.vocabJournals.some((j: any) => j.id === 'j-W24')).toBe(true)
    // records 同步删除
    expect(store.vocabRecords.some((r: any) => r.id === 'j-W23')).toBe(false)
    expect(store.vocabRecords.length).toBe(2)
  })

  it('清空全部移除所有', async () => {
    mockGenerateJournal
      .mockResolvedValueOnce(createMockJournal({ id: 'j-W22', date: '2026-W22' }))
      .mockResolvedValueOnce(createMockJournal({ id: 'j-W23', date: '2026-W23' }))

    const store = useAppStore()
    await store.generateWeeklyJournal()
    await store.generateWeeklyJournal()

    store.vocabRecords = []
    store.vocabJournals = []

    expect(store.vocabJournals.length).toBe(0)
    expect(store.vocabRecords.length).toBe(0)
  })
})

// ============== 6. 加载 ==============
describe('vocabJournals - 加载', () => {
  it('loadVocabJournal 正确加载指定期刊', async () => {
    mockGenerateJournal
      .mockResolvedValueOnce(createMockJournal({ id: 'j-W22', date: '2026-W22' }))
      .mockResolvedValueOnce(createMockJournal({ id: 'j-W23', date: '2026-W23' }))

    const store = useAppStore()
    await store.generateWeeklyJournal() // j-W22 当前
    await store.generateWeeklyJournal() // j-W23 当前

    expect(store.vocabJournal?.id).toBe('j-W23')

    store.loadVocabJournal('j-W22')
    expect(store.vocabJournal?.id).toBe('j-W22')

    store.loadVocabJournal('j-W23')
    expect(store.vocabJournal?.id).toBe('j-W23')
  })

  it('加载不存在的 id 不应改变当前', async () => {
    mockGenerateJournal.mockResolvedValueOnce(createMockJournal({ id: 'j-W23', date: '2026-W23' }))
    const store = useAppStore()
    await store.generateWeeklyJournal()

    const prev = store.vocabJournal
    store.loadVocabJournal('nonexistent-id')
    expect(store.vocabJournal).toBe(prev)
  })
})
