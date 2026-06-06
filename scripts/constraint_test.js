/**
 * MediaRecorder 约束对比测试
 * 
 * 测试目的：验证 getUserMedia 的音频处理约束是否导致录音数据量异常小
 * 
 * 用法：在 Electron 的 DevTools Console 中粘贴运行
 * 
 * 对比方案：
 *   A - 当前方案: echoCancellation=true, noiseSuppression=true
 *   B - 无处理:   无任何约束
 *   C - 无降噪:   echoCancellation=true, noiseSuppression=false
 *   D - 最小约束: 只设 echoCancellation=false, noiseSuppression=false
 * 
 * 每个方案录制 3 秒，对比 webm 数据量
 */

var TEST_RESULTS = [];

async function testConstraint(label, constraints, durationMs) {
  if (durationMs === undefined) durationMs = 3000;
  console.log('\n=== 测试: ' + label + ' ===');
  console.log('  约束:', JSON.stringify(constraints));
  
  var stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    var tracks = stream.getAudioTracks();
    console.log('  轨道: ' + tracks.length + ' 个');
    tracks.forEach(function(t, i) {
      console.log('    [' + i + '] label="' + t.label + '", enabled=' + t.enabled + ', muted=' + t.muted);
      console.log('    settings:', JSON.stringify(t.getSettings()));
    });

    var mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';
    console.log('  MIME: ' + mimeType);

    var recorder = new MediaRecorder(stream, {
      mimeType: mimeType,
      audioBitsPerSecond: 32000
    });

    var chunks = [];
    recorder.ondataavailable = function(e) {
      if (e.data.size > 0) chunks.push(e.data);
    };

    console.log('  录音 ' + (durationMs / 1000) + ' 秒（请说话）...');

    await new Promise(function(resolve) {
      // 每秒打印进度
      var timer = setInterval(function() {
        var total = chunks.reduce(function(s, b) { return s + b.size; }, 0);
        console.log('    已录: ' + chunks.length + ' chunks, ' + total + ' bytes');
      }, 1000);

      recorder.start(250);
      setTimeout(function() {
        clearInterval(timer);
        recorder.onstop = function() {
          var total = chunks.reduce(function(s, b) { return s + b.size; }, 0);
          console.log('  结果: ' + chunks.length + ' chunks, ' + total + ' bytes, 平均 ' + (chunks.length > 0 ? Math.round(total / chunks.length) : 0) + ' bytes/chunk');
          TEST_RESULTS.push({
            label: label,
            constraints: JSON.stringify(constraints),
            chunks: chunks.length,
            totalBytes: total,
            avgPerChunk: chunks.length > 0 ? Math.round(total / chunks.length) : 0
          });
          stream.getTracks().forEach(function(t) { t.stop(); });
          resolve();
        };
        recorder.stop();
      }, durationMs);
    });
  } catch(e) {
    console.log('  FAILED: ' + e.message);
    TEST_RESULTS.push({ label: label, constraints: JSON.stringify(constraints), error: e.message });
    if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
  }
}

async function testConstraintAll() {
  TEST_RESULTS = [];
  console.log('========================================');
  console.log('  MediaRecorder 约束对比测试');
  console.log('  请对着麦克风说话（可用同一句话）');
  console.log('========================================\n');

  await testConstraint('A: 当前方案 (降噪+回音消除)', {
    echoCancellation: true,
    noiseSuppression: true
  });

  console.log('\n--- 等待 1 秒 ---');
  await new Promise(function(r) { setTimeout(r, 1000); });

  await testConstraint('B: 无约束', {});

  console.log('\n--- 等待 1 秒 ---');
  await new Promise(function(r) { setTimeout(r, 1000); });

  await testConstraint('C: 只开回音消除', {
    echoCancellation: true,
    noiseSuppression: false
  });

  console.log('\n--- 等待 1 秒 ---');
  await new Promise(function(r) { setTimeout(r, 1000); });

  await testConstraint('D: 全关', {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false
  });

  // 报告
  console.log('\n========================================');
  console.log('  对比测试报告');
  console.log('========================================');
  TEST_RESULTS.forEach(function(r) {
    if (r.error) {
      console.log('  [FAIL] ' + r.label + ': ' + r.error);
    } else {
      var note = '';
      if (r.totalBytes < 2000) note = ' ← 异常偏小!';
      if (r.totalBytes > 10000) note = ' ← 正常';
      console.log('  ' + r.label + ': ' + r.totalBytes + ' bytes / ' + r.chunks + ' chunks' + note);
    }
  });
  console.log('========================================');
  console.log('\n结论:');
  console.log('  如果 A 方案数据量 < 2000 bytes 而其他方案 > 10000 bytes');
  console.log('  则说明 noiseSuppression 或 echoCancellation 过度滤除音频');
}

testConstraintAll();
