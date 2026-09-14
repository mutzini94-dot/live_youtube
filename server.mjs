// server.mjs — 로컬 개발용 서버 (Vercel 배포와 동일한 구조를 로컬에서 재현)
//   · 정적 페이지:  public/index.html (/), public/channel.html (/channel)
//   · API 함수:    api/channel.mjs, api/live-list.mjs (Vercel 서버리스와 동일 파일)
// 실행: node server.mjs   →   http://localhost:4000
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import channelHandler from "./api/channel.mjs";
import liveListHandler from "./api/live-list.mjs";

const PORT = process.env.PORT || 4000;
const PUBLIC = new URL("./public/", import.meta.url);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${PORT}`);

    if (u.pathname === "/api/channel") return channelHandler(req, res);
    if (u.pathname === "/api/live-list") return liveListHandler(req, res);

    // 정적 파일 서빙 (/, /channel 매핑 포함)
    let rel = u.pathname === "/" ? "index.html" : u.pathname.replace(/^\/+/, "");
    if (u.pathname === "/channel") rel = "channel.html";
    const filePath = new URL(rel, PUBLIC);

    fs.readFile(filePath, (err, buf) => {
      if (err) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("404 Not Found");
        return;
      }
      res.setHeader("Content-Type", MIME[path.extname(rel)] || "application/octet-stream");
      res.end(buf);
    });
  })
  .listen(PORT, () => {
    console.log(`✅ 유튜브 라이브 보드 실행: http://localhost:${PORT}`);
  });
