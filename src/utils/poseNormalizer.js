/**
 * Pose Normalizer — Body-center coordinate system with torso-length scaling.
 * Eliminates body size and position bias when comparing two dancers.
 */

/**
 * Compute midpoint of two landmarks
 */
export function midpoint(a, b) {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        z: ((a.z || 0) + (b.z || 0)) / 2,
        visibility: Math.min(a.visibility || 0, b.visibility || 0)
    };
}

/**
 * Euclidean distance between two 3D points
 */
export function distance(a, b) {
    return Math.sqrt(
        (a.x - b.x) ** 2 +
        (a.y - b.y) ** 2 +
        ((a.z || 0) - (b.z || 0)) ** 2
    );
}

/**
 * Normalize a pose to body-center coordinates, scaled by torso length.
 * This makes comparison invariant to body size and camera distance.
 *
 * @param {Array} landmarks - 33 MediaPipe pose landmarks
 * @returns {Array} Normalized landmarks (centered on mid-hip, scaled by torso)
 */
export function normalizePose(landmarks) {
    if (!landmarks || landmarks.length < 33) return null;

    const midHip = midpoint(landmarks[23], landmarks[24]);
    const midShoulder = midpoint(landmarks[11], landmarks[12]);
    const torsoLen = distance(midShoulder, midHip);

    // Guard against zero torso length (pose not detected properly)
    if (torsoLen < 0.001) return null;

    return landmarks.map(lm => ({
        x: (lm.x - midHip.x) / torsoLen,
        y: (lm.y - midHip.y) / torsoLen,
        z: ((lm.z || 0) - (midHip.z || 0)) / torsoLen,
        visibility: lm.visibility || 0
    }));
}

/**
 * Mirror a normalized pose (flip x-axis and swap left/right landmarks)
 * Used when user's webcam is mirrored
 */
export function mirrorPose(landmarks) {
    if (!landmarks) return null;

    // BlazePose left/right pairs to swap
    const SWAP_PAIRS = [
        [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], // arms
        [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],           // legs
        [1, 4], [2, 5], [3, 6], [7, 8], [9, 10]                     // face
    ];

    const mirrored = landmarks.map(lm => ({
        x: -lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility
    }));

    // Swap left/right
    for (const [l, r] of SWAP_PAIRS) {
        const temp = { ...mirrored[l] };
        mirrored[l] = { ...mirrored[r] };
        mirrored[r] = temp;
    }

    return mirrored;
}
