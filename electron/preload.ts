import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // 将 ArrayBuffer 转 base64（使用 Node.js Buffer，不在渲染进程操作大二进制数据）
  bufferToBase64: (buffer: ArrayBuffer): string => {
    return Buffer.from(buffer).toString('base64')
  },

  // 语音识别：启动录音（主进程 ffmpeg）
  speechStart: () => ipcRenderer.invoke('speech-start'),

  // 语音识别：停止录音并返回 PCM base64
  speechStop: () => ipcRenderer.invoke('speech-stop'),

  // 语音识别：检查是否正在录音
  speechIsListening: () => ipcRenderer.invoke('speech-is-listening'),

  // TTS 语音合成：朗读文本
  ttsSpeak: (params: { text: string; lang: string }) =>
    ipcRenderer.invoke('tts-speak', params),

  // TTS 语音合成：停止朗读
  ttsStop: () => ipcRenderer.invoke('tts-stop'),

  // 诊断检查
  diagnosticCheck: () => ipcRenderer.invoke('diagnostic-check'),

  // 音频 Blob 识别：渲染进程录音 → 发送到主进程 → ffmpeg 转 PCM → 讯飞 ASR
  recognizeAudioBlob: (params: {
    audioBase64: string
    blobMimeType: string
    lang: string
    appId: string
    apiKey: string
    apiSecret: string
  }) => ipcRenderer.invoke('recognize-audio-blob', params),

  // 讯飞 ASR 识别
  xfyunAsrRecognize: (params: {
    audioBase64: string
    audioLen: number
    lang: string
    appId: string
    apiKey: string
    apiSecret: string
  }) => ipcRenderer.invoke('xfyun-asr-recognize', params),

  // 检查更新
  checkUpdate: () => ipcRenderer.invoke('check-update'),
})
