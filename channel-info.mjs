// channel-info.mjs — 채널정보 조회 진입점
//   · YT_API_KEY 가 설정돼 있으면 YouTube Data API v3 사용 (데이터센터/Vercel 에서 안정적)
//   · 없으면 페이지 스크래핑으로 폴백 (로컬 개발용, 키 불필요)
import { hasApiKey, getChannelInfoApi } from "./youtube-api.mjs";
import { getChannelInfo as scrapeInfo } from "./youtube-info.mjs";

export { hasApiKey };
export const MODE = hasApiKey() ? "api" : "scrape";

export async function getChannelInfo(input, opts = {}) {
  return hasApiKey() ? getChannelInfoApi(input, opts) : scrapeInfo(input);
}
