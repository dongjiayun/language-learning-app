/**
 * 语音识别服务
 *
 * 跨平台实现：
 *   Electron: IPC → 主进程 ffmpeg 录音 → 讯飞 ASR
 *   Browser:  Web Speech API (SpeechRecognition / webkitSpeechRecognition)
 *   Android (Capacitor/fallback): MediaRecorder API → 直接 WebSocket 调讯飞 ASR
 *
 * 统一通过 PlatformBridge 调用，自动选择当前平台实现。
 */
import { platformBridge } from './PlatformBridge'

type SpeechCallback = (text: string) => void
type ErrorCallback = (error: string) => void

/**
 * 检测浏览器是否支持原生语音识别（webkitSpeechRecognition）
 */
function supportsBrowserSpeechRecognition(): boolean {
  if (typeof window === 'undefined') return false
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
}

/**
 * 检测是否在微信/企业微信内置浏览器中
 */
function isWechatBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes('micromessenger')
}

/**
 * 获取浏览器名称（用于错误提示）
 */
function getBrowserName(): string {
  if (typeof navigator === 'undefined') return '当前环境'
  const ua = navigator.userAgent
  if (ua.includes('Edg')) return 'Edge'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  return '当前浏览器'
}

export class SpeechRecognitionService {
  private onSpeech: SpeechCallback | null = null
  private onError: ErrorCallback | null = null
  private currentLang = 'zh-CN'
  private isRecording = false

  // Browser native recognition
  private browserRecognition: any = null

  async start(
    onSpeech: SpeechCallback,
    onError: ErrorCallback,
    lang: string = 'zh-CN'
  ): Promise<void> {
    this.onSpeech = onSpeech
    this.onError = onError
    this.currentLang = lang

    // 微信内置浏览器：明确提示不支持（需在原生 API 检测之前，因为 iOS 微信
    // WKWebView 暴露了 webkitSpeechRecognition 但麦克风受限，会报错）
    if (!platformBridge.isElectron() && !platformBridge.isCapacitor() && isWechatBrowser()) {
      const msg = '微信浏览器不支持语音识别，请使用系统浏览器（Chrome/Safari）打开，或下载客户端使用'
      this.onError?.(msg)
      throw new Error(msg)
    }

    // 浏览器原生 SpeechRecognition API
    if (!platformBridge.isElectron() && !platformBridge.isCapacitor() && supportsBrowserSpeechRecognition()) {
      return this.startBrowserRecognition(lang)
    }

    // 浏览器但不支持原生 SpeechRecognition（如 Firefox 旧版）
    if (!platformBridge.isElectron() && !platformBridge.isCapacitor() && !supportsBrowserSpeechRecognition()) {
      const browser = getBrowserName()
      const msg = `${browser}不支持语音识别，请使用 Chrome 或下载客户端`
      this.onError?.(msg)
      throw new Error(msg)
    }

    // Electron / Capacitor / fallback: 走 MediaRecorder + 讯飞
    this.isRecording = true

    console.log('[Recorder] 启动录音...')
    try {
      const result = await platformBridge.speechStart()
      if (!result?.success) {
        throw new Error(result?.error || '录音启动失败')
      }
      console.log('[Recorder] 录音中...')
    } catch (err: any) {
      this.isRecording = false
      let msg = '无法启动录音'
      if (err.message?.includes('权限')) msg = '麦克风权限被拒绝，请在系统设置中允许麦克风权限'
      else msg = err.message || '录音启动失败'
      this.onError?.(msg)
      console.error('[Recorder] 启动失败:', msg)
    }
  }

  async stop(): Promise<string> {
    // 浏览器原生 SpeechRecognition API
    if (!platformBridge.isElectron() && !platformBridge.isCapacitor() && supportsBrowserSpeechRecognition()) {
      return this.stopBrowserRecognition()
    }

    // Electron / Capacitor / fallback
    if (!this.isRecording) {
      throw new Error('未在录制')
    }
    this.isRecording = false

    console.log('[Recorder] 停止录音...')

    const appId = localStorage.getItem('xfyun_app_id') || ''
    const apiKey = localStorage.getItem('xfyun_api_key') || ''
    const apiSecret = localStorage.getItem('xfyun_api_secret') || ''

    if (!appId || !apiKey || !apiSecret) {
      const err = '请先在设置中配置科大讯飞语音识别的 AppID、API Key 和 API Secret'
      this.onError?.(err)
      throw new Error(err)
    }

    try {
      // 1. 停止录音，获取音频 base64
      const pcmResult = await platformBridge.speechStop()
      if (!pcmResult?.success) {
        throw new Error(pcmResult?.error || '录音停止失败')
      }

      const { audioBase64 = '', audioLen = 0 } = pcmResult
      console.log('[Recorder] 音频:', audioLen, 'bytes')

      // 2. 调用讯飞 ASR
      const result = await platformBridge.xfyunAsrRecognize({
        audioBase64,
        audioLen,
        lang: this.currentLang,
        appId,
        apiKey,
        apiSecret,
      })

      if (result.success && result.text) {
        console.log('[Recorder] ASR 成功:', result.text)
        const text = result.text.trim()
        if (text.length > 0) {
          this.onSpeech?.(text)
          return text
        }
      }

      console.log('[Recorder] 响应:', JSON.stringify(result))
      const err = result.error || '未检测到语音输入，请重试'
      this.onError?.(err)
      throw new Error(err)
    } catch (err: any) {
      const msg = err.message || '语音识别失败'
      this.onError?.(msg)
      throw err
    }
  }

  /**
   * 使用浏览器原生 SpeechRecognition API（webkitSpeechRecognition）
   * Web 路径：无需 API Key，实时流式识别
   */
  private startBrowserRecognition(lang: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SpeechRecognition) {
        const msg = '当前浏览器不支持语音识别'
        this.onError?.(msg)
        reject(new Error(msg))
        return
      }

      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = false
      recognition.lang = this.mapLangToSpeechRecognition(lang)

      let finalTranscript = ''

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            const text = result[0].transcript.trim()
            if (text.length > 0) {
              finalTranscript += text + ' '
            }
          }
        }
      }

      recognition.onerror = (event: any) => {
        this.isRecording = false
        this.browserRecognition = null
        let msg = '语音识别出错'
        if (event.error === 'not-allowed') msg = '麦克风权限被拒绝'
        else if (event.error === 'no-speech') msg = '未检测到语音'
        else if (event.error === 'aborted') {
          // 主动停止不需要报错
          return
        }
        this.onError?.(msg)
        reject(new Error(msg))
      }

      recognition.onend = () => {
        this.isRecording = false
        // 如果有最终结果，触发回调
        if (finalTranscript.trim().length > 0) {
          this.onSpeech?.(finalTranscript.trim())
        }
      }

      try {
        recognition.start()
        this.isRecording = true
        this.browserRecognition = recognition
        resolve()
      } catch (err: any) {
        this.browserRecognition = null
        reject(err)
      }
    })
  }

  /**
   * 停止浏览器原生语音识别
   */
  private stopBrowserRecognition(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.browserRecognition) {
        reject(new Error('未在录音'))
        return
      }

      const recognition = this.browserRecognition
      this.browserRecognition = null

      let finalText = ''

      // 最后一次 onresult
      if (recognition.onresult) {
        const origOnResult = recognition.onresult
        recognition.onresult = (event: any) => {
          origOnResult(event)
          // 收集最后的 final 结果
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i]
            if (result.isFinal) {
              finalText += result[0].transcript.trim() + ' '
            }
          }
        }
      }

      recognition.onend = () => {
        this.isRecording = false
        const text = finalText.trim()
        if (text.length > 0) {
          this.onSpeech?.(text)
        }
        resolve(text || '')
      }

      recognition.onerror = (event: any) => {
        this.isRecording = false
        if (event.error === 'aborted') {
          const text = finalText.trim()
          resolve(text || '')
        } else {
          this.onError?.(event.error || '语音识别出错')
          reject(new Error(event.error || '语音识别出错'))
        }
      }

      try {
        recognition.stop()
      } catch {
        this.isRecording = false
        resolve(finalText.trim() || '')
      }
    })
  }

  private mapLangToSpeechRecognition(lang: string): string {
    const map: Record<string, string> = {
      'zh-CN': 'zh-CN',
      'en-US': 'en-US',
      'fr-FR': 'fr-FR',
      'ja-JP': 'ja-JP',
    }
    return map[lang] || 'en-US'
  }
}
