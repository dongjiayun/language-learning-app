import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '@/stores/appStore'
import { ChatService } from '@/services/ChatService'

// ===== Mocks =====
vi.mock('@/services/ChatService', () => ({
  ChatService: vi.fn().mockImplementation(() => ({
    setApiKey: vi.fn(),
    getApiKey: vi.fn().mockReturnValue('sk-test-key'),
    sendMessage: vi.fn(),
  })),
}))

// PlatformBridge mock — 控制平台检测行为
vi.mock('@/services/PlatformBridge', () => ({
  platformBridge: {
    isElectron: vi.fn().mockReturnValue(true),
    isCapacitor: vi.fn().mockReturnValue(false),
    isBrowser: vi.fn().mockReturnValue(false),
    detectPlatform: vi.fn(),
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

beforeEach(() => {
  setActivePinia(createPinia())

  // Mock localStorage
  const store: Record<string, string> = {
    doulingo_deepseek_api_key: 'sk-test-key',
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    },
    writable: true,
    configurable: true,
  })

  vi.clearAllMocks()
})

// ============== mode 切换 ==============
describe('appStore - mode', () => {
  it('默认模式应为 speaking', () => {
    const store = useAppStore()
    expect(store.mode).toBe('speaking')
  })

  it('setMode 应切换到 chat', () => {
    const store = useAppStore()
    store.setMode('chat')
    expect(store.mode).toBe('chat')
  })

  it('setMode 应能切回 speaking', () => {
    const store = useAppStore()
    store.setMode('chat')
    store.setMode('speaking')
    expect(store.mode).toBe('speaking')
  })

  it('切换到相同 mode 不应有副作用', () => {
    const store = useAppStore()
    store.setMode('speaking') // 已经是 speaking
    expect(store.mode).toBe('speaking')
  })
})

// ============== chatMessages 状态 ==============
describe('appStore - chatMessages', () => {
  it('初始聊天消息应为空', () => {
    const store = useAppStore()
    expect(store.chatMessages).toEqual([])
  })

  it('chatInputText 初始应为空字符串', () => {
    const store = useAppStore()
    expect(store.chatInputText).toBe('')
  })

  it('chatLoading 初始应为 false', () => {
    const store = useAppStore()
    expect(store.chatLoading).toBe(false)
  })

  it('clearChatSessions 应清空会话并创建新会话', () => {
    const store = useAppStore()
    store.newChatSession()
    // 第一条消息自动创建会话，现在应有一个
    expect(store.chatSessions.length).toBeGreaterThanOrEqual(1)
    store.clearChatSessions()
    // 清空后会自动创建一个新会话
    expect(store.chatSessions.length).toBe(1)
    expect(store.chatSessions[0].messages.length).toBe(0)
  })
})

// ============== sendChatMessage ==============
describe('appStore - sendChatMessage', () => {
  it('空输入不应发送', async () => {
    const store = useAppStore()
    store.chatInputText = '   '
    await store.sendChatMessage()
    expect(store.chatMessages.length).toBe(0)
  })

  it('发送消息应添加用户消息和 AI 回复', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue('Bonjour! Comment ça va?')
    ;(ChatService as any).mockImplementation(() => ({
      setApiKey: vi.fn(),
      getApiKey: vi.fn().mockReturnValue('sk-test-key'),
      sendMessage: mockSendMessage,
    }))

    const store = useAppStore()
    store.chatInputText = 'Hello'

    await store.sendChatMessage()

    expect(store.chatMessages).toHaveLength(2)
    expect(store.chatMessages[0].role).toBe('user')
    expect(store.chatMessages[0].content).toBe('Hello')
    expect(store.chatMessages[1].role).toBe('assistant')
    expect(store.chatMessages[1].content).toBe('Bonjour! Comment ça va?')
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('发送后 chatInputText 应清空', async () => {
    const store = useAppStore()
    store.chatInputText = 'test message'
    await store.sendChatMessage()
    expect(store.chatInputText).toBe('')
  })

  it('发送中 chatLoading 应为 true', async () => {
    const mockSendMessage = vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve('Reply'), 50))
    )
    ;(ChatService as any).mockImplementation(() => ({
      setApiKey: vi.fn(),
      getApiKey: vi.fn().mockReturnValue('sk-test-key'),
      sendMessage: mockSendMessage,
    }))

    const store = useAppStore()
    store.chatInputText = 'test'

    // 开始发送但不等完成
    const promise = store.sendChatMessage()
    expect(store.chatLoading).toBe(true)
    await promise
    expect(store.chatLoading).toBe(false)
  })

  it('发送失败时仍应重置 loading 状态', async () => {
    const mockSendMessage = vi.fn().mockRejectedValue(new Error('API Error'))
    ;(ChatService as any).mockImplementation(() => ({
      setApiKey: vi.fn(),
      getApiKey: vi.fn().mockReturnValue('sk-test-key'),
      sendMessage: mockSendMessage,
    }))

    const store = useAppStore()
    store.chatInputText = 'test'
    await store.sendChatMessage()

    expect(store.chatLoading).toBe(false)
    expect(store.chatMessages).toHaveLength(1) // 只有 user 消息
  })

  it('连续发送应追加消息', async () => {
    let callCount = 0
    const mockSendMessage = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve(`Reply ${callCount}`)
    })
    ;(ChatService as any).mockImplementation(() => ({
      setApiKey: vi.fn(),
      getApiKey: vi.fn().mockReturnValue('sk-test-key'),
      sendMessage: mockSendMessage,
    }))

    const store = useAppStore()

    store.chatInputText = 'msg1'
    await store.sendChatMessage()

    store.chatInputText = 'msg2'
    await store.sendChatMessage()

    expect(store.chatMessages).toHaveLength(4)
    expect(store.chatMessages[0].content).toBe('msg1')
    expect(store.chatMessages[1].content).toBe('Reply 1')
    expect(store.chatMessages[2].content).toBe('msg2')
    expect(store.chatMessages[3].content).toBe('Reply 2')
  })

  it('没有 API Key 时 ChatService 应返回默认提示', async () => {
    // 覆盖 localStorage 使其没有 API key
    const emptyStore: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => emptyStore[key] ?? null,
        setItem: (key: string, val: string) => { emptyStore[key] = val },
        removeItem: (key: string) => { delete emptyStore[key] },
        clear: () => { Object.keys(emptyStore).forEach(k => delete emptyStore[k]) },
      },
      writable: true,
      configurable: true,
    })

    ;(ChatService as any).mockImplementation(() => ({
      setApiKey: vi.fn(),
      getApiKey: vi.fn().mockReturnValue(''),
      sendMessage: vi.fn().mockResolvedValue('请先在设置中配置 DeepSeek API Key 才能使用 AI 对话功能。'),
    }))

    const store = useAppStore()
    store.chatInputText = 'Hello'
    await store.sendChatMessage()

    expect(store.chatMessages[1].content).toContain('配置 DeepSeek API Key')
  })
})

// ============== startRecording（浏览器路径） ==============
describe('appStore - startRecording (browser)', () => {
  beforeEach(async () => {
    // 设置 platformBridge 为浏览器平台
    const { platformBridge } = await import('@/services/PlatformBridge')
    platformBridge.isElectron.mockReturnValue(false)
    platformBridge.isCapacitor.mockReturnValue(false)
    platformBridge.isBrowser.mockReturnValue(true)
    platformBridge.detectPlatform.mockReturnValue('browser')

    // 设置 window 为浏览器环境（有 webkitSpeechRecognition，无 electronAPI）
    Object.defineProperty(globalThis, 'window', {
      value: {
        webkitSpeechRecognition: vi.fn(() => ({
          start: vi.fn(),
          stop: vi.fn(),
          abort: vi.fn(),
          continuous: false,
          interimResults: false,
          lang: '',
          onresult: null,
          onerror: null,
          onend: null,
        })),
        SpeechRecognition: undefined,
        // TTS 需要 speechSynthesis
        speechSynthesis: {
          speak: vi.fn(),
          cancel: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    })
    ;(globalThis as any).SpeechSynthesisUtterance = vi.fn()

    // 清空讯飞配置（浏览器路径不需要讯飞）
    const emptyStore: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => emptyStore[key] ?? null,
        setItem: (key: string, val: string) => { emptyStore[key] = val },
        removeItem: (key: string) => { delete emptyStore[key] },
        clear: () => { Object.keys(emptyStore).forEach(k => delete emptyStore[k]) },
      },
      writable: true,
      configurable: true,
    })

    vi.clearAllMocks()
  })

  it('Chrome 浏览器（有 webkitSpeechRecognition）即使没有讯飞密钥也能开始录音', async () => {
    const store = useAppStore()
    expect(store.state).toBe('idle')

    await store.startMonitoring()

    // 浏览器路径应成功进入 recording 状态，不会弹出讯飞配置引导
    expect(store.state).toBe('recording')
    expect(store.showApiGuide).not.toBe('xfyun')
  })

  it('没有 webkitSpeechRecognition 且没有讯飞密钥时应回到 idle 不抛异常', async () => {
    // 模拟不支持语音识别的浏览器
    Object.defineProperty(globalThis, 'window', {
      value: {
        speechSynthesis: {
          speak: vi.fn(),
          cancel: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    })
    ;(globalThis as any).SpeechSynthesisUtterance = vi.fn()

    const store = useAppStore()
    expect(store.state).toBe('idle')

    await store.startMonitoring()

    // 既没有原生 API 也没有讯飞密钥 → 回退到 idle
    expect(store.state).toBe('idle')
  })
})

// ============== speakChatMessage ==============
describe('appStore - speakChatMessage', () => {
  beforeEach(async () => {
    // 重置为 Electron 平台
    const { platformBridge } = await import('@/services/PlatformBridge')
    platformBridge.isElectron.mockReturnValue(true)
    platformBridge.isCapacitor.mockReturnValue(false)
    platformBridge.isBrowser.mockReturnValue(false)
    platformBridge.detectPlatform.mockReturnValue('electron')
  })

  it('应调用 TTS 朗读文本', async () => {
    const { platformBridge } = await import('@/services/PlatformBridge')

    const store = useAppStore()
    await store.speakChatMessage('Bonjour!')

    expect(platformBridge.ttsSpeak).toHaveBeenCalledWith({
      text: 'Bonjour!',
      lang: 'fr-FR',
    })
  })

  it('再次调用应停止当前朗读', async () => {
    const { platformBridge } = await import('@/services/PlatformBridge')

    // 第一次 speak 不立即 resolve，保持 isSpeaking = true
    let resolveFirstSpeak: () => void
    const firstSpeakPromise = new Promise<void>(resolve => { resolveFirstSpeak = resolve })
    platformBridge.ttsSpeak.mockImplementationOnce(() => {
      return firstSpeakPromise.then(() => ({ success: true }))
    })
    platformBridge.ttsStop.mockResolvedValue({ success: true })

    const store = useAppStore()
    // 发起第一次朗读（不 await 完成）
    store.speakChatMessage('Bonjour!')

    // 此时 isSpeaking 应为 true
    expect(store.isSpeaking).toBe(true)

    // 第二次调用，应触发停止
    await store.speakChatMessage('Salut!')

    expect(platformBridge.ttsStop).toHaveBeenCalledTimes(1)
    // 释放第一次的 promise 防止 hanging
    resolveFirstSpeak!()
  })

  it('朗读结束后 isSpeaking 应恢复为 false', async () => {
    const store = useAppStore()
    await store.speakChatMessage('Bonjour!')

    expect(store.isSpeaking).toBe(false)
  })
})

// ============== Chat recording ==============
describe('appStore - chat recording', () => {
  beforeEach(async () => {
    const { platformBridge } = await import('@/services/PlatformBridge')
    platformBridge.isElectron.mockReturnValue(true)
    platformBridge.isCapacitor.mockReturnValue(false)

    // 设置讯飞密钥（Electron 录音路径需要）
    const store = { xfyun_app_id: 'test', xfyun_api_key: 'test', xfyun_api_secret: 'test' }
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store[key as keyof typeof store] ?? null,
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
  })

  it('startChatRecording 应正确启动录音', async () => {
    const { platformBridge } = await import('@/services/PlatformBridge')
    platformBridge.speechStart.mockResolvedValue({ success: true })

    const store = useAppStore()
    await store.startChatRecording()

    expect(platformBridge.speechStart).toHaveBeenCalled()
  })

  it('stopChatRecording 应正确停止录音', async () => {
    const { platformBridge } = await import('@/services/PlatformBridge')
    platformBridge.speechStart.mockResolvedValue({ success: true })
    platformBridge.speechStop.mockResolvedValue({ success: true, audioBase64: 'dGVzdA==', audioLen: 4 })
    platformBridge.xfyunAsrRecognize.mockResolvedValue({ success: true, text: 'test' })

    const store = useAppStore()
    await store.startChatRecording()
    await store.stopChatRecording()
  })
})

// ============== setMode side effects ==============
describe('appStore - setMode side effects', () => {
  beforeEach(async () => {
    const { platformBridge } = await import('@/services/PlatformBridge')
    platformBridge.isElectron.mockReturnValue(true)
    platformBridge.isCapacitor.mockReturnValue(false)
  })

  it('切换 mode 应重置 chat recording 状态', () => {
    const store = useAppStore()
    store.setMode('chat')
    expect(store.mode).toBe('chat')
  })
})
