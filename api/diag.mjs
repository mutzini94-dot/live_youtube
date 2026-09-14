// 임시 진단: Vercel 서버에서 YouTube /live 응답이 무엇인지 확인
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
export default async function handler(req, res) {
  const h = req.headers.host || "";
  const target = new URL(req.url, "http://localhost").searchParams.get("c") || "@ytnnews24";
  const url = "https://www.youtube.com/" + target + "/live";
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" }, redirect: "follow" });
    const t = await r.text();
    const has = (re) => re.test(t);
    res.end(JSON.stringify({
      region: process.env.VERCEL_REGION || null,
      finalUrl: r.url,
      status: r.status,
      len: t.length,
      isLiveNow: has(/"isLiveNow":true/),
      hasPlayerResponse: has(/ytInitialPlayerResponse/),
      loginRequired: has(/LOGIN_REQUIRED|Sign in to confirm|로그인이 필요/),
      botCheck: has(/not a bot|자동 프로그램|비정상적인 트래픽|unusual traffic/i),
      consent: has(/consent\.youtube\.com|Before you continue|시작하기 전에|쿠키 사용/),
      playabilityStatus: (t.match(/"playabilityStatus":\{"status":"([^"]+)"/) || [])[1] || null,
    }, null, 2));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
}
