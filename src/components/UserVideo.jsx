import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { drawSkeleton, smoothLandmarks, resetSmoothing, isPoseValid } from '../utils/skeletonRenderer';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

/**
 * UserVideo — Loads an uploaded video of the user dancing, runs pose detection,
 * draws color-coded skeleton. Used as alternative to webcam for analysis mode.
 */
const UserVideo = forwardRef(function UserVideo({ videoFile, isActive, segmentScores, speed }, ref) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const landmarkerRef = useRef(null);
    const rafRef = useRef(null);
    const lastTimeRef = useRef(-1);
    const currentPoseRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useImperativeHandle(ref, () => ({
        getCurrentPose: () => currentPoseRef.current,
        getStream: () => null, // No stream for uploaded video
        getVideo: () => videoRef.current,
        play: () => videoRef.current?.play(),
        pause: () => videoRef.current?.pause(),
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
                console.error('Failed to init MediaPipe for user video:', err);
                setError('Failed to load AI model');
                setLoading(false);
            }
        })();

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (landmarkerRef.current) landmarkerRef.current.close();
            resetSmoothing('userVideo');
        };
    }, []);

    // Load video
    useEffect(() => {
        if (!videoFile || !videoRef.current) return;
        const url = URL.createObjectURL(videoFile);
        videoRef.current.src = url;
        videoRef.current.load();
        resetSmoothing('userVideo');
        return () => URL.revokeObjectURL(url);
    }, [videoFile]);

    // Speed
    useEffect(() => {
        if (videoRef.current) videoRef.current.playbackRate = speed || 1;
    }, [speed]);

    // Score ref for latest
    const latestScoresRef = useRef(segmentScores);
    latestScoresRef.current = segmentScores;

    // Detection loop
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
                const landmarks = smoothLandmarks(result.landmarks[0], 'userVideo');
                currentPoseRef.current = isPoseValid(landmarks) ? landmarks : null;
                drawSkeleton(ctx, landmarks, canvas.width, canvas.height,
                    latestScoresRef.current, '#ec4899');
            } else {
                currentPoseRef.current = null;
            }
        } catch (err) { /* timing */ }

        rafRef.current = requestAnimationFrame(detectPose);
    }, []);

    // Start/stop detection when video plays
    useEffect(() => {
        if (!videoFile || loading) return;
        const video = videoRef.current;
        if (!video) return;

        const onPlay = () => { rafRef.current = requestAnimationFrame(detectPose); };
        const onPause = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('ended', onPause);

        if (!video.paused) onPlay();

        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('ended', onPause);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [videoFile, loading, detectPose]);

    if (!videoFile) return null;

    return (
        <div className="video-panel" id="user-video">
            <video ref={videoRef} playsInline muted style={{ background: '#000' }} />
            <canvas ref={canvasRef} />

            <span className="panel-label user">🎥 Your Video</span>

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
        </div>
    );
});

export default UserVideo;
