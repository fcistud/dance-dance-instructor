/**
 * PoseScript Real-Time Descriptor (JavaScript port)
 *
 * Converts MediaPipe landmarks into natural language pose descriptions
 * in real-time in the browser. Based on NAVER's PoseScript (ECCV 2022)
 * and PoseFix (ICCV 2023) vocabulary.
 *
 * Used by the audio coach for real-time voice corrections.
 */

// MediaPipe landmark indices
const LM = {
    nose: 0, leftEye: 1, rightEye: 2,
    leftEar: 3, rightEar: 4,
    leftShoulder: 11, rightShoulder: 12,
    leftElbow: 13, rightElbow: 14,
    leftWrist: 15, rightWrist: 16,
    leftHip: 23, rightHip: 24,
    leftKnee: 25, rightKnee: 26,
    leftAnkle: 27, rightAnkle: 28,
};

function pt(landmarks, idx) {
    const lm = landmarks[idx];
    if (!lm) return null;
    return { x: lm.x, y: lm.y, z: lm.z || 0, v: lm.visibility || 0 };
}

function angle(a, b, c) {
    if (!a || !b || !c) return null;
    const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const m1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
    const m2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);
    if (m1 * m2 < 1e-8) return 180;
    return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180 / Math.PI;
}

// ─── Describe a single body part ───

function describeArm(landmarks, side) {
    const si = side === 'left' ? LM.leftShoulder : LM.rightShoulder;
    const ei = side === 'left' ? LM.leftElbow : LM.rightElbow;
    const wi = side === 'left' ? LM.leftWrist : LM.rightWrist;
    const s = pt(landmarks, si), e = pt(landmarks, ei), w = pt(landmarks, wi);
    if (!s || !e || !w) return null;

    const ang = angle(s, e, w);

    // Height relative to shoulder
    let height;
    if (w.y < s.y - 0.15) height = 'raised overhead';
    else if (w.y < s.y - 0.05) height = 'raised above shoulder';
    else if (Math.abs(w.y - s.y) < 0.05) height = 'at shoulder height';
    else if (w.y > s.y + 0.15) height = 'down by your side';
    else height = 'below shoulder';

    // Bend
    let bend;
    if (ang > 160) bend = 'fully extended';
    else if (ang > 130) bend = 'slightly bent';
    else if (ang > 90) bend = 'bent at ninety degrees';
    else bend = 'sharply bent';

    // Direction
    const dx = w.x - s.x;
    let dir;
    if (Math.abs(dx) > 0.2) {
        dir = ((side === 'left' && dx < 0) || (side === 'right' && dx > 0))
            ? 'reaching outward' : 'reaching across your body';
    } else {
        dir = 'close to body';
    }

    return { height, bend, dir, angle: ang };
}

function describeLeg(landmarks, side) {
    const hi = side === 'left' ? LM.leftHip : LM.rightHip;
    const ki = side === 'left' ? LM.leftKnee : LM.rightKnee;
    const ai = side === 'left' ? LM.leftAnkle : LM.rightAnkle;
    const h = pt(landmarks, hi), k = pt(landmarks, ki), a = pt(landmarks, ai);
    if (!h || !k || !a) return null;

    const ang = angle(h, k, a);

    let bend;
    if (ang > 165) bend = 'straight';
    else if (ang > 140) bend = 'slightly bent';
    else if (ang > 100) bend = 'bent in a squat';
    else bend = 'deeply bent';

    let lift;
    if (a.y < h.y) lift = 'kicked up';
    else if (a.y < k.y - 0.1) lift = 'lifted';
    else lift = 'on the ground';

    return { bend, lift, angle: ang };
}

function describeTorso(landmarks) {
    const ls = pt(landmarks, LM.leftShoulder);
    const rs = pt(landmarks, LM.rightShoulder);
    const lh = pt(landmarks, LM.leftHip);
    const rh = pt(landmarks, LM.rightHip);
    if (!ls || !rs || !lh || !rh) return null;

    const midSx = (ls.x + rs.x) / 2;
    const midSy = (ls.y + rs.y) / 2;
    const midHx = (lh.x + rh.x) / 2;
    const midHy = (lh.y + rh.y) / 2;

    const lean = Math.atan2(midSx - midHx, -(midSy - midHy)) * 180 / Math.PI;

    let leanDesc;
    if (Math.abs(lean) < 5) leanDesc = 'upright';
    else if (lean > 5) leanDesc = 'leaning right';
    else leanDesc = 'leaning left';

    return { lean: leanDesc, leanAngle: lean };
}

// ─── Compare ref vs user and generate correction ───

/**
 * Generate a real-time PoseScript correction comparing ref to user pose.
 * Returns a speakable string for the audio coach.
 *
 * @param {Object} comparison - Pose comparison result with segments
 * @param {Array} refLandmarks - Reference pose landmarks
 * @param {Array} userLandmarks - User's current pose landmarks
 * @returns {string|null} Natural language correction or null if good
 */
export function generatePoseScriptCorrection(comparison, refLandmarks, userLandmarks) {
    if (!comparison || !refLandmarks || !userLandmarks) return null;

    // Find worst segment
    let worstSeg = null;
    let worstScore = 100;
    for (const [key, score] of Object.entries(comparison.segments)) {
        if (score === null) continue;
        if (score < worstScore) { worstScore = score; worstSeg = key; }
    }

    if (worstScore >= 55) return null; // Good enough

    // Generate PoseScript-style correction for the worst segment
    switch (worstSeg) {
        case 'leftArm':
        case 'rightArm': {
            const side = worstSeg === 'leftArm' ? 'left' : 'right';
            const ref = describeArm(refLandmarks, side);
            const user = describeArm(userLandmarks, side);
            if (!ref || !user) return null;
            return armCorrection(side, ref, user);
        }
        case 'leftLeg':
        case 'rightLeg': {
            const side = worstSeg === 'leftLeg' ? 'left' : 'right';
            const ref = describeLeg(refLandmarks, side);
            const user = describeLeg(userLandmarks, side);
            if (!ref || !user) return null;
            return legCorrection(side, ref, user);
        }
        case 'torso': {
            const ref = describeTorso(refLandmarks);
            const user = describeTorso(userLandmarks);
            if (!ref || !user) return null;
            return torsoCorrection(ref, user);
        }
        default:
            return null;
    }
}

// ─── Correction generators ───

function armCorrection(side, ref, user) {
    const corrections = [];

    // Height difference
    if (ref.height !== user.height) {
        if (ref.height === 'raised overhead' && user.height !== 'raised overhead') {
            corrections.push(`Reach your ${side} arm up overhead!`);
        } else if (ref.height === 'at shoulder height' && user.height !== 'at shoulder height') {
            corrections.push(`Bring your ${side} arm to shoulder height!`);
        } else if (ref.height === 'down by your side' && user.height !== 'down by your side') {
            corrections.push(`Drop your ${side} arm down!`);
        } else if (ref.height.includes('raised') && !user.height.includes('raised')) {
            corrections.push(`Lift your ${side} arm higher!`);
        } else if (!ref.height.includes('raised') && user.height.includes('raised')) {
            corrections.push(`Lower your ${side} arm!`);
        }
    }

    // Bend difference
    if (ref.bend !== user.bend) {
        if (ref.bend === 'fully extended' && user.bend !== 'fully extended') {
            corrections.push(`Fully extend your ${side} arm, straighten that elbow!`);
        } else if (ref.bend.includes('bent') && user.bend === 'fully extended') {
            corrections.push(`Bend your ${side} elbow more!`);
        }
    }

    // Direction
    if (ref.dir !== user.dir) {
        if (ref.dir === 'reaching outward') {
            corrections.push(`Stretch your ${side} arm out wider!`);
        } else if (ref.dir === 'close to body') {
            corrections.push(`Pull your ${side} arm in closer!`);
        }
    }

    if (corrections.length === 0) {
        return `Watch your ${side} arm placement!`;
    }
    return corrections[0]; // Return most important one
}

function legCorrection(side, ref, user) {
    // Kick height
    if (ref.lift === 'kicked up' && user.lift !== 'kicked up') {
        return `Kick your ${side} leg up higher!`;
    }
    if (ref.lift === 'on the ground' && user.lift !== 'on the ground') {
        return `Plant your ${side} foot down!`;
    }

    // Bend
    if (ref.bend === 'straight' && user.bend !== 'straight') {
        return `Straighten your ${side} leg!`;
    }
    if (ref.bend.includes('bent') && user.bend === 'straight') {
        return `Bend your ${side} knee more!`;
    }
    if (ref.bend === 'deeply bent' && user.bend !== 'deeply bent') {
        return `Get lower, bend that ${side} knee deeper!`;
    }

    return `Watch your ${side} leg!`;
}

function torsoCorrection(ref, user) {
    if (ref.lean === 'upright' && user.lean !== 'upright') {
        if (user.lean === 'leaning right') return 'Straighten up, you\'re leaning right!';
        if (user.lean === 'leaning left') return 'Straighten up, you\'re leaning left!';
        return 'Stand up straight, engage your core!';
    }
    if (ref.lean === 'leaning right' && user.lean !== 'leaning right') {
        return 'Lean your body to the right!';
    }
    if (ref.lean === 'leaning left' && user.lean !== 'leaning left') {
        return 'Lean your body to the left!';
    }
    return 'Move your hips more, use your core!';
}

/**
 * Generate praise based on PoseScript analysis
 */
export function generatePoseScriptPraise(comparison) {
    if (!comparison || comparison.overall < 80) return null;
    const phrases = [
        'Beautiful form! Keep it up!',
        'Your body alignment is spot on!',
        'Great extension, you\'re nailing it!',
        'Perfect posture, stay with it!',
        'That\'s exactly right, gorgeous!',
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
