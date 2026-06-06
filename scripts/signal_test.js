/**
 * 音频信号检测测试
 *
 * 直接检测 MediaRecorder 录到的音频是否有有效信号
 * 
 * 用法：在 Electron DevTools Console 中粘贴运行
 * 
 * 原理：录制 3 秒音频 → 用 Web Audio API 解码 → 分析信号能量
 */

async function audioSignalTest() {
  console.log('========================================');
  console.log('  音频信号检测测试');
  console.log('========================================\n');
  
  console.log('=== 步骤 1: 获取麦克风（使用当前约束） ===');
  var stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    var tracks = stream.getAudioTracks();
    tracks.forEach(function(t, i) {
      var s = t.getSettings();
      console.log('  轨道[' + i + ']: label="' + t.label + '"');
      console.log('  sampleRate=' + s.sampleRate + ', channelCount=' + s.channelCount);
    });
  } catch(e) {
    console.log('  获取麦克风失败: ' + e.message);
    return;
  }

  console.log('\n=== 步骤 2: MediaRecorder 录音 3 秒 ===');
  console.log('  (请对着麦克风说话...)');

  var chunks = [];
  var recorder = new MediaRecorder(stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 32000
  });

  recorder.ondataavailable = function(e) {
    if (e.data.size > 0) chunks.push(e.data);
  };

  var progress = setInterval(function() {
    var total = chunks.reduce(function(s, b) { return s + b.size; }, 0);
    console.log('  已录: ' + chunks.length + ' chunks, ' + total + ' bytes');
  }, 1000);

  await new Promise(function(resolve) {
    recorder.start(250);
    setTimeout(function() {
      clearInterval(progress);
      recorder.onstop = function() { resolve(); };
      recorder.stop();
    }, 3000);
  });

  var totalBytes = chunks.reduce(function(s, b) { return s + b.size; }, 0);
  console.log('\n  录音完成: ' + chunks.length + ' chunks, ' + totalBytes + ' bytes');

  if (totalBytes < 200) {
    console.log('  [结论] 音频数据极少，可能麦克风未捕获到任何信号');
    stream.getTracks().forEach(function(t) { t.stop(); });
    return;
  }

  console.log('\n=== 步骤 3: Web Audio API 解码分析 ===');
  try {
    var blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
    var arrayBuffer = await blob.arrayBuffer();
    
    // 分析原始字节
    var view = new Uint8Array(arrayBuffer);
    var nonZeroBytes = 0;
    for (var i = 0; i < view.length; i++) {
      if (view[i] !== 0) nonZeroBytes++;
    }
    console.log('  原始字节: ' + view.length + ' total, ' + nonZeroBytes + ' non-zero (' + Math.round(nonZeroBytes / view.length * 100) + '%)');

    // 用 AudioContext 解码
    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    var data = audioBuffer.getChannelData(0);
    
    // 计算信号指标
    var maxAbs = 0;
    var sum = 0;
    var sumSq = 0;
    var aboveNoise = 0;
    var noiseFloor = 0.001; // 噪声门限
    
    for (var i = 0; i < data.length; i++) {
      var abs = Math.abs(data[i]);
      maxAbs = Math.max(maxAbs, abs);
      sum += abs;
      sumSq += abs * abs;
      if (abs > noiseFloor) aboveNoise++;
    }
    
    var rms = Math.sqrt(sumSq / data.length);
    var avg = sum / data.length;
    
    console.log('  AudioContext 解码成功:');
    console.log('    采样率: ' + audioBuffer.sampleRate + ' Hz');
    console.log('    声道数: ' + audioBuffer.numberOfChannels);
    console.log('    时长: ' + audioBuffer.duration.toFixed(2) + ' 秒');
    console.log('    采样数: ' + data.length);
    console.log('    峰值: ' + maxAbs.toFixed(6));
    console.log('    RMS:  ' + rms.toFixed(6));
    console.log('    平均: ' + avg.toFixed(6));
    console.log('    高于噪声门限: ' + aboveNoise + '/' + data.length + ' (' + Math.round(aboveNoise / data.length * 100) + '%)');
    
    if (maxAbs < 0.001) {
      console.log('\n  [结论] 音频信号极弱（峰值 < 0.001）');
      console.log('  问题出在 getUserMedia 的音频处理约束过滤掉了所有声音');
      console.log('  建议去除 noiseSuppression 和 echoCancellation 约束');
    } else if (maxAbs < 0.01) {
      console.log('\n  [结论] 音频信号非常微弱，可能是环境噪声为主');
      console.log('  说话时信号无明显增强，建议检查麦克风输入或去除音频处理约束');
    } else {
      console.log('\n  [结论] 音频信号正常！麦克风工作正常');
    }
    
    audioCtx.close();
  } catch(e) {
    console.log('  解码失败: ' + e.message);
    console.log('  (Electron 的 AudioContext 可能不支持 webm/opus 解码)');
  }

  stream.getTracks().forEach(function(t) { t.stop(); });
  console.log('\n=== 测试完成 ===');
}

audioSignalTest();
