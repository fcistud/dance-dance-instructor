import { BODY_SEGMENTS, scoreToColor, scoreToLabel, scoreToGrade } from '../utils/poseSimilarity';

/**
 * ScoreDisplay — Shows real-time overall score, grade, and per-body-segment breakdown.
 */
export default function ScoreDisplay({ comparison }) {
    if (!comparison) {
        return (
            <div className="card score-bar" id="score-display">
                <div className="score-ring">
                    <span className="score-number" style={{ color: 'var(--text-muted)', fontSize: '1.5rem' }}>—</span>
                </div>
                <div>
                    <div className="card-title" style={{ marginBottom: '8px' }}>Similarity Score</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                        Load a reference video and start dancing to see your score
                    </div>
                </div>
                <div className="score-grade" style={{ opacity: 0.3 }}>—</div>
            </div>
        );
    }

    const { overall, segments } = comparison;
    const color = scoreToColor(overall);
    const label = scoreToLabel(overall);
    const grade = scoreToGrade(overall);

    return (
        <div className="fade-in" id="score-display">
            {/* Main score bar */}
            <div className="card score-bar">
                <div className="score-ring" style={{ '--score-pct': `${overall}%` }}>
                    <div>
                        <div className="score-number" style={{ color }}>{Math.round(overall)}</div>
                        <div className="score-label" style={{ color }}>{label}</div>
                    </div>
                </div>

                {/* Body part breakdown */}
                <div className="segments-grid">
                    {Object.entries(BODY_SEGMENTS).map(([key, seg]) => {
                        const score = segments[key];
                        const segColor = scoreToColor(score);
                        return (
                            <div className="segment-item" key={key}>
                                <div className="segment-emoji">{seg.emoji}</div>
                                <div className="segment-label">{seg.label}</div>
                                <div className="segment-score" style={{ color: segColor }}>
                                    {score !== null ? Math.round(score) : '—'}
                                </div>
                                <div className="segment-bar">
                                    <div
                                        className="segment-bar-fill"
                                        style={{
                                            width: `${score || 0}%`,
                                            background: segColor
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="score-grade" style={{ color }}>{grade}</div>
            </div>
        </div>
    );
}
