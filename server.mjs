// server.mjs — 로컬 개발용 상시 서버
// 실행: node server.mjs   →   http://localhost:4000
// (Vercel 배포 시에는 api/app.mjs 서버리스 함수가 동일한 핸들러를 사용합니다)
import http from "node:http";
import handler from "./app.mjs";

const PORT = process.env.PORT || 4000;

http.createServer((req, res) => handler(req, res)).listen(PORT, () => {
  console.log(`✅ 유튜브 라이브 보드 실행: http://localhost:${PORT}`);
});
