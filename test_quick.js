/**
 * 快速诊断：ffmpeg 录音 + SIGINT 停止
 * 验证录音整个链路是否正常
 */
const fs = require('fs')
const { spawn } = require('child_process')

const FILE = '/tmp/test_quick.pcm'
try { fs.unlinkSync(FILE) } catch {}

console.log('[DIAG] 启动 ffmpeg 录音 1.5 秒...')
const proc = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'avfoundation', '-i', ':0',
  '-ar', '16000', '-ac', '1',
  '-f', 's16le', FILE,
], { stdio: ['pipe', 'pipe', 'pipe'] })

let errBuf = ''
proc.stderr.on('data', d => { errBuf += d.toString() })

proc.on('error', e => {
  console.log('[DIAG] spawn error:', e.message)
})

console.log('[DIAG] PID:', proc.pid)

setTimeout(() => {
  console.log('[DIAG] 发送 SIGINT...')
  const killed = proc.kill('SIGINT')
  console.log('[DIAG] kill return:', killed)
}, 1500)

proc.on('exit', code => {
  console.log('[DIAG] 进程退出, code:', code)
})

proc.on('close', () => {
  console.log('[DIAG] 进程关闭')
  
  setTimeout(() => {
    if (fs.existsSync(FILE)) {
      const size = fs.statSync(FILE).size
      console.log('[DIAG] PCM 文件大小:', size, 'bytes')
      if (size > 500) {
        console.log('[DIAG] ✓ 录音成功!')
      } else {
        console.log('[DIAG] ✗ 文件太小')
      }
    } else {
      console.log('[DIAG] ✗ 文件不存在')
    }
    if (errBuf) console.log('[DIAG] ffmpeg 日志:', errBuf)
    try { fs.unlinkSync(FILE) } catch {}
  }, 500)
})
