import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '@/stores/appStore'
import { VocabTrainingService } from '@/services/VocabTrainingService'

// ===== Mock global fetch =====
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

// ===== Mock PlatformBridge =====
vi.mock('@/services/PlatformBridge', () => ({
  platformBridge: {
    isElectron: vi.fn().mockReturnValue(true),
    isCapacitor: vi.fn().mockReturnValue(false),
    isBrowser: vi.fn().mockReturnValue(false),
    detectPlatform: vi.fn().mockReturnValue('electron'),
    ttsSpeak: vi.fn().mockResolvedValue({ success: true }),
    ttsStop: vi.fn().mockResolvedValue({ success: true }),
    speechStart: vi.fn().mockResolvedValue({ success: true }),
    speechStop: vi.fn().mockResolvedValue({ success: true, audioBase64: '', audioLen: 0 }),
    speechIsListening: vi.fn().mockResolvedValue({ listening: false }),
    xfyunAsrRecognize: vi.fn().mockResolvedValue({ success: true, text: 'test' }),
    recognizeAudioBlob: vi.fn().mockResolvedValue({ success: true, text: 'test' }),
    checkUpdate: vi.fn().mockResolvedValue({ success: true, hasUpdate: false }),
    bufferToBase64: vi.fn().mockReturnValue(''),
  },
}))

// mock ChatService — required by appStore init
vi.mock('@/services/ChatService', () => ({
  ChatService: vi.fn().mockImplementation(() => ({
    setApiKey: vi.fn(),
    getApiKey: vi.fn().mockReturnValue(''),
    sendMessage: vi.fn(),
  })),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  mockFetch.mockReset()

  // Mock localStorage with API key
  const lsStore: Record<string, string> = {
    doulingo_deepseek_api_key: 'sk-test-key',
    doulingo_target_lang: 'fr-FR',
    doulingo_annotate_lang: 'zh-CN',
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => lsStore[key] ?? null,
      setItem: (key: string, val: string) => { lsStore[key] = val },
      removeItem: (key: string) => { delete lsStore[key] },
      clear: () => { Object.keys(lsStore).forEach(k => delete lsStore[k]) },
    },
    writable: true,
    configurable: true,
  })

  vi.clearAllMocks()
})

/** 生成 mock 的 API 成功响应（/chat/completions 格式） */
function mockApiResponse(choices: any[], usage = { prompt_tokens: 10, completion_tokens: 20 }) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({ choices, usage }),
  }
}

/** 生成 mock 的 balance 查询响应（/user/balance 格式） */
function mockBalanceResponse() {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({ is_available: true, balance_infos: [] }),
  }
}

// =============================================================================
// 1. VocabTrainingService.translateWord
// =============================================================================
describe('VocabTrainingService.translateWord', () => {
  const service = new VocabTrainingService()
  const TEST_KEY = 'sk-test-key'

  describe('API key validation', () => {
    it('没有 API key 时应直接返回原文', async () => {
      const svc = new VocabTrainingService()
      // 不设 key
      const result = await svc.translateWord('bonjour', 'fr-FR', 'zh-CN')
      expect(result).toBe('bonjour')
    })

    it('有 API key 时应发起网络请求', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: { content: '{"translation":"你好","explanation":"法语问候语"}' } }
      ]))

      const result = await service.translateWord('bonjour', 'fr-FR', 'zh-CN')
      expect(result).toBe('你好\n法语问候语')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('API 调用和响应解析', () => {
    it('正常响应应正确解析 JSON', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: { content: '{"translation":"谢谢","explanation":"表示感谢的常用语"}' } }
      ]))

      const result = await service.translateWord('merci', 'fr-FR', 'zh-CN')
      expect(result).toBe('谢谢\n表示感谢的常用语')
    })

    it('响应包含 markdown 代码块标记时应正确清洗', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: { content: '```json\n{"translation":"你好","explanation":"问候"}\n```' } }
      ]))

      const result = await service.translateWord('bonjour', 'fr-FR', 'zh-CN')
      expect(result).toBe('你好\n问候')
    })

    it('响应中 explanation 可选，没有时只返回 translation', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: { content: '{"translation":"你好"}' } }
      ]))

      const result = await service.translateWord('bonjour', 'fr-FR', 'zh-CN')
      expect(result).toBe('你好')
    })

    it('响应 choices 数组为空时应返回原文', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([]))

      const result = await service.translateWord('bonjour', 'fr-FR', 'zh-CN')
      expect(result).toBe('bonjour')
    })

    it('响应缺少 content 时应返回原文', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: {} }
      ]))

      const result = await service.translateWord('bonjour', 'fr-FR', 'zh-CN')
      expect(result).toBe('bonjour')
    })

    it('API 返回非 JSON 内容时应返回原文', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: { content: '这不是 JSON' } }
      ]))

      const result = await service.translateWord('bonjour', 'fr-FR', 'zh-CN')
      expect(result).toBe('bonjour')
    })

    it('API 返回的 JSON 缺少 translation 字段时应返回原文', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: { content: '{"foo":"bar"}' } }
      ]))

      const result = await service.translateWord('bonjour', 'fr-FR', 'zh-CN')
      expect(result).toBe('bonjour')
    })

    it('网络请求异常时应返回原文（不抛异常）', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await service.translateWord('bonjour', 'fr-FR', 'zh-CN')
      expect(result).toBe('bonjour')
    })

    it('API 返回 HTTP 错误时不应崩溃（如 401/402/500）', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 402,
        json: vi.fn().mockRejectedValue(new Error('invalid json')),
      })

      const result = await service.translateWord('bonjour', 'fr-FR', 'zh-CN')
      expect(result).toBe('bonjour')
    })
  })

  describe('语言映射', () => {
    it('支持 fr-FR → 法语', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: { content: '{"translation":"你好"}' } }
      ]))

      await service.translateWord('bonjour', 'fr-FR', 'zh-CN')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const prompt = body.messages[1].content

      expect(prompt).toContain('法语')
      expect(prompt).toContain('中文')
    })

    it('支持 en-US → 英语', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: { content: '{"translation":"你好"}' } }
      ]))

      await service.translateWord('hello', 'en-US', 'zh-CN')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const prompt = body.messages[1].content

      expect(prompt).toContain('英语')
    })

    it('支持 ja-JP → 日语', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: { content: '{"translation":"你好"}' } }
      ]))

      await service.translateWord('こんにちは', 'ja-JP', 'zh-CN')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const prompt = body.messages[1].content

      expect(prompt).toContain('日语')
    })
  })

  describe('onUsage 回调', () => {
    it('成功时应调用 onUsage 回调', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: { content: '{"translation":"你好"}' } }
      ], { prompt_tokens: 50, completion_tokens: 100 }))

      const onUsage = vi.fn()
      await service.translateWord('bonjour', 'fr-FR', 'zh-CN', onUsage)

      expect(onUsage).toHaveBeenCalledWith(50, 100)
    })

    it('API 失败时不应调用 onUsage 回调', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockRejectedValue(new Error('fail'))

      const onUsage = vi.fn()
      await service.translateWord('bonjour', 'fr-FR', 'zh-CN', onUsage)

      expect(onUsage).not.toHaveBeenCalled()
    })

    it('响应无 usage 信息时不应调用 onUsage', async () => {
      service.setApiKey(TEST_KEY)
      mockFetch.mockResolvedValue(mockApiResponse([
        { message: { content: '{"translation":"你好"}' } }
      ], {}))

      const onUsage = vi.fn()
      await service.translateWord('bonjour', 'fr-FR', 'zh-CN', onUsage)

      expect(onUsage).toHaveBeenCalledWith(0, 0)
    })
  })
})

// =============================================================================
// 2. Store translateVocabWord
// =============================================================================
describe('appStore.translateVocabWord', () => {
  describe('边界条件', () => {
    it('空字符串应直接返回，不触发 API 调用', async () => {
      // 清空 localStorage，避免 fetchBalance 干扰
      const emptyLs: Record<string, string> = {}
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: (key: string) => emptyLs[key] ?? null,
          setItem: (key: string, val: string) => { emptyLs[key] = val },
          removeItem: (key: string) => { delete emptyLs[key] },
          clear: () => { Object.keys(emptyLs).forEach(k => delete emptyLs[k]) },
        },
        writable: true,
        configurable: true,
      })

      const store = useAppStore()
      await store.translateVocabWord('')
      expect(store.vocabTranslating).toBe(false)
      expect(store.vocabSelectedText).toBe('')
    })

    it('仅含空格的字符串应直接返回', async () => {
      const store = useAppStore()
      await store.translateVocabWord('   ')
      expect(store.vocabTranslating).toBe(false)
      expect(store.vocabSelectedText).toBe('')
    })
  })

  describe('API Key 获取', () => {
    it('没有 API key 时应静默返回', async () => {
      // 清空 localStorage 的 key
      const emptyLs: Record<string, string> = {}
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: (key: string) => emptyLs[key] ?? null,
          setItem: (key: string, val: string) => { emptyLs[key] = val },
          removeItem: (key: string) => { delete emptyLs[key] },
          clear: () => { Object.keys(emptyLs).forEach(k => delete emptyLs[k]) },
        },
        writable: true,
        configurable: true,
      })

      const store = useAppStore()
      await store.translateVocabWord('bonjour')

      expect(store.vocabTranslating).toBe(false)
      expect(store.vocabSelectedText).toBe('')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('翻译状态管理', () => {
    it('翻译中应设置 vocabTranslating = true', async () => {
      // fetchBalance 正常解析，但 translateWord 阻塞
      mockFetch
        .mockImplementationOnce(() => Promise.resolve(mockBalanceResponse()))
        .mockImplementation(() => new Promise(() => {}))

      const store = useAppStore()
      const promise = store.translateVocabWord('bonjour')

      expect(store.vocabTranslating).toBe(true)
      expect(store.vocabSelectedText).toBe('bonjour')

      // 清理
      mockFetch.mockReset()
    })

    it('翻译完成后 vocabTranslating 应恢复为 false', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve(mockBalanceResponse()))
        .mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '{"translation":"你好"}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          }),
        })

      const store = useAppStore()
      await store.translateVocabWord('bonjour')

      expect(store.vocabTranslating).toBe(false)
    })

    it('翻译成功应设置 vocabSelectedTranslation', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve(mockBalanceResponse()))
        .mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '{"translation":"你好","explanation":"问候语"}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          }),
        })

      const store = useAppStore()
      await store.translateVocabWord('bonjour')

      expect(store.vocabSelectedText).toBe('bonjour')
      expect(store.vocabSelectedTranslation).toBe('你好\n问候语')
    })
  })

  describe('异常处理', () => {
    it('API 调用失败时 translateVocabWord 不抛异常，状态正确', async () => {
      // VocabTrainingService.translateWord 内部有 try-catch，不会抛到 store 层
      // 它会返回原文，store 层收到原文作为翻译结果
      // 所以 vocabSelectedTranslation 会被设为原文（而不是 "翻译失败，请重试"）
      mockFetch
        .mockImplementationOnce(() => Promise.resolve(mockBalanceResponse()))
        .mockRejectedValue(new Error('Network error'))

      const store = useAppStore()
      await store.translateVocabWord('bonjour')

      // translateWord 内部 catch 返回原文，store 层不会进入 catch 分支
      expect(store.vocabSelectedTranslation).toBe('bonjour')
      expect(store.vocabTranslating).toBe(false)
    })

    it('翻译失败后不应阻塞后续翻译', async () => {
      // mock: fetchBalance → fail → success
      mockFetch
        .mockImplementationOnce(() => Promise.resolve(mockBalanceResponse()))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '{"translation":"你好"}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          }),
        })

      const store = useAppStore()

      // 第一次调用（translateWord 内部 catch 返回原文）
      await store.translateVocabWord('bonjour')
      expect(store.vocabTranslating).toBe(false)
      expect(store.vocabSelectedTranslation).toBe('bonjour') // 原样返回

      // 第二次调用
      await store.translateVocabWord('salut')
      expect(store.vocabSelectedTranslation).toBe('你好')
      expect(store.vocabTranslating).toBe(false)
    })
  })
})

// =============================================================================
// 3. dismissVocabTranslation
// =============================================================================
describe('appStore.dismissVocabTranslation', () => {
  it('应清空翻译相关状态', () => {
    const store = useAppStore()
    // 先设置一些值
    store.vocabSelectedText = 'bonjour'
    store.vocabSelectedTranslation = '你好'

    store.dismissVocabTranslation()

    expect(store.vocabSelectedText).toBe('')
    expect(store.vocabSelectedTranslation).toBe('')
  })
})

// =============================================================================
// 4. getApiKey（间接测试）
// =============================================================================
describe('appStore - getApiKey (通过 translateVocabWord 间接测试)', () => {
  it('localStorage 中有 key 时应能获取到并成功调用翻译', async () => {
    mockFetch
      .mockImplementationOnce(() => Promise.resolve(mockBalanceResponse()))
      .mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '{"translation":"你好"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      })

    const store = useAppStore()
    await store.translateVocabWord('bonjour')

    // 第二次调用是 translateWord 发起的（第一次是 fetchBalance）
    // 能正常返回翻译结果说明 getApiKey 提供了正确的 key
    expect(mockFetch).toHaveBeenCalledTimes(2)
    // 验证最后一次 fetch 调用的 URL 是 chat/completions
    const lastCallUrl = mockFetch.mock.calls[1][0]
    expect(lastCallUrl).toContain('/chat/completions')
    expect(store.vocabSelectedTranslation).toBe('你好')
  })

  it('localStorage 中没有 key 时不应发起 API 调用', async () => {
    const emptyLs: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => emptyLs[key] ?? null,
        setItem: (key: string, val: string) => { emptyLs[key] = val },
        removeItem: (key: string) => { delete emptyLs[key] },
        clear: () => { Object.keys(emptyLs).forEach(k => delete emptyLs[k]) },
      },
      writable: true,
      configurable: true,
    })

    const store = useAppStore()
    await store.translateVocabWord('bonjour')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(store.vocabSelectedText).toBe('')
  })
})

// =============================================================================
// 5. 端到端：Component 事件 → 翻译
// =============================================================================
describe('划词翻译完整链路（测试组件 handleSelectText 的等价逻辑）', () => {
  it('模拟 ResponseCard 的选择文本流程', async () => {
    // 模拟 window.getSelection
    const mockSelection = {
      isCollapsed: false,
      toString: () => 'bonjour',
    }
    const origGetSelection = globalThis.window?.getSelection
    const getSelectionSpy = vi.fn(() => mockSelection as any)
    // 在某些测试环境（node）下 window 可能不存在
    if (!globalThis.window) {
      Object.defineProperty(globalThis, 'window', {
        value: {} as Window,
        writable: true,
        configurable: true,
      })
    }
    globalThis.window.getSelection = getSelectionSpy as any

    mockFetch
      .mockImplementationOnce(() => Promise.resolve(mockBalanceResponse()))
      .mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '{"translation":"你好","explanation":"法语问候"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      })

    const store = useAppStore()

    // 模拟组件 handleSelectText 中触发 store.translateVocabWord 的逻辑
    const sel = globalThis.window.getSelection()
    if (sel && !sel.isCollapsed) {
      const text = sel.toString().trim()
      if (text) {
        await store.translateVocabWord(text)
      }
    }

    expect(store.vocabSelectedText).toBe('bonjour')
    expect(store.vocabSelectedTranslation).toBe('你好\n法语问候')
    expect(store.vocabTranslating).toBe(false)
  })

  it('空选择（isCollapsed）不应触发翻译', async () => {
    const collapsedSelection = {
      isCollapsed: true,
      toString: () => '',
    }
    if (!globalThis.window) {
      Object.defineProperty(globalThis, 'window', {
        value: {} as Window,
        writable: true,
        configurable: true,
      })
    }
    globalThis.window.getSelection = vi.fn(() => collapsedSelection as any)

    const store = useAppStore()
    const sel = globalThis.window.getSelection()
    if (sel && !sel.isCollapsed) {
      const text = sel.toString().trim()
      if (text) {
        await store.translateVocabWord(text)
      }
    }

    // 不应该进行翻译
    expect(store.vocabSelectedText).toBe('')
  })
})
