# 유튜브 채널 정보 조회 프로그램

유튜브 채널 주소(또는 `@핸들`, 채널 ID)를 입력하면 **채널 정보 + 실시간 방송 여부**를 가져옵니다.
**API 키가 필요 없습니다** — 공개 채널 페이지를 직접 파싱합니다. (Node.js 18+ 내장 `fetch` 사용, 외부 패키지 0개)

## 가져오는 정보

- 채널 이름 / `@핸들` / 채널 ID
- 구독자 수, 동영상 수
- 채널 설명, 프로필 이미지, 키워드
- **실시간 방송 여부** (방송중 🔴 / 예정 🟡 / 오프라인 ⚫)
  - 방송 중이면: 방송 제목, 동시 시청자 수, 시작 시각, 시청 링크

## 1) 명령줄(CLI)로 사용

```bash
node youtube-info.mjs https://www.youtube.com/@maebulshow
```

`@핸들`이나 채널 ID만 넣어도 됩니다:

```bash
node youtube-info.mjs @maebulshow
node youtube-info.mjs UCMYhq9OyGI5UEz_NTAoHY7A
```

JSON으로 받기 (다른 프로그램에서 활용):

```bash
node youtube-info.mjs @maebulshow --json
```

출력 예시:

```
────────────────────────────────────────────────────
📺  [팟빵] 최욱의 매불쇼
────────────────────────────────────────────────────
핸들       : @maebulshow
채널 ID    : UCMYhq9OyGI5UEz_NTAoHY7A
구독자     : 구독자 283만명
동영상 수  : 동영상 3.8천개
────────────────────────────────────────────────────
🔴  실시간 방송 중
   제목      : ●9월 11일 금요일 [LIVE] ...
   시청자    : 80712명
   시작 시각 : 2026. 9. 11. 오후 1:46:51
   시청 링크 : https://www.youtube.com/watch?v=tA8jk9xGJm8
────────────────────────────────────────────────────
```

## 2) 웹 화면(라이브 보드)으로 사용

```bash
node server.mjs
```

브라우저에서 `http://localhost:4000` 접속 →
**여러 채널 중 「지금 라이브 중인 방송」만 모아** 방송 모니터 스타일 대시보드로 보여줍니다.

- 「채널 목록 편집」에서 원하는 채널(주소/@핸들)을 한 줄에 하나씩 등록 → 이 브라우저에 자동 저장(최대 40개)
- 「가져오기 / 새로고침」으로 전체 채널의 라이브 상태를 병렬 조회
- 라이브 방송을 **동시 시청자 수 순**으로 정렬, 각 카드에 썸네일·시청자수·방송 제목 표시
- 「라이브만 보기」 체크로 오프라인 채널 숨김
- 기본 목록 예시: `@maebulshow`, `@ytnnews24`, `@sbsnews8`, `@MBCNEWS11`, `@newskbs`, `@tvchosunnews`, `@KTV`

> ⚠️ "유튜브 전체"의 라이브를 한 번에 가져오는 공개 방법은 없습니다(유튜브가 전역 색인을 제공하지 않음).
> 이 보드는 **내가 등록한 채널 목록 범위 안에서** 라이브를 모아 보여주는 방식입니다.

**API 엔드포인트**
- `GET /api/live-list?urls=@a,@b,@c` → 여러 채널 라이브 상태 배열(JSON)
- `GET /api/channel?url=@maebulshow` → 단일 채널 상세(JSON)

> ℹ️ **아티팩트(claude.ai) 버전과의 차이**: 아티팩트는 브라우저 보안(CSP)상 유튜브로 직접 통신·이미지 로드가
> 차단되어 "입력 → 실시간 가져오기"가 불가능합니다. 실시간 입력 조회는 **이 로컬 웹앱에서만** 동작합니다.
> 아티팩트는 조회 시점 데이터를 담은 **스냅샷**으로만 제공됩니다.

## 데이터 조회 방식 (중요)

- **YouTube Data API v3** (권장, 서버/클라우드에서 안정적): 환경변수 `YT_API_KEY` 가 있으면 자동으로 API 를 사용합니다.
- **페이지 스크래핑** (키 불필요, 로컬용): 키가 없으면 자동 폴백. 단, **Vercel 등 데이터센터 IP 에서는 유튜브가 라이브(재생) 데이터를 막아 라이브 감지가 실패**합니다 → 그래서 클라우드 배포에는 API 키가 필요합니다.

### API 키 발급
1. [Google Cloud Console](https://console.cloud.google.com) → 프로젝트 생성
2. **APIs & Services → Library → “YouTube Data API v3” → Enable**
3. **Credentials → Create credentials → API key** → 키 복사

## 배포 (Vercel)

1. [vercel.com](https://vercel.com) 로그인 → **Add New… → Project** → GitHub 저장소 `mutzini94-dot/live_youtube` **Import**
2. **Settings → Environment Variables** 에 `YT_API_KEY = <발급받은 키>` 추가 (Production/Preview 모두 체크)
3. **Deploy** (또는 재배포). `vercel.json` 이 `/channel` 정적 페이지 rewrite 와 `api/*` 함수(maxDuration 30s)를 구성합니다.
4. **Settings → Git** 에서 GitHub 연동/자동배포를 켜두면 이후 push 시 자동 배포됩니다.

> ⚠️ **API 쿼터**: 라이브 여부 판별은 `search.list`(호출당 100유닛)를 사용합니다. 기본 무료 쿼터는 하루 10,000유닛이라
> 채널 7개 대시보드 1회 새로고침 ≈ 700유닛 → 하루 약 14회 수준입니다. 45초 서버 캐시로 반복 조회 낭비를 줄였고,
> 라이브 보드에서는 “예정” 감지를 생략해 쿼터를 절약합니다. 더 필요하면 Google Cloud 콘솔에서 쿼터 상향을 신청하세요.
>
> ⚠️ 서버리스 함수 실행시간 제한(`vercel.json` 에서 30s)이 있어, 한 번에 조회하는 채널 수가 아주 많으면 타임아웃될 수 있습니다.

## 3) 다른 코드에서 모듈로 사용

```js
import { getChannelInfo } from "./youtube-info.mjs";

const { channel, live } = await getChannelInfo("@maebulshow");
console.log(channel.title, live.isLive ? "방송중" : "오프라인");
```

## 참고 / 한계

- 유튜브가 페이지 구조를 바꾸면 일부 항목 파싱이 실패할 수 있습니다. (구독자·동영상 수는 텍스트 탐색 방식이라 비교적 견고)
- 대량·자동 반복 조회 시 유튜브에서 일시적으로 요청을 제한할 수 있습니다. 안정적인 대량 처리가 필요하면 [YouTube Data API v3](https://developers.google.com/youtube/v3)(API 키 필요) 사용을 권장합니다.
- 공개 채널만 조회 가능합니다.
