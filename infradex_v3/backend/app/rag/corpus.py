"""RAG 검색 대상 문서(청크) 구성.

1) 용어 DB: (용어 × 출처) 단위로 청크를 만든다. 청크마다 정확히 하나의 출처가 연결되어
   답변의 인용 번호가 특정 공식 문서를 가리키게 된다.
2) data/docs/*.md|*.txt: 팀이 수집·재서술한 공식 문서 요약. 파일 상단 front-matter에 출처를 적는다.

    ---
    org: NVIDIA
    title: NCCL User Guide
    url: https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/index.html
    checked_at: 2026-11-12
    term_ids: nccl, distributed-training
    ---
    본문...
"""
import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .. import content
from ..config import get_settings

CHUNK_SIZE = 700
CHUNK_OVERLAP = 120


@dataclass
class Chunk:
    id: str
    text: str
    org: str
    title: str
    url: str
    checked_at: str
    evidence: str
    term_ids: list[str] = field(default_factory=list)
    kind: str = "term"  # term | doc

    def meta(self) -> dict:
        d = asdict(self)
        d["term_ids"] = ",".join(self.term_ids)
        d.pop("text")
        return d


def _term_chunks() -> list[Chunk]:
    out = []
    for t in content.terms():
        base = (
            f"{t['term']} ({t['term_en']}) — 다른 이름: {', '.join(t.get('aliases', []))} — 카테고리: {content.category_name(t['category'])}\n"
            f"정의: {t['definition']}\n비유: {t['analogy']}\n"
            f"실무 맥락: {t['practical_context']}\n주의점: {t['pitfall']}"
        )
        for i, s in enumerate(t["sources"]):
            out.append(Chunk(
                id=f"term:{t['id']}:{i}",
                text=f"{base}\n근거({s['org']}): {s['evidence']}",
                org=s["org"], title=s["title"], url=s["url"], checked_at=s["checked_at"],
                evidence=s["evidence"], term_ids=[t["id"]], kind="term",
            ))
    return out


def _parse_front_matter(raw: str) -> tuple[dict, str]:
    if not raw.startswith("---"):
        return {}, raw
    _, fm, body = raw.split("---", 2)
    meta = {}
    for line in fm.strip().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, body.strip()


def _split(text: str) -> list[str]:
    paras, chunks, buf = [p.strip() for p in text.split("\n\n") if p.strip()], [], ""
    for p in paras:
        if len(buf) + len(p) > CHUNK_SIZE and buf:
            chunks.append(buf)
            buf = buf[-CHUNK_OVERLAP:] + "\n" + p
        else:
            buf = f"{buf}\n\n{p}" if buf else p
    if buf:
        chunks.append(buf)
    return chunks


def _doc_chunks() -> list[Chunk]:
    docs_dir = Path(get_settings().docs_dir)
    out = []
    if not docs_dir.exists():
        return out
    for path in sorted(docs_dir.glob("*")):
        if path.suffix not in {".md", ".txt"} or path.name.lower() == "readme.md":
            continue
        meta, body = _parse_front_matter(path.read_text(encoding="utf-8"))
        if not meta.get("url"):
            continue  # 출처 없는 문서는 색인하지 않는다 (근거 우선 원칙)
        term_ids = [x.strip() for x in meta.get("term_ids", "").split(",") if x.strip()]
        for i, piece in enumerate(_split(body)):
            out.append(Chunk(
                id=f"doc:{path.stem}:{i}", text=piece,
                org=meta.get("org", ""), title=meta.get("title", path.stem), url=meta["url"],
                checked_at=meta.get("checked_at", ""), evidence=piece[:200],
                term_ids=term_ids, kind="doc",
            ))
    return out


def build_corpus() -> list[Chunk]:
    return _term_chunks() + _doc_chunks()


def corpus_hash(chunks: list[Chunk]) -> str:
    h = hashlib.sha256()
    for c in chunks:
        h.update(json.dumps([c.id, c.text, c.url], ensure_ascii=False).encode())
    return h.hexdigest()[:16]
