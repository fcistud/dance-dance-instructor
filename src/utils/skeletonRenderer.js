/**
 * Skeleton Renderer — Draws pose skeletons with color-coded body parts.
 * Supports both reference (uniform color) and user (score-based coloring).
 */

import { BODY_SEGMENTS, scoreToColor } from './poseSimilarity';

// ─── Connection definitions for drawing ───
const SEGMENT_CONNECTIONS = {
    leftArm: [[11, 13], [13, 15]],
    rightArm: [[12, 14], [14, 16]],
    leftLeg: [[23, 25], [25, 27]],
    rightLeg: [[24, 26], [26, 28]],
    torso: [[11, 12], [11, 23], [12, 24], [23, 24]],
    head: [[0, 11], [0, 12]],
};

/**
 * Draw a skeleton on a canvas context
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} landmarks - Normalized 0-1 range landmarks
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {Object} segmentScores - Per-segment scores (null for reference = use uniform color)
 * @param {string} uniformColor - Color to use when no scores (for reference skeleton)
 */
export function drawSkeleton(ctx, landmarks, w, h, segmentScores = null, uniformColor = '#38bdf8') {
    if (!landmarks || landmarks.length < 33) return;

    // Draw connections (limb lines)
    for (const [segName, connections] of Object.entries(SEGMENT_CONNECTIONS)) {
        let color;
        if (segmentScores) {
            color = scoreToColor(segmentScores[segName]);
        } else {
            color = uniformColor;
        }

        const isOff = segmentScores && segmentScores[segName] !== null && segmentScores[segName] < 55;

        ctx.strokeStyle = color;
        ctx.lineWidth = isOff ? 5 : 3;
        ctx.lineCap = 'round';

        if (isOff) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowBlur = 0;
        }

        for (const [startIdx, endIdx] of connections) {
            const start = landmarks[startIdx];
            const end = landmarks[endIdx];

            if ((start.visibility || 0) < 0.4 || (end.visibility || 0) < 0.4) continue;

            ctx.beginPath();
            ctx.moveTo(start.x * w, start.y * h);
            ctx.lineTo(end.x * w, end.y * h);
            ctx.stroke();
        }
    }

    ctx.shadowBlur = 0;

    // Draw keypoints
    const SKIP = new Set([1, 2, 3, 4, 5, 6, 9, 10]); // Skip minor face landmarks

    for (let i = 0; i < Math.min(landmarks.length, 33); i++) {
        if (SKIP.has(i)) continue;

        const lm = landmarks[i];
        if ((lm.visibility || 0) < 0.4) continue;

        const x = lm.x * w;
        const y = lm.y * h;

        // Determine keypoint color from its segment
        let color = uniformColor;
        if (segmentScores) {
            color = getKeypointSegmentColor(i, segmentScores);
        }

        // Outer glow
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();

        // Inner colored dot
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }
}

/**
 * Get segment color for a specific keypoint index
 */
function getKeypointSegmentColor(idx, segmentScores) {
    if ([11, 13, 15, 17, 19, 21].includes(idx)) return scoreToColor(segmentScores.leftArm);
    if ([12, 14, 16, 18, 20, 22].includes(idx)) return scoreToColor(segmentScores.rightArm);
    if ([23, 25, 27, 29, 31].includes(idx)) return scoreToColor(segmentScores.leftLeg);
    if ([24, 26, 28, 30, 32].includes(idx)) return scoreToColor(segmentScores.rightLeg);
    if ([0, 7, 8].includes(idx)) return scoreToColor(segmentScores.head);
    return scoreToColor(segmentScores.torso);
}

// ─── Landmark Smoothing ───
const SMOOTHING_WINDOW = 4;
const histories = { ref: [], user: [] };

/**
 * Apply temporal smoothing to reduce jitter
 */
export function smoothLandmarks(landmarks, channel = 'user') {
    if (!landmarks || landmarks.length === 0) return landmarks;

    const history = histories[channel];
    history.push(landmarks.map(l => ({ ...l })));

    if (history.length > SMOOTHING_WINDOW) {
        history.shift();
    }

    if (history.length < 2) return landmarks;

    return landmarks.map((_, idx) => {
        let sx = 0, sy = 0, sz = 0, sv = 0;
        const n = history.length;
        for (const frame of history) {
            sx += frame[idx].x;
            sy += frame[idx].y;
            sz += frame[idx].z || 0;
            sv += frame[idx].visibility || 0;
        }
        return { x: sx / n, y: sy / n, z: sz / n, visibility: sv / n };
    });
}

/**
 * Reset smoothing history
 */
export function resetSmoothing(channel) {
    if (channel) {
        histories[channel] = [];
    } else {
        histories.ref = [];
        histories.user = [];
    }
}

/**
 * Check if pose has enough visible core landmarks
 */
export function isPoseValid(landmarks) {
    if (!landmarks || landmarks.length < 33) return false;
    const core = [11, 12, 23, 24];
    return core.every(i => landmarks[i] && (landmarks[i].visibility || 0) > 0.3);
}
