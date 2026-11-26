# 공식 문서 요약 (RAG 검색 대상)

이 폴더의 `.md` / `.txt` 파일은 서버 시작 시 청크로 나뉘어 색인됩니다.
**출처(url)가 없는 파일은 색인하지 않습니다.** (근거 우선 원칙)

- 원문을 그대로 복사하지 말고 팀이 재서술합니다 (저작권, 기획서 7.3).
- 작성자 1인 + 검토자 1인 교차 확인 후 PR로 머지합니다.
- 파일 상단 형식:

```
---
org: NVIDIA
title: NCCL User Guide
url: https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/index.html
checked_at: 2026-11-12
term_ids: nccl, distributed-training
---
(재서술한 본문)
```
