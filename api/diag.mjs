// 임시 진단: Vercel 서버에서 YouTube /live 응답을 여러 헤더/쿠키 변형으로 비교
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const VARIANTS = {
  baseline: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" },
  consentCookie: {
    "User-Agent": UA,
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    Cookie: "SOCS=CAISEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb.20210328-17-p0.en+FX+000",
  },
  fullBrowser: {
    "User-Agent": UA,
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    Cookie: "SOCS=CAISEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb.20210328-17-p0.en+FX+000",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "sec-ch-ua": '"Chromium";v="120", "Not(A:Brand";v="24", "Google Chrome";v="120"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  },
};

export default async function handler(req, res) {
  const target = new URL(req.url, "http://localhost").searchParams.get("c") || "@ytnnews24";
  const url = "https://www.youtube.com/" + target + "/live";
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const out = { region: process.env.VERCEL_REGION || null, target, variants: {} };
  for (const [name, headers] of Object.entries(VARIANTS)) {
    try {
      const r = await fetch(url, { headers, redirect: "follow" });
      const t = await r.text();
      const has = (re) => re.test(t);
      out.variants[name] = {
        status: r.status,
        len: t.length,
        isLiveNow: has(/"isLiveNow":true/),
        hasPlayerResponse: has(/ytInitialPlayerResponse/),
        playabilityStatus: (t.match(/"playabilityStatus":\{"status":"([^"]+)"/) || [])[1] || null,
        loginRequired: has(/LOGIN_REQUIRED|Sign in to confirm|로그인이 필요/),
        botCheck: has(/not a bot|자동 프로그램|비정상적인 트래픽|unusual traffic/i),
        consent: has(/consent\.youtube\.com|Before you continue|시작하기 전에/),
      };
    } catch (e) {
      out.variants[name] = { error: e.message };
    }
  }
  res.end(JSON.stringify(out, null, 2));
}
