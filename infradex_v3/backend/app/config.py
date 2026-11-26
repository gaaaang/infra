from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Azure OpenAI (비워 두면 오프라인 모드: BM25 검색 + 추출형 답변)
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_api_version: str = "2024-10-21"
    azure_openai_chat_deployment: str = "gpt-4o-mini"
    azure_openai_embedding_deployment: str = "text-embedding-3-small"

    # 저장소
    database_path: str = str(BASE_DIR.parent / "infradex.db")
    index_dir: str = str(BASE_DIR.parent / ".index")  # 임베딩 캐시
    docs_dir: str = str(BASE_DIR / "data" / "docs")

    # RAG
    retrieval_top_k: int = 4
    # 근거 판정 임계값 (벡터: 코사인 유사도, BM25: 정규화 점수)
    min_vector_score: float = 0.35
    min_keyword_score: float = 0.2

    cors_origins: str = "http://localhost:5173"

    # 배포
    static_dir: str = str(BASE_DIR.parent / "static")  # React 빌드 결과물 (Docker에서 복사)
    chat_rate_per_minute: int = 15
    stats_token: str = ""  # 설정하면 /api/stats?token=... 로만 지표 조회

    @property
    def llm_enabled(self) -> bool:
        return bool(self.azure_openai_endpoint and self.azure_openai_api_key)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
