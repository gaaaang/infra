"""기획서 14.1 평가 지표 자동 측정.

    python -m scripts.evaluate                # eval/questions.json 사용
    python -m scripts.evaluate --out result.csv

측정: 근거 용어 일치율(답변 1순위 출처가 기대 용어인지), 범위 밖 질문 '확인 불가' 비율,
근거 없는 단정 답변 건수, 평균/최대 응답 시간, 콘텐츠 출처 연결률.
※ 답변 '정확성'과 '출처 일치(뒷받침 여부)'는 사람 평가가 필요하므로 CSV로 내보내 채점한다.
"""
import argparse
import csv
import json
import statistics
import time
from pathlib import Path

from app import content
from app.agents.explain_graph import ask

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--questions", default=str(ROOT / "eval" / "questions.json"))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    qs = json.loads(Path(args.questions).read_text(encoding="utf-8"))
    rows, latencies = [], []
    for item in qs:
        t0 = time.perf_counter()
        r = ask(item["q"])
        ms = (time.perf_counter() - t0) * 1000
        latencies.append(ms)
        top = r["sources"][0]["term_id"] if r["sources"] else None
        rows.append({
            "question": item["q"], "expect": item["expect"] or "(범위 밖)", "status": r["status"],
            "top_source_term": top, "source_titles": " | ".join(s["title"] for s in r["sources"]),
            "match": (r["status"] == "unverified") if item["expect"] is None else (top == item["expect"]),
            "latency_ms": round(ms), "answer": r["answer"], "mode": r["mode"],
        })

    in_scope = [r for r, q in zip(rows, qs) if q["expect"]]
    out_scope = [r for r, q in zip(rows, qs) if not q["expect"]]
    linked = sum(1 for t in content.terms() if t["sources"]) / len(content.terms())

    print(f"모드: {rows[0]['mode']}")
    print(f"근거 용어 일치율        : {sum(r['match'] for r in in_scope)}/{len(in_scope)}")
    print(f"범위 밖 '확인 불가' 응답 : {sum(r['match'] for r in out_scope)}/{len(out_scope)}")
    print(f"근거 없는 단정 답변     : {sum(1 for r in out_scope if not r['match'])}건")
    print(f"응답 시간 평균/최대     : {statistics.mean(latencies):.0f}ms / {max(latencies):.0f}ms")
    print(f"콘텐츠 출처 연결률      : {linked:.0%}")
    for r in rows:
        if not r["match"]:
            print(f"  ✗ {r['question']} → {r['status']} / {r['top_source_term']}")

    if args.out:
        with open(args.out, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) + ["human_accuracy", "human_source_support"])
            w.writeheader()
            w.writerows(rows)
        print(f"사람 채점용 CSV: {args.out}")


if __name__ == "__main__":
    main()
