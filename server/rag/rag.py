"""
RAG / Context Layer for the R&S Virtual Lab Assistant (Core 2, owner: Gregory).

Loads the hand-authored corpus under corpus/{procedure,safety,fault}/*.md,
embeds each doc once at startup, and exposes retrieve() matching the
RETRIEVE_REQUEST / RETRIEVE_RESULT contract from the build spec:

    retrieve(query: str, top_k: int = 3, category: str | None = None)
    -> {"chunks": [{"text": str, "source": str, "score": float}, ...]}
"""

import re
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

CORPUS_DIR = Path(__file__).parent / "corpus"
MODEL_NAME = "all-MiniLM-L6-v2"

_FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)


def _parse_doc(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    match = _FRONTMATTER_RE.match(raw)
    if not match:
        raise ValueError(f"{path} is missing frontmatter")
    front, body = match.groups()
    meta = dict(line.split(":", 1) for line in front.strip().splitlines())
    meta = {k.strip(): v.strip() for k, v in meta.items()}
    return {"text": body.strip(), "source": meta["source"], "category": meta["category"]}


class RetrievalIndex:
    def __init__(self, corpus_dir: Path = CORPUS_DIR, model_name: str = MODEL_NAME):
        self.model = SentenceTransformer(model_name)
        self.docs = [_parse_doc(p) for p in sorted(corpus_dir.glob("*/*.md"))]
        if not self.docs:
            raise RuntimeError(f"No corpus docs found under {corpus_dir}")
        self.embeddings = self.model.encode(
            [d["text"] for d in self.docs], normalize_embeddings=True
        )

    def retrieve(self, query: str, top_k: int = 3, category: str | None = None) -> dict:
        indices = [i for i, d in enumerate(self.docs) if category is None or d["category"] == category]
        if not indices:
            return {"chunks": []}

        query_emb = self.model.encode([query], normalize_embeddings=True)[0]
        sims = self.embeddings[indices] @ query_emb
        ranked = sorted(zip(indices, sims), key=lambda pair: pair[1], reverse=True)[:top_k]

        return {
            "chunks": [
                {
                    "text": self.docs[i]["text"],
                    "source": self.docs[i]["source"],
                    "score": float(score),
                }
                for i, score in ranked
            ]
        }


def _repl():
    """Interactive standalone demo of the mini-agent — type a query, get chunks back.
    Optionally prefix with 'procedure:', 'safety:', or 'fault:' to filter by category.
    """
    index = RetrievalIndex()
    print(f"Loaded {len(index.docs)} docs: {[d['source'] for d in index.docs]}")
    print("Type a query (optionally prefixed 'procedure:'/'safety:'/'fault:'), or 'quit'.\n")

    while True:
        raw = input("query> ").strip()
        if raw.lower() in ("quit", "exit", ""):
            break

        category = None
        for cat in ("procedure", "safety", "fault"):
            prefix = f"{cat}:"
            if raw.lower().startswith(prefix):
                category = cat
                raw = raw[len(prefix):].strip()
                break

        result = index.retrieve(raw, top_k=3, category=category)
        if not result["chunks"]:
            print("  (no matches)\n")
            continue
        for chunk in result["chunks"]:
            print(f"  [{chunk['score']:.3f}] {chunk['source']}: {chunk['text'][:100]}...")
        print()


if __name__ == "__main__":
    _repl()
