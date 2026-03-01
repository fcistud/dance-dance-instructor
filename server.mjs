import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";
const corsOrigin = process.env.CORS_ORIGIN || "*";
const nemotronApiKey = process.env.NEMOTRON_API_KEY || "";
const corsAllowList = corsOrigin
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const leaderboardEntries = [];
const LEADERBOARD_MAX = 200;

const staticFiles = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "README.md",
  "pitch.md"
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function withCors(req, res) {
  const requestOrigin = req.headers.origin || "";
  const allowWildcard = corsAllowList.includes("*");
  const allowExact = requestOrigin && corsAllowList.includes(requestOrigin);
  const selectedOrigin = allowWildcard
    ? "*"
    : allowExact
      ? requestOrigin
      : corsAllowList[0] || "*";
  res.setHeader("Access-Control-Allow-Origin", selectedOrigin);
  if (selectedOrigin !== "*") {
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function sendJson(req, res, statusCode, payload) {
  withCors(req, res);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(req, res, statusCode, text) {
  withCors(req, res);
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function normalizeName(name) {
  const clean = String(name || "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .slice(0, 20);
  return clean || "Anonymous";
}

function normalizeLeaderboardEntry(entry) {
  return {
    name: normalizeName(entry.name),
    score: Math.max(0, Number(entry.score) || 0),
    avgScore: Math.max(0, Math.min(100, Number(entry.avgScore) || 0)),
    bestCombo: Math.max(0, Number(entry.bestCombo) || 0),
    perfectHits: Math.max(0, Number(entry.perfectHits) || 0),
    createdAt: entry.createdAt || new Date().toISOString()
  };
}

function rankAndTrimLeaderboard() {
  leaderboardEntries.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.avgScore !== a.avgScore) {
      return b.avgScore - a.avgScore;
    }
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
  if (leaderboardEntries.length > LEADERBOARD_MAX) {
    leaderboardEntries.length = LEADERBOARD_MAX;
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) {
    return {};
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function callNemotron(prompt) {
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${nemotronApiKey}`
    },
    body: JSON.stringify({
      model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
      temperature: 0.3,
      top_p: 0.92,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "You are a professional dance coach. Give concise, practical and encouraging instruction with concrete drills."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Nemotron HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    withCors(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(req, res, 200, {
      ok: true,
      nemotronKeyConfigured: Boolean(nemotronApiKey)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/nemotron-feedback") {
    if (!nemotronApiKey) {
      sendJson(req, res, 500, {
        error: "NEMOTRON_API_KEY is not configured on the proxy server."
      });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const prompt = String(body.prompt || "").trim();
      if (!prompt) {
        sendJson(req, res, 400, { error: "prompt is required" });
        return;
      }
      const content = await callNemotron(prompt);
      sendJson(req, res, 200, { content });
    } catch (error) {
      sendJson(req, res, 502, {
        error: error instanceof Error ? error.message : "Proxy request failed"
      });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/leaderboard") {
    rankAndTrimLeaderboard();
    sendJson(req, res, 200, {
      entries: leaderboardEntries.slice(0, 20)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/leaderboard") {
    try {
      const body = await readJsonBody(req);
      const entry = normalizeLeaderboardEntry(body);
      leaderboardEntries.push(entry);
      rankAndTrimLeaderboard();
      const rank =
        leaderboardEntries.findIndex(
          (value) => value.createdAt === entry.createdAt && value.name === entry.name
        ) + 1;
      sendJson(req, res, 200, {
        ok: true,
        rank,
        entry,
        entries: leaderboardEntries.slice(0, 20)
      });
    } catch (error) {
      sendJson(req, res, 400, {
        error: error instanceof Error ? error.message : "Invalid leaderboard payload"
      });
    }
    return;
  }

  if (req.method === "GET") {
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const cleanPath = pathname.replace(/^\/+/, "");
    if (!staticFiles.has(cleanPath)) {
      sendText(req, res, 404, "Not found");
      return;
    }
    try {
      const fullPath = join(rootDir, cleanPath);
      const content = await readFile(fullPath);
      const contentType = mimeTypes[extname(cleanPath)] || "application/octet-stream";
      withCors(req, res);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
      return;
    } catch {
      sendText(req, res, 404, "Not found");
      return;
    }
  }

  sendText(req, res, 405, "Method not allowed");
});

server.listen(port, host, () => {
  console.log(`Improve.ai server running at http://${host}:${port}`);
});
