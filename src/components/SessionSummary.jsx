import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { BODY_SEGMENTS, scoreToColor } from '../utils/poseSimilarity';
import { analyzeSession } from '../utils/feedbackEngine';
import {
    generateAIFeedback,
    getStoredApiKey,
    storeApiKey,
    getStoredBackendUrl,
    storeBackendUrl
} from '../utils/nemotronAI';

/**
 * Session Summary — Grouped mistakes, interactive chart, recording playback, Nemotron AI.
 */
export default function SessionSummary({ sessionData, onClose, recordingUrl, videoFile, userVideoFile }) {
    const analysis = useMemo(() => analyzeSession(sessionData), [sessionData]);
    const [selectedPoint, setSelectedPoint] = useState(null);
    const [aiResponse, setAiResponse] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [apiKey, setApiKey] = useState(getStoredApiKey());
    const [backendUrl, setBackendUrl] = useState(getStoredBackendUrl());
    const [showKeyInput, setShowKeyInput] = useState(false);
    const [leaderboard, setLeaderboard] = useState([]);

    const refVideoRef = useRef(null);
    const recVideoRef = useRef(null);
    const userUploadUrl = useMemo(() => userVideoFile ? URL.createObjectURL(userVideoFile) : null, [userVideoFile]);
    const recVideoUrl = useMemo(() => recordingUrl || userUploadUrl || null, [recordingUrl, userUploadUrl]);
    const refVideoUrl = useMemo(() => videoFile ? URL.createObjectURL(videoFile) : null, [videoFile]);

    // Cleanup URLs
    useEffect(() => {
        return () => {
            if (refVideoUrl) URL.revokeObjectURL(refVideoUrl);
            if (userUploadUrl) URL.revokeObjectURL(userUploadUrl);
        };
    }, [refVideoUrl, userUploadUrl]);

    // Chart data with timestamps
    const chartData = useMemo(() => {
        if (!sessionData || sessionData.length === 0) return [];
        const sampleInterval = Math.max(1, Math.floor(sessionData.length / 80));
        const startTime = sessionData[0].timestamp;

        return sessionData
            .filter((_, i) => i % sampleInterval === 0)
            .map((d, idx) => {
                const sec = (d.timestamp - startTime) / 1000;
                return {
                    time: `${Math.round(sec)}s`,
                    timeSec: sec,
                    score: Math.round(d.overall),
                    index: idx,
                    // Find weakest segment at this point
                    weakest: Object.entries(d.segments)
                        .filter(([_, v]) => v !== null)
                        .sort((a, b) => a[1] - b[1])[0],
                };
            });
    }, [sessionData]);

    // Find dips (local minima)
    const dips = useMemo(() => {
        if (chartData.length < 5) return [];
        const result = [];
        for (let i = 2; i < chartData.length - 2; i++) {
            const pt = chartData[i];
            const before = chartData[i - 1].score;
            const after = chartData[i + 1].score;
            if (pt.score < before && pt.score < after && pt.score < 60) {
                result.push(pt);
            }
        }
        return result.slice(0, 5); // max 5 dips shown
    }, [chartData]);

    const bodyPartRanking = useMemo(() => {
        const stats = analysis?.segmentStats || {};
        return Object.values(stats).sort((a, b) => b.avg - a.avg);
    }, [analysis]);

    const sessionFrames = useMemo(() => {
        if (!sessionData || sessionData.length === 0) return [];
        const start = sessionData[0].timestamp || Date.now();

        const frames = sessionData
            .filter((frame) => frame?.refLandmarks && frame?.userLandmarks)
            .sort((a, b) => a.overall - b.overall)
            .slice(0, 18)
            .map((frame) => ({
                timestamp: Math.max(0, ((frame.timestamp || start) - start) / 1000),
                score: frame.overall,
                ref_landmarks: frame.refLandmarks,
                user_landmarks: frame.userLandmarks,
            }));

        return frames;
    }, [sessionData]);

    // Handle chart click
    const handleChartClick = useCallback((data) => {
        if (!data || !data.activePayload) return;
        const point = data.activePayload[0]?.payload;
        if (!point) return;

        setSelectedPoint(point);

        // Seek videos to that timestamp
        const seekTime = point.timeSec;
        if (refVideoRef.current) {
            refVideoRef.current.currentTime = seekTime;
            refVideoRef.current.pause();
        }
        if (recVideoRef.current) {
            recVideoRef.current.currentTime = seekTime;
            recVideoRef.current.pause();
        }
    }, []);

    // Play from selected point
    const playFromPoint = () => {
        if (refVideoRef.current) refVideoRef.current.play();
        if (recVideoRef.current) recVideoRef.current.play();
    };

    // Seek both videos to a time (used by clickable timestamps in AI feedback)
    const seekToTime = useCallback((seconds) => {
        if (refVideoRef.current) {
            refVideoRef.current.currentTime = seconds;
            refVideoRef.current.pause();
        }
        if (recVideoRef.current) {
            recVideoRef.current.currentTime = seconds;
            recVideoRef.current.pause();
        }
    }, []);

    // Sync playback
    useEffect(() => {
        const ref = refVideoRef.current;
        const rec = recVideoRef.current;
        if (!ref || !rec) return;

        const sync = () => {
            if (Math.abs(ref.currentTime - rec.currentTime) > 0.3) {
                rec.currentTime = ref.currentTime;
            }
        };
        ref.addEventListener('timeupdate', sync);
        return () => ref.removeEventListener('timeupdate', sync);
    }, [refVideoUrl, recVideoUrl]);

    // Nemotron AI feedback
    const handleGetAIFeedback = async () => {
        const personalKey = apiKey.trim();
        const backendOverride = backendUrl.trim();
        setAiLoading(true);
        setAiResponse(null);
        if (personalKey) storeApiKey(personalKey);
        if (backendOverride) storeBackendUrl(backendOverride);

        const result = await generateAIFeedback(
            safeAnalysis,
            personalKey || null,
            sessionFrames,
            backendOverride
        );
        setAiResponse(result || 'Could not get AI feedback. Check backend deployment or your API key and try again.');
        setAiLoading(false);
    };

    useEffect(() => {
        if (!analysis || analysis.overallGrade === 'N/A' || !sessionData?.length) return;

        try {
            const sessionId = `${sessionData[0]?.timestamp || Date.now()}-${sessionData.length}`;
            const key = 'improve_ai_leaderboard';
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            if (!Array.isArray(existing)) return;

            const alreadyExists = existing.some((entry) => entry.id === sessionId);
            const durationSec = Math.max(
                1,
                Math.round(((sessionData[sessionData.length - 1]?.timestamp || Date.now()) - (sessionData[0]?.timestamp || Date.now())) / 1000)
            );

            const next = alreadyExists
                ? existing
                : [
                    ...existing,
                    {
                        id: sessionId,
                        name: 'You',
                        score: Math.round(analysis.overallAvg),
                        grade: analysis.overallGrade?.letter || '-',
                        durationSec,
                        createdAt: Date.now(),
                    },
                ];

            const ranked = next
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    return a.durationSec - b.durationSec;
                })
                .slice(0, 12);

            localStorage.setItem(key, JSON.stringify(ranked));
            setLeaderboard(ranked);
        } catch {
            setLeaderboard([]);
        }
    }, [analysis, sessionData]);

    const hasAnalysis = analysis && analysis.overallGrade !== 'N/A';
    const safeAnalysis = hasAnalysis
        ? analysis
        : {
            overallGrade: { letter: '-', label: 'Insufficient Pose Data', color: 'var(--text-muted)' },
            overallAvg: 0,
            focusAreas: [],
            strengths: [],
            timeline: [],
            tips: [{ icon: '💡', text: 'We could not track enough stable poses this run. Improve lighting, keep full body in frame, and retry.' }],
            segmentStats: {},
        };

    const { overallGrade, overallAvg, focusAreas, strengths, timeline, tips } = safeAnalysis;
    const hasPersonalKey = apiKey.trim().length > 0;
    const userPlaybackLabel = recordingUrl ? 'Your Recording' : 'Your Video';

    return (
        <div className="fade-in" id="session-summary">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.5rem' }}>📊 Session Feedback</h2>
                {onClose && <button className="btn btn-outline" onClick={onClose}>← Back to Practice</button>}
            </div>

            {!hasAnalysis && (
                <div className="card" style={{ marginBottom: '16px', borderLeft: '3px solid #f59e0b' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Pose tracking quality was too low for full analytics in this run. Playback and AI review are still available.
                    </div>
                </div>
            )}

            {/* ─── Overall Grade ─── */}
            <div className="card" style={{ textAlign: 'center', marginBottom: '16px', padding: '32px' }}>
                <div style={{ fontSize: '4rem', fontWeight: 900, color: overallGrade.color }}>{overallGrade.letter}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: overallGrade.color }}>{overallGrade.label}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Average accuracy: {Math.round(overallAvg)}%
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div className="card">
                    <div className="card-title">🥇 Body-Part Ranking</div>
                    {bodyPartRanking.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>No ranking available yet.</p>
                    ) : (
                        bodyPartRanking.map((part, index) => (
                            <div
                                key={`${part.label}-${index}`}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '28px 1fr auto',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '8px 0',
                                    borderBottom: index < bodyPartRanking.length - 1 ? '1px solid var(--border)' : 'none'
                                }}
                            >
                                <span style={{ fontWeight: 700, color: index === 0 ? '#22c55e' : 'var(--text-muted)' }}>
                                    #{index + 1}
                                </span>
                                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                                    {part.emoji} {part.label}
                                </span>
                                <span style={{ fontWeight: 800, color: scoreToColor(part.avg) }}>
                                    {Math.round(part.avg)}%
                                </span>
                            </div>
                        ))
                    )}
                </div>

                <div className="card">
                    <div className="card-title">🏆 Leaderboard</div>
                    {leaderboard.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>No runs recorded yet.</p>
                    ) : (
                        leaderboard.slice(0, 6).map((entry, index) => (
                            <div
                                key={entry.id}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '24px 1fr auto',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 0',
                                    borderBottom: index < Math.min(leaderboard.length, 6) - 1 ? '1px solid var(--border)' : 'none'
                                }}
                            >
                                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{index + 1}</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                    {entry.name} <span style={{ color: 'var(--text-muted)' }}>({entry.grade})</span>
                                </span>
                                <span style={{ fontWeight: 800, color: scoreToColor(entry.score) }}>{entry.score}%</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ─── Interactive Chart ─── */}
            <div className="card" style={{ marginBottom: '16px' }}>
                <div className="card-title">📈 Click anywhere on the chart to see that moment</div>
                <div className="chart-container" style={{ cursor: 'crosshair' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} onClick={handleChartClick}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(95,42,32,0.13)" />
                            <XAxis dataKey="time" tick={{ fill: '#a16558', fontSize: 11 }} />
                            <YAxis domain={[0, 100]} tick={{ fill: '#a16558', fontSize: 11 }} />
                            <Tooltip
                                contentStyle={{
                                    background: '#fff4ee', border: '1px solid rgba(95,42,32,0.22)',
                                    borderRadius: '10px', color: '#31100d', fontSize: '13px'
                                }}
                                formatter={(val) => [`${val}%`, 'Accuracy']}
                            />
                            <Line type="monotone" dataKey="score" stroke="#f24b2f" strokeWidth={2.5} dot={false} name="Accuracy" />

                            {/* Mark the dips as red dots */}
                            {dips.map((dip, i) => (
                                <ReferenceDot
                                    key={i}
                                    x={dip.time}
                                    y={dip.score}
                                    r={6}
                                    fill="#ef4444"
                                    stroke="#fff"
                                    strokeWidth={2}
                                />
                            ))}

                            {/* Selected point */}
                            {selectedPoint && (
                                <ReferenceDot
                                    x={selectedPoint.time}
                                    y={selectedPoint.score}
                                    r={8}
                                    fill="#f24b2f"
                                    stroke="#fff"
                                    strokeWidth={2}
                                />
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Selected point info */}
                {selectedPoint && (
                    <div className="fade-in" style={{
                        marginTop: '12px', padding: '12px 16px', background: 'rgba(242,75,47,0.12)',
                        borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <div>
                            <span style={{ fontWeight: 700 }}>At {selectedPoint.time}: </span>
                            <span style={{ color: scoreToColor(selectedPoint.score) }}>
                                {selectedPoint.score}% accuracy
                            </span>
                            {selectedPoint.weakest && (
                                <span style={{ color: 'var(--text-muted)', marginLeft: '12px' }}>
                                    Weakest: {BODY_SEGMENTS[selectedPoint.weakest[0]]?.emoji} {BODY_SEGMENTS[selectedPoint.weakest[0]]?.label} ({Math.round(selectedPoint.weakest[1])}%)
                                </span>
                            )}
                        </div>
                        {(recVideoUrl || refVideoUrl) && (
                            <button className="btn btn-primary" onClick={playFromPoint} style={{ padding: '6px 16px', fontSize: '13px' }}>
                                ▶ Play from here
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ─── Recording Playback ─── */}
            {(recVideoUrl || refVideoUrl) && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <div className="card-title">🎬 Session Playback — Compare Side by Side</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {refVideoUrl && (
                            <div style={{ position: 'relative' }}>
                                <video
                                    ref={refVideoRef}
                                    src={refVideoUrl}
                                    controls
                                    playsInline
                                    muted
                                    preload="auto"
                                    onError={(e) => console.error('Ref video error:', e)}
                                    style={{ width: '100%', borderRadius: '10px', background: '#000' }}
                                />
                                <span style={{
                                    position: 'absolute', top: '8px', left: '8px', padding: '2px 10px',
                                    borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                                    background: 'rgba(0,0,0,0.7)', color: '#38bdf8'
                                }}>Reference</span>
                            </div>
                        )}
                        {recVideoUrl && (
                            <div style={{ position: 'relative' }}>
                                <video
                                    ref={recVideoRef}
                                    src={recVideoUrl}
                                    controls
                                    playsInline
                                    muted
                                    preload="auto"
                                    onError={(e) => console.error('Rec video error:', e)}
                                    style={{ width: '100%', borderRadius: '10px', background: '#000' }}
                                />
                                <span style={{
                                    position: 'absolute', top: '8px', left: '8px', padding: '2px 10px',
                                    borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                                    background: 'rgba(0,0,0,0.7)', color: '#ec4899'
                                }}>{userPlaybackLabel}</span>
                            </div>
                        )}
                    </div>
                    {!recordingUrl && !userUploadUrl && (
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                            💡 Tip: Your next session will be recorded automatically for playback
                        </p>
                    )}
                </div>
            )}

            {/* ─── Nemotron AI Feedback ─── */}
            <div className="card" style={{ marginBottom: '16px', border: '1px solid rgba(242,122,47,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div className="card-title" style={{ marginBottom: 0 }}>
                        🧠 AI Coach Feedback <span style={{ fontSize: '10px', color: '#f24b2f', fontWeight: 600, marginLeft: '4px' }}>powered by NVIDIA Nemotron + PoseScript</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className="btn btn-outline"
                            onClick={() => setShowKeyInput(v => !v)}
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                            {showKeyInput ? 'Hide Settings' : hasPersonalKey ? 'Edit Personal Key' : 'Connection Settings'}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleGetAIFeedback}
                            disabled={aiLoading}
                            style={{ padding: '6px 16px', fontSize: '13px' }}
                        >
                            {aiLoading ? '⏳ Thinking...' : aiResponse ? '🔄 Refresh' : '✨ Get AI Feedback'}
                        </button>
                    </div>
                </div>

                {showKeyInput && (
                    <div className="fade-in" style={{
                        display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px',
                        padding: '12px', background: 'rgba(242,122,47,0.08)', borderRadius: '10px'
                    }}>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                            Optional overrides for deployment issues: backend URL + personal NVIDIA key.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                type="url"
                                placeholder="Backend URL (e.g. https://your-backend.vercel.app)"
                                value={backendUrl}
                                onChange={(e) => setBackendUrl(e.target.value)}
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: '8px',
                                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '13px'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                type="password"
                                placeholder="Enter personal NVIDIA API key..."
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: '8px',
                                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '13px'
                                }}
                            />
                            <button
                                className="btn btn-outline"
                                onClick={() => {
                                    setApiKey('');
                                    storeApiKey('');
                                }}
                                style={{ padding: '8px 14px', fontSize: '12px' }}
                            >
                                Clear
                            </button>
                        </div>
                        {hasPersonalKey && (
                            <p style={{ margin: 0, fontSize: '12px', color: '#f24b2f' }}>
                                Personal key is ready and will be used only if backend fallback is needed.
                            </p>
                        )}
                    </div>
                )}

                {aiLoading && (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        <div className="spinner" style={{ margin: '0 auto 12px' }} />
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Nemotron is analyzing your session...</div>
                    </div>
                )}

                {aiResponse && !aiLoading && (
                    <div className="fade-in" style={{
                        padding: '16px', background: 'rgba(242,122,47,0.08)', borderRadius: '10px',
                        border: '1px solid rgba(242,122,47,0.15)', lineHeight: 1.7, fontSize: '14px',
                        color: 'var(--text-secondary)',
                    }}>
                        {renderAIFeedback(aiResponse, seekToTime)}
                    </div>
                )}

                {!aiResponse && !aiLoading && (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        Get personalized coaching advice powered by NVIDIA's Nemotron AI model with PoseScript-style body awareness. By default this uses the secure backend key.
                    </p>
                )}
            </div>

            {/* ─── Key Takeaways ─── */}
            <div className="card" style={{ marginBottom: '16px', border: '1px solid rgba(242,75,47,0.22)', background: 'var(--gradient-brand-subtle)' }}>
                <div className="card-title">🎯 Key Takeaways</div>
                {tips.map((tip, i) => (
                    <div key={i} style={{
                        display: 'flex', gap: '12px', alignItems: 'flex-start',
                        padding: '10px 0', borderBottom: i < tips.length - 1 ? '1px solid var(--border)' : 'none'
                    }}>
                        <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{tip.icon}</span>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{tip.text}</p>
                    </div>
                ))}
            </div>

            {/* ─── Focus Areas ─── */}
            {focusAreas.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: '#ef4444' }}>
                        🔴 Areas to Focus On ({focusAreas.length})
                    </h3>
                    {focusAreas.map((area, i) => (
                        <div key={i} className="card" style={{ marginBottom: '12px', borderLeft: `3px solid ${scoreToColor(area.avg)}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '1.4rem' }}>{area.emoji}</span>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{area.label}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {area.trend > 5 ? '📈 Improving' : area.trend < -5 ? '📉 Declining' : '➡️ Steady'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: scoreToColor(area.avg) }}>
                                        {Math.round(area.avg)}%
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Low: {Math.round(area.min)}% / High: {Math.round(area.max)}%
                                    </div>
                                </div>
                            </div>

                            {area.feedback.map((line, j) => (
                                <p key={j} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 6px 0' }}>
                                    {line}
                                </p>
                            ))}

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                                {area.exercises.map((ex, j) => (
                                    <div key={j} style={{
                                        flex: '1 1 200px', padding: '10px 14px',
                                        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                                        borderRadius: '10px'
                                    }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-1)' }}>💪 {ex.name}</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{ex.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ─── Strengths ─── */}
            {strengths.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: '#22c55e' }}>
                        🟢 Your Strengths ({strengths.length})
                    </h3>
                    <div className="card">
                        {strengths.map((s, i) => (
                            <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '10px 0', borderBottom: i < strengths.length - 1 ? '1px solid var(--border)' : 'none'
                            }}>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <span>{s.emoji}</span>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.label}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.feedback}</div>
                                    </div>
                                </div>
                                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: scoreToColor(s.avg) }}>
                                    {Math.round(s.avg)}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Timeline ─── */}
            {timeline.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>⏱ Performance Timeline</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(timeline.length, 4)}, 1fr)`, gap: '8px' }}>
                        {timeline.map((phase, i) => (
                            <button
                                key={i}
                                type="button"
                                className="card"
                                onClick={() => {
                                    const startSec = Number(String(phase.label).split('s')[0]) || 0;
                                    seekToTime(startSec);
                                }}
                                style={{ textAlign: 'center', padding: '14px', cursor: 'pointer', border: '1px solid var(--border)' }}
                            >
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{phase.label}</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: scoreToColor(phase.avg) }}>{phase.avg}%</div>
                                {phase.weakestSegment && (
                                    <div style={{ fontSize: '0.7rem', color: scoreToColor(phase.weakestScore), marginTop: '4px' }}>
                                        Weakest: {phase.weakestSegment}
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Render AI feedback with formatted sections, bold text, and clickable timestamps.
 */
function renderAIFeedback(text, onSeekToTime) {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) { elements.push(<div key={i} style={{ height: '8px' }} />); continue; }

        // Headers (## or standalone **Header**)
        const h2Match = line.match(/^#{1,3}\s+(.+)$/);
        const boldLineMatch = !h2Match && line.match(/^\*\*([^*]+)\*\*$/);
        if (h2Match || boldLineMatch) {
            const title = h2Match ? h2Match[1] : boldLineMatch[1];
            elements.push(
                <div key={i} style={{
                    fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)',
                    marginTop: i > 0 ? '14px' : '0', marginBottom: '6px',
                    borderBottom: '1px solid rgba(242,75,47,0.2)', paddingBottom: '6px'
                }}>
                    {title.replace(/\*\*/g, '')}
                </div>
            );
            continue;
        }

        // Numbered items (1. 2. 3.)
        const numMatch = line.match(/^(\d+)\.\s+(.+)$/);
        if (numMatch) {
            elements.push(
                <div key={i} style={{
                    display: 'flex', gap: '10px', marginTop: '10px', marginBottom: '4px'
                }}>
                    <span style={{
                        background: 'var(--accent-1)', color: '#fff', borderRadius: '50%',
                        width: '22px', height: '22px', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0
                    }}>{numMatch[1]}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {renderInlineText(numMatch[2], onSeekToTime)}
                    </span>
                </div>
            );
            continue;
        }

        // Bullet items
        const bulletMatch = line.match(/^[-•]\s+(.+)$/);
        if (bulletMatch) {
            elements.push(
                <div key={i} style={{
                    display: 'flex', gap: '8px', paddingLeft: '8px', marginTop: '4px'
                }}>
                    <span style={{ color: 'var(--accent-1)', fontWeight: 700 }}>›</span>
                    <span>{renderInlineText(bulletMatch[1], onSeekToTime)}</span>
                </div>
            );
            continue;
        }

        // Regular text
        elements.push(
            <div key={i} style={{ marginTop: '2px' }}>
                {renderInlineText(line, onSeekToTime)}
            </div>
        );
    }

    return elements;
}

/** Render inline text with **bold** and clickable timestamps */
function renderInlineText(text, onSeekToTime) {
    const parts = [];
    const regex = /(\*\*[^*]+\*\*)|(?<=\s|^)(\d{1,3}s(?:-\d{1,3}s)?)(?=[\s,.)!?]|$)/g;
    let lastIdx = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIdx) {
            parts.push(<span key={`t${lastIdx}`}>{text.slice(lastIdx, match.index)}</span>);
        }

        if (match[1]) {
            const boldText = match[1].slice(2, -2);
            parts.push(
                <span key={`b${match.index}`} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    {boldText}
                </span>
            );
        } else if (match[2]) {
            const tsText = match[2];
            const seconds = parseInt(tsText.split('s')[0], 10);
            parts.push(
                <button
                    key={`ts${match.index}`}
                    onClick={() => onSeekToTime && onSeekToTime(seconds)}
                    title={`Jump to ${tsText} in the video`}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                        background: 'rgba(242,75,47,0.13)', color: '#f24b2f',
                        border: '1px solid rgba(242,75,47,0.35)', borderRadius: '6px',
                        padding: '1px 8px', fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'var(--font)',
                        transition: 'all 0.15s ease', verticalAlign: 'middle',
                    }}
                >
                    ⏱ {tsText}
                </button>
            );
        }

        lastIdx = match.index + match[0].length;
    }

    if (lastIdx < text.length) {
        parts.push(<span key={`e${lastIdx}`}>{text.slice(lastIdx)}</span>);
    }

    return parts.length > 0 ? parts : text;
}
