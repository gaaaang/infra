"""진단 Agent (P2): 카테고리별 대표 문항으로 수준을 파악하고 시작 코스를 추천한다."""
from .. import content, db


def diagnosis_questions() -> list[dict]:
    """카테고리마다 난이도가 가장 낮은 용어·중간 난이도 용어의 첫 문항 1개씩."""
    out = []
    for c in content.categories():
        terms = sorted((t for t in content.terms() if t["category"] == c["id"]), key=lambda t: t["difficulty"])
        for t in {terms[0]["id"]: terms[0], terms[len(terms) // 2]["id"]: terms[len(terms) // 2]}.values():
            q = t["quiz"][0]
            out.append({"qid": content.quiz_id(t["id"], 0), "term": t["term"], "category": c["id"],
                        "question": q["q"], "options": q["options"]})
    return out


def evaluate(user_id: str, answers: dict[str, int]) -> dict:
    per_cat: dict[str, list[bool]] = {}
    for qid, choice in answers.items():
        found = content.get_quiz_item(qid)
        if not found:
            continue
        t, _, item = found
        per_cat.setdefault(t["category"], []).append(choice == item["answer"])

    scores = {c: (sum(v) / len(v)) for c, v in per_cat.items() if v}
    total = sum(sum(v) for v in per_cat.values()) / max(1, sum(len(v) for v in per_cat.values()))
    level = 1 if total < 0.4 else 2 if total < 0.75 else 3
    order = [c["id"] for c in content.categories()]
    # 가장 약한 카테고리 (동점이면 학습 순서상 앞선 것)
    weakest = min(order, key=lambda c: (scores.get(c, 0.0), order.index(c)))
    db.save_profile(user_id, level, weakest)
    return {
        "level": level,
        "level_name": {1: "견습 탐정", 2: "현장 탐정", 3: "수석 탐정"}[level],
        "total_score": round(total, 2),
        "category_scores": scores,
        "recommended_category": weakest,
        "recommended_name": content.category_name(weakest),
    }
