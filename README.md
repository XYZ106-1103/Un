# UNCLAIMED (가제) — 찾아가지 않은 것들

분실물 보관소 아래, 아무도 찾으러 오지 않은 물건들이 영혼을 얻어 이룬 세계를 무대로 한 2D 픽셀 RPG. 웹 브라우저에서 실행됩니다.

> 현재 단계: **PHASE 1 (프로젝트 기반) 완료** — 진행 상황은 [docs/ROADMAP.md](docs/ROADMAP.md)

## 실행

```bash
npm ci            # 의존성 설치 (Node 20.19+)
npm run dev       # 개발 서버 http://localhost:5173
npm run build     # 타입 검사 + 프로덕션 빌드 → dist/
npm run preview   # 빌드 결과 미리보기
```

`dist/`는 상대 경로로 빌드되므로 어떤 정적 호스팅(itch.io, GitHub Pages 등)에도 그대로 올릴 수 있습니다.

## 검증

```bash
npm run typecheck      # TypeScript 검사
npm test               # 단위 테스트 (Vitest)
npm run build && npm run smoke   # Chromium에서 5개 화면 크기 스모크 테스트 (playwright 필요)
npm run assets:report  # 에셋 상태 (placeholder / wip / final)
```

스모크 테스트는 `playwright` 패키지가 필요합니다: `npm i -D playwright && npx playwright install chromium`

## 조작 (PHASE 1)

| 키 | 동작 |
|---|---|
| 방향키 / WASD | 이동 |
| Z / Enter / Space | 결정 |
| X / Shift | 취소 (테스트 룸 → 타이틀) |
| C / Ctrl | 메뉴 (테스트 룸: 배율 모드 전환) |
| F4 / Alt+Enter | 전체화면 |
| F3 | 디버그 패널 |

터치: 타이틀에서 화면 터치로 시작, 테스트 룸에서는 길게 눌러 그 방향으로 이동. 게임패드(표준 매핑) 지원.

## 문서

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 기술 스택, 렌더링 원칙, 계층·의존성 규칙, 시스템별 역할
- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — 세계관, 캐릭터, 전투(CLEAR / ACT / POCKET / LET GO), 루트, 메타 연출
- [docs/ASSET_PLAN.md](docs/ASSET_PLAN.md) — 그래픽·사운드 사양, 제작 파이프라인, 에셋 상태
- [docs/ROADMAP.md](docs/ROADMAP.md) — PHASE별 일정, 완료 기준, 진행 기록

## 구조

```
src/
├── main.ts                 진입점, 치명적 오류 화면
├── game/                   Constants, GameConfig, Game(앱 루트), Services(레지스트리)
├── scenes/                 Boot, Preload, Title, DevRoom(개발용), Overlay(디버그)
├── systems/                Event, Settings, Display, Input, Audio, Font, Locale,
│   ├── storage/            SafeStorage, VersionedStore
│   └── assets/             AssetManifest, PlaceholderFactory
├── ui/                     PixelText
├── utils/                  Math, Scale, Dither, Animation
├── data/                   assets/manifest.json, audio/sfx.json, strings/{ko,en}.json
├── assets/fonts/           Galmuri (SIL OFL 1.1)
└── styles/                 main.css
tests/unit/                 Vitest
scripts/                    smoke-test.mjs, asset-report.mjs
```

## 라이선스 고지

- Galmuri 폰트 © Lee Minseo — SIL Open Font License 1.1 (`src/assets/fonts/Galmuri-OFL-LICENSE.txt`)
