"""LLM 모드(Azure OpenAI) 경로를 가짜 임베딩·가짜 LLM으로 검증한다. 실제 API 키가 필요 없다."""
import hashlib
import os
import tempfile

import numpy as np
import pytest

from app.agents import explain_graph
from app.config import get_settings
from app.rag import retriever as R
from app.rag.corpus import build_corpus


class FakeEmbeddings:
    """단어 해시 기반 bag-of-words 임베딩 (같은 단어가 많을수록 가까움)."""

    def __init__(self, fail_query=False):
        self.fail_query = fail_query

    def _vec(self, text):
        v = np.zeros(256, dtype=np.float32)
        for tok in R.tokenize(text):
            v[int(hashlib.md5(tok.encode()).hexdigest(), 16) % 256] += 1
        return (v + 1e-3).tolist()

    def embed_documents(self, texts):
        return [self._vec(t) for t in texts]

    def embed_query(self, text):
        if self.fail_query:
            raise RuntimeError("Azure 일시 장애")
        return self._vec(text)


class FakeLLM:
    def __init__(self, reply):
        self.reply = reply
        self.last_messages = None

    def invoke(self, messages):
        self.last_messages = messages

        class R_:
            content = self.reply
        return R_()


@pytest.fixture
def vector_retriever(monkeypatch):
    monkeypatch.setattr(get_settings(), "index_dir", tempfile.mkdtemp())
    monkeypatch.setattr("langchain_openai.AzureOpenAIEmbeddings", lambda **kw: FakeEmbeddings())
    vr = R.VectorRetriever(build_corpus())
    monkeypatch.setattr(explain_graph, "get_retriever", lambda: vr)
    monkeypatch.setattr(get_settings(), "min_vector_score", 0.3)
    explain_graph._graph = None
    yield vr
    explain_graph._graph = None


def test_vector_index_cached_and_searchable(vector_retriever):
    hits = vector_retriever.search("NCCL timeout 원인", 3)
    assert hits[0].mode == "vector" and "nccl" in hits[0].chunk.term_ids
    files = os.listdir(get_settings().index_dir)
    assert len(files) == 1 and files[0].endswith(".npz")


def test_query_embedding_failure_falls_back_to_keyword(vector_retriever):
    vector_retriever.emb = FakeEmbeddings(fail_query=True)
    hits = vector_retriever.search("RDMA가 뭐야?", 3)
    assert hits and hits[0].mode == "keyword"


def test_llm_answer_keeps_only_cited_sources(vector_retriever, monkeypatch):
    llm = FakeLLM("**한 줄 정의** RDMA는 CPU를 거치지 않는 메모리 직접 전송이다 [1].\n\n**실무 맥락** GPUDirect RDMA [2]")
    monkeypatch.setattr(explain_graph, "get_chat_model", lambda: llm)
    r = explain_graph.ask("RDMA가 뭐야?")
    assert r["status"] == "answered" and r["mode"] == "llm"
    assert [s["n"] for s in r["sources"]] == [1, 2]
    # 근거 블록이 프롬프트에 들어갔는지
    assert "[근거]" in llm.last_messages[-1].content


def test_llm_says_unverified(vector_retriever, monkeypatch):
    monkeypatch.setattr(explain_graph, "get_chat_model", lambda: FakeLLM("확인 불가 — 근거에서 찾지 못했습니다."))
    r = explain_graph.ask("RDMA 장비 가격은 얼마야?")
    assert r["status"] == "unverified" and r["sources"] == []


def test_llm_failure_falls_back_to_offline_answer(vector_retriever, monkeypatch):
    class Broken:
        def invoke(self, _):
            raise TimeoutError("timeout")
    monkeypatch.setattr(explain_graph, "get_chat_model", lambda: Broken())
    r = explain_graph.ask("RDMA가 뭐야?")
    assert r["status"] == "answered" and r["mode"] == "offline" and r["sources"]
