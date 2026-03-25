# 크로노스토리 보스 타이머

피아누스와 제노메가의 서버별 처치 시각과 리스폰 타이머를 관리하는 Next.js 기반 공유 대시보드입니다.

## 현재 상태

- 로컬에서 `http://localhost:3000`으로 UI 점검 가능
- 기본 저장소는 `data/chronostory.json` 파일
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 넣으면 자동으로 Supabase 저장소로 전환
- 프론트는 `/api/chronostory`만 호출하므로 로컬 파일 저장소와 Supabase를 같은 UI로 다룰 수 있음

## 로컬 실행

1. `npm.cmd run dev`
2. 브라우저에서 `http://localhost:3000`

## 검증

- `npm.cmd run lint`
- `node node_modules/typescript/bin/tsc --noEmit`

이 환경에서는 `next dev`, `next build`, `npm test`가 샌드박스의 `spawn EPERM` 제한에 걸릴 수 있습니다. 실제 로컬 PC나 배포 환경에서는 정상 동작합니다.

## Supabase 연동 상태

### 완료된 부분

- Supabase SDK 설치
- 저장소 계층 추상화
- 파일 저장소 / Supabase 저장소 자동 선택 로직
- Next.js API에서 Supabase 데이터 읽기/쓰기 코드 연결
- 초기 스키마 SQL 파일 추가

### 현재 코드가 사용하는 테이블

- `public.chronostory_state`
  - `id`
  - `payload jsonb`
  - `updated_at`

현재는 배포 단순성과 빠른 검증을 위해 `jsonb` 스냅샷 테이블 1개를 사용합니다. 트래픽이 커지면 `servers`, `boss_timers`, `boss_reports` 형태의 정규화 모델로 확장하는 것을 권장합니다.

## Supabase 설정 방법

1. Supabase 프로젝트 생성
2. SQL Editor에서 [supabase/chronostory.sql](C:\Users\User\Desktop\Codex_Test\supabase\chronostory.sql) 실행
3. `.env.local`에 아래 값 추가

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

4. 개발 서버 재시작
5. 대시보드 상단 배지가 `Supabase 연결됨`으로 바뀌는지 확인

## Vercel 배포 준비 상태

코드는 Vercel 배포가 가능하도록 준비돼 있지만, 실제 Vercel 계정/프로젝트 연결과 배포 실행은 아직 하지 않았습니다.

### 배포 절차

1. Git 저장소에 푸시
2. Vercel에서 프로젝트 import
3. 환경변수 등록
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. 배포 후 `/api/chronostory`와 메인 페이지 동작 확인

## 주요 파일

- [app/page.tsx](C:\Users\User\Desktop\Codex_Test\app\page.tsx)
  - 한국어 UI, 타이머 표시, 폼 입력, 동기화 UX
- [app/api/chronostory/route.ts](C:\Users\User\Desktop\Codex_Test\app\api\chronostory\route.ts)
  - 읽기/쓰기 API
- [lib/chronostory.ts](C:\Users\User\Desktop\Codex_Test\lib\chronostory.ts)
  - 도메인 로직
- [lib/chronostory-storage.ts](C:\Users\User\Desktop\Codex_Test\lib\chronostory-storage.ts)
  - 저장소 선택 계층
- [lib/chronostory-store.ts](C:\Users\User\Desktop\Codex_Test\lib/chronostory-store.ts)
  - 로컬 파일 저장소
- [lib/chronostory-supabase-store.ts](C:\Users\User\Desktop\Codex_Test\lib/chronostory-supabase-store.ts)
  - Supabase 저장소
- [supabase/chronostory.sql](C:\Users\User\Desktop\Codex_Test\supabase\chronostory.sql)
  - 초기 스키마
