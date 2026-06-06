/**
 * 音频信号直接诊断工具
 *
 * 绕过 MediaRecorder，直接用 AudioContext + AnalyserNode
 * 实时读取麦克风音频信号级别。
 * 
 * 用法：在 Electron DevTools Console 中粘贴运行
 */

async function diagnoseMicSignal() {
  console.log('========================================');
  console.log('  麦克风音频信号诊断');
  console.log('========================================\n');

  console.log('=== 1. 获取麦克风流 ===');
  var stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
      }
    });
    var tracks = stream.getAudioTracks();
    console.log('  轨道: ' + tracks.length + ' 个');
    tracks.forEach(function(t, i) {
      console.log('  [' + i + '] label="' + t.label + '", enabled=' + t.enabled + ', muted=' + t.muted + ', readyState=' + t.readyState);
      console.log('  settings: ' + JSON.stringify(t.getSettings()));
    });
  } catch(e) {
    console.log('  FAILED: ' + e.message);
    return;
  }

  console.log('\n=== 2. AudioContext 实时信号分析 ===');
  console.log('  (请对着麦克风说话，每2秒报告一次信号级别)');
  console.log('  如果 peak < 0.01 说明麦克风信号极弱\n');

  var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  var source = audioCtx.createMediaStreamSource(stream);
  var analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  var dataArray = new Uint8Array(analyser.frequencyBinCount);

  function readLevel() {
    analyser.getByteTimeDomainData(dataArray);
    var max = 0;
    var sum = 0;
    for (var i = 0; i < dataArray.length; i++) {
      var val = Math.abs(dataArray[i] - 128);
      max = Math.max(max, val);
      sum += val;
    }
    var avg = sum / dataArray.length;
    var peakNormalized = max / 128;
    var avgNormalized = avg / 128;
    return { peak: peakNormalized, avg: avgNormalized, rawMax: max, rawAvg: avg };
  }

  // 连续读 8 秒
  var readings = [];
  for (var sec = 0; sec < 8; sec++) {
    var level = readLevel();
    readings.push(level);
    var bar = '';
    var barLen = Math.round(level.peak * 80);
    if (barLen > 80) barLen = 80;
    for (var b = 0; b < barLen; b++) bar += '#';
    console.log('  [第' + (sec + 1) + '秒] peak=' + level.peak.toFixed(4) + ' avg=' + level.avg.toFixed(4) + ' ' + bar);
    await new Promise(function(r) { setTimeout(r, 1000); });
  }

  // 统计
  var avgPeak = readings.reduce(function(s, r) { return s + r.peak; }, 0) / readings.length;
  var maxPeak = Math.max.apply(null, readings.map(function(r) { return r.peak; }));
  console.log('\n=== 统计 ===');
  console.log('  平均峰值: ' + avgPeak.toFixed(4));
  console.log('  最大峰值: ' + maxPeak.toFixed(4));

  if (maxPeak < 0.01) {
    console.log('\n[结论] 信号极弱 (< 0.01)');
    console.log('  → macOS 麦克风权限问题或硬件输入增益太低');
    console.log('  → 请检查 系统设置 > 隐私与安全性 > 麦克风 是否允许了本应用');
    console.log('  → 请检查 系统设置 > 声音 > 输入 的输入音量是否调高');
  } else if (maxPeak < 0.1) {
    console.log('\n[结论] 信号微弱 (< 0.1)，说话时应该有明显增强');
    console.log('  → 请提高说话音量或检查麦克风输入增益');
  } else {
    console.log('\n[结论] 信号正常！麦克风工作良好');
  }

  console.log('\n=== 3. 尝试用 AudioContext 录制 3 秒 ===');
  var mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 32000
  });
  var chunks = [];
  mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) chunks.push(e.data); };

  console.log('  开始录制 3 秒（请持续说话）...');
  await new Promise(function(resolve) {
    mediaRecorder.start(250);
    setTimeout(function() {
      mediaRecorder.onstop = function() {
        var total = chunks.reduce(function(s, b) { return s + b.size; }, 0);
        console.log('  录制完成: ' + chunks.length + ' chunks, ' + total + ' bytes');
        console.log('  平均每chunk: ' + (chunks.length > 0 ? Math.round(total / chunks.length) : 0) + ' bytes');
        if (total < 2000) {
          console.log('  [结论] AudioContext + MediaRecorder 仍然数据量小 → 问题在 getUserMedia 层面');
        } else {
          console.log('  [结论] AudioContext 正常，MediaRecorder 也正常！');
        }
        resolve();
      };
      mediaRecorder.stop();
    }, 3000);
  });

  // 尝试解码看原始样本
  if (chunks.length > 0) {
    console.log('\n=== 4. 尝试 AudioContext.decodeAudioData ===');
    try {
      var blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
      var buf = await blob.arrayBuffer();
      var audioBuf = await audioCtx.decodeAudioData(buf.slice(0));
      var chanData = audioBuf.getChannelData(0);
      var rms = Math.sqrt(chanData.reduce(function(s, v) { return s + v * v; }, 0) / chanData.length);
      var peak2 = Math.max.apply(null, chanData.map(function(v) { return Math.abs(v); }));
      console.log('  解码成功: ' + audioBuf.duration.toFixed(2) + '秒, peak=' + peak2.toFixed(4) + ', RMS=' + rms.toFixed(6));
    } catch(e) {
      console.log('  解码失败: ' + e.message);
    }
  }

  audioCtx.close();
  stream.getTracks().forEach(function(t) { t.stop(); });
  console.log('\n=== 诊断完成 ===');
}

diagnoseMicSignal();
