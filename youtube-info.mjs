// youtube-info.mjs
// 유튜브 채널 주소를 입력하면 채널 정보와 실시간 방송 여부를 가져오는 모듈 + CLI
// API 키 불필요 — 채널 페이지를 직접 파싱합니다.
// 사용: node youtube-info.mjs https://www.youtube.com/@maebulshow

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/**
 * 입력값(URL / @핸들 / 채널ID)을 표준 채널 URL로 변환
 */
export function normalizeChannelUrl(input) {
  let s = String(input || "").trim();
  if (!s) throw new Error("채널 주소 또는 핸들을 입력하세요.");

  // 이미 전체 URL 인 경우
  if (/^https?:\/\//i.test(s)) {
    // 특정 영상/watch 링크가 들어온 경우는 그대로 두되, 경로 끝의 탭은 제거
    const u = new URL(s);
    // 경로에서 /videos /streams /live 등 탭 제거하여 채널 루트로
    const parts = u.pathname.split("/").filter(Boolean);
    const tabs = new Set(["videos", "streams", "live", "featured", "community", "playlists", "about", "shorts"]);
    if (parts.length && tabs.has(parts[parts.length - 1].toLowerCase())) parts.pop();
    u.pathname = "/" + parts.join("/");
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  }

  // youtube.com/... 형태 (프로토콜 없음)
  if (/youtube\.com|youtu\.be/i.test(s)) {
    return normalizeChannelUrl("https://" + s.replace(/^\/+/, ""));
  }

  // @핸들
  if (s.startsWith("@")) return "https://www.youtube.com/" + s;

  // UC.... 채널 ID
  if (/^UC[\w-]{20,}$/.test(s)) return "https://www.youtube.com/channel/" + s;

  // 그 외 문자열은 핸들로 간주
  return "https://www.youtube.com/@" + s.replace(/^@/, "");
}

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  const text = await res.text();
  return { url: res.url, status: res.status, text };
}

/**
 * 문자열에서 marker 뒤에 오는 JSON 객체를 중괄호 매칭으로 안전하게 추출
 */
function extractJsonAfter(text, marker) {
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  let i = text.indexOf("{", idx);
  if (i === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  const start = i;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const raw = text.slice(start, i + 1);
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * 중첩 객체에서 조건에 맞는 첫 문자열을 깊이 우선으로 탐색
 */
function findString(obj, predicate, depth = 0) {
  if (obj == null || depth > 25) return null;
  if (typeof obj === "string") return predicate(obj) ? obj : null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = findString(v, predicate, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const r = findString(obj[k], predicate, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/**
 * 채널 메인 페이지에서 기본 정보 추출
 */
function parseChannelMeta(text) {
  const data = extractJsonAfter(text, "ytInitialData");
  const meta =
    data &&
    findFirstKey(data, "channelMetadataRenderer");

  const ogTitle = matchAttr(text, "og:title");
  const ogImage = matchAttr(text, "og:image");
  const ogDesc = matchAttr(text, "og:description");

  const info = {
    channelId: meta?.externalId || matchExternalId(text) || null,
    title: meta?.title || ogTitle || null,
    handle: extractHandle(meta?.vanityChannelUrl) || extractHandle(matchAttr(text, "og:url")) || null,
    description: meta?.description || ogDesc || null,
    avatar:
      meta?.avatar?.thumbnails?.slice(-1)[0]?.url || ogImage || null,
    channelUrl: meta?.channelUrl || meta?.vanityChannelUrl || null,
    keywords: meta?.keywords || null,
    isFamilySafe: meta?.isFamilySafe ?? null,
  };

  // 구독자 수 / 동영상 수 — 레이아웃 변화에 강하게 텍스트 탐색
  // (URL·경로 같은 잡음 제외: '/' '?' 미포함, 짧은 라벨 문자열만 허용)
  const isLabel = (s) => s.length <= 24 && !/[\/?=]/.test(s);
  info.subscribers =
    findString(data, (s) => isLabel(s) && /구독자|subscriber/i.test(s) && /\d/.test(s)) || null;
  info.videoCount =
    findString(data, (s) => isLabel(s) && /동영상|\bvideos?\b/i.test(s) && /\d/.test(s)) || null;

  return info;
}

function extractHandle(url) {
  if (!url) return null;
  const m = String(url).match(/@[\w.\-]+/);
  return m ? m[0] : null;
}

function matchAttr(text, prop) {
  const m = text.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`));
  return m ? decodeHtml(m[1]) : null;
}
function matchExternalId(text) {
  const m = text.match(/"externalId":"([^"]+)"/);
  return m ? m[1] : null;
}
function decodeHtml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * 객체 트리에서 특정 key 를 가진 첫 값을 찾음
 */
function findFirstKey(obj, key, depth = 0) {
  if (obj == null || depth > 25) return null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = findFirstKey(v, key, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj === "object") {
    if (key in obj) return obj[key];
    for (const k of Object.keys(obj)) {
      const r = findFirstKey(obj[k], key, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/**
 * /live 페이지에서 실시간 방송 여부 판단
 */
function parseLive(text) {
  const pr = extractJsonAfter(text, "ytInitialPlayerResponse");
  if (!pr) return { isLive: false, state: "offline" };

  const vd = pr.videoDetails || {};
  const micro = pr.microformat?.playerMicroformatRenderer || {};
  const lbd = micro.liveBroadcastDetails || {};
  const playability = pr.playabilityStatus || {};

  const isLiveNow = lbd.isLiveNow === true;
  const isUpcoming = vd.isUpcoming === true || playability.status === "LIVE_STREAM_OFFLINE";

  let state = "offline";
  if (isLiveNow) state = "live";
  else if (vd.isUpcoming) state = "upcoming";

  // 동시 시청자 수 탐색
  let concurrent = null;
  const cm = text.match(/"concurrentViewers":\{"runs":\[\{"text":"([\d.,만천]+)"/) ||
    text.match(/"originalViewCount":"(\d+)"/) ||
    text.match(/"viewCount":"(\d+)","isLive":true/);
  if (cm) concurrent = cm[1];

  return {
    isLive: isLiveNow,
    state,
    videoId: vd.videoId || null,
    title: vd.title || null,
    watchUrl: vd.videoId ? "https://www.youtube.com/watch?v=" + vd.videoId : null,
    startedAt: lbd.startTimestamp || null,
    scheduledStart:
      isUpcoming || vd.isUpcoming
        ? lbd.startTimestamp || playability?.liveStreamability?.liveStreamabilityRenderer?.offlineSlate?.liveStreamOfflineSlateRenderer?.scheduledStartTime || null
        : null,
    concurrentViewers: concurrent,
    totalViews: vd.viewCount || null,
    thumbnail: vd.thumbnail?.thumbnails?.slice(-1)[0]?.url || null,
  };
}

/**
 * 메인: 채널 정보 + 실시간 방송 여부 조회
 */
export async function getChannelInfo(input) {
  const channelUrl = normalizeChannelUrl(input);

  const mainPage = await fetchText(channelUrl);
  if (mainPage.status === 404 || /"alerts"/.test(mainPage.text) && /doesn.t exist|존재하지 않는/.test(mainPage.text)) {
    throw new Error(`채널을 찾을 수 없습니다: ${channelUrl} (HTTP ${mainPage.status})`);
  }

  const channel = parseChannelMeta(mainPage.text);
  channel.requestedUrl = channelUrl;
  channel.resolvedUrl = mainPage.url;

  // 라이브 페이지 (채널 루트 + /live)
  const liveUrl = channelUrl.replace(/\/$/, "") + "/live";
  let live = { isLive: false, state: "offline" };
  try {
    const livePage = await fetchText(liveUrl);
    live = parseLive(livePage.text);
  } catch {
    /* 라이브 조회 실패는 무시하고 오프라인 처리 */
  }

  return { channel, live, fetchedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function formatKST(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  } catch {
    return iso;
  }
}

function printReport({ channel, live }) {
  const line = "─".repeat(52);
  const dot = live.isLive ? "🔴" : live.state === "upcoming" ? "🟡" : "⚫";
  console.log(line);
  console.log(`📺  ${channel.title || "(제목 없음)"}`);
  console.log(line);
  console.log(`핸들       : ${channel.handle || "-"}`);
  console.log(`채널 ID    : ${channel.channelId || "-"}`);
  console.log(`구독자     : ${channel.subscribers || "-"}`);
  console.log(`동영상 수  : ${channel.videoCount || "-"}`);
  console.log(`채널 URL   : ${channel.channelUrl || channel.resolvedUrl || "-"}`);
  if (channel.description) {
    const d = channel.description.replace(/\s+/g, " ").trim();
    console.log(`설명       : ${d.length > 100 ? d.slice(0, 100) + "…" : d}`);
  }
  console.log(line);
  if (live.isLive) {
    console.log(`${dot}  실시간 방송 중`);
    console.log(`   제목      : ${live.title || "-"}`);
    console.log(`   시청자    : ${live.concurrentViewers ? live.concurrentViewers + "명" : "-"}`);
    console.log(`   시작 시각 : ${formatKST(live.startedAt) || "-"}`);
    console.log(`   시청 링크 : ${live.watchUrl || "-"}`);
  } else if (live.state === "upcoming") {
    console.log(`${dot}  방송 예정`);
    console.log(`   제목      : ${live.title || "-"}`);
    console.log(`   예정 시각 : ${formatKST(live.scheduledStart) || "-"}`);
    console.log(`   링크      : ${live.watchUrl || "-"}`);
  } else {
    console.log(`${dot}  현재 방송 중이 아님 (오프라인)`);
  }
  console.log(line);
}

// 직접 실행되었을 때만 CLI 동작 (Windows/POSIX 경로 모두 대응)
let isMain = false;
try {
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  if (process.argv[1]) {
    isMain = path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
  }
} catch {
  isMain = false;
}

if (isMain) {
  const arg = process.argv.slice(2).join(" ").trim();
  const asJson = process.argv.includes("--json");
  const input = arg.replace(/--json/g, "").trim();

  if (!input) {
    console.error("사용법: node youtube-info.mjs <채널주소|@핸들|채널ID> [--json]");
    console.error("예시  : node youtube-info.mjs https://www.youtube.com/@maebulshow");
    process.exit(1);
  }

  getChannelInfo(input)
    .then((result) => {
      if (asJson) console.log(JSON.stringify(result, null, 2));
      else printReport(result);
    })
    .catch((err) => {
      console.error("❌ 오류:", err.message);
      process.exit(1);
    });
}
