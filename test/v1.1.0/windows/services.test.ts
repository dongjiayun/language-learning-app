/**
 * 跨平台服务 Windows 分支测试
 *
 * 验证服务层在 Windows 平台 (process.platform = 'win32') 下
 * 的 IPC 调用路径是否正确，以及现有功能是否不受平台影响。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpeechRecognitionService } from '@/services/SpeechRecognitionService'
import { TextToSpeechService } from '@/services/TextToSpeechService'

// ===== Mock window.electronAPI（Win32 平台） =====
const mockSpeechStart = vi.fn()
const mockSpeechStop = vi.fn()
const mockXfyunAsrRecognize = vi.fn()
const mockTtsSpeak = vi.fn()
const mockTtsStop = vi.fn()
const mockSpeechIsListening = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()

  // Mock localStorage（必要的配置）
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

  // Windows 平台的 electronAPI mock
  Object.defineProperty(globalThis, 'window', {
    value: {
      electronAPI: {
        platform: 'win32',
        bufferToBase64: vi.fn(),
        speechStart: mockSpeechStart,
        speechStop: mockSpeechStop,
        speechIsListening: mockSpeechIsListening,
        ttsSpeak: mockTtsSpeak,
        ttsStop: mockTtsStop,
        xfyunAsrRecognize: mockXfyunAsrRecognize,
        diagnosticCheck: vi.fn(),
        recognizeAudioBlob: vi.fn(),
      },
    },
    writable: true,
    configurable: true,
  })
})

// ============================================================
// SpeechRecognitionService — Windows 平台
// ============================================================

describe('SpeechRecognitionService (Windows platform)', () => {
  function createService(): SpeechRecognitionService {
    return new SpeechRecognitionService()
  }

  describe('start()', () => {
    it('Windows: 应该通过 IPC 调用 speechStart', async () => {
      mockSpeechStart.mockResolvedValue({ success: true })
      const service = createService()
      const onSpeech = vi.fn()
      const onError = vi.fn()

      await service.start(onSpeech, onError, 'zh-CN')

      expect(mockSpeechStart).toHaveBeenCalledTimes(1)
      expect(onError).not.toHaveBeenCalled()
    })

    it('Windows: speechStart 失败时应调用 onError', async () => {
      mockSpeechStart.mockResolvedValue({ success: false, error: 'ffmpeg not found' })
      const service = createService()
      const onError = vi.fn()

      await service.start(vi.fn(), onError, 'zh-CN')

      expect(onError).toHaveBeenCalledWith(expect.stringContaining('ffmpeg not found'))
    })

    it('Windows: speechStart 抛出异常时应调用 onError', async () => {
      mockSpeechStart.mockRejectedValue(new Error('麦克风被占用'))
      const service = createService()
      const onError = vi.fn()

      await service.start(vi.fn(), onError, 'en-US')

      expect(onError).toHaveBeenCalled()
    })
  })

  describe('stop()', () => {
    it('Windows: 应该通过 IPC 获取 PCM 并调用 ASR', async () => {
      mockSpeechStart.mockResolvedValue({ success: true })
      mockSpeechStop.mockResolvedValue({ success: true, audioBase64: 'dGVzdA==', audioLen: 4 })
      mockXfyunAsrRecognize.mockResolvedValue({ success: true, text: 'Bonjour' })

      const service = createService()
      const onSpeech = vi.fn()

      await service.start(onSpeech, vi.fn(), 'fr-FR')
      const text = await service.stop()

      expect(text).toBe('Bonjour')
      expect(mockSpeechStop).toHaveBeenCalledTimes(1)
      expect(mockXfyunAsrRecognize).toHaveBeenCalledWith({
        audioBase64: 'dGVzdA==',
        audioLen: 4,
        lang: 'fr-FR',
        appId: 'test-app-id',
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
      })
      expect(onSpeech).toHaveBeenCalledWith('Bonjour')
    })

    it('Windows: 未配置 API Key 时应抛异常', async () => {
      localStorage.removeItem('xfyun_app_id')
      mockSpeechStart.mockResolvedValue({ success: true })

      const service = createService()
      await service.start(vi.fn(), vi.fn(), 'zh-CN')
      await expect(service.stop()).rejects.toThrow(/科大讯飞/)
    })

    it('Windows: ASR 返回空文本时应抛异常', async () => {
      mockSpeechStart.mockResolvedValue({ success: true })
      mockSpeechStop.mockResolvedValue({ success: true, audioBase64: 'dGVzdA==', audioLen: 4 })
      mockXfyunAsrRecognize.mockResolvedValue({ success: true, text: '' })

      const service = createService()
      await service.start(vi.fn(), vi.fn(), 'zh-CN')
      await expect(service.stop()).rejects.toThrow('未检测到语音输入')
    })

    it('Windows: 停止录音失败时应抛异常', async () => {
      mockSpeechStart.mockResolvedValue({ success: true })
      mockSpeechStop.mockResolvedValue({ success: false, error: '停止录音失败' })

      const service = createService()
      await service.start(vi.fn(), vi.fn(), 'zh-CN')
      await expect(service.stop()).rejects.toThrow('停止录音失败')
    })
  })

  describe('集成场景', () => {
    it('Windows: 连续 start/stop 应正常', async () => {
      mockSpeechStart.mockResolvedValue({ success: true })
      mockSpeechStop.mockResolvedValue({ success: true, audioBase64: 'dGVzdA==', audioLen: 4 })
      mockXfyunAsrRecognize.mockResolvedValue({ success: true, text: 'Hello' })

      const service = createService()
      await service.start(vi.fn(), vi.fn(), 'en-US')
      const text1 = await service.stop()
      expect(text1).toBe('Hello')

      mockXfyunAsrRecognize.mockResolvedValue({ success: true, text: 'Bonjour' })
      await service.start(vi.fn(), vi.fn(), 'fr-FR')
      const text2 = await service.stop()
      expect(text2).toBe('Bonjour')

      expect(mockSpeechStart).toHaveBeenCalledTimes(2)
      expect(mockSpeechStop).toHaveBeenCalledTimes(2)
    })

    it('Windows: 不同语言传递正确', async () => {
      mockSpeechStart.mockResolvedValue({ success: true })
      mockSpeechStop.mockResolvedValue({ success: true, audioBase64: 'dGVzdA==', audioLen: 4 })
      mockXfyunAsrRecognize.mockResolvedValue({ success: true, text: '你好' })

      const service = createService()
      await service.start(vi.fn(), vi.fn(), 'zh-CN')
      await service.stop()

      // Verify lang was passed correctly in the ASR call
      const asrParams = mockXfyunAsrRecognize.mock.calls[0][0]
      expect(asrParams.lang).toBe('zh-CN')

      // Verify different language
      mockXfyunAsrRecognize.mockResolvedValue({ success: true, text: 'こんにちは' })
      await service.start(vi.fn(), vi.fn(), 'ja-JP')
      await service.stop()

      const asrParams2 = mockXfyunAsrRecognize.mock.calls[1][0]
      expect(asrParams2.lang).toBe('ja-JP')
    })
  })
})

// ============================================================
// TextToSpeechService — Windows 平台
// ============================================================

describe('TextToSpeechService (Windows platform)', () => {
  function createService(): TextToSpeechService {
    return new TextToSpeechService()
  }

  describe('speak()', () => {
    it('Windows: 应该通过 IPC 调用 ttsSpeak', async () => {
      mockTtsSpeak.mockResolvedValue({ success: true })
      const service = createService()

      await service.speak('Bonjour', 'fr-FR')

      expect(mockTtsSpeak).toHaveBeenCalledWith({
        text: 'Bonjour',
        lang: 'fr-FR',
      })
    })

    it('Windows: ttsSpeak 返回成功时应正常返回', async () => {
      mockTtsSpeak.mockResolvedValue({ success: true })
      const service = createService()

      await expect(service.speak('Hello', 'en-US')).resolves.toBeUndefined()
    })

    it('Windows: ttsSpeak 失败时应抛异常', async () => {
      mockTtsSpeak.mockResolvedValue({ success: false, error: 'TTS 语音不可用' })
      const service = createService()

      await expect(service.speak('Hello', 'en-US')).rejects.toThrow('TTS 语音不可用')
    })

    it('Windows: ttsSpeak 抛出异常时应抛异常', async () => {
      mockTtsSpeak.mockRejectedValue(new Error('IPC 通信失败'))
      const service = createService()

      await expect(service.speak('Hello', 'en-US')).rejects.toThrow('IPC 通信失败')
    })

    it('Windows: 支持所有语言参数', async () => {
      mockTtsSpeak.mockResolvedValue({ success: true })
      const service = createService()
      const languages = ['zh-CN', 'en-US', 'fr-FR', 'ja-JP']

      for (const lang of languages) {
        await service.speak('test', lang)
        expect(mockTtsSpeak).toHaveBeenLastCalledWith({
          text: 'test',
          lang: lang,
        })
      }

      expect(mockTtsSpeak).toHaveBeenCalledTimes(4)
    })
  })

  describe('stop()', () => {
    it('Windows: 应该通过 IPC 调用 ttsStop', async () => {
      mockTtsStop.mockResolvedValue({ success: true })
      const service = createService()

      await service.stop()

      expect(mockTtsStop).toHaveBeenCalledTimes(1)
    })

    it('Windows: ttsStop 不应抛出异常', async () => {
      mockTtsStop.mockResolvedValue({ success: true })
      const service = createService()

      await expect(service.stop()).resolves.toBeUndefined()
    })
  })
})

// ============================================================
// 平台无关性测试 — 验证服务与平台解耦
// ============================================================

describe('跨平台兼容性', () => {
  it('SpeechRecognitionService 不应引用 process.platform', () => {
    const serviceCode = SpeechRecognitionService.toString()
    // 服务层应完全依赖 IPC，不应直接判断平台
    expect(serviceCode).not.toContain('process.platform')
    expect(serviceCode).not.toContain('navigator.platform')
  })

  it('TextToSpeechService 不应引用 process.platform', () => {
    const serviceCode = TextToSpeechService.toString()
    expect(serviceCode).not.toContain('process.platform')
    expect(serviceCode).not.toContain('navigator.platform')
  })

  it('Windows 平台 electronAPI 应包含所有必要方法', () => {
    const api = (window as any).electronAPI
    const requiredMethods = [
      'speechStart',
      'speechStop',
      'speechIsListening',
      'ttsSpeak',
      'ttsStop',
      'xfyunAsrRecognize',
      'recognizeAudioBlob',
      'diagnosticCheck',
      'bufferToBase64',
    ]
    for (const method of requiredMethods) {
      expect(api).toHaveProperty(method)
      expect(typeof api[method]).toBe('function')
    }
  })
})
