# 인프라덱스 (InfraDex)

AI 데이터센터 신입 직원을 위한 **출처 기반 전문 용어 학습 서비스**.
단어장 + 출처 기반 챗봇(RAG) + 퀴즈·도감을 하나의 학습 흐름으로 묶었습니다. (팀: 어린이탐정단)

```
infradex/
├── backend/                  FastAPI + LangGraph + RAG
│   ├── app/
│   │   ├── main.py           API 라우터
│   │   ├── content.py        용어 DB 로더
│   │   ├── db.py             사용자 진도 (SQLite): 도감·미해결·간격 반복·연속 학습일
│   │   ├── agents/
│   │   │   ├── explain_graph.py   검색·설명 Agent (LangGraph: retrieve → grade → generate | refuse)
│   │   │   ├── quiz_agent.py      퀴즈 Agent (사전 생성 문항 출제 + LLM 문항 초안 생성)
│   │   │   ├── feedback_agent.py  평가·피드백 Agent (채점·해설·도감 등록·배지)
│   │   │   └── diagnosis_agent.py 진단 Agent (P2: 수준 진단·코스 추천)
│   │   ├── rag/              청크 구성(corpus.py), 검색기(retriever.py)
│   │   └── data/
│   │       ├── terms.json    용어 DB 36개 (3단계 설명·출처·5지선다 퀴즈 5문항)
│   │       ├── categories.json
│   │       └── docs/         팀이 재서술한 공식 문서 요약 (RAG 추가 검색 대상)
│   ├── scripts/evaluate.py   기획서 14장 평가 지표 자동 측정
│   ├── scripts/generate_quiz.py  LLM 퀴즈 초안 생성 (검수용)
│   ├── eval/questions.json   평가 질문 세트 (범위 밖 질문 포함)
│   └── tests/
├── frontend/                 React + Vite + TypeScript + Tailwind
│   └── src/pages/            홈·단어장·용어 상세·퀴즈·탐정 조수(챗봇)·내 도감·코스·진단
├── Dockerfile                화면+API를 한 서버로 묶는 배포 이미지
├── render.yaml               Render 배포 설정 (Blueprint)
└── .github/workflows/ci.yml  테스트·평가·빌드
```

## 빠르게 실행하기

처음 한 번만 설치합니다.

```bash
cd backend && pip install -r requirements-dev.txt
cd ../frontend && npm install
```

| 상황 | 명령 | 터미널 | 접속 주소 |
|---|---|---|---|
| **코드를 고치는 중** (저장하면 화면 자동 갱신) | `frontend` 폴더에서 `npm run dev:all` | 1개 | http://localhost:5173 |
| **시연·발표** (배포와 같은 방식) | 프로젝트 폴더의 `start.bat` 더블클릭 (Mac: `./start.sh`) | 1개 | http://localhost:8000 |
| **배포 후** | 실행할 것 없음 | 없음 | Render 주소 |

Azure OpenAI를 쓰려면 `backend/.env.example`을 `backend/.env`로 복사하고 키를 입력합니다. (비워 두면 오프라인 모드)

### 두 가지 동작 모드

| | LLM 모드 | 오프라인 모드 |
|---|---|---|
| 조건 | `.env`에 Azure OpenAI 엔드포인트·키 설정 | 키 없음, 또는 초기화 실패 시 자동 전환 |
| 검색 | Azure 임베딩 + 경량 벡터 색인(numpy, 디스크 캐시) | BM25 + 한글 바이그램 + 별칭 매칭 |
| 답변 | 근거 범위 안에서 LLM이 3단계로 생성, `[n]` 인용 | 용어 DB 3단계 설명을 그대로 출처와 함께 제시 |
| 근거 없음 | 임계값 미달 시 LLM 호출 없이 "확인 불가" | 동일 |

오프라인 모드는 **시연 중 API 장애 대비용 백업**이기도 합니다 (기획서 15.1).

## Agent 흐름

```
[진단 Agent] → 검색·설명 Agent(RAG) → 퀴즈 Agent → 평가·피드백 Agent → (복습 루프)

검색·설명 그래프 (LangGraph)
  retrieve ─▶ grade ─┬─(근거 점수 ≥ 임계값)─▶ generate ─▶ END
                     └─(근거 없음)──────────▶ refuse   ─▶ END   "확인 불가"
```

- 청크는 **(용어 × 출처)** 단위라서 답변의 `[1]`이 정확히 하나의 공식 문서를 가리킵니다.
- 출처(url)가 없는 문서는 색인하지 않습니다.
- 퀴즈는 사전 생성·검수된 문항만 출제합니다 (응답 지연·비용·환각 리스크 대응).

## 학습 방식

| 화면 | 설명 |
|---|---|
| **오늘의 수사** (`/session`) | 용어 3개를 카드(정의 → 비유 → 현장 메모 → 출처)로 읽고 바로 퀴즈 3문제로 확인. 용어마다 해결/미해결 판정, 마지막에 수집한 카드가 뒤집히며 등장 |
| **플래시카드** (`/flashcards`) | 용어를 보고 뜻을 떠올린 뒤 뒤집어 확인. 알아요/헷갈려요로 분류하고, 헷갈린 용어는 바로 퀴즈 세션으로 연결 |
| **퀴즈** (`/quiz`) | 용어별·코스별·복습 모드 |
| **내 도감** (`/dex`) | 카테고리별 수집 현황. 미발견 카드는 실루엣, 방금 수집한 카드는 뒤집히는 연출 |

키보드: 퀴즈 1~5(또는 A~E) 선택 · Enter 다음 / 플래시카드 Space 뒤집기 · ← 헷갈려요 · → 알아요

카테고리마다 색과 아이콘이 있습니다 (AI 핵심 보라, GPU 주황, 네트워크 파랑, 서버 운영 청록, 서비스 분홍). 정의는 `frontend/src/lib/categories.tsx`.

## 학습·도감 규칙

- 용어마다 5지선다 5문항: 정의 / 개념·비유 / 실무 상황 / 혼동 구분 / 틀린 것 찾기.
- 출제는 **안 본 문항 → 틀린 문항 → 맞힌 문항** 순으로 고르고, 화면에서 문제·선지 순서를 섞습니다.
- 한 용어에서 **서로 다른 3문항**을 맞히면 **도감 등록(해결)**.
- 틀리면 **미해결 사건**이 되고, 복습 때는 방금 틀린 문항이 아닌 **새 각도의 문항**으로 다시 묻습니다. 서로 다른 문항을 **연속 2개** 맞히면 해결됩니다.
- 복습에서 맞히면 해결 처리되고, Leitner 상자 간격(1·2·4·8·16일)으로 다음 복습일이 정해집니다.
- 문항에는 `review_status: "draft"`가 붙어 있습니다. 팀 검수 후 `"reviewed"`로 바꿔 주세요.
- 배지: 첫 사건 해결, 첫 증거 확보(출처 원문 열람), 증거 수집가, 미제 사건 해결, 연속 학습, 카테고리 완결.

## 평가 지표 측정 (기획서 14장)

```bash
cd backend
python -m scripts.evaluate --out eval_result.csv
```

근거 용어 일치율, 범위 밖 질문의 "확인 불가" 비율, 근거 없는 단정 답변 수, 응답 시간, 출처 연결률을 출력합니다.
CSV에는 사람이 채점할 `human_accuracy`, `human_source_support` 열이 있어 ChatGPT 비교 실험에 그대로 쓸 수 있습니다.

현재 오프라인 모드 결과: 근거 일치 24/24, 확인 불가 4/4, 단정 답변 0건, 출처 연결률 100%.

## 콘텐츠 추가·수정

1. `backend/app/data/terms.json`에 용어를 추가합니다. 필드: `id, term, term_en, aliases, category, difficulty, definition, analogy, practical_context, pitfall, related_terms, sources[], quiz[]`
2. 출처마다 `org, title, url, checked_at, evidence(팀이 재서술한 근거 요약)`를 적습니다.
3. 작성자 1인 + 검토자 1인이 PR로 교차 확인합니다. `pytest`가 출처·퀴즈·관련 용어 무결성을 검사합니다.
4. 더 긴 공식 문서 요약은 `backend/app/data/docs/`에 front-matter와 함께 넣으면 RAG 검색 대상이 됩니다.

> ⚠️ **시드 데이터의 출처 URL과 근거 요약은 초안입니다.** 발표 전에 아래 스크립트로 링크를 점검하고, 근거 요약이 원문과 맞는지 팀이 교차 확인한 뒤 `checked_at`을 갱신해 주세요.
>
> ```bash
> cd backend
> python -m scripts.check_sources --csv source_check.csv   # 깨진 링크·이동된 링크·너무 넓은 링크 표시 + 확인용 체크리스트
> ```

## 배포 (Render, URL 1개)

화면(React)과 API(FastAPI)를 **하나의 Docker 이미지**로 묶어 배포합니다. 주소가 하나라서 CORS·API 주소 설정이 필요 없고, 평가자에게는 URL 하나만 주면 됩니다.

1. 이 프로젝트를 GitHub 저장소에 올립니다.
2. [render.com](https://render.com)에 GitHub로 로그인 → **New → Blueprint** → 저장소 선택. `render.yaml`이 자동으로 인식됩니다.
3. 환경 변수 `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`를 입력합니다. (비워 두면 오프라인 모드로 동작)
4. 배포가 끝나면 `https://infradex-xxxx.onrender.com` 같은 주소가 생깁니다. 이 주소로 QR 코드를 만들어 발표에 씁니다.

**무료 플랜 주의점**

| 현상 | 영향 | 대응 |
|---|---|---|
| 15분 동안 접속이 없으면 서버가 잠듦 | 첫 접속이 30초~1분 걸림 (화면 상단에 "서버를 깨우는 중" 안내가 뜸) | 발표 10분 전에 미리 한 번 접속해 깨워 두기 |
| 재배포·재시작 시 디스크 초기화 | 학습 진도(도감)가 사라짐 | 시연은 문제없음. 유지가 필요하면 유료 플랜 + `render.yaml`의 `disk` 주석 해제 |

**배포 후 확인**: `/api/health`에서 `"llm": true`면 Azure 연결 성공입니다.

### 발표용 지표 페이지

`/stats?token=<STATS_TOKEN>`에서 학습자 수, 퀴즈 정답률, 챗봇 평균 응답 시간, "확인 불가" 비율, 어려워하는 용어를 볼 수 있습니다.
`STATS_TOKEN` 값은 Render 대시보드의 Environment에서 확인합니다. 메뉴에는 노출되지 않습니다.

### 운영 보호 장치

- 챗봇은 브라우저+IP 기준 **1분 15회**로 제한합니다 (`CHAT_RATE_PER_MINUTE`). LLM 비용 폭주를 막습니다.
- Azure 호출이 실패하면 그 질문만 키워드 검색·용어 카드 답변으로 대신해, 시연 중 오류 화면이 뜨지 않습니다.
- 화면 하나에서 오류가 나도 전체가 멈추지 않도록 오류 경계(Error Boundary)를 두었습니다.

### (선택) 화면과 API를 따로 배포하기

Vercel(화면) + Render(API)로 나누려면 `frontend/.env.example`의 `VITE_API_BASE`에 API 주소를 넣고, API 쪽 `CORS_ORIGINS`에 화면 주소를 넣습니다.

## API 요약

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/terms?category=&q=` | 단어장 목록·검색 (별칭 포함) |
| GET | `/api/terms/{id}` | 용어 상세 (3단계 설명, 출처, 관련 용어, 내 상태) |
| POST | `/api/terms/{id}/favorite` | 즐겨찾기 토글 |
| POST | `/api/terms/{id}/source-view` | 출처 원문 열람 기록 (증거 배지) |
| POST | `/api/chat` | 출처 기반 챗봇 |
| GET | `/api/quiz?term_id=&category=&mode=learn\|review` | 문항 출제 |
| POST | `/api/quiz/answer` | 채점·해설·도감 반영 |
| GET/POST | `/api/diagnosis` | 진단 문항 / 결과·추천 코스 |
| GET | `/api/progress`, `/api/dex`, `/api/courses` | 홈 통계, 도감·배지, 학습 경로 |
| GET | `/api/stats?token=` | 발표용 운영 지표 |

사용자는 로그인 없이 브라우저별 익명 ID(`X-User-Id`)로 구분합니다.
