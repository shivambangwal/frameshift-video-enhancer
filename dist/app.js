(() => {
  const $ = (selector) => document.querySelector(selector);
  const fileInput = $('#file-input');
  const uploadButton = $('#upload-button');
  const replaceButton = $('#replace-button');
  const stage = $('#media-stage');
  const original = $('#original-video');
  const enhanced = $('#enhanced-video');
  const compareRange = $('#compare-range');
  const compareDivider = $('#compare-divider');
  const strengthRange = $('#strength-range');
  const strengthValue = $('#strength-value');
  const modelSelect = $('#model-select');
  const formatSelect = $('#format-select');
  const enhanceButton = $('#enhance-button');
  const enhanceButtonLabel = $('#enhance-button-label');
  const downloadButton = $('#download-button');
  const progressWrap = $('#progress-wrap');
  const toast = $('#toast');
  let sourceUrl = null;
  let sourceFile = null;
  let exportUrl = null;
  let selectedResolution = 'auto';
  let recorder = null;
  let recordingChunks = [];
  let drawFrame = 0;
  let toastTimer = 0;
  let canExport = false;

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return '00:00';
    const s = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  function showToast(message, kind = '') {
    toast.textContent = message;
    toast.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3600);
  }

  function updateStepState() {
    const steps = [$('#step-1'), $('#step-2'), $('#step-3')];
    steps.forEach((step, index) => {
      const isComplete = Boolean(sourceFile) && (index === 0 || (index === 2 && Boolean(exportUrl)));
      step.classList.toggle('done', isComplete);
      step.classList.toggle('active', index === (sourceFile ? (exportUrl ? 2 : 1) : 0));
    });
  }

  function updateProgress(value, label) {
    const percent = Math.max(0, Math.min(100, Math.round(value)));
    $('#progress-bar').style.width = `${percent}%`;
    $('#progress-percent').textContent = `${percent}%`;
    if (label) $('#progress-label').textContent = label;
  }

  function getEnhancementFilter() {
    const amount = Number(strengthRange.value) / 100;
    const model = modelSelect.value;
    const denoise = $('#denoise-toggle').checked;
    const preset = {
      auto: { brightness: 1.025, contrast: 1.07, saturation: 1.08 },
      portrait: { brightness: 1.025, contrast: 1.04, saturation: 1.06 },
      product: { brightness: 1.015, contrast: 1.12, saturation: 1.10 },
      lowlight: { brightness: 1.08, contrast: 1.06, saturation: 1.03 },
      gaming: { brightness: 1.02, contrast: 1.14, saturation: 1.09 },
      anime: { brightness: 1.01, contrast: 1.17, saturation: 1.04 },
    }[model];
    const brightness = 1 + (preset.brightness - 1) * amount;
    const contrast = 1 + (preset.contrast - 1) * amount;
    const saturation = 1 + (preset.saturation - 1) * amount;
    const blur = denoise ? Math.max(.08, .54 * amount) : 0;
    return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)})${blur ? ` blur(${blur.toFixed(2)}px)` : ''}`;
  }

  function updatePreview() {
    const strength = Number(strengthRange.value);
    strengthValue.textContent = `${strength}%`;
    const pct = strength;
    strengthRange.style.background = `linear-gradient(90deg,var(--lime) 0%,var(--lime) ${pct}%,#41434b ${pct}%,#41434b 100%)`;
    enhanced.style.filter = getEnhancementFilter();
    const split = Number(compareRange.value);
    enhanced.style.clipPath = `inset(0 0 0 ${split}%)`;
    compareDivider.style.left = `${split}%`;
    if (sourceFile && !enhanceButton.disabled) enhanceButtonLabel.textContent = 'Enhance video';
  }

  function updateResolutionHint() {
    const hint = $('#resolution-hint');
    hint.textContent = selectedResolution === 'auto' ? 'Auto chooses for your clip' : ({ '2k': '2560 × up to 1440', '4k': '3840 × up to 2160', '8k': '7680 × up to 4320' }[selectedResolution]);
  }

  function populateFormats() {
    const choices = [
      { label: 'WebM · best browser support', mime: 'video/webm;codecs=vp9,opus', fallback: 'video/webm', ext: 'webm' },
      { label: 'MP4 · if supported by browser', mime: 'video/mp4', fallback: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
    ];
    const supported = choices.filter((choice) => window.MediaRecorder && (MediaRecorder.isTypeSupported(choice.mime) || MediaRecorder.isTypeSupported(choice.fallback)));
    canExport = supported.length > 0;
    formatSelect.innerHTML = '';
    if (!supported.length) {
      formatSelect.innerHTML = '<option value="">Video export unavailable in this browser</option>';
      formatSelect.disabled = true;
      enhanceButtonLabel.textContent = 'Browser export unavailable';
      return;
    }
    for (const choice of supported) {
      const option = document.createElement('option');
      option.value = choice.ext;
      option.textContent = choice.label;
      option.dataset.mime = MediaRecorder.isTypeSupported(choice.mime) ? choice.mime : choice.fallback;
      formatSelect.append(option);
    }
    formatSelect.disabled = false;
  }

  function openPicker() { fileInput.click(); }
  uploadButton.addEventListener('click', openPicker);
  replaceButton.addEventListener('click', openPicker);
  fileInput.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    if (file) loadVideo(file);
    fileInput.value = '';
  });

  async function loadVideo(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const allowed = ['mp4', 'mov', 'm4v', '3gp', '3g2', 'avi'];
    if (!file.type.startsWith('video/') && !allowed.includes(ext)) {
      showToast('Choose a video file in MP4, MOV, M4V, 3GP or AVI format.', 'error');
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    sourceFile = file;
    exportUrl = null;
    sourceUrl = URL.createObjectURL(file);
    original.src = sourceUrl;
    enhanced.src = sourceUrl;
    original.load();
    enhanced.load();
    original.hidden = false;
    enhanced.hidden = false;
    $('#empty-art').hidden = true;
    $('#empty-message').hidden = true;
    $('#original-badge').hidden = false;
    $('#enhanced-badge').hidden = false;
    $('#compare-range').hidden = false;
    $('#compare-divider').hidden = false;
    $('#stage-center-hint').hidden = false;
    $('#duration-chip').hidden = false;
    $('#transport').hidden = false;
    $('#replace-button').hidden = false;
    $('#file-name').textContent = file.name;
    $('#file-details').textContent = `${prettyBytes(file.size)} · loading video details…`;
    enhanceButton.disabled = true;
    enhanceButtonLabel.textContent = 'Loading video…';
    downloadButton.hidden = true;
    updateStepState();
    updatePreview();

    await new Promise((resolve) => {
      const done = () => resolve();
      const fail = () => resolve();
      original.addEventListener('loadedmetadata', done, { once: true });
      original.addEventListener('error', fail, { once: true });
    });
    if (original.readyState < 1 || !original.videoWidth) {
      enhanceButton.disabled = true;
      enhanceButtonLabel.textContent = 'Video format not supported';
      $('#file-details').textContent = `${prettyBytes(file.size)} · this browser could not decode this file`;
      showToast('This browser cannot decode that video. Try MP4 or MOV in a recent browser.', 'error');
      return;
    }
    const dims = `${original.videoWidth} × ${original.videoHeight}`;
    $('#source-resolution').textContent = `SOURCE · ${dims}`;
    $('#file-details').textContent = `${dims} · ${formatTime(original.duration)} · ${prettyBytes(file.size)}`;
    $('#total-time').textContent = formatTime(original.duration);
    $('#duration-chip').textContent = formatTime(original.duration);
    enhanceButton.disabled = !canExport;
    enhanceButtonLabel.textContent = canExport ? 'Enhance video' : 'Browser export unavailable';
    original.currentTime = 0;
    enhanced.currentTime = 0;
    showToast('Video ready. Choose your model and resolution.', 'success');
  }

  function prettyBytes(bytes) {
    if (!Number.isFinite(bytes)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes;
    let unit = 0;
    while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit += 1; }
    return `${n.toFixed(unit ? 1 : 0)} ${units[unit]}`;
  }

  ['dragenter', 'dragover'].forEach((name) => stage.addEventListener(name, (event) => { event.preventDefault(); stage.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach((name) => stage.addEventListener(name, (event) => { event.preventDefault(); stage.classList.remove('drag-over'); }));
  stage.addEventListener('drop', (event) => {
    const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith('video/') || /\.(mp4|mov|m4v|3gp|3g2|avi)$/i.test(item.name));
    if (file) loadVideo(file);
    else showToast('Drop a video file to get started.', 'error');
  });
  document.addEventListener('paste', (event) => {
    const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith('video/'));
    if (file) loadVideo(file);
  });

  strengthRange.addEventListener('input', updatePreview);
  modelSelect.addEventListener('change', updatePreview);
  $('#denoise-toggle').addEventListener('change', updatePreview);
  compareRange.addEventListener('input', updatePreview);
  document.querySelectorAll('.resolution-option').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.resolution-option').forEach((item) => item.classList.toggle('selected', item === button));
    selectedResolution = button.dataset.resolution;
    updateResolutionHint();
  }));

  original.addEventListener('play', () => { $('#stage-center-hint').hidden = true; enhanced.play().catch(() => {}); $('#play-button').textContent = '❚❚'; });
  original.addEventListener('pause', () => { enhanced.pause(); $('#stage-center-hint').hidden = false; $('#play-button').textContent = '▶'; });
  original.addEventListener('timeupdate', () => {
    if (Number.isFinite(original.duration) && original.duration > 0) $('#seek-range').value = String(Math.round(original.currentTime / original.duration * 1000));
    $('#current-time').textContent = formatTime(original.currentTime);
    if (Math.abs(enhanced.currentTime - original.currentTime) > .12) enhanced.currentTime = original.currentTime;
  });
  original.addEventListener('seeked', () => { enhanced.currentTime = original.currentTime; });
  $('#play-button').addEventListener('click', () => original.paused ? original.play().catch(() => {}) : original.pause());
  $('#stage-center-hint').addEventListener('click', () => original.play().catch(() => {}));
  $('#seek-range').addEventListener('input', (event) => {
    if (Number.isFinite(original.duration) && original.duration > 0) {
      original.currentTime = Number(event.target.value) / 1000 * original.duration;
      enhanced.currentTime = original.currentTime;
    }
  });
  $('#compare-button').addEventListener('click', () => {
    const showingOriginal = compareRange.value === '100';
    compareRange.value = showingOriginal ? '52' : '100';
    updatePreview();
    $('#compare-button').innerHTML = showingOriginal ? '<span>↔</span> Compare' : '<span>↔</span> Show comparison';
  });

  function targetDimensions() {
    let height;
    if (selectedResolution === '2k') height = 1440;
    else if (selectedResolution === '4k') height = 2160;
    else if (selectedResolution === '8k') height = 4320;
    else height = Math.min(4320, original.videoHeight);
    const scale = height / original.videoHeight;
    return { width: Math.max(2, Math.round(original.videoWidth * scale / 2) * 2), height };
  }

  async function exportVideo() {
    if (!sourceFile || !original.videoWidth || !window.MediaRecorder) return;
    enhanceButton.disabled = true;
    enhanceButtonLabel.textContent = 'Enhancing…';
    downloadButton.hidden = true;
    progressWrap.hidden = false;
    updateProgress(0, 'Preparing your video…');
    updateStepState();

    const canvas = document.createElement('canvas');
    const dims = targetDimensions();
    canvas.width = dims.width;
    canvas.height = dims.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      showToast('Your browser could not create the export canvas.', 'error');
      finishExport();
      return;
    }
    const selected = formatSelect.selectedOptions[0];
    const mime = selected?.dataset.mime || 'video/webm';
    const outputBitrate = selectedResolution === '8k' ? 52000000 : selectedResolution === '4k' ? 24000000 : selectedResolution === '2k' ? 14000000 : 9000000;
    recordingChunks = [];
    const duration = original.duration || 1;
    const filter = getEnhancementFilter();
    let completed = false;
    let stream = null;
    const render = () => {
      if (completed) return;
      context.filter = filter;
      context.drawImage(original, 0, 0, canvas.width, canvas.height);
      stream.getVideoTracks()[0]?.requestFrame?.();
      const progress = Math.min(98, original.currentTime / duration * 100);
      updateProgress(progress, 'Enhancing your video…');
      if (!original.ended && !original.paused) drawFrame = requestAnimationFrame(render);
    };
    original.pause();
    original.loop = false;
    original.currentTime = 0;
    enhanced.currentTime = 0;
    try {
      if (original.readyState < 2) await new Promise((resolve, reject) => {
        original.addEventListener('loadeddata', resolve, { once: true });
        original.addEventListener('error', reject, { once: true });
      });
      if (original.seeking) await new Promise((resolve) => original.addEventListener('seeked', resolve, { once: true }));
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video playback did not start')), 3000);
        original.addEventListener('playing', () => { clearTimeout(timeout); resolve(); }, { once: true });
        original.play().catch((error) => { clearTimeout(timeout); reject(error); });
      });
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(); } };
        setTimeout(finish, 200);
        if (typeof original.requestVideoFrameCallback === 'function') original.requestVideoFrameCallback(finish);
      });
      if (original.paused) throw new Error('Video playback was interrupted before capture');
      context.filter = filter;
      context.drawImage(original, 0, 0, canvas.width, canvas.height);
      stream = canvas.captureStream(30);
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== 'live') throw new Error('No live canvas video track');
      if ($('#audio-toggle').checked) {
        const sourceStream = original.captureStream?.() || original.mozCaptureStream?.();
        sourceStream?.getAudioTracks().filter((track) => track.readyState === 'live').forEach((track) => stream.addTrack(track));
      }
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: outputBitrate });
      } catch {
        recorder = new MediaRecorder(stream);
      }
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recordingChunks.push(event.data); };
      recorder.onerror = () => {
        completed = true;
        cancelAnimationFrame(drawFrame);
        showToast('Export stopped unexpectedly. Try a shorter clip or lower resolution.', 'error');
        finishExport();
      };
      recorder.onstop = async () => {
        completed = true;
        cancelAnimationFrame(drawFrame);
        const blob = new Blob(recordingChunks, { type: recorder.mimeType || mime });
        if (!blob.size || !(recorder.mimeType || mime).startsWith('video/')) {
          showToast('The browser returned an invalid video export. Try WebM or another browser.', 'error');
          finishExport();
          return;
        }
        const checkUrl = URL.createObjectURL(blob);
        const checkVideo = document.createElement('video');
        checkVideo.preload = 'metadata';
        checkVideo.muted = true;
        checkVideo.src = checkUrl;
        const hasVideo = await new Promise((resolve) => {
          checkVideo.addEventListener('loadedmetadata', () => resolve(checkVideo.videoWidth > 0 && checkVideo.videoHeight > 0), { once: true });
          checkVideo.addEventListener('error', () => resolve(false), { once: true });
        });
        checkVideo.removeAttribute('src');
        URL.revokeObjectURL(checkUrl);
        if (!hasVideo) {
          showToast('The export has no video frames. Retry using WebM or a different browser.', 'error');
          finishExport();
          return;
        }
        if (exportUrl) URL.revokeObjectURL(exportUrl);
        exportUrl = URL.createObjectURL(blob);
        downloadButton.dataset.url = exportUrl;
        downloadButton.dataset.extension = (recorder.mimeType || mime).includes('mp4') ? 'mp4' : 'webm';
        downloadButton.hidden = false;
        updateProgress(100, 'Your enhanced video is ready.');
        enhanceButton.disabled = false;
        enhanceButtonLabel.textContent = 'Enhance again';
        updateStepState();
        showToast('Export complete. Your video is ready to download.', 'success');
        finishExport(true);
      };
      original.onended = () => { if (recorder?.state === 'recording') recorder.stop(); };
      recorder.start(500);
      render();
      $('#progress-footnote').textContent = `${dims.width.toLocaleString()} × ${dims.height.toLocaleString()} · Keep this tab open while your video exports.`;
    } catch (error) {
      console.error('Video export setup failed:', error);
      showToast('Could not start video capture. Try WebM or another browser.', 'error');
      finishExport();
    }
  }

  function finishExport(success = false) {
    enhanceButton.disabled = !sourceFile || !canExport;
    if (!success) enhanceButtonLabel.textContent = sourceFile ? 'Try export again' : 'Upload a video to begin';
    original.loop = true;
    if (recorder?.state === 'recording') {
      try { recorder.stop(); } catch {}
    }
    if (original.paused === false) original.pause();
  }

  enhanceButton.addEventListener('click', exportVideo);
  downloadButton.addEventListener('click', () => {
    if (!exportUrl) return;
    const anchor = document.createElement('a');
    anchor.href = exportUrl;
    const baseName = (sourceFile?.name || 'video').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
    anchor.download = `${baseName}_enhanced.${downloadButton.dataset.extension || 'webm'}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  });

  $('#help-button')?.addEventListener('click', () => {});
  $('.help-button').addEventListener('click', () => showToast('This demo applies browser-side adjustments. AI restoration requires a connected model provider.'));
  document.addEventListener('visibilitychange', () => { if (document.hidden && recorder?.state === 'recording') showToast('Export paused by the browser. Keep this tab open in the foreground.'); });

  populateFormats();
  updatePreview();
  updateResolutionHint();
  updateStepState();
})();
