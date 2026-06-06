/**
 * 语音识别端到端诊断测试
 *
 * 用法：
 *   方式 A - 在 Electron 应用 DevTools 控制台中运行
 *     await runAllDiagnostics()
 *
 *   方式 B - 在 Node.js 中运行
 *     XFYUN_APP_ID=xxx XFYUN_API_KEY=xxx XFYUN_API_SECRET=xxx node scripts/diagnose_audio.mjs
 */

// ============================================================
// 第一部分：Electron 渲染进程 (DevTools 控制台)
// ============================================================

const DIAG = {
  results: [],

  assert(condition, name, detail) {
    const pass = !!condition;
    this.results.push({ name, pass, detail: pass ? 'OK: ' + detail : 'FAIL: ' + detail });
    const icon = pass ? '\u2713' : '\u2717';
    console.log(icon + ' ' + name + ': ' + detail);
    return pass;
  },

  async step1_listAudioDevices() {
    console.log('\n=== [1/3] \u68c0\u6d4b\u97f3\u9891\u8f93\u5165\u8bbe\u5907 ===');
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(function(d) { return d.kind === 'audioinput'; });
      audioInputs.forEach(function(d, i) {
        console.log('  [' + i + '] "' + d.label + '" (id: ' + (d.deviceId || '').substring(0, 20) + '...)');
      });
      return this.assert(
        audioInputs.length > 0,
        '\u9ea6\u514b\u98ce\u8bbe\u5907',
        '\u53d1\u73b0 ' + audioInputs.length + ' \u4e2a\u9ea6\u514b\u98ce: ' + audioInputs.map(function(d) { return d.label || '(\u672a\u547d\u540d)'; }).join(', ')
      );
    } catch (e) {
      return this.assert(false, '\u679a\u4e3e\u8bbe\u5907', e.message || String(e));
    }
  },

  async step2_testGetUserMedia(durationMs) {
    if (durationMs === undefined) durationMs = 5000;
    console.log('\n=== [2/3] \u9ea6\u514b\u98ce\u6743\u9650 + MediaRecorder \u5f55\u97f3\u6d4b\u8bd5 (' + Math.round(durationMs / 1000) + '\u79d2) ===');
    var stream = null;

    try {
      console.log('  \u8bf7\u6c42\u9ea6\u514b\u98ce\u6743\u9650...');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      var audioTracks = stream.getAudioTracks();
      this.assert(audioTracks.length > 0, '\u83b7\u53d6\u97f3\u9891\u8f68\u9053', '\u83b7\u5f97 ' + audioTracks.length + ' \u4e2a\u97f3\u9891\u8f68\u9053');

      audioTracks.forEach(function(track, i) {
        var settings = track.getSettings();
        console.log('  \u8f68\u9053[' + i + ']: label="' + track.label + '", enabled=' + track.enabled + ', muted=' + track.muted);
        console.log('    sampleRate=' + settings.sampleRate + ', channelCount=' + settings.channelCount);
      });

      var mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      var mimeType = mimeTypes.find(function(t) { return MediaRecorder.isTypeSupported(t); }) || 'audio/webm';
      this.assert(true, 'MIME \u7c7b\u578b', '\u4f7f\u7528 ' + mimeType);

      var recorder = new MediaRecorder(stream, { mimeType: mimeType, audioBitsPerSecond: 32000 });
      var chunks = [];
      recorder.ondataavailable = function(e) {
        if (e.data.size > 0) { chunks.push(e.data); }
      };

      console.log('  \u5f00\u59cb\u5f55\u97f3 ' + Math.round(durationMs / 1000) + '\u79d2...');
      recorder.start(250);

      var progressTimer = setInterval(function() {
        if (chunks.length > 0) {
          var total = chunks.reduce(function(s, b) { return s + b.size; }, 0);
          console.log('  \u5df2\u5f55\u5236: ' + chunks.length + ' chunks, \u5171 ' + total + ' bytes');
        }
      }, 1000);

      await new Promise(function(resolve) { setTimeout(resolve, durationMs); });
      clearInterval(progressTimer);

      var blob = await new Promise(function(resolve) {
        recorder.onstop = function() {
          resolve(new Blob(chunks, { type: mimeType }));
        };
        recorder.stop();
      });

      var totalBytes = chunks.reduce(function(s, b) { return s + b.size; }, 0);
      console.log('\n  \u5f55\u97f3\u5b8c\u6210:');
      console.log('    chunks: ' + chunks.length);
      console.log('    blob size: ' + blob.size + ' bytes');
      console.log('    \u6bcf chunk \u5e73\u5747: ' + (chunks.length > 0 ? Math.round(totalBytes / chunks.length) : 0) + ' bytes');

      // 原始字节分析
      var arrayBuffer = await blob.arrayBuffer();
      var view = new Uint8Array(arrayBuffer);
      var nonZero = 0;
      for (var k = 0; k < view.length; k++) { if (view[k] !== 0) nonZero++; }
      var zeroPct = ((1 - nonZero / view.length) * 100).toFixed(1);
      console.log('  \u539f\u59cb\u5b57\u8282: ' + view.length + ' bytes, \u975e\u96f6\u5b57\u8282: ' + nonZero + '/' + view.length + ' (\u96f6\u5360\u6bd4 ' + zeroPct + '%)');

      var blobOk = blob.size > 5000;
      this.assert(blobOk, '\u5f55\u97f3\u6570\u636e\u91cf', '\u5f55\u97f3 ' + Math.round(durationMs / 1000) + '\u79d2, blob ' + blob.size + ' bytes ' + (blobOk ? '(\u6b63\u5e38)' : '(\u5f02\u5e38\u504f\u5c0f!)'));

      // AudioContext 解码
      try {
        var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        var channelData = audioBuffer.getChannelData(0);
        var maxAbs = Math.max.apply(null, channelData.map(function(s) { return Math.abs(s); }));
        var rms = Math.sqrt(channelData.reduce(function(sum, s) { return sum + s * s; }, 0) / channelData.length);

        console.log('  \u89e3\u7801\u6210\u529f: sampleRate=' + audioBuffer.sampleRate + ', channels=' + audioBuffer.numberOfChannels);
        console.log('  \u65f6\u957f: ' + audioBuffer.duration.toFixed(2) + ' \u79d2');
        console.log('  \u5cf0\u503c: ' + maxAbs.toFixed(4) + (maxAbs > 0.01 ? ' (\u6709\u58f0\u97f3)' : ' (\u51e0\u4e4e\u9759\u97f3)'));
        console.log('  RMS: ' + rms.toFixed(6) + (rms > 0.003 ? ' (\u6709\u58f0\u97f3)' : ' (\u51e0\u4e4e\u9759\u97f3)'));

        this.assert(maxAbs > 0.01, '\u97f3\u9891\u80fd\u91cf\u68c0\u6d4b', '\u5cf0\u503c=' + maxAbs.toFixed(4) + ', RMS=' + rms.toFixed(6) + ', \u65f6\u957f=' + audioBuffer.duration.toFixed(1) + 's, ' + (maxAbs > 0.01 ? '\u68c0\u6d4b\u5230\u97f3\u9891\u4fe1\u53f7' : '\u97f3\u9891\u51e0\u4e4e\u4e3a\u9759\u97f3'));
        audioCtx.close();
      } catch (decodeErr) {
        console.log('  AudioContext.decodeAudioData \u5931\u8d25: ' + decodeErr.message);
        this.assert(false, '\u97f3\u9891\u89e3\u7801', '\u65e0\u6cd5\u89e3\u7801\u5f55\u97f3: ' + decodeErr.message);
      }

      stream.getTracks().forEach(function(t) { t.stop(); });
      return true;
    } catch (e) {
      this.assert(false, '\u5f55\u97f3\u6d4b\u8bd5\u5f02\u5e38', e.message || String(e));
      if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
      return false;
    }
  },

  printReport() {
    var passed = this.results.filter(function(r) { return r.pass; }).length;
    var failed = this.results.filter(function(r) { return !r.pass; }).length;
    console.log('\n========================================');
    console.log('  \u8bca\u65ad\u6d4b\u8bd5\u62a5\u544a');
    console.log('========================================');
    this.results.forEach(function(r) {
      console.log('  ' + (r.pass ? '\u2713' : '\u2717') + ' ' + r.name + ': ' + r.detail);
    });
    console.log('----------------------------------------');
    console.log('  \u901a\u8fc7: ' + passed + ', \u5931\u8d25: ' + failed + ', \u603b\u8ba1: ' + this.results.length);
    console.log('========================================\n');
    return { passed: passed, failed: failed, total: this.results.length };
  }
};

async function runAllDiagnostics() {
  await DIAG.step1_listAudioDevices();
  await DIAG.step2_testGetUserMedia(5000);
  DIAG.printReport();
}

// ============================================================
// 第二部分：Node.js (主进程) 测试
// ============================================================

async function nodeTest() {
  var { execSync } = await import('child_process');
  var { readFileSync, writeFileSync, unlinkSync, existsSync } = await import('fs');
  var results = [];
  var passCount = 0;
  var failCount = 0;

  function assert(condition, name, detail) {
    var pass = !!condition;
    results.push({ name: name, pass: pass, detail: pass ? 'OK: ' + detail : 'FAIL: ' + detail });
    var icon = pass ? '\u2713' : '\u2717';
    console.log(icon + ' ' + name + ': ' + detail);
    if (pass) passCount++; else failCount++;
    return pass;
  }

  console.log('========================================');
  console.log('  Node.js \u7aef\u5230\u7aef\u6d4b\u8bd5');
  console.log('========================================\n');

  // Test 1: ffmpeg
  console.log('--- [1/5] ffmpeg ---');
  var ffmpegPath = 'ffmpeg';
  try {
    var ver = execSync('ffmpeg -version 2>&1 | head -1', { timeout: 5000 }).toString().trim();
    assert(true, 'ffmpeg \u53ef\u7528', ver.substring(0, 80));
  } catch (e) {
    var candidates = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
    ffmpegPath = candidates.find(function(p) { return existsSync(p); }) || 'ffmpeg';
    try {
      var ver2 = execSync(ffmpegPath + ' -version 2>&1 | head -1', { timeout: 5000 }).toString().trim();
      assert(true, 'ffmpeg \u53ef\u7528', ver2.substring(0, 80));
    } catch (e2) {
      assert(false, 'ffmpeg \u53ef\u7528', 'ffmpeg \u672a\u627e\u5230');
      return { passed: passCount, failed: failCount };
    }
  }

  // Test 2: PCM base64
  console.log('\n--- [2/5] PCM \u751f\u6210\u4e0e base64 ---');
  var numSamples = 16000;
  var samples = new Int16Array(numSamples);
  for (var i = 0; i < numSamples; i++) {
    samples[i] = Math.round(32767 * 0.3 * Math.sin(2 * Math.PI * 440 * (i / 16000)));
  }
  var testPcm = Buffer.from(samples.buffer);
  assert(testPcm.length > 0, 'PCM \u751f\u6210', testPcm.length + ' bytes');
  var b64 = testPcm.toString('base64');
  assert(b64.length > 0, 'base64 \u7f16\u7801', b64.length + ' chars');

  // Test 3: ffmpeg \u8f6c\u7801
  console.log('\n--- [3/5] ffmpeg \u8f6c\u7801 ---');
  var testWav = '/tmp/diag_test.wav';
  var testPcmFile = '/tmp/diag_test.pcm';
  try {
    execSync(ffmpegPath + ' -f s16le -ar 16000 -ac 1 -i - -ar 16000 -ac 1 ' + testWav + ' -y 2>&1', { input: testPcm, timeout: 10000 });
    var wavSize = existsSync(testWav) ? readFileSync(testWav).length : 0;
    assert(wavSize > 1000, 'PCM -> WAV', wavSize + ' bytes');

    execSync(ffmpegPath + ' -y -i ' + testWav + ' -ar 16000 -ac 1 -f s16le ' + testPcmFile + ' 2>&1', { timeout: 10000 });
    var pcmBack = existsSync(testPcmFile) ? readFileSync(testPcmFile) : Buffer.alloc(0);
    assert(pcmBack.length > 1000, 'WAV -> PCM', pcmBack.length + ' bytes');
  } catch (e) {
    assert(false, 'ffmpeg \u8f6c\u6362', '\u5931\u8d25: ' + (e.message || '').substring(0, 200));
  }
  try { unlinkSync(testWav); } catch(e) {}
  try { unlinkSync(testPcmFile); } catch(e) {}

  // Test 4: \u771f\u5b9e\u9ea6\u514b\u98ce\u5f55\u97f3
  console.log('\n--- [4/5] \u771f\u5b9e\u9ea6\u514b\u98ce\u5f55\u97f3 (ffmpeg avfoundation) ---');
  var realPcmFile = '/tmp/diag_mic.pcm';
  try {
    execSync(ffmpegPath + ' -y -loglevel error -f avfoundation -i ":0" -ar 16000 -ac 1 -f s16le -t 3 ' + realPcmFile + ' 2>&1', { timeout: 15000 });
    if (existsSync(realPcmFile)) {
      var realPcm = readFileSync(realPcmFile);
      var nnz = 0;
      for (var j = 0; j < Math.min(realPcm.length, 96000); j += 2) {
        if (Math.abs(realPcm.readInt16LE(j)) > 100) nnz++;
      }
      assert(realPcm.length > 5000 && nnz > 100, '\u9ea6\u514b\u98ce\u5f55\u97f3', realPcm.length + ' bytes, \u975e\u96f6\u91c7\u6837 ' + nnz + (nnz > 100 ? ' (\u68c0\u6d4b\u5230\u58f0\u97f3)' : ' (\u51e0\u4e4e\u9759\u97f3)'));
    } else {
      assert(false, '\u9ea6\u514b\u98ce\u5f55\u97f3', '\u5f55\u97f3\u6587\u4ef6\u672a\u751f\u6210');
    }
  } catch (e) {
    assert(false, '\u9ea6\u514b\u98ce\u5f55\u97f3', '\u5931\u8d25: ' + (e.message || '').substring(0, 200));
  }
  try { unlinkSync(realPcmFile); } catch(e) {}

  // Test 5: \u8baf\u98de ASR API (匹配 main.ts \u7684\u9274\u6743\u65b9\u5f0f)
  console.log('\n--- [5/5] \u79d1\u5927\u8baf\u98de ASR API ---');
  var appId = process.env.XFYUN_APP_ID || '';
  var apiKey = process.env.XFYUN_API_KEY || '';
  var apiSecret = process.env.XFYUN_API_SECRET || '';

  if (appId && apiKey && apiSecret) {
    try {
      var { WebSocket } = await import('ws');
      var crypto = await import('crypto');

      var host = 'iat.cn-huabei-1.xf-yun.com';
      var path = '/v1';
      var date = new Date().toUTCString();
      var sigOrigin = 'host: ' + host + '\ndate: ' + date + '\nGET ' + path + ' HTTP/1.1';
      var hmac = crypto.createHmac('sha256', apiSecret);
      hmac.update(sigOrigin);
      var signature = hmac.digest('base64');
      var authOrigin = 'api_key="' + apiKey + '",algorithm="hmac-sha256",headers="host date request-line",signature="' + signature + '"';
      var authorization = Buffer.from(authOrigin).toString('base64');
      var url = 'wss://' + host + path + '?authorization=' + encodeURIComponent(authorization) + '&date=' + encodeURIComponent(date) + '&host=' + encodeURIComponent(host);

      var text = await new Promise(function(resolve, reject) {
        var ws = new WebSocket(url);
        var timeout = setTimeout(function() { ws.close(); reject(new Error('ASR \u8d85\u65f6')); }, 15000);
        var resultText = '';

        ws.on('open', function() {
          var firstFrame = {
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
                audio: b64,
              }
            }
          };
          ws.send(JSON.stringify(firstFrame));

          // \u7ed3\u675f\u5e27
          ws.send(JSON.stringify({
            header: { app_id: appId, status: 2 },
            payload: { audio: { encoding: 'raw', sample_rate: 16000, status: 2, audio: '' } }
          }));
        });

        ws.on('message', function(data) {
          try {
            var resp = JSON.parse(data.toString());
            if (resp.payload && resp.payload.result) {
              var resultB64 = resp.payload.result.text || resp.payload.result.audio;
              if (resultB64) {
                try {
                  var json = JSON.parse(Buffer.from(resultB64, 'base64').toString('utf8'));
                  if (json.ws) {
                    for (var w = 0; w < json.ws.length; w++) {
                      if (json.ws[w].cw) {
                        for (var c = 0; c < json.ws[w].cw.length; c++) {
                          resultText += json.ws[w].cw[c].w || '';
                        }
                      }
                    }
                  }
                } catch(e) {}
              }
            }
            if (resp.header && resp.header.code === 0) {
              clearTimeout(timeout);
              ws.close();
              resolve(resultText || '');
            } else if (resp.header && resp.header.code !== 0) {
              clearTimeout(timeout);
              ws.close();
              reject(new Error('ASR \u8fd4\u56de\u9519\u8bef: code=' + resp.header.code + ', message=' + (resp.header.message || '')));
            }
          } catch (e) {}
        });

        ws.on('error', function(e) {
          clearTimeout(timeout);
          reject(new Error('ASR \u8fde\u63a5\u5931\u8d25: ' + e.message));
        });
      });

      assert(true, '\u8baf\u98de ASR', '\u8bc6\u522b\u6210\u529f, \u7ed3\u679c: "' + text + '" (\u6b63\u5f26\u6ce2\u8fd4\u56de\u7a7a\u4e3a\u6b63\u5e38)');
    } catch (e) {
      assert(false, '\u8baf\u98de ASR', e.message || String(e));
    }
  } else {
    console.log('  \u8df3\u8fc7: \u672a\u8bbe\u7f6e XFYUN_APP_ID / XFYUN_API_KEY / XFYUN_API_SECRET');
  }

  // Report
  console.log('\n========================================');
  console.log('  \u6d4b\u8bd5\u62a5\u544a');
  console.log('========================================');
  results.forEach(function(r) {
    console.log('  ' + (r.pass ? '\u2713' : '\u2717') + ' ' + r.name + ': ' + r.detail);
  });
  console.log('----------------------------------------');
  console.log('  \u901a\u8fc7: ' + passCount + ', \u5931\u8d25: ' + failCount + ', \u603b\u8ba1: ' + results.length);
  console.log('========================================\n');
  return { passed: passCount, failed: failCount };
}

// ============================================================
// \u5165\u53e3
// ============================================================

if (typeof window !== 'undefined' && window.document) {
  console.log('\n\u8bca\u65ad\u811a\u672c\u5df2\u52a0\u8f7d!');
  console.log('\u8fd0\u884c: await runAllDiagnostics()');
  window.DIAG = DIAG;
  window.runAllDiagnostics = runAllDiagnostics;
} else {
  nodeTest().then(function(r) { process.exit(r.failed > 0 ? 1 : 0); }).catch(function(e) { console.error(e); process.exit(1); });
}
