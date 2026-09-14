// Vercel 서버리스 함수: 여러 채널의 라이브 상태 (GET /api/live-list?urls=@a,@b,...)
// API 모드에서는 쿼터 절약을 위해 "예정" 감지를 생략(offline 처리)합니다.
import { getChannelInfo } from "../channel-info.mjs";

// 병렬 조회 (동시 실행 수 제한)
async function pool(items, size, fn) {
  const ret = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return ret;
}

export default async function handler(req, res) {
  const params = new URL(req.url, "http://localhost").searchParams;
  const raw = params.get("urls") || (req.query && req.query.urls) || "";
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const list = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 40);
  if (!list.length) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "urls 파라미터가 필요합니다." }));
  }
  try {
    const results = await pool(list, 6, async (u) => {
      try {
        const d = await getChannelInfo(u, { includeUpcoming: false });
        return { input: u, ok: true, channel: d.channel, live: d.live };
      } catch (e) {
        return { input: u, ok: false, error: e.message };
      }
    });
    res.statusCode = 200;
    res.end(JSON.stringify({ results, fetchedAt: new Date().toISOString() }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
}
