/**
 * Audio Coach v4 — PoseScript-powered real-time voice feedback
 *
 * Uses PoseScript's anatomical pose descriptions to generate natural,
 * context-aware corrections in real-time during dance practice.
 * Voice cues are intentionally sparse and only triggered when useful.
 */

import { generatePoseScriptCorrection } from './poseScriptRT.js';

const MIN_SPEAK_INTERVAL_MS = 12000;
const REPEAT_WINDOW_MS = 26000;
const INTERVENTION_THRESHOLD = 48;

let lastSpeakTime = 0;
let lastMessage = '';
let lastSpokenSegment = null;
let enabled = true;
let voicesReady = false;
let preferredVoice = null;
let coachVolume = 0.72;

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
 * Called every comparison frame (~100ms), but only speaks occasionally.
 */
export function generateVoiceCue(comparison, refLandmarks, userLandmarks) {
    if (!enabled || !comparison || !window.speechSynthesis) return;
    if (!comparison.segments) return;

    const now = Date.now();
    if (now - lastSpeakTime < MIN_SPEAK_INTERVAL_MS) return;

    const { segment: worstSegment, score: worstScore } = getWorstSegment(comparison);
    if (!worstSegment || worstScore === null || worstScore > INTERVENTION_THRESHOLD) return;

    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) return;

    const correction = generatePoseScriptCorrection(comparison, refLandmarks, userLandmarks);
    if (!correction) return;

    const message = sanitizeCorrection(correction);
    if (!message || message.length < 6) return;

    const repeatedMessage = message === lastMessage;
    const repeatedSegment = worstSegment === lastSpokenSegment;
    if ((repeatedMessage || repeatedSegment) && now - lastSpeakTime < REPEAT_WINDOW_MS) {
        return;
    }

    speak(message);
    lastSpeakTime = now;
    lastMessage = message;
    lastSpokenSegment = worstSegment;
}

function getWorstSegment(comparison) {
    let worst = null;
    let worstScore = 100;

    for (const [key, score] of Object.entries(comparison.segments)) {
        if (score !== null && score < worstScore) {
            worstScore = score;
            worst = key;
        }
    }

    return {
        segment: worst,
        score: worst ? worstScore : null,
    };
}

function sanitizeCorrection(text) {
    if (!text) return '';
    return text
        .replace(/\s+/g, ' ')
        .replace(/[!]{2,}/g, '!')
        .trim();
}

function speak(text) {
    const synth = window.speechSynthesis;
    if (!synth) return;

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.94;
    u.pitch = 0.98;
    u.volume = coachVolume;
    if (preferredVoice) u.voice = preferredVoice;
    synth.speak(u);
}

export function setAudioCoachEnabled(val) {
    enabled = val;
    if (!val) window.speechSynthesis?.cancel();
}

export function setAudioCoachVolume(nextVolume) {
    coachVolume = Math.max(0, Math.min(1, Number(nextVolume) || 0));
}

export function isAudioCoachEnabled() { return enabled; }

export function resetAudioCoach() {
    lastSpeakTime = 0;
    lastMessage = '';
    lastSpokenSegment = null;
    window.speechSynthesis?.cancel();
}
