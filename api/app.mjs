// Vercel 서버리스 진입점.
// vercel.json 의 rewrite 로 모든 경로가 이 함수로 들어오고,
// 공용 핸들러(app.mjs)가 원래 경로(req.url)를 보고 라우팅합니다.
export { default } from "../app.mjs";
