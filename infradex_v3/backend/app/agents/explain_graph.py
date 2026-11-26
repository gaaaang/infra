"""검색·설명 Agent (RAG) — LangGraph.

    retrieve ──▶ grade ──(근거 있음)──▶ generate ──▶ END
                     └──(근거 없음)──▶ refuse ────▶ END

- 근거 우선: 검색 점수가 임계값 미만이면 LLM을 호출하지 않고 '확인 불가'로 응답한다.
- generate는 검색된 근거 범위 안에서만 3단계(정의·비유·실무 맥락)로 답하고 [n]으로 인용한다.
- LLM이 없거나 실패하면 추출형(용어 DB 템플릿) 답변으로 대체해 시연이 끊기지 않게 한다.
"""
import logging
import re
from typing import TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from .. import content
from ..config import get_settings
from ..rag.retriever import Hit, get_retriever, min_score
from .llm import get_chat_model

log = logging.getLogger(__name__)

UNVERIFIED = "확인 불가"

SYSTEM_PROMPT = """너는 '인프라덱스'의 탐정 조수다. AI 데이터센터 신입 직원에게 실무 용어를 설명한다.

규칙:
1. 반드시 아래 [근거] 안의 내용만 사용한다. 근거에 없는 사실은 추측하지 않는다.
2. 근거로 답할 수 없으면 정확히 "확인 불가"로 시작하고, 공식 자료에서 확인되지 않았다고 짧게 알린다.
3. 문장마다 뒷받침하는 근거 번호를 [1], [2] 형식으로 붙인다.
4. 용어 설명 질문이면 아래 구조로 답한다(각 1~3문장):
   **한 줄 정의** / **쉬운 비유** / **실무 맥락·주의점**
5. 신입 눈높이의 한국어로, 전문 용어는 처음 나올 때 영문을 괄호로 병기한다.
"""


class State(TypedDict, total=False):
    question: str
    history: list[dict]
    hits: list[Hit]
    status: str          # answered | unverified
    answer: str
    citations: list[int]  # 1-based index into hits
    mode: str            # llm | offline


def retrieve(state: State) -> State:
    r = get_retriever()
    hits = r.search(state["question"], get_settings().retrieval_top_k)
    return {"hits": hits}


def grade(state: State) -> State:
    good = [h for h in state["hits"] if h.score >= min_score(h)]
    return {"hits": good, "status": "answered" if good else "unverified"}


def route(state: State) -> str:
    return "generate" if state["status"] == "answered" else "refuse"


def _evidence_block(hits: list[Hit]) -> str:
    return "\n\n".join(
        f"[{i}] 출처: {h.chunk.org} – {h.chunk.title}\n{h.chunk.text}" for i, h in enumerate(hits, 1)
    )


def _offline_answer(hits: list[Hit]) -> tuple[str, list[int]]:
    top = hits[0].chunk
    t = content.get_term(top.term_ids[0]) if top.term_ids else None
    if top.kind == "term" and t:
        text = (
            f"**한 줄 정의** {t['definition']} [1]\n\n"
            f"**쉬운 비유** {t['analogy']}\n\n"
            f"**실무 맥락·주의점** {t['practical_context']} {t['pitfall']} [1]"
        )
        return text, [1]
    return f"공식 문서에서 찾은 관련 내용입니다.\n\n> {top.text[:400]} [1]", [1]


def generate(state: State) -> State:
    hits = state["hits"]
    llm = get_chat_model()
    if llm is None:
        text, cites = _offline_answer(hits)
        return {"answer": text, "citations": cites, "mode": "offline"}

    msgs = [SystemMessage(SYSTEM_PROMPT)]
    for m in (state.get("history") or [])[-6:]:
        msgs.append(HumanMessage(m["content"]) if m["role"] == "user" else AIMessage(m["content"]))
    msgs.append(HumanMessage(f"[근거]\n{_evidence_block(hits)}\n\n[질문]\n{state['question']}"))
    try:
        text = llm.invoke(msgs).content.strip()
    except Exception as e:
        log.warning("LLM 호출 실패, 오프라인 답변으로 대체: %s", e)
        text, cites = _offline_answer(hits)
        return {"answer": text, "citations": cites, "mode": "offline"}

    if text.startswith(UNVERIFIED):
        return {"answer": text, "citations": [], "status": "unverified", "mode": "llm"}
    cites = sorted({int(n) for n in re.findall(r"\[(\d+)\]", text) if 1 <= int(n) <= len(hits)})
    if not cites:  # 인용 없는 답변은 신뢰할 수 없으므로 근거를 명시적으로 붙인다
        cites = [1]
    return {"answer": text, "citations": cites, "mode": "llm"}


def refuse(state: State) -> State:
    return {
        "answer": (
            f"{UNVERIFIED} — 인프라덱스가 수집한 공식 자료에서 이 질문의 근거를 찾지 못했어요. "
            "추측으로 답하지 않을게요. 용어 이름을 넣어 다시 물어보거나, 단어장에서 관련 카테고리를 찾아보세요."
        ),
        "citations": [],
        "mode": "llm" if get_chat_model() else "offline",
    }


def build_graph():
    g = StateGraph(State)
    g.add_node("retrieve", retrieve)
    g.add_node("grade", grade)
    g.add_node("generate", generate)
    g.add_node("refuse", refuse)
    g.set_entry_point("retrieve")
    g.add_edge("retrieve", "grade")
    g.add_conditional_edges("grade", route, {"generate": "generate", "refuse": "refuse"})
    g.add_edge("generate", END)
    g.add_edge("refuse", END)
    return g.compile()


_graph = None


def ask(question: str, history: list[dict] | None = None) -> dict:
    global _graph
    if _graph is None:
        _graph = build_graph()
    out = _graph.invoke({"question": question, "history": history or []})

    hits: list[Hit] = out.get("hits", [])
    sources = []
    for n in out.get("citations", []):
        c = hits[n - 1].chunk
        sources.append({
            "n": n, "org": c.org, "title": c.title, "url": c.url, "checked_at": c.checked_at,
            "evidence": c.evidence, "term_id": c.term_ids[0] if c.term_ids else None,
        })
    related = []
    for h in hits:
        for tid in h.chunk.term_ids:
            if tid not in related and content.get_term(tid):
                related.append(tid)
    return {
        "answer": out["answer"],
        "status": out.get("status", "answered"),
        "sources": sources,
        "related_terms": [content.summary(content.get_term(t)) for t in related[:4]],
        "mode": out.get("mode", "offline"),
    }
