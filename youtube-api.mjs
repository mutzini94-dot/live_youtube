// youtube-api.mjs — YouTube Data API v3 기반 채널정보 + 라이브 감지
// 데이터센터(Vercel) IP에서도 안정적으로 동작합니다. 환경변수 YT_API_KEY 필요.
// 출력 형태는 youtube-info.mjs(스크래핑)와 동일하게 맞춰 프런트/서버 코드 재사용.

const API = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YT_API_KEY || process.env.YOUTUBE_API_KEY || "";

export function hasApiKey() {
  return !!KEY;
}

async function api(resource, params) {
  if (!KEY) throw new Error("YT_API_KEY 환경변수가 설정되지 않았습니다.");
  const u = new URL(API + "/" + resource);
  u.searchParams.set("key", KEY);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = j?.error?.errors?.[0]?.reason || j?.error?.status || String(r.status);
    const msg = j?.error?.message || "요청 실패";
    throw new Error(`YouTube API 오류(${reason}): ${msg}`);
  }
  return j;
}

// 입력(@핸들 / UC아이디 / URL / 사용자명)을 API 조회 파라미터로 파싱
function parseTarget(input) {
  let s = String(input || "").trim();
  if (!s) throw new Error("채널 주소 또는 핸들을 입력하세요.");
  if (/youtube\.com/i.test(s)) {
    let m = s.match(/\/@([^/?#]+)/);
    if (m) return { handle: m[1] };
    m = s.match(/\/channel\/([^/?#]+)/i);
    if (m) return { id: m[1] };
    m = s.match(/\/(user|c)\/([^/?#]+)/i);
    if (m) return { handle: m[2] };
  }
  if (/^UC[\w-]{20,}$/.test(s)) return { id: s };
  if (s.startsWith("@")) return { handle: s.slice(1) };
  return { handle: s.replace(/^@/, "") };
}

function bestThumb(thumbs) {
  if (!thumbs) return null;
  return (
    thumbs.maxres?.url ||
    thumbs.standard?.url ||
    thumbs.high?.url ||
    thumbs.medium?.url ||
    thumbs.default?.url ||
    null
  );
}

function krNum(n) {
  n = Number(n);
  if (!isFinite(n)) return "-";
  const t = (x) => String(Math.round(x * 10) / 10);
  if (n >= 1e8) return t(n / 1e8) + "억";
  if (n >= 1e4) return t(n / 1e4) + "만";
  if (n >= 1e3) return t(n / 1e3) + "천";
  return n.toLocaleString("ko-KR");
}

function parseKeywords(kw) {
  if (!kw) return null;
  const parts = (kw.match(/"[^"]+"|\S+/g) || []).map((s) => s.replace(/^"|"$/g, ""));
  return parts.join("; ") || null;
}

async function detectLive(channelId, { includeUpcoming = true } = {}) {
  // 현재 라이브
  const live = await api("search", {
    part: "snippet",
    channelId,
    eventType: "live",
    type: "video",
    maxResults: 1,
  });
  if (live.items?.length) {
    const videoId = live.items[0].id.videoId;
    const v = await api("videos", { part: "liveStreamingDetails,snippet,statistics", id: videoId });
    const it = v.items?.[0] || {};
    const lsd = it.liveStreamingDetails || {};
    return {
      isLive: true,
      state: "live",
      videoId,
      title: it.snippet?.title || live.items[0].snippet?.title || null,
      watchUrl: "https://www.youtube.com/watch?v=" + videoId,
      startedAt: lsd.actualStartTime || null,
      scheduledStart: null,
      concurrentViewers: lsd.concurrentViewers || null,
      totalViews: it.statistics?.viewCount || null,
      thumbnail: bestThumb(it.snippet?.thumbnails) || bestThumb(live.items[0].snippet?.thumbnails),
    };
  }
  // 예정 방송 (쿼터 절약을 위해 옵션)
  if (includeUpcoming) {
    const up = await api("search", {
      part: "snippet",
      channelId,
      eventType: "upcoming",
      type: "video",
      maxResults: 1,
    });
    if (up.items?.length) {
      const videoId = up.items[0].id.videoId;
      const v = await api("videos", { part: "liveStreamingDetails,snippet", id: videoId });
      const it = v.items?.[0] || {};
      const lsd = it.liveStreamingDetails || {};
      return {
        isLive: false,
        state: "upcoming",
        videoId,
        title: it.snippet?.title || up.items[0].snippet?.title || null,
        watchUrl: "https://www.youtube.com/watch?v=" + videoId,
        startedAt: null,
        scheduledStart: lsd.scheduledStartTime || null,
        concurrentViewers: null,
        totalViews: null,
        thumbnail: bestThumb(it.snippet?.thumbnails),
      };
    }
  }
  return { isLive: false, state: "offline" };
}

// 짧은 인메모리 캐시 (쿼터 절약; 워밍된 서버리스 인스턴스 내에서 유효)
const cache = new Map();
const TTL = 45000;

export async function getChannelInfoApi(input, opts = {}) {
  const cacheKey = input + "|" + (opts.includeUpcoming !== false);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < TTL) return hit.v;

  const t = parseTarget(input);
  const params = { part: "snippet,statistics,brandingSettings" };
  if (t.id) params.id = t.id;
  else if (t.handle) params.forHandle = "@" + t.handle;
  const data = await api("channels", params);
  const ch = data.items?.[0];
  if (!ch) throw new Error("채널을 찾을 수 없습니다: " + input);

  const channelId = ch.id;
  const sn = ch.snippet || {};
  const st = ch.statistics || {};
  const bs = ch.brandingSettings?.channel || {};
  const handle = sn.customUrl ? (sn.customUrl.startsWith("@") ? sn.customUrl : "@" + sn.customUrl) : t.handle ? "@" + t.handle : null;

  const channel = {
    channelId,
    title: sn.title || null,
    handle,
    description: sn.description || bs.description || "",
    avatar: bestThumb(sn.thumbnails),
    channelUrl: "https://www.youtube.com/channel/" + channelId,
    keywords: parseKeywords(bs.keywords),
    isFamilySafe: null,
    subscribers: st.hiddenSubscriberCount ? null : "구독자 " + krNum(st.subscriberCount) + "명",
    videoCount: "동영상 " + krNum(st.videoCount) + "개",
    requestedUrl: String(input),
    resolvedUrl: handle ? "https://www.youtube.com/" + handle : channel_url_fallback(channelId),
  };

  const live = await detectLive(channelId, opts);
  const result = { channel, live, fetchedAt: new Date().toISOString(), source: "api" };
  cache.set(cacheKey, { t: Date.now(), v: result });
  return result;
}

function channel_url_fallback(id) {
  return "https://www.youtube.com/channel/" + id;
}
