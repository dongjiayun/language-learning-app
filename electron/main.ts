import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { spawn, execSync } from 'child_process'
import { readFileSync, unlinkSync, existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import crypto from 'crypto'
// @ts-ignore - ws 没有类型声明
import WebSocket from 'ws'

let mainWindow: BrowserWindow | null = null

// ===== 权限处理 =====
app.on('ready', () => {
  const { session } = require('electron')
  session.defaultSession.setPermissionRequestHandler(
    (_webContents: any, permission: string, callback: (granted: boolean) => void) => {
      if (permission === 'media') {
        callback(true) // 允许麦克风权限
      } else {
        callback(false)
      }
    }
  )
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: '外语口语学习助手',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
    // 生产环境禁用 DevTools
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools()
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ===== ffmpeg 录音实现 =====
/** 查找 ffmpeg 路径 */
function findFfmpegPath(): string {
  let candidates: string[]
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || ''
    candidates = [
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      join(localAppData, 'ffmpeg\\bin\\ffmpeg.exe'),
    ]
  } else {
    candidates = [
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
    ]
  }
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    return execSync(`${cmd} ffmpeg`, { encoding: 'utf8' }).trim()
  } catch {
    return 'ffmpeg'
  }
}
const ffmpegPath = findFfmpegPath()
console.log('[ffmpeg] 路径:', ffmpegPath)

/** Windows: 获取默认麦克风设备名称（通过 ffmpeg -list_devices 枚举） */
function getWindowsAudioInputName(): string {
  try {
    const output = execSync(
      `${ffmpegPath} -list_devices true -f dshow -i dummy 2>&1`,
      { encoding: 'utf8', timeout: 10000 }
    )
    const lines = output.split('\n')
    let inAudioSection = false
    for (const line of lines) {
      const trimmed = line.trim()
      if (/DirectShow audio devices/i.test(trimmed)) {
        inAudioSection = true
        continue
      }
      if (inAudioSection) {
        if (trimmed.startsWith('"') && trimmed.includes('(audio)')) {
          const match = trimmed.match(/"(.+?)"/)
          if (match) {
            console.log('[ffmpeg] Windows 音频设备:', match[1])
            return match[1]
          }
        }
        if (trimmed.startsWith('"') && !trimmed.includes('(audio)')) continue
        // 进入 video 段说明音频已结束
        if (/DirectShow video devices/i.test(trimmed)) break
      }
    }
  } catch {}
  console.warn('[ffmpeg] 未检测到音频设备，将使用默认')
  return ''
}

const RECORDING_FILE = join(tmpdir(), 'doulingo_recording.pcm')
let recordingProcess: any = null
let ffmpegLogBuffer = ''

/**
 * 开始录音
 */
function startFfmpegRecording(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (recordingProcess) {
      reject(new Error('已在录音中'))
      return
    }

    ffmpegLogBuffer = ''
    try { unlinkSync(RECORDING_FILE) } catch {}

    console.log('[ffmpeg] 启动录音...')

    // 构建 ffmpeg 参数（平台差异仅体现在音频输入源）
    const ffmpegArgs: string[] = [
      '-y',
      '-loglevel', 'error',
      '-ar', '16000',
      '-ac', '1',
      '-f', 's16le',
      RECORDING_FILE,
    ]
    if (process.platform === 'win32') {
      const deviceName = getWindowsAudioInputName()
      if (deviceName) {
        ffmpegArgs.unshift('-f', 'dshow', '-i', `audio=${deviceName}`)
      } else {
        ffmpegArgs.unshift('-f', 'dshow', '-i', 'audio=')
      }
    } else {
      ffmpegArgs.unshift('-f', 'avfoundation', '-i', ':0')
    }

    recordingProcess = spawn(ffmpegPath, ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    recordingProcess.on('error', (err: Error) => {
      console.error('[ffmpeg] spawn 错误:', err.message)
      recordingProcess = null
      reject(new Error(`录音启动失败: ${err.message}`))
    })

    // 捕获 stderr（ffmpeg 的日志输出）
    recordingProcess.stderr.on('data', (data: Buffer) => {
      ffmpegLogBuffer += data.toString()
    })

    // 使用 'spawn' 事件或 pid 来判断启动成功
    const onReady = () => {
      if (recordingProcess && recordingProcess.pid) {
        console.log('[ffmpeg] 录音已启动, PID:', recordingProcess.pid)
        resolve()
      }
    }

    recordingProcess.on('spawn', onReady)

    // 如果 spawn 事件没触发，用 pid 作为后备
    const checkInterval = setInterval(() => {
      if (recordingProcess && recordingProcess.pid) {
        clearInterval(checkInterval)
        clearTimeout(timeout)
        onReady()
      }
    }, 100)

    const timeout = setTimeout(() => {
      clearInterval(checkInterval)
      if (recordingProcess && recordingProcess.pid) {
        onReady()
      } else if (recordingProcess) {
        // 有进程对象但没有 pid，可能启动失败
        recordingProcess.kill()
        recordingProcess = null
        console.error('[ffmpeg] 启动超时, 日志:', ffmpegLogBuffer)
        reject(new Error(`录音启动失败: ${ffmpegLogBuffer || '超时'}`))
      }
    }, 3000)
  })
}

/**
 * 停止录音并获取 PCM base64
 */
function stopFfmpegRecording(): Promise<{ base64: string; byteLength: number }> {
  return new Promise((resolve, reject) => {
    if (!recordingProcess) {
      reject(new Error('未在录音'))
      return
    }

    const proc = recordingProcess
    recordingProcess = null

    let processExited = false

    const onExit = () => {
      if (processExited) return
      processExited = true

      // 小延时确保文件完全写入
      setTimeout(() => {
        try {
          const pcmData = readFileSync(RECORDING_FILE)
          console.log('[ffmpeg] 录音停止, PCM 文件:', pcmData.length, 'bytes')

          if (pcmData.length < 500) {
            console.error('[ffmpeg] 录音文件过小, ffmpeg 日志:', ffmpegLogBuffer)
            reject(new Error('未检测到语音输入，请重试'))
            return
          }

          const base64 = pcmData.toString('base64')
          try { unlinkSync(RECORDING_FILE) } catch {}

          resolve({ base64, byteLength: pcmData.length })
        } catch (err: any) {
          reject(new Error(`读取录音文件失败: ${err.message}`))
        }
      }, 200)
    }

    proc.on('exit', onExit)
    proc.on('close', onExit)

    // 发送 SIGINT
    try { proc.kill('SIGINT') } catch {}

    // 3秒超时强制退出
    setTimeout(() => {
      if (!processExited) {
        console.error('[ffmpeg] SIGINT 超时, 强制杀死')
        try { proc.kill('SIGKILL') } catch {}
        onExit()
      }
    }, 3000)
  })
}

// ===== 科大讯飞语音识别 =====
const xfyunLangMap: Record<string, string> = {
  'zh-CN': 'zh',
  'en-US': 'en',
  'fr-FR': 'fr',
  'ja-JP': 'ja',
}

function buildXfyunAuthUrl(host: string, path: string, apiKey: string, apiSecret: string): string {
  const date = new Date().toUTCString()
  const sigOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const signature = crypto.createHmac('sha256', apiSecret).update(sigOrigin).digest('base64')
  const authOrigin = `api_key="${apiKey}",algorithm="hmac-sha256",headers="host date request-line",signature="${signature}"`
  const authorization = Buffer.from(authOrigin).toString('base64')
  return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`
}

function decodeXfyunResult(text: string): string {
  try {
    const json = JSON.parse(Buffer.from(text, 'base64').toString('utf8'))
    let str = ''
    if (json.ws) {
      for (const w of json.ws) if (w.cw) for (const c of w.cw) str += c.w || ''
    }
    return str
  } catch {
    return ''
  }
}

function recognizeWithXfyun(
  audioBase64: string,
  audioLen: number,
  lang: string,
  appId: string,
  apiKey: string,
  apiSecret: string
): Promise<string> {
  const host = 'iat.cn-huabei-1.xf-yun.com'
  const path = '/v1'
  const url = buildXfyunAuthUrl(host, path, apiKey, apiSecret)
  const ln = xfyunLangMap[lang] || ''

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let resultText = ''
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('语音识别超时'))
    }, 30000)

    ws.on('open', () => {
      const firstFrame: any = {
        header: { app_id: appId, status: 0 },
        parameter: {
          iat: {
            domain: 'slm',
            language: 'mul_cn',
            accent: 'mandarin',
            eos: 3000,
            result: { encoding: 'utf8', compress: 'raw', format: 'json' }
          }
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
          }
        }
      }
      // 指定语种
      if (ln) firstFrame.parameter.iat.ln = ln

      ws.send(JSON.stringify(firstFrame))
      ws.send(JSON.stringify({
        header: { app_id: appId, status: 2 },
        payload: { audio: { encoding: 'raw', sample_rate: 16000, status: 2, audio: '' } }
      }))
    })

    ws.on('message', (data: any) => {
      try {
        const p = JSON.parse(data.toString())
        if (p.header?.code !== 0) {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(p.header?.message || `错误 code=${p.header?.code}`))
          return
        }
        if (p.payload?.result?.text) {
          const t = decodeXfyunResult(p.payload.result.text)
          if (t) resultText += t
        }
        if (p.header?.status === 2) {
          clearTimeout(timeout)
          ws.close()
          resolve(resultText)
        }
      } catch { }
    })

    ws.on('error', (err: Error) => {
      clearTimeout(timeout)
      reject(new Error(`讯飞连接失败: ${err.message}`))
    })

    ws.on('close', () => {
      clearTimeout(timeout)
      if (resultText) resolve(resultText)
      else reject(new Error('讯飞连接关闭，未收到识别结果'))
    })
  })
}

// ===== IPC 处理器 =====
ipcMain.handle('speech-start', async () => {
  try {
    await startFfmpegRecording()
    return { success: true }
  } catch (err: any) {
    console.error('[ffmpeg] 启动失败:', err.message)
    return { success: false, error: err.message }
  }
})

// ===== TTS 语音合成（macOS say 命令）=====
// macOS 优质内置语音（premium voices）：
//   fr-FR: Thomas, Jacques   |  fr-CA: Amélie
//   en-US: Samantha           |  en-GB: Daniel
//   zh-CN: Tingting           |  ja-JP: Kyoko
const TTS_VOICES: Record<string, string[]> = {
  'fr-FR': ['Thomas', 'Jacques', 'Amélie'],
  'en-US': ['Samantha', 'Daniel'],
  'zh-CN': ['Tingting', 'Meijia'],
  'ja-JP': ['Kyoko'],
}
const DEFAULT_TTS_VOICE = 'Samantha'

/** 跨平台安全终止进程 */
function safeKillProcess(proc: any) {
  if (!proc) return
  try {
    if (process.platform === 'win32') {
      // Windows: 用 taskkill 杀进程树，确保 PowerShell 子进程也被终止
      try { execSync(`taskkill /pid ${proc.pid} /f /t`, { stdio: 'ignore' }) } catch {}
      try { proc.kill() } catch {}
    } else {
      try { proc.kill('SIGINT') } catch {}
    }
  } catch {}
}

let currentTtsProcess: any = null

// 查找系统中可用的最佳语音
function findBestVoice(lang: string): string {
  const candidates = TTS_VOICES[lang] || [DEFAULT_TTS_VOICE]
  for (const name of candidates) {
    try {
      const output = execSync(`say -v "?"`, { encoding: 'utf8' })
      const lines = output.split('\n')
      for (const line of lines) {
        const parts = line.trim().split(/\s{2,}/)
        if (parts.length >= 1) {
          const voiceName = parts[0].trim()
          if (voiceName === name) {
            console.log('[TTS] 选用语音:', name)
            return name
          }
        }
      }
    } catch {}
  }
  return candidates[0]
}

// Windows TTS via PowerShell SAPI（适用于 Windows 7+，无需额外安装）
const WINDOWS_TTS_VOICES: Record<string, string[]> = {
  'zh-CN': ['Microsoft Huihui Desktop', 'Microsoft Kangkang Desktop', 'Microsoft Yaoyao Desktop'],
  'en-US': ['Microsoft Zira Desktop', 'Microsoft David Desktop', 'Microsoft Mark'],
  'fr-FR': ['Microsoft Hortense Desktop', 'Microsoft Julie Desktop'],
  'ja-JP': ['Microsoft Haruka Desktop', 'Microsoft Ichiro Desktop'],
}

function ttsSpeakWindows(text: string, lang: string): Promise<any> {
  const candidates = WINDOWS_TTS_VOICES[lang] || WINDOWS_TTS_VOICES['en-US']!
  const b64 = Buffer.from(text).toString('base64')
  // 尝试候选语音，然后用 base64 方式传递文本避免编码问题
  const voiceSelectionCmd = candidates
    .map(v => `try{$synth.SelectVoice('${v.replace(/'/g, "''")}')}catch{}`)
    .join(';')
  const psCmd = `Add-Type -AssemblyName System.Speech;` +
    `$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer;` +
    `${voiceSelectionCmd};` +
    `$utf8=[System.Text.Encoding]::UTF8;` +
    `$text=$utf8.GetString([System.Convert]::FromBase64String('${b64}'));` +
    `$synth.Speak($text)`

  return new Promise((resolve) => {
    // 先停掉之前的朗读
    safeKillProcess(currentTtsProcess)
    const proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command', psCmd,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    currentTtsProcess = proc
    const timeout = setTimeout(() => {
      safeKillProcess(proc)
      if (currentTtsProcess === proc) currentTtsProcess = null
      resolve({ success: true })
    }, 120000)
    proc.on('close', () => {
      clearTimeout(timeout)
      if (currentTtsProcess === proc) currentTtsProcess = null
      resolve({ success: true })
    })
    proc.on('error', (err: Error) => {
      clearTimeout(timeout)
      if (currentTtsProcess === proc) currentTtsProcess = null
      resolve({ success: false, error: err.message })
    })
  })
}

ipcMain.handle('tts-speak', async (_, params: { text: string; lang: string }) => {
  // === Windows 分支：使用 PowerShell SAPI ===
  if (process.platform === 'win32') {
    return ttsSpeakWindows(params.text, params.lang)
  }

  // === macOS 分支（现有逻辑，完全不变） ===
  safeKillProcess(currentTtsProcess)
  currentTtsProcess = null

  const voice = findBestVoice(params.lang)
  console.log('[TTS] 朗读:', { text: params.text.substring(0, 30), lang: params.lang, voice })

  return new Promise((resolve) => {
    try {
      currentTtsProcess = spawn('/usr/bin/say', ['-v', voice, params.text], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const timeout = setTimeout(() => {
        safeKillProcess(currentTtsProcess)
        currentTtsProcess = null
        resolve({ success: true })
      }, 30000)

      currentTtsProcess.on('close', () => {
        clearTimeout(timeout)
        currentTtsProcess = null
        resolve({ success: true })
      })

      currentTtsProcess.on('error', (err: Error) => {
        clearTimeout(timeout)
        currentTtsProcess = null
        console.error('[TTS] 朗读失败:', err.message)
        resolve({ success: false, error: err.message })
      })
    } catch (err: any) {
      console.error('[TTS] 启动失败:', err.message)
      resolve({ success: false, error: err.message })
    }
  })
})

ipcMain.handle('tts-stop', async () => {
  safeKillProcess(currentTtsProcess)
  currentTtsProcess = null
  return { success: true }
})

ipcMain.handle('speech-stop', async () => {
  try {
    const { base64, byteLength } = await stopFfmpegRecording()
    return { success: true, audioBase64: base64, audioLen: byteLength }
  } catch (err: any) {
    console.error('[ffmpeg] 停止失败:', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('speech-is-listening', () => {
  return { listening: recordingProcess !== null }
})

// ===== 诊断 IPC =====
ipcMain.handle('diagnostic-check', async () => {
  const results: any[] = []

  // 1. 检查 ffmpeg
  results.push({
    name: 'ffmpeg 路径',
    pass: !!ffmpegPath,
    detail: ffmpegPath,
  })

  // 2. 测试 ffmpeg 版本
  try {
    const v = execSync(`${ffmpegPath} -version 2>&1 | head -1`, { encoding: 'utf8' }).trim()
    results.push({ name: 'ffmpeg 版本', pass: !!v, detail: v })
  } catch (e: any) {
    results.push({ name: 'ffmpeg 版本', pass: false, detail: e.message })
  }

  // 3. 检查是否有残留 PCM 文件
  const oldExists = existsSync(RECORDING_FILE)
  results.push({ name: '旧 PCM 文件', pass: true, detail: oldExists ? `${RECORDING_FILE} 存在` : '不存在' })

  // 4. 测试短录音
  try {
    console.log('[DIAG] 测试录音 2 秒...')
    await startFfmpegRecording()
    await new Promise(r => setTimeout(r, 2000))
    const result = await stopFfmpegRecording()
    results.push({
      name: 'ffmpeg 录音测试',
      pass: result.byteLength > 500,
      detail: `PCM ${result.byteLength} bytes, base64 ${result.base64.length} chars`,
    })
  } catch (e: any) {
    results.push({ name: 'ffmpeg 录音测试', pass: false, detail: e.message })
  }

  return { results }
})

// ===== 音频文件转 PCM（渲染进程 → 主进程）=====
/**
 * 接收渲染进程的 MediaRecorder Blob（webm 格式），
 * 用 ffmpeg 转为 PCM 16kHz 单声道，然后调讯飞 ASR
 */
ipcMain.handle('recognize-audio-blob', async (_, params: {
  audioBase64: string       // webm blob 的 base64
  blobMimeType: string      // 原始 mime type
  lang: string
  appId: string
  apiKey: string
  apiSecret: string
}) => {
  try {
    // 1. 将 base64 写为临时 webm 文件
    const webmFile = join(tmpdir(), 'doulingo_input.webm')
    const pcmFile = join(tmpdir(), 'doulingo_input.pcm')
    const audioBuf = Buffer.from(params.audioBase64, 'base64')
    writeFileSync(webmFile, audioBuf)
    console.log('[AudioBlob] 收到音频:', audioBuf.length, 'bytes, 前20字节hex:', audioBuf.subarray(0, 20).toString('hex'))

    // 2. 用 ffmpeg 转 webm → PCM 16kHz 16bit 单声道
    //    同时增加音量增益 10x，补偿浏览器端麦克风信号过弱的问题
    try {
      execSync(
        `${ffmpegPath} -y -i ${webmFile} -af volume=10 -ar 16000 -ac 1 -f s16le ${pcmFile}`,
        { timeout: 10000 }
      )
    } catch (ffErr: any) {
      const stderr = (ffErr.stderr?.toString() || ffErr.message).substring(0, 200)
      console.error('[AudioBlob] ffmpeg 失败:', stderr)
      try { unlinkSync(webmFile) } catch {}
      try { unlinkSync(pcmFile) } catch {}
      return { success: false, error: `音频转码失败: ${stderr}` }
    }

    const pcmData = readFileSync(pcmFile)
    console.log('[AudioBlob] 转 PCM:', pcmData.length, 'bytes')

    // 清理临时文件
    try { unlinkSync(webmFile) } catch {}
    try { unlinkSync(pcmFile) } catch {}

    // 3. 调用讯飞 ASR（不设阈值，让 ASR 判断是否有有效语音）
    const audioBase64 = pcmData.toString('base64')
    const text = await recognizeWithXfyun(
      audioBase64,
      pcmData.length,
      params.lang,
      params.appId,
      params.apiKey,
      params.apiSecret
    )
    return { success: true, text: text || '' }
  } catch (err: any) {
    console.error('[AudioBlob] 错误:', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('xfyun-asr-recognize', async (_, params: {
  audioBase64: string
  audioLen: number
  lang: string
  appId: string
  apiKey: string
  apiSecret: string
}) => {
  try {
    const text = await recognizeWithXfyun(
      params.audioBase64,
      params.audioLen,
      params.lang,
      params.appId,
      params.apiKey,
      params.apiSecret
    )
    return { success: true, text }
  } catch (err: any) {
    console.error('[XfyunASR] 错误:', err.message)
    return { success: false, error: err.message }
  }
})
