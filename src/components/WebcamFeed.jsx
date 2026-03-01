import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { drawSkeleton, smoothLandmarks, resetSmoothing, isPoseValid } from '../utils/skeletonRenderer';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

/**
 * Webcam Feed — captures user's webcam, runs pose detection,
 * draws color-coded skeleton based on comparison scores.
 */
const WebcamFeed = forwardRef(function WebcamFeed({ isActive, segmentScores, mirrored }, ref) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const landmarkerRef = useRef(null);
    const rafRef = useRef(null);
    const streamRef = useRef(null);
    const lastTimeRef = useRef(-1);
    const currentPoseRef = useRef(null);
    const fpsCountRef = useRef(0);
    const fpsTimerRef = useRef(Date.now());

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fps, setFps] = useState(0);

    useImperativeHandle(ref, () => ({
        getCurrentPose: () => currentPoseRef.current,
        getStream: () => streamRef.current,
        getVideoEl: () => videoRef.current,
        getCanvasEl: () => canvasRef.current,
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
                console.error('Failed to init MediaPipe for webcam:', err);
                setError('Failed to load AI model');
                setLoading(false);
            }
        })();

        return () => {
            stopCamera();
            if (landmarkerRef.current) landmarkerRef.current.close();
            resetSmoothing('user');
        };
    }, []);

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
                audio: false
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
        } catch (err) {
            console.error('Camera error:', err);
            setError('Camera access denied');
        }
    }, []);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        lastTimeRef.current = -1;
        resetSmoothing('user');
    }, []);

    // Detection loop
    const latestScoresRef = useRef(segmentScores);
    latestScoresRef.current = segmentScores;

    const detectPose = useCallback(() => {
        if (!landmarkerRef.current || !videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (video.readyState < 2) {
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

        // FPS
        fpsCountRef.current++;
        const elapsed = Date.now() - fpsTimerRef.current;
        if (elapsed >= 1000) {
            setFps(Math.round(fpsCountRef.current * 1000 / elapsed));
            fpsCountRef.current = 0;
            fpsTimerRef.current = Date.now();
        }

        try {
            const result = landmarkerRef.current.detectForVideo(video, now);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (result.landmarks && result.landmarks.length > 0) {
                const landmarks = smoothLandmarks(result.landmarks[0], 'user');
                currentPoseRef.current = isPoseValid(landmarks) ? landmarks : null;

                // Draw with score-based colors if available
                drawSkeleton(ctx, landmarks, canvas.width, canvas.height,
                    latestScoresRef.current, '#ec4899');
            } else {
                currentPoseRef.current = null;
            }
        } catch (err) { /* timing errors */ }

        rafRef.current = requestAnimationFrame(detectPose);
    }, []);

    // Lifecycle
    useEffect(() => {
        if (isActive && landmarkerRef.current && !loading) {
            startCamera().then(() => {
                rafRef.current = requestAnimationFrame(detectPose);
            });
        } else if (!isActive) {
            stopCamera();
        }
    }, [isActive, loading]);

    const mirrorStyle = mirrored ? { transform: 'scaleX(-1)' } : {};

    return (
        <div className="video-panel" id="user-webcam">
            <video ref={videoRef} autoPlay playsInline muted style={mirrorStyle} />
            <canvas ref={canvasRef} style={mirrorStyle} />

            <span className="panel-label user">🎥 You</span>
            <div className="panel-badge">
                {isActive && (
                    <>
                        <span className="badge badge-live">LIVE</span>
                        <span className="badge">{fps} FPS</span>
                    </>
                )}
            </div>

            {loading && (
                <div className="loading-overlay">
                    <div className="spinner" />
                    <div className="loading-text">Loading AI Model...</div>
                </div>
            )}

            {error && (
                <div className="loading-overlay">
                    <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⚠️</div>
                    <div className="loading-text" style={{ color: '#ef4444' }}>{error}</div>
                </div>
            )}

            {!isActive && !loading && !error && (
                <div className="loading-overlay" style={{ background: 'rgba(0,0,0,0.7)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎥</div>
                    <div className="loading-text">Press Start to begin</div>
                </div>
            )}
        </div>
    );
});

export default WebcamFeed;
