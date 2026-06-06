import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpeechRecognitionService } from '@/services/SpeechRecognitionService'

// ===== Mock window.electronAPI =====
const mockSpeechStart = vi.fn()
const mockSpeechStop = vi.fn()
const mockXfyunAsrRecognize = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()

  // Mock localStorage
  const store: Record<string, string> = {
    xfyun_app_id: 'test-app-id',
    xfyun_api_key: 'test-api-key',
    xfyun_api_secret: 'test-api-secret',
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

  Object.defineProperty(globalThis, 'window', {
    value: {
      electronAPI: {
        speechStart: mockSpeechStart,
        speechStop: mockSpeechStop,
        xfyunAsrRecognize: mockXfyunAsrRecognize,
        platform: 'darwin',
        bufferToBase64: vi.fn(),
        speechIsListening: vi.fn(),
        diagnosticCheck: vi.fn(),
        recognizeAudioBlob: vi.fn(),
      },
    },
    writable: true,
    configurable: true,
  })
})

function createService(): SpeechRecognitionService {
  return new SpeechRecognitionService()
}

// ============== start 基础功能 ==============
describe('SpeechRecognitionService - start', () => {
  it('应该成功启动录音', async () => {
    mockSpeechStart.mockResolvedValue({ success: true })
    const service = createService()
    const onSpeech = vi.fn()
    const onError = vi.fn()

    await service.start(onSpeech, onError, 'zh-CN')

    expect(mockSpeechStart).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('speechStart 失败时应调用 onError', async () => {
    mockSpeechStart.mockResolvedValue({ success: false, error: '麦克风不可用' })
    const service = createService()
    const onSpeech = vi.fn()
    const onError = vi.fn()

    await service.start(onSpeech, onError, 'zh-CN')

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('麦克风不可用'))
  })

  it('speechStart 抛出异常时应调用 onError', async () => {
    mockSpeechStart.mockRejectedValue(new Error('拒绝访问'))
    const service = createService()
    const onSpeech = vi.fn()
    const onError = vi.fn()

    await service.start(onSpeech, onError, 'zh-CN')

    expect(onError).toHaveBeenCalled()
  })
})

// ============== stop ==============
describe('SpeechRecognitionService - stop', () => {
  it('应该成功停止录音并返回识别文本', async () => {
    mockSpeechStart.mockResolvedValue({ success: true })
    mockSpeechStop.mockResolvedValue({ success: true, audioBase64: 'dGVzdA==', audioLen: 4 })
    mockXfyunAsrRecognize.mockResolvedValue({ success: true, text: 'Bonjour' })

    const service = createService()
    const onSpeech = vi.fn()
    const onError = vi.fn()

    await service.start(onSpeech, onError, 'zh-CN')
    const text = await service.stop()

    expect(text).toBe('Bonjour')
    expect(mockSpeechStop).toHaveBeenCalledTimes(1)
    expect(mockXfyunAsrRecognize).toHaveBeenCalledWith({
      audioBase64: 'dGVzdA==',
      audioLen: 4,
      lang: 'zh-CN',
      appId: 'test-app-id',
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
    })
    expect(onSpeech).toHaveBeenCalledWith('Bonjour')
  })

  it('未启动时 stop 应抛异常', async () => {
    const service = createService()
    await expect(service.stop()).rejects.toThrow('未在录制')
  })

  it('ASR 失败时应抛异常', async () => {
    mockSpeechStart.mockResolvedValue({ success: true })
    mockSpeechStop.mockResolvedValue({ success: true, audioBase64: 'dGVzdA==', audioLen: 4 })
    mockXfyunAsrRecognize.mockResolvedValue({ success: false, error: 'ASR 服务错误' })

    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'zh-CN')
    await expect(service.stop()).rejects.toThrow('ASR 服务错误')
    expect(onError).toHaveBeenCalled()
  })

  it('speechStop 失败时应抛异常', async () => {
    mockSpeechStart.mockResolvedValue({ success: true })
    mockSpeechStop.mockResolvedValue({ success: false, error: '停止录音失败' })

    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'zh-CN')
    await expect(service.stop()).rejects.toThrow('停止录音失败')
    expect(onError).toHaveBeenCalled()
  })

  it('speechStop 抛出异常时应抛异常', async () => {
    mockSpeechStart.mockResolvedValue({ success: true })
    mockSpeechStop.mockRejectedValue(new Error('进程错误'))

    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'zh-CN')
    await expect(service.stop()).rejects.toThrow('进程错误')
    expect(onError).toHaveBeenCalled()
  })

  it('ASR 返回空文本时应抛异常', async () => {
    mockSpeechStart.mockResolvedValue({ success: true })
    mockSpeechStop.mockResolvedValue({ success: true, audioBase64: 'dGVzdA==', audioLen: 4 })
    mockXfyunAsrRecognize.mockResolvedValue({ success: true, text: '' })

    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'zh-CN')
    await expect(service.stop()).rejects.toThrow('未检测到语音输入')
    expect(onError).toHaveBeenCalled()
  })

  it('未配置 API Key 时应抛异常', async () => {
    localStorage.removeItem('xfyun_app_id')
    mockSpeechStart.mockResolvedValue({ success: true })

    const service = createService()
    const onError = vi.fn()

    await service.start(vi.fn(), onError, 'zh-CN')

    // API Key 检查在 stop 时进行
    await expect(service.stop()).rejects.toThrow(/科大讯飞/)
    expect(onError).toHaveBeenCalled()
  })

  it('连续 start/stop 应该正常', async () => {
    mockSpeechStart.mockResolvedValue({ success: true })
    mockSpeechStop.mockResolvedValue({ success: true, audioBase64: 'dGVzdA==', audioLen: 4 })
    mockXfyunAsrRecognize.mockResolvedValue({ success: true, text: 'Hello' })

    const service = createService()

    await service.start(vi.fn(), vi.fn(), 'en-US')
    const text1 = await service.stop()
    expect(text1).toBe('Hello')

    // 第二次
    mockXfyunAsrRecognize.mockResolvedValue({ success: true, text: 'Bonjour' })
    await service.start(vi.fn(), vi.fn(), 'fr-FR')
    const text2 = await service.stop()
    expect(text2).toBe('Bonjour')

    expect(mockSpeechStart).toHaveBeenCalledTimes(2)
    expect(mockSpeechStop).toHaveBeenCalledTimes(2)
  })
})
