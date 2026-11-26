---
org: NVIDIA
title: NVIDIA Multi-Instance GPU User Guide
url: https://docs.nvidia.com/datacenter/tesla/mig-user-guide/index.html
checked_at: 2026-11-12
term_ids: mig, gpu-utilization, k8s-gpu-scheduling
---
(팀 재서술 예시 문서 — 검토 후 실제 요약으로 교체하세요)

MIG(Multi-Instance GPU)는 지원 GPU 한 개를 여러 개의 GPU 인스턴스로 나누어, 각 인스턴스가 전용 메모리, 캐시, 연산 자원을 갖도록 한다. 한 인스턴스의 작업이 다른 인스턴스의 성능에 영향을 주지 않도록 격리하는 것이 목적이다.

분할은 미리 정의된 프로필 단위로만 할 수 있다. 예를 들어 GPU 메모리와 연산 슬라이스의 조합이 정해진 프로필 목록 중에서 골라야 하며, 임의 크기로 자를 수 없다.

운영 측면에서 MIG는 작은 추론 작업이나 개발용 노트북처럼 GPU 전체가 필요하지 않은 작업이 많을 때 GPU 활용률을 높이는 수단으로 쓰인다. Kubernetes 환경에서는 MIG 인스턴스를 별도 자원으로 노출해 Pod에 할당할 수 있다.
