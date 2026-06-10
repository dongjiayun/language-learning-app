/**
 * PlatformBridge 跨平台抽象层单元测试
 *
 * 测试策略：
 * - 在 Node (非浏览器) 环境下检测为 browser 平台
 * - 测试所有方法的正确返回格式
 * - 模拟 electronAPI 时检测 electron 平台行为
 * - 测试辅助方法
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 保存原始的 global 属性
const origWindow = (globalThis as any).window
const origNavigator = (globalThis as any).navigator

/**
 * 辅助：在测试中重新导入 PlatformBridge
 */
async function createBridge() {
  vi.resetModules()
  const { platformBridge } = await import('../../src/services/PlatformBridge')
  return platformBridge
}

/** 设置 window 模拟 */
function mockWindow(partial: Record<string, any>) {
  (globalThis as any).window = { ...partial }
}

/** 清理 window 模拟 */
function cleanupWindow() {
  delete (globalThis as any).window
}

describe('PlatformBridge - 平台检测', () => {
  afterEach(() => {
    cleanupWindow()
  })

  it('在 Node 环境下检测为 browser', async () => {
    cleanupWindow()
    const bridge = await createBridge()
    expect(bridge.detectPlatform()).toBe('browser')
    expect(bridge.isBrowser()).toBe(true)
    expect(bridge.isElectron()).toBe(false)
    expect(bridge.isCapacitor()).toBe(false)
  })

  it('electronAPI 存在时检测为 electron', async () => {
    mockWindow({ electronAPI: { platform: 'darwin' } })
    const bridge = await createBridge()
    expect(bridge.detectPlatform()).toBe('electron')
    expect(bridge.isElectron()).toBe(true)
  })

  it('Capacitor 全局存在时检测为 capacitor', async () => {
    mockWindow({ Capacitor: { isNativePlatform: () => true } })
    const bridge = await createBridge()
    expect(bridge.detectPlatform()).toBe('capacitor')
    expect(bridge.isCapacitor()).toBe(true)
  })
})

describe('PlatformBridge - TTS 语音合成', () => {
  let mockSpeak: any
  let mockCancel: any
  let MockUtterance: any

  beforeEach(() => {
    mockSpeak = vi.fn()
    mockCancel = vi.fn()
    MockUtterance = vi.fn(function (this: any, text: string) {
      this.text = text
      this.lang = ''
      this.rate = 1
      this.pitch = 1
      this.volume = 1
      this.onend = null
      this.onerror = null
    })
    ;(globalThis as any).SpeechSynthesisUtterance = MockUtterance as any
    mockWindow({
      speechSynthesis: { speak: mockSpeak, cancel: mockCancel },
    })
  })

  afterEach(() => {
    cleanupWindow()
    delete (globalThis as any).SpeechSynthesisUtterance
  })

  it('ttsSpeak 在 browser 模式下使用 Web Speech API 并返回成功', async () => {
    const bridge = await createBridge()

    // 先 mock window 确定是 browser 平台
    const resultPromise = bridge.ttsSpeak({ text: 'Bonjour', lang: 'fr-FR' })

    expect(mockSpeak).toHaveBeenCalledOnce()
    const utterance = mockSpeak.mock.calls[0][0]
    expect(utterance.text).toBe('Bonjour')
    expect(utterance.lang).toBe('fr-FR')

    // 模拟语音结束
    utterance.onend?.()

    const result = await resultPromise
    expect(result.success).toBe(true)
  })

  it('ttsStop 在 browser 模式下调用 cancel', async () => {
    const bridge = await createBridge()
    const result = await bridge.ttsStop()
    expect(mockCancel).toHaveBeenCalled()
    expect(result.success).toBe(true)
  })

  it('ttsSpeak 通过 electronAPI 调用', async () => {
    cleanupWindow()
    const mockTts = vi.fn().mockResolvedValue({ success: true })
    const mockStop = vi.fn().mockResolvedValue({ success: true })
    mockWindow({
      electronAPI: { platform: 'darwin', ttsSpeak: mockTts, ttsStop: mockStop },
    })
    const bridge = await createBridge()
    const result = await bridge.ttsSpeak({ text: 'Hello', lang: 'en-US' })
    expect(mockTts).toHaveBeenCalledWith({ text: 'Hello', lang: 'en-US' })
    expect(result.success).toBe(true)
  })
})

describe('PlatformBridge - 语音识别', () => {
  afterEach(() => {
    cleanupWindow()
  })

  it('speechStart 在 browser 模式下调用 getUserMedia', async () => {
    const mockGetUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    })
    // navigator 必须设置到 globalThis 上（在 Node 中没有全局 navigator）
    ;(globalThis as any).navigator = {
      mediaDevices: { getUserMedia: mockGetUserMedia },
    }
    ;(globalThis as any).MediaRecorder = vi.fn(() => ({
      start: vi.fn(),
      state: 'recording',
      stop: vi.fn(),
    }))
    ;(globalThis as any).MediaRecorder.isTypeSupported = vi.fn().mockReturnValue(false)

    mockWindow({})

    const bridge = await createBridge()
    const result = await bridge.speechStart()
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(result.success).toBe(true)
  })

  it('speechStart 返回权限错误', async () => {
    const mockGetUserMedia = vi.fn().mockRejectedValue({ name: 'NotAllowedError' })
    ;(globalThis as any).navigator = {
      mediaDevices: { getUserMedia: mockGetUserMedia },
    }
    mockWindow({})

    const bridge = await createBridge()
    const result = await bridge.speechStart()
    expect(result.success).toBe(false)
    expect(result.error).toContain('权限')
  })

  it('speechIsListening 返回状态', async () => {
    mockWindow({
      electronAPI: {
        platform: 'darwin',
        speechIsListening: vi.fn().mockResolvedValue({ listening: true }),
      },
    })
    const bridge = await createBridge()
    const result = await bridge.speechIsListening()
    expect(result).toEqual({ listening: true })
  })
})

describe('PlatformBridge - 讯飞 ASR', () => {
  afterEach(() => {
    cleanupWindow()
  })

  it('缺少配置时返回错误', async () => {
    mockWindow({})
    const bridge = await createBridge()
    const result = await bridge.xfyunAsrRecognize({
      audioBase64: 'dGVzdA==',
      audioLen: 4,
      lang: 'zh-CN',
      appId: '',
      apiKey: '',
      apiSecret: '',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('配置')
  })

  it('通过 electronAPI 调用', async () => {
    const mockAsr = vi.fn().mockResolvedValue({ success: true, text: '你好' })
    mockWindow({
      electronAPI: { platform: 'darwin', xfyunAsrRecognize: mockAsr },
    })
    const bridge = await createBridge()
    const result = await bridge.xfyunAsrRecognize({
      audioBase64: 'dGVzdA==',
      audioLen: 4,
      lang: 'zh-CN',
      appId: 'test',
      apiKey: 'test',
      apiSecret: 'test',
    })
    expect(mockAsr).toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.text).toBe('你好')
  })
})

describe('PlatformBridge - 检查更新', () => {
  afterEach(() => {
    cleanupWindow()
  })

  it('通过 electronAPI 检查更新', async () => {
    const mockCheck = vi.fn().mockResolvedValue({
      success: true,
      hasUpdate: false,
      currentVersion: '1.9.0',
    })
    mockWindow({
      electronAPI: { platform: 'darwin', checkUpdate: mockCheck },
    })
    const bridge = await createBridge()
    const result = await bridge.checkUpdate()
    expect(mockCheck).toHaveBeenCalled()
    expect(result.success).toBe(true)
  })

  it('browser 模式应使用 package.json 中的版本号进行比较', async () => {
    cleanupWindow()
    // 模拟 fetch 返回最新版本
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.11.0',
        html_url: 'https://github.com/dongjiayun/language-learning-app/releases/tag/v1.11.0',
      }),
    })
    ;(globalThis as any).fetch = mockFetch

    const bridge = await createBridge()

    // 由于 package.json 版本是 1.11.1，而最新 release 是 1.11.0，应无更新
    const result = await bridge.checkUpdate()

    expect(result.success).toBe(true)
    expect(result.hasUpdate).toBe(false)
    expect(result.version).toBe('1.11.0')
  })

  it('browser 模式检测到有新版本时应返回 hasUpdate=true', async () => {
    cleanupWindow()
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v2.0.0',
        html_url: 'https://github.com/dongjiayun/language-learning-app/releases/tag/v2.0.0',
      }),
    })
    ;(globalThis as any).fetch = mockFetch

    const bridge = await createBridge()
    const result = await bridge.checkUpdate()

    expect(result.success).toBe(true)
    expect(result.hasUpdate).toBe(true)
    expect(result.version).toBe('2.0.0')
  })
})

describe('PlatformBridge - 辅助方法', () => {
  afterEach(() => {
    cleanupWindow()
  })

  it('版本比较', async () => {
    cleanupWindow()
    const bridge = await createBridge()
    expect(bridge.isBrowser()).toBe(true)
    expect(bridge.isElectron()).toBe(false)
  })

  it('bufferToBase64 在 browser 模式', async () => {
    cleanupWindow()
    const bridge = await createBridge()
    const buffer = new Uint8Array([72, 101, 108, 108, 111, 33]).buffer // "Hello!"
    const result = bridge.bufferToBase64(buffer)
    expect(result).toBe('SGVsbG8h')
  })
})

describe('PlatformBridge - recognizeAudioBlob', () => {
  afterEach(() => {
    cleanupWindow()
  })

  it('通过 electronAPI 调用', async () => {
    const mockRecognize = vi.fn().mockResolvedValue({ success: true, text: 'test' })
    mockWindow({
      electronAPI: { platform: 'darwin', recognizeAudioBlob: mockRecognize },
    })
    const bridge = await createBridge()
    const result = await bridge.recognizeAudioBlob({
      audioBase64: 'dGVzdA==',
      blobMimeType: 'audio/webm',
      lang: 'en-US',
      appId: 'test',
      apiKey: 'test',
      apiSecret: 'test',
    })
    expect(mockRecognize).toHaveBeenCalled()
    expect(result.success).toBe(true)
  })
})
