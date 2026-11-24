# FAM Continuous Improvement & 50-Task Evaluation Program

## Overview
This directory contains the complete artifacts, baseline measurements, per-task execution reports, execution traces, failure diagnostics, engineering improvements, regressions, and benchmarks for the 50-task evaluation program of **fam**, a local-first AI agent harness.

## Directory Structure
- `baseline/`: Initial system state, pre-existing tests, hardware profile, and initial smoke evaluation.
- `tasks/`: Individual reports for tasks 01 through 50 with 100-point scoring breakdowns.
- `traces/`: Raw execution traces, tool call sequences, and runtime metrics for each task.
- `failures/`: Root-cause analyses and failure classifications.
- `improvements/`: Architectural and code improvements implemented to address diagnosed root causes.
- `regressions/`: Regression test suites, cumulative reviews (every 5 tasks), and before-and-after comparisons.
- `benchmarks/`: Systematic metric tracking across latency, token usage, tool efficiency, and pass rates.
- `evaluation-records.jsonl`: Machine-readable evaluation record for all executed tasks.
- `final-report.md`: Final program summary and scoreboard.

## Evaluation Philosophy
1. Never hardcode benchmark answers or inject prompt hacks for specific test numbers.
2. Verify all outcomes independently with observable filesystem, document, calculation, or test checks.
3. Test fam as the actual agent under evaluation without bypassing its agent loop.
4. Strengthen tool selection, context efficiency, safety, verification, and recovery for local models.
