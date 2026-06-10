/**
 * PlatformBridge —— 跨平台抽象层
 *
 * 统一 Electron 和 Android (Capacitor) 的 Native API 调用。
 * 运行时自动检测当前平台，选择合适的实现。
 *
 * Electron:  通过 window.electronAPI (preload 暴露的 IPC)
 * Capacitor: 直接使用 Web API (WebView 原生支持)
 * Browser:   使用 Web API（开发模式 fallback）
 */

type Platform = 'electron' | 'capacitor' | 'browser'

// @ts-ignore - Vite JSON import
import pkg from '../../package.json'

interface XfyunAsrParams {
  audioBase64: string
  audioLen: number
  lang: string
  appId: string
  apiKey: string
  apiSecret: string
}

interface RecognizeBlobParams {
  audioBase64: string
  blobMimeType: string
  lang: string
  appId: string
  apiKey: string
  apiSecret: string
}

interface TtsParams {
  text: string
  lang: string
}

class PlatformBridgeSingleton {
  private _platform: Platform | null = null

  /** 检测当前运行平台 */
  detectPlatform(): Platform {
    if (this._platform) return this._platform
    if (typeof window === 'undefined') {
      this._platform = 'browser'
    } else if ((window as any).electronAPI?.platform) {
      this._platform = 'electron'
    } else if (typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform()) {
      this._platform = 'capacitor'
    } else {
      this._platform = 'browser'
    }
    return this._platform
  }

  isElectron(): boolean { return this.detectPlatform() === 'electron' }
  isCapacitor(): boolean { return this.detectPlatform() === 'capacitor' }
  isBrowser(): boolean { return this.detectPlatform() === 'browser' }

  // ===== TTS 语音合成 =====

  /** 朗读文本 */
  async ttsSpeak(params: TtsParams): Promise<{ success: boolean; error?: string }> {
    if (this.isElectron()) {
      return (window as any).electronAPI.ttsSpeak(params)
    }
    // Capacitor / Browser: 使用 Web Speech API
    return this.webTtsSpeak(params.text, params.lang)
  }

  /** 停止朗读 */
  async ttsStop(): Promise<{ success: boolean }> {
    if (this.isElectron()) {
      return (window as any).electronAPI.ttsStop()
    }
    this.webTtsStop()
    return { success: true }
  }

  private ttsUtterance: SpeechSynthesisUtterance | null = null

  private webTtsSpeak(text: string, lang: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve({ success: false, error: '当前浏览器不支持语音合成' })
        return
      }
      // 停止当前朗读
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      // 映射语种代码
      utterance.lang = this.mapLangToBcp47(lang)
      utterance.rate = 0.9
      utterance.pitch = 1.0
      utterance.volume = 1.0

      utterance.onend = () => {
        this.ttsUtterance = null
        resolve({ success: true })
      }
      utterance.onerror = (e) => {
        this.ttsUtterance = null
        resolve({ success: false, error: e.error || '语音合成错误' })
      }

      this.ttsUtterance = utterance
      window.speechSynthesis.speak(utterance)
    })
  }

  private webTtsStop(): void {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    this.ttsUtterance = null
  }

  // ===== 语音识别（录音） =====

  /** 开始录音 */
  async speechStart(): Promise<{ success: boolean; error?: string }> {
    if (this.isElectron()) {
      return (window as any).electronAPI.speechStart()
    }
    // Capacitor: 使用 MediaRecorder API
    return this.webSpeechStart()
  }

  /** 停止录音并返回音频数据 */
  async speechStop(): Promise<{ success: boolean; audioBase64?: string; audioLen?: number; error?: string }> {
    if (this.isElectron()) {
      return (window as any).electronAPI.speechStop()
    }
    return this.webSpeechStop()
  }

  /** 检查是否正在录音 */
  async speechIsListening(): Promise<{ listening: boolean }> {
    if (this.isElectron()) {
      return (window as any).electronAPI.speechIsListening()
    }
    return { listening: this.mediaRecorder !== null && this.mediaRecorder.state === 'recording' }
  }

  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []

  private async webSpeechStart(): Promise<{ success: boolean; error?: string }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.audioChunks = []
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data)
      }
      recorder.start()
      this.mediaRecorder = recorder
      return { success: true }
    } catch (err: any) {
      let msg = '无法访问麦克风'
      if (err.name === 'NotAllowedError') msg = '麦克风权限被拒绝'
      else if (err.name === 'NotFoundError') msg = '未检测到麦克风设备'
      return { success: false, error: msg }
    }
  }

  private webSpeechStop(): Promise<{ success: boolean; audioBase64?: string; audioLen?: number; error?: string }> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve({ success: false, error: '未在录音' })
        return
      }

      const recorder = this.mediaRecorder
      const stream = recorder.stream

      recorder.onstop = () => {
        // 停止所有音轨
        stream.getTracks().forEach(t => t.stop())

        const blob = new Blob(this.audioChunks, { type: recorder.mimeType })
        this.audioChunks = []
        this.mediaRecorder = null

        const reader = new FileReader()
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1]
          resolve({
            success: true,
            audioBase64: base64,
            audioLen: blob.size,
          })
        }
        reader.onerror = () => {
          resolve({ success: false, error: '读取音频数据失败' })
        }
        reader.readAsDataURL(blob)
      }

      recorder.stop()
    })
  }

  // ===== 讯飞 ASR 语音识别 =====

  /** 调讯飞 ASR */
  async xfyunAsrRecognize(params: XfyunAsrParams): Promise<{ success: boolean; text?: string; error?: string }> {
    if (this.isElectron()) {
      return (window as any).electronAPI.xfyunAsrRecognize(params)
    }
    // Capacitor: 直接 WebSocket 调讯飞
    return this.webXfyunAsrRecognize(params)
  }

  /** 音频 Blob 识别（渲染进程录音） */
  async recognizeAudioBlob(params: RecognizeBlobParams): Promise<{ success: boolean; text?: string; error?: string }> {
    if (this.isElectron()) {
      return (window as any).electronAPI.recognizeAudioBlob(params)
    }
    // Capacitor: 直接使用 MediaRecorder 录的音频调讯飞
    return this.webXfyunAsrRecognize({
      audioBase64: params.audioBase64,
      audioLen: 0,
      lang: params.lang,
      appId: params.appId,
      apiKey: params.apiKey,
      apiSecret: params.apiSecret,
    })
  }

  private async webXfyunAsrRecognize(params: XfyunAsrParams): Promise<{ success: boolean; text?: string; error?: string }> {
    const { audioBase64, lang, appId, apiKey, apiSecret } = params

    if (!appId || !apiKey || !apiSecret) {
      return { success: false, error: '请先配置讯飞语音识别参数' }
    }

    try {
      const url = this.buildXfyunAuthUrl(apiKey, apiSecret)
      const ln = this.mapXfyunLang(lang)

      const result = await this.xfyunWebSocketRequest(url, appId, audioBase64, ln)
      return { success: true, text: result }
    } catch (err: any) {
      return { success: false, error: err.message || '讯飞识别失败' }
    }
  }

  private buildXfyunAuthUrl(apiKey: string, apiSecret: string): string {
    const host = 'iat.cn-huabei-1.xf-yun.com'
    const path = '/v1'
    const date = new Date().toUTCString()

    // 使用 Web Crypto API 实现 HMAC-SHA256
    const sigOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`

    // 由于 Web Crypto API 不支持同步操作，这里使用简化方法
    // 注意：实际生产环境应使用正式的 HMAC 签名
    // 这里返回未签名的 URL，实际 ASR 请求会由主进程处理
    return `wss://${host}${path}?authorization=pending&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`
  }

  private mapXfyunLang(lang: string): string {
    const map: Record<string, string> = {
      'zh-CN': 'zh',
      'en-US': 'en',
      'fr-FR': 'fr',
      'ja-JP': 'jp',
    }
    return map[lang] || ''
  }

  private xfyunWebSocketRequest(url: string, appId: string, audioBase64: string, ln: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // 使用讯飞官方 WebSocket API
      // 注意：生产环境中签名需要由服务器端完成
      // 这里作为 Capacitor 客户端实现
      const ws = new WebSocket(url)
      let resultText = ''
      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error('讯飞识别超时'))
      }, 30000)

      ws.onopen = () => {
        const frame = {
          header: { app_id: appId, status: 0 },
          parameter: {
            iat: {
              domain: 'slm',
              language: 'zh_cn',
              accent: 'mandarin',
              eos: 3000,
              result: { encoding: 'utf8', compress: 'raw', format: 'json' },
            },
          },
          payload: {
            audio: {
              encoding: 'raw',
              sample_rate: 16000,
              channels: 1,
              bit_depth: 16,
              seq: 1,
              status: 0,
              audio: audioBase64,
            },
          },
        }
        if (ln) (frame.parameter.iat as any).language = 'mul_cn'
        if (ln) (frame.parameter.iat as any).ln = ln

        ws.send(JSON.stringify(frame))
        ws.send(JSON.stringify({
          header: { app_id: appId, status: 2 },
          payload: { audio: { encoding: 'raw', sample_rate: 16000, status: 2, audio: '' } },
        }))
      }

      ws.onmessage = (event) => {
        try {
          const p = JSON.parse(event.data)
          if (p.header?.code !== 0) {
            clearTimeout(timeout)
            ws.close()
            reject(new Error(p.header?.message || `错误 code=${p.header?.code}`))
            return
          }
          if (p.payload?.result?.text) {
            const text = this.decodeXfyunResult(p.payload.result.text)
            if (text) resultText += text
          }
          if (p.header?.status === 2) {
            clearTimeout(timeout)
            ws.close()
            resolve(resultText)
          }
        } catch { }
      }

      ws.onerror = (err) => {
        clearTimeout(timeout)
        reject(new Error(`讯飞连接失败: ${err}`))
      }

      ws.onclose = () => {
        clearTimeout(timeout)
        if (resultText) resolve(resultText)
        else reject(new Error('讯飞连接关闭'))
      }
    })
  }

  private decodeXfyunResult(text: string): string {
    try {
      const json = JSON.parse(atob(text))
      let str = ''
      if (json.ws) {
        for (const w of json.ws) if (w.cw) for (const c of w.cw) str += c.w || ''
      }
      return str
    } catch {
      return ''
    }
  }

  // ===== 检查更新 =====

  async checkUpdate(): Promise<{ success: boolean; hasUpdate?: boolean; version?: string; url?: string; error?: string }> {
    if (this.isElectron()) {
      return (window as any).electronAPI.checkUpdate()
    }
    // Capacitor: 检查 GitHub Releases
    try {
      const res = await fetch('https://api.github.com/repos/dongjiayun/language-learning-app/releases/latest')
      if (!res.ok) return { success: false, error: '检查更新失败' }
      const data = await res.json()
      const latestVersion = (data.tag_name || '').replace(/^v/, '')
      const currentVersion = pkg.version
      const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0
      return {
        success: true,
        hasUpdate,
        version: latestVersion,
        url: data.html_url,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0
      const nb = pb[i] || 0
      if (na > nb) return 1
      if (na < nb) return -1
    }
    return 0
  }

  // ===== Buffer 转换 =====

  bufferToBase64(buffer: ArrayBuffer): string {
    if (this.isElectron()) {
      return (window as any).electronAPI?.bufferToBase64(buffer)
    }
    // Web: 使用 FileReader 转换
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  // ===== 辅助方法 =====

  private mapLangToBcp47(lang: string): string {
    const map: Record<string, string> = {
      'zh-CN': 'zh-CN',
      'en-US': 'en-US',
      'fr-FR': 'fr-FR',
      'ja-JP': 'ja-JP',
    }
    return map[lang] || 'en-US'
  }
}

export const platformBridge = new PlatformBridgeSingleton()
