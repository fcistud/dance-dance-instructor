/**
 * Feedback Engine — Generates grouped, actionable feedback from session data.
 * Analyzes the full session to identify patterns and produce coaching text.
 */

import { BODY_SEGMENTS } from './poseSimilarity';

/**
 * Analyze an entire session and generate grouped feedback.
 *
 * @param {Array} sessionData - Array of comparison results over time
 * @returns {Object} { overallGrade, focusAreas, strengths, timeline, tips }
 */
export function analyzeSession(sessionData) {
    if (!sessionData || sessionData.length < 3) {
        return { overallGrade: 'N/A', focusAreas: [], strengths: [], timeline: [], tips: [] };
    }

    // ─── Per-segment analysis ───
    const segmentStats = {};
    for (const key of Object.keys(BODY_SEGMENTS)) {
        const scores = sessionData.map(d => d.segments[key]).filter(v => v !== null);
        if (scores.length === 0) continue;

        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const min = Math.min(...scores);
        const max = Math.max(...scores);

        // Find periods of struggle (consecutive low scores)
        const struggles = findStruggles(scores, 50, 5);

        // Trend: improving or getting worse?
        const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
        const secondHalf = scores.slice(Math.floor(scores.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const trend = secondAvg - firstAvg;

        segmentStats[key] = {
            avg, min, max, trend, struggles,
            label: BODY_SEGMENTS[key].label,
            emoji: BODY_SEGMENTS[key].emoji,
            consistency: 100 - (standardDeviation(scores) * 2),
        };
    }

    // ─── Group into focus areas (worst segments) and strengths ───
    const sorted = Object.entries(segmentStats).sort((a, b) => a[1].avg - b[1].avg);
    const focusAreas = sorted
        .filter(([_, s]) => s.avg < 70)
        .map(([key, s]) => ({
            segment: key,
            ...s,
            feedback: generateSegmentFeedback(key, s),
            exercises: generateExercises(key, s),
        }));

    const strengths = sorted
        .filter(([_, s]) => s.avg >= 70)
        .reverse()
        .map(([key, s]) => ({
            segment: key,
            ...s,
            feedback: s.avg >= 85
                ? `Your ${s.label.toLowerCase()} positioning is excellent! Consistent and accurate.`
                : `Your ${s.label.toLowerCase()} is good overall — minor adjustments would make it perfect.`,
        }));

    // ─── Overall grade ───
    const overallScores = sessionData.map(d => d.overall);
    const overallAvg = overallScores.reduce((a, b) => a + b, 0) / overallScores.length;
    const overallGrade = getGrade(overallAvg);

    // ─── Timeline phases ───
    const timeline = analyzeTimeline(sessionData);

    // ─── Top tips ───
    const tips = generateTopTips(focusAreas, segmentStats, overallAvg);

    return {
        overallGrade,
        overallAvg,
        focusAreas,
        strengths,
        timeline,
        tips,
        segmentStats,
    };
}

// ─── Segment-specific feedback ───
function generateSegmentFeedback(segKey, stats) {
    const label = stats.label.toLowerCase();
    const lines = [];

    if (stats.avg < 40) {
        lines.push(`Your ${label} positioning was significantly different from the reference throughout most of the session.`);
    } else if (stats.avg < 55) {
        lines.push(`Your ${label} needs considerable work — it was off-target for most of the dance.`);
    } else {
        lines.push(`Your ${label} was close but not quite matching the reference consistently.`);
    }

    if (stats.struggles.length > 0) {
        lines.push(`There were ${stats.struggles.length} periods where your ${label} dropped below 50% accuracy for several seconds.`);
    }

    if (stats.trend > 5) {
        lines.push(`Good news: your ${label} improved as the session went on (+${Math.round(stats.trend)}% in the second half).`);
    } else if (stats.trend < -5) {
        lines.push(`Your ${label} accuracy dropped towards the end — you may be getting fatigued or losing focus on this area.`);
    }

    if (stats.consistency < 50) {
        lines.push(`Your ${label} was very inconsistent — some moments were great, others were far off. Focus on maintaining steady positioning.`);
    }

    // Add specific directional guidance per segment
    const specifics = SEGMENT_SPECIFICS[segKey];
    if (specifics) {
        lines.push(specifics);
    }

    return lines;
}

const SEGMENT_SPECIFICS = {
    leftArm: 'Focus on matching the extension and angle of your left arm. Watch the reference closely — are you lifting it high enough, and is your elbow at the right bend?',
    rightArm: 'Pay attention to your right arm\'s reach and angle. Try practicing the arm movements in isolation before combining with footwork.',
    leftLeg: 'Your left leg placement and kick height may need work. Try slowing the video to 0.5× and stepping through the leg movements frame by frame.',
    rightLeg: 'Right leg positioning is off — this often means kick height, step width, or knee bend isn\'t matching. Practice the footwork segment on its own.',
    torso: 'Your torso alignment (shoulders and hips) is the foundation of the dance. If your torso is off, everything built on top will look wrong. Focus on keeping your core aligned with the reference.',
    head: 'Head position affects the overall visual dramatically. Try keeping your gaze and head angle matching the reference — small head movements make a big difference.',
};

function generateExercises(segKey, stats) {
    const exercises = {
        leftArm: [
            { name: 'Arm Isolation Drill', desc: 'Practice just the arm movements at 0.5× speed, no legs' },
            { name: 'Mirror Matching', desc: 'Pause the reference at key poses and match your arm position exactly' },
        ],
        rightArm: [
            { name: 'Arm Isolation Drill', desc: 'Practice just the arm movements at 0.5× speed, no legs' },
            { name: 'Position Holds', desc: 'Freeze at the trickiest arm positions for 5 seconds each' },
        ],
        leftLeg: [
            { name: 'Footwork Breakdown', desc: 'Practice the leg movements without arms at half speed' },
            { name: 'Kick Height Check', desc: 'Compare your kick height against the reference — are you reaching far enough?' },
        ],
        rightLeg: [
            { name: 'Step Width Practice', desc: 'Focus on matching the width and depth of each step' },
            { name: 'Slow-Mo Leg Drill', desc: 'Run the reference at 0.5× and focus only on matching your right leg' },
        ],
        torso: [
            { name: 'Core Alignment Check', desc: 'Dance while looking at your skeleton — keep torso lines green' },
            { name: 'Hip-Shoulder Sync', desc: 'Focus on rotating hips and shoulders together as in the reference' },
        ],
        head: [
            { name: 'Head Position Awareness', desc: 'Practice with a fixed gaze point matching the reference angle' },
            { name: 'Posture Check', desc: 'Keep your chin level and head centered — avoid looking down at your feet' },
        ],
    };

    return exercises[segKey] || [
        { name: 'Slow Practice', desc: 'Practice this section at 0.5× speed focusing on accuracy' },
    ];
}

// ─── Timeline analysis ───
function analyzeTimeline(sessionData) {
    const chunkSize = Math.max(1, Math.floor(sessionData.length / 4));
    const phases = [];

    for (let i = 0; i < sessionData.length; i += chunkSize) {
        const chunk = sessionData.slice(i, i + chunkSize);
        const avg = chunk.reduce((a, d) => a + d.overall, 0) / chunk.length;
        const startSec = Math.round(((chunk[0].timestamp - sessionData[0].timestamp) / 1000));
        const endSec = Math.round(((chunk[chunk.length - 1].timestamp - sessionData[0].timestamp) / 1000));

        // Find the weakest segment in this phase
        const segTotals = {};
        for (const d of chunk) {
            for (const [k, v] of Object.entries(d.segments)) {
                if (v === null) continue;
                segTotals[k] = (segTotals[k] || []);
                segTotals[k].push(v);
            }
        }
        let weakest = null;
        let weakestAvg = 100;
        for (const [k, vals] of Object.entries(segTotals)) {
            const a = vals.reduce((s, v) => s + v, 0) / vals.length;
            if (a < weakestAvg) { weakestAvg = a; weakest = k; }
        }

        phases.push({
            label: `${startSec}s–${endSec}s`,
            avg: Math.round(avg),
            weakestSegment: weakest ? BODY_SEGMENTS[weakest]?.label : null,
            weakestScore: Math.round(weakestAvg),
        });
    }

    return phases;
}

// ─── Top tips ───
function generateTopTips(focusAreas, segmentStats, overallAvg) {
    const tips = [];

    if (focusAreas.length === 0) {
        tips.push({
            icon: '🌟',
            text: 'Amazing work! All body parts are matching well. Try increasing the speed or learning a harder routine.',
        });
        return tips;
    }

    if (focusAreas.length >= 3) {
        tips.push({
            icon: '🎯',
            text: 'Multiple areas need work. Focus on ONE body part at a time — start with your weakest segment and practice just that at half speed.',
        });
    }

    const worst = focusAreas[0];
    tips.push({
        icon: '⚡',
        text: `Priority fix: your ${worst.label.toLowerCase()} (${Math.round(worst.avg)}%). Slow the video to 0.5× and practice matching just this area.`,
    });

    // Check for improving segments
    const improving = Object.entries(segmentStats)
        .filter(([_, s]) => s.trend > 8)
        .map(([k, s]) => s.label);
    if (improving.length > 0) {
        tips.push({
            icon: '📈',
            text: `Your ${improving.join(' and ')} improved during the session — keep practicing and this will click!`,
        });
    }

    // Check for declining segments
    const declining = Object.entries(segmentStats)
        .filter(([_, s]) => s.trend < -8)
        .map(([k, s]) => s.label);
    if (declining.length > 0) {
        tips.push({
            icon: '💤',
            text: `Your ${declining.join(' and ')} got worse towards the end — take a short break and try again refreshed.`,
        });
    }

    tips.push({
        icon: '💡',
        text: 'Pro tip: Use mirror mode if the reference dancer faces you. Use the speed controls to slow down complex sections.',
    });

    return tips.slice(0, 5);
}

// ─── Helpers ───
function findStruggles(scores, threshold, minLength) {
    const struggles = [];
    let start = null;
    for (let i = 0; i < scores.length; i++) {
        if (scores[i] < threshold) {
            if (start === null) start = i;
        } else {
            if (start !== null && (i - start) >= minLength) {
                struggles.push({ start, end: i - 1 });
            }
            start = null;
        }
    }
    if (start !== null && (scores.length - start) >= minLength) {
        struggles.push({ start, end: scores.length - 1 });
    }
    return struggles;
}

function standardDeviation(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, v) => a + (v - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
}

function getGrade(score) {
    if (score >= 90) return { letter: 'S', label: 'Superstar!', color: '#22c55e' };
    if (score >= 80) return { letter: 'A', label: 'Excellent', color: '#84cc16' };
    if (score >= 70) return { letter: 'B', label: 'Good Work', color: '#38bdf8' };
    if (score >= 60) return { letter: 'C', label: 'Getting There', color: '#f59e0b' };
    if (score >= 50) return { letter: 'D', label: 'Keep Practicing', color: '#f97316' };
    return { letter: 'F', label: 'Beginner — Keep Going!', color: '#ef4444' };
}
