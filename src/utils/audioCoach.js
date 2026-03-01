/**
 * Audio Coach v5 — human cadence + non-intrusive intervention policy.
 *
 * Voice only intervenes when correction is needed.
 * Praise is shown visually in the UI (not spoken) to avoid noisy coaching.
 */

import { generatePoseScriptCorrection } from './poseScriptRT.js';

const COOLDOWN_MS = 6500;
const MIN_INTERVENTION_SCORE = 62;
const REPEAT_SEGMENT_COOLDOWN_MS = 12000;
const REPEAT_PHRASE_COOLDOWN_MS = 15000;

let lastSpeakTime = 0;
let lastPhraseTime = 0;
let lastSpokenSegment = null;
let lastPhrase = '';
let enabled = true;
let voicesReady = false;
let preferredVoice = null;
let coachVolume = 0.85;
let speechQueue = [];
let isSpeaking = false;

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
    if (comparison.overall >= MIN_INTERVENTION_SCORE) return;

    const correction = generatePoseScriptCorrection(comparison, refLandmarks, userLandmarks);
    if (!correction) return;

    const worstSeg = getWorstSegment(comparison);
    if (worstSeg === lastSpokenSegment && now - lastSpeakTime < REPEAT_SEGMENT_COOLDOWN_MS) return;

    if (correction === lastPhrase && now - lastPhraseTime < REPEAT_PHRASE_COOLDOWN_MS) return;

    enqueueSpeech(correction);
    lastSpeakTime = now;
    lastSpokenSegment = worstSeg;
    lastPhrase = correction;
    lastPhraseTime = now;
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

function speakNow(text) {
    const synth = window.speechSynthesis;
    if (!synth) return;

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1.0;
    u.volume = coachVolume;
    if (preferredVoice) u.voice = preferredVoice;
    u.onstart = () => {
        isSpeaking = true;
    };
    u.onend = () => {
        isSpeaking = false;
        flushQueue();
    };
    u.onerror = () => {
        isSpeaking = false;
        flushQueue();
    };
    synth.speak(u);
}

function enqueueSpeech(text) {
    if (!text) return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    if (isSpeaking || synth.speaking || synth.pending) {
        // Keep only one queued correction so feedback stays concise.
        speechQueue = [text];
        return;
    }

    speakNow(text);
}

function flushQueue() {
    if (speechQueue.length === 0) return;
    const next = speechQueue.shift();
    if (next) speakNow(next);
}

export function setAudioCoachEnabled(val) {
    enabled = val;
    if (!val) {
        speechQueue = [];
        isSpeaking = false;
        window.speechSynthesis?.cancel();
    }
}

export function setAudioCoachVolume(nextVolume) {
    coachVolume = Math.max(0, Math.min(1, Number(nextVolume) || 0));
}

export function isAudioCoachEnabled() { return enabled; }

export function resetAudioCoach() {
    lastSpeakTime = 0;
    lastPhraseTime = 0;
    lastSpokenSegment = null;
    lastPhrase = '';
    speechQueue = [];
    isSpeaking = false;
    window.speechSynthesis?.cancel();
}
