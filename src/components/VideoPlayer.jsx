import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { drawSkeleton, smoothLandmarks, resetSmoothing, isPoseValid } from '../utils/skeletonRenderer';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

/**
 * Reference Video Player — loads a video file, extracts poses from each frame, draws skeleton.
 * Exposes getCurrentPose() for the parent to use for comparison.
 */
const VideoPlayer = forwardRef(function VideoPlayer({
    videoFile,
    speed,
    muted,
    volume,
    onToggleMute,
    onVolumeDown,
    onVolumeUp
}, ref) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const landmarkerRef = useRef(null);
    const rafRef = useRef(null);
    const lastTimeRef = useRef(-1);
    const currentPoseRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Expose getCurrentPose to parent
    useImperativeHandle(ref, () => ({
        getCurrentPose: () => currentPoseRef.current,
        getVideo: () => videoRef.current,
        play: () => videoRef.current?.play(),
        pause: () => videoRef.current?.pause(),
        isPaused: () => videoRef.current?.paused ?? true,
        seekTo: (t) => { if (videoRef.current) videoRef.current.currentTime = t; },
        getDuration: () => videoRef.current?.duration || 0,
        getCurrentTime: () => videoRef.current?.currentTime || 0,
    }));

    // Init MediaPipe
    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const vision = await FilesetResolver.forVisionTasks(WASM_URL);
                const landmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
                    runningMode: 'VIDEO',
                    numPoses: 1,
                    minPoseDetectionConfidence: 0.5,
                    minPosePresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                landmarkerRef.current = landmarker;
                setLoading(false);
            } catch (err) {
                console.error('Failed to init MediaPipe for reference:', err);
                setError('Failed to load AI model');
                setLoading(false);
            }
        })();

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (landmarkerRef.current) landmarkerRef.current.close();
            resetSmoothing('ref');
        };
    }, []);

    // Load video file
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (!videoFile) {
            video.removeAttribute('src');
            video.load();
            currentPoseRef.current = null;
            return;
        }

        const url = URL.createObjectURL(videoFile);
        video.src = url;
        video.load();
        resetSmoothing('ref');

        return () => URL.revokeObjectURL(url);
    }, [videoFile]);

    // Speed control
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = speed || 1;
        }
    }, [speed]);

    useEffect(() => {
        if (!videoRef.current) return;
        videoRef.current.muted = Boolean(muted);
        videoRef.current.volume = typeof volume === 'number' ? volume : 0.8;
    }, [muted, volume]);

    // Real-time detection loop (runs during playback)
    const detectPose = useCallback(() => {
        if (!landmarkerRef.current || !videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (video.readyState < 2 || video.paused || video.ended) {
            rafRef.current = requestAnimationFrame(detectPose);
            return;
        }

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        const now = performance.now();
        if (now === lastTimeRef.current) {
            rafRef.current = requestAnimationFrame(detectPose);
            return;
        }
        lastTimeRef.current = now;

        try {
            const result = landmarkerRef.current.detectForVideo(video, now);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (result.landmarks && result.landmarks.length > 0) {
                const landmarks = smoothLandmarks(result.landmarks[0], 'ref');
                currentPoseRef.current = isPoseValid(landmarks) ? landmarks : null;
                drawSkeleton(ctx, landmarks, canvas.width, canvas.height, null, '#38bdf8');
            } else {
                currentPoseRef.current = null;
            }
        } catch (err) {
            // Timing errors — ignore
        }

        rafRef.current = requestAnimationFrame(detectPose);
    }, []);

    // Start detection loop when video plays
    useEffect(() => {
        if (loading) return;
        const video = videoRef.current;
        if (!video) return;

        const onPlay = () => {
            rafRef.current = requestAnimationFrame(detectPose);
        };
        const onPause = () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('ended', onPause);

        // Also start if already playing
        if (!video.paused) onPlay();

        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('ended', onPause);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [loading, detectPose]);

    return (
        <div className="video-panel" id="ref-video">
            <video
                ref={videoRef}
                playsInline
                style={{ background: '#000' }}
            />
            <canvas ref={canvasRef} />

            <span className="panel-label ref">📹 Reference</span>
            <div className="panel-audio">
                <button type="button" className="audio-icon-btn" onClick={onToggleMute} title="Mute reference audio">
                    {muted ? '🔇' : '🔊'}
                </button>
                <button type="button" className="audio-icon-btn" onClick={onVolumeDown} title="Lower reference volume">−</button>
                <button type="button" className="audio-icon-btn" onClick={onVolumeUp} title="Raise reference volume">+</button>
            </div>

            {!videoFile && !loading && !error && (
                <div className="loading-overlay" style={{ background: 'rgba(0,0,0,0.76)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📁</div>
                    <div className="loading-text">Upload a reference video</div>
                </div>
            )}

            {loading && (
                <div className="loading-overlay">
                    <div className="spinner" />
                    <div className="loading-text">Loading pose model...</div>
                </div>
            )}

            {error && (
                <div className="loading-overlay">
                    <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⚠️</div>
                    <div className="loading-text" style={{ color: '#ef4444' }}>{error}</div>
                </div>
            )}
        </div>
    );
});

export default VideoPlayer;
