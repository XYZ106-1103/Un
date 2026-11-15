# UNCLAIMED (가제) — 찾아가지 않은 것들

분실물 보관소 아래, 아무도 찾으러 오지 않은 물건들이 영혼을 얻어 이룬 세계를 무대로 한 2D 픽셀 RPG. 웹 브라우저에서 실행됩니다.

> 현재 버전: **v0.2.0 — 0장 + 1장 + 2장 완성.** 처음부터 2장 엔딩(루트 3종)과 크레딧까지 이어서 플레이할 수 있습니다 (맵 10개, 일반 적 9종, 보스 2, 쇼 전투 1, 상점 2, 곡 13개).
> 3–4장은 아직 만들지 않았습니다. 진행 상황과 알려진 한계는 [docs/ROADMAP.md](docs/ROADMAP.md)

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
npm test               # 단위 테스트 (Vitest) — 콘텐츠 교차 검증, 폰트 글리프 커버리지 포함
npm run build && npm run smoke   # Chromium 스모크 테스트: 레이아웃, 0장 여정, 1장→2장 연속 플레이(두 루트),
                                 # 저장소 손상, 기기 프로필, 오류 알림 (playwright 필요)
npm run smoke -- --only story,damaged      # 일부 구역만 (layout, desktop, phone, story, damaged, devices, crash)
npm run bench          # 탄막 부하 벤치마크 (동시 탄 80 ~ 2,000발)
npm run assets:report -- --strict   # 출시 게이트: 플레이스홀더가 하나라도 있으면 실패
```

스모크 테스트·벤치마크는 `playwright` 패키지가 필요합니다: `npm i -D playwright && npx playwright install chromium`
폰트를 다시 서브셋하려면 `pip install fonttools brotli` 후 `npm run fonts:subset -- <원본 Galmuri 폴더>`

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

**0장 — 투입구와 분류실**
1. 새로 하기 → 기록 칸 선택 → 이름 입력 (특정 이름에는 반응이 있습니다)
2. **투입구 바닥**: 떨어진 자리. 물건 더미를 여러 번 조사해 보세요.
3. **분류실**: 등록 장부 **레저**와의 만남(선택지), 도장 책상(기록), 상자 라벨, 숨은 공간
4. **우산꽂이 숲 입구**: 첫 전투(꼬인 이어폰)와 랜덤 인카운터(영수증 유령). 치우거나, 대화로 미련을 풀어 놓아줄 수 있습니다.

**1장 — 우산꽂이 숲**
5. 매일 주인에게 편지를 쓰는 장갑 오른짝 **미트**. 주머니 속 왼짝 장갑을 보여줄 수도, 숨길 수도 있습니다.
6. 숲의 적 4종(외짝 양말, 여분 단추, 고무 오리, 스노글로브), 귀걸이 형제 **후프 & 스터드**의 상점
7. 밸브 퍼즐 → 물탱크 → 물뿌리개. 어디에 쓰는지는 직접 알아내 보세요.
8. 보스 **브롤리 경**: 2페이즈, 끈에 묶인 영혼, 그리고 칼 대신 다른 방법으로 끝내는 길
9. 숲 끝의 등불 아래에서 1장의 마무리 — 그리고 「제2장」

**2장 — 양말 마을**
10. 짝 잃은 양말들의 마을. 인사 담당 **핍**, 수선집의 **실타래 할머니**(숲에서 산 실을 기억해 두세요)
11. 열리지 못한 **짝 찾기 축제**: 광장의 큰 빨랫줄에 양말 네 짝을 올바른 순서로 걸어야 등불이 켜집니다. 게시판은 반쯤 번져 있습니다.
12. 틀니 코미디언 **클랙**의 쇼. 농담은 세 번째부터 웃깁니다(아마도).
13. 모두가 양말을 먹는다고 말하는 건조기 **텀블**. 2페이즈에서는 빙글빙글 도는 물살이 영혼을 밀어냅니다.
14. 1장에서 누구를 놓아줬는지, 미트에게 무엇을 해 줬는지가 마을에 돌아옵니다.
15. 2장 **엔딩 3종**(돌려주기 · 간직하기 · 치우기)과 크레딧

모든 것을 치우면 세계가 조용해지고, 레저는 잉크로 적은 것을 잊지 않습니다. 엔딩을 본 뒤 타이틀 화면을 다시 보세요.

## 문서

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 기술 스택, 렌더링 원칙, 계층·의존성 규칙, 시스템별 역할
- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — 세계관, 캐릭터, 전투(CLEAR / ACT / POCKET / LET GO), 루트, 메타 연출
- [docs/ASSET_PLAN.md](docs/ASSET_PLAN.md) — 그래픽·사운드 사양, 제작 파이프라인, 에셋 상태
- [docs/ROADMAP.md](docs/ROADMAP.md) — PHASE별 일정, 완료 기준, 진행 기록

## 구조

```
src/
├── main.ts                 진입점, 시작 실패 화면
├── game/                   Constants, GameConfig, Game(앱 루트), Services, GameState, GameSession,
│                           ErrorOverlay(런타임 오류 알림)
├── scenes/                 Boot, Preload, Menu, World, Battle, GameOver, Ending, Overlay, DevRoom(개발용)
├── entities/               Player, NPC, Follower, Soul, Enemy
├── systems/                Event, Settings, Display, Input, Audio, Font, Locale, Save, Inventory,
│   │                       Dialogue(VM), Battle(규칙), Bullet(탄막), Story(루트), Meta(영구 기록),
│   │                       Particles, VirtualControls
│   ├── script/             Condition(조건식)
│   ├── text/               RichText, TextWrap
│   ├── content/            ContentDB(로딩·검증), types
│   ├── assets/             AssetManifest, PixelArt, PlaceholderFactory
│   ├── audio/              MusicPlayer(칩튠 시퀀서)
│   └── storage/            SafeStorage, VersionedStore
├── ui/                     PixelText, Panel, ListMenu, UIStack, MenuPanels, NameEntryPanel,
│                           PauseMenu, DialogueUI, BattleUI, ShopPanel, TouchControls
├── utils/                  Math, Scale, Dither, Animation, Korean(조사)
├── data/                   maps, dialogues, enemies, items, characters, shops, art(픽셀아트),
│                           audio(sfx, songs), story(routes·endings·quests·credits), strings,
│                           assets/manifest.json
└── assets/fonts/           Galmuri 서브셋 (SIL OFL 1.1) + coverage.json(글리프 범위)
tests/unit/                 Vitest (콘텐츠 교차 검증, 폰트 커버리지 포함)
scripts/                    smoke-test.mjs, bench-bullets.mjs, asset-report.mjs, subset-fonts.py
```

새 맵·대사·적을 추가하는 방법은 [docs/ARCHITECTURE.md §5.1](docs/ARCHITECTURE.md)의 데이터 형식을 참고하세요. 잘못된 참조는 `npm test`가 잡아냅니다.

## 라이선스 고지

- Galmuri 폰트 © Lee Minseo — SIL Open Font License 1.1 (`src/assets/fonts/Galmuri-OFL-LICENSE.txt`). 배포본은 사용 글자 범위로 서브셋한 파일입니다(OFL 허용 범위의 수정).
- 그 밖의 모든 그래픽·음악·효과음·텍스트는 이 프로젝트를 위해 새로 만든 것입니다.
