"""
Automated sanity tests for the RAG mini-agent.
Run with: python -m pytest test_rag.py -v
(or just `python test_rag.py` for a plain pass/fail run without pytest installed)
"""

from rag import RetrievalIndex

# (query, category filter, expected top-1 source)
CASES = [
    ("How do I measure a 1kHz sine wave?", None, "measure_1khz_sine_wave"),
    ("the waveform looks flat on top", "fault", "clipped_waveform"),
    ("trace is too noisy and jittery", "fault", "noisy_trace"),
    ("screen shows nothing at all", "fault", "no_trace_displayed"),
    ("what voltage limit should I be careful of", "safety", "oscilloscope_safety_checklist"),
    ("how do I set the timebase", "procedure", "set_timebase"),
    ("how do I compensate my probe", "procedure", "probe_compensation"),
]


def test_top_result_matches_expected():
    index = RetrievalIndex()
    failures = []
    for query, category, expected_source in CASES:
        result = index.retrieve(query, top_k=1, category=category)
        actual_source = result["chunks"][0]["source"] if result["chunks"] else None
        if actual_source != expected_source:
            failures.append(f"  query={query!r} category={category}: expected {expected_source!r}, got {actual_source!r}")
    assert not failures, "Retrieval mismatches:\n" + "\n".join(failures)


def test_category_filter_is_respected():
    index = RetrievalIndex()
    result = index.retrieve("anything", top_k=10, category="safety")
    sources = {c["source"] for c in result["chunks"]}
    safety_sources = {d["source"] for d in index.docs if d["category"] == "safety"}
    assert sources <= safety_sources


def test_contract_shape():
    index = RetrievalIndex()
    result = index.retrieve("test query", top_k=2)
    assert "chunks" in result
    for chunk in result["chunks"]:
        assert set(chunk.keys()) == {"text", "source", "score"}
        assert isinstance(chunk["score"], float)


if __name__ == "__main__":
    # Plain run without pytest, for convenience.
    index = RetrievalIndex()
    passed, failed = 0, 0
    for query, category, expected_source in CASES:
        result = index.retrieve(query, top_k=1, category=category)
        actual_source = result["chunks"][0]["source"] if result["chunks"] else None
        ok = actual_source == expected_source
        passed += ok
        failed += not ok
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {query!r} (category={category}) -> {actual_source}")
    print(f"\n{passed} passed, {failed} failed")
