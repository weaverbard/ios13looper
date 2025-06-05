window.addEventListener('DOMContentLoaded', () => {
    let audioContext = null;
    let audioBuffer = null;
    let originalBuffer = null;
    let loopBuffer = null;
    let source = null;
    let selection = { start: 0, end: 0 };
    let playhead = 0;
    let isPlaying = false;
    let previewPlayhead = 0;
    let previewIsPlaying = false;
    let loopBlobUrl = null;
    let loopDataUrl = null;

    const canvas = document.getElementById('waveform');
    const ctx = canvas.getContext('2d');
    const previewCanvas = document.getElementById('previewWaveform');
    const previewCtx = previewCanvas.getContext('2d');
    const audioInput = document.getElementById('audioInput');
    const uploadButton = document.getElementById('uploadButton');
    const playheadSlider = document.getElementById('playheadSlider');
    const playheadTime = document.getElementById('playheadTime');
    const selectionStartSlider = document.getElementById('selectionStartSlider');
    const selectionStartTime = document.getElementById('selectionStartTime');
    const selectionEndSlider = document.getElementById('selectionEndSlider');
    const selectionEndTime = document.getElementById('selectionEndTime');
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const startBtn = document.getElementById('startBtn');
    const endBtn = document.getElementById('endBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const crossfadeSelect = document.getElementById('crossfadeSelect');
    const crossfadeTypeSelect = document.getElementById('crossfadeTypeSelect');
    const previewBtn = document.getElementById('previewBtn');
    const previewPlayheadSlider = document.getElementById('previewPlayheadSlider');
    const previewPlayheadTime = document.getElementById('previewPlayheadTime');
    const previewPlayBtn = document.getElementById('previewPlayBtn');
    const previewPauseBtn = document.getElementById('previewPauseBtn');
    const previewLoopBtn = document.getElementById('previewLoopBtn');
    const resetBtn = document.getElementById('resetBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const openBtn = document.getElementById('openBtn');
    const shareSheetBtn = document.getElementById('shareSheetBtn');
    const shareLink = document.getElementById('shareLink');
    const newAudioBtn = document.getElementById('newAudioBtn');
    const error = document.getElementById('error');
    const progress = document.getElementById('progress');
    const progressMessage = document.getElementById('progressMessage');

    // Check for missing elements
    const elements = [canvas, previewCanvas, audioInput, uploadButton, playheadSlider, playheadTime, 
                     selectionStartSlider, selectionStartTime, selectionEndSlider, selectionEndTime,
                     playBtn, pauseBtn, startBtn, endBtn, deleteBtn, crossfadeSelect, crossfadeTypeSelect,
                     previewBtn, previewPlayheadSlider, previewPlayheadTime, previewPlayBtn, 
                     previewPauseBtn, previewLoopBtn, resetBtn, downloadBtn, openBtn, shareSheetBtn,
                     shareLink, newAudioBtn, error, progress, progressMessage];
    if (elements.some(el => !el)) {
        showError('Initialization error: One or more UI elements are missing.');
        console.error('Missing elements:', elements.filter(el => !el));
        return;
    }

    // Initialize state
    audioInput.value = '';
    progress.style.display = 'none';
    openBtn.disabled = true;
    shareSheetBtn.disabled = true;
    shareLink.classList.add('hidden');
    console.log('iOS13Looper 1.65 initialized. User Agent:', navigator.userAgent);

    function showError(message) {
        error.textContent = message;
        error.classList.remove('hidden');
        console.log('Error:', message);
    }

    function clearError() {
        error.textContent = '';
        error.classList.add('hidden');
    }

    function showProgress(message) {
        console.log('showProgress:', message);
        progressMessage.textContent = message;
        progress.style.display = 'flex';
    }

    function hideProgress() {
        console.log('hideProgress called');
        progressMessage.textContent = '';
        progress.style.display = 'none';
    }

    function resumeAudioContext() {
        if (audioContext && audioContext.state === 'suspended') {
            console.log('Resuming AudioContext, current state:', audioContext.state);
            return audioContext.resume().then(() => {
                console.log('AudioContext resumed, state:', audioContext.state);
            }).catch(err => {
                showError('Failed to resume audio context: ' + err.message);
                console.error('AudioContext resume error:', err);
                throw err;
            });
        }
        console.log('AudioContext already running or not created');
        return Promise.resolve();
    }

    // Preload AudioContext on first user interaction
    audioInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadButton.disabled = false;
            console.log('File selected:', e.target.files[0].name);
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log('AudioContext preloaded on file input, sampleRate:', audioContext.sampleRate);
                resumeAudioContext();
            }
        } else {
            uploadButton.disabled = true;
            console.log('No file selected');
        }
    });

    function resizeCanvases() {
        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        previewCanvas.width = previewCanvas.offsetWidth * window.devicePixelRatio;
        previewCanvas.height = previewCanvas.offsetHeight * window.devicePixelRatio;
        drawWaveform();
        drawPreviewWaveform();
    }

    window.addEventListener('resize', resizeCanvases);

    function resetToEditState() {
        if (!originalBuffer) return;
        audioBuffer = audioContext.createBuffer(
            originalBuffer.numberOfChannels,
            originalBuffer.length,
            originalBuffer.sampleRate
        );
        for (let channel = 0; channel < originalBuffer.numberOfChannels; channel++) {
            audioBuffer.getChannelData(channel).set(originalBuffer.getChannelData(channel));
        }
        selection = { start: 0, end: audioBuffer.duration };
        playhead = 0;
        playheadSlider.max = audioBuffer.duration;
        playheadSlider.value = 0;
        playheadTime.textContent = '0.00s';
        selectionStartSlider.max = document.getElementById('selectionStartSlider');
        selectionStartSlider.max = audioBuffer.duration;
        selectionStartSlider.min = 0;
        selectionStartSlider.value = 0;
        selectionStartTime.textContent = '0.00s';
        selectionEndSlider.max = audioBuffer.duration;
        selectionEndSlider.min = 0;
        selectionEndSlider.value = audioBuffer.duration;
        selectionEndTime.textContent = audioBuffer.duration.toFixed(2) + 's';
        crossfadeSelect.value = '1';
        document.getElementById('editStep').classList.remove('hidden');
        document.getElementById('crossfadeStep').classList.add('hidden');
        document.getElementById('previewStep').classList.add('hidden');
        document.getElementById('downloadStep').classList.add('hidden');
        if (loopBlobUrl) {
            URL.revokeObjectURL(loopBlobUrl);
            console.log('Revoked loopBlobUrl');
            loopBlobUrl = null;
        }
        if (loopDataUrl) {
            console.log('Cleared loopDataUrl');
            loopDataUrl = null;
        }
        loopBuffer = null;
        openBtn.disabled = true;
        shareSheetBtn.disabled = true;
        shareLink.classList.add('hidden');
        shareLink.href = '#';
        resizeCanvases();
        drawWaveform();
        clearError();
        hideProgress();
    }

    // Utility to convert Blob to Data URL
    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to convert Blob to Data URL'));
            reader.readAsDataURL(blob);
        });
    }

    uploadButton.addEventListener('click', async () => {
        const file = audioInput.files[0];
        if (!file) {
            showError('No file selected.');
            return;
        }

        if (file.size > 100 * 1024 * 1024) {
            showError('File too large. Maximum size is 100MB.');
            return;
        }

        console.log('Starting file load, file:', file.name, ', size:', file.size, ', type:', file.type);
        showProgress('Loading audio file...');
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log('AudioContext created, sampleRate:', audioContext.sampleRate);
            }
            console.log('Resuming AudioContext');
            await resumeAudioContext();
            console.log('Fetching file as ArrayBuffer');
            const response = await fetch(URL.createObjectURL(file));
            console.log('Fetch response received, status:', response.status);
            const arrayBuffer = await response.arrayBuffer();
            console.log('ArrayBuffer fetched, length:', arrayBuffer.byteLength);
            console.log('Starting decodeAudioData');

            // Compatibility for older Safari decodeAudioData
            const decodeAudioDataPromise = new Promise((resolve, reject) => {
                try {
                    // Try Promise-based decodeAudioData
                    audioContext.decodeAudioData(arrayBuffer).then(resolve).catch((err) => {
                        console.log('Promise-based decodeAudioData failed:', err.message);
                        // Fall back to callback-based decodeAudioData
                        console.log('Falling back to callback-based decodeAudioData');
                        audioContext.decodeAudioData(
                            arrayBuffer,
                            (decodedBuffer) => resolve(decodedBuffer),
                            (err) => reject(new Error('Callback-based decodeAudioData failed: ' + (err.message || 'Unknown error')))
                        );
                    });
                } catch (err) {
                    // Handle synchronous errors (e.g., Safari 13.1.2 throwing errors)
                    console.log('Synchronous decodeAudioData error:', err.message);
                    console.log('Falling back to callback-based decodeAudioData');
                    audioContext.decodeAudioData(
                        arrayBuffer,
                        (decodedBuffer) => resolve(decodedBuffer),
                        (err) => reject(new Error('Callback-based decodeAudioData failed: ' + (err.message || 'Unknown error')))
                    );
                }
            });

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Audio decoding timed out after 30 seconds')), 30000);
            });

            audioBuffer = await Promise.race([decodeAudioDataPromise, timeoutPromise]).catch(err => {
                throw new Error('decodeAudioData failed: ' + err.message);
            });

            console.log('Audio decoded, duration:', audioBuffer.duration);
            if (audioBuffer.duration < 0.2) {
                showError('Audio file is too short.');
                audioBuffer = null;
                hideProgress();
                return;
            }
            originalBuffer = audioContext.createBuffer(
                audioBuffer.numberOfChannels,
                audioBuffer.length,
                audioBuffer.sampleRate
            );
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                originalBuffer.getChannelData(channel).set(audioBuffer.getChannelData(channel));
            }
            console.log('Resetting to edit state');
            resetToEditState();
            console.log('Hiding progress');
            hideProgress();
        } catch (err) {
            showError('Failed to load audio: ' + err.message);
            console.error('Audio loading error:', err);
            console.log('User Agent:', navigator.userAgent);
            console.log('File type:', file.type, ', Size:', file.size, ', Name:', file.name);
            hideProgress();
        }
    });

    function drawWaveform() {
        if (!audioBuffer || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;
        ctx.beginPath();
        ctx.strokeStyle = 'rgb(0,255,255)';
        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0, max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j] || 0;
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            ctx.moveTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
        ctx.stroke();

        if (selection.start !== selection.end) {
            const startX = (selection.start / audioBuffer.duration) * canvas.width;
            const endX = (selection.end / audioBuffer.duration) * canvas.width;
            ctx.fillStyle = 'rgba(255, 165, 0, 0.5)';
            ctx.fillRect(startX, 0, endX - startX, canvas.height);
            ctx.fillStyle = '#FFA500';
            ctx.fillRect(startX - 1, 0, 2, canvas.height);
            ctx.fillRect(endX - 1, 0, 2, canvas.height);
        }

        const playheadX = (playhead / audioBuffer.duration) * canvas.width;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, canvas.height);
        ctx.stroke();
    }

    function drawPreviewWaveform() {
        if (!loopBuffer || !previewCtx) return;
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.fillStyle = '#333';
        previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

        const data = loopBuffer.getChannelData(0);
        const step = Math.ceil(data.length / previewCanvas.width);
        const amp = previewCanvas.height / 2;
        previewCtx.beginPath();
        previewCtx.strokeStyle = 'rgb(0,255,255)';
        for (let i = 0; i < previewCanvas.width; i++) {
            let min = 1.0, max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j] || 0;
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            previewCtx.moveTo(i, (1 + min) * amp);
            previewCtx.lineTo(i, (1 + max) * amp);
        }
        previewCtx.stroke();

        const previewPlayheadX = (previewPlayhead / loopBuffer.duration) * previewCanvas.width;
        previewCtx.strokeStyle = '#fff';
        previewCtx.beginPath();
        previewCtx.moveTo(previewPlayheadX, 0);
        previewCtx.lineTo(previewPlayheadX, previewCanvas.height);
        previewCtx.stroke();
    }

    selectionStartSlider.addEventListener('input', () => {
        if (!audioBuffer) return;
        const value = parseFloat(selectionStartSlider.value);
        selection.start = Math.min(value, selection.end);
        selectionStartSlider.value = selection.start;
        selectionStartTime.textContent = selection.start.toFixed(2) + 's';
        drawWaveform();
    });

    selectionEndSlider.addEventListener('input', () => {
        if (!audioBuffer) return;
        const value = parseFloat(selectionEndSlider.value);
        selection.end = Math.max(value, selection.start);
        selectionEndSlider.value = selection.end;
        selectionEndTime.textContent = selection.end.toFixed(2) + 's';
        drawWaveform();
    });

    playheadSlider.addEventListener('input', () => {
        if (!audioBuffer) return;
        playhead = parseFloat(playheadSlider.value);
        playheadTime.textContent = playhead.toFixed(2) + 's';
        if (isPlaying) {
            if (source) source.stop();
            source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0, playhead);
        }
        drawWaveform();
    });

    playBtn.addEventListener('click', async () => {
        if (!audioBuffer || isPlaying) return;
        await resumeAudioContext();
        if (playhead < selection.start || playhead > selection.end) {
            playhead = selection.start;
            playheadSlider.value = playhead;
            playheadTime.textContent = playhead.toFixed(2) + 's';
        }
        source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0, playhead);
        isPlaying = true;
        const startTime = audioContext.currentTime;
        const initialPlayhead = playhead;
        const interval = setInterval(() => {
            if (!isPlaying) {
                clearInterval(interval);
                return;
            }
            playhead = initialPlayhead + (audioContext.currentTime - startTime);
            if (playhead >= selection.end) {
                const overshoot = playhead - selection.end;
                playhead = selection.start + overshoot;
                if (source) source.stop();
                source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContext.destination);
                source.start(0, playhead);
            }
            playheadSlider.value = playhead;
            playheadTime.textContent = playhead.toFixed(2) + 's';
            drawWaveform();
        }, 50);
    });

    pauseBtn.addEventListener('click', () => {
        if (isPlaying) {
            if (source) source.stop();
            source = null;
            isPlaying = false;
            drawWaveform();
        }
    });

    startBtn.addEventListener('click', () => {
        if (!audioBuffer) return;
        playhead = selection.start;
        playheadSlider.value = playhead;
        playheadTime.textContent = playhead.toFixed(2) + 's';
        if (isPlaying) {
            if (source) source.stop();
            source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0, playhead);
        }
        drawWaveform();
    });

    endBtn.addEventListener('click', () => {
        if (!audioBuffer) return;
        playhead = selection.end;
        playheadSlider.value = playhead;
        playheadTime.textContent = playhead.toFixed(2) + 's';
        if (isPlaying) {
            if (source) source.stop();
            source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0, playhead);
        }
        drawWaveform();
    });

    deleteBtn.addEventListener('click', () => {
        if (!audioBuffer || selection.start === selection.end) {
            showError('Please select a region to keep.');
            return;
        }
        showProgress('Cropping loop...');
        const startSample = Math.floor(selection.start * audioBuffer.sampleRate);
        const endSample = Math.floor(selection.end * audioBuffer.sampleRate);
        const newLength = endSample - startSample;
        if (newLength < 0.2 * audioBuffer.sampleRate) {
            showError('Selected region is too short.');
            hideProgress();
            return;
        }
        const newBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            newLength,
            audioBuffer.sampleRate
        );
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const oldData = audioBuffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);
            for (let i = 0; i < newLength; i++) {
                newData[i] = oldData[startSample + i];
            }
        }
        audioBuffer = newBuffer;
        selection = { start: 0, end: audioBuffer.duration };
        playhead = Math.min(playhead, audioBuffer.duration);
        playheadSlider.max = audioBuffer.duration;
        playheadSlider.value = playhead;
        playheadTime.textContent = playhead.toFixed(2) + 's';
        selectionStartSlider.max = audioBuffer.duration;
        selectionStartSlider.min = 0;
        selectionStartSlider.value = 0;
        selectionStartTime.textContent = '0.00s';
        selectionEndSlider.max = audioBuffer.duration;
        selectionEndSlider.min = 0;
        selectionEndSlider.value = audioBuffer.duration;
        selectionEndTime.textContent = audioBuffer.duration.toFixed(2) + 's';
        drawWaveform();
        document.getElementById('crossfadeStep').classList.remove('hidden');
        hideProgress();
    });

    previewBtn.addEventListener('click', async () => {
        if (!audioBuffer) return;
        await resumeAudioContext();
        const crossfadeDuration = parseFloat(crossfadeSelect.value);
        if (crossfadeDuration > audioBuffer.duration / 2) {
            showError('Crossfade duration cannot exceed half the audio length.');
            return;
        }
        showProgress('Generating preview...');
        loopBuffer = await createLoopBuffer(crossfadeDuration);
        if (!loopBuffer) {
            showError('Failed to generate loop buffer.');
            hideProgress();
            return;
        }
        try {
            const wavBlob = bufferToWav(loopBuffer);
            console.log('WAV blob created for preview, size:', wavBlob.size, 'bytes');
            if (loopBlobUrl) {
                URL.revokeObjectURL(loopBlobUrl);
                console.log('Revoked previous loopBlobUrl');
            }
            loopBlobUrl = URL.createObjectURL(wavBlob);
            console.log('New loopBlobUrl created:', loopBlobUrl);
            loopDataUrl = await blobToDataURL(wavBlob);
            console.log('Data URL created, length:', loopDataUrl.length);
            openBtn.disabled = false;
            shareSheetBtn.disabled = false;
            shareLink.href = loopDataUrl;
            shareLink.classList.remove('hidden');
        } catch (err) {
            showError('Failed to generate loop URLs: ' + err.message);
            console.error('URL generation error:', err);
            hideProgress();
            return;
        }
        previewPlayheadSlider.max = loopBuffer.duration;
        previewPlayheadSlider.value = 0;
        previewPlayheadTime.textContent = '0.00s';
        previewPlayhead = 0;
        previewIsPlaying = false;
        document.getElementById('previewStep').classList.remove('hidden');
        document.getElementById('downloadStep').classList.remove('hidden');
        resizeCanvases();
        drawPreviewWaveform();
        hideProgress();
    });

    previewPlayheadSlider.addEventListener('input', () => {
        if (!loopBuffer) return;
        previewPlayhead = parseFloat(previewPlayheadSlider.value);
        previewPlayheadTime.textContent = previewPlayhead.toFixed(2) + 's';
        if (previewIsPlaying) {
            if (source) source.stop();
            source = audioContext.createBufferSource();
            source.buffer = loopBuffer;
            source.connect(audioContext.destination);
            source.loop = true;
            source.start(0, previewPlayhead);
        }
        drawPreviewWaveform();
    });

    previewPlayBtn.addEventListener('click', async () => {
        if (!loopBuffer || previewIsPlaying) return;
        await resumeAudioContext();
        source = audioContext.createBufferSource();
        source.buffer = loopBuffer;
        source.connect(audioContext.destination);
        source.loop = true;
        source.start(0, previewPlayhead);
        previewIsPlaying = true;
        const startTime = audioContext.currentTime;
        const initialPlayhead = previewPlayhead;
        const interval = setInterval(() => {
            if (!previewIsPlaying) {
                clearInterval(interval);
                return;
            }
            previewPlayhead = (initialPlayhead + (audioContext.currentTime - startTime)) % loopBuffer.duration;
            previewPlayheadSlider.value = previewPlayhead;
            previewPlayheadTime.textContent = previewPlayhead.toFixed(2) + 's';
            drawPreviewWaveform();
        }, 50);
    });

    previewPauseBtn.addEventListener('click', () => {
        if (previewIsPlaying) {
            if (source) source.stop();
            source = null;
            previewIsPlaying = false;
            drawPreviewWaveform();
        }
    });

    previewLoopBtn.addEventListener('click', async () => {
        if (!loopBuffer) return;
        await resumeAudioContext();
        if (previewIsPlaying) {
            if (source) source.stop();
            source = null;
            previewIsPlaying = false;
        }
        const crossfadeDuration = parseFloat(crossfadeSelect.value);
        const previewStart = Math.max(0, loopBuffer.duration - crossfadeDuration - 5);
        previewPlayhead = previewStart;
        previewPlayheadSlider.value = previewPlayhead;
        previewPlayheadTime.textContent = previewStart.toFixed(2) + 's';
        source = audioContext.createBufferSource();
        source.buffer = loopBuffer;
        source.connect(audioContext.destination);
        source.loop = true;
        source.start(0, previewPlayhead);
        previewIsPlaying = true;
        const startTime = audioContext.currentTime;
        const initialPlayhead = previewPlayhead;
        const interval = setInterval(() => {
            if (!previewIsPlaying) {
                clearInterval(interval);
                return;
            }
            previewPlayhead = (initialPlayhead + (audioContext.currentTime - startTime)) % loopBuffer.duration;
            previewPlayheadSlider.value = previewPlayhead;
            previewPlayheadTime.textContent = previewPlayhead.toFixed(2) + 's';
            drawPreviewWaveform();
        }, 50);
        drawPreviewWaveform();
    });

    resetBtn.addEventListener('click', () => {
        if (source) source.stop();
        source = null;
        isPlaying = false;
        previewIsPlaying = false;
        console.log('Resetting to edit state');
        resetToEditState();
    });

    async function createLoopBuffer(crossfadeDuration) {
        const sampleRate = audioBuffer.sampleRate;
        const crossfadeSamples = Math.floor(crossfadeDuration * sampleRate);
        const newLength = audioBuffer.length - crossfadeSamples;
        if (newLength <= 0) {
            showError('Crossfade duration is too long for the audio length.');
            return null;
        }
        const loopBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            newLength,
            sampleRate
        );
        const crossfadeType = crossfadeTypeSelect.value;

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = loopBuffer.getChannelData(channel);
            for (let i = 0; i < newLength; i++) {
                outputData[i] = inputData[i + crossfadeSamples];
            }
            for (let i = 0; i < crossfadeSamples; i++) {
                const t = i / crossfadeSamples;
                let fadeIn, fadeOut;
                if (crossfadeType === 'equalPower') {
                    fadeIn = Math.sqrt(t);
                    fadeOut = Math.sqrt(1 - t);
                } else {
                    fadeIn = t;
                    fadeOut = 1 - t;
                }
                outputData[newLength - crossfadeSamples + i] =
                    inputData[i] * fadeIn + inputData[audioBuffer.length - crossfadeSamples + i] * fadeOut;
            }
        }
        return loopBuffer;
    }

    downloadBtn.addEventListener('click', async () => {
        if (!audioBuffer) {
            showError('No audio loaded.');
            console.log('No audio loaded for download');
            return;
        }
        await resumeAudioContext();
        const crossfadeDuration = parseFloat(crossfadeSelect.value);
        if (crossfadeDuration > audioBuffer.duration / 2) {
            showError('Crossfade duration cannot exceed half the audio length.');
            console.log('Invalid crossfade duration:', crossfadeDuration);
            return;
        }
        showProgress('Exporting loop...');
        try {
            if (!loopBuffer || !loopBlobUrl) {
                loopBuffer = await createLoopBuffer(crossfadeDuration);
                if (!loopBuffer) {
                    showError('Failed to generate loop buffer.');
                    console.log('Failed to generate loop buffer');
                    hideProgress();
                    return;
                }
                const wavBlob = bufferToWav(loopBuffer);
                console.log('WAV blob created for download, size:', wavBlob.size, 'bytes');
                if (loopBlobUrl) {
                    URL.revokeObjectURL(loopBlobUrl);
                    console.log('Revoked previous loopBlobUrl');
                }
                loopBlobUrl = URL.createObjectURL(wavBlob);
                console.log('New loopBlobUrl created:', loopBlobUrl);
                loopDataUrl = await blobToDataURL(wavBlob);
                console.log('Data URL created, length:', loopDataUrl.length);
                openBtn.disabled = false;
                shareSheetBtn.disabled = false;
                shareLink.href = loopDataUrl;
                shareLink.classList.remove('hidden');
            }
            const fileName = audioInput.files[0].name.replace(/\.[^/.]+$/, '') + '_loop.wav';
            const a = document.createElement('a');
            a.href = loopBlobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            console.log('Programmatic download triggered for:', fileName);
            setTimeout(() => {
                console.log('Delayed revocation skipped to preserve loopBlobUrl for reuse');
            }, 1000);
        } catch (err) {
            showError('Failed to export loop: ' + err.message);
            console.error('Download error:', err);
            hideProgress();
        }
    });

    openBtn.addEventListener('click', async () => {
        if (!loopBuffer || !loopDataUrl) {
            showError('No loop available to open.');
            console.log('No loop available to open');
            return;
        }
        try {
            window.open(loopDataUrl, '_blank');
            console.log('Opening Data URL:', loopDataUrl.substring(0, 50) + '...');
        } catch (err) {
            showError('Failed to open loop: ' + err.message);
            console.error('Open error:', err);
        }
    });

    shareSheetBtn.addEventListener('click', async () => {
        if (!loopBuffer || !loopDataUrl) {
            showError('No loop available to share.');
            console.log('No loop available to share');
            return;
        }
        try {
            const fileName = audioInput.files[0].name.replace(/\.[^/.]+$/, '') + '_loop.wav';
            // Convert Data URL to Blob for File object
            const response = await fetch(loopDataUrl);
            const blob = await response.blob();
            const file = new File([blob], fileName, { type: 'audio/wav' });
            if (navigator.share) {
                await navigator.share({
                    files: [file],
                    title: 'Loop',
                    text: 'Share your seamless loop'
                });
                console.log('Shared via navigator.share:', fileName);
            } else {
                console.log('navigator.share not supported, falling back to open');
                window.open(loopDataUrl, '_blank');
            }
        } catch (err) {
            showError('Failed to share loop: ' + err.message);
            console.error('Share error:', err);
            // Fallback to opening Data URL
            try {
                window.open(loopDataUrl, '_blank');
                console.log('Fallback: Opening Data URL');
            } catch (fallbackErr) {
                showError('Fallback failed: ' + fallbackErr.message);
                console.error('Fallback error:', fallbackErr);
            }
        }
    });

    shareLink.addEventListener('click', (event) => {
        if (!loopBuffer || !loopDataUrl) {
            event.preventDefault();
            showError('No loop available to share.');
            console.log('No link available to share');
            return;
        }
        console.log('Share link accessed:', loopDataUrl.substring(0, 50) + '...');
    });

    newAudioBtn.addEventListener('click', () => {
        console.log('Reloading page for new audio');
        window.location.reload();
    });

    function bufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const length = buffer.length * numChannels * 2 + 44;
        const arrayBuffer = new ArrayBuffer(length);
        const view = new DataView(arrayBuffer);

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * 2, true);
        view.setUint16(32, numChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, buffer.length * numChannels * 2, true);

        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < numChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
                view.setInt16(44 + (i * numChannels + channel) * 2, sample * 0x7FFF, true);
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    if (!window.AudioContext && !window.webkitAudioContext) {
        showError('Your browser does not support Web Audio API.');
        console.error('Web Audio API not supported');
        return;
    }

    // Initialize
    resizeCanvases();
    uploadButton.disabled = true;
});
