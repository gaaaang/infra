"""LLM으로 퀴즈 문항 초안 생성 → 검수용 JSON 저장 (terms.json은 직접 수정하지 않는다).

    python -m scripts.generate_quiz --term rdma --n 3
    python -m scripts.generate_quiz --all --out quiz_drafts.json
"""
import argparse
import json

from app import content
from app.agents.quiz_agent import generate_quiz_items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--term")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--n", type=int, default=2)
    ap.add_argument("--out", default="quiz_drafts.json")
    args = ap.parse_args()

    targets = content.terms() if args.all else [content.get_term(args.term)]
    drafts = {}
    for t in targets:
        if not t:
            raise SystemExit("용어를 찾을 수 없습니다")
        drafts[t["id"]] = generate_quiz_items(t, args.n)
        print(f"{t['id']}: {len(drafts[t['id']])}문항")
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(drafts, f, ensure_ascii=False, indent=2)
    print(f"검수 후 terms.json의 quiz 항목에 반영하세요 → {args.out}")


if __name__ == "__main__":
    main()
