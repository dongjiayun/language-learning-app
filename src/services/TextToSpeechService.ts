/**
 * 多语种文本转语音服务
 *
 * 跨平台实现：
 *   Electron: 主进程 macOS say 命令 / Windows PowerShell SAPI
 *   Android (Capacitor): Web Speech API (Android WebView 内置)
 *
 * 统一通过 PlatformBridge 调用，自动选择当前平台实现。
 */
import { platformBridge } from './PlatformBridge'

export class TextToSpeechService {
  async speak(text: string, lang: string = 'fr-FR'): Promise<void> {
    const result = await platformBridge.ttsSpeak({ text, lang })
    if (!result.success) {
      throw new Error(result.error || '语音合成失败')
    }
  }

  async stop(): Promise<void> {
    await platformBridge.ttsStop()
  }
}
