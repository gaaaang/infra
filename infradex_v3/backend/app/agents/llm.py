from functools import lru_cache

from ..config import get_settings


@lru_cache
def get_chat_model():
    """Azure OpenAI 채팅 모델. 키가 없으면 None (오프라인 모드)."""
    s = get_settings()
    if not s.llm_enabled:
        return None
    from langchain_openai import AzureChatOpenAI

    return AzureChatOpenAI(
        azure_endpoint=s.azure_openai_endpoint, api_key=s.azure_openai_api_key,
        api_version=s.azure_openai_api_version, azure_deployment=s.azure_openai_chat_deployment,
        temperature=0.1, timeout=20, max_retries=1,
    )
