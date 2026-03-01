/**
 * Session Recorder v2 — Records the composite video+skeleton overlay
 * by capturing from a canvas that composites video + skeleton.
 */

let mediaRecorder = null;
let recordedChunks = [];
let recordingBlob = null;
let recordingUrl = null;
let compositeCanvas = null;
let compositeCtx = null;
let animFrameId = null;

/**
 * Start recording by compositing video + skeleton canvas
 * @param {HTMLVideoElement} videoEl - The webcam video element
 * @param {HTMLCanvasElement} skeletonCanvas - The canvas with skeleton overlay
 */
export function startRecording(videoEl, skeletonCanvas) {
    if (!videoEl || !window.MediaRecorder) return false;

    try {
        recordedChunks = [];
        recordingBlob = null;
        if (recordingUrl) { URL.revokeObjectURL(recordingUrl); recordingUrl = null; }

        // Create composite canvas
        compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = videoEl.videoWidth || 640;
        compositeCanvas.height = videoEl.videoHeight || 480;
        compositeCtx = compositeCanvas.getContext('2d');

        // Draw loop — composites video + skeleton at ~30fps
        const drawFrame = () => {
            if (!compositeCtx || !videoEl) return;
            compositeCanvas.width = videoEl.videoWidth || 640;
            compositeCanvas.height = videoEl.videoHeight || 480;

            // Draw mirrored video
            compositeCtx.save();
            compositeCtx.scale(-1, 1);
            compositeCtx.drawImage(videoEl, -compositeCanvas.width, 0, compositeCanvas.width, compositeCanvas.height);
            compositeCtx.restore();

            // Draw skeleton overlay on top
            if (skeletonCanvas && skeletonCanvas.width > 0) {
                compositeCtx.save();
                compositeCtx.scale(-1, 1);
                compositeCtx.drawImage(skeletonCanvas, -compositeCanvas.width, 0, compositeCanvas.width, compositeCanvas.height);
                compositeCtx.restore();
            }

            animFrameId = requestAnimationFrame(drawFrame);
        };
        drawFrame();

        // Capture stream from composite canvas
        const stream = compositeCanvas.captureStream(30);

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm')
                ? 'video/webm'
                : 'video/mp4';

        mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.start(500); // 500ms chunks for smoother recording
        return true;
    } catch (err) {
        console.error('Failed to start recording:', err);
        return false;
    }
}

/**
 * Stop recording and finalize the blob
 */
export function stopRecording() {
    return new Promise((resolve) => {
        // Stop the draw loop
        if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }

        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            resolve(recordingUrl);
            return;
        }

        mediaRecorder.onstop = () => {
            const mimeType = mediaRecorder.mimeType || 'video/webm';
            recordingBlob = new Blob(recordedChunks, { type: mimeType });
            if (recordingUrl) URL.revokeObjectURL(recordingUrl);
            recordingUrl = URL.createObjectURL(recordingBlob);
            resolve(recordingUrl);
        };

        mediaRecorder.stop();
    });
}

export function getRecordingUrl() { return recordingUrl; }
export function getRecordingBlob() { return recordingBlob; }

export function clearRecording() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    recordingUrl = null;
    recordingBlob = null;
    recordedChunks = [];
    mediaRecorder = null;
    compositeCanvas = null;
    compositeCtx = null;
}

export function isRecordingSupported() {
    return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
}
