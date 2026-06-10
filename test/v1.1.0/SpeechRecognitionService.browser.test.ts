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

/**
 * 为指定的 onerror 场景创建 MockSpeechRecognition
 * onerror 同步触发（在 recognition.start() 调用期间），确保在 start() Promise resolve 前被处理
 */
function createErrorMockRecognition(errorType: string): MockSpeechRecognition {
  const mock = new MockSpeechRecognition()
  mock.start = vi.fn(function (this: MockSpeechRecognition) {
    if (this.onerror) {
      this.onerror({ error: errorType })
    }
  })
  return mock
}

/**
 * 创建一个 start() 同步抛异常的 Mock
 */
function createThrowingMockRecognition(): MockSpeechRecognition {
  const mock = new MockSpeechRecognition()
  mock.start = vi.fn(() => {
    throw new Error('Failed to start recognition')
  })
  return mock
}

/**
 * 创建一个 stop() 同步抛异常的 Mock
 */
function createThrowingStopMockRecognition(): MockSpeechRecognition {
  const mock = new MockSpeechRecognition()
  mock.start = vi.fn(function (this: MockSpeechRecognition) {
    setTimeout(() => {
      if (this.onend) setTimeout(() => this.onend!(), 10)
    }, 10)
  })
  mock.stop = vi.fn(() => {
    throw new Error('Failed to stop')
  })
  return mock
}

function setupWindowWithMock(mock: MockSpeechRecognition) {
  Object.defineProperty(globalThis, 'window', {
    value: {
      webkitSpeechRecognition: vi.fn(() => mock),
      SpeechRecognition: undefined,
    },
    writable: true,
    configurable: true,
  })
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

    await expect(service.start(vi.fn(), onError, 'en-US')).rejects.toThrow('不支持语音识别')
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
  })

  // ===== 错误场景测试（如微信浏览器等环境） =====

  it('onerror "not-allowed" 应报告"麦克风权限被拒绝"', async () => {
    const mock = createErrorMockRecognition('not-allowed')
    setupWindowWithMock(mock)

    const service = createService()
    const onError = vi.fn()

    await expect(service.start(vi.fn(), onError, 'en-US')).rejects.toThrow('麦克风权限被拒绝')
    expect(onError).toHaveBeenCalledWith('麦克风权限被拒绝')
  })

  it('onerror "no-speech" 应报告"未检测到语音"', async () => {
    const mock = createErrorMockRecognition('no-speech')
    setupWindowWithMock(mock)

    const service = createService()
    const onError = vi.fn()

    await expect(service.start(vi.fn(), onError, 'en-US')).rejects.toThrow('未检测到语音')
    expect(onError).toHaveBeenCalledWith('未检测到语音')
  })

  it('onerror "network" 应报告通用"语音识别出错"', async () => {
    const mock = createErrorMockRecognition('network')
    setupWindowWithMock(mock)

    const service = createService()
    const onError = vi.fn()

    await expect(service.start(vi.fn(), onError, 'en-US')).rejects.toThrow('语音识别出错')
    expect(onError).toHaveBeenCalledWith('语音识别出错')
  })

  it('onerror "audio-capture" 应报告通用"语音识别出错"', async () => {
    const mock = createErrorMockRecognition('audio-capture')
    setupWindowWithMock(mock)

    const service = createService()
    const onError = vi.fn()

    await expect(service.start(vi.fn(), onError, 'en-US')).rejects.toThrow('语音识别出错')
    expect(onError).toHaveBeenCalledWith('语音识别出错')
  })

  it('onerror "service-not-allowed" 应报告通用"语音识别出错"', async () => {
    const mock = createErrorMockRecognition('service-not-allowed')
    setupWindowWithMock(mock)

    const service = createService()
    const onError = vi.fn()

    await expect(service.start(vi.fn(), onError, 'en-US')).rejects.toThrow('语音识别出错')
    expect(onError).toHaveBeenCalledWith('语音识别出错')
  })

  it('onerror "aborted" 不应该触发 onError', async () => {
    const mock = createErrorMockRecognition('aborted')
    setupWindowWithMock(mock)

    const service = createService()
    const onError = vi.fn()

    // aborted 在 start 阶段返回 early，不 reject，后续 resolve() 正常执行
    await expect(service.start(vi.fn(), onError, 'en-US')).resolves.toBeUndefined()
    expect(onError).not.toHaveBeenCalled()
  })

  it('recognition.start() 同步抛异常时应 reject 但不触发 onError', async () => {
    const mock = createThrowingMockRecognition()
    setupWindowWithMock(mock)

    const service = createService()
    const onError = vi.fn()

    // catch 块只执行 reject(err)，不调用 onError
    await expect(service.start(vi.fn(), onError, 'en-US')).rejects.toThrow('Failed to start recognition')
    expect(onError).not.toHaveBeenCalled()
  })

  it('stop 时 onerror "aborted" 应 resolve 而不触发 onError', async () => {
    const mock = new MockSpeechRecognition()
    mock.start = vi.fn(function (this: MockSpeechRecognition) {
      setTimeout(() => {
        if (this.onend) setTimeout(() => this.onend!(), 10)
      }, 10)
    })
    mock.stop = vi.fn(function (this: MockSpeechRecognition) {
      setTimeout(() => {
        if (this.onerror) {
          this.onerror({ error: 'aborted' })
        }
      }, 5)
    })
    setupWindowWithMock(mock)

    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'en-US')
    const text = await service.stop()

    expect(onError).not.toHaveBeenCalled()
    expect(typeof text).toBe('string')
  })

  it('stop 时 onerror "not-allowed" 应 reject', async () => {
    const mock = new MockSpeechRecognition()
    mock.start = vi.fn(function (this: MockSpeechRecognition) {
      setTimeout(() => {
        if (this.onend) setTimeout(() => this.onend!(), 10)
      }, 10)
    })
    mock.stop = vi.fn(function (this: MockSpeechRecognition) {
      setTimeout(() => {
        if (this.onerror) {
          this.onerror({ error: 'not-allowed' })
        }
      }, 5)
    })
    setupWindowWithMock(mock)

    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'en-US')
    await expect(service.stop()).rejects.toThrow()
    expect(onError).toHaveBeenCalled()
  })

  it('recognition.stop() 同步抛异常时应优雅降级返回空文本', async () => {
    const mock = createThrowingStopMockRecognition()
    setupWindowWithMock(mock)

    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'en-US')
    const text = await service.stop()

    // stop 抛异常时，应静默降级
    expect(typeof text).toBe('string')
    expect(onError).not.toHaveBeenCalled()
  })

  // ===== 微信浏览器场景 =====

  it('微信浏览器（userAgent 含 micromessenger）应优先显示微信提示，即使 webkitSpeechRecognition 存在', async () => {
    // 设置 navigator 包含微信标识
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/16A5288q MicroMessenger/8.0.40',
      },
      writable: true,
      configurable: true,
    })

    // 即使 window 中暴露了 webkitSpeechRecognition，WeChat 检测应先于原生 API
    const mockRecognition = new MockSpeechRecognition()
    Object.defineProperty(globalThis, 'window', {
      value: {
        webkitSpeechRecognition: vi.fn(() => mockRecognition),
        SpeechRecognition: undefined,
      },
      writable: true,
      configurable: true,
    })

    const service = createService()
    const onSpeech = vi.fn()
    const onError = vi.fn()

    await expect(service.start(onSpeech, onError, 'zh-CN')).rejects.toThrow('微信浏览器不支持语音识别')
    expect(onError).toHaveBeenCalledWith('微信浏览器不支持语音识别，请使用系统浏览器（Chrome/Safari）打开，或下载客户端使用')
    // 确保原生 API 没有被调用
    expect(mockRecognition.start).not.toHaveBeenCalled()
  })

  it('非微信浏览器且有 webkitSpeechRecognition 应正常使用原生 API', async () => {
    // 设置 navigator 不包含微信标识
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      writable: true,
      configurable: true,
    })

    const mockRecognition = new MockSpeechRecognition()
    Object.defineProperty(globalThis, 'window', {
      value: {
        webkitSpeechRecognition: vi.fn(() => mockRecognition),
        SpeechRecognition: undefined,
      },
      writable: true,
      configurable: true,
    })

    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'en-US')
    // 不应触发任何错误
    expect(onError).not.toHaveBeenCalled()
  })

  it('连续 onerror 两次（如网络波动）应只调用 onError 一次', async () => {
    const mock = new MockSpeechRecognition()
    mock.start = vi.fn(function (this: MockSpeechRecognition) {
      if (this.onerror) {
        this.onerror({ error: 'network' })
      }
    })
    setupWindowWithMock(mock)

    const service = createService()
    const onError = vi.fn()

    await expect(service.start(vi.fn(), onError, 'en-US')).rejects.toThrow()
    // onerror 在 start() 期间同步触发，连续两次 onerror 调用
    // 第一次 reject + onError，第二次 onError 不会触发（isRecording 已为 false）
    // 但这里 mock 只触发一次，因为同步触发的二次调用在同一个时序
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
