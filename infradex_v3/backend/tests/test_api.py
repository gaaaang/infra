import os
import tempfile

os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["AZURE_OPENAI_API_KEY"] = ""  # 테스트는 오프라인 모드

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import content  # noqa: E402
from app.main import app  # noqa: E402

H = {"X-User-Id": "tester"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_content_integrity():
    ids = {t["id"] for t in content.terms()}
    assert len(ids) >= 30
    for t in content.terms():
        assert t["sources"], f"{t['id']} 출처 없음"
        assert all(s["url"].startswith("https://") for s in t["sources"])
        assert len(t["quiz"]) >= 5, f"{t['id']} 문항 부족"
        for q in t["quiz"]:
            assert len(q["options"]) == 5 and len(set(q["options"])) == 5, q["q"]
            assert 0 <= q["answer"] < 5 and q["explanation"]
        assert t["quiz"][0]["type"] == "정의"  # 진단은 첫 문항(정의)을 쓴다
        assert set(t["related_terms"]) <= ids
        for field in ("definition", "analogy", "practical_context"):
            assert t[field]


def test_terms_search(client):
    r = client.get("/api/terms", params={"q": "쿠버네티스"}).json()
    assert [t["id"] for t in r] == ["kubernetes"]
    r = client.get("/api/terms", params={"category": "network"}).json()
    assert all(t["category"] == "network" for t in r)


def test_term_detail_and_favorite(client):
    d = client.get("/api/terms/hbm", headers=H).json()
    assert d["sources"] and "quiz" not in d and d["related"]
    assert client.post("/api/terms/hbm/favorite", headers=H).json()["favorite"] is True
    assert "hbm" in client.get("/api/progress", headers=H).json()["favorites"]
    assert client.get("/api/terms/nope").status_code == 404


def test_chat_answers_with_source(client):
    r = client.post("/api/chat", json={"message": "RDMA가 뭐야?"}, headers=H).json()
    assert r["status"] == "answered"
    assert r["sources"] and r["sources"][0]["url"].startswith("https://")
    assert "[1]" in r["answer"]


def test_chat_refuses_out_of_scope(client):
    r = client.post("/api/chat", json={"message": "오늘 서울 날씨 알려줘"}, headers=H).json()
    assert r["status"] == "unverified"
    assert r["answer"].startswith("확인 불가")
    assert r["sources"] == []


def _answer(client, qid, correct):
    item = content.get_quiz_item(qid)[2]
    choice = item["answer"] if correct else (item["answer"] + 1) % 5
    return client.post("/api/quiz/answer", json={"qid": qid, "choice": choice}, headers=H).json()


def test_quiz_flow_collect_and_unresolved(client):
    qs = client.get("/api/quiz", params={"term_id": "pue"}, headers=H).json()
    assert len(qs) == 3 and len({q["qid"] for q in qs}) == 3
    assert "answer" not in qs[0] and len(qs[0]["options"]) == 5

    # 서로 다른 3문항을 맞혀야 도감 등록
    r = _answer(client, qs[0]["qid"], True)
    assert r["term_status"] == "new" and r["solved"] == 1 and "2문항" in r["message"]
    r = _answer(client, qs[0]["qid"], True)  # 같은 문항 다시 맞혀도 카운트 안 됨
    assert r["solved"] == 1
    _answer(client, qs[1]["qid"], True)
    r = _answer(client, qs[2]["qid"], True)
    assert r["newly_collected"] and r["term_status"] == "collected"

    # 오답 → 미해결 사건
    r = _answer(client, qs[0]["qid"], False)
    assert r["correct"] is False and r["term_status"] == "unresolved" and r["review_hint"]

    # 복습은 방금 틀린 문항이 아닌 '새 각도' 문항 2개로, 연속으로 맞혀야 해결
    review = [q for q in client.get("/api/quiz", params={"mode": "review"}, headers=H).json() if q["term_id"] == "pue"]
    assert len(review) == 2 and qs[0]["qid"] not in {q["qid"] for q in review}
    r = _answer(client, review[0]["qid"], True)
    assert r["term_status"] == "unresolved" and "1문항 더" in r["message"]
    r = _answer(client, review[1]["qid"], True)
    assert r["newly_collected"] and any(b["id"] == "cold-case" for b in r["badges_earned"])

    p = client.get("/api/progress", headers=H).json()
    assert p["collected"] == 1 and p["streak"] == 1


def test_term_quiz_prefers_unseen(client):
    seen = set()
    for _ in range(2):
        qs = client.get("/api/quiz", params={"term_id": "hbm"}, headers={"X-User-Id": "fresh"}).json()
        for q in qs:
            item = content.get_quiz_item(q["qid"])[2]
            client.post("/api/quiz/answer", json={"qid": q["qid"], "choice": item["answer"]}, headers={"X-User-Id": "fresh"})
        seen |= {q["qid"] for q in qs}
    assert len(seen) == 5  # 3문항 + 안 본 2문항이 먼저 나온다


def test_source_view_badge(client):
    url = content.get_term("rdma")["sources"][0]["url"]
    r = client.post("/api/terms/rdma/source-view", json={"url": url}, headers=H).json()
    assert any(b["id"] == "first-evidence" for b in r["badges_earned"])
    assert client.post("/api/terms/rdma/source-view", json={"url": "https://evil"}, headers=H).status_code == 400


def test_diagnosis(client):
    qs = client.get("/api/diagnosis").json()
    assert len({q["category"] for q in qs}) == len(content.categories())
    answers = {q["qid"]: 0 for q in qs}
    r = client.post("/api/diagnosis", json={"answers": answers}, headers=H).json()
    assert r["level"] in (1, 2, 3) and r["recommended_category"]


def test_dex(client):
    d = client.get("/api/dex", headers=H).json()
    assert len(d["entries"]) == len(content.terms())
    assert any(b["earned"] for b in d["badges"])


def test_chat_rate_limit(client, monkeypatch):
    from app import main
    monkeypatch.setattr(main.get_settings(), "chat_rate_per_minute", 2)
    main._chat_calls.clear()
    h = {"X-User-Id": "spammer"}
    codes = [client.post("/api/chat", json={"message": "RDMA"}, headers=h).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    main._chat_calls.clear()


def test_chat_history_validation(client):
    bad = client.post("/api/chat", json={"message": "RDMA", "history": [{"role": "system", "content": "x"}]})
    assert bad.status_code == 422


def test_stats(client):
    s = client.get("/api/stats").json()
    assert s["chat"]["questions"] >= 1 and s["quiz"]["answers"] >= 1 and s["source_link_rate"] == 1.0


def test_session_and_flashcards(client):
    h = {"X-User-Id": "sess"}
    s = client.get("/api/session", headers=h).json()
    assert len(s["terms"]) == 3 and s["remaining"] == 33
    first = s["terms"][0]
    assert first["definition"] and len(first["questions"]) == 3 and first["category"] == "core"
    s2 = client.get("/api/session", params={"category": "network", "size": 2}, headers=h).json()
    assert [t["category"] for t in s2["terms"]] == ["network", "network"]
    assert client.post("/api/flashcards/mark", json={"term_id": "rdma", "known": False}, headers=h).json()["ok"]
    assert client.get("/api/progress", headers=h).json()["streak"] == 1


def test_terms_full_and_session_by_ids(client):
    full = client.get("/api/terms", params={"full": "true", "category": "gpu"}).json()
    assert full and all(t["analogy"] and t["pitfall"] for t in full)
    s = client.get("/api/session", params={"terms": "rdma,hbm,nope"}, headers={"X-User-Id": "ids"}).json()
    assert [t["id"] for t in s["terms"]] == ["rdma", "hbm"]
