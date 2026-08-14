# GRAVITON

모바일 웹 브라우저에서 설치 없이 즐기는 **회전 중력 머지 퍼즐**.

> 막혔을 때, 보드를 돌려버려라.

7×7 격자에 숫자 오브를 떨어뜨려 같은 숫자 3개 이상을 붙이면 합쳐집니다. 막히면 **보드 전체를 90° 회전**시켜 모든 오브를 다시 낙하시키고 연쇄를 터뜨립니다. 회전은 연쇄로만 충전되는 제한 자원입니다.

- 조작: 열 **탭**(드롭) + 좌우 **스와이프**(회전) — 한 손 엄지로 완결
- 1판 60~120초 · 오프라인 동작(PWA) · 데일리 시드 공유
- 스택: TypeScript + Vite + Canvas 2D, 게임 엔진 없음
- 번들: **gzip 약 17KB** (JS 12.4KB + CSS 2.3KB + HTML 2.4KB)

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
```

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (LAN 노출 — 실기기 테스트용) |
| `npm run build` | 타입체크 + 프로덕션 빌드 → `dist/` |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm test` | 코어 로직 유닛 테스트 (38개) |
| `node scripts/make-icons.mjs` | PWA 아이콘 PNG 재생성 |

## 배포 — GitHub Pages (로컬 설치 불필요)

푸시하면 GitHub Actions가 알아서 빌드·배포합니다. 로컬에 Node나 npm이 없어도 됩니다.

**최초 1회만** 저장소 설정에서 Pages 소스를 지정하세요:

> **Settings → Pages → Build and deployment → Source: `GitHub Actions`**

이후에는 `main` 또는 `claude/mobile-web-game-plan-z33pm2` 브랜치에 푸시할 때마다
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)이 테스트 → 빌드 → 배포를 수행합니다.
Actions 탭에서 **Deploy to GitHub Pages → Run workflow**로 수동 실행도 가능합니다.

배포 주소: `https://<사용자명>.github.io/WebGame/`

하위 경로(`/WebGame/`) 배포를 전제로 모든 경로가 상대 경로(`base: './'`)이며,
매니페스트·아이콘·서비스워커 스코프·오프라인 재접속까지 해당 경로에서 검증했습니다.

다른 정적 호스팅을 쓴다면 `dist/`를 그대로 올리면 됩니다. 서버 로직은 없습니다.

## 조작

| 입력 | 동작 |
| --- | --- |
| 열 탭 / 드래그 후 놓기 | 해당 열에 오브 드롭 (드래그 중 낙하 지점 미리보기) |
| 보드 좌우 스와이프 | 보드 90° 회전 (게이지 1 소모) |
| 하단 ⟲ / ⟳ 버튼 | 보드 회전 |
| 키보드 ←/→, Space, Z/X | 데스크톱 플레이 (열 이동 / 드롭 / 좌·우 회전) |

## 모드

- **엔들리스** — 기록 도전. 진행 중인 판은 자동 저장되어 이어하기 가능
- **데일리** — 날짜 시드로 전 세계가 동일한 오브 순서를 플레이. 결과 공유 텍스트 생성
- **러시 60** — 60초 안에 최대 점수

## 구조

```
src/
  core/          게임 로직 (DOM 무의존 · 정수 연산만 · 유닛 테스트 대상)
    rng.ts         mulberry32 결정론적 난수 + 날짜 시드
    board.ts       격자, 중력, 90° 회전
    merge.ts       연결 컴포넌트 탐색과 연쇄 해석
    game.ts        상태 머신, 점수, 회전 게이지, 석화 타일, 게임오버
  render/        Canvas 2D 렌더러 + 애니메이션 재생, 파티클 풀, 팔레트
  input/         Pointer/키보드 입력 → 게임 액션
  audio/         Web Audio 신디사이저 (오디오 에셋 0개)
  storage.ts     설정 · 최고기록 · 이어하기 스냅샷
  i18n.ts        한국어/영어
  share.ts       결과 공유 텍스트
tests/           코어 로직 테스트
public/          PWA 매니페스트 · 서비스워커 · 아이콘
```

**코어와 표현의 분리**가 이 설계의 핵심입니다. `core/`는 이동 하나를 즉시 계산해 최종 상태와 함께 **이벤트 목록**(drop → gravity → merge → gravity → …)을 내보내고, `render/`가 이를 순서대로 재생합니다. 덕분에 로직은 브라우저 없이 테스트 가능하고, 연출은 로직을 건드리지 않고 바꿀 수 있습니다.

## 결정론

게임 로직은 부동소수점 없이 정수 격자 연산만 사용하고, 난수는 시드에서 재현 가능한 mulberry32입니다. 따라서 같은 시드 + 같은 입력은 어떤 기기에서도 같은 결과를 냅니다. 데일리 모드, 이어하기, 리플레이 회귀 테스트가 모두 이 성질에 기대고 있습니다.

## 모바일 웹 대응

- `touch-action: none`, `overscroll-behavior: none` — 스크롤·당겨서 새로고침·확대 차단
- `visualViewport` 기반 `--vh` — iOS `100vh` 문제 회피
- `env(safe-area-inset-*)` — 노치/홈 인디케이터 회피
- 백그라운드 진입 시 자동 일시정지 + 진행 저장 (rAF 정지로 인한 프레임 점프 방지)
- `devicePixelRatio` 상한 2 · 파티클 풀링 — 저사양 기기 프레임 유지
- 색 + 도형 + 숫자 3중 코딩, 색약 팔레트(Okabe-Ito) 옵션
- 모션 줄이기(OS 설정 자동 감지), 진동/소리 개별 토글, 왼손/오른손 모드
- Service Worker 런타임 캐싱 → 오프라인 플레이 및 홈 화면 추가

## 문서

- [게임 기획서](docs/GAME_PLAN.md) — 규칙 상세, UX 설계, 마일스톤, 검증 계획, 리스크
