"""용어 DB의 출처 링크 점검 (발표 전 필수).

    python -m scripts.check_sources              # 링크 상태 점검
    python -m scripts.check_sources --csv out.csv  # 팀 교차 확인용 체크리스트 CSV

- 링크가 열리는지(HTTP 상태), 다른 주소로 넘어가는지(리다이렉트)를 확인한다.
- '근거 요약이 원문 내용과 맞는지'는 사람이 확인해야 하므로 CSV에 확인 칸을 만든다.
- 사이트 메인 페이지처럼 너무 넓은 링크는 '세부 페이지로 교체 권장'으로 표시한다.
"""
import argparse
import csv
from urllib.parse import urlparse

import httpx

from app import content

UA = {"User-Agent": "Mozilla/5.0 (InfraDex source checker)"}


def check(url: str) -> tuple[str, str]:
    try:
        r = httpx.get(url, headers=UA, follow_redirects=True, timeout=15)
        final = str(r.url)
        moved = final.rstrip("/") != url.rstrip("/")
        if r.status_code >= 400:
            return f"오류 {r.status_code}", final
        return ("이동됨" if moved else "정상"), final
    except httpx.HTTPError as e:
        return f"연결 실패 ({type(e).__name__})", ""


def too_broad(url: str) -> bool:
    path = urlparse(url).path.strip("/")
    # 도메인 메인(https://x.org/) 또는 문서 사이트 첫 화면(https://docs.x.com/cuda/)
    return path == "" or (url.endswith("/") and "/" not in path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv")
    args = ap.parse_args()

    rows, cache = [], {}
    for t in content.terms():
        for s in t["sources"]:
            if s["url"] not in cache:
                cache[s["url"]] = check(s["url"])
            status, final = cache[s["url"]]
            rows.append({
                "term": t["term"], "org": s["org"], "title": s["title"], "url": s["url"],
                "status": status, "final_url": final if final != s["url"] else "",
                "too_broad": "세부 페이지로 교체 권장" if too_broad(s["url"]) else "",
                "evidence": s["evidence"], "checked_at": s["checked_at"],
                "근거_일치_확인(작성자)": "", "근거_일치_확인(검토자)": "",
            })

    bad = [r for r in rows if not r["status"].startswith(("정상", "이동"))]
    broad = {r["url"] for r in rows if r["too_broad"]}
    print(f"출처 {len(rows)}건 (고유 링크 {len(cache)}개)")
    print(f"  정상 {sum(r['status'] == '정상' for r in rows)} · 이동됨 {sum(r['status'] == '이동됨' for r in rows)} · 문제 {len(bad)}")
    for r in bad:
        print(f"  ✗ [{r['term']}] {r['url']} → {r['status']}")
    for u in sorted(broad):
        print(f"  △ 너무 넓은 링크: {u}")

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"체크리스트 저장: {args.csv} (엑셀로 열어 확인 칸을 채우세요)")


if __name__ == "__main__":
    main()
