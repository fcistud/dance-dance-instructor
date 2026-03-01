/**
 * Nemotron AI feedback client.
 *
 * Strategy:
 * 1. Prefer backend route (PoseScript + Nemotron) for reliable CORS and richer context.
 * 2. If backend fails and personal key exists, attempt direct Nemotron call.
 * 3. Return readable diagnostics when deployment config is missing.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const FALLBACK_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'nvidia/llama-3.3-nemotron-super-49b-v1';
const BACKEND_STORAGE_KEY = 'improve_ai_backend_base_url';

function normalizeBase(base) {
    if (!base) return '';
    return String(base).trim().replace(/\/$/, '');
}

function isGitHubPages() {
    return typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
}

function unique(list) {
    return [...new Set(list.filter(Boolean))];
}

function buildBackendCandidates(backendOverride) {
    const override = normalizeBase(backendOverride);
    const stored = normalizeBase(getStoredBackendUrl());
    const configured = normalizeBase(API_BASE);
    const candidates = [];

    if (import.meta.env.DEV) {
        candidates.push('/api/feedback');
    }

    // Same-origin API should be first on hosts that support server routes (e.g. Vercel).
    if (!import.meta.env.DEV && !isGitHubPages()) {
        candidates.push('/api/feedback');
    }

    for (const base of [override, stored, configured]) {
        if (!base) continue;
        candidates.push(`${base}/api/feedback`);
        candidates.push(`${base}/feedback`);
    }

    return unique(candidates);
}

/**
 * Generate coaching feedback. Returns a plain readable string.
 */
export async function generateAIFeedback(sessionAnalysis, apiKey, sessionFrames = null, backendOverride = '') {
    const trimmedKey = apiKey?.trim() || '';
    const backendResult = await callBackend(sessionAnalysis, trimmedKey, sessionFrames, backendOverride);
    if (backendResult.feedback) return backendResult.feedback;

    if (trimmedKey) {
        const fallbackResult = await callNemotronDirect(sessionAnalysis, trimmedKey);
        if (fallbackResult.feedback) return fallbackResult.feedback;

        const backendError = backendResult.error ? `${backendResult.error}\n\n` : '';
        return `${backendError}Direct fallback failed: ${fallbackResult.error}`;
    }

    if (backendResult.error) {
        return `${backendResult.error}\n\nTip: add a personal NVIDIA key or configure a backend URL.`;
    }

    return 'AI feedback is unavailable right now. Please try again.';
}

async function callBackend(sessionAnalysis, apiKey, sessionFrames, backendOverride) {
    const endpoints = buildBackendCandidates(backendOverride);

    if (endpoints.length === 0) {
        return {
            feedback: null,
            error: 'No backend URL is configured for this deployment. Add one under "Use Personal Key".',
        };
    }

    let lastError = '';

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_analysis: sessionAnalysis,
                    session_frames: sessionFrames,
                    api_key: apiKey || null,
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                const detail = parseErrorDetail(errText);
                const detailLower = detail.toLowerCase();

                if (response.status === 400 && /no api key/i.test(detail)) {
                    return {
                        feedback: null,
                        error: 'Backend is reachable, but no NVIDIA API key is configured there.',
                    };
                }

                if (
                    /deployment_not_found/i.test(detailLower) ||
                    /this deployment cannot be found/i.test(detailLower)
                ) {
                    lastError = `Configured backend URL is dead at ${endpoint}. Update it in Connection Settings.`;
                    continue;
                }

                if (response.status === 405 && endpoint.startsWith('/api') && isGitHubPages()) {
                    lastError = 'Backend request failed (405). GitHub Pages is static-only. Set a deployed backend URL.';
                    continue;
                }

                if (response.status === 404) {
                    lastError = `Backend route not found at ${endpoint}. Verify backend deployment and route mapping.`;
                    continue;
                }

                if (response.status >= 500) {
                    lastError = `Backend error (${response.status}) at ${endpoint}: ${detail || 'Check backend logs.'}`;
                    continue;
                }

                lastError = `Backend request failed (${response.status}) at ${endpoint}. ${detail || ''}`.trim();
                continue;
            }

            const data = await response.json();
            if (!data.feedback) {
                lastError = `Backend at ${endpoint} returned no feedback text.`;
                continue;
            }

            return { feedback: data.feedback, error: null };
        } catch (err) {
            const reason = err?.message ? ` (${err.message})` : '';
            lastError = `Could not reach backend at ${endpoint}${reason}. Check CORS and deployment URL.`;
        }
    }

    return {
        feedback: null,
        error: lastError || 'All backend endpoints failed.',
    };
}

async function callNemotronDirect(sessionAnalysis, apiKey) {
    const { overallAvg, focusAreas, strengths, timeline } = sessionAnalysis;

    let prompt = 'Analyze my dance session and provide practical coaching:\n\n';
    prompt += `Overall accuracy: ${Math.round(overallAvg)}%\n\n`;

    if (focusAreas?.length > 0) {
        prompt += 'MAIN WEAKNESSES:\n';
        for (const area of focusAreas.slice(0, 3)) {
            prompt += `- ${area.label}: ${Math.round(area.avg)}%`;
            if (area.trend > 5) prompt += ' (improving)';
            if (area.trend < -5) prompt += ' (declining)';
            prompt += '\n';
        }
        prompt += '\n';
    }

    if (strengths?.length > 0) {
        prompt += `STRENGTHS: ${strengths.map((s) => `${s.label} ${Math.round(s.avg)}%`).join(', ')}\n\n`;
    }

    if (timeline?.length > 0) {
        prompt += 'TIMELINE SNAPSHOT:\n';
        for (const phase of timeline) {
            prompt += `- ${phase.label}: ${phase.avg}%`;
            if (phase.weakestSegment) prompt += ` (weakest: ${phase.weakestSegment})`;
            prompt += '\n';
        }
    }

    prompt += '\nGive concise instructor-style feedback with clear drills and timestamp references when possible.';

    try {
        const response = await fetch(FALLBACK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert dance coach. Be specific, warm, and practical. Keep it under 220 words.'
                    },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 420,
                temperature: 0.65,
                stream: false,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            const detail = parseErrorDetail(errText);
            if (response.status === 401 || response.status === 403) {
                return { feedback: null, error: 'Personal NVIDIA API key was rejected. Check that the key is valid.' };
            }
            return { feedback: null, error: `NVIDIA API error (${response.status}): ${detail || 'Request failed.'}` };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            return { feedback: null, error: 'NVIDIA API returned no feedback content.' };
        }

        return { feedback: content, error: null };
    } catch (err) {
        return {
            feedback: null,
            error: `Could not connect to NVIDIA API: ${err.message || 'network error'}`
        };
    }
}

function parseErrorDetail(rawText) {
    if (!rawText) return '';

    try {
        const parsed = JSON.parse(rawText);
        const detail = parsed?.detail || parsed?.error?.message || rawText;
        return String(detail).slice(0, 240);
    } catch {
        return String(rawText).replace(/\s+/g, ' ').slice(0, 240);
    }
}

export function getStoredApiKey() {
    try {
        const envKey = import.meta.env.VITE_NEMOTRON_API_KEY;
        if (envKey) return envKey;
        return localStorage.getItem('nemotron_api_key') || '';
    } catch {
        return '';
    }
}

export function storeApiKey(key) {
    try {
        localStorage.setItem('nemotron_api_key', key || '');
    } catch {
        // ignore storage errors
    }
}

export function getStoredBackendUrl() {
    try {
        return localStorage.getItem(BACKEND_STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

export function storeBackendUrl(url) {
    try {
        localStorage.setItem(BACKEND_STORAGE_KEY, normalizeBase(url));
    } catch {
        // ignore storage errors
    }
}
