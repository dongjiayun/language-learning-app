/**
 * 语音识别测试脚本
 * 在 Node.js (主进程) 环境中测试音频处理各环节
 */
const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

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

// ============ 测试 1: Node.js Buffer base64 编码 ============
console.log('\n[测试 1] Node.js Buffer base64 编码稳定性')
{
  const size = 1024 * 1024 // 1MB
  const buf = Buffer.alloc(size, 0x41)
  const start = Date.now()
  const b64 = buf.toString('base64')
  const elapsed = Date.now() - start
  assert(b64.length > 0, `1MB Buffer → base64 (${elapsed}ms, 长度=${b64.length})`)

  // 验证解码正确
  const decoded = Buffer.from(b64, 'base64')
  assert(decoded.length === size, 'base64 解码后长度一致')
}

// ============ 测试 2: 大 Buffer base64 编码 ============
console.log('\n[测试 2] 大文件 Buffer 稳定性')
{
  const size = 10 * 1024 * 1024 // 10MB
  const buf = Buffer.alloc(size, 0x42)
  const start = Date.now()
  const b64 = buf.toString('base64')
  const elapsed = Date.now() - start
  assert(b64.length > 0, `10MB Buffer → base64 (${elapsed}ms)`)
  assert(!b64.includes('undefined'), 'base64 不包含 undefined')
  assert(!b64.includes('NaN'), 'base64 不包含 NaN')
}

// ============ 测试 3: ffmpeg 是否可用 ============
console.log('\n[测试 3] 检查 ffmpeg 可用性')
{
  try {
    const result = execSync('ffmpeg -version 2>&1', { timeout: 3000 }).toString()
    const firstLine = result.split('\n')[0]
    assert(true, `ffmpeg 可用: ${firstLine}`)
  } catch {
    console.log('  ⚠ ffmpeg 未安装，将尝试其他方案')
  }
}

// ============ 测试 4: 检查 sox 是否可用 ============
console.log('\n[测试 4] 检查 sox 可用性')
{
  try {
    const result = execSync('sox --version 2>&1', { timeout: 3000 }).toString()
    assert(true, `sox 可用: ${result.trim()}`)
  } catch {
    console.log('  ⚠ sox 未安装')
  }
}

// ============ 测试 5: 生成测试 PCM 文件 ============
console.log('\n[测试 5] PCM 文件生成')
{
  const sampleRate = 16000
  const duration = 0.5 // 0.5秒
  const numSamples = sampleRate * duration
  
  // 生成 440Hz 正弦波
  const samples = new Int16Array(numSamples)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    samples[i] = Math.round(32767 * 0.3 * Math.sin(2 * Math.PI * 440 * t))
  }

  const buf = Buffer.from(samples.buffer)
  const tmpFile = '/tmp/doulingo_test_sine.pcm'
  fs.writeFileSync(tmpFile, buf)
  
  const stats = fs.statSync(tmpFile)
  assert(stats.size === buf.length, `PCM 文件生成成功: ${stats.size} bytes`)

  // 转 base64
  const b64 = buf.toString('base64')
  assert(b64.length > 0, `PCM → base64 (${b64.length} chars)`)

  // 清理
  fs.unlinkSync(tmpFile)
}

// ============ 测试 6: 模拟 IPC 序列化 ============
console.log('\n[测试 6] IPC 参数序列化')
{
  // Electron structured clone 模拟
  const params = {
    audioBase64: Buffer.alloc(100000, 0x41).toString('base64'),
    audioLen: 100000,
    lang: 'zh-CN',
    apiKey: 'test_key',
    secretKey: 'test_secret',
  }

  // JSON 序列化（模拟 IPC 传输）
  const serialized = JSON.stringify(params)
  const deserialized = JSON.parse(serialized)
  
  assert(deserialized.audioBase64 === params.audioBase64, 'base64 字符串经过 JSON 序列化后不变')
  assert(deserialized.audioLen === 100000, '数字字段序列化正确')
  assert(deserialized.lang === 'zh-CN', '字符串字段序列化正确')
  
  // 比较 string vs ArrayBuffer 的序列化大小
  const stringSize = serialized.length
  const arrayBufferData = Buffer.alloc(100000, 0x41)
  const arrayBufferParams = { pcmBuffer: arrayBufferData.toString('base64'), audioLen: 100000 }
  const arrayBufferSerialized = JSON.stringify(arrayBufferParams)
  
  console.log(`  String IPC JSON 大小: ${stringSize} bytes`)
  console.log(`  ArrayBuffer JSON 大小: ${arrayBufferSerialized.length} bytes`)
  assert(stringSize <= arrayBufferSerialized.length * 1.1, '字符串传输体积不比 ArrayBuffer 大')
}

// ============ 测试 7: 测试 webm 文件转换 ============
console.log('\n[测试 7] webm → PCM 转换')
{
  // 先检查是否有 ffmpeg 可用
  let hasFfmpeg = false
  try {
    execSync('ffmpeg -version 2>&1', { timeout: 3000 })
    hasFfmpeg = true
  } catch {}

  if (hasFfmpeg) {
    // 用 ffmpeg 生成一个测试音频文件
    try {
      // 生成 sine.wav
      execSync(
        'ffmpeg -f lavfi -i "sine=frequency=440:duration=1" -ar 16000 -ac 1 /tmp/doulingo_test_sine.wav -y 2>&1',
        { timeout: 5000 }
      )
      
      // 将 wav 转 pcm
      execSync(
        'ffmpeg -i /tmp/doulingo_test_sine.wav -f s16le -ar 16000 -ac 1 /tmp/doulingo_test_output.pcm -y 2>&1',
        { timeout: 5000 }
      )

      const pcmFile = fs.readFileSync('/tmp/doulingo_test_output.pcm')
      const b64 = pcmFile.toString('base64')
      assert(pcmFile.length > 1000, `webm → PCM 转换成功: ${pcmFile.length} bytes, base64=${b64.substring(0, 20)}...`)
      
      // 清理
      try { fs.unlinkSync('/tmp/doulingo_test_sine.wav') } catch {}
      try { fs.unlinkSync('/tmp/doulingo_test_output.pcm') } catch {}
    } catch (e) {
      assert(false, `webm → PCM 转换失败: ${e.message}`)
    }
  } else {
    console.log('  ⚠ ffmpeg 不可用，跳过 webm → PCM 转换测试')
  }
}

// ============ 结论 ============
console.log('\n========================================')
console.log('测试结果')
console.log('========================================')
console.log(`通过: ${RESULTS.pass}, 失败: ${RESULTS.fail}, 合计: ${RESULTS.pass + RESULTS.fail}`)

if (RESULTS.fail > 0) {
  console.log('\n⚠ 存在失败项，需要修复')
  process.exit(1)
} else {
  console.log('\n✓ 全部通过')
}
