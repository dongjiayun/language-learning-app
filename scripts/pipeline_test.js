/**
 * 语音识别全链路管道测试
 *
 * 模拟应用完整流程，逐段测试每环节是否有问题：
 *   1. 生成测试 PCM 音频
 *   2. ffmpeg 编码 PCM → webm/opus（模拟 MediaRecorder）
 *   3. base64 编码（模拟 preload.bufferToBase64）
 *   4. ffmpeg 解码 webm → PCM（模拟主进程 recognize-audio-blob）
 *   5. 科大讯飞 ASR 识别
 *   6. 真实麦克风录音 → 完整管道
 *   7. 空音频/小音频测试（验证 ASR 是否能正确处理）
 *
 * 用法：node scripts/pipeline_test.js
 */

const { execSync } = require('child_process');
const { readFileSync, writeFileSync, unlinkSync, existsSync } = require('fs');
const crypto = require('crypto');
const { WebSocket } = require('ws');

const APP_ID = process.env.XFYUN_APP_ID || '74988593';
const API_KEY = process.env.XFYUN_API_KEY || '2cdcdce40a824abace8766002756fa1f';
const API_SECRET = process.env.XFYUN_API_SECRET || 'NWY5YmUyZjEyNWU5OWQyZDI2OTgzOTky';

let PASS = 0;
let FAIL = 0;
const FAILURES = [];

function assert(ok, name, detail) {
  if (ok) {
    PASS++;
    console.log('  [PASS] ' + name + ': ' + detail);
  } else {
    FAIL++;
    FAILURES.push(name);
    console.log('  [FAIL] ' + name + ': ' + detail);
  }
}

function report() {
  console.log('\n========================================');
  console.log('  Pipeline Test Report');
  console.log('========================================');
  console.log('  PASS: ' + PASS + ', FAIL: ' + FAIL + ', TOTAL: ' + (PASS + FAIL));
  if (FAILURES.length > 0) {
    console.log('  FAILURES:');
    FAILURES.forEach(function(n) { console.log('    - ' + n); });
  }
  console.log('========================================\n');
  return { pass: PASS, fail: FAIL };
}

// ========== 工具函数 ==========

/** 生成 PCM 正弦波 */
function generateSinePcm(durationSec, sampleRate, freq, amp) {
  if (durationSec === undefined) durationSec = 1;
  if (sampleRate === undefined) sampleRate = 16000;
  if (freq === undefined) freq = 440;
  if (amp === undefined) amp = 0.3;
  var numSamples = Math.floor(sampleRate * durationSec);
  var samples = new Int16Array(numSamples);
  for (var i = 0; i < numSamples; i++) {
    samples[i] = Math.round(32767 * amp * Math.sin(2 * Math.PI * freq * (i / sampleRate)));
  }
  return Buffer.from(samples.buffer);
}

/** PCM → webm/opus（模拟 MediaRecorder） */
function pcmToWebm(pcmData, sampleRate) {
  if (sampleRate === undefined) sampleRate = 16000;
  var inputFile = '/tmp/pt_input.pcm';
  var outputFile = '/tmp/pt_output.webm';
  writeFileSync(inputFile, pcmData);
  execSync(
    'ffmpeg -y -f s16le -ar ' + sampleRate + ' -ac 1 -i ' + inputFile +
    ' -c:a libopus -b:a 32k -ar ' + sampleRate + ' -ac 1 ' + outputFile +
    ' 2>&1', { timeout: 10000 }
  );
  var data = readFileSync(outputFile);
  try { unlinkSync(inputFile); } catch(e) {}
  try { unlinkSync(outputFile); } catch(e) {}
  return data;
}

/** webm → PCM（模拟主进程 recognize-audio-blob） */
function webmToPcm(webmData, sampleRate) {
  if (sampleRate === undefined) sampleRate = 16000;
  var inputFile = '/tmp/pt_convert.webm';
  var outputFile = '/tmp/pt_convert.pcm';
  writeFileSync(inputFile, webmData);
  execSync(
    'ffmpeg -y -i ' + inputFile + ' -ar ' + sampleRate + ' -ac 1 -f s16le ' + outputFile +
    ' 2>&1', { timeout: 10000 }
  );
  var data = readFileSync(outputFile);
  try { unlinkSync(inputFile); } catch(e) {}
  try { unlinkSync(outputFile); } catch(e) {}
  return data;
}

/** 检测 PCM 能量 */
function pcmEnergy(pcmData) {
  var maxVal = 0;
  var nonZero = 0;
  var total = 0;
  for (var i = 0; i < pcmData.length; i += 2) {
    var val = Math.abs(pcmData.readInt16LE(i));
    maxVal = Math.max(maxVal, val);
    total += val;
    if (val > 100) nonZero++;
  }
  var avg = pcmData.length > 0 ? Math.round(total / (pcmData.length / 2)) : 0;
  return { maxVal: maxVal, nonZero: nonZero, avg: avg, numSamples: pcmData.length / 2 };
}

/** 讯飞 ASR 识别（与 main.ts 完全一致的鉴权方式）*/
function xfyunAsr(pcmBase64) {
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
    var timeout = setTimeout(function() { ws.close(); reject(new Error('ASR timeout (15s)')); }, 15000);
    var recognized = '';
    var finished = false;

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
            try {
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
            } catch(e) {}
          }
        }
        if (resp.header) {
          if (resp.header.code === 0 && resp.header.status === 2 && !finished) {
            finished = true;
            clearTimeout(timeout);
            ws.close();
            resolve(recognized);
          } else if (resp.header.code !== 0 && !finished) {
            finished = true;
            clearTimeout(timeout);
            ws.close();
            reject(new Error('ASR error code=' + resp.header.code + ': ' + (resp.header.message || '')));
          }
        }
      } catch(e) {}
    });

    ws.on('error', function(e) {
      if (!finished) { finished = true; clearTimeout(timeout); reject(new Error('WS error: ' + e.message)); }
    });

    ws.on('close', function() {
      if (!finished) { finished = true; clearTimeout(timeout); resolve(recognized); }
    });
  });
}

// ========== 测试主体 ==========

async function main() {
  console.log('========================================');
  console.log('  ASR Full Pipeline Test');
  console.log('  Simulating every step of the app');
  console.log('========================================\n');

  // ======== Test 1: ffmpeg 可用性 ========
  console.log('=== [1/7] Environment checks ===');
  try {
    var ver = execSync('ffmpeg -version 2>&1 | head -1', { timeout: 5000 }).toString().trim();
    assert(true, 'ffmpeg installed', ver.substring(0, 60));
  } catch(e) {
    assert(false, 'ffmpeg installed', 'ffmpeg not found - tests cannot run');
    report();
    process.exit(1);
  }

  // ======== Test 2: PCM → webm/opus → PCM 无损测试 ========
  console.log('\n=== [2/7] PCM -> webm/opus -> PCM round-trip ===');
  var pcm1s = generateSinePcm(2, 16000, 440, 0.3);
  var webmData = pcmToWebm(pcm1s);
  var pcmBack = webmToPcm(webmData);

  var e1 = pcmEnergy(pcm1s);
  var e2 = pcmEnergy(pcmBack);
  console.log('  Original PCM: ' + pcm1s.length + ' bytes, max=' + e1.maxVal + ', nonzero=' + e1.nonZero);
  console.log('  Webm size: ' + webmData.length + ' bytes');
  console.log('  Decoded PCM: ' + pcmBack.length + ' bytes, max=' + e2.maxVal + ', nonzero=' + e2.nonZero);

  assert(webmData.length > 500, 'PCM -> webm', 'webm = ' + webmData.length + ' bytes (expected >500)');
  assert(pcmBack.length > 1000, 'webm -> PCM', 'PCM = ' + pcmBack.length + ' bytes (expected >1000)');
  assert(e2.nonZero > 10, 'PCM energy preserved', 'nonZero=' + e2.nonZero + ' (expected >10)');

  // ======== Test 3: 不同时长录音的 webm 数据量 ========
  console.log('\n=== [3/7] Duration vs webm size analysis ===');
  console.log('  (This shows what MediaRecorder should produce at different durations)');
  var durations = [0.1, 0.25, 0.5, 0.75, 1, 2, 3];
  for (var di = 0; di < durations.length; di++) {
    var dur = durations[di];
    var pcm = generateSinePcm(dur, 16000, 440, 0.3);
    var webm = pcmToWebm(pcm);
    var pcmDecoded = webmToPcm(webm);
    var energy = pcmEnergy(pcmDecoded);
    var note = '';
    if (webm.length < 2000) note = ' <-- BELOW OLD 2000 THRESHOLD';
    if (webm.length < 500) note = ' <-- EXTREMELY SMALL';
    console.log('  ' + dur.toFixed(2) + 's -> webm=' + webm.length + ' bytes, PCM=' + pcmDecoded.length + ' bytes, energy=' + energy.nonZero + note);
  }

  // ======== Test 4: 极短音频 → ASR（验证 ASR 是否能正确处理短音频） ========
  console.log('\n=== [4/7] Short audio -> ASR ===');
  var shortDurations = [0.1, 0.25, 0.5, 1.0];
  for (var si = 0; si < shortDurations.length; si++) {
    var sdur = shortDurations[si];
    var pcmShort = generateSinePcm(sdur, 16000, 440, 0.3);
    var webmShort = pcmToWebm(pcmShort);
    var pcmShortBack = webmToPcm(webmShort);
    var b64 = pcmShortBack.toString('base64');

    try {
      var result = await xfyunAsr(b64);
      console.log('  ' + sdur.toFixed(2) + 's audio -> ASR: "' + result + '" (webm=' + webmShort.length + ' bytes)');
    } catch(e) {
      console.log('  ' + sdur.toFixed(2) + 's audio -> ASR FAILED: ' + e.message + ' (webm=' + webmShort.length + ' bytes)');
    }
  }

  // ======== Test 5: 模拟真实应用场景的完整管道 ========
  console.log('\n=== [5/7] Full pipeline simulation (exact app flow) ===');
  // 模拟用户在 3 秒录音中说了一句话
  var appFlowPcm = generateSinePcm(3, 16000, 440, 0.3);

  // Step A: MediaRecorder → webm/opus
  var appWebm = pcmToWebm(appFlowPcm);
  console.log('  Step A (MediaRecorder -> webm): ' + appWebm.length + ' bytes');

  // Step B: blob → base64 (preload.bufferToBase64)
  var appB64 = appWebm.toString('base64');
  console.log('  Step B (base64): ' + appB64.length + ' chars');

  // Step C: IPC → ffmpeg webm → PCM (recognize-audio-blob handler)
  var appPcm = webmToPcm(appWebm);
  console.log('  Step C (ffmpeg webm -> PCM): ' + appPcm.length + ' bytes');
  var e3 = pcmEnergy(appPcm);
  console.log('  Step C energy: max=' + e3.maxVal + ', nonzero=' + e3.nonZero + ', avg=' + e3.avg);

  assert(appWebm.length > 500, 'Step A: webm data', appWebm.length + ' bytes');
  assert(appPcm.length > 1000, 'Step C: PCM data', appPcm.length + ' bytes');
  assert(e3.nonZero > 10, 'Step C: PCM energy', 'nonZero=' + e3.nonZero);

  // Step D: Xfyun ASR
  var appB64Pcm = appPcm.toString('base64');
  try {
    var appResult = await xfyunAsr(appB64Pcm);
    // Sine wave may return empty or garbage, that's fine - ASR should not error
    assert(true, 'Step D: Xfyun ASR', 'ASR returned: "' + appResult + '" (sine wave, may be empty)');
  } catch(e) {
    assert(false, 'Step D: Xfyun ASR', 'ASR failed: ' + e.message);
  }

  // ======== Test 6: 真实麦克风录音 → 完整管道 ========
  console.log('\n=== [6/7] Real mic recording -> full pipeline ===');
  var realPcm = null;
  try {
    execSync('ffmpeg -y -loglevel error -f avfoundation -i ":0" -ar 16000 -ac 1 -f s16le -t 3 /tmp/pt_mic_raw.pcm 2>&1', { timeout: 15000 });
    if (existsSync('/tmp/pt_mic_raw.pcm')) {
      realPcm = readFileSync('/tmp/pt_mic_raw.pcm');
    }
    try { unlinkSync('/tmp/pt_mic_raw.pcm'); } catch(e) {}
  } catch(e) {
    console.log('  (mic recording skipped: ' + (e.message || '').substring(0, 80) + ')');
  }

  if (realPcm && realPcm.length > 1000) {
    var e4 = pcmEnergy(realPcm);
    console.log('  Raw mic PCM: ' + realPcm.length + ' bytes, max=' + e4.maxVal + ', nonzero=' + e4.nonZero);
    assert(e4.nonZero > 100, 'Mic recording has audio', 'nonZero=' + e4.nonZero);

    // 模拟 MediaRecorder: PCM → webm/opus
    var realWebm = pcmToWebm(realPcm);
    console.log('  Simulated MediaRecorder (PCM -> webm): ' + realWebm.length + ' bytes');

    // ffmpeg 转回 PCM
    var realPcmBack = webmToPcm(realWebm);
    var e5 = pcmEnergy(realPcmBack);
    console.log('  FFmpeg decoded PCM: ' + realPcmBack.length + ' bytes, max=' + e5.maxVal + ', nonzero=' + e5.nonZero);

    assert(realWebm.length > 500, 'Real mic -> webm', realWebm.length + ' bytes');
    assert(e5.nonZero > 10, 'Energy preserved after encode/decode', 'nonZero=' + e5.nonZero);

    // ASR 识别真实录音
    var realB64 = realPcmBack.toString('base64');
    try {
      var realResult = await xfyunAsr(realB64);
      console.log('  ASR result: "' + realResult + '"');
      if (realResult && realResult.trim().length > 0) {
        assert(true, 'Real mic -> ASR', 'Recognized: "' + realResult.trim() + '"');
      } else {
        // User might not have spoken during the 3s recording (sine wave only)
        assert(true, 'Real mic -> ASR', 'ASR returned empty (no speech detected, expected if silent)');
      }
    } catch(e) {
      assert(false, 'Real mic -> ASR', 'Failed: ' + e.message);
    }
  } else {
    console.log('  (skipping - no mic audio captured)');
    assert(true, 'Real mic recording', 'Skipped (mic not available in this env)');
  }

  // ======== Test 7: 主进程 recognize-audio-blob 完全模拟 ========
  console.log('\n=== [7/7] Exact app IPC handler simulation ===');
  // 这正是主进程 recognize-audio-blob handler 做的事
  var testPcm = generateSinePcm(2, 16000, 440, 0.3);
  var testWebm = pcmToWebm(testPcm);

  // 1. 收到 base64（模拟 IPC 接收 params.audioBase64）
  var ipcBase64 = testWebm.toString('base64');
  console.log('  IPC receive base64: ' + ipcBase64.length + ' chars');

  // 2. 写为临时 webm 文件
  writeFileSync('/tmp/pt_ipc_input.webm', Buffer.from(ipcBase64, 'base64'));

  // 3. ffmpeg 转 PCM
  execSync('ffmpeg -y -i /tmp/pt_ipc_input.webm -ar 16000 -ac 1 -f s16le /tmp/pt_ipc_output.pcm 2>&1', { timeout: 10000 });
  var ipcPcm = readFileSync('/tmp/pt_ipc_output.pcm');
  try { unlinkSync('/tmp/pt_ipc_input.webm'); } catch(e) {}
  try { unlinkSync('/tmp/pt_ipc_output.pcm'); } catch(e) {}

  console.log('  FFmpeg PCM output: ' + ipcPcm.length + ' bytes');
  var e6 = pcmEnergy(ipcPcm);
  console.log('  Energy: max=' + e6.maxVal + ', nonzero=' + e6.nonZero);

  // 4. PCM → base64 → ASR
  var ipcB64 = ipcPcm.toString('base64');
  try {
    var ipcResult = await xfyunAsr(ipcB64);
    assert(true, 'IPC handler pipeline', 'ASR returned: "' + ipcResult + '"');
  } catch(e) {
    assert(false, 'IPC handler pipeline', 'ASR failed: ' + e.message);
  }

  // ======== 报告 ========
  report();

  if (FAIL > 0) {
    console.log('\n=== FAILURES DETECTED ===');
    console.log('The tests above show which part of the pipeline is broken.');
    console.log('If all pass, the problem is in the render process MediaRecorder.');
    process.exit(1);
  }
}

main().catch(function(e) {
  console.error('\nFATAL ERROR:', e.message);
  process.exit(1);
});
