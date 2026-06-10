/**
 * 语音识别服务
 *
 * 跨平台实现：
 *   Electron: IPC → 主进程 ffmpeg 录音 → 讯飞 ASR
 *   Android (Capacitor): MediaRecorder API → 直接 WebSocket 调讯飞 ASR
 *
 * 统一通过 PlatformBridge 调用，自动选择当前平台实现。
 */
import { platformBridge } from './PlatformBridge'

type SpeechCallback = (text: string) => void
type ErrorCallback = (error: string) => void

export class SpeechRecognitionService {
  private onSpeech: SpeechCallback | null = null
  private onError: ErrorCallback | null = null
  private currentLang = 'zh-CN'
  private isRecording = false

  async start(
    onSpeech: SpeechCallback,
    onError: ErrorCallback,
    lang: string = 'zh-CN'
  ): Promise<void> {
    this.onSpeech = onSpeech
    this.onError = onError
    this.currentLang = lang
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
}
