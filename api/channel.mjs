// Vercel 서버리스 함수: 단일 채널 상세 (GET /api/channel?url=@handle)
import { getChannelInfo } from "../channel-info.mjs";

export default async function handler(req, res) {
  const params = new URL(req.url, "http://localhost").searchParams;
  const input = params.get("url") || (req.query && req.query.url);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    if (!input) throw new Error("url 파라미터가 필요합니다.");
    res.statusCode = 200;
    res.end(JSON.stringify(await getChannelInfo(input)));
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: e.message }));
  }
}
