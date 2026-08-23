# Day 16 · RAG 评估集、Recall@K、MRR 与回归报告

> **今天目标**：不再凭“感觉回答不错”评估 RAG。建立可版本管理的数据集，计算检索召回率、首个正确结果排名、关键词覆盖和引用有效率。

## 一、创建目录

```powershell
New-Item -ItemType Directory -Force app\evaluation, eval, scripts
New-Item -ItemType File -Force app\evaluation\__init__.py, scripts\__init__.py
```

## 二、评估数据集（完整内容）

创建 `eval/rag_cases.jsonl`：

```jsonl
{"case_id":"spring-auto-config","question":"Spring Boot 自动配置如何判断是否生效？","relevant_chunk_ids":["替换为你的真实chunkId"],"required_keywords":["条件","自动配置"]}
{"case_id":"python-indent","question":"Python 为什么用缩进？","relevant_chunk_ids":["替换为你的真实chunkId"],"required_keywords":["缩进","代码块"]}
{"case_id":"pay-error","question":"PAY_409 表示什么？","relevant_chunk_ids":["替换为你的真实chunkId"],"required_keywords":["已支付"]}
```

JSONL 是“一行一个 JSON 对象”。单条冲突容易处理，也适合逐行流式读取。

## 三、评估器（完整代码）

创建 `app/evaluation/rag_eval.py`：

```python
import json
import re
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Protocol

from app.rag.vector_store import SearchHit


@dataclass(frozen=True)
class RAGCase:
    case_id: str
    question: str
    relevant_chunk_ids: list[str]
    required_keywords: list[str]


@dataclass(frozen=True)
class CaseResult:
    case_id: str
    recall_at_k: float
    reciprocal_rank: float
    keyword_coverage: float
    citation_validity: float


@dataclass(frozen=True)
class EvaluationReport:
    total_cases: int
    recall_at_k: float
    mrr: float
    keyword_coverage: float
    citation_validity: float
    cases: list[CaseResult]


class RetrievalSystem(Protocol):
    def search(self, query: str, top_k: int = 5) -> list[SearchHit]:
        """检索候选。"""


class AnswerSystem(Protocol):
    async def ask(self, question: str, top_k: int = 5):
        """返回含 answer/citations 的对象。"""


def load_cases(path: Path) -> list[RAGCase]:
    cases: list[RAGCase] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
            cases.append(RAGCase(**payload))
        except (json.JSONDecodeError, TypeError) as exc:
            raise ValueError(f"评估集第 {line_number} 行无效") from exc
    return cases


async def evaluate(
    cases: list[RAGCase],
    retriever: RetrievalSystem,
    answer_system: AnswerSystem,
    top_k: int = 5,
) -> EvaluationReport:
    results: list[CaseResult] = []

    for case in cases:
        hits = retriever.search(case.question, top_k)
        retrieved_ids = [hit.chunk.chunk_id for hit in hits]
        relevant = set(case.relevant_chunk_ids)
        matched = relevant & set(retrieved_ids)
        recall = len(matched) / max(len(relevant), 1)

        first_rank = next(
            (
                index
                for index, chunk_id in enumerate(retrieved_ids, start=1)
                if chunk_id in relevant
            ),
            None,
        )
        reciprocal_rank = 1.0 / first_rank if first_rank else 0.0

        answer_result = await answer_system.ask(case.question, top_k)
        answer = answer_result.answer.casefold()
        keyword_coverage = (
            mean([keyword.casefold() in answer for keyword in case.required_keywords])
            if case.required_keywords
            else 1.0
        )

        valid_ids = {citation.citation_id for citation in answer_result.citations}
        mentioned = {
            int(value) for value in re.findall(r"\[(\d+)]", answer_result.answer)
        }
        citation_validity = (
            len(mentioned & valid_ids) / len(mentioned) if mentioned else 0.0
        )

        results.append(
            CaseResult(
                case_id=case.case_id,
                recall_at_k=recall,
                reciprocal_rank=reciprocal_rank,
                keyword_coverage=keyword_coverage,
                citation_validity=citation_validity,
            )
        )

    return EvaluationReport(
        total_cases=len(results),
        recall_at_k=mean(item.recall_at_k for item in results) if results else 0.0,
        mrr=mean(item.reciprocal_rank for item in results) if results else 0.0,
        keyword_coverage=mean(item.keyword_coverage for item in results)
        if results
        else 0.0,
        citation_validity=mean(item.citation_validity for item in results)
        if results
        else 0.0,
        cases=results,
    )
```

## 四、评估命令（完整代码）

创建 `scripts/evaluate_rag.py`：

```python
import asyncio
import json
from dataclasses import asdict
from pathlib import Path

from app.evaluation.rag_eval import evaluate, load_cases
from app.rag.pipeline import get_rag_pipeline
from app.rag.service import get_rag_service


async def main() -> None:
    cases = load_cases(Path("eval/rag_cases.jsonl"))
    report = await evaluate(
        cases,
        retriever=get_rag_service(),
        answer_system=get_rag_pipeline(),
        top_k=5,
    )

    output = json.dumps(asdict(report), ensure_ascii=False, indent=2)
    Path("eval/report.json").write_text(output, encoding="utf-8")
    print(output)


if __name__ == "__main__":
    asyncio.run(main())
```

先把评估集里的占位 ID 换成真实 Chunk ID，再运行：

```powershell
python -m scripts.evaluate_rag
```

## 五、测试（完整代码）

创建 `tests/test_rag_evaluation.py`：

```python
from dataclasses import dataclass

import pytest

from app.evaluation.rag_eval import RAGCase, evaluate
from app.rag.citations import Citation
from app.rag.models import Chunk
from app.rag.vector_store import SearchHit


def hit(chunk_id: str) -> SearchHit:
    return SearchHit(
        Chunk(chunk_id, "doc", "source.md", 0, "text", 0, 4),
        1.0,
    )


class StubRetriever:
    def search(self, query: str, top_k: int = 5) -> list[SearchHit]:
        return [hit("wrong"), hit("correct")]


@dataclass
class StubAnswer:
    answer: str
    citations: list[Citation]


class StubAnswerSystem:
    async def ask(self, question: str, top_k: int = 5) -> StubAnswer:
        return StubAnswer(
            answer="自动配置会检查条件。[1]",
            citations=[Citation(1, "correct", "doc", "source.md", 0, "text", 1.0)],
        )


@pytest.mark.anyio
async def test_metrics_have_expected_meaning() -> None:
    cases = [
        RAGCase(
            case_id="case-1",
            question="自动配置？",
            relevant_chunk_ids=["correct"],
            required_keywords=["条件", "自动配置"],
        )
    ]

    report = await evaluate(cases, StubRetriever(), StubAnswerSystem(), top_k=2)

    assert report.recall_at_k == 1.0
    assert report.mrr == 0.5
    assert report.keyword_coverage == 1.0
    assert report.citation_validity == 1.0
```

## 六、质量门禁建议

先记录基线，不要随意拍脑袋定 100%。有 30 条以上真实问题后，可在 CI 中要求：

```text
Recall@5 不低于基线 - 0.02
MRR 不低于基线 - 0.02
Citation Validity >= 0.98
关键业务问题必须 100% 召回
```

::: tip 💡 面试题：Recall@K 和 MRR 分别看什么？
Recall@K 看正确证据是否出现在前 K 个候选；MRR 更关注第一个正确证据排得有多靠前。
:::

## 七、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| Golden Dataset | 人工确认问题、证据和答案要点的评估集 |
| Recall@K | K 个候选中覆盖了多少正确证据 |
| MRR | 第一个正确结果倒数排名的平均值 |
| 回归测试 | 改模型/切分/Prompt 后防止质量悄悄下降 |
| 分层评估 | 检索、生成、引用分别测，才能定位问题 |

## 八、✅ 回填清单

- [ ] 至少录入 10 条真实问题
- [ ] 每条问题标注正确 Chunk ID
- [ ] 能生成 `eval/report.json`
- [ ] 能解释 Recall@K 与 MRR
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 九、下次我会追问

1. 为什么不能只评估最终答案？
2. 评估集怎样避免数据泄漏？
3. Recall 上升但答案变差可能是什么原因？
4. 人工评估和自动指标如何配合？
