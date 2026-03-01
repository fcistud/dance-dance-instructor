"""
PoseScript-inspired pose descriptor for MediaPipe landmarks.

Converts MediaPipe 33-point landmarks into natural language pose descriptions
using vocabulary and patterns from NAVER's PoseScript (ECCV 2022) and
PoseFix (ICCV 2023) papers.

Reference: https://github.com/naver/posescript
"""

import math
import numpy as np
from typing import Optional

# ─── MediaPipe Landmark Indices ───
# Based on MediaPipe BlazePose 33-point model
LANDMARKS = {
    'nose': 0, 'left_eye': 1, 'right_eye': 2,
    'left_ear': 3, 'right_ear': 4,
    'left_shoulder': 11, 'right_shoulder': 12,
    'left_elbow': 13, 'right_elbow': 14,
    'left_wrist': 15, 'right_wrist': 16,
    'left_hip': 23, 'right_hip': 24,
    'left_knee': 25, 'right_knee': 26,
    'left_ankle': 27, 'right_ankle': 28,
    'left_pinky': 17, 'right_pinky': 18,
    'left_index': 19, 'right_index': 20,
    'left_thumb': 21, 'right_thumb': 22,
    'left_heel': 29, 'right_heel': 30,
    'left_foot': 31, 'right_foot': 32,
}

# ─── Body Segments (PoseScript-style) ───
SEGMENTS = {
    'left_arm': {
        'joints': ['left_shoulder', 'left_elbow', 'left_wrist'],
        'label': 'left arm',
    },
    'right_arm': {
        'joints': ['right_shoulder', 'right_elbow', 'right_wrist'],
        'label': 'right arm',
    },
    'left_leg': {
        'joints': ['left_hip', 'left_knee', 'left_ankle'],
        'label': 'left leg',
    },
    'right_leg': {
        'joints': ['right_hip', 'right_knee', 'right_ankle'],
        'label': 'right leg',
    },
    'torso': {
        'joints': ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],
        'label': 'torso',
    },
    'head': {
        'joints': ['nose', 'left_ear', 'right_ear', 'left_shoulder', 'right_shoulder'],
        'label': 'head',
    },
}


def get_point(landmarks: list, name: str) -> Optional[np.ndarray]:
    """Get 3D point from landmarks by name."""
    idx = LANDMARKS.get(name)
    if idx is None or idx >= len(landmarks):
        return None
    lm = landmarks[idx]
    if isinstance(lm, dict):
        return np.array([lm.get('x', 0), lm.get('y', 0), lm.get('z', 0)])
    return np.array([lm[0], lm[1], lm[2] if len(lm) > 2 else 0])


def angle_between(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """Calculate angle at point b formed by points a-b-c, in degrees."""
    v1 = a - b
    v2 = c - b
    cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-8)
    return math.degrees(math.acos(np.clip(cos_angle, -1, 1)))


def describe_arm(landmarks: list, side: str) -> str:
    """Generate PoseScript-style description of an arm pose."""
    shoulder = get_point(landmarks, f'{side}_shoulder')
    elbow = get_point(landmarks, f'{side}_elbow')
    wrist = get_point(landmarks, f'{side}_wrist')

    if shoulder is None or elbow is None or wrist is None:
        return f"The {side} arm is not clearly visible."

    angle = angle_between(shoulder, elbow, wrist)
    # Relative position of wrist to shoulder
    wrist_rel = wrist - shoulder

    # Height description
    if wrist[1] < shoulder[1] - 0.15:
        height = "raised overhead"
    elif wrist[1] < shoulder[1] - 0.05:
        height = "raised above shoulder level"
    elif abs(wrist[1] - shoulder[1]) < 0.05:
        height = "extended at shoulder height"
    elif wrist[1] > shoulder[1] + 0.15:
        height = "hanging down by the side"
    else:
        height = "positioned below the shoulder"

    # Bend description
    if angle > 160:
        bend = "fully extended"
    elif angle > 130:
        bend = "slightly bent at the elbow"
    elif angle > 90:
        bend = "bent at roughly 90 degrees"
    elif angle > 60:
        bend = "sharply bent at the elbow"
    else:
        bend = "tightly folded"

    # Direction
    if abs(wrist_rel[0]) > 0.2:
        direction = "reaching outward" if (side == 'left' and wrist_rel[0] < 0) or (side == 'right' and wrist_rel[0] > 0) else "reaching across the body"
    elif abs(wrist_rel[2]) > 0.1:
        direction = "reaching forward" if wrist_rel[2] > 0 else "pulled back"
    else:
        direction = "close to the body"

    return f"The {side} arm is {height}, {bend}, {direction}."


def describe_leg(landmarks: list, side: str) -> str:
    """Generate PoseScript-style description of a leg pose."""
    hip = get_point(landmarks, f'{side}_hip')
    knee = get_point(landmarks, f'{side}_knee')
    ankle = get_point(landmarks, f'{side}_ankle')

    if hip is None or knee is None or ankle is None:
        return f"The {side} leg is not clearly visible."

    angle = angle_between(hip, knee, ankle)
    ankle_rel = ankle - hip

    # Knee bend
    if angle > 165:
        bend = "straight and extended"
    elif angle > 140:
        bend = "slightly bent at the knee"
    elif angle > 100:
        bend = "bent at the knee in a partial squat"
    elif angle > 70:
        bend = "deeply bent in a squat position"
    else:
        bend = "very deeply bent with knee tucked"

    # Height/lift
    if ankle[1] < hip[1]:
        lift = "kicked up high"
    elif ankle[1] < knee[1] - 0.1:
        lift = "lifted off the ground"
    else:
        lift = "planted on the ground"

    # Spread
    other_hip = get_point(landmarks, f'{"right" if side == "left" else "left"}_hip')
    other_ankle = get_point(landmarks, f'{"right" if side == "left" else "left"}_ankle')
    if other_ankle is not None and other_hip is not None:
        stance_width = abs(ankle[0] - other_ankle[0])
        hip_width = abs(hip[0] - other_hip[0])
        if stance_width > hip_width * 1.8:
            spread = "in a wide stance"
        elif stance_width > hip_width * 1.2:
            spread = "slightly wider than hip-width"
        elif stance_width < hip_width * 0.5:
            spread = "with feet close together"
        else:
            spread = "at about hip-width"
    else:
        spread = ""

    parts = [f"The {side} leg is {bend}", lift]
    if spread:
        parts.append(spread)
    return ", ".join(parts) + "."


def describe_torso(landmarks: list) -> str:
    """Generate PoseScript-style description of torso/core."""
    ls = get_point(landmarks, 'left_shoulder')
    rs = get_point(landmarks, 'right_shoulder')
    lh = get_point(landmarks, 'left_hip')
    rh = get_point(landmarks, 'right_hip')

    if ls is None or rs is None or lh is None or rh is None:
        return "The torso is not clearly visible."

    mid_shoulder = (ls + rs) / 2
    mid_hip = (lh + rh) / 2
    spine_vec = mid_shoulder - mid_hip

    # Lean
    lean_angle = math.degrees(math.atan2(spine_vec[0], -spine_vec[1]))
    if abs(lean_angle) < 5:
        lean = "upright and centered"
    elif lean_angle > 15:
        lean = "leaning significantly to the right"
    elif lean_angle > 5:
        lean = "leaning slightly to the right"
    elif lean_angle < -15:
        lean = "leaning significantly to the left"
    else:
        lean = "leaning slightly to the left"

    # Forward/back
    if abs(spine_vec[2]) > 0.05:
        forward = "leaning forward" if spine_vec[2] > 0 else "leaning backward"
    else:
        forward = "vertically aligned"

    # Rotation (shoulder line vs hip line)
    shoulder_vec = rs - ls
    hip_vec = rh - lh
    shoulder_angle = math.degrees(math.atan2(shoulder_vec[2], shoulder_vec[0]))
    hip_angle = math.degrees(math.atan2(hip_vec[2], hip_vec[0]))
    rotation = shoulder_angle - hip_angle

    if abs(rotation) < 10:
        twist = "facing forward"
    elif rotation > 10:
        twist = "twisted with shoulders rotated to the right"
    else:
        twist = "twisted with shoulders rotated to the left"

    return f"The torso is {lean}, {forward}, {twist}."


def describe_head(landmarks: list) -> str:
    """Generate PoseScript-style description of head position."""
    nose = get_point(landmarks, 'nose')
    left_ear = get_point(landmarks, 'left_ear')
    right_ear = get_point(landmarks, 'right_ear')
    mid_shoulder = None

    ls = get_point(landmarks, 'left_shoulder')
    rs = get_point(landmarks, 'right_shoulder')
    if ls is not None and rs is not None:
        mid_shoulder = (ls + rs) / 2

    if nose is None or mid_shoulder is None:
        return "The head position is not clearly visible."

    head_rel = nose - mid_shoulder

    # Tilt
    if left_ear is not None and right_ear is not None:
        ear_diff = left_ear[1] - right_ear[1]
        if abs(ear_diff) > 0.03:
            tilt = "tilted to the right" if ear_diff > 0 else "tilted to the left"
        else:
            tilt = "level"
    else:
        tilt = "level"

    # Turn
    if left_ear is not None and right_ear is not None:
        ear_z_diff = left_ear[2] - right_ear[2]
        if abs(ear_z_diff) > 0.03:
            turn = "turned to the left" if ear_z_diff > 0 else "turned to the right"
        else:
            turn = "facing forward"
    else:
        turn = "facing forward"

    # Up/down
    if head_rel[1] < -0.2:
        updown = "chin lifted up"
    elif head_rel[2] > 0.05:
        updown = "chin tucked down"
    else:
        updown = "at a neutral angle"

    return f"The head is {tilt}, {turn}, with {updown}."


def describe_pose(landmarks: list) -> str:
    """
    Generate a full PoseScript-style description of a pose
    from MediaPipe 33-point landmarks.
    """
    descriptions = [
        describe_arm(landmarks, 'left'),
        describe_arm(landmarks, 'right'),
        describe_leg(landmarks, 'left'),
        describe_leg(landmarks, 'right'),
        describe_torso(landmarks),
        describe_head(landmarks),
    ]
    return "\n".join(descriptions)


def describe_correction(ref_landmarks: list, user_landmarks: list) -> str:
    """
    Generate PoseFix-style correction text comparing reference pose to user pose.
    Inspired by: "PoseFix: Correcting 3D Human Poses with Natural Language" (ICCV 2023)
    """
    corrections = []

    # Compare each body part
    parts = [
        ('left arm', describe_arm, 'left'),
        ('right arm', describe_arm, 'right'),
        ('left leg', describe_leg, 'left'),
        ('right leg', describe_leg, 'right'),
        ('torso', None, None),
        ('head', None, None),
    ]

    for part_name, fn, side in parts:
        if fn and side:
            ref_desc = fn(ref_landmarks, side)
            user_desc = fn(user_landmarks, side)
        elif part_name == 'torso':
            ref_desc = describe_torso(ref_landmarks)
            user_desc = describe_torso(user_landmarks)
        elif part_name == 'head':
            ref_desc = describe_head(ref_landmarks)
            user_desc = describe_head(user_landmarks)
        else:
            continue

        if ref_desc != user_desc:
            corrections.append({
                'part': part_name,
                'target': ref_desc,
                'actual': user_desc,
            })

    if not corrections:
        return "Great form! Your pose closely matches the reference."

    text_parts = []
    for c in corrections:
        text_parts.append(
            f"**{c['part'].title()}:**\n"
            f"  Target: {c['target']}\n"
            f"  Yours: {c['actual']}"
        )

    return "\n\n".join(text_parts)


def describe_session_corrections(session_data: list) -> dict:
    """
    Analyze a full session of pose comparisons and generate
    aggregate PoseScript-style descriptions.

    session_data: list of dicts with 'ref_landmarks', 'user_landmarks', 'timestamp', 'score'
    """
    if not session_data:
        return {"description": "No session data available.", "corrections": []}

    # Find the worst moments
    sorted_by_score = sorted(session_data, key=lambda x: x.get('score', 100))
    worst_moments = sorted_by_score[:5]  # Top 5 worst frames

    all_corrections = []
    for moment in worst_moments:
        ref = moment.get('ref_landmarks', [])
        user = moment.get('user_landmarks', [])
        ts = moment.get('timestamp', 0)
        score = moment.get('score', 0)

        if ref and user:
            correction = describe_correction(ref, user)
            all_corrections.append({
                'timestamp': ts,
                'score': score,
                'correction': correction,
            })

    # Generate overall description
    if session_data[0].get('ref_landmarks'):
        ref_desc = describe_pose(session_data[0]['ref_landmarks'])
    else:
        ref_desc = "Reference pose not available."

    return {
        "reference_description": ref_desc,
        "corrections": all_corrections,
        "total_frames": len(session_data),
        "avg_score": sum(d.get('score', 0) for d in session_data) / len(session_data),
    }
