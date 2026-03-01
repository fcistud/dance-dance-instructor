/**
 * Pose Similarity v3 — Balanced comparison engine
 *
 * Uses joint angle matching + position matching + direction,
 * with curves calibrated so that:
 * - Standing still while reference dances = ~30-50%
 * - Roughly following the dance = ~60-75%
 * - Good dancing = ~75-85%
 * - Near-perfect = ~85-95%
 */

import { normalizePose } from './poseNormalizer';

// ─── Body Segment Definitions ───
export const BODY_SEGMENTS = {
    leftArm: {
        joints: [11, 13, 15],   // shoulder → elbow → wrist
        label: 'Left Arm', weight: 1.5, emoji: '💪'
    },
    rightArm: {
        joints: [12, 14, 16],
        label: 'Right Arm', weight: 1.5, emoji: '💪'
    },
    leftLeg: {
        joints: [23, 25, 27],   // hip → knee → ankle
        label: 'Left Leg', weight: 1.5, emoji: '🦵'
    },
    rightLeg: {
        joints: [24, 26, 28],
        label: 'Right Leg', weight: 1.5, emoji: '🦵'
    },
    torso: {
        joints: [11, 12, 23, 24],
        label: 'Torso', weight: 1.0, emoji: '🫁',
        isTorso: true
    },
    head: {
        joints: [0, 11, 12],
        label: 'Head', weight: 0.5, emoji: '🗣️',
        isHead: true
    },
};

// ─── Math ───

function vec(a, b) {
    return { x: b.x - a.x, y: b.y - a.y, z: (b.z || 0) - (a.z || 0) };
}

function angleDeg(a, b, c) {
    const v1 = vec(b, a);
    const v2 = vec(b, c);
    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const m1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
    const m2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);
    if (m1 < 0.001 || m2 < 0.001) return 0;
    return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180 / Math.PI;
}

function cosineSim(v1, v2) {
    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const m1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
    const m2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);
    if (m1 < 0.001 || m2 < 0.001) return 0;
    return dot / (m1 * m2);
}

function dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
}

// ─── Scoring (calibrated for realistic results) ───

/** Angle score: 0° diff → 100, 30° → 70, 60° → 40, 90° → 10 */
function angleScore(refAngle, userAngle) {
    const diff = Math.abs(refAngle - userAngle);
    return Math.max(0, 100 * Math.exp(-diff * diff / 3000));
    // Gaussian: gentle falloff, 30° diff ≈ 74%, 45° ≈ 51%, 90° ≈ 7%
}

/** Position score: 0 dist → 100, uses gentle exponential */
function posScore(refPt, userPt) {
    const d = dist(refPt, userPt);
    return Math.max(0, 100 * Math.exp(-d * 1.5));
    // 0.3 dist ≈ 64%, 0.5 ≈ 47%, 1.0 ≈ 22%
}

/** Direction score: cosine sim mapped to 0-100 */
function dirScore(refA, refB, userA, userB) {
    const rv = vec(refA, refB);
    const uv = vec(userA, userB);
    const sim = cosineSim(rv, uv);
    // sim: -1 to 1 → 0 to 100, but use sqrt mapping for gentler curve
    const raw = (sim + 1) / 2; // 0 to 1
    return Math.pow(raw, 0.7) * 100; // Softer curve
}

function minVis(norm, indices) {
    return Math.min(...indices.map(i => norm[i]?.visibility ?? 0));
}

// ─── Main comparison ───

export function comparePoses(refLandmarks, userLandmarks) {
    const refN = normalizePose(refLandmarks);
    const userN = normalizePose(userLandmarks);
    if (!refN || !userN) return null;

    const segmentScores = {};

    for (const [name, seg] of Object.entries(BODY_SEGMENTS)) {
        const vis = Math.min(minVis(refN, seg.joints), minVis(userN, seg.joints));
        if (vis < 0.3) { segmentScores[name] = null; continue; }

        let score;

        if (seg.isTorso) {
            // Torso: shoulder and hip position matching
            const s1 = posScore(refN[11], userN[11]);
            const s2 = posScore(refN[12], userN[12]);
            const s3 = posScore(refN[23], userN[23]);
            const s4 = posScore(refN[24], userN[24]);
            score = (s1 + s2 + s3 + s4) / 4;
        } else if (seg.isHead) {
            // Head: mainly nose position
            score = posScore(refN[0], userN[0]);
        } else {
            // Limbs: blend of angle + position + direction
            const [a, b, c] = seg.joints;

            const refAngle = angleDeg(refN[a], refN[b], refN[c]);
            const userAngle = angleDeg(userN[a], userN[b], userN[c]);
            const aScore = angleScore(refAngle, userAngle);

            // Position of wrist/ankle (endpoint)
            const pScore = posScore(refN[c], userN[c]);

            // Direction of upper + lower limb segments
            const d1 = dirScore(refN[a], refN[b], userN[a], userN[b]);
            const d2 = dirScore(refN[b], refN[c], userN[b], userN[c]);
            const dScore = (d1 + d2) / 2;

            // Blend: 35% angle, 30% position, 35% direction
            score = aScore * 0.35 + pScore * 0.30 + dScore * 0.35;
        }

        segmentScores[name] = Math.max(0, Math.min(100, Math.round(score * 10) / 10));
    }

    // Overall = weighted average
    let wSum = 0, wTotal = 0;
    for (const [name, score] of Object.entries(segmentScores)) {
        if (score === null) continue;
        const w = BODY_SEGMENTS[name].weight;
        wSum += score * w;
        wTotal += w;
    }

    return {
        overall: wTotal > 0 ? Math.round((wSum / wTotal) * 10) / 10 : 0,
        segments: segmentScores,
        timestamp: Date.now()
    };
}

// ─── Utilities ───

export function scoreToColor(score) {
    if (score === null) return '#64748b';
    if (score >= 85) return '#22c55e';
    if (score >= 70) return '#84cc16';
    if (score >= 55) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
}

export function scoreToLabel(score) {
    if (score === null) return 'N/A';
    if (score >= 85) return 'Perfect!';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Close';
    if (score >= 40) return 'Off';
    return 'Way Off';
}

export function scoreToGrade(score) {
    if (score === null) return '—';
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
}
