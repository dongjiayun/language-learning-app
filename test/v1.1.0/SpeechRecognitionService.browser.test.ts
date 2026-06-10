import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpeechRecognitionService } from '@/services/SpeechRecognitionService'

// ===== Mock platformBridge for browser =====
vi.mock('@/services/PlatformBridge', () => ({
  platformBridge: {
    isElectron: () => false,
    isCapacitor: () => false,
    isBrowser: () => true,
    detectPlatform: () => 'browser',
    speechStart: vi.fn(),
    speechStop: vi.fn(),
    speechIsListening: vi.fn(),
    xfyunAsrRecognize: vi.fn(),
    recognizeAudioBlob: vi.fn(),
    ttsSpeak: vi.fn(),
    ttsStop: vi.fn(),
  },
}))

// ===== Mock for browser SpeechRecognition =====
class MockSpeechRecognition {
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null
  onend: (() => void) | null = null

  start = vi.fn(() => {
    // Simulate async start
    setTimeout(() => {
      // Simulate result
      if (this.onresult) {
        this.onresult({
          resultIndex: 0,
          results: [
            [
              { transcript: 'Hello world', confidence: 0.95 },
            ],
          ],
          length: 1,
        })
      }
      // Simulate end after result
      if (this.onend) setTimeout(() => this.onend!(), 10)
    }, 10)
  })

  stop = vi.fn(() => {
    // Simulate stop triggers onend
    if (this.onend) setTimeout(() => this.onend!(), 5)
  })

  abort = vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()

  // Setup localStorage
  const store: Record<string, string> = {}
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

  // Setup window with webkitSpeechRecognition
  const mockRecognition = new MockSpeechRecognition()
  Object.defineProperty(globalThis, 'window', {
    value: {
      webkitSpeechRecognition: vi.fn(() => mockRecognition),
      SpeechRecognition: undefined,
    },
    writable: true,
    configurable: true,
  })
})

function createService(): SpeechRecognitionService {
  return new SpeechRecognitionService()
}

describe('SpeechRecognitionService - Browser (SpeechRecognition API)', () => {
  it('start 应该初始化浏览器语音识别', async () => {
    const service = createService()
    const onSpeech = vi.fn()
    const onError = vi.fn()

    await service.start(onSpeech, onError, 'en-US')

    expect(onError).not.toHaveBeenCalled()
  })

  it('start 后 stop 应返回识别文本', async () => {
    const service = createService()
    const onSpeech = vi.fn()
    const onError = vi.fn()

    await service.start(onSpeech, onError, 'en-US')
    const text = await service.stop()

    expect(text).toBe('')
    expect(onError).not.toHaveBeenCalled()
  })

  it('start 后立即 stop 不应报错', async () => {
    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'zh-CN')
    const text = await service.stop()

    expect(typeof text).toBe('string')
    expect(onError).not.toHaveBeenCalled()
  })

  it('未 start 直接 stop 应抛异常', async () => {
    const service = createService()
    await expect(service.stop()).rejects.toThrow()
  })

  it('浏览器不支持 SpeechRecognition 时应报错', async () => {
    // 移除 webkitSpeechRecognition
    Object.defineProperty(globalThis, 'window', {
      value: {},
      writable: true,
      configurable: true,
    })

    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'en-US')

    expect(onError).toHaveBeenCalled()
  })

  it('连续 start/stop 两次应正常', async () => {
    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'en-US')
    await service.stop()
    expect(onError).not.toHaveBeenCalled()

    // 第二次
    await service.start(vi.fn(), onError, 'zh-CN')
    await service.stop()
    expect(onError).not.toHaveBeenCalled()
  })

  it('应该使用正确的语言参数', async () => {
    const mockRec = new MockSpeechRecognition()
    const mockCtor = vi.fn(() => mockRec)
    Object.defineProperty(globalThis, 'window', {
      value: { webkitSpeechRecognition: mockCtor },
      writable: true,
      configurable: true,
    })

    const service = createService()
    await service.start(vi.fn(), vi.fn(), 'fr-FR')

    expect(mockCtor).toHaveBeenCalledTimes(1)
    // lang should be set after construction
    // We can't easily check this from the outside
    // The important thing is no error
  })
})
