/**
 * 音量增益对比测试
 *
 * 验证 ffmpeg volume 增益能否让微弱音频信号被 ASR 识别
 * 模拟极弱信号 → 加增益 → ASR
 * 
 * 用法: node scripts/volume_test.js
 */
const { execSync } = require('child_process');
const { readFileSync, writeFileSync, unlinkSync, existsSync } = require('fs');
const crypto = require('crypto');
const { WebSocket } = require('ws');

const APP_ID = process.env.XFYUN_APP_ID || '74988593';
const API_KEY = process.env.XFYUN_API_KEY || '2cdcdce40a824abace8766002756fa1f';
const API_SECRET = process.env.XFYUN_API_SECRET || 'NWY5YmUyZjEyNWU5OWQyZDI2OTgzOTky';

function asrRecognize(pcmBase64) {
  return new Promise(function(resolve, reject) {
    var host = 'iat.cn-huabei-1.xf-yun.com';
    var path = '/v1';
    var date = new Date().toUTCString();
    var sigOrigin = 'host: ' + host + '\ndate: ' + date + '\nGET ' + path + ' HTTP/1.1';
    var hmac = crypto.createHmac('sha256', API_SECRET).update(sigOrigin).digest('base64');
    var authOrigin = 'api_key="' + API_KEY + '",algorithm="hmac-sha256",headers="host date request-line",signature="' + hmac + '"';
    var authorization = Buffer.from(authOrigin).toString('base64');
    var wsUrl = 'wss://' + host + path + '?authorization=' + encodeURIComponent(authorization) + '&date=' + encodeURIComponent(date) + '&host=' + encodeURIComponent(host);
    var ws = new WebSocket(wsUrl);
    var timeout = setTimeout(function() { ws.close(); reject(new Error('ASR timeout')); }, 15000);
    var recognized = '';
    var finished = false;
    ws.on('open', function() {
      var firstFrame = {
        header: { app_id: APP_ID, status: 0 },
        parameter: { iat: { domain: 'slm', language: 'mul_cn', accent: 'mandarin', eos: 3000, result: { encoding: 'utf8', compress: 'raw', format: 'json' } } },
        payload: { audio: { encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16, seq: 1, status: 0, audio: pcmBase64 } }
      };
      ws.send(JSON.stringify(firstFrame));
      ws.send(JSON.stringify({ header: { app_id: APP_ID, status: 2 }, payload: { audio: { encoding: 'raw', sample_rate: 16000, status: 2, audio: '' } } }));
    });
    ws.on('message', function(data) {
      try {
        var resp = JSON.parse(data.toString());
        if (resp.payload && resp.payload.result) {
          var textB64 = resp.payload.result.text || resp.payload.result.audio;
          if (textB64) {
            try {
              var json = JSON.parse(Buffer.from(textB64, 'base64').toString('utf8'));
              if (json.ws) for (var w = 0; w < json.ws.length; w++) if (json.ws[w].cw) for (var c = 0; c < json.ws[w].cw.length; c++) recognized += json.ws[w].cw[c].w || '';
            } catch(e) {}
          }
        }
        if (resp.header && resp.header.code === 0 && resp.header.status === 2 && !finished) { finished = true; clearTimeout(timeout); ws.close(); resolve(recognized); }
        else if (resp.header && resp.header.code !== 0 && !finished) { finished = true; clearTimeout(timeout); ws.close(); reject(new Error('code=' + resp.header.code)); }
      } catch(e) {}
    });
    ws.on('error', function(e) { if (!finished) { finished = true; clearTimeout(timeout); reject(new Error(e.message)); } });
    ws.on('close', function() { if (!finished) { finished = true; clearTimeout(timeout); resolve(recognized); } });
  });
}

async function main() {
  console.log('========================================');
  console.log('  Volume Gain Test');
  console.log('========================================\n');

  // 生成极弱信号 (振幅 0.01 = 正常 0.3 的 1/30)
  var sampleRate = 16000;
  var duration = 2;
  var numSamples = sampleRate * duration;
  var samples = new Int16Array(numSamples);
  for (var i = 0; i < numSamples; i++) {
    samples[i] = Math.round(32767 * 0.01 * Math.sin(2 * Math.PI * 440 * (i / sampleRate)));
  }
  var weakPcm = Buffer.from(samples.buffer);
  console.log('Generated ' + duration + 's weak PCM: ' + weakPcm.length + ' bytes');

  // 保存为 PCM 文件
  writeFileSync('/tmp/vol_test_weak.pcm', weakPcm);

  // 无增益转 codec (模拟 MediaRecorder 流程)
  console.log('\n--- Test 1: No gain boost ---');
  execSync('ffmpeg -y -f s16le -ar 16000 -ac 1 -i /tmp/vol_test_weak.pcm -c:a libopus -b:a 32k -ar 16000 -ac 1 /tmp/vol_test_weak.webm 2>&1', { timeout: 10000 });
  var webmSize = existsSync('/tmp/vol_test_weak.webm') ? readFileSync('/tmp/vol_test_weak.webm').length : 0;
  console.log('  Weak PCM -> webm/opus: ' + webmSize + ' bytes');

  // 无增益解码回 PCM
  execSync('ffmpeg -y -i /tmp/vol_test_weak.webm -ar 16000 -ac 1 -f s16le /tmp/vol_test_nogain.pcm 2>&1', { timeout: 10000 });
  var noGain = readFileSync('/tmp/vol_test_nogain.pcm');
  var noGainB64 = noGain.toString('base64');
  console.log('  PCM size: ' + noGain.length + ' bytes');
  try {
    var r1 = await asrRecognize(noGainB64);
    console.log('  ASR result: "' + r1 + '"');
  } catch(e) { console.log('  ASR failed: ' + e.message); }

  // 有增益转码 (模拟应用新逻辑: -af volume=10)
  console.log('\n--- Test 2: With volume=10 gain ---');
  execSync('ffmpeg -y -i /tmp/vol_test_weak.webm -af volume=10 -ar 16000 -ac 1 -f s16le /tmp/vol_test_gain.pcm 2>&1', { timeout: 10000 });
  var withGain = readFileSync('/tmp/vol_test_gain.pcm');
  var gainB64 = withGain.toString('base64');
  console.log('  Gain PCM size: ' + withGain.length + ' bytes');
  try {
    var r2 = await asrRecognize(gainB64);
    console.log('  ASR result: "' + r2 + '"');
  } catch(e) { console.log('  ASR failed: ' + e.message); }

  // 清理
  try { unlinkSync('/tmp/vol_test_weak.pcm'); } catch(e) {}
  try { unlinkSync('/tmp/vol_test_weak.webm'); } catch(e) {}
  try { unlinkSync('/tmp/vol_test_nogain.pcm'); } catch(e) {}
  try { unlinkSync('/tmp/vol_test_gain.pcm'); } catch(e) {}

  console.log('\n=== Comparison ===');
  console.log('  Without gain: ' + noGain.length + ' bytes PCM');
  console.log('  With gain:    ' + withGain.length + ' bytes PCM');
  console.log('\n========================================');
  console.log('  Done. Check ASR results above.');
  console.log('========================================');
}

main().catch(function(e) { console.error('Error:', e.message); process.exit(1); });
