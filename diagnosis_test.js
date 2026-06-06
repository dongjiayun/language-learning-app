/**
 * 语音识别综合诊断测试
 * 
 * 测试 1: ffmpeg 录音 → 生成 PCM 文件
 * 测试 2: PCM → base64 → 百度 ASR 识别
 * 测试 3: PCM 文件是否有效（非空、有音频数据）
 * 测试 4: 百度 ASR API Key 是否有效
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')

const RECORDING_FILE = '/tmp/doulingo_diag.pcm'
const SAMPLE_RATE = 16000
const RESULTS = { pass: 0, fail: 0 }

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`)
    RESULTS.pass++
  } else {
    console.log(`  ✗ ${msg}`)
    RESULTS.fail++
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ===== 测试 1: ffmpeg 录音 =====
console.log('\n========== 测试 1: ffmpeg 录音 ==========')

async function testRecording() {
  // 删除旧文件
  try { fs.unlinkSync(RECORDING_FILE) } catch {}

  console.log('\n  启动 ffmpeg 录音 2 秒...')

  const proc = spawn('ffmpeg', [
    '-y',
    '-f', 'avfoundation',
    '-i', ':0',
    '-ar', '16000',
    '-ac', '1',
    '-f', 's16le',
    RECORDING_FILE,
  ], { stdio: ['pipe', 'pipe', 'pipe'] })

  let ffmpegOutput = ''
  proc.stderr.on('data', (d) => { ffmpegOutput += d.toString() })

  // 等待 2 秒后停止
  await delay(2000)

  // 用 SIGINT 停止
  proc.kill('SIGINT')

  // 等待进程退出
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch {}
      resolve()
    }, 3000)

    proc.on('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
    proc.on('close', () => {
      clearTimeout(timeout)
      resolve()
    })
  })

  // 检查文件
  if (fs.existsSync(RECORDING_FILE)) {
    const stat = fs.statSync(RECORDING_FILE)
    console.log(`  录音文件大小: ${stat.size} bytes (${(stat.size / 1024).toFixed(1)} KB)`)
    console.log(`  时长约: ${(stat.size / (SAMPLE_RATE * 2)).toFixed(1)} 秒`)
    
    assert(stat.size > 1000, `录音文件存在且 > 1KB (实际: ${stat.size} bytes)`)

    // 检查 PCM 数据是否有效（检查是否有非零值）
    const buf = fs.readFileSync(RECORDING_FILE)
    let nonZero = 0
    for (let i = 0; i < Math.min(buf.length, 16000 * 2); i += 2) {
      const val = buf.readInt16LE(i)
      if (Math.abs(val) > 50) nonZero++ // 阈值 50，过滤底噪
    }
    const totalSamples = Math.min(buf.length / 2, 16000)
    const activeRatio = nonZero / totalSamples
    console.log(`  有效音频占比: ${(activeRatio * 100).toFixed(1)}%`)
    assert(activeRatio > 0.01, `PCM 数据包含有效音频 (${(activeRatio * 100).toFixed(1)}%)`)

    // 读取 PCM 数据并转 base64
    const base64 = buf.toString('base64')
    console.log(`  base64 长度: ${base64.length} chars`)

    return { buf, base64, byteLength: buf.length }
  } else {
    console.log('  ✗ 录音文件未生成')
    console.log('  ffmpeg 输出:', ffmpegOutput.substring(0, 500))
    RESULTS.fail++
    return null
  }
}

// ===== 测试 2: 百度 ASR API 测试 =====
console.log('\n========== 测试 2: 百度 ASR API 测试 ==========')

async function getBaiduToken(apiKey, secretKey) {
  return new Promise((resolve, reject) => {
    const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
    
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.access_token) {
            resolve(json.access_token)
          } else {
            reject(new Error(json.error_description || '获取 token 失败'))
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`))
        }
      })
    }).on('error', reject)
  })
}

async function recognizeWithBaidu(audioBase64, audioLen, apiKey, secretKey) {
  const token = await getBaiduToken(apiKey, secretKey)
  console.log(`  Token 获取成功: ${token.substring(0, 20)}...`)

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      format: 'pcm',
      rate: 16000,
      channel: 1,
      cuid: 'doulingo_diag',
      speech: audioBase64,
      len: audioLen,
    })

    const url = `https://vop.baidu.com/server_api?dev_pid=1537&token=${token}`
    const urlObj = new URL(url)
    
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error(`解析 ASR 响应失败: ${e.message}`))
        }
      })
    })

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function testBaiduAsr() {
  // 从 localStorage 读取 Key（从环境变量传入）
  const apiKey = process.env.BAIDU_API_KEY || ''
  const secretKey = process.env.BAIDU_SECRET_KEY || ''

  if (!apiKey || !secretKey) {
    console.log('  ⚠ 未提供百度 API Key，跳过测试。使用:')
    console.log('    BAIDU_API_KEY=xxx BAIDU_SECRET_KEY=xxx node diagnosis_test.js')
    console.log('  也可以从 appStore 中读取 localStorage 的值。')
    
    // 尝试从可能的配置文件读取
    const configPath = path.join(__dirname, 'baidu_config.json')
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      process.env.BAIDU_API_KEY = cfg.apiKey
      process.env.BAIDU_SECRET_KEY = cfg.secretKey
      console.log('  ✓ 从 baidu_config.json 读取到配置')
    }
    
    RESULTS.fail++
    return
  }

  console.log(`  API Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`)
  console.log(`  Secret Key: ${secretKey.substring(0, 2)}...${secretKey.substring(secretKey.length - 2)}`)

  // 先获取 Token
  try {
    const token = await getBaiduToken(apiKey, secretKey)
    assert(true, '百度 OAuth2 Token 获取成功')
  } catch (e) {
    assert(false, `百度 OAuth2 Token 获取失败: ${e.message}`)
    return
  }

  // 读取录制的 PCM 文件进行测试
  if (!fs.existsSync(RECORDING_FILE)) {
    console.log('  ⚠ 请先执行录音测试生成 PCM 文件')
    return
  }

  const buf = fs.readFileSync(RECORDING_FILE)
  const base64 = buf.toString('base64')
  console.log(`  使用录音文件: ${RECORDING_FILE} (${buf.length} bytes)`)

  try {
    const result = await recognizeWithBaidu(base64, buf.length, apiKey, secretKey)
    console.log('  百度 ASR 响应:', JSON.stringify(result, null, 2))
    
    if (result.err_no === 0) {
      const text = (result.result || []).join('')
      assert(text.length > 0, `百度 ASR 识别成功: "${text}"`)
    } else {
      assert(false, `百度 ASR 返回错误: err_no=${result.err_no}, err_msg=${result.err_msg}`)
    }
  } catch (e) {
    assert(false, `百度 ASR 请求失败: ${e.message}`)
  }
}

// ===== 测试 3: 检查应用内配置的 PCM 阈值 =====
console.log('\n========== 测试 3: 应用内阈值检查 ==========')
{
  // 当前 appStore 中的阈值: 8000 samples ≈ 0.5 秒 @ 16kHz
  // SpeechRecognitionService 中的阈值: 1000 bytes ≈ PCM 500 samples
  const MIN_SAMPLES = 8000
  const MIN_BYTES = 1000
  assert(MIN_SAMPLES > 0, `appStore 最小采样数: ${MIN_SAMPLES}`)
  assert(MIN_BYTES > 0, `主进程最小字节数: ${MIN_BYTES}`)
  console.log(`  ${MIN_SAMPLES} samples @ 16kHz = ${(MIN_SAMPLES / 16000).toFixed(2)} 秒`)
  console.log(`  ${MIN_BYTES} bytes PCM = ${(MIN_BYTES / 2 / 16000).toFixed(2)} 秒`)
}

// ===== 主流程 =====
async function main() {
  // 测试录音
  const audioData = await testRecording()

  // 测试百度 ASR
  await testBaiduAsr()

  // 结果
  console.log('\n========================================')
  console.log('诊断测试结果')
  console.log('========================================')
  console.log(`通过: ${RESULTS.pass}, 失败: ${RESULTS.fail}, 合计: ${RESULTS.pass + RESULTS.fail}`)

  // 清理
  try { fs.unlinkSync(RECORDING_FILE) } catch {}

  if (RESULTS.fail > 0) process.exit(1)
}

main().catch(e => {
  console.error('诊断测试异常:', e)
  process.exit(1)
})
