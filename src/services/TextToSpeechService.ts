/**
 * 多语种文本转语音服务
 *
 * 使用主进程 macOS say 命令朗读，支持优质 premium 语音：
 *   fr-FR: Thomas (男) / Jacques (男) / Amélie (女)
 *   en-US: Samantha (女) / Daniel (男)
 *   zh-CN: Tingting (女) / Meijia (女)
 *   ja-JP: Kyoko (女)
 *
 * 自动检测系统中可用的最佳语音，逐级降级。
 * 相比 Web Speech API，macOS say 命令的 premium 语音发音更自然。
 */
export class TextToSpeechService {
  async speak(text: string, lang: string = 'fr-FR'): Promise<void> {
    const result = await window.electronAPI.ttsSpeak({ text, lang })
    if (!result.success) {
      throw new Error(result.error || '语音合成失败')
    }
  }

  async stop(): Promise<void> {
    await window.electronAPI.ttsStop()
  }
}
