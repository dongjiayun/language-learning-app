/**
 * Windows 语音识别 & TTS 朗读测试 — electron/main.ts
 *
 * 覆盖 Windows 平台完整录音和朗读链路:
 *   - startFfmpegRecording() dshow 参数构造
 *   - getWindowsAudioInputName() 设备枚举
 *   - ttsSpeakWindows() PowerShell SAPI
 *   - safeKillProcess Windows 分支 (taskkill)
 *   - recognize-audio-blob IPC handler
 *   - xfyun-asr-recognize IPC handler
 *
 * 测试方式：mock 所有依赖（electron、child_process、fs、ws），
 * 验证 main.ts 加载后的副作用（spawn 参数、execSync 调用等）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ===== Mock 依赖（必须在所有 import 之前）=====
vi.mock('electron', () => ({
  app: {
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    getPath: vi.fn(() => '/mock/user/data'),
  },
  BrowserWindow: vi.fn(() => ({
    loadFile: vi.fn(),
    webContents: { on: vi.fn(), openDevTools: vi.fn() },
    on: vi.fn(),
  })),
  ipcMain: { handle: vi.fn() },
  session: {
    defaultSession: {
      setPermissionRequestHandler: vi.fn(),
    },
  },
}))

// ws mock — 必须支持 send → message → resolve 链路
const wsHandlers: Record<string, Function> = {}
vi.mock('ws', () => ({
  default: class MockWebSocket {
    on = vi.fn((evt: string, cb: Function) => {
      wsHandlers[evt] = cb
      if (evt === 'open') setTimeout(() => cb(), 1)
      return this
    })
    send = vi.fn(() => {
      // 模拟讯飞返回最终结果，让 recognizeWithXfyun resolve
      setTimeout(() => {
        const msg = JSON.stringify({
          header: { code: 0, status: 2, message: 'success' },
          payload: {
            result: {
              text: Buffer.from(JSON.stringify({ ws: [{ cw: [{ w: '你好' }] }] })).toString('base64'),
            },
          },
        })
        wsHandlers.message?.(msg)
      }, 2)
    })
    close = vi.fn()
    readyState = 1
  },
}))

const mockSpawn = vi.fn()
const mockExecSync = vi.fn()
vi.mock('child_process', () => ({ spawn: mockSpawn, execSync: mockExecSync }))

const mockExistsSync = vi.fn()
const mockUnlinkSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  unlinkSync: mockUnlinkSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}))

vi.mock('os', () => ({ tmpdir: () => '/mock/tmp' }))

// ===== Helper: 创建 mock 进程 =====
// autoCloseMs >= 0 时自动触发 close（用于模拟正常结束）
function makeMockProc(pidNum: number, autoCloseMs = -1) {
  const closeCbs: Function[] = []
  const errorCbs: Function[] = []
  const res = {
    on: vi.fn((evt: string, cb: Function) => {
      if (evt === 'close') closeCbs.push(cb)
      if (evt === 'error') errorCbs.push(cb)
      return res
    }),
    stderr: { on: vi.fn() },
    pid: pidNum,
    kill: vi.fn(() => {
      // kill 时触发 close
      setTimeout(() => closeCbs.forEach(c => c()), 1)
    }),
  }
  // 自动模拟进程结束
  if (autoCloseMs >= 0) {
    setTimeout(() => closeCbs.forEach(c => c()), autoCloseMs)
  }
  return res
}

// 注意: 加载前设置好 mock 返回值，避免 main.ts 执行时报错
beforeEach(() => {
  vi.clearAllMocks()
  // 默认 mock 返回值
  mockExistsSync.mockReturnValue(false)
  mockExecSync.mockReturnValue('ffmpeg')
})

// ============================================================
// 1. ffmpeg 录音 — Windows dshow 参数
// ============================================================

describe('startFfmpegRecording (Windows)', () => {
  async function loadWin32() {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    mockExecSync
      .mockReturnValueOnce('C:\\ffmpeg\\bin\\ffmpeg.exe')   // findFfmpegPath
      .mockReturnValueOnce('')                                 // getWindowsAudioInputName
    const fakeProc = makeMockProc(101)
    mockSpawn.mockReturnValue(fakeProc)
    await import('../../../electron/main')
  }

  it('Windows: 应使用 dshow 参数构造 ffmpeg 命令', async () => {
    await loadWin32()

    // 触发录音
    const { ipcMain } = await import('electron')
    const startHandler = (ipcMain.handle as any).mock.calls.find((c: any) => c[0] === 'speech-start')
    await startHandler[1]()

    const args = mockSpawn.mock.calls[0][1] as string[]
    const fIdx = args.indexOf('-f')
    expect(args[fIdx + 1]).toBe('dshow')
    expect(args).toContain('-ar')
    expect(args).toContain('16000')
    expect(args).toContain('-ac')
    expect(args).toContain('1')
  })

  it('Windows: 检测到麦克风设备时应传入 audio=设备名', async () => {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    mockExecSync
      .mockReturnValueOnce('C:\\ffmpeg\\bin\\ffmpeg.exe')
      .mockReturnValueOnce(`
        DirectShow audio devices:
        "麦克风 (Realtek Audio)" (audio)
        DirectShow video devices:
      `)
    const fakeProc = makeMockProc(102)
    mockSpawn.mockReturnValue(fakeProc)
    await import('../../../electron/main')

    // 触发录音
    const { ipcMain } = await import('electron')
    const startHandler = (ipcMain.handle as any).mock.calls.find((c: any) => c[0] === 'speech-start')
    await startHandler[1]()

    const args = mockSpawn.mock.calls[0][1] as string[]
    const iIdx = args.indexOf('-i')
    expect(args[iIdx + 1]).toBe('audio=麦克风 (Realtek Audio)')
  })

  it('Windows: 未检测到设备时应有 audio= fallback', async () => {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    mockExecSync
      .mockReturnValueOnce('C:\\ffmpeg\\bin\\ffmpeg.exe')
      .mockReturnValueOnce('')
    const fakeProc = makeMockProc(103)
    mockSpawn.mockReturnValue(fakeProc)
    await import('../../../electron/main')

    // 触发录音
    const { ipcMain } = await import('electron')
    const startHandler = (ipcMain.handle as any).mock.calls.find((c: any) => c[0] === 'speech-start')
    await startHandler[1]()

    const args = mockSpawn.mock.calls[0][1] as string[]
    const iIdx = args.indexOf('-i')
    expect(args[iIdx + 1]).toBe('audio=')
  })

  it('Windows: PCM 文件路径应使用 os.tmpdir()', async () => {
    await loadWin32()

    // 触发录音
    const { ipcMain } = await import('electron')
    const startHandler = (ipcMain.handle as any).mock.calls.find((c: any) => c[0] === 'speech-start')
    await startHandler[1]()

    const args = mockSpawn.mock.calls[0][1] as string[]
    const lastArg = args[args.length - 1]
    expect(lastArg).toContain('/mock/tmp')
    expect(lastArg).toContain('doulingo_recording.pcm')
  })
})

// ============================================================
// 2. Windows TTS 朗读 (ttsSpeakWindows)
// ============================================================

describe('ttsSpeakWindows (Windows TTS 朗读)', () => {
  async function loadWin32() {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    mockExecSync.mockReturnValue('ffmpeg')
    const fakeProc = makeMockProc(201)
    mockSpawn.mockReturnValue(fakeProc)
    await import('../../../electron/main')
  }

  it('Windows: 应使用 PowerShell SAPI 朗读', async () => {
    await loadWin32()

    // 通过 ipcMain.handle 找到 tts-speak 并调用
    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const handler = handleCalls.find((c: any) => c[0] === 'tts-speak')

    mockSpawn.mockClear()
    mockSpawn.mockReturnValue(makeMockProc(202, 1))
    await handler[1]({}, { text: 'Bonjour', lang: 'fr-FR' })

    const spawnCall = mockSpawn.mock.calls.find((c: any) => c[0] === 'powershell.exe')
    expect(spawnCall).toBeDefined()
    const psCmd = (spawnCall![1] as string[]).join(' ')
    expect(psCmd).toContain('System.Speech')
    expect(psCmd).toContain('SpeechSynthesizer')
    expect(psCmd).toContain('Speak')
    // 文本应通过 base64 传递
    const b64 = Buffer.from('Bonjour').toString('base64')
    expect(psCmd).toContain(b64)
  })

  it('Windows: 中文语音应包含 Microsoft Huihui', async () => {
    await loadWin32()

    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const handler = handleCalls.find((c: any) => c[0] === 'tts-speak')

    mockSpawn.mockClear()
    mockSpawn.mockReturnValue(makeMockProc(203, 1))
    await handler[1]({}, { text: '你好', lang: 'zh-CN' })

    const spawnCall = mockSpawn.mock.calls.find((c: any) => c[0] === 'powershell.exe')
    expect(spawnCall).toBeDefined()
    const psCmd = (spawnCall![1] as string[]).join(' ')
    expect(psCmd).toContain('Microsoft Huihui')
  })

  it('Windows: 所有语言都有对应的语音候选', async () => {
    await loadWin32()

    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const handler = handleCalls.find((c: any) => c[0] === 'tts-speak')

    const langs = ['zh-CN', 'en-US', 'fr-FR', 'ja-JP']
    for (const lang of langs) {
      mockSpawn.mockClear()
      mockSpawn.mockReturnValue(makeMockProc(210, 1))
      await handler[1]({}, { text: 'test', lang })
      expect(mockSpawn).toHaveBeenCalledWith('powershell.exe', expect.anything(), expect.anything())
    }
  })

  it('Windows: 连续朗读应停掉前一个进程（调用 taskkill）', async () => {
    await loadWin32()

    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const handler = handleCalls.find((c: any) => c[0] === 'tts-speak')

    // 第一次朗读 — 不 await，让进程在后台保持存活
    const proc1 = makeMockProc(221)
    mockSpawn.mockReturnValue(proc1)
    const firstPromise = handler[1]({}, { text: 'first', lang: 'zh-CN' })

    // 第二次朗读 — 会通过 safeKillProcess 停掉 proc1
    mockSpawn.mockReturnValue(makeMockProc(222, 1))
    await handler[1]({}, { text: 'second', lang: 'zh-CN' })

    // 第一次调用的 promise 也应被 proc1.kill() 触发 close 而 resolve
    await firstPromise

    const taskkillCall = mockExecSync.mock.calls.find((c: any) =>
      c[0]?.includes('taskkill') && c[0]?.includes('221')
    )
    expect(taskkillCall).toBeDefined()
  })
})

// ============================================================
// 3. Windows tts-stop IPC
// ============================================================

describe('tts-stop (Windows)', () => {
  async function loadWin32() {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    mockExecSync.mockReturnValue('ffmpeg')
    const fakeProc = makeMockProc(301)
    mockSpawn.mockReturnValue(fakeProc)
    await import('../../../electron/main')
  }

  it('Windows: tts-stop 应终止当前朗读进程', async () => {
    await loadWin32()

    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const ttsHandler = handleCalls.find((c: any) => c[0] === 'tts-speak')
    const stopHandler = handleCalls.find((c: any) => c[0] === 'tts-stop')

    // 先朗读 — 不 await，保持存活
    mockSpawn.mockReturnValue(makeMockProc(311))
    const firstPromise = ttsHandler[1]({}, { text: 'hello', lang: 'en-US' })

    // 再停止
    const result = await stopHandler[1]()
    expect(result.success).toBe(true)

    // 第一次调用的 promise 也被 resolve
    await firstPromise

    const taskkillCall = mockExecSync.mock.calls.find((c: any) => c[0]?.includes('taskkill'))
    expect(taskkillCall).toBeDefined()
  })

  it('Windows: 没有朗读时 tts-stop 不应报错', async () => {
    await loadWin32()

    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const stopHandler = handleCalls.find((c: any) => c[0] === 'tts-stop')

    const result = await stopHandler[1]()
    expect(result.success).toBe(true)
  })
})

// ============================================================
// 4. recognize-audio-blob IPC handler
// ============================================================

describe('recognize-audio-blob (Windows)', () => {
  async function loadWin32() {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    mockExecSync
      .mockReturnValueOnce('ffmpeg')    // findFfmpegPath
      .mockReturnValueOnce('')           // getWindowsAudioInputName
    const fakeProc = makeMockProc(401)
    mockSpawn.mockReturnValue(fakeProc)
    await import('../../../electron/main')
  }

  it('Windows: webm → PCM 转码成功应调用讯飞 ASR', async () => {
    await loadWin32()

    // ffmpeg 转码成功
    mockExecSync.mockReturnValue('') // ffmpeg -y -i ... 成功
    mockReadFileSync.mockReturnValue(Buffer.alloc(1600, 128))

    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const handler = handleCalls.find((c: any) => c[0] === 'recognize-audio-blob')

    const result = await handler[1]({}, {
      audioBase64: Buffer.from('fake-webm').toString('base64'),
      blobMimeType: 'audio/webm',
      lang: 'zh-CN',
      appId: 'test-app-id',
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
    })

    // 应调用 ffmpeg 转码
    const ffmpegCall = mockExecSync.mock.calls.find((c: any) =>
      typeof c[0] === 'string' && c[0].includes('volume=10')
    )
    expect(ffmpegCall).toBeDefined()
    // 最终应返回成功（WebSocket mock 返回了讯飞结果）
    expect(result.success).toBe(true)
    expect(result.text).toBe('你好')
  })

  it('Windows: ffmpeg 转码失败应返回错误', async () => {
    await loadWin32()

    // 清除上个测试残留的 mockReturnValue，然后让所有 execSync 抛异常
    mockExecSync.mockReset()
    mockReadFileSync.mockReset()
    mockExecSync.mockImplementation(() => {
      throw Object.assign(new Error('ffmpeg error'), { stderr: Buffer.from('Invalid data found') })
    })

    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const handler = handleCalls.find((c: any) => c[0] === 'recognize-audio-blob')

    const result = await handler[1]({}, {
      audioBase64: 'dGVzdA==',
      blobMimeType: 'audio/webm',
      lang: 'en-US',
      appId: 'a',
      apiKey: 'b',
      apiSecret: 'c',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('音频转码失败')
  })
})

// ============================================================
// 5. xfyun-asr-recognize IPC handler
// ============================================================

describe('xfyun-asr-recognize (Windows)', () => {
  async function loadWin32() {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    mockExecSync.mockReturnValue('ffmpeg')
    const fakeProc = makeMockProc(501)
    mockSpawn.mockReturnValue(fakeProc)
    await import('../../../electron/main')
  }

  it('Windows: 应正确传递参数并返回识别结果', async () => {
    await loadWin32()

    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const handler = handleCalls.find((c: any) => c[0] === 'xfyun-asr-recognize')

    const result = await handler[1]({}, {
      audioBase64: Buffer.from([0, 1, 2]).toString('base64'),
      audioLen: 3,
      lang: 'fr-FR',
      appId: 'app',
      apiKey: 'key',
      apiSecret: 'secret',
    })

    // WebSocket mock 返回了 "你好"
    expect(result.success).toBe(true)
    expect(result.text).toBe('你好')
  })

  it('Windows: 所有语言都支持', async () => {
    await loadWin32()

    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const handler = handleCalls.find((c: any) => c[0] === 'xfyun-asr-recognize')

    const langs = ['zh-CN', 'en-US', 'fr-FR', 'ja-JP']
    for (const lang of langs) {
      const result = await handler[1]({}, {
        audioBase64: 'dGVzdA==',
        audioLen: 4,
        lang,
        appId: 'app',
        apiKey: 'key',
        apiSecret: 'secret',
      })
      expect(result.success).toBe(true)
    }
  })
})

// ============================================================
// 6. safeKillProcess — Windows 分支
// ============================================================

describe('safeKillProcess (Windows taskkill)', () => {
  async function loadWin32() {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    mockExecSync.mockReturnValue('ffmpeg')
    const fakeProc = makeMockProc(601)
    mockSpawn.mockReturnValue(fakeProc)
    await import('../../../electron/main')
  }

  it('Windows: safeKillProcess 应调用 taskkill /f /t', async () => {
    await loadWin32()

    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const handler = handleCalls.find((c: any) => c[0] === 'tts-speak')

    // 第一次朗读 — 不 await，保持存活
    mockSpawn.mockReturnValue(makeMockProc(611))
    const firstPromise = handler[1]({}, { text: 'a', lang: 'zh-CN' })

    // 第二次朗读触发 safeKillProcess
    mockSpawn.mockReturnValue(makeMockProc(612, 1))
    await handler[1]({}, { text: 'b', lang: 'zh-CN' })

    // 等待第一次调用 resolve
    await firstPromise

    const taskkillCall = mockExecSync.mock.calls.find((c: any) =>
      c[0]?.includes('taskkill')
    )
    expect(taskkillCall).toBeDefined()
    expect(taskkillCall![0]).toContain('/f /t')
  })
})

// ============================================================
// 7. 平台隔离 — macOS 不受影响
// ============================================================

describe('平台隔离 (macOS)', () => {
  async function loadMacOS() {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    mockExecSync.mockReturnValue('/usr/local/bin/ffmpeg')
    const fakeProc = makeMockProc(701)
    mockSpawn.mockReturnValue(fakeProc)
    await import('../../../electron/main')
  }

  it('macOS: 录音使用 avfoundation 而非 dshow', async () => {
    await loadMacOS()

    // 触发录音
    const { ipcMain } = await import('electron')
    const startHandler = (ipcMain.handle as any).mock.calls.find((c: any) => c[0] === 'speech-start')
    await startHandler[1]()

    const args = mockSpawn.mock.calls[0][1] as string[]
    const fIdx = args.indexOf('-f')
    expect(args[fIdx + 1]).toBe('avfoundation')
    expect(args).toContain(':0')
    expect(args).not.toContain('dshow')
  })

  it('macOS: safeKillProcess 不使用 taskkill', async () => {
    await loadMacOS()

    const { ipcMain } = await import('electron')
    const handleCalls = (ipcMain.handle as any).mock.calls
    const ttsHandler = handleCalls.find((c: any) => c[0] === 'tts-speak')

    // macOS 调用 tts-speak（findBestVoice 需要 mock say 输出）
    mockExecSync.mockReturnValue('Samantha   en_US   # Samantha')
    mockSpawn.mockReturnValue(makeMockProc(711, 1))
    await ttsHandler[1]({}, { text: 'hello', lang: 'en-US' })

    // macOS 不会调 taskkill
    const taskkillCalls = mockExecSync.mock.calls.filter((c: any) =>
      typeof c[0] === 'string' && c[0].includes('taskkill')
    )
    expect(taskkillCalls.length).toBe(0)
  })
})
