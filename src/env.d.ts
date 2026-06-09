/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Web Speech API 类型声明
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface Window {
  SpeechRecognition: new () => SpeechRecognition
  webkitSpeechRecognition: new () => SpeechRecognition
  electronAPI?: {
    platform: string
    bufferToBase64: (buffer: ArrayBuffer) => string
    speechStart: () => Promise<any>
    speechStop: () => Promise<any>
    speechIsListening: () => Promise<{ listening: boolean }>
    ttsSpeak: (params: { text: string; lang: string }) => Promise<any>
    ttsStop: () => Promise<any>
    diagnosticCheck: () => Promise<any>
    recognizeAudioBlob: (params: {
      audioBase64: string
      blobMimeType: string
      lang: string
      appId: string
      apiKey: string
      apiSecret: string
    }) => Promise<any>
    xfyunAsrRecognize: (params: {
      audioBase64: string
      audioLen: number
      lang: string
      appId: string
      apiKey: string
      apiSecret: string
    }) => Promise<any>
    checkUpdate: () => Promise<{
      success: boolean
      isLatest?: boolean
      currentVersion?: string
      latestVersion?: string
      downloadUrl?: string
      error?: string
    }>
  }
}