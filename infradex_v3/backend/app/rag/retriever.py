"""검색기.

- VectorRetriever: Azure OpenAI 임베딩 + Chroma (LLM 모드)
- KeywordRetriever: BM25 + 한글 바이그램 (API 키 없는 오프라인/시연 백업 모드)
두 검색기 모두 '근거 점수(score)'를 0~1로 돌려주고, 그래프의 grade 단계에서 임계값으로 판정한다.
"""
import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

from rank_bm25 import BM25Okapi

from .. import content
from ..config import get_settings
from .corpus import Chunk, build_corpus, corpus_hash

log = logging.getLogger(__name__)

STOPWORDS = {
    "뭐야", "뭐예요", "뭔가요", "무엇", "무엇인가요", "뭐", "설명", "설명해줘", "설명해", "알려줘", "알려주세요",
    "이란", "란", "이", "가", "은", "는", "을", "를", "의", "에", "와", "과", "좀", "어떻게", "왜", "그리고",
    "차이", "차이점", "대해", "대해서", "있어", "있나요", "해줘", "주세요", "만드는", "만들기", "하는", "하는법",
    "방법", "방식", "있는지", "알아", "뭐가", "무슨", "뜻", "뜻이야", "의미", "어떤", "건가요", "거야", "인가요", "what", "is", "the", "a", "an",
    "of", "and", "to", "in", "how", "why", "does", "do",
}


def tokenize(text: str) -> list[str]:
    toks: list[str] = []
    for w in re.findall(r"[a-z0-9]+|[가-힣]+", text.lower()):
        if w in STOPWORDS:
            continue
        if re.fullmatch(r"[가-힣]+", w):
            # 조사 붙은 어절 대응: 바이그램
            toks.extend(w[i:i + 2] for i in range(len(w) - 1)) if len(w) > 1 else toks.append(w)
        else:
            toks.append(w)
    return toks


@dataclass
class Hit:
    chunk: Chunk
    score: float  # 0~1
    mode: str = "keyword"  # 어떤 검색기로 찾았는지 (근거 임계값이 다르다)


def _alias_hits(query: str) -> set[str]:
    """질문에 용어명이 직접 등장하면 강한 근거로 본다."""
    q = query.lower().replace(" ", "")
    found = set()
    for t in content.terms():
        names = {t["term"].lower().replace(" ", ""), t["id"].replace("-", "")}
        names |= {t["term_en"].lower().replace(" ", "")}
        names |= {a.lower().replace(" ", "") for a in t.get("aliases", [])}
        names |= {re.sub(r"\(.*?\)", "", n) for n in names}
        if any(len(n) >= 2 and n in q for n in names):
            found.add(t["id"])
    return found


class KeywordRetriever:
    mode = "keyword"

    def __init__(self, chunks: list[Chunk]):
        self.chunks = chunks
        self.docs = [tokenize(c.text) for c in chunks]
        self.bm25 = BM25Okapi(self.docs)

    def search(self, query: str, k: int) -> list[Hit]:
        q = tokenize(query)
        if not q:
            return []
        scores = self.bm25.get_scores(q)
        alias = _alias_hits(query)
        # IDF 가중 커버리지: 코퍼스에 없는 단어(=자료 범위 밖 주제)는 큰 가중치를 받아
        # '만드는', '있게' 같은 흔한 어절 조각만 겹치는 질문이 근거로 통과하지 못하게 한다.
        max_idf = max(self.bm25.idf.values()) + 1.0
        weights = {t: max(self.bm25.idf.get(t, max_idf), 0.1) for t in set(q)}
        total_w = sum(weights.values())
        hits = []
        for c, toks, s in zip(self.chunks, self.docs, scores):
            tokset = set(toks)
            coverage = sum(w for t, w in weights.items() if t in tokset) / total_w
            boost = 0.5 if alias & set(c.term_ids) else 0.0
            hits.append((s, Hit(c, min(1.0, coverage * 0.6 + boost))))
        hits.sort(key=lambda x: (x[1].score, x[0]), reverse=True)
        return [h for _, h in hits[:k]]


class VectorRetriever:
    """Azure OpenAI 임베딩 + 경량 벡터 색인(numpy, 코사인 유사도).

    문서 수가 수백 개 수준이라 별도 벡터 DB 서버 없이 메모리에서 충분히 빠르다.
    임베딩 결과는 디스크(.npz)에 캐시해 재시작 시 API를 다시 호출하지 않는다.
    질의 임베딩이 실패하면(키 만료·네트워크) 그 질문만 키워드 검색으로 대신해 시연이 멈추지 않는다.
    """

    mode = "vector"

    def __init__(self, chunks: list[Chunk]):
        from langchain_openai import AzureOpenAIEmbeddings

        s = get_settings()
        self.emb = AzureOpenAIEmbeddings(
            azure_endpoint=s.azure_openai_endpoint, api_key=s.azure_openai_api_key,
            api_version=s.azure_openai_api_version, azure_deployment=s.azure_openai_embedding_deployment,
        )
        self.chunks = chunks
        self.fallback = KeywordRetriever(chunks)
        key = f"{corpus_hash(chunks)}_{s.azure_openai_embedding_deployment}"
        cache = Path(s.index_dir) / f"vectors_{key}.npz"
        if cache.exists():
            self.matrix = np.load(cache)["m"]
        else:
            log.info("벡터 색인 생성: %d chunks", len(chunks))
            m = np.asarray(self.emb.embed_documents([c.text for c in chunks]), dtype=np.float32)
            self.matrix = m / np.linalg.norm(m, axis=1, keepdims=True)
            cache.parent.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(cache, m=self.matrix)

    def search(self, query: str, k: int) -> list[Hit]:
        try:
            q = np.asarray(self.emb.embed_query(query), dtype=np.float32)
        except Exception as e:
            log.warning("질의 임베딩 실패, 키워드 검색으로 대체: %s", e)
            return self.fallback.search(query, k)
        sims = self.matrix @ (q / np.linalg.norm(q))
        alias = _alias_hits(query)
        hits = []
        for i in np.argsort(-sims)[: k * 2]:
            c = self.chunks[int(i)]
            score = float(sims[i]) + (0.2 if alias & set(c.term_ids) else 0.0)
            hits.append(Hit(c, min(1.0, score), "vector"))
        return sorted(hits, key=lambda h: h.score, reverse=True)[:k]


@lru_cache
def get_retriever():
    chunks = build_corpus()
    if get_settings().llm_enabled:
        try:
            return VectorRetriever(chunks)
        except Exception as e:  # 키·네트워크 문제 시 시연이 멈추지 않도록 폴백
            log.warning("벡터 검색 초기화 실패, 키워드 검색으로 폴백: %s", e)
    return KeywordRetriever(chunks)


def min_score(hit: Hit) -> float:
    s = get_settings()
    return s.min_vector_score if hit.mode == "vector" else s.min_keyword_score
