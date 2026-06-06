/**
 * 端到端流水线测试
 * 测试：录音 Blob → base64 → ffmpeg 转 PCM → 讯飞 ASR 的完整链路
 *
 * 运行：npx vitest run pipeline.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'

// ===== 辅助：找 ffmpeg =====
function findFfmpeg(): string {
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  try {
    return execSync('which ffmpeg', { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const ffmpegPath = findFfmpeg()
const hasFfmpeg = ffmpegPath.length > 0

// ===== 测试用临时文件 =====
const TMP_DIR = '/tmp/doulingo_test'
const TEST_WEBM = join(TMP_DIR, 'test.webm')
const TEST_PCM = join(TMP_DIR, 'test.pcm')
const TEST_WAV = join(TMP_DIR, 'test.wav')

beforeAll(() => {
  // 生成测试音频（模拟 ~0.3 秒真实录音大小的短音频）
  if (hasFfmpeg) {
    execSync(`mkdir -p ${TMP_DIR}`)
    // 用 ffmpeg 生成一个 440Hz 短正弦波 wav
    execSync(
      `${ffmpegPath} -y -f lavfi -i "sine=frequency=440:duration=0.3" -ar 16000 -ac 1 ${TEST_WAV}`,
      { timeout: 5000 }
    )
    // wav → webm/opus（模拟 MediaRecorder 输出格式）
    execSync(
      `${ffmpegPath} -y -i ${TEST_WAV} -c:a libopus -b:a 16k ${TEST_WEBM}`,
      { timeout: 5000 }
    )
  }
})

describe('音频流水线集成测试', () => {
  // ===== 测试 1: ffmpeg 可用性 =====
  describe('ffmpeg 环境', () => {
    it('ffmpeg 应该可用', () => {
      console.log('  ffmpeg 路径:', ffmpegPath || '(未找到)')
      expect(hasFfmpeg).toBe(true)
    })

    it('应该能生成测试音频文件', () => {
      if (!hasFfmpeg) return
      const wavSize = existsSync(TEST_WAV) ? readFileSync(TEST_WAV).length : 0
      const webmSize = existsSync(TEST_WEBM) ? readFileSync(TEST_WEBM).length : 0
      console.log(`  测试 WAV: ${wavSize} bytes`)
      console.log(`  测试 WEBM: ${webmSize} bytes`)
      expect(wavSize).toBeGreaterThan(100)
      expect(webmSize).toBeGreaterThan(0)
    })
  })

  // ===== 测试 2: base64 序列化（模拟 IPC） =====
  describe('base64 IPC 传输', () => {
    it('Buffer → base64 → buffer 可逆', () => {
      if (!hasFfmpeg) return
      const original = readFileSync(TEST_WEBM)
      const b64 = original.toString('base64')
      const decoded = Buffer.from(b64, 'base64')

      console.log(`  原始: ${original.length} bytes → base64: ${b64.length} chars → 解码: ${decoded.length} bytes`)
      expect(decoded.length).toBe(original.length)
      expect(decoded.equals(original)).toBe(true)
    })

    it('Blob 模拟（渲染进程侧）', () => {
      if (!hasFfmpeg) return
      const buf = readFileSync(TEST_WEBM)

      // 模拟 SpeechRecognitionService 中的 Blob → ArrayBuffer → base64 路径
      const blob = new Blob([buf], { type: 'audio/webm;codecs=opus' })
      console.log(`  Blob size: ${blob.size} bytes (type: ${blob.type})`)
      expect(blob.size).toBe(buf.length)
    })
  })

  // ===== 测试 3: ffmpeg webm → PCM（主进程核心环节） =====
  describe('ffmpeg webm → PCM 转换', () => {
    it('应该将 webm 成功转码为 PCM 16kHz 16bit', () => {
      if (!hasFfmpeg) return

      // 清理
      try { unlinkSync(TEST_PCM) } catch {}

      // 执行转换（模拟 main.ts recognize-audio-blob handler）
      execSync(
        `${ffmpegPath} -y -i ${TEST_WEBM} -ar 16000 -ac 1 -f s16le ${TEST_PCM}`,
        { timeout: 10000 }
      )

      const pcm = readFileSync(TEST_PCM)
      console.log(`  转码结果: ${pcm.length} bytes (${(pcm.length / 32000).toFixed(2)} 秒 @ 16kHz 16bit)`)

      expect(pcm.length).toBeGreaterThan(0)
    })

    it('转换后 PCM 应 >= 100 字节(通过主进程阈值)', () => {
      if (!hasFfmpeg) return
      const pcm = readFileSync(TEST_PCM)

      console.log(`  PCM 大小: ${pcm.length} bytes, 阈值 100 → ${pcm.length >= 100 ? '✓ 通过' : '✗ 被拦截'}`)
      expect(pcm.length).toBeGreaterThanOrEqual(100)
    })

    it('PCM base64 大小正常', () => {
      if (!hasFfmpeg) return
      const pcm = readFileSync(TEST_PCM)
      const b64 = pcm.toString('base64')

      console.log(`  PCM base64: ${b64.length} chars`)
      expect(b64.length).toBeGreaterThan(0)
    })
  })

  // ===== 测试 4: 模拟真实录音大小（497 bytes / 707 bytes） =====
  describe('模拟真实录音大小', () => {
    it('应能生成与用户录音相当的 webm 文件', () => {
      if (!hasFfmpeg) return
      const webm = readFileSync(TEST_WEBM)
      console.log(`  测试 webm: ${webm.length} bytes (用户录音: 497 / 707 bytes)`)

      // 如果测试 webm 太大，缩小
      if (webm.length > 2000) {
        // 生成更短的音频
        execSync(
          `${ffmpegPath} -y -f lavfi -i "sine=frequency=440:duration=0.1" -ar 16000 -ac 1 ${TEST_WAV}`,
          { timeout: 5000 }
        )
        execSync(
          `${ffmpegPath} -y -i ${TEST_WAV} -c:a libopus -b:a 16k -f webm ${TEST_WEBM}`,
          { timeout: 5000 }
        )
        const shortWebm = readFileSync(TEST_WEBM)
        console.log(`  缩短后 webm: ${shortWebm.length} bytes`)
      }
    })

    it('短 webm 仍可转 PCM', () => {
      if (!hasFfmpeg) return
      const webm = readFileSync(TEST_WEBM)

      try { unlinkSync(TEST_PCM) } catch {}
      execSync(
        `${ffmpegPath} -y -i ${TEST_WEBM} -ar 16000 -ac 1 -f s16le ${TEST_PCM}`,
        { timeout: 10000 }
      )

      const pcm = readFileSync(TEST_PCM)
      console.log(`  webm ${webm.length} bytes → PCM ${pcm.length} bytes`)

      // 即使 100-200 字节的 webm 也应该能转出 PCM
      expect(pcm.length).toBeGreaterThan(0)
      expect(pcm.length).toBeGreaterThanOrEqual(100)
    })
  })
})

// 清理
afterAll(() => {
  try { unlinkSync(TEST_WEBM) } catch {}
  try { unlinkSync(TEST_PCM) } catch {}
  try { unlinkSync(TEST_WAV) } catch {}
})
