# Chronostory Deployment Guide

이 프로젝트는 지금 상태로 온라인 배포가 가능합니다.

다만 실사용 기준으로는 `file` 저장소가 아니라 `Supabase` 저장소를 쓰는 것을 권장합니다.

## 1. 로컬 최종 확인

아래 명령이 통과하면 배포 후보로 볼 수 있습니다.

```bash
npm.cmd run lint
node node_modules/typescript/bin/tsc --noEmit
npm.cmd run build
```

## 2. Supabase 준비

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 [supabase/chronostory.sql](C:\Users\User\Desktop\Codex_Test\supabase\chronostory.sql)을 실행합니다.
3. 아래 환경변수를 준비합니다.

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## 3. Vercel 배포

1. 이 프로젝트를 Git 저장소에 올립니다.
2. Vercel에서 해당 저장소를 Import 합니다.
3. Framework Preset은 `Next.js`로 둡니다.
4. Environment Variables에 아래 값을 등록합니다.

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

5. Deploy를 실행합니다.

## 4. 배포 후 확인

배포가 끝나면 아래 경로를 확인하면 됩니다.

- 메인 화면: `/`
- 설정 상태: `/api/chronostory/setup`
- 헬스체크: `/api/chronostory/health`

헬스체크 응답에서 아래를 보면 됩니다.

- `ok: true`
- `backend: "supabase"`
- `setup.supabaseReady: true`

## 5. 현재 권장 구조

- 프론트엔드: Next.js
- API: Next.js Route Handlers
- 영구 저장소: Supabase
- 배포: Vercel

## 6. 주의할 점

- `data/chronostory.json` 파일 저장은 로컬 개발에서는 괜찮지만, Vercel 실서비스 저장소로는 적합하지 않습니다.
- 실서비스에서는 꼭 Supabase 환경변수를 넣고 배포하는 것이 좋습니다.
