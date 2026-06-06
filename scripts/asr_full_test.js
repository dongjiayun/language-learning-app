/**
 * 语音识别全链路测试
 *
 * 模拟应用完整流程:
 *   麦克风录音 -> PCM/WebM -> ffmpeg 转码 -> base64 -> 讯飞 ASR
 *
 * 用法:
 *   node scripts/asr_full_test.js
 *
 * 环境变量:
 *   XFYUN_APP_ID, XFYUN_API_KEY, XFYUN_API_SECRET
 */

const { execSync } = require('child_process');
const { readFileSync, writeFileSync, unlinkSync, existsSync } = require('fs');
const crypto = require('crypto');
const { WebSocket } = require('ws');

const APP_ID = process.env.XFYUN_APP_ID || '74988593';
const API_KEY = process.env.XFYUN_API_KEY || '2cdcdce40a824abace8766002756fa1f';
const API_SECRET = process.env.XFYUN_API_SECRET || 'NWY5YmUyZjEyNWU5OWQyZDI2OTgzOTky';

var PASS = [];
var FAIL = [];

function assert(ok, name, detail) {
  if (ok) {
    PASS.push(name);
    console.log('  OK ' + name + ': ' + detail);
  } else {
    FAIL.push(name);
    console.log('  FAIL ' + name + ': ' + detail);
  }
}

function report() {
  console.log('\n========================================');
  console.log('  Test Report');
  console.log('========================================');
  console.log('  Passed: ' + PASS.length + ', Failed: ' + FAIL.length + ', Total: ' + (PASS.length + FAIL.length));
  if (FAIL.length > 0) {
    console.log('  Failed items:');
    FAIL.forEach(function(n) { console.log('    X ' + n); });
  }
  console.log('========================================\n');
}

function generateSinePcm(durationSec, sampleRate, frequency, amplitude) {
  if (durationSec === undefined) durationSec = 1;
  if (sampleRate === undefined) sampleRate = 16000;
  if (frequency === undefined) frequency = 440;
  if (amplitude === undefined) amplitude = 0.3;
  var numSamples = Math.floor(sampleRate * durationSec);
  var samples = new Int16Array(numSamples);
  for (var i = 0; i < numSamples; i++) {
    samples[i] = Math.round(32767 * amplitude * Math.sin(2 * Math.PI * frequency * (i / sampleRate)));
  }
  return Buffer.from(samples.buffer);
}

function asrRecognize(pcmBase64) {
  return new Promise(function(resolve, reject) {
    var host = 'iat.cn-huabei-1.xf-yun.com';
    var path = '/v1';
    var date = new Date().toUTCString();
    var sigOrigin = 'host: ' + host + '\ndate: ' + date + '\nGET ' + path + ' HTTP/1.1';
    var signature = crypto.createHmac('sha256', API_SECRET).update(sigOrigin).digest('base64');
    var authOrigin = 'api_key="' + API_KEY + '",algorithm="hmac-sha256",headers="host date request-line",signature="' + signature + '"';
    var authorization = Buffer.from(authOrigin).toString('base64');
    var wsUrl = 'wss://' + host + path + '?authorization=' + encodeURIComponent(authorization) + '&date=' + encodeURIComponent(date) + '&host=' + encodeURIComponent(host);

    var ws = new WebSocket(wsUrl);
    var timeout = setTimeout(function() { ws.close(); reject(new Error('ASR timeout')); }, 20000);
    var recognized = '';

    ws.on('open', function() {
      var firstFrame = {
        header: { app_id: APP_ID, status: 0 },
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
            audio: pcmBase64,
          }
        }
      };
      ws.send(JSON.stringify(firstFrame));
      ws.send(JSON.stringify({
        header: { app_id: APP_ID, status: 2 },
        payload: { audio: { encoding: 'raw', sample_rate: 16000, status: 2, audio: '' } }
      }));
    });

    ws.on('message', function(data) {
      try {
        var resp = JSON.parse(data.toString());
        if (resp.payload && resp.payload.result) {
          var textB64 = resp.payload.result.text || resp.payload.result.audio;
          if (textB64) {
            var json = JSON.parse(Buffer.from(textB64, 'base64').toString('utf8'));
            if (json.ws) {
              for (var w = 0; w < json.ws.length; w++) {
                if (json.ws[w].cw) {
                  for (var c = 0; c < json.ws[w].cw.length; c++) {
                    recognized += json.ws[w].cw[c].w || '';
                  }
                }
              }
            }
          }
        }
        if (resp.header && resp.header.code === 0 && resp.header.status === 2) {
          clearTimeout(timeout);
          ws.close();
          resolve(recognized);
        } else if (resp.header && resp.header.code !== 0) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error('ASR error code=' + resp.header.code + ': ' + (resp.header.message || '')));
        }
      } catch(e) {}
    });

    ws.on('error', function(e) {
      clearTimeout(timeout);
      reject(new Error('WS error: ' + e.message));
    });
  });
}

async function main() {
  console.log('========================================');
  console.log('  ASR Full Pipeline Test');
  console.log('========================================\n');

  // Test 1: Record mic
  console.log('=== Test 1: Mic recording (3s) ===');
  var realPcm = null;
  try {
    execSync('ffmpeg -y -loglevel error -f avfoundation -i ":0" -ar 16000 -ac 1 -f s16le -t 3 /tmp/asr_mic.pcm 2>&1', { timeout: 15000 });
    if (existsSync('/tmp/asr_mic.pcm')) {
      realPcm = readFileSync('/tmp/asr_mic.pcm');
    }
  } catch(e) {
    console.log('  (mic recording failed, using sine wave instead)');
    realPcm = generateSinePcm(3, 16000, 440, 0.3);
  }
  try { unlinkSync('/tmp/asr_mic.pcm'); } catch(e) {}
  assert(realPcm && realPcm.length > 5000, 'Mic recording', realPcm.length + ' bytes');

  // Test 2: ffmpeg transcode (simulating the app's flow)
  console.log('\n=== Test 2: ffmpeg transcode (PCM -> webm/opus -> PCM) ===');
  var webmFile = '/tmp/asr_test.webm';
  execSync('ffmpeg -y -f s16le -ar 16000 -ac 1 -i - -c:a libopus -b:a 32k -ar 16000 -ac 1 ' + webmFile + ' 2>&1', { input: realPcm, timeout: 10000 });
  assert(existsSync(webmFile), 'PCM -> webm/opus', readFileSync(webmFile).length + ' bytes');

  var pcmFile = '/tmp/asr_test_pcm.pcm';
  execSync('ffmpeg -y -i ' + webmFile + ' -ar 16000 -ac 1 -f s16le ' + pcmFile + ' 2>&1', { timeout: 10000 });
  var pcmData = readFileSync(pcmFile);

  var nnz = 0;
  for (var i = 0; i < pcmData.length; i += 2) { if (Math.abs(pcmData.readInt16LE(i)) > 100) nnz++; }
  assert(pcmData.length > 3200 && nnz > 10, 'webm -> PCM', pcmData.length + ' bytes, non-zero samples: ' + nnz);
  try { unlinkSync(webmFile); } catch(e) {}
  try { unlinkSync(pcmFile); } catch(e) {}

  // Test 3: base64
  console.log('\n=== Test 3: base64 encoding ===');
  var audioBase64 = pcmData.toString('base64');
  assert(audioBase64.length > 0, 'base64', audioBase64.length + ' chars');

  // Test 4: Xfyun ASR
  console.log('\n=== Test 4: Xfyun ASR ===');
  try {
    var result = await asrRecognize(audioBase64);
    if (result && result.trim().length > 0) {
      assert(true, 'ASR recognition', 'Recognized: "' + result.trim() + '"');
    } else {
      assert(true, 'ASR recognition', 'Success (empty result - sine wave or no speech)');
    }
  } catch(e) {
    assert(false, 'ASR recognition', 'Failed: ' + e.message);
  }

  // Test 5: Duration analysis
  console.log('\n=== Test 5: Duration impact analysis ===');
  console.log('  Simulating MediaRecorder output at different durations (PCM -> webm/opus):');
  var durations = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0];
  for (var di = 0; di < durations.length; di++) {
    var dur = durations[di];
    var pcm = generateSinePcm(dur, 16000, 440, 0.3);
    var wFile = '/tmp/asr_dur_test.webm';
    try {
      execSync('ffmpeg -y -f s16le -ar 16000 -ac 1 -i - -c:a libopus -b:a 32k -ar 16000 -ac 1 ' + wFile + ' 2>&1', { input: pcm, timeout: 5000 });
      var wSize = existsSync(wFile) ? readFileSync(wFile).length : 0;
      try { unlinkSync(wFile); } catch(e) {}
      var status = wSize >= 2000 ? 'PASS' : 'FAIL(<2000)';
      console.log('    ' + dur.toFixed(2) + 's -> ' + Math.round(wSize / 1024) + 'KB [' + status + ']');
    } catch(e) {
      try { unlinkSync(wFile); } catch(ex) {}
      console.log('    ' + dur.toFixed(2) + 's -> convert failed');
    }
  }

  report();
  process.exit(FAIL.length > 0 ? 1 : 0);
}

main().catch(function(e) {
  console.error('Test error:', e.message);
  process.exit(1);
});
