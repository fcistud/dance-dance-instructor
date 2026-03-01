/**
 * NVIDIA Nemotron AI Feedback — Calls the Python backend which combines
 * PoseScript-style pose descriptions with Nemotron AI for rich coaching.
 *
 * Backend: FastAPI at /api/feedback (proxied via Vite in dev, direct URL in prod)
 * Fallback: Direct Nemotron API when a user-provided key is available
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const BACKEND_URL = import.meta.env.DEV ? '/api/feedback' : `${API_BASE}/api/feedback`;
const FALLBACK_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'nvidia/llama-3.3-nemotron-super-49b-v1';

/**
 * Generate smart AI coaching feedback.
 * Tries backend first (PoseScript + Nemotron), falls back to direct Nemotron.
 */
export async function generateAIFeedback(sessionAnalysis, apiKey, sessionFrames = null) {
    const trimmedKey = apiKey?.trim() || '';

    // Try Python backend first (has PoseScript analysis)
    const backendResult = await callBackend(sessionAnalysis, trimmedKey, sessionFrames);
    if (backendResult.feedback) {
        return backendResult.feedback;
    }

    // Fallback to direct Nemotron only when personal key is provided
    if (trimmedKey) {
        const fallbackResult = await callNemotronDirect(sessionAnalysis, trimmedKey);
        if (fallbackResult.feedback) {
            return fallbackResult.feedback;
        }

        if (backendResult.error) {
            return `${backendResult.error}\n\nDirect fallback failed: ${fallbackResult.error}`;
        }
        return fallbackResult.error;
    }

    if (backendResult.error) {
        return `${backendResult.error}\n\nTip: add a personal NVIDIA API key for direct fallback.`;
    }

    return 'AI feedback is currently unavailable. Please try again.';
}

async function callBackend(sessionAnalysis, apiKey, sessionFrames) {
    try {
        const response = await fetch(BACKEND_URL, {
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

            if (response.status === 400 && /no api key/i.test(detail)) {
                return {
                    feedback: null,
                    error: 'Backend is reachable, but no NVIDIA API key is configured on the server.',
                };
            }

            if (response.status >= 500) {
                return {
                    feedback: null,
                    error: `Backend error (${response.status}). ${detail || 'Check backend logs.'}`,
                };
            }

            return {
                feedback: null,
                error: `Backend request failed (${response.status}). ${detail || 'Please try again.'}`,
            };
        }

        const data = await response.json();
        if (!data.feedback) {
            return {
                feedback: null,
                error: 'Backend returned no feedback text.',
            };
        }
        return { feedback: data.feedback, error: null };
    } catch (err) {
        const missingApiBaseHint = !import.meta.env.DEV && !API_BASE
            ? ' VITE_API_BASE_URL is not set for this build.'
            : '';
        const reason = err?.message ? ` (${err.message})` : '';
        return {
            feedback: null,
            error: `Could not reach backend at ${BACKEND_URL}${reason}.${missingApiBaseHint} Ensure backend is deployed and CORS is configured.`,
        };
    }
}

async function callNemotronDirect(sessionAnalysis, apiKey) {
    const { overallAvg, focusAreas, strengths, timeline } = sessionAnalysis;

    let prompt = `Analyze my dance session and give PoseScript-style corrections:\n\n`;
    prompt += `Overall accuracy: ${Math.round(overallAvg)}%\n\n`;

    if (focusAreas?.length > 0) {
        prompt += `PROBLEM AREAS:\n`;
        for (const area of focusAreas.slice(0, 3)) {
            prompt += `- ${area.label}: ${Math.round(area.avg)}% match`;
            if (area.trend > 5) prompt += ` [improving]`;
            if (area.trend < -5) prompt += ` [declining]`;
            prompt += `\n`;
        }
        prompt += `\n`;
    }

    if (strengths?.length > 0) {
        prompt += `STRONG AREAS: ${strengths.map(s => `${s.label} (${Math.round(s.avg)}%)`).join(', ')}\n\n`;
    }

    if (timeline?.length > 0) {
        prompt += `TIMELINE:\n`;
        for (const phase of timeline) {
            prompt += `- ${phase.label}: ${phase.avg}%`;
            if (phase.weakestSegment) prompt += ` (weakest: ${phase.weakestSegment})`;
            prompt += `\n`;
        }
    }

    prompt += `\nGive specific corrections. What should I practice first?`;

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
                    { role: 'system', content: 'You are DanceCoach AI, an expert dance instructor. Give warm, specific feedback under 200 words. Use dance terminology and end with encouragement.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 400,
                temperature: 0.7,
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
        return { feedback: null, error: `Could not connect to NVIDIA API: ${err.message}` };
    }
}

function parseErrorDetail(rawText) {
    if (!rawText) return '';

    try {
        const parsed = JSON.parse(rawText);
        return parsed?.detail || parsed?.error?.message || rawText;
    } catch {
        return rawText;
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
    try { localStorage.setItem('nemotron_api_key', key); } catch { }
}
