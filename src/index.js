const ALLOWED_ORIGIN = "https://barakzai.cloud";
const CORS_ALLOW_HEADERS = "X-Adapter-Token, Content-Type";
const CORS_ALLOW_METHODS = "GET,POST,OPTIONS";
const CORS_MAX_AGE = "86400";

// ─── YouTube search proxy (innertube API) ─────────────────────────────────────

function parseInnertubeResults(data) {
  const items =
    data?.contents?.twoColumnSearchResultsRenderer
      ?.primaryContents?.sectionListRenderer
      ?.contents?.[0]?.itemSectionRenderer?.contents ?? [];

  return items
    .filter((item) => item.videoRenderer)
    .map((item) => {
      const v = item.videoRenderer;
      const title =
        v.title?.runs?.[0]?.text ??
        v.title?.accessibility?.accessibilityData?.label ??
        "";
      const author = v.ownerText?.runs?.[0]?.text ?? "";
      const durationText = v.lengthText?.simpleText ?? "";
      const viewText =
        v.viewCountText?.simpleText ?? v.viewCountText?.runs?.[0]?.text ?? "0";

      const parts = durationText.split(":").map(Number);
      let lengthSeconds = 0;
      if (parts.length === 3) lengthSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) lengthSeconds = parts[0] * 60 + parts[1];

      const viewCount = Number.parseInt(viewText.replace(/\D/g, ""), 10) || 0;

      return { type: "video", videoId: v.videoId, title, author, lengthSeconds, viewCount };
    });
}

async function fetchYouTubeSearch(query) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20250101.00.00" } },
      query,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const results = parseInnertubeResults(data);
  return results.length > 0 ? results : null;
}

function searchCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const isAllowed = origin === ALLOWED_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": CORS_MAX_AGE,
    Vary: "Origin",
  };
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    "Access-Control-Max-Age": CORS_MAX_AGE,
    Vary: "Origin",
  };
}

function apiHeaders(request, extra = {}) {
  return {
    "Cache-Control": "no-store",
    ...corsHeaders(request),
    ...extra,
  };
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function assertOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== ALLOWED_ORIGIN) {
    return { ok: false, status: 403, payload: { detail: "Forbidden origin" } };
  }
  return { ok: true };
}

function assertAuth(request, env) {
  const expected = String(env.ADAPTER_TOKEN || "");
  if (!expected) {
    return { ok: false, status: 500, payload: { detail: "Server misconfigured: ADAPTER_TOKEN is missing" } };
  }

  const provided = request.headers.get("X-Adapter-Token") || "";
  if (provided !== expected) {
    return { ok: false, status: 401, payload: { detail: "Unauthorized" } };
  }

  return { ok: true };
}

async function fetchAsset(env, request, path) {
  const assetUrl = new URL(path, request.url);
  return env.ASSETS.fetch(new Request(assetUrl.toString(), { method: "GET" }));
}

async function fetchRunAsset(env, request, topic, lang, mode) {
  const requested = `/tutor-data/run/${topic}.${lang}.${mode}.json`;
  const first = await fetchAsset(env, request, requested);
  if (first.ok || first.status !== 404) {
    return first;
  }

  // Language fallback: if requested language payload does not exist, use DE.
  if (lang !== "de") {
    const fallback = `/tutor-data/run/${topic}.de.${mode}.json`;
    return fetchAsset(env, request, fallback);
  }

  return first;
}

function requiredRunFields(body) {
  const required = ["api_version", "request_id", "topic", "lang", "mode"];
  return required.filter((field) => {
    const value = body?.[field];
    return typeof value !== "string" || !value.trim();
  });
}

function normalizeTopicsPayload(payload, mode, lang) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.topics)) {
    return payload;
  }

  if (!mode && !lang) {
    return payload;
  }

  const availability = payload.availability;
  if (!availability || typeof availability !== "object") {
    return payload;
  }

  const requestedMode = typeof mode === "string" && mode.trim() ? mode.trim().toLowerCase() : "";
  const requestedLang = typeof lang === "string" && lang.trim() ? lang.trim().toLowerCase() : "";

  const filteredTopics = payload.topics.filter((topic) => {
    if (typeof topic !== "string" || !topic.trim()) return false;
    const topicAvailability = availability[topic];
    if (!topicAvailability || typeof topicAvailability !== "object") return false;

    const langsToCheck = requestedLang ? [requestedLang] : Object.keys(topicAvailability);
    for (const langKey of langsToCheck) {
      const modes = topicAvailability[langKey];
      if (!Array.isArray(modes)) continue;
      if (!requestedMode || modes.includes(requestedMode)) {
        return true;
      }
    }
    return false;
  });

  return {
    ...payload,
    topics: filteredTopics.sort(),
  };
}

async function handleSearch(request, url) {
  const cors = searchCorsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  const q = url.searchParams.get("q");
  if (!q?.trim()) {
    return json({ error: "q is required" }, 400, cors);
  }
  const results = await fetchYouTubeSearch(q.trim());
  if (results === null) {
    return json({ error: "Search unavailable" }, 503, cors);
  }
  return json({ results }, 200, cors);
}

async function handleTopics(request, env, url) {
  const assetResponse = await fetchAsset(env, request, "/tutor-data/topics.json");
  if (assetResponse.status === 404) {
    return json({ detail: "Not found" }, 404, apiHeaders(request));
  }
  if (!assetResponse.ok) {
    return json({ detail: "Upstream asset error" }, 502, apiHeaders(request));
  }
  const rawText = await assetResponse.text();
  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch {
    return new Response(rawText, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", ...apiHeaders(request) },
    });
  }
  const filteredPayload = normalizeTopicsPayload(
    payload,
    url.searchParams.get("mode"),
    url.searchParams.get("lang"),
  );
  return new Response(JSON.stringify(filteredPayload), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...apiHeaders(request) },
  });
}

async function handleRun(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ detail: "Invalid JSON body" }, 400, apiHeaders(request));
  }
  const missing = requiredRunFields(body);
  if (missing.length) {
    return json({ detail: `Missing required fields: ${missing.join(", ")}` }, 400, apiHeaders(request));
  }
  const topic = body.topic.trim().toLowerCase();
  const lang = body.lang.trim().toLowerCase();
  const mode = body.mode.trim().toLowerCase();
  const assetResponse = await fetchRunAsset(env, request, topic, lang, mode);
  if (assetResponse.status === 404) {
    return json({ detail: "Not found" }, 404, apiHeaders(request));
  }
  if (!assetResponse.ok) {
    return json({ detail: "Upstream asset error" }, 502, apiHeaders(request));
  }
  return new Response(await assetResponse.text(), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...apiHeaders(request) },
  });
}

function assertV1Access(request, env) {
  const originCheck = assertOrigin(request);
  if (!originCheck.ok) return json(originCheck.payload, originCheck.status, apiHeaders(request));
  const authCheck = assertAuth(request, env);
  if (!authCheck.ok) return json(authCheck.payload, authCheck.status, apiHeaders(request));
  return null;
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const isTopics = url.pathname === "/v1/topics";
  const isRun = url.pathname === "/v1/run";

  if (url.pathname === "/search") return handleSearch(request, url);

  if (request.method === "OPTIONS" && (isTopics || isRun)) {
    const originCheck = assertOrigin(request);
    if (!originCheck.ok) {
      return json(originCheck.payload, originCheck.status, apiHeaders(request));
    }
    return new Response(null, { status: 204, headers: apiHeaders(request) });
  }

  if (url.pathname === "/v1/health" && request.method === "GET") {
    return json({ ok: true, service: "smartflow-tutor-api" }, 200, apiHeaders(request));
  }

  if (url.pathname.startsWith("/v1/")) {
    const denied = assertV1Access(request, env);
    if (denied) return denied;
  }

  if (isTopics && request.method === "GET") return handleTopics(request, env, url);
  if (isRun && request.method === "POST") return handleRun(request, env);

  return json({ detail: "Not found" }, 404, apiHeaders(request));
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};
