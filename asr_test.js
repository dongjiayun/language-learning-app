/**
 * 讯飞 ASR 完整测试 v5 - 解码结果 + 多语种测试
 */
const fs = require('fs')
const crypto = require('crypto')
const { spawn } = require('child_process')
const WebSocket = require('ws')

const PCM_FILE = '/tmp/doulingo_test_asr.pcm'

const APPID = '74988593'
const API_KEY = '2cdcdce40a824abace8766002756fa1f'
const API_SECRET = 'NWY5YmUyZjEyNWU5OWQyZDI2OTgzOTky'

function buildAuthUrl(host, path, apiKey, apiSecret) {
  const date = new Date().toUTCString()
  const sigOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const sig = crypto.createHmac('sha256', apiSecret).update(sigOrigin).digest('base64')
  const authOrigin = `api_key="${apiKey}",algorithm="hmac-sha256",headers="host date request-line",signature="${sig}"`
  const authorization = Buffer.from(authOrigin).toString('base64')
  return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`
}

function decodeResult(text) {
  try {
    const json = JSON.parse(Buffer.from(text, 'base64').toString('utf8'))
    let str = ''
    if (json.ws) {
      for (const w of json.ws) if (w.cw) for (const c of w.cw) str += c.w || ''
    }
    return str
  } catch { return text }
}

function testASR(url, appId, audioBase64, name, makeFrames) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    let resultText = ''
    const timeout = setTimeout(() => { ws.close(); resolve({ name, text: resultText || '(超时)' }) }, 20000)

    ws.on('open', () => {
      console.log(`  ${name}: 已连接`)
      const frames = makeFrames(appId, audioBase64)
      for (const f of frames) ws.send(JSON.stringify(f))
    })
    ws.on('message', (data) => {
      try {
        const p = JSON.parse(data.toString())
        if (p.header?.code !== 0) {
          clearTimeout(timeout); ws.close()
          resolve({ name, text: '', error: p.header?.message || `code=${p.header?.code}` })
          return
        }
        if (p.payload?.result?.text) {
          const t = decodeResult(p.payload.result.text)
          if (t) resultText += t
        }
        if (p.header?.status === 2) {
          clearTimeout(timeout); ws.close()
          resolve({ name, text: resultText || '(空)' })
        }
      } catch { }
    })
    ws.on('error', (err) => { clearTimeout(timeout); resolve({ name, text: '', error: err.message }) })
    ws.on('close', () => { clearTimeout(timeout); resolve({ name, text: resultText || '(空)' }) })
  })
}

async function main() {
  // 录音 3 秒，说话
  console.log('=== 录音 3秒（请说话）===')
  await new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'avfoundation', '-i', ':0', '-ar', '16000', '-ac', '1', '-f', 's16le', PCM_FILE])
    setTimeout(() => { proc.kill('SIGINT'); setTimeout(resolve, 500) }, 3000)
  })
  const pcm = fs.readFileSync(PCM_FILE)
  const audioBase64 = pcm.toString('base64')
  console.log('PCM:', pcm.length, 'bytes')

  const HOST = 'iat.cn-huabei-1.xf-yun.com'
  const PATH = '/v1'
  const url = buildAuthUrl(HOST, PATH, API_KEY, API_SECRET)

  const tests = []

  // T1: 多语种自动识别（默认）
  tests.push(testASR(url, APPID, audioBase64, 'T1: 多语种自动(mul_cn)', (appId, b64) => [
    { header: { app_id: appId, status: 0 }, parameter: { iat: { domain: 'slm', language: 'mul_cn', accent: 'mandarin', eos: 3000, result: { encoding: 'utf8', compress: 'raw', format: 'json' } } }, payload: { audio: { encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16, seq: 1, status: 0, audio: b64 } } },
    { header: { app_id: appId, status: 2 }, payload: { audio: { encoding: 'raw', sample_rate: 16000, status: 2, audio: '' } } }
  ]))

  // T2: 指定法语
  tests.push(testASR(url, APPID, audioBase64, 'T2: 指定法语(ln=fr)', (appId, b64) => [
    { header: { app_id: appId, status: 0 }, parameter: { iat: { domain: 'slm', language: 'mul_cn', accent: 'mandarin', ln: 'fr', eos: 3000, result: { encoding: 'utf8', compress: 'raw', format: 'json' } } }, payload: { audio: { encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16, seq: 1, status: 0, audio: b64 } } },
    { header: { app_id: appId, status: 2 }, payload: { audio: { encoding: 'raw', sample_rate: 16000, status: 2, audio: '' } } }
  ]))

  // T3: 指定英语
  tests.push(testASR(url, APPID, audioBase64, 'T3: 指定英语(ln=en)', (appId, b64) => [
    { header: { app_id: appId, status: 0 }, parameter: { iat: { domain: 'slm', language: 'mul_cn', accent: 'mandarin', ln: 'en', eos: 3000, result: { encoding: 'utf8', compress: 'raw', format: 'json' } } }, payload: { audio: { encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16, seq: 1, status: 0, audio: b64 } } },
    { header: { app_id: appId, status: 2 }, payload: { audio: { encoding: 'raw', sample_rate: 16000, status: 2, audio: '' } } }
  ]))

  const results = await Promise.all(tests)
  console.log('\n======== 结果 ========')
  for (const r of results) {
    console.log(`${r.name}: ${r.error ? '✗ ' + r.error : '✓ "' + r.text + '"'}`)
  }

  fs.unlinkSync(PCM_FILE)
}

main().catch(e => { console.error(e); try { fs.unlinkSync(PCM_FILE) } catch {} })
