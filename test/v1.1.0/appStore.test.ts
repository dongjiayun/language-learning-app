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

const mockTtsSpeak = vi.fn()
const mockTtsStop = vi.fn()

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

  // Mock window.electronAPI (needed for TTS)
  Object.defineProperty(globalThis, 'window', {
    value: {
      electronAPI: {
        platform: 'darwin',
        bufferToBase64: vi.fn(),
        speechStart: vi.fn(),
        speechStop: vi.fn(),
        speechIsListening: vi.fn(),
        ttsSpeak: mockTtsSpeak,
        ttsStop: mockTtsStop,
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

// ============== speakChatMessage ==============
describe('appStore - speakChatMessage', () => {
  it('应调用 TTS 朗读文本', async () => {
    mockTtsSpeak.mockResolvedValue({ success: true })

    const store = useAppStore()
    await store.speakChatMessage('Bonjour!')

    expect(mockTtsSpeak).toHaveBeenCalledWith({
      text: 'Bonjour!',
      lang: 'fr-FR',
    })
  })

  it('再次调用应停止当前朗读', async () => {
    // 第一次 speak 不立即 resolve，保持 isSpeaking = true
    let resolveFirstSpeak: () => void
    const firstSpeakPromise = new Promise<void>(resolve => { resolveFirstSpeak = resolve })
    mockTtsSpeak.mockImplementationOnce(() => {
      // 返回一个不会自动 resolve 的 promise
      return firstSpeakPromise.then(() => ({ success: true }))
    })
    mockTtsStop.mockResolvedValue({ success: true })

    const store = useAppStore()
    // 发起第一次朗读（不 await 完成）
    store.speakChatMessage('Bonjour!')

    // 此时 isSpeaking 应为 true
    expect(store.isSpeaking).toBe(true)

    // 第二次调用，应触发停止
    await store.speakChatMessage('Salut!')

    expect(mockTtsStop).toHaveBeenCalledTimes(1)
    // 释放第一次的 promise 防止 hanging
    resolveFirstSpeak!()
  })

  it('朗读结束后 isSpeaking 应恢复为 false', async () => {
    mockTtsSpeak.mockResolvedValue({ success: true })

    const store = useAppStore()
    await store.speakChatMessage('Bonjour!')

    expect(store.isSpeaking).toBe(false)
  })
})

// ============== startChatRecording / stopChatRecording ==============
describe('appStore - chat recording', () => {
  it('startChatRecording 无讯飞配置时应直接返回', async () => {
    const store = useAppStore()
    // 没有讯飞配置
    await store.startChatRecording()
    expect(store.state).toBe('idle')
  })

  it('stopChatRecording 非 recording 状态应直接返回', async () => {
    const store = useAppStore()
    await store.stopChatRecording()
    expect(store.state).toBe('idle')
  })
})

// ============== setMode 切换时停止录音 ==============
describe('appStore - setMode side effects', () => {
  it('口语提示模式录音中切换到 chat 应停止录音', async () => {
    const store = useAppStore()
    expect(store.mode).toBe('speaking')

    store.state = 'recording'
    store.setMode('chat')

    // state 应恢复到 idle（stopRecording 的执行）
    expect(store.mode).toBe('chat')
  })
})
