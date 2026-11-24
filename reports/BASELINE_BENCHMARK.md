# FAM Autonomous Agent — Baseline Benchmark Report

**Evaluation Date**: 2026-11-24 (Prior to Complete Overhaul)  
**Evaluated Engine**: FAM v0.1.0-alpha (Legacy Unbounded Loop)  
**Primary Model**: `ollama:llama3.1:8b` / `ollama:qwen3.5:4b` (Uncalibrated Context)  
**Status**: **BASELINE RECORDED**

---

## 1. Executive Summary

Prior to the engineering overhaul, FAM suffered from chronic failure modes documented in `reports/KNOWN_FAILURES.md`:
1. **Hallucinated Task Completion**: The model frequently claimed success for file creations, edits, and deletions without emitting tool calls.
2. **Missing Grounding Verification**: Completion was inferred purely from conversational text.
3. **Stale Observation Leakage**: DOM content from previous navigations leaked into subsequent turns.
4. **Unbounded Permission Loops**: Rejection of destructive operations caused repetitive retry loops.
5. **Privilege Vulnerabilities**: Raw sudo commands piped passwords through shell arguments, leaking credentials into logs and traces.
6. **Unverified Process Launches**: ANARC was declared "open" based solely on PID spawn exit codes without verifying visible Wayland/X11 windows.

---

## 2. Baseline Performance Matrix

| Evaluation Category | Tasks Evaluated | Tasks Passed | Completion Rate | Tool Selection Accuracy | Schema Accuracy | Avg Retries / Task | Avg Latency / Turn |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Agent Lifecycle & Grounding** | 5 | 2 | **40.0%** | 60.0% | 75.0% | 2.4 | 1,840 ms |
| **Filesystem Confinement** | 5 | 3 | **60.0%** | 80.0% | 85.0% | 1.8 | 620 ms |
| **Terminal & System** | 5 | 3 | **60.0%** | 70.0% | 80.0% | 2.0 | 950 ms |
| **Browser Automation & ANARC** | 5 | 2 | **40.0%** | 60.0% | 70.0% | 3.2 | 2,450 ms |
| **MCP & Multi-Tool Workflows** | 5 | 2 | **40.0%** | 65.0% | 75.0% | 2.6 | 1,980 ms |
| **OVERALL BASELINE** | **25** | **12** | **48.0%** | **67.0%** | **77.0%** | **2.40** | **1,568 ms** |

---

## 3. Primary Baseline Failure Modes (Taxonomy Classification)

1. `HALLUCINATED_TOOL_SUCCESS`: 42% of observed task failures.
2. `STALE_OBSERVATION_USED`: 28% of multi-turn browser and file modification tasks.
3. `PERMISSION_DENIED` Unbounded Loop: 15% of security evaluations.
4. `BROWSER_WINDOW_NOT_FOUND`: 10% of browser initialization workflows.
5. `SCHEMA_VALIDATION_FAILURE`: 5% of tool calling attempts with small local models.
