import {
  FilesetResolver,
  PoseLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const POSE_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [24, 26],
  [25, 27],
  [26, 28],
  [27, 29],
  [28, 30],
  [29, 31],
  [30, 32],
  [27, 31],
  [28, 32]
];

const PARTS = {
  head: [0, 2, 5, 7, 8, 9, 10],
  torso: [11, 12, 23, 24],
  leftArm: [11, 13, 15, 17, 19, 21],
  rightArm: [12, 14, 16, 18, 20, 22],
  leftLeg: [23, 25, 27, 29, 31],
  rightLeg: [24, 26, 28, 30, 32]
};

const PART_LABELS = {
  head: "Head/Neck",
  torso: "Torso",
  leftArm: "Left Arm",
  rightArm: "Right Arm",
  leftLeg: "Left Leg",
  rightLeg: "Right Leg"
};

const PART_WEIGHTS = {
  head: 0.1,
  torso: 0.24,
  leftArm: 0.18,
  rightArm: 0.18,
  leftLeg: 0.15,
  rightLeg: 0.15
};

const el = {
  targetInput: document.getElementById("targetInput"),
  userInput: document.getElementById("userInput"),
  targetVideo: document.getElementById("targetVideo"),
  userVideo: document.getElementById("userVideo"),
  targetCanvas: document.getElementById("targetCanvas"),
  userCanvas: document.getElementById("userCanvas"),
  targetStatus: document.getElementById("targetStatus"),
  userStatus: document.getElementById("userStatus"),
  speedControl: document.getElementById("speedControl"),
  targetMuteBtn: document.getElementById("targetMuteBtn"),
  targetVolDownBtn: document.getElementById("targetVolDownBtn"),
  targetVolUpBtn: document.getElementById("targetVolUpBtn"),
  userSourceSelect: document.getElementById("userSourceSelect"),
  userUploadWrap: document.getElementById("userUploadWrap"),
  mirrorMode: document.getElementById("mirrorMode"),
  coachEnableBtn: document.getElementById("coachEnableBtn"),
  coachMuteBtn: document.getElementById("coachMuteBtn"),
  coachVolDownBtn: document.getElementById("coachVolDownBtn"),
  coachVolUpBtn: document.getElementById("coachVolUpBtn"),
  voiceMode: document.getElementById("voiceMode"),
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  endBtn: document.getElementById("endBtn"),
  liveScore: document.getElementById("liveScore"),
  qualityBand: document.getElementById("qualityBand"),
  weakPart: document.getElementById("weakPart"),
  sessionTime: document.getElementById("sessionTime"),
  partBars: document.getElementById("partBars"),
  coachFeed: document.getElementById("coachFeed"),
  analyticsSection: document.getElementById("analyticsSection"),
  sessionSummary: document.getElementById("sessionSummary"),
  accuracyChart: document.getElementById("accuracyChart"),
  rankingList: document.getElementById("rankingList"),
  weakMoments: document.getElementById("weakMoments"),
  improvementTips: document.getElementById("improvementTips"),
  movementDescriptors: document.getElementById("movementDescriptors"),
  replayTarget: document.getElementById("replayTarget"),
  replayUser: document.getElementById("replayUser"),
  syncReplayBtn: document.getElementById("syncReplayBtn"),
  replayLock: document.getElementById("replayLock"),
  replayScrubber: document.getElementById("replayScrubber"),
  replayTimeLabel: document.getElementById("replayTimeLabel"),
  levelValue: document.getElementById("levelValue"),
  levelMeta: document.getElementById("levelMeta"),
  xpValue: document.getElementById("xpValue"),
  xpMeta: document.getElementById("xpMeta"),
  comboValue: document.getElementById("comboValue"),
  nemotronBtn: document.getElementById("nemotronBtn"),
  nemotronMode: document.getElementById("nemotronMode"),
  proxyBaseUrl: document.getElementById("proxyBaseUrl"),
  nemotronKeyWrap: document.getElementById("nemotronKeyWrap"),
  nemotronKey: document.getElementById("nemotronKey"),
  nemotronOutput: document.getElementById("nemotronOutput"),
  leaderboardName: document.getElementById("leaderboardName"),
  submitScoreBtn: document.getElementById("submitScoreBtn"),
  leaderboardStatus: document.getElementById("leaderboardStatus"),
  leaderboardList: document.getElementById("leaderboardList"),
  leaderboardScope: document.getElementById("leaderboardScope")
};

const state = {
  poseLandmarkerTarget: null,
  poseLandmarkerUser: null,
  poseTimestampMs: {
    target: 0,
    user: 0
  },
  sessionActive: false,
  paused: false,
  frameId: 0,
  userSource: "webcam",
  userStream: null,
  targetUrl: null,
  userUrl: null,
  webcamRecordingUrl: null,
  recorder: null,
  recorderChunks: [],
  targetLandmarks: null,
  userLandmarks: null,
  startTimestamp: 0,
  sessionDuration: 0,
  history: [],
  partTotals: initPartTotals(),
  weakMoments: [],
  tipCounts: new Map(),
  angleTotals: new Map(),
  latestTip: "",
  lastSpeechAt: 0,
  lastSampleAt: 0,
  xp: 0,
  level: 1,
  combo: 0,
  bestCombo: 0,
  targetVolume: 0.75,
  targetMuted: false,
  coachEnabled: true,
  coachVolume: 0.72,
  coachMuted: false,
  badges: [],
  replaySyncTimer: 0,
  semanticSamples: [],
  targetFrameBuffer: [],
  userFrameBuffer: [],
  timingOffsetSec: 0.24,
  lastTimingUpdateAt: 0,
  timingOffsets: [],
  lastCoachAt: 0,
  lastCoachKey: "",
  perfectHits: 0,
  replaySyncSuppress: false,
  comboMilestonesSeen: new Set(),
  sessionScoreCard: null,
  leaderboardEntries: []
};

const SPEECH_INTERVAL_MS = 3800;
const SAMPLE_INTERVAL_MS = 120;
const LOW_SCORE_THRESHOLD = 60;
const MAX_BUFFER_SECONDS = 8;
const TIMING_UPDATE_INTERVAL_SECONDS = 0.75;
const TIP_COOLDOWN_SECONDS = 1.35;
const PERFECT_HIT_THRESHOLD = 88;
const MIN_LANDMARK_VISIBILITY = 0.24;
const MIN_TARGET_COVERAGE = 0.34;
const MIN_USER_COVERAGE = 0.3;
const XP_BASE_LEVEL_COST = 100;
const XP_LEVEL_STEP = 55;
const CHART_PAD = { left: 42, right: 18, top: 18, bottom: 34 };
const LOCAL_LEADERBOARD_KEY = "improveai.leaderboard.v1";
const AUDIO_SETTINGS_KEY = "improveai.audio.v1";

function initPartTotals() {
  return Object.keys(PARTS).reduce((acc, key) => {
    acc[key] = { sum: 0, count: 0 };
    return acc;
  }, {});
}

function init() {
  renderPartBars(Object.keys(PARTS).reduce((acc, part) => ({ ...acc, [part]: 0 }), {}));
  el.proxyBaseUrl.value = suggestDefaultProxyBase();
  handleNemotronModeChange();
  setNemotronOutput("AI-enhanced feedback will appear here.");
  hydrateAudioSettings();
  updateGamificationHud();
  hydrateLeaderboardName();
  bindEvents();
  prepareCanvases();
  refreshLeaderboard();
  initializePose().catch((error) => {
    console.error(error);
    setStatus(el.targetStatus, "Pose model error", "error");
    logCoach("Pose model failed to load. Refresh and retry.", true);
  });
  startWebcam().catch((error) => {
    console.error(error);
    setStatus(el.userStatus, "Webcam blocked", "error");
    logCoach("Webcam access denied. Switch to upload mode.", true);
  });
}

function bindEvents() {
  el.targetInput.addEventListener("change", handleTargetUpload);
  el.userInput.addEventListener("change", handleUserUpload);
  el.speedControl.addEventListener("change", handleSpeedChange);
  el.userSourceSelect.addEventListener("change", handleUserSourceChange);
  el.mirrorMode.addEventListener("change", applyMirrorMode);
  el.targetMuteBtn.addEventListener("click", toggleTargetMute);
  el.targetVolDownBtn.addEventListener("click", () => adjustTargetVolume(-0.12));
  el.targetVolUpBtn.addEventListener("click", () => adjustTargetVolume(0.12));
  el.coachEnableBtn.addEventListener("click", toggleCoachEnabled);
  el.coachMuteBtn.addEventListener("click", toggleCoachMute);
  el.coachVolDownBtn.addEventListener("click", () => adjustCoachVolume(-0.12));
  el.coachVolUpBtn.addEventListener("click", () => adjustCoachVolume(0.12));
  el.startBtn.addEventListener("click", startSession);
  el.pauseBtn.addEventListener("click", togglePause);
  el.endBtn.addEventListener("click", () => endSession("Manually ended"));
  el.syncReplayBtn.addEventListener("click", syncReplay);
  el.weakMoments.addEventListener("click", handleWeakMomentJump);
  el.nemotronBtn.addEventListener("click", generateNemotronFeedback);
  el.nemotronMode.addEventListener("change", handleNemotronModeChange);
  el.accuracyChart.addEventListener("click", handleChartJump);
  el.replayScrubber.addEventListener("input", handleReplayScrub);
  el.replayLock.addEventListener("change", handleReplayLockChange);
  el.nemotronOutput.addEventListener("click", handleNemotronTimeJump);
  el.submitScoreBtn.addEventListener("click", submitLeaderboardEntry);
  el.proxyBaseUrl.addEventListener("change", refreshLeaderboard);
  el.leaderboardName.addEventListener("change", persistLeaderboardName);

  el.targetVideo.addEventListener("ended", () => {
    if (state.sessionActive) {
      endSession("Reference video complete");
    }
  });
  el.targetVideo.addEventListener("loadedmetadata", prepareCanvases);
  el.targetVideo.addEventListener("loadedmetadata", applyTargetAudioSettings);
  el.userVideo.addEventListener("loadedmetadata", prepareCanvases);
  el.replayTarget.addEventListener("ended", stopReplaySync);
  el.replayTarget.addEventListener("timeupdate", handleReplayTargetTimeUpdate);
  el.replayTarget.addEventListener("seeked", handleReplayTargetSeeked);
  el.replayTarget.addEventListener("loadedmetadata", updateReplayControls);
  el.replayTarget.addEventListener("loadedmetadata", applyTargetAudioSettings);
  el.replayUser.addEventListener("seeked", handleReplayUserSeeked);
  el.replayUser.addEventListener("timeupdate", handleReplayUserTimeUpdate);
  el.replayUser.addEventListener("loadedmetadata", updateReplayControls);

  window.addEventListener("resize", prepareCanvases);
}

function suggestDefaultProxyBase() {
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }
  return "";
}

function handleNemotronModeChange() {
  const directMode = el.nemotronMode.value === "direct";
  el.nemotronKeyWrap.classList.toggle("hidden", !directMode);
}

function hydrateLeaderboardName() {
  const stored = window.localStorage.getItem("improveai.playerName");
  if (stored) {
    el.leaderboardName.value = stored;
  }
}

function persistLeaderboardName() {
  const name = sanitizePlayerName(el.leaderboardName.value);
  el.leaderboardName.value = name;
  if (name) {
    window.localStorage.setItem("improveai.playerName", name);
  }
}

function hydrateAudioSettings() {
  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Number.isFinite(Number(saved.targetVolume))) {
        state.targetVolume = clamp(Number(saved.targetVolume), 0, 1);
      }
      state.targetMuted = Boolean(saved.targetMuted);
      if (typeof saved.coachEnabled === "boolean") {
        state.coachEnabled = saved.coachEnabled;
      } else if (typeof saved.audioCoachEnabled === "boolean") {
        state.coachEnabled = saved.audioCoachEnabled;
      }
      if (Number.isFinite(Number(saved.coachVolume))) {
        state.coachVolume = clamp(Number(saved.coachVolume), 0, 1);
      }
      state.coachMuted = Boolean(saved.coachMuted);
    }
  } catch {
    // keep defaults
  }

  applyTargetAudioSettings();
  applyCoachAudioSettings();
  updateAudioButtons();
}

function persistAudioSettings() {
  const payload = {
    targetVolume: state.targetVolume,
    targetMuted: state.targetMuted,
    coachEnabled: state.coachEnabled,
    coachVolume: state.coachVolume,
    coachMuted: state.coachMuted
  };
  window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(payload));
}

function toggleTargetMute() {
  state.targetMuted = !state.targetMuted;
  applyTargetAudioSettings();
  updateAudioButtons();
  persistAudioSettings();
}

function adjustTargetVolume(delta) {
  state.targetVolume = clamp(state.targetVolume + delta, 0, 1);
  if (state.targetVolume <= 0.001) {
    state.targetMuted = true;
  } else if (delta > 0) {
    state.targetMuted = false;
  }
  applyTargetAudioSettings();
  updateAudioButtons();
  persistAudioSettings();
}

function applyTargetAudioSettings() {
  const volume = state.targetMuted ? 0 : state.targetVolume;
  el.targetVideo.volume = volume;
  el.targetVideo.muted = state.targetMuted;
  el.replayTarget.volume = volume;
  el.replayTarget.muted = state.targetMuted;
}

function toggleCoachEnabled() {
  state.coachEnabled = !state.coachEnabled;
  applyCoachAudioSettings();
  updateAudioButtons();
  persistAudioSettings();
}

function toggleCoachMute() {
  state.coachMuted = !state.coachMuted;
  applyCoachAudioSettings();
  updateAudioButtons();
  persistAudioSettings();
}

function adjustCoachVolume(delta) {
  state.coachVolume = clamp(state.coachVolume + delta, 0, 1);
  if (state.coachVolume <= 0.001) {
    state.coachMuted = true;
  } else if (delta > 0) {
    state.coachMuted = false;
  }
  applyCoachAudioSettings();
  updateAudioButtons();
  persistAudioSettings();
}

function applyCoachAudioSettings() {
  if (!state.coachEnabled || state.coachMuted || state.coachVolume <= 0.01) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
}

function updateAudioButtons() {
  const targetOn = !state.targetMuted && state.targetVolume > 0.01;
  el.targetMuteBtn.textContent = targetOn ? "🔊" : "🔇";
  el.targetMuteBtn.dataset.active = targetOn ? "true" : "false";

  const coachOn = state.coachEnabled;
  const coachAudible = coachOn && !state.coachMuted && state.coachVolume > 0.01;
  el.coachEnableBtn.textContent = coachOn ? "🎙" : "⏹";
  el.coachEnableBtn.dataset.active = coachOn ? "true" : "false";
  el.coachMuteBtn.textContent = coachAudible ? "🔈" : "🔇";
  el.coachMuteBtn.dataset.active = coachAudible ? "true" : "false";
}

function setNemotronOutput(text) {
  el.nemotronOutput.innerHTML = renderFeedbackRichText(text);
}

function renderFeedbackRichText(text) {
  const source = String(text || "").trim();
  if (!source) {
    return "<p>No AI feedback returned.</p>";
  }

  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const out = [];
  let listBuffer = [];
  for (const line of lines) {
    const listMatch = line.match(/^([-*]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      listBuffer.push(listMatch[2]);
      continue;
    }
    if (listBuffer.length) {
      out.push(`<ul>${listBuffer.map((item) => `<li>${decorateTimes(item)}</li>`).join("")}</ul>`);
      listBuffer = [];
    }
    out.push(`<p>${decorateTimes(line)}</p>`);
  }
  if (listBuffer.length) {
    out.push(`<ul>${listBuffer.map((item) => `<li>${decorateTimes(item)}</li>`).join("")}</ul>`);
  }
  return out.join("");
}

function decorateTimes(text) {
  const regex = /\b(\d{1,2}:\d{2}|\d+(?:\.\d+)?s)\b/g;
  let last = 0;
  let html = "";
  let match;
  while ((match = regex.exec(text)) !== null) {
    const token = match[1];
    const seconds = parseTimeToken(token);
    html += escapeHtml(text.slice(last, match.index));
    if (Number.isFinite(seconds)) {
      html += `<button class="time-jump" data-jump="${seconds.toFixed(2)}">${escapeHtml(
        token
      )}</button>`;
    } else {
      html += escapeHtml(token);
    }
    last = regex.lastIndex;
  }
  html += escapeHtml(text.slice(last));
  return html;
}

function parseTimeToken(token) {
  if (token.includes(":")) {
    const [mins, secs] = token.split(":").map(Number);
    if (Number.isFinite(mins) && Number.isFinite(secs)) {
      return mins * 60 + secs;
    }
    return NaN;
  }
  if (token.endsWith("s")) {
    return Number(token.slice(0, -1));
  }
  return NaN;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function handleNemotronTimeJump(event) {
  const button = event.target.closest("button[data-jump]");
  if (!button) {
    return;
  }
  const time = Number(button.dataset.jump);
  if (!Number.isFinite(time)) {
    return;
  }
  jumpReplayTo(time, true);
}

function handleChartJump(event) {
  if (!state.history.length) {
    return;
  }
  const rect = el.accuracyChart.getBoundingClientRect();
  const padLeftPx = (CHART_PAD.left / el.accuracyChart.width) * rect.width;
  const padRightPx = (CHART_PAD.right / el.accuracyChart.width) * rect.width;
  const graphWidth = Math.max(1, rect.width - padLeftPx - padRightPx);
  const x = clamp(event.clientX - rect.left - padLeftPx, 0, graphWidth);
  const ratio = x / graphWidth;
  const maxTime = state.history[state.history.length - 1].time || 0;
  const jumpTime = ratio * maxTime;
  jumpReplayTo(jumpTime, true);
}

function updateReplayControls() {
  const targetDuration = Number.isFinite(el.replayTarget.duration) ? el.replayTarget.duration : 0;
  const userDuration = Number.isFinite(el.replayUser.duration) ? el.replayUser.duration : 0;
  const duration =
    targetDuration && userDuration
      ? Math.min(targetDuration, userDuration)
      : Math.max(targetDuration, userDuration);
  el.replayScrubber.max = String(duration || 0);
  const current = clamp(el.replayTarget.currentTime || 0, 0, duration || 0);
  el.replayScrubber.value = String(current);
  el.replayTimeLabel.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
}

function jumpReplayTo(time, autoplay = false) {
  if (!el.replayTarget.src || !el.replayUser.src) {
    prepareReplaySources();
  }
  if (!el.replayTarget.src || !el.replayUser.src) {
    if (autoplay) {
      logCoach("Replay is available after the session recording is ready.", true);
    }
    return;
  }

  const max = Number(el.replayScrubber.max || 0);
  const clamped = clamp(time, 0, max || time || 0);

  state.replaySyncSuppress = true;
  if (el.replayTarget.src) {
    el.replayTarget.currentTime = clamped;
  }
  if (el.replayUser.src) {
    el.replayUser.currentTime = clamped;
  }
  el.replayScrubber.value = String(clamped);
  updateReplayControls();
  state.replaySyncSuppress = false;

  if (autoplay) {
    el.replayTarget.play().catch(() => {});
    el.replayUser.play().catch(() => {});
    startReplayDriftCorrection();
  }
}

function handleReplayScrub() {
  const time = Number(el.replayScrubber.value);
  if (!Number.isFinite(time)) {
    return;
  }
  jumpReplayTo(time, !el.replayTarget.paused);
}

function handleReplayLockChange() {
  if (el.replayLock.checked) {
    jumpReplayTo(el.replayTarget.currentTime || 0, false);
  }
}

function handleReplayTargetSeeked() {
  if (!el.replayLock.checked || state.replaySyncSuppress) {
    return;
  }
  jumpReplayTo(el.replayTarget.currentTime || 0, false);
}

function handleReplayTargetTimeUpdate() {
  if (state.replaySyncSuppress) {
    return;
  }
  if (el.replayLock.checked && el.replayUser.src) {
    const drift = Math.abs((el.replayTarget.currentTime || 0) - (el.replayUser.currentTime || 0));
    if (drift > 0.14) {
      state.replaySyncSuppress = true;
      el.replayUser.currentTime = el.replayTarget.currentTime;
      state.replaySyncSuppress = false;
    }
  }
  updateReplayControls();
}

function handleReplayUserSeeked() {
  if (!el.replayLock.checked || state.replaySyncSuppress) {
    return;
  }
  jumpReplayTo(el.replayUser.currentTime || 0, false);
}

function handleReplayUserTimeUpdate() {
  if (state.replaySyncSuppress) {
    return;
  }
  if (el.replayLock.checked && el.replayTarget.src) {
    const drift = Math.abs((el.replayUser.currentTime || 0) - (el.replayTarget.currentTime || 0));
    if (drift > 0.22 && el.replayTarget.paused) {
      state.replaySyncSuppress = true;
      el.replayTarget.currentTime = el.replayUser.currentTime;
      state.replaySyncSuppress = false;
      updateReplayControls();
    }
  }
}

function prepareCanvases() {
  resizeCanvas(el.targetVideo, el.targetCanvas);
  resizeCanvas(el.userVideo, el.userCanvas);
}

function resizeCanvas(videoEl, canvasEl) {
  const rect = videoEl.getBoundingClientRect();
  canvasEl.width = Math.max(640, Math.round(rect.width || 640));
  canvasEl.height = Math.max(360, Math.round(rect.height || 360));
}

async function initializePose() {
  setStatus(el.targetStatus, "Loading pose model", "loading");
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  const poseOptions = {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.35,
    minPosePresenceConfidence: 0.35,
    minTrackingConfidence: 0.35
  };
  try {
    state.poseLandmarkerTarget = await PoseLandmarker.createFromOptions(vision, poseOptions);
    state.poseLandmarkerUser = await PoseLandmarker.createFromOptions(vision, poseOptions);
  } catch (gpuError) {
    console.warn("GPU delegate unavailable, retrying on CPU.", gpuError);
    const cpuOptions = {
      ...poseOptions,
      baseOptions: { ...poseOptions.baseOptions, delegate: "CPU" }
    };
    state.poseLandmarkerTarget = await PoseLandmarker.createFromOptions(vision, cpuOptions);
    state.poseLandmarkerUser = await PoseLandmarker.createFromOptions(vision, cpuOptions);
  }
  setStatus(el.targetStatus, "Model ready", "ok");
}

function setStatus(element, text, stateName) {
  element.textContent = text;
  element.classList.remove("highlight");
  if (stateName === "error") {
    element.style.borderColor = "rgba(255, 111, 89, 0.6)";
    element.style.color = "#ff9b8d";
  } else if (stateName === "ok") {
    element.style.borderColor = "rgba(85, 239, 196, 0.6)";
    element.style.color = "#7df2d1";
  } else if (stateName === "loading") {
    element.style.borderColor = "rgba(253, 180, 75, 0.55)";
    element.style.color = "#ffd08f";
  } else {
    element.style.borderColor = "rgba(77, 215, 255, 0.45)";
    element.style.color = "#4dd7ff";
  }
}

async function handleTargetUpload(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  if (state.targetUrl) {
    URL.revokeObjectURL(state.targetUrl);
  }

  state.targetUrl = URL.createObjectURL(file);
  el.targetVideo.src = state.targetUrl;
  el.targetVideo.load();
  applyTargetAudioSettings();
  await el.targetVideo.play().catch(() => {});
  el.targetVideo.pause();
  setStatus(el.targetStatus, `Loaded: ${trimName(file.name)}`, "ok");
  prepareCanvases();
}

async function handleUserUpload(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  if (state.userUrl) {
    URL.revokeObjectURL(state.userUrl);
  }

  state.userUrl = URL.createObjectURL(file);
  el.userVideo.srcObject = null;
  el.userVideo.src = state.userUrl;
  el.userVideo.load();
  await el.userVideo.play().catch(() => {});
  el.userVideo.pause();
  setStatus(el.userStatus, `Loaded: ${trimName(file.name)}`, "ok");
  prepareCanvases();
}

function trimName(name) {
  if (name.length <= 26) {
    return name;
  }
  return `${name.slice(0, 23)}...`;
}

function handleSpeedChange() {
  const speed = Number(el.speedControl.value);
  el.targetVideo.playbackRate = speed;
  if (el.replayTarget.src) {
    el.replayTarget.playbackRate = speed;
  }
}

async function handleUserSourceChange() {
  state.userSource = el.userSourceSelect.value;
  el.userUploadWrap.classList.toggle("hidden", state.userSource !== "upload");

  if (state.userSource === "webcam") {
    await startWebcam();
    setStatus(el.userStatus, "Webcam ready", "ok");
  } else {
    stopWebcam();
    el.userVideo.srcObject = null;
    el.userVideo.src = "";
    setStatus(el.userStatus, "Upload required", "loading");
  }
}

async function startWebcam() {
  if (state.userStream) {
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 }
    },
    audio: false
  });

  state.userStream = stream;
  el.userVideo.srcObject = stream;
  await el.userVideo.play();
  setStatus(el.userStatus, "Webcam ready", "ok");
  applyMirrorMode();
  prepareCanvases();
}

function stopWebcam() {
  if (!state.userStream) {
    return;
  }
  state.userStream.getTracks().forEach((track) => track.stop());
  state.userStream = null;
}

function applyMirrorMode() {
  const mirrored = el.mirrorMode.checked;
  el.userVideo.style.transform = mirrored ? "scaleX(-1)" : "scaleX(1)";
  el.userCanvas.style.transform = mirrored ? "scaleX(-1)" : "scaleX(1)";
}

async function startSession() {
  if (!state.poseLandmarkerTarget || !state.poseLandmarkerUser) {
    logCoach("Pose model still loading.", true);
    return;
  }

  if (!state.targetUrl) {
    logCoach("Upload a target dance video first.", true);
    return;
  }

  if (state.userSource === "upload" && !state.userUrl) {
    logCoach("Upload your practice video or switch to webcam.", true);
    return;
  }

  if (state.userSource === "webcam" && !state.userStream) {
    await startWebcam().catch(() => {
      logCoach("Webcam unavailable. Use upload mode.", true);
    });
    if (!state.userStream) {
      return;
    }
  }

  resetSessionData();
  state.sessionActive = true;
  state.paused = false;
  state.startTimestamp = performance.now();

  el.startBtn.disabled = true;
  el.pauseBtn.disabled = false;
  el.endBtn.disabled = false;
  el.analyticsSection.classList.add("hidden");
  el.sessionSummary.textContent = "Session in progress";

  el.targetVideo.currentTime = 0;
  await el.targetVideo.play().catch(() => {});

  if (state.userSource === "upload") {
    el.userVideo.currentTime = 0;
    await el.userVideo.play().catch(() => {});
  }

  startRecordingIfNeeded();
  logCoach("Session started. Match timing, shape, and range.", false);
  runLoop();
}

function resetSessionData() {
  state.history = [];
  state.partTotals = initPartTotals();
  state.weakMoments = [];
  state.tipCounts = new Map();
  state.angleTotals = new Map();
  state.sessionDuration = 0;
  state.latestTip = "";
  state.lastSpeechAt = 0;
  state.lastSampleAt = 0;
  state.combo = 0;
  state.bestCombo = 0;
  state.semanticSamples = [];
  state.targetFrameBuffer = [];
  state.userFrameBuffer = [];
  state.timingOffsetSec = state.userSource === "webcam" ? 0.24 : 0;
  state.lastTimingUpdateAt = 0;
  state.timingOffsets = [];
  state.lastCoachAt = 0;
  state.lastCoachKey = "";
  state.perfectHits = 0;
  state.comboMilestonesSeen = new Set();
  state.sessionScoreCard = null;
  state.poseTimestampMs = { target: 0, user: 0 };

  el.liveScore.textContent = "0%";
  el.qualityBand.textContent = "Warm-up";
  el.weakPart.textContent = "-";
  el.sessionTime.textContent = "00:00";

  renderPartBars(Object.keys(PARTS).reduce((acc, part) => ({ ...acc, [part]: 0 }), {}));
  el.coachFeed.innerHTML = "";
  setNemotronOutput("AI-enhanced feedback will appear here.");
  el.movementDescriptors.innerHTML = "";
  el.submitScoreBtn.disabled = true;
  el.leaderboardStatus.textContent = "Session in progress. Finish to submit your score.";
  updateGamificationHud();
}

function startRecordingIfNeeded() {
  if (state.webcamRecordingUrl) {
    URL.revokeObjectURL(state.webcamRecordingUrl);
    state.webcamRecordingUrl = null;
  }

  if (state.userSource !== "webcam" || !state.userStream || !("MediaRecorder" in window)) {
    return;
  }

  state.recorderChunks = [];
  try {
    state.recorder = new MediaRecorder(state.userStream, {
      mimeType: "video/webm;codecs=vp9"
    });
  } catch {
    state.recorder = new MediaRecorder(state.userStream);
  }

  state.recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      state.recorderChunks.push(event.data);
    }
  };

  state.recorder.onstop = () => {
    if (!state.recorderChunks.length) {
      return;
    }
    const blob = new Blob(state.recorderChunks, { type: "video/webm" });
    state.webcamRecordingUrl = URL.createObjectURL(blob);
    prepareReplaySources();
  };

  state.recorder.start(250);
}

function togglePause() {
  if (!state.sessionActive) {
    return;
  }

  state.paused = !state.paused;
  el.pauseBtn.textContent = state.paused ? "Resume" : "Pause";

  if (state.paused) {
    el.targetVideo.pause();
    if (state.userSource === "upload") {
      el.userVideo.pause();
    }
    cancelAnimationFrame(state.frameId);
    logCoach("Session paused.", false);
  } else {
    el.targetVideo.play().catch(() => {});
    if (state.userSource === "upload") {
      el.userVideo.play().catch(() => {});
    }
    runLoop();
  }
}

function endSession(reason) {
  if (!state.sessionActive) {
    return;
  }

  state.sessionActive = false;
  state.paused = false;
  cancelAnimationFrame(state.frameId);

  el.pauseBtn.textContent = "Pause";
  el.startBtn.disabled = false;
  el.pauseBtn.disabled = true;
  el.endBtn.disabled = true;

  el.targetVideo.pause();
  if (state.userSource === "upload") {
    el.userVideo.pause();
  }

  if (state.recorder && state.recorder.state !== "inactive") {
    state.recorder.stop();
  }
  stopReplaySync();

  finalizeAnalytics(reason);
}

function runLoop() {
  if (!state.sessionActive || state.paused) {
    return;
  }

  const now = performance.now();
  state.sessionDuration = (now - state.startTimestamp) / 1000;
  el.sessionTime.textContent = formatTime(state.sessionDuration);

  const targetResult = detectPose(el.targetVideo, "target");
  const userResult = detectPose(el.userVideo, "user");

  state.targetLandmarks = targetResult;
  state.userLandmarks = userResult;

  drawPose(el.targetVideo, el.targetCanvas, targetResult);
  drawPose(el.userVideo, el.userCanvas, userResult);

  if (targetResult && userResult && now - state.lastSampleAt >= SAMPLE_INTERVAL_MS) {
    state.lastSampleAt = now;
    const targetCoverage = landmarkCoverage(targetResult);
    const userCoverage = landmarkCoverage(userResult);
    if (targetCoverage < MIN_TARGET_COVERAGE || userCoverage < MIN_USER_COVERAGE) {
      if (state.sessionDuration - state.lastCoachAt > 2.8) {
        logCoach("Step fully into frame so shoulders, hips, knees and ankles are visible.", true);
        state.lastCoachAt = state.sessionDuration;
      }
      state.frameId = requestAnimationFrame(runLoop);
      return;
    }

    const targetNorm = normalizeLandmarks(targetResult);
    const userNorm = normalizeLandmarks(userResult);
    pushFrame(state.targetFrameBuffer, state.sessionDuration, targetResult, targetNorm);
    pushFrame(state.userFrameBuffer, state.sessionDuration, userResult, userNorm);
    maybeUpdateTimingOffset(state.sessionDuration);
    state.timingOffsets.push(state.timingOffsetSec);

    const alignedTarget =
      getFrameAt(
        state.targetFrameBuffer,
        state.sessionDuration - state.timingOffsetSec,
        0.32
      ) || { raw: targetResult, norm: targetNorm, time: state.sessionDuration };

    const frameAnalysis = comparePoses(
      alignedTarget.raw,
      userResult,
      alignedTarget.norm,
      userNorm,
      state.timingOffsetSec
    );
    applyLiveAnalysis(frameAnalysis, state.sessionDuration);
  }

  state.frameId = requestAnimationFrame(runLoop);
}

function pushFrame(buffer, time, raw, norm) {
  buffer.push({ time, raw, norm });
  const cutoff = time - MAX_BUFFER_SECONDS;
  while (buffer.length && buffer[0].time < cutoff) {
    buffer.shift();
  }
}

function getFrameAt(buffer, time, toleranceSeconds) {
  let best = null;
  let bestDelta = Infinity;
  for (const frame of buffer) {
    const delta = Math.abs(frame.time - time);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = frame;
    }
  }
  if (!best || bestDelta > toleranceSeconds) {
    return null;
  }
  return best;
}

function maybeUpdateTimingOffset(currentTime) {
  if (currentTime - state.lastTimingUpdateAt < TIMING_UPDATE_INTERVAL_SECONDS) {
    return;
  }
  state.lastTimingUpdateAt = currentTime;

  const offsets = [];
  for (let s = -0.2; s <= 0.8; s += 0.05) {
    offsets.push(Number(s.toFixed(2)));
  }

  let bestOffset = state.timingOffsetSec;
  let bestScore = -Infinity;
  for (const offset of offsets) {
    const score = timingAlignmentScore(offset, currentTime);
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  if (bestScore <= -Infinity + 1) {
    return;
  }

  const smooth = state.userSource === "webcam" ? 0.85 : 0.9;
  state.timingOffsetSec = clamp(
    state.timingOffsetSec * smooth + bestOffset * (1 - smooth),
    -0.2,
    0.8
  );
}

function timingAlignmentScore(offset, currentTime) {
  const recentUserFrames = state.userFrameBuffer.filter((f) => f.time > currentTime - 3.2);
  if (recentUserFrames.length < 6 || state.targetFrameBuffer.length < 6) {
    return -Infinity;
  }

  let scoreSum = 0;
  let count = 0;
  for (let i = 0; i < recentUserFrames.length; i += 2) {
    const userFrame = recentUserFrames[i];
    const targetFrame = getFrameAt(state.targetFrameBuffer, userFrame.time - offset, 0.22);
    if (!targetFrame) {
      continue;
    }
    const e = averagePointError(
      targetFrame.norm,
      userFrame.norm,
      [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
    );
    scoreSum += Math.exp(-e * 1.9);
    count += 1;
  }
  return count ? scoreSum / count : -Infinity;
}

function detectPose(videoEl, streamKey) {
  const landmarker =
    streamKey === "target" ? state.poseLandmarkerTarget : state.poseLandmarkerUser;
  if (!landmarker || videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) {
    return null;
  }

  const ts = nextPoseTimestamp(videoEl, streamKey);
  let result = null;
  try {
    result = landmarker.detectForVideo(videoEl, ts);
  } catch (error) {
    console.warn(`Pose detect failed for ${streamKey}.`, error);
    return null;
  }
  if (!result.landmarks || !result.landmarks[0]) {
    return null;
  }
  return result.landmarks[0];
}

function nextPoseTimestamp(videoEl, streamKey) {
  const mediaTimeMs = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime * 1000 : NaN;
  let ts = Number.isFinite(mediaTimeMs) && mediaTimeMs > 0 ? mediaTimeMs : performance.now();
  const last = state.poseTimestampMs[streamKey] || 0;
  if (ts <= last) {
    ts = last + 1;
  }
  state.poseTimestampMs[streamKey] = ts;
  return ts;
}

function getVideoContainBox(videoEl, canvasEl) {
  const videoWidth = videoEl.videoWidth || canvasEl.width;
  const videoHeight = videoEl.videoHeight || canvasEl.height;
  const canvasAspect = canvasEl.width / canvasEl.height;
  const videoAspect = videoWidth / videoHeight;

  if (!Number.isFinite(videoAspect) || videoAspect <= 0) {
    return {
      x: 0,
      y: 0,
      width: canvasEl.width,
      height: canvasEl.height
    };
  }

  if (videoAspect > canvasAspect) {
    const width = canvasEl.width;
    const height = width / videoAspect;
    return {
      x: 0,
      y: (canvasEl.height - height) / 2,
      width,
      height
    };
  }

  const height = canvasEl.height;
  const width = height * videoAspect;
  return {
    x: (canvasEl.width - width) / 2,
    y: 0,
    width,
    height
  };
}

function drawPose(videoEl, canvasEl, landmarks) {
  const ctx = canvasEl.getContext("2d");
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  if (!landmarks) {
    return;
  }
  const box = getVideoContainBox(videoEl, canvasEl);
  const mapX = (x) => box.x + x * box.width;
  const mapY = (y) => box.y + y * box.height;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(77, 215, 255, 0.92)";
  for (const [from, to] of POSE_CONNECTIONS) {
    const a = landmarks[from];
    const b = landmarks[to];
    if (!a || !b || !isVisible(a) || !isVisible(b)) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(mapX(a.x), mapY(a.y));
    ctx.lineTo(mapX(b.x), mapY(b.y));
    ctx.stroke();
  }

  for (const point of landmarks) {
    if (!isVisible(point)) {
      continue;
    }
    ctx.fillStyle = "rgba(253, 180, 75, 0.94)";
    ctx.beginPath();
    ctx.arc(mapX(point.x), mapY(point.y), 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function isVisible(point) {
  return (point.visibility ?? 1) > MIN_LANDMARK_VISIBILITY;
}

function landmarkCoverage(landmarks, indexes = [11, 12, 23, 24, 25, 26, 27, 28]) {
  let visible = 0;
  for (const idx of indexes) {
    if (landmarks[idx] && isVisible(landmarks[idx])) {
      visible += 1;
    }
  }
  return visible / indexes.length;
}

function normalizeLandmarks(landmarks) {
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  if (!leftHip || !rightHip || !leftShoulder || !rightShoulder) {
    return landmarks;
  }

  const center = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: ((leftHip.z ?? 0) + (rightHip.z ?? 0)) / 2
  };

  const shoulderSpan = distance2d(leftShoulder, rightShoulder);
  const hipSpan = distance2d(leftHip, rightHip);
  const scale = Math.max((shoulderSpan + hipSpan) / 2, 0.001);

  return landmarks.map((p) => ({
    x: (p.x - center.x) / scale,
    y: (p.y - center.y) / scale,
    z: ((p.z ?? 0) - center.z) / scale,
    visibility: p.visibility
  }));
}

function comparePoses(
  targetLandmarks,
  userLandmarks,
  targetNorm = normalizeLandmarks(targetLandmarks),
  userNorm = normalizeLandmarks(userLandmarks),
  timingOffsetSec = 0
) {

  const partScores = {};
  let weightedScore = 0;

  for (const [part, indexes] of Object.entries(PARTS)) {
    const error = averagePointError(targetNorm, userNorm, indexes);
    const score = clamp(100 * Math.exp(-error * 1.75), 0, 100);
    partScores[part] = score;
    weightedScore += score * PART_WEIGHTS[part];
  }

  const targetSemantic = semanticDescriptor(targetLandmarks);
  const userSemantic = semanticDescriptor(userLandmarks);
  const semanticIssue = compareSemanticPose(targetSemantic, userSemantic);
  const angleInsights = compareJointAngles(targetNorm, userNorm);
  const positionIssue = positionalTip(targetNorm, userNorm);
  const weakestPart = Object.entries(partScores).sort((a, b) => a[1] - b[1])[0][0];
  const weakestScore = partScores[weakestPart];
  const timingIssue = timingTip(timingOffsetSec);
  const partIssue = partSpecificTip(weakestPart, weakestScore);

  const fallbackIssue = {
    text: fallbackTipByPart(weakestPart, weakestScore),
    key: `fallback:${weakestPart}`
  };
  const angleIssue = angleInsights.primaryTip
    ? {
        text: `${angleInsights.primaryTip} (${Math.round(
          Math.abs(angleInsights.biggestDiff)
        )}° difference).`,
        key: `joint:${angleInsights.primaryJoint || "unknown"}`
      }
    : null;

  let selectedIssue = fallbackIssue;
  if (Math.abs(timingOffsetSec) > 0.35 && weakestScore > 58 && timingIssue.text) {
    selectedIssue = timingIssue;
  } else if (weakestScore < 66) {
    selectedIssue = partIssue;
  } else if (semanticIssue.text) {
    selectedIssue = semanticIssue;
  } else if (angleIssue) {
    selectedIssue = angleIssue;
  } else if (positionIssue.text) {
    selectedIssue = positionIssue;
  } else if (Math.abs(timingOffsetSec) > 0.22 && timingIssue.text) {
    selectedIssue = timingIssue;
  }

  return {
    overall: clamp(weightedScore, 0, 100),
    partScores,
    weakestPart,
    qualityBand: qualityBand(weightedScore),
    tip: selectedIssue.text,
    tipKey: selectedIssue.key,
    timingOffsetSec,
    angleInsights,
    targetSemantic,
    userSemantic,
    tipUrgent: weakestScore < 54 || Math.abs(timingOffsetSec) > 0.48
  };
}

function averagePointError(target, user, indexes) {
  let sum = 0;
  let count = 0;
  for (const idx of indexes) {
    const t = target[idx];
    const u = user[idx];
    if (!t || !u) {
      continue;
    }
    if ((t.visibility ?? 1) < 0.35 || (u.visibility ?? 1) < 0.35) {
      continue;
    }
    sum += Math.sqrt(
      Math.pow(t.x - u.x, 2) +
        Math.pow(t.y - u.y, 2) +
        Math.pow((t.z ?? 0) - (u.z ?? 0), 2)
    );
    count += 1;
  }
  return count ? sum / count : 1;
}

function compareSemanticPose(targetSemantic, userSemantic) {
  if (targetSemantic.bothHandsUp && !userSemantic.bothHandsUp) {
    return {
      text: "Bring both hands above shoulder level for this move.",
      key: "semantic:hands_up"
    };
  }

  if (!targetSemantic.bothHandsUp && userSemantic.bothHandsUp) {
    return {
      text: "Drop your hands slightly to match the reference level.",
      key: "semantic:hands_down"
    };
  }

  if (targetSemantic.isSquat && !userSemantic.isSquat) {
    return {
      text: "Bend your knees more. You should be in a deeper squat here.",
      key: "semantic:deeper_squat"
    };
  }

  if (!targetSemantic.isSquat && userSemantic.isSquat) {
    return {
      text: "Come up a little. You are crouching deeper than the target.",
      key: "semantic:less_squat"
    };
  }

  if (targetSemantic.wideStance && !userSemantic.wideStance) {
    return { text: "Step wider with your feet to match stance width.", key: "semantic:wider" };
  }

  if (!targetSemantic.wideStance && userSemantic.wideStance) {
    return {
      text: "Narrow your stance slightly for cleaner alignment.",
      key: "semantic:narrower"
    };
  }

  if (
    targetSemantic.leanDirection !== "center" &&
    userSemantic.leanDirection !== targetSemantic.leanDirection
  ) {
    return {
      text: `Shift your torso ${targetSemantic.leanDirection} to match the groove.`,
      key: `semantic:lean_${targetSemantic.leanDirection}`
    };
  }

  return { text: "", key: "" };
}

function semanticDescriptor(landmarks) {
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  if (
    !leftWrist ||
    !rightWrist ||
    !leftShoulder ||
    !rightShoulder ||
    !leftHip ||
    !rightHip ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) {
    return {
      bothHandsUp: false,
      isSquat: false,
      wideStance: false,
      leanDirection: "center"
    };
  }

  const hipsHeight = (leftHip.y + rightHip.y) / 2;
  const kneesHeight = (leftKnee.y + rightKnee.y) / 2;
  const shoulderWidth = Math.max(distance2d(leftShoulder, rightShoulder), 0.01);
  const ankleSpread = distance2d(leftAnkle, rightAnkle);
  const stanceRatio = ankleSpread / shoulderWidth;
  const leftKneeAngle = jointAngle(landmarks, 23, 25, 27);
  const rightKneeAngle = jointAngle(landmarks, 24, 26, 28);
  const kneeAngleAvg =
    (leftKneeAngle !== null ? leftKneeAngle : 170) / 2 +
    (rightKneeAngle !== null ? rightKneeAngle : 170) / 2;

  const bothHandsUp =
    leftWrist.y < leftShoulder.y - 0.05 &&
    rightWrist.y < rightShoulder.y - 0.05;

  const isSquat = kneeAngleAvg < 152 || hipsHeight > kneesHeight - 0.045;
  const wideStance = stanceRatio > 1.3;

  const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
  const hipCenterX = (leftHip.x + rightHip.x) / 2;
  const lean = shoulderCenterX - hipCenterX;
  const leanDirection = lean > 0.035 ? "right" : lean < -0.035 ? "left" : "center";

  return {
    bothHandsUp,
    isSquat,
    wideStance,
    leanDirection
  };
}

function positionalTip(target, user) {
  const rules = [
    {
      index: 15,
      axis: "y",
      threshold: 0.11,
      up: "Lift your left hand higher on the beat.",
      down: "Lower your left hand slightly to match level."
    },
    {
      index: 16,
      axis: "y",
      threshold: 0.11,
      up: "Lift your right hand higher on the beat.",
      down: "Lower your right hand slightly to match level."
    },
    {
      index: 25,
      axis: "y",
      threshold: 0.1,
      up: "Bend deeper through your left leg.",
      down: "Rise slightly on your left leg."
    },
    {
      index: 26,
      axis: "y",
      threshold: 0.1,
      up: "Bend deeper through your right leg.",
      down: "Rise slightly on your right leg."
    },
    {
      index: 11,
      axis: "x",
      threshold: 0.13,
      up: "Open your left shoulder line outward.",
      down: "Bring your left shoulder inward slightly."
    },
    {
      index: 12,
      axis: "x",
      threshold: 0.13,
      up: "Open your right shoulder line outward.",
      down: "Bring your right shoulder inward slightly."
    }
  ];

  let winner = "";
  let maxDeviation = 0;
  for (const rule of rules) {
    const t = target[rule.index];
    const u = user[rule.index];
    if (!t || !u) {
      continue;
    }
    const diff = u[rule.axis] - t[rule.axis];
    const absDiff = Math.abs(diff);
    if (absDiff > rule.threshold && absDiff > maxDeviation) {
      maxDeviation = absDiff;
      winner = diff > 0 ? rule.up : rule.down;
    }
  }

  return {
    text: winner,
    key: winner ? `position:${winner.slice(0, 24)}` : ""
  };
}

function timingTip(offsetSec) {
  const ms = Math.round(Math.abs(offsetSec) * 1000);
  if (offsetSec > 0.4) {
    return {
      text: `You are about ${ms}ms behind the beat. Start each move slightly earlier.`,
      key: "timing:late_hard"
    };
  }
  if (offsetSec > 0.22) {
    return {
      text: `Slightly late (${ms}ms). Anticipate the count by half a beat.`,
      key: "timing:late"
    };
  }
  if (offsetSec < -0.22) {
    return {
      text: `You are about ${ms}ms ahead. Hold each shape a little longer.`,
      key: "timing:early"
    };
  }
  return { text: "", key: "" };
}

function partSpecificTip(part, score) {
  const rounded = Math.round(score);
  const tips = {
    head: `Head/neck is ${rounded}%. Keep your gaze level and avoid bobbing between beats.`,
    torso: `Torso is ${rounded}%. Keep chest and hips connected; reduce side wobble.`,
    leftArm: `Left arm is ${rounded}%. Match pathway and fully extend on hit counts.`,
    rightArm: `Right arm is ${rounded}%. Match pathway and fully extend on hit counts.`,
    leftLeg: `Left leg is ${rounded}%. Commit to depth and push through the floor.`,
    rightLeg: `Right leg is ${rounded}%. Commit to depth and push through the floor.`
  };
  return {
    text: tips[part] || `Lowest area is ${rounded}%. Focus on cleaner shapes.`,
    key: `part:${part}`
  };
}

function compareJointAngles(target, user) {
  const joints = [
    {
      key: "left elbow",
      triplet: [11, 13, 15],
      tooOpenTip: "Bend your left elbow more.",
      tooClosedTip: "Straighten your left elbow slightly."
    },
    {
      key: "right elbow",
      triplet: [12, 14, 16],
      tooOpenTip: "Bend your right elbow more.",
      tooClosedTip: "Straighten your right elbow slightly."
    },
    {
      key: "left knee",
      triplet: [23, 25, 27],
      tooOpenTip: "Sink deeper by bending your left knee.",
      tooClosedTip: "Rise a bit and open your left knee angle."
    },
    {
      key: "right knee",
      triplet: [24, 26, 28],
      tooOpenTip: "Sink deeper by bending your right knee.",
      tooClosedTip: "Rise a bit and open your right knee angle."
    },
    {
      key: "left shoulder",
      triplet: [13, 11, 23],
      tooOpenTip: "Relax your left shoulder; keep it less flared.",
      tooClosedTip: "Open your left shoulder line more."
    },
    {
      key: "right shoulder",
      triplet: [14, 12, 24],
      tooOpenTip: "Relax your right shoulder; keep it less flared.",
      tooClosedTip: "Open your right shoulder line more."
    }
  ];

  let biggestDiff = 0;
  let primaryTip = "";
  let primaryJoint = "";

  for (const joint of joints) {
    const targetAngle = jointAngle(target, ...joint.triplet);
    const userAngle = jointAngle(user, ...joint.triplet);
    if (targetAngle === null || userAngle === null) {
      continue;
    }

    const diff = userAngle - targetAngle;
    trackAngle(joint.key, Math.abs(diff));

    if (Math.abs(diff) > Math.abs(biggestDiff)) {
      biggestDiff = diff;
      primaryJoint = joint.key;
      if (Math.abs(diff) > 14) {
        primaryTip = diff > 0 ? joint.tooOpenTip : joint.tooClosedTip;
      }
    }
  }

  return { biggestDiff, primaryTip, primaryJoint };
}

function jointAngle(points, a, b, c) {
  const p1 = points[a];
  const p2 = points[b];
  const p3 = points[c];
  if (!p1 || !p2 || !p3) {
    return null;
  }

  const ab = { x: p1.x - p2.x, y: p1.y - p2.y };
  const cb = { x: p3.x - p2.x, y: p3.y - p2.y };

  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag1 = Math.hypot(ab.x, ab.y);
  const mag2 = Math.hypot(cb.x, cb.y);
  const denom = mag1 * mag2;

  if (!denom) {
    return null;
  }

  const cosine = clamp(dot / denom, -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

function trackAngle(key, diffAbs) {
  const prev = state.angleTotals.get(key) ?? { sum: 0, count: 0 };
  state.angleTotals.set(key, {
    sum: prev.sum + diffAbs,
    count: prev.count + 1
  });
}

function fallbackTipByPart(part, score) {
  if (score > 84) {
    return "Great shape. Focus on timing for cleaner transitions.";
  }

  const tips = {
    head: "Keep your head steady and aligned with torso rhythm.",
    torso: "Anchor your core. Keep chest and hips moving in one intent.",
    leftArm: "Match left arm pathway and finish positions more precisely.",
    rightArm: "Match right arm pathway and finish positions more precisely.",
    leftLeg: "Drive from your left leg and commit to full range of motion.",
    rightLeg: "Drive from your right leg and commit to full range of motion."
  };

  return tips[part] || "Keep refining posture and timing.";
}

function qualityBand(score) {
  if (score >= 88) {
    return "Performance Mode";
  }
  if (score >= 74) {
    return "Strong";
  }
  if (score >= 60) {
    return "Learning";
  }
  return "Needs Focus";
}

function applyLiveAnalysis(analysis, t) {
  const overall = Math.round(analysis.overall);
  const coachLine = composeCoachLine(analysis, overall);
  el.liveScore.textContent = `${overall}%`;
  el.qualityBand.textContent = analysis.qualityBand;
  const timingBadge =
    Math.abs(analysis.timingOffsetSec) > 0.22
      ? ` (${analysis.timingOffsetSec > 0 ? "late" : "early"})`
      : "";
  el.weakPart.textContent = `${PART_LABELS[analysis.weakestPart]}${timingBadge}`;
  renderPartBars(analysis.partScores);

  state.history.push({
    time: t,
    overall,
    partScores: analysis.partScores,
    weakestPart: analysis.weakestPart,
    tip: coachLine,
    tipKey: analysis.tipKey,
    timingOffsetSec: analysis.timingOffsetSec
  });
  state.semanticSamples.push({
    time: t,
    target: analysis.targetSemantic,
    user: analysis.userSemantic,
    score: overall
  });

  for (const [part, score] of Object.entries(analysis.partScores)) {
    state.partTotals[part].sum += score;
    state.partTotals[part].count += 1;
  }

  if (overall < LOW_SCORE_THRESHOLD) {
    const prev = state.weakMoments[state.weakMoments.length - 1];
    if (!prev || t - prev.time > 2.4) {
      state.weakMoments.push({ time: t, score: overall, part: analysis.weakestPart });
    }
  }

  scoreGamification(overall);
  if (shouldEmitCoachUpdate(analysis.tipKey, t, analysis.tipUrgent)) {
    const tipCount = state.tipCounts.get(coachLine) || 0;
    state.tipCounts.set(coachLine, tipCount + 1);
    maybeSpeakTip(coachLine, {
      tipKey: analysis.tipKey,
      urgent: analysis.tipUrgent,
      overall,
      timingOffsetSec: analysis.timingOffsetSec
    });
    logCoach(coachLine, overall < 52 || analysis.tipUrgent);
  }
}

function composeCoachLine(analysis, overall) {
  const opener =
    overall >= 88
      ? "Nice groove."
      : overall >= 74
        ? "Good momentum."
        : "Let's clean this section.";
  const body = analysis.tip;
  const partFocus = `Focus on ${PART_LABELS[analysis.weakestPart].toLowerCase()}.`;
  const timing =
    Math.abs(analysis.timingOffsetSec) > 0.32
      ? `Timing is ${Math.round(Math.abs(analysis.timingOffsetSec) * 1000)}ms ${
          analysis.timingOffsetSec > 0 ? "late" : "early"
        }.`
      : "";
  return `${opener} ${partFocus} ${timing} ${body}`.replace(/\s+/g, " ").trim();
}

function shouldEmitCoachUpdate(tipKey, timeSec, urgent) {
  if (!tipKey) {
    return false;
  }
  const elapsed = timeSec - state.lastCoachAt;
  if (!urgent && elapsed < TIP_COOLDOWN_SECONDS) {
    return false;
  }
  if (tipKey === state.lastCoachKey && elapsed < 2.8) {
    return false;
  }
  state.lastCoachAt = timeSec;
  state.lastCoachKey = tipKey;
  return true;
}

function scoreGamification(overall) {
  const frameXp =
    0.08 +
    (overall / 100) * 0.2 +
    (overall >= 90 ? 0.24 : overall >= 80 ? 0.12 : 0) +
    Math.min(0.28, state.combo * 0.015);
  state.xp += frameXp;

  if (overall >= PERFECT_HIT_THRESHOLD) {
    state.perfectHits += 1;
  }

  if (overall >= 82) {
    state.combo += 1;
  } else {
    state.combo = Math.max(0, state.combo - 1);
  }

  state.bestCombo = Math.max(state.bestCombo, state.combo);
  updateGamificationHud();

  const milestone = [5, 10, 20].find((value) => value === state.combo);
  if (milestone && !state.comboMilestonesSeen.has(milestone)) {
    state.comboMilestonesSeen.add(milestone);
    logCoach(`Combo ${milestone}! Nice control. Keep that groove locked.`, false);
  }
}

function levelProgressFromXp(totalXp) {
  const xp = Math.max(0, totalXp);
  let level = 1;
  let consumed = 0;
  while (true) {
    const cost = XP_BASE_LEVEL_COST + (level - 1) * XP_LEVEL_STEP;
    if (xp < consumed + cost) {
      const intoLevel = xp - consumed;
      return {
        level,
        levelCost: cost,
        intoLevel,
        toNext: Math.ceil(cost - intoLevel),
        levelStart: consumed,
        nextLevelXp: consumed + cost
      };
    }
    consumed += cost;
    level += 1;
  }
}

function levelTitle(level) {
  if (level >= 12) {
    return "Virtuoso";
  }
  if (level >= 9) {
    return "Performer";
  }
  if (level >= 6) {
    return "Choreographer";
  }
  if (level >= 3) {
    return "Rhythm Builder";
  }
  return "Rookie";
}

function updateGamificationHud() {
  const xp = Math.round(state.xp);
  const progress = levelProgressFromXp(state.xp);
  state.level = progress.level;

  el.levelValue.textContent = String(progress.level);
  el.levelMeta.textContent = `${Math.round(progress.intoLevel)}/${progress.levelCost} XP`;
  el.xpValue.textContent = String(xp);
  el.xpMeta.textContent = `${progress.toNext} to L${progress.level + 1} · ${levelTitle(progress.level)}`;
  el.comboValue.textContent = state.combo >= 6 ? `x${state.combo} Chain` : `x${state.combo}`;
}

function maybeSpeakTip(tip, meta = {}) {
  if (!tip || tip === state.latestTip) {
    return;
  }
  state.latestTip = tip;
  if (
    !state.coachEnabled ||
    state.coachMuted ||
    state.coachVolume <= 0.01 ||
    !("speechSynthesis" in window)
  ) {
    return;
  }

  const now = performance.now();
  const mode = el.voiceMode.value;
  const minInterval =
    mode === "calm" ? 10800 : mode === "active" ? 7600 : 6200;
  const highPriority =
    Boolean(meta.urgent) ||
    (meta.overall ?? 100) < 55 ||
    Math.abs(meta.timingOffsetSec ?? 0) > 0.45;

  if (!highPriority && now - state.lastSpeechAt < minInterval) {
    return;
  }
  if (!highPriority && meta.tipKey && meta.tipKey === state.lastCoachKey && now - state.lastSpeechAt < 14000) {
    return;
  }

  const speechText = buildVoiceLine(tip, mode, meta);
  const utterance = new SpeechSynthesisUtterance(speechText);
  const voice = chooseCoachVoice();
  if (voice) {
    utterance.voice = voice;
  }
  utterance.rate = mode === "hype" ? 0.99 : 0.92;
  utterance.pitch = mode === "hype" ? 1.04 : 0.98;
  utterance.volume = clamp(state.coachVolume, 0, 1);

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  state.lastSpeechAt = now;
}

function buildVoiceLine(tip, mode, meta) {
  const calmOpeners = [
    "Nice effort.",
    "Good try.",
    "Keep it smooth."
  ];
  const activeOpeners = [
    "Good energy.",
    "Stay with the beat.",
    "Let's sharpen this."
  ];
  const hypeOpeners = [
    "Yes, keep going.",
    "You're in it now.",
    "Let's hit this clean."
  ];

  const pool = mode === "hype" ? hypeOpeners : mode === "active" ? activeOpeners : calmOpeners;
  const opener = pool[(Math.floor((meta.overall ?? 0) + state.combo) % pool.length)];
  const shortTip = shortenVoiceTip(tip);
  return `${opener} ${shortTip}`.replace(/\s+/g, " ").trim();
}

function shortenVoiceTip(tip) {
  const normalized = String(tip || "")
    .replace(/Timing is \d+ms (late|early)\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = normalized.split(/[.!?]/)[0]?.trim() || normalized;
  return firstSentence.slice(0, 130);
}

function chooseCoachVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    return null;
  }
  const preferred = ["Samantha", "Ava", "Google US English", "Serena", "Daniel"];
  for (const name of preferred) {
    const match = voices.find((voice) => voice.name.includes(name));
    if (match) {
      return match;
    }
  }
  return voices.find((voice) => voice.lang?.startsWith("en")) || voices[0];
}

function renderPartBars(scores) {
  const parts = Object.keys(PARTS);
  if (!el.partBars.children.length) {
    el.partBars.innerHTML = parts
      .map(
        (part) =>
          `<div class="part-bar" data-part="${part}"><span>${PART_LABELS[part]}</span><div class="track"><div class="fill" style="width:0%"></div></div><strong>0%</strong></div>`
      )
      .join("");
  }

  for (const part of parts) {
    const row = el.partBars.querySelector(`[data-part="${part}"]`);
    if (!row) {
      continue;
    }
    const fill = row.querySelector(".fill");
    const label = row.querySelector("strong");
    const value = Math.round(scores[part] ?? 0);
    fill.style.width = `${value}%`;
    label.textContent = `${value}%`;
  }
}

function logCoach(message, urgent) {
  if (!message) {
    return;
  }

  const lastItem = el.coachFeed.firstChild;
  if (lastItem && lastItem.textContent === message) {
    return;
  }

  const item = document.createElement("li");
  item.textContent = message;
  if (urgent) {
    item.classList.add("highlight");
  }
  el.coachFeed.prepend(item);

  while (el.coachFeed.children.length > 7) {
    el.coachFeed.removeChild(el.coachFeed.lastChild);
  }
}

function finalizeAnalytics(reason) {
  if (!state.history.length) {
    el.sessionSummary.textContent = "No tracked movement detected";
    el.submitScoreBtn.disabled = true;
    el.leaderboardStatus.textContent = "No score submitted. Movement was not detected.";
    return;
  }

  const avgScore =
    state.history.reduce((acc, frame) => acc + frame.overall, 0) /
    state.history.length;

  awardBadges(avgScore);

  const avgPartScores = Object.entries(state.partTotals).reduce((acc, [part, metric]) => {
    acc[part] = metric.count ? metric.sum / metric.count : 0;
    return acc;
  }, {});

  const score = computeLeaderboardScore(avgScore);
  state.sessionScoreCard = {
    avgScore: Math.round(avgScore),
    bestCombo: state.bestCombo,
    perfectHits: state.perfectHits,
    score,
    durationSec: Math.round(state.sessionDuration),
    createdAt: new Date().toISOString()
  };
  el.submitScoreBtn.disabled = false;
  el.leaderboardStatus.textContent = `Session score ready: ${score} pts. Submit to leaderboard.`;

  renderAnalytics(avgScore, avgPartScores, reason);
  prepareReplaySources();
  el.analyticsSection.classList.remove("hidden");
}

function computeLeaderboardScore(avgScore) {
  const accuracyPoints = Math.round(avgScore * 9);
  const comboPoints = state.bestCombo * 12;
  const perfectPoints = state.perfectHits * 3;
  const staminaPoints = Math.min(180, Math.round(state.sessionDuration * 1.2));
  return accuracyPoints + comboPoints + perfectPoints + staminaPoints;
}

function awardBadges(avgScore) {
  state.badges = [];
  state.badges.push("First Session Complete");

  if (avgScore >= 85) {
    state.badges.push("Precision Pulse");
  }
  if (state.bestCombo >= 15) {
    state.badges.push("Combo Keeper");
  }

  const firstThird = averageSlice(0, 0.33);
  const lastThird = averageSlice(0.67, 1);
  if (lastThird - firstThird >= 8) {
    state.badges.push("Adaptive Learner");
  }
}

function averageSlice(from, to) {
  if (!state.history.length) {
    return 0;
  }

  const start = Math.floor(state.history.length * from);
  const end = Math.max(start + 1, Math.floor(state.history.length * to));
  const subset = state.history.slice(start, end);
  return subset.reduce((sum, item) => sum + item.overall, 0) / subset.length;
}

function renderAnalytics(avgScore, avgPartScores, reason) {
  const summaryBadges = state.badges.length ? ` | Badges: ${state.badges.join(", ")}` : "";
  el.sessionSummary.textContent = `${Math.round(avgScore)}% avg | ${reason}${summaryBadges}`;

  drawAccuracyChart();
  renderRanking(avgPartScores);
  renderWeakMoments();
  renderImprovementTips(avgPartScores, avgScore);
  renderMovementDescriptors();
}

function renderMovementDescriptors() {
  const summary = summarizeSemanticTimeline();
  el.movementDescriptors.innerHTML = summary.map((line) => `<li>${line}</li>`).join("");
}

function summarizeSemanticTimeline() {
  if (!state.semanticSamples.length) {
    return ["Not enough movement data to build semantic descriptors."];
  }

  const mismatchCounts = {
    handsUp: 0,
    squatDepth: 0,
    stanceWidth: 0,
    torsoLean: 0
  };

  const userCounts = {
    handsUp: 0,
    deepSquat: 0,
    wideStance: 0,
    leanLeft: 0,
    leanRight: 0
  };

  for (const sample of state.semanticSamples) {
    const t = sample.target;
    const u = sample.user;
    if (u.bothHandsUp) {
      userCounts.handsUp += 1;
    }
    if (u.isSquat) {
      userCounts.deepSquat += 1;
    }
    if (u.wideStance) {
      userCounts.wideStance += 1;
    }
    if (u.leanDirection === "left") {
      userCounts.leanLeft += 1;
    }
    if (u.leanDirection === "right") {
      userCounts.leanRight += 1;
    }

    if (t.bothHandsUp !== u.bothHandsUp) {
      mismatchCounts.handsUp += 1;
    }
    if (t.isSquat !== u.isSquat) {
      mismatchCounts.squatDepth += 1;
    }
    if (t.wideStance !== u.wideStance) {
      mismatchCounts.stanceWidth += 1;
    }
    if (t.leanDirection !== u.leanDirection) {
      mismatchCounts.torsoLean += 1;
    }
  }

  const n = state.semanticSamples.length;
  const topMismatch = Object.entries(mismatchCounts).sort((a, b) => b[1] - a[1])[0];
  const mismatchLabel = {
    handsUp: "arm elevation timing",
    squatDepth: "knee/squat depth",
    stanceWidth: "stance width control",
    torsoLean: "torso lean direction"
  }[topMismatch[0]];

  const leftLeanRate = Math.round((100 * userCounts.leanLeft) / n);
  const rightLeanRate = Math.round((100 * userCounts.leanRight) / n);
  const handsUpRate = Math.round((100 * userCounts.handsUp) / n);
  const squatRate = Math.round((100 * userCounts.deepSquat) / n);
  const wideStanceRate = Math.round((100 * userCounts.wideStance) / n);
  const mismatchRate = Math.round((100 * topMismatch[1]) / n);

  return [
    `Pose language profile: hands-up ${handsUpRate}% | deep-squat ${squatRate}% | wide-stance ${wideStanceRate}%.`,
    `Lean tendency: left ${leftLeanRate}% vs right ${rightLeanRate}%.`,
    `Primary semantic mismatch: ${mismatchLabel} (${mismatchRate}% of sampled frames).`,
    `Training cue: repeat weak sections at 0.75x until this mismatch drops below 25%.`
  ];
}

function drawAccuracyChart() {
  const canvas = el.accuracyChart;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = CHART_PAD;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "rgba(6, 16, 25, 0.82)";
  ctx.fillRect(0, 0, width, height);

  const maxTime = state.history[state.history.length - 1].time || 1;

  ctx.strokeStyle = "rgba(158, 197, 216, 0.28)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i += 1) {
    const y = pad.top + ((height - pad.top - pad.bottom) * i) / 5;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();

    const val = 100 - i * 20;
    ctx.fillStyle = "rgba(158, 197, 216, 0.82)";
    ctx.font = "11px 'Space Mono'";
    ctx.fillText(`${val}`, 8, y + 4);
  }

  const gradient = ctx.createLinearGradient(pad.left, 0, width - pad.right, 0);
  gradient.addColorStop(0, "#ff6f59");
  gradient.addColorStop(0.5, "#fdb44b");
  gradient.addColorStop(1, "#55efc4");

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.8;
  ctx.beginPath();

  state.history.forEach((entry, index) => {
    const x =
      pad.left +
      ((width - pad.left - pad.right) * (entry.time / maxTime));
    const y =
      pad.top +
      ((height - pad.top - pad.bottom) * (1 - entry.overall / 100));

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 111, 89, 0.9)";
  for (const weakMoment of state.weakMoments) {
    const x =
      pad.left +
      ((width - pad.left - pad.right) * (weakMoment.time / maxTime));
    const y =
      pad.top +
      ((height - pad.top - pad.bottom) * (1 - weakMoment.score / 100));
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(239, 251, 255, 0.9)";
  ctx.font = "12px 'Space Mono'";
  ctx.fillText("time", width - 52, height - 12);
}

function renderRanking(avgPartScores) {
  const ranked = Object.entries(avgPartScores).sort((a, b) => b[1] - a[1]);
  el.rankingList.innerHTML = ranked
    .map(
      ([part, score], index) =>
        `<li><span>${index + 1}. ${PART_LABELS[part]}</span><strong>${Math.round(score)}%</strong></li>`
    )
    .join("");
}

function renderWeakMoments() {
  if (!state.weakMoments.length) {
    el.weakMoments.innerHTML = "<li>Great consistency. No major weak spots detected.</li>";
    return;
  }

  el.weakMoments.innerHTML = state.weakMoments
    .slice(0, 8)
    .map(
      (point) =>
        `<li><button class="btn-ghost small" data-jump="${point.time}">${formatTime(
          point.time
        )}</button> ${PART_LABELS[point.part]} dipped to ${point.score}%</li>`
    )
    .join("");
}

function renderImprovementTips(avgPartScores, avgScore) {
  const tips = [];
  const weakest = Object.entries(avgPartScores).sort((a, b) => a[1] - b[1]).slice(0, 2);
  for (const [part, score] of weakest) {
    tips.push(
      `${PART_LABELS[part]} averaged ${Math.round(score)}%. Practice this section at 0.75x for one minute, then return to 1x.`
    );
  }

  const topLiveTip = [...state.tipCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topLiveTip) {
    tips.push(`Most frequent correction: ${topLiveTip[0]}`);
  }

  const avgAbsTiming =
    state.timingOffsets.length > 0
      ? state.timingOffsets.reduce((sum, value) => sum + Math.abs(value), 0) /
        state.timingOffsets.length
      : 0;
  if (avgAbsTiming > 0.22) {
    tips.push(
      `Timing priority: average drift ${Math.round(
        avgAbsTiming * 1000
      )}ms. Practice count-in drills and hit on 1/3/5/7.`
    );
  }

  const dominantAngle = [...state.angleTotals.entries()]
    .map(([joint, stats]) => ({
      joint,
      avg: stats.count ? stats.sum / stats.count : 0
    }))
    .sort((a, b) => b.avg - a.avg)[0];

  if (dominantAngle && dominantAngle.avg > 10) {
    tips.push(
      `Joint precision target: reduce ${dominantAngle.joint} deviation by about ${Math.round(
        dominantAngle.avg
      )}°.`
    );
  }

  tips.push(
    avgScore >= 80
      ? "Next challenge: increase movement amplitude while keeping rhythm tight."
      : "Prioritize clean shape first, then chase speed and performance flair."
  );

  el.improvementTips.innerHTML = tips.map((tip) => `<li>${tip}</li>`).join("");
}

function prepareReplaySources() {
  if (state.targetUrl) {
    el.replayTarget.src = state.targetUrl;
  }

  if (state.userSource === "upload" && state.userUrl) {
    el.replayUser.src = state.userUrl;
  } else if (state.userSource === "webcam" && state.webcamRecordingUrl) {
    el.replayUser.src = state.webcamRecordingUrl;
  }

  applyTargetAudioSettings();
  el.replayTarget.playbackRate = Number(el.speedControl.value);
  el.replayUser.playbackRate = Number(el.speedControl.value);
  updateReplayControls();
  handleReplayLockChange();
}

function syncReplay() {
  if (!el.replayTarget.src || !el.replayUser.src) {
    logCoach("Replay requires both videos available.", true);
    return;
  }

  if (el.replayTarget.paused) {
    jumpReplayTo(el.replayTarget.currentTime, false);
    el.replayTarget.play().catch(() => {});
    el.replayUser.play().catch(() => {});
    startReplayDriftCorrection();
  } else {
    el.replayTarget.pause();
    el.replayUser.pause();
    stopReplaySync();
  }
}

function startReplayDriftCorrection() {
  stopReplaySync();
  state.replaySyncTimer = window.setInterval(() => {
    if (!el.replayLock.checked) {
      return;
    }
    const drift = Math.abs((el.replayTarget.currentTime || 0) - (el.replayUser.currentTime || 0));
    if (drift > 0.14) {
      state.replaySyncSuppress = true;
      el.replayUser.currentTime = el.replayTarget.currentTime;
      state.replaySyncSuppress = false;
    }
  }, 170);
}

function stopReplaySync() {
  if (state.replaySyncTimer) {
    window.clearInterval(state.replaySyncTimer);
    state.replaySyncTimer = 0;
  }
}

function handleWeakMomentJump(event) {
  const button = event.target.closest("button[data-jump]");
  if (!button) {
    return;
  }

  const jumpTime = Number(button.dataset.jump);
  if (!Number.isFinite(jumpTime)) {
    return;
  }
  jumpReplayTo(jumpTime, true);
}

function sanitizePlayerName(name) {
  return String(name || "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .slice(0, 20);
}

function getApiBaseUrl() {
  const proxy = el.proxyBaseUrl.value.trim().replace(/\/$/, "");
  if (proxy) {
    return proxy;
  }
  return window.location.origin;
}

function normalizeLeaderboardEntry(entry) {
  return {
    name: sanitizePlayerName(entry.name || "Anonymous") || "Anonymous",
    score: Math.max(0, Number(entry.score) || 0),
    avgScore: Math.max(0, Math.min(100, Number(entry.avgScore) || 0)),
    bestCombo: Math.max(0, Number(entry.bestCombo) || 0),
    perfectHits: Math.max(0, Number(entry.perfectHits) || 0),
    createdAt: entry.createdAt || new Date().toISOString()
  };
}

function readLocalLeaderboard() {
  try {
    const raw = window.localStorage.getItem(LOCAL_LEADERBOARD_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeLeaderboardEntry);
  } catch {
    return [];
  }
}

function writeLocalLeaderboard(entries) {
  window.localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(entries.slice(0, 20)));
}

function renderLeaderboard(entries, modeLabel = "Global") {
  state.leaderboardEntries = entries.slice(0, 20);
  el.leaderboardScope.textContent = modeLabel;
  if (!entries.length) {
    el.leaderboardList.innerHTML = "<li><span>No scores yet</span><strong>-</strong></li>";
    return;
  }
  el.leaderboardList.innerHTML = entries
    .slice(0, 10)
    .map(
      (entry, index) =>
        `<li><span>${index + 1}. ${escapeHtml(entry.name)} <small>${entry.avgScore}%</small></span><strong>${entry.score}</strong></li>`
    )
    .join("");
}

async function refreshLeaderboard() {
  const base = getApiBaseUrl();
  try {
    const response = await fetch(`${base}/api/leaderboard`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const entries = Array.isArray(data.entries) ? data.entries.map(normalizeLeaderboardEntry) : [];
    renderLeaderboard(entries, base === window.location.origin ? "Live" : "Global");
    if (!entries.length) {
      el.leaderboardStatus.textContent = "No scores yet. Submit the first run.";
    }
  } catch {
    const local = readLocalLeaderboard()
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    renderLeaderboard(local, "Local");
  }
}

async function submitLeaderboardEntry() {
  if (!state.sessionScoreCard) {
    el.leaderboardStatus.textContent = "Complete a session first.";
    return;
  }

  const name = sanitizePlayerName(el.leaderboardName.value) || "Anonymous";
  el.leaderboardName.value = name;
  persistLeaderboardName();

  const entry = {
    name,
    score: state.sessionScoreCard.score,
    avgScore: state.sessionScoreCard.avgScore,
    bestCombo: state.sessionScoreCard.bestCombo,
    perfectHits: state.sessionScoreCard.perfectHits,
    createdAt: state.sessionScoreCard.createdAt
  };

  el.submitScoreBtn.disabled = true;
  el.leaderboardStatus.textContent = "Submitting score...";

  const base = getApiBaseUrl();
  try {
    const response = await fetch(`${base}/api/leaderboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const entries = Array.isArray(data.entries) ? data.entries.map(normalizeLeaderboardEntry) : [];
    renderLeaderboard(entries, base === window.location.origin ? "Live" : "Global");
    const rank = Number(data.rank) || entries.findIndex((value) => value.createdAt === entry.createdAt) + 1;
    el.leaderboardStatus.textContent = `Score submitted. Current rank: #${Math.max(rank, 1)}.`;
  } catch {
    const local = readLocalLeaderboard();
    local.push(entry);
    local.sort((a, b) => b.score - a.score);
    writeLocalLeaderboard(local);
    renderLeaderboard(local, "Local");
    const rank = local.findIndex((value) => value.createdAt === entry.createdAt) + 1;
    el.leaderboardStatus.textContent = `Saved locally. Current local rank: #${Math.max(rank, 1)}.`;
  } finally {
    el.submitScoreBtn.disabled = false;
  }
}

async function generateNemotronFeedback() {
  if (!state.history.length) {
    setNemotronOutput("Complete a session first to generate AI feedback.");
    return;
  }

  el.nemotronBtn.disabled = true;
  setNemotronOutput("Generating coaching notes...");

  const payload = buildNemotronPrompt();
  const mode = el.nemotronMode.value;

  try {
    const output =
      mode === "proxy"
        ? await generateNemotronFeedbackViaProxy(payload)
        : await generateNemotronFeedbackDirect(payload);
    setNemotronOutput(output);
  } catch (error) {
    console.error(error);
    setNemotronOutput("Nemotron request failed. Verify proxy URL or API access and try again.");
  } finally {
    el.nemotronBtn.disabled = false;
  }
}

async function generateNemotronFeedbackViaProxy(payload) {
  const baseUrl = el.proxyBaseUrl.value.trim().replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Proxy base URL required");
  }

  const response = await fetch(`${baseUrl}/api/nemotron-feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: payload })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.content?.trim() || "No coaching text returned by proxy.";
}

async function generateNemotronFeedbackDirect(payload) {
  const apiKey = el.nemotronKey.value.trim();
  if (!apiKey) {
    throw new Error("NVIDIA API key required for direct mode");
  }

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
      temperature: 0.3,
      top_p: 0.92,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You are a professional dance coach. Give concise, practical and encouraging instruction with concrete drills."
        },
        {
          role: "user",
          content: payload
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "No coaching text returned by API.";
}

function buildNemotronPrompt() {
  const avgScore = Math.round(
    state.history.reduce((sum, row) => sum + row.overall, 0) / state.history.length
  );

  const avgParts = Object.entries(state.partTotals)
    .map(([part, stats]) => ({
      part,
      avg: stats.count ? Math.round(stats.sum / stats.count) : 0
    }))
    .sort((a, b) => a.avg - b.avg);

  const weakMoments = state.weakMoments
    .slice(0, 5)
    .map((m) => `${formatTime(m.time)} (${PART_LABELS[m.part]} ${m.score}%)`)
    .join(", ");

  const frequentTips = [...state.tipCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tip, count]) => `${tip} [${count}x]`)
    .join("\n");

  const movementLanguage = summarizeSemanticTimeline().join(" ");
  const avgTimingMs =
    state.timingOffsets.length > 0
      ? Math.round(
          (1000 * state.timingOffsets.reduce((sum, value) => sum + Math.abs(value), 0)) /
            state.timingOffsets.length
        )
      : 0;

  return [
    "Create a post-session dance coaching report.",
    `Average accuracy: ${avgScore}%`,
    `Session length: ${formatTime(state.sessionDuration)}`,
    `Best combo: x${state.bestCombo}`,
    `Body part scores (lowest first): ${avgParts
      .map((p) => `${PART_LABELS[p.part]} ${p.avg}%`)
      .join(", ")}`,
    `Weak moments: ${weakMoments || "none"}`,
    `Live corrections triggered:\n${frequentTips || "none"}`,
    `Average timing drift: ${avgTimingMs}ms`,
    `PoseScript-style movement summary: ${movementLanguage}`,
    "Return:",
    "1) 3 highest-impact form fixes",
    "2) 2 drills for tomorrow (with reps/timing)",
    "3) one motivational one-liner",
    "Use explicit timestamps like 00:16 whenever possible."
  ].join("\n");
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(value / 60)).padStart(2, "0");
  const secs = String(value % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

init();
