# UNCLAIMED (가제) — 찾아가지 않은 것들

분실물 보관소 아래, 아무도 찾으러 오지 않은 물건들이 영혼을 얻어 이룬 세계를 무대로 한 2D 픽셀 RPG. 웹 브라우저에서 실행됩니다.

> 현재 단계: **PHASE 4까지 완료** — 메인 메뉴·저장·필드·대화·전투가 실제로 플레이 가능합니다 (방 3개, 적 2종). 진행 상황은 [docs/ROADMAP.md](docs/ROADMAP.md)

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

## 조작

| 키 | 필드 | 전투 | 메뉴·대화 |
|---|---|---|---|
| 방향키 / WASD | 이동 (짧게 누르면 방향만 전환) | 영혼 이동 · 명령 선택 | 커서 이동 |
| Z / Enter / Space | 말 걸기 · 조사 | 결정 · 타이밍 공격 | 결정 · 대사 넘김 |
| X / Shift | 누르고 있으면 달리기 | 누르고 있으면 정밀 이동 · 취소 | 취소 · 대사 건너뛰기 |
| C / Ctrl | 메뉴 (주머니·상태·설정) | — | — |
| F4 / Alt+Enter | 전체화면 | | |
| F3 | 디버그 패널 | | |

터치: 필드에서 화면 십자 패드와 Z/X/C 버튼, 메뉴는 항목을 직접 탭(선택된 항목을 한 번 더 탭하면 결정), 대사는 화면 탭으로 넘깁니다. 게임패드(표준 매핑)도 지원합니다.

## 지금 플레이할 수 있는 것

1. 새로 하기 → 기록 칸 선택 → 이름 입력 (특정 이름에는 반응이 있습니다)
2. **투입구 바닥**: 떨어진 자리. 물건 더미를 여러 번 조사해 보세요.
3. **분류실**: 등록 장부 **레저**와의 만남(선택지), 도장 책상(기록), 상자 라벨, 숨은 공간
4. **우산꽂이 숲 입구**: 첫 전투(꼬인 이어폰)와 랜덤 인카운터(영수증 유령). 치우거나, 대화로 미련을 풀어 놓아줄 수 있습니다. 레저는 당신이 무엇을 했는지 기억합니다.

## 문서

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 기술 스택, 렌더링 원칙, 계층·의존성 규칙, 시스템별 역할
- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — 세계관, 캐릭터, 전투(CLEAR / ACT / POCKET / LET GO), 루트, 메타 연출
- [docs/ASSET_PLAN.md](docs/ASSET_PLAN.md) — 그래픽·사운드 사양, 제작 파이프라인, 에셋 상태
- [docs/ROADMAP.md](docs/ROADMAP.md) — PHASE별 일정, 완료 기준, 진행 기록

## 구조

```
src/
├── main.ts                 진입점, 치명적 오류 화면
├── game/                   Constants, GameConfig, Game(앱 루트), Services, GameState, GameSession
├── scenes/                 Boot, Preload, Menu, World, Battle, GameOver, Overlay, DevRoom(개발용)
├── entities/               Player, NPC, Soul, Enemy
├── systems/                Event, Settings, Display, Input, Audio, Font, Locale, Save, Inventory,
│   │                       Dialogue(VM), Battle(규칙), Bullet(탄막), VirtualControls
│   ├── script/             Condition(조건식)
│   ├── text/               RichText, TextWrap
│   ├── content/            ContentDB(로딩·검증), types
│   ├── assets/             AssetManifest, PixelArt, PlaceholderFactory
│   ├── audio/              MusicPlayer(칩튠 시퀀서)
│   └── storage/            SafeStorage, VersionedStore
├── ui/                     PixelText, Panel, ListMenu, UIStack, MenuPanels, NameEntryPanel,
│                           PauseMenu, DialogueUI, BattleUI, TouchControls
├── utils/                  Math, Scale, Dither, Animation, Korean(조사)
├── data/                   maps, dialogues, enemies, items, characters, art(픽셀아트),
│                           audio(sfx, songs), story, strings, assets/manifest.json
└── assets/fonts/           Galmuri (SIL OFL 1.1)
tests/unit/                 Vitest (콘텐츠 교차 검증 포함)
scripts/                    smoke-test.mjs, asset-report.mjs
```

새 맵·대사·적을 추가하는 방법은 [docs/ARCHITECTURE.md §5.1](docs/ARCHITECTURE.md)의 데이터 형식을 참고하세요. 잘못된 참조는 `npm test`가 잡아냅니다.

## 라이선스 고지

- Galmuri 폰트 © Lee Minseo — SIL Open Font License 1.1 (`src/assets/fonts/Galmuri-OFL-LICENSE.txt`)
