import { useState, useCallback, useRef, useEffect } from 'react';
import VideoPlayer from './components/VideoPlayer';
import WebcamFeed from './components/WebcamFeed';
import UserVideo from './components/UserVideo';
import ScoreDisplay from './components/ScoreDisplay';
import SessionSummary from './components/SessionSummary';
import { comparePoses } from './utils/poseSimilarity';
import { generateVoiceCue, setAudioCoachEnabled, resetAudioCoach, initVoices } from './utils/audioCoach';
import { startRecording, stopRecording, clearRecording } from './utils/sessionRecorder';

const VIEWS = { WELCOME: 'welcome', PRACTICE: 'practice', SUMMARY: 'summary' };

export default function App() {
    const [view, setView] = useState(VIEWS.WELCOME);
    const [videoFile, setVideoFile] = useState(null);
    const [videoName, setVideoName] = useState('');
    const [isActive, setIsActive] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [mirrored, setMirrored] = useState(true);
    const [comparison, setComparison] = useState(null);
    const [sessionData, setSessionData] = useState([]);
    const [sessionTime, setSessionTime] = useState(0);
    const [voiceCoach, setVoiceCoach] = useState(true);
    const [recordingUrl, setRecordingUrl] = useState(null);
    const [inputMode, setInputMode] = useState('webcam'); // 'webcam' or 'video'
    const [userVideoFile, setUserVideoFile] = useState(null);

    const videoPlayerRef = useRef(null);
    const webcamRef = useRef(null);
    const userVideoRef = useRef(null);
    const comparisonLoopRef = useRef(null);
    const sessionTimerRef = useRef(null);
    const sampleCountRef = useRef(0);
    const [dragging, setDragging] = useState(false);

    // ─── File Upload ───
    const handleFileUpload = useCallback((file) => {
        if (!file || !file.type.startsWith('video/')) return;
        setVideoFile(file);
        setVideoName(file.name);
        setView(VIEWS.PRACTICE);
        setSessionData([]);
        setComparison(null);
        setSessionTime(0);
        setIsActive(false);
    }, []);

    const handleFileInput = (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileUpload(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileUpload(file);
    };

    // ─── Start / Stop Session ───
    const handleStart = useCallback(() => {
        setIsActive(true);
        setSessionData([]);
        setComparison(null);
        setSessionTime(0);
        sampleCountRef.current = 0;
        sessionDataRef.current = [];
        resetAudioCoach();
        initVoices();
        clearRecording();
        setRecordingUrl(null);

        // Start reference video
        if (videoPlayerRef.current) {
            videoPlayerRef.current.seekTo(0);
            videoPlayerRef.current.play();
        }

        // If video mode, start user video in sync
        if (inputMode === 'video' && userVideoRef.current) {
            userVideoRef.current.seekTo(0);
            userVideoRef.current.play();
        }

        // Start recording webcam composite (video + skeleton overlay)
        if (inputMode === 'webcam') {
            setTimeout(() => {
                const videoEl = webcamRef.current?.getVideoEl();
                const canvasEl = webcamRef.current?.getCanvasEl();
                if (videoEl) startRecording(videoEl, canvasEl);
            }, 800);
        }

        // Session timer
        sessionTimerRef.current = setInterval(() => {
            setSessionTime(t => t + 1);
        }, 1000);

        // Comparison loop — compare poses every ~100ms
        comparisonLoopRef.current = setInterval(() => {
            const refPose = videoPlayerRef.current?.getCurrentPose();
            const userRef = inputMode === 'video' ? userVideoRef : webcamRef;
            const userPose = userRef.current?.getCurrentPose();

            if (refPose && userPose) {
                const result = comparePoses(refPose, userPose);
                if (result) {
                    setComparison(result);
                    generateVoiceCue(result, refPose, userPose);

                    sampleCountRef.current++;
                    if (sampleCountRef.current % 3 === 0) {
                        setSessionData(prev => {
                            const next = [...prev, result];
                            sessionDataRef.current = next;
                            return next;
                        });
                    }
                }
            }
        }, 100);
    }, [inputMode]);

    // Use a ref so handleStop always sees latest sessionData
    const sessionDataRef = useRef([]);

    const handleStop = useCallback(async () => {
        resetAudioCoach();

        // Stop timers and comparison FIRST
        if (comparisonLoopRef.current) {
            clearInterval(comparisonLoopRef.current);
            comparisonLoopRef.current = null;
        }
        if (sessionTimerRef.current) {
            clearInterval(sessionTimerRef.current);
            sessionTimerRef.current = null;
        }

        if (videoPlayerRef.current) {
            videoPlayerRef.current.pause();
        }
        if (userVideoRef.current) {
            userVideoRef.current.pause();
        }

        // Stop recording BEFORE killing the webcam stream
        const recUrl = await stopRecording();
        if (recUrl) setRecordingUrl(recUrl);

        // NOW deactivate webcam (kills stream)
        setIsActive(false);

        // Show summary if we have enough data (use ref for latest)
        if (sessionDataRef.current.length > 5) {
            setView(VIEWS.SUMMARY);
        }
    }, []); // No dependencies — uses refs

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (comparisonLoopRef.current) clearInterval(comparisonLoopRef.current);
            if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
        };
    }, []);

    // Auto-stop when reference video ends
    useEffect(() => {
        if (!isActive) return;

        const checkEnd = setInterval(() => {
            const video = videoPlayerRef.current?.getVideo();
            if (video && video.ended) {
                handleStop();
            }
        }, 500);

        return () => clearInterval(checkEnd);
    }, [isActive, handleStop]);

    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div className="app">
            {/* Header */}
            <header className="app-header">
                <div className="logo">
                    <div className="logo-icon">💃</div>
                    <div>
                        <div className="logo-text">Improve.ai</div>
                        <div className="logo-tag">Coach Studio</div>
                    </div>
                </div>
                <nav className="nav">
                    <button
                        className={`nav-btn ${view === VIEWS.WELCOME ? 'active' : ''}`}
                        onClick={() => { setIsActive(false); setView(VIEWS.WELCOME); }}
                    >Home</button>
                    <button
                        className={`nav-btn ${view === VIEWS.PRACTICE ? 'active' : ''}`}
                        onClick={() => videoFile && setView(VIEWS.PRACTICE)}
                    >Practice</button>
                </nav>
            </header>

            {/* ─── Welcome ─── */}
            {view === VIEWS.WELCOME && (
                <div className="welcome fade-in" id="welcome">
                    <div className="welcome-icon">💃</div>
                    <h1 className="welcome-title">Improve.ai Coach Studio</h1>
                    <p className="welcome-sub">
                        See yourself dance better — in real time. Upload any dance video, and our AI will
                        compare your movements body-part by body-part, showing you exactly where to improve.
                        No app install needed, all AI runs in your browser.
                    </p>

                    <div className="features">
                        <div className="card feature">
                            <div className="feature-icon">🎯</div>
                            <div className="feature-title">Body-Part Scoring</div>
                            <div className="feature-desc">See exactly which limbs match and which need work — arms, legs, torso, head</div>
                        </div>
                        <div className="card feature">
                            <div className="feature-icon">⚡</div>
                            <div className="feature-title">Real-Time Feedback</div>
                            <div className="feature-desc">Live side-by-side comparison at 20+ FPS with color-coded skeleton</div>
                        </div>
                        <div className="card feature">
                            <div className="feature-icon">🔒</div>
                            <div className="feature-title">Privacy First</div>
                            <div className="feature-desc">All AI runs in your browser — your video never leaves your device</div>
                        </div>
                    </div>

                    {/* Upload zone */}
                    <div
                        className={`upload-zone ${dragging ? 'dragging' : ''}`}
                        onClick={() => document.getElementById('file-input').click()}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        id="upload-zone"
                    >
                        <div className="upload-icon">📁</div>
                        <div className="upload-text">Drop a dance video here</div>
                        <div className="upload-hint">or click to browse • MP4, MOV, WebM</div>
                        <input
                            id="file-input"
                            type="file"
                            accept="video/*"
                            onChange={handleFileInput}
                            style={{ display: 'none' }}
                        />
                    </div>

                    <div style={{
                        marginTop: '40px',
                        display: 'flex',
                        gap: '28px',
                        fontSize: '13px',
                        color: 'var(--text-muted)',
                        flexWrap: 'wrap',
                        justifyContent: 'center'
                    }}>
                        <div>🆓 100% free to use</div>
                        <div>📷 Just a webcam needed</div>
                        <div>🧠 33-point body tracking</div>
                    </div>
                </div>
            )}

            {/* ─── Practice ─── */}
            {view === VIEWS.PRACTICE && (
                <div className="fade-in">
                    {/* Split screen */}
                    <div className="split-screen">
                        <VideoPlayer
                            ref={videoPlayerRef}
                            videoFile={videoFile}
                            speed={speed}
                        />
                        {inputMode === 'webcam' ? (
                            <WebcamFeed
                                ref={webcamRef}
                                isActive={isActive}
                                segmentScores={comparison?.segments}
                                mirrored={mirrored}
                            />
                        ) : (
                            <UserVideo
                                ref={userVideoRef}
                                videoFile={userVideoFile}
                                isActive={isActive}
                                segmentScores={comparison?.segments}
                                speed={speed}
                            />
                        )}
                    </div>

                    {/* Score Display */}
                    <ScoreDisplay comparison={comparison} />

                    {/* Controls */}
                    <div className="controls-bar card" style={{ padding: '12px 20px' }}>
                        <div className="controls-group">
                            {isActive ? (
                                <button className="btn btn-danger" onClick={handleStop} id="stop-btn">
                                    ⏹ Stop Session
                                </button>
                            ) : (
                                <button className="btn btn-primary btn-lg" onClick={handleStart} id="start-btn">
                                    ▶ Start Dancing
                                </button>
                            )}

                            {/* New ref video */}
                            <button
                                className="btn btn-outline"
                                onClick={() => {
                                    setIsActive(false);
                                    document.getElementById('file-input-practice').click();
                                }}
                            >
                                📁 Ref Video
                            </button>
                            <input
                                id="file-input-practice"
                                type="file"
                                accept="video/*"
                                onChange={handleFileInput}
                                style={{ display: 'none' }}
                            />

                            {/* Input mode toggle */}
                            <div style={{
                                display: 'flex', borderRadius: '10px', overflow: 'hidden',
                                border: '1px solid var(--border)', fontSize: '13px'
                            }}>
                                <button
                                    style={{
                                        padding: '6px 14px', border: 'none', cursor: 'pointer',
                                        background: inputMode === 'webcam' ? 'var(--accent-1)' : 'transparent',
                                        color: inputMode === 'webcam' ? '#fff' : 'var(--text-muted)',
                                        fontWeight: inputMode === 'webcam' ? 600 : 400, fontFamily: 'var(--font)',
                                    }}
                                    onClick={() => setInputMode('webcam')}
                                >📷 Webcam</button>
                                <button
                                    style={{
                                        padding: '6px 14px', border: 'none', cursor: 'pointer',
                                        borderLeft: '1px solid var(--border)',
                                        background: inputMode === 'video' ? 'var(--accent-1)' : 'transparent',
                                        color: inputMode === 'video' ? '#fff' : 'var(--text-muted)',
                                        fontWeight: inputMode === 'video' ? 600 : 400, fontFamily: 'var(--font)',
                                    }}
                                    onClick={() => {
                                        setInputMode('video');
                                        if (!userVideoFile) document.getElementById('user-video-input').click();
                                    }}
                                >📤 Upload Video</button>
                            </div>
                            <input
                                id="user-video-input"
                                type="file"
                                accept="video/*"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) { setUserVideoFile(f); setInputMode('video'); }
                                }}
                                style={{ display: 'none' }}
                            />
                        </div>

                        <div className="controls-group">
                            {/* Speed */}
                            {[0.5, 0.75, 1].map(s => (
                                <button
                                    key={s}
                                    className={`speed-btn ${speed === s ? 'active' : ''}`}
                                    onClick={() => setSpeed(s)}
                                >
                                    {s}×
                                </button>
                            ))}

                            {/* Mirror */}
                            <button
                                className={`toggle-btn ${mirrored ? 'active' : ''}`}
                                onClick={() => setMirrored(!mirrored)}
                            >
                                🪞 Mirror
                            </button>

                            {/* Voice Coach */}
                            <button
                                className={`toggle-btn ${voiceCoach ? 'active' : ''}`}
                                onClick={() => {
                                    const next = !voiceCoach;
                                    setVoiceCoach(next);
                                    setAudioCoachEnabled(next);
                                }}
                            >
                                {voiceCoach ? '🔊' : '🔇'} Voice Coach
                            </button>
                        </div>

                        <div className="controls-group">
                            {isActive && <span className="timer">⏱ {formatTime(sessionTime)}</span>}
                            {videoName && (
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    🎵 {videoName}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Summary ─── */}
            {view === VIEWS.SUMMARY && (
                <SessionSummary
                    sessionData={sessionData}
                    onClose={() => setView(VIEWS.PRACTICE)}
                    recordingUrl={recordingUrl}
                    videoFile={videoFile}
                />
            )}
        </div>
    );
}
