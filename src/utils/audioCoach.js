/**
 * Audio Coach v4 — PoseScript-powered real-time voice feedback
 *
 * Uses PoseScript's anatomical pose descriptions to generate natural,
 * context-aware corrections in real-time during dance practice.
 *
 * Example output:
 * - "Reach your left arm up overhead!"
 * - "Straighten your right leg!"
 * - "Beautiful form! Keep it up!"
 */

import { generatePoseScriptCorrection, generatePoseScriptPraise } from './poseScriptRT.js';

const COOLDOWN_MS = 3000;
const SCORE_THRESHOLD = 55;
const PRAISE_THRESHOLD = 82;
const PRAISE_COOLDOWN_MS = 8000;

let lastSpeakTime = 0;
let lastPraiseTime = 0;
let lastSpokenSegment = null;
let enabled = true;
let voicesReady = false;
let preferredVoice = null;

// Pre-load voices on first user interaction
export function initVoices() {
    if (voicesReady) return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    const loadVoices = () => {
        const voices = synth.getVoices();
        if (voices.length === 0) return;
        preferredVoice = voices.find(v =>
            v.name.includes('Samantha') || v.name.includes('Google US') ||
            v.name.includes('Karen') || v.name.includes('Moira')
        ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
        voicesReady = true;
    };

    synth.onvoiceschanged = loadVoices;
    loadVoices();

    // Warm up with silent utterance
    const warm = new SpeechSynthesisUtterance('');
    warm.volume = 0;
    synth.speak(warm);
}

/**
 * Generate and speak a voice cue using PoseScript analysis.
 * Called every comparison frame (~100ms), but only speaks every COOLDOWN_MS.
 */
export function generateVoiceCue(comparison, refLandmarks, userLandmarks) {
    if (!enabled || !comparison || !window.speechSynthesis) return;

    const now = Date.now();
    if (now - lastSpeakTime < COOLDOWN_MS) return;

    // Try PoseScript correction first
    const correction = generatePoseScriptCorrection(comparison, refLandmarks, userLandmarks);

    if (correction) {
        // Avoid repeating the same segment correction
        const worstSeg = getWorstSegment(comparison);
        if (worstSeg === lastSpokenSegment && now - lastSpeakTime < COOLDOWN_MS * 2) return;

        speak(correction);
        lastSpeakTime = now;
        lastSpokenSegment = worstSeg;
        return;
    }

    // Praise when doing well
    if (comparison.overall >= PRAISE_THRESHOLD && now - lastPraiseTime > PRAISE_COOLDOWN_MS) {
        const praise = generatePoseScriptPraise(comparison);
        if (praise) {
            speak(praise);
            lastSpeakTime = now;
            lastPraiseTime = now;
        }
    }
}

function getWorstSegment(comparison) {
    let worst = null, worstScore = 100;
    for (const [key, score] of Object.entries(comparison.segments)) {
        if (score !== null && score < worstScore) {
            worstScore = score;
            worst = key;
        }
    }
    return worst;
}

function speak(text) {
    const synth = window.speechSynthesis;
    if (!synth) return;

    synth.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1;
    u.pitch = 1.05;
    u.volume = 0.85;
    if (preferredVoice) u.voice = preferredVoice;
    synth.speak(u);
}

export function setAudioCoachEnabled(val) {
    enabled = val;
    if (!val) window.speechSynthesis?.cancel();
}

export function isAudioCoachEnabled() { return enabled; }

export function resetAudioCoach() {
    lastSpeakTime = 0;
    lastPraiseTime = 0;
    lastSpokenSegment = null;
    window.speechSynthesis?.cancel();
}
