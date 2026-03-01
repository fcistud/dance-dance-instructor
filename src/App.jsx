import { useState, useCallback, useRef, useEffect } from 'react';
import VideoPlayer from './components/VideoPlayer';
import WebcamFeed from './components/WebcamFeed';
import UserVideo from './components/UserVideo';
import ScoreDisplay from './components/ScoreDisplay';
import SessionSummary from './components/SessionSummary';
import { comparePoses } from './utils/poseSimilarity';
import {
    generateVoiceCue,
    setAudioCoachEnabled,
    setAudioCoachVolume,
    resetAudioCoach,
    initVoices
} from './utils/audioCoach';
import { startRecording, stopRecording, clearRecording } from './utils/sessionRecorder';

const VIEWS = { PRACTICE: 'practice', SUMMARY: 'summary' };

const clampVolume = (value) => Math.max(0, Math.min(1, Math.round(value * 10) / 10));

function getInitialXp() {
    try {
        return Number(localStorage.getItem('improve_ai_xp') || 0);
    } catch {
        return 0;
    }
}

export default function App() {
    const [view, setView] = useState(VIEWS.PRACTICE);
    const [videoFile, setVideoFile] = useState(null);
    const [videoName, setVideoName] = useState('');
    const [isActive, setIsActive] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [mirrored, setMirrored] = useState(true);
    const [comparison, setComparison] = useState(null);
    const [sessionData, setSessionData] = useState([]);
    const [sessionTime, setSessionTime] = useState(0);
    const [voiceCoach, setVoiceCoach] = useState(true);
    const [coachMuted, setCoachMuted] = useState(false);
    const [coachVolume, setCoachVolume] = useState(0.7);
    const [referenceMuted, setReferenceMuted] = useState(false);
    const [referenceVolume, setReferenceVolume] = useState(0.8);
    const [recordingUrl, setRecordingUrl] = useState(null);
    const [inputMode, setInputMode] = useState('webcam');
    const [userVideoFile, setUserVideoFile] = useState(null);
    const [statusMessage, setStatusMessage] = useState('Upload a reference video, then press Start.');
    const [combo, setCombo] = useState(0);
    const [xp, setXp] = useState(getInitialXp);

    const videoPlayerRef = useRef(null);
    const webcamRef = useRef(null);
    const userVideoRef = useRef(null);
    const comparisonLoopRef = useRef(null);
    const sessionTimerRef = useRef(null);
    const sessionDataRef = useRef([]);
    const sampleCountRef = useRef(0);
    const stoppingRef = useRef(false);

    const clearSessionLoops = useCallback(() => {
        if (comparisonLoopRef.current) {
            clearInterval(comparisonLoopRef.current);
            comparisonLoopRef.current = null;
        }
        if (sessionTimerRef.current) {
            clearInterval(sessionTimerRef.current);
            sessionTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        setAudioCoachEnabled(voiceCoach && !coachMuted);
    }, [voiceCoach, coachMuted]);

    useEffect(() => {
        setAudioCoachVolume(coachMuted ? 0 : coachVolume);
    }, [coachMuted, coachVolume]);

    useEffect(() => {
        try {
            localStorage.setItem('improve_ai_xp', String(Math.max(0, Math.floor(xp))));
        } catch {
            // ignore storage errors
        }
    }, [xp]);

    const handleFileUpload = useCallback((file) => {
        if (!file || !file.type.startsWith('video/')) return;
        setVideoFile(file);
        setVideoName(file.name);
        setComparison(null);
        setSessionTime(0);
        setSessionData([]);
        sessionDataRef.current = [];
        setIsActive(false);
        setView(VIEWS.PRACTICE);
        setStatusMessage('Reference loaded. Press Start when ready.');
    }, []);

    const handleRefFileInput = (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileUpload(file);
    };

    const handleUserVideoUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('video/')) return;
        setUserVideoFile(file);
        setInputMode('video');
        setStatusMessage('Your video is loaded and ready for synchronized playback.');
    };

    const handleStart = useCallback(() => {
        if (!videoFile) {
            setStatusMessage('Upload a reference video first.');
            return;
        }

        if (inputMode === 'video' && !userVideoFile) {
            setStatusMessage('Upload your own video or switch to webcam mode.');
            return;
        }

        setView(VIEWS.PRACTICE);
        setIsActive(true);
        setSessionData([]);
        sessionDataRef.current = [];
        setComparison(null);
        setSessionTime(0);
        setCombo(0);
        sampleCountRef.current = 0;
        stoppingRef.current = false;
        resetAudioCoach();
        initVoices();
        clearRecording();
        setRecordingUrl(null);
        setStatusMessage('Session live. Match timing and body shape.');

        if (videoPlayerRef.current) {
            videoPlayerRef.current.seekTo(0);
            videoPlayerRef.current.play();
        }

        if (inputMode === 'video' && userVideoRef.current) {
            userVideoRef.current.seekTo(0);
            userVideoRef.current.play();
        }

        if (inputMode === 'webcam') {
            setTimeout(() => {
                const videoEl = webcamRef.current?.getVideoEl();
                const canvasEl = webcamRef.current?.getCanvasEl();
                if (videoEl) startRecording(videoEl, canvasEl);
            }, 700);
        }

        clearSessionLoops();

        sessionTimerRef.current = setInterval(() => {
            setSessionTime((t) => t + 1);
        }, 1000);

        comparisonLoopRef.current = setInterval(() => {
            const refPose = videoPlayerRef.current?.getCurrentPose();
            const userSourceRef = inputMode === 'video' ? userVideoRef : webcamRef;
            const userPose = userSourceRef.current?.getCurrentPose();

            if (!refPose || !userPose) return;

            const result = comparePoses(refPose, userPose);
            if (!result) return;

            setComparison(result);
            generateVoiceCue(result, refPose, userPose);

            sampleCountRef.current += 1;
            if (sampleCountRef.current % 5 !== 0) return;

            const frame = {
                ...result,
                refLandmarks: refPose,
                userLandmarks: userPose,
            };

            setSessionData((prev) => {
                const next = [...prev, frame];
                sessionDataRef.current = next;
                return next;
            });

            const gain =
                result.overall >= 85 ? 5 :
                    result.overall >= 70 ? 3 :
                        result.overall >= 55 ? 2 : 1;
            setXp((prev) => prev + gain);
            setCombo((prev) => (result.overall >= 68 ? prev + 1 : 0));
        }, 120);
    }, [clearSessionLoops, inputMode, userVideoFile, videoFile]);

    const handleStop = useCallback(async () => {
        if (stoppingRef.current) return;
        stoppingRef.current = true;

        resetAudioCoach();
        clearSessionLoops();

        if (videoPlayerRef.current) videoPlayerRef.current.pause();
        if (userVideoRef.current) userVideoRef.current.pause();

        const recUrl = await stopRecording();
        if (recUrl) setRecordingUrl(recUrl);

        setIsActive(false);
        setView(VIEWS.SUMMARY);
        setStatusMessage('Session ended. Review your analytics and replay weak moments.');
        stoppingRef.current = false;
    }, [clearSessionLoops]);

    useEffect(() => {
        return () => {
            clearSessionLoops();
            resetAudioCoach();
        };
    }, [clearSessionLoops]);

    useEffect(() => {
        if (!isActive) return;

        const checkEnd = setInterval(() => {
            const refVideo = videoPlayerRef.current?.getVideo();
            if (refVideo && refVideo.ended) {
                handleStop();
            }
        }, 400);

        return () => clearInterval(checkEnd);
    }, [handleStop, isActive]);

    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const startDisabled = !videoFile || (inputMode === 'video' && !userVideoFile);
    const baseUrl = import.meta.env.BASE_URL || '/';

    const toggleCoachVoice = () => {
        if (coachMuted) {
            setCoachMuted(false);
            return;
        }
        setVoiceCoach((prev) => !prev);
    };

    return (
        <div className="app">
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
                        className="nav-btn"
                        onClick={() => {
                            if (isActive) handleStop();
                            window.location.href = baseUrl;
                        }}
                    >
                        Home
                    </button>
                    <button
                        className={`nav-btn ${view === VIEWS.PRACTICE ? 'active' : ''}`}
                        onClick={() => setView(VIEWS.PRACTICE)}
                    >
                        Practice
                    </button>
                </nav>
            </header>

            {view === VIEWS.PRACTICE && (
                <div className="fade-in">
                    <div className="split-screen">
                        <VideoPlayer
                            ref={videoPlayerRef}
                            videoFile={videoFile}
                            speed={speed}
                            muted={referenceMuted}
                            volume={referenceVolume}
                            onToggleMute={() => setReferenceMuted((m) => !m)}
                            onVolumeDown={() => setReferenceVolume((v) => clampVolume(v - 0.1))}
                            onVolumeUp={() => setReferenceVolume((v) => clampVolume(v + 0.1))}
                        />
                        {inputMode === 'webcam' ? (
                            <WebcamFeed
                                ref={webcamRef}
                                isActive={isActive}
                                segmentScores={comparison?.segments}
                                mirrored={mirrored}
                                coachMuted={coachMuted || !voiceCoach}
                                onToggleCoachMute={() => setCoachMuted((m) => !m)}
                                onCoachVolumeDown={() => setCoachVolume((v) => clampVolume(v - 0.1))}
                                onCoachVolumeUp={() => setCoachVolume((v) => clampVolume(v + 0.1))}
                            />
                        ) : (
                            <UserVideo
                                ref={userVideoRef}
                                videoFile={userVideoFile}
                                isActive={isActive}
                                segmentScores={comparison?.segments}
                                speed={speed}
                                coachMuted={coachMuted || !voiceCoach}
                                onToggleCoachMute={() => setCoachMuted((m) => !m)}
                                onCoachVolumeDown={() => setCoachVolume((v) => clampVolume(v - 0.1))}
                                onCoachVolumeUp={() => setCoachVolume((v) => clampVolume(v + 0.1))}
                            />
                        )}
                    </div>

                    <ScoreDisplay comparison={comparison} />

                    <div className="controls-bar card" style={{ padding: '12px 20px' }}>
                        <div className="controls-group">
                            {isActive ? (
                                <button className="btn btn-danger" onClick={handleStop} id="stop-btn">
                                    ⏹ End Session
                                </button>
                            ) : (
                                <button
                                    className="btn btn-primary btn-lg"
                                    onClick={handleStart}
                                    id="start-btn"
                                    disabled={startDisabled}
                                    style={{ opacity: startDisabled ? 0.6 : 1 }}
                                >
                                    ▶ Start Dancing
                                </button>
                            )}

                            <button
                                className="btn btn-outline"
                                onClick={() => document.getElementById('file-input-practice')?.click()}
                            >
                                📁 Ref Video
                            </button>
                            <input
                                id="file-input-practice"
                                type="file"
                                accept="video/*"
                                onChange={handleRefFileInput}
                                style={{ display: 'none' }}
                            />

                            <div className="mode-toggle">
                                <button
                                    className={`mode-btn ${inputMode === 'webcam' ? 'active' : ''}`}
                                    onClick={() => setInputMode('webcam')}
                                >
                                    📷 Webcam
                                </button>
                                <button
                                    className={`mode-btn ${inputMode === 'video' ? 'active' : ''}`}
                                    onClick={() => {
                                        setInputMode('video');
                                        if (!userVideoFile) document.getElementById('user-video-input')?.click();
                                    }}
                                >
                                    📤 Upload Video
                                </button>
                            </div>
                            <input
                                id="user-video-input"
                                type="file"
                                accept="video/*"
                                onChange={handleUserVideoUpload}
                                style={{ display: 'none' }}
                            />
                        </div>

                        <div className="controls-group">
                            {[0.5, 0.75, 1].map((value) => (
                                <button
                                    key={value}
                                    className={`speed-btn ${speed === value ? 'active' : ''}`}
                                    onClick={() => setSpeed(value)}
                                >
                                    {value}×
                                </button>
                            ))}

                            <button
                                className={`toggle-btn ${mirrored ? 'active' : ''}`}
                                onClick={() => setMirrored((m) => !m)}
                            >
                                🪞 Mirror
                            </button>

                            <button
                                className={`toggle-btn ${(voiceCoach && !coachMuted) ? 'active' : ''}`}
                                onClick={toggleCoachVoice}
                                title="Toggle voice coach"
                            >
                                {(voiceCoach && !coachMuted) ? '🎙 Coach' : '🎙 Muted'}
                            </button>
                        </div>

                        <div className="controls-group controls-meta">
                            {isActive && <span className="timer">⏱ {formatTime(sessionTime)}</span>}
                            <span className="meta-pill">XP {Math.floor(xp)}</span>
                            <span className="meta-pill combo-pill">Combo x{combo}</span>
                            {videoName && (
                                <span className="track-name">
                                    🎵 {videoName}
                                </span>
                            )}
                        </div>
                    </div>

                    <p className="status-line">{statusMessage}</p>
                </div>
            )}

            {view === VIEWS.SUMMARY && (
                <SessionSummary
                    sessionData={sessionData}
                    onClose={() => setView(VIEWS.PRACTICE)}
                    recordingUrl={recordingUrl}
                    videoFile={videoFile}
                    userVideoFile={userVideoFile}
                />
            )}
        </div>
    );
}
