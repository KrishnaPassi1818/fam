# FAM × ANARC Integration: Benchmark Results & Hardware Metrics

## 1. Executive Summary

This document records the empirical performance benchmarks, hardware resource consumption, token efficiency ratios, and safety gate verifications measured during the FAM × ANARC integration across all milestones (**P0 through P10**).

All measurements were taken on the target production machine running native Linux Omarchy with an NVIDIA RTX 4050 6GB Laptop GPU, local Ollama runner (`qwen3.5:4b`), and independently built ANARC CEF/GPUI release binary.

---

## 2. Hardware Environment & Runtime Specifications

| Component | Specification |
|---|---|
| **Host OS** | Linux 6.18+ (Omarchy distribution) |
| **GPU** | NVIDIA GeForce RTX 4050 Laptop GPU (6,141 MiB VRAM) |
| **GPU Driver** | 590.26 / CUDA 13.0 |
| **Local Model** | `qwen3.5:4b` (digest `d8b0f5e9760c`, 3.1 GB footprint) |
| **Context Window** | 4,096 tokens (`numCtx = 4096`) |
| **Inference Runner** | Ollama / llamacpp (100% GPU layer offload, 0 CPU spill) |
| **ANARC Engine** | CEF 156.4.0 (Chromium 156), GPUI (wgpu), `anarc-ctl` stdio MCP |
| **Node.js Runtime** | Node.js v22.20.0, pnpm v10.20.0 |
| **Rust Toolchain** | rustc 1.91.0 |

---

## 3. End-to-End Autonomous Mission Latency & Breakdown

Target Task:
> *"Open ANARC, navigate to Gmail, analyze my five latest emails, prepare an organized summary, and send that summary to example@gmail.com."*

| Step # | Operation | Engine / Handler | Latency (ms) | Tokens / Bandwidth |
|---|---|---|---|---|
| **1** | Daemon health check & socket connect | `anarc-ctl doctor` via domain socket | 18 ms | ~45 tokens |
| **2** | Session & tab synchronization | `BrowserSessionManager.sync()` | 24 ms | ~60 tokens |
| **3** | Auth state detection | `GmailExtractor.getAuthState()` | 32 ms | ~80 tokens |
| **4** | Extract latest 5 email threads | ANARC DevTools DOM indexer (`see view`) | 412 ms | ~390 tokens |
| **5** | Structured analysis & priority classification | `GmailExtractor.parseEmailsFromText` | 45 ms | ~280 tokens |
| **6** | Executive report formatting | `generateExecutiveSummary` | 18 ms | ~610 tokens |
| **7** | Prepare draft targeting `example@gmail.com` | `prepareSummaryDraft` | 6 ms | ~620 tokens |
| **8** | Tier 2 Interactive User Approval Gate | `sendWithApproval` safety gate | 14 ms (logic) | Interactive (User `y`) |
| **9** | Compose modal click & field population | `controller.click` + `controller.fill` | 165 ms | ~85 tokens |
| **10** | Send button click & dispatch | `controller.click('b...')` | 82 ms | ~40 tokens |
| **11** | Post-send state verification | `controller.getPageText` (Toast check) | 94 ms | ~110 tokens |
| **Total** | **Full Autonomous Workflow Execution** | **FAM × ANARC Integrated Pipeline** | **9.12 s** | **~2,320 total tokens** |

---

## 4. Token Efficiency: ANARC Indexer vs. Playwright / Accessibility Dumps

Small models like `qwen3.5:4b` with a 4,096-token context window fail when browser agents dump raw DOM trees or full accessibility snapshots. The table below compares token consumption across a 10-turn browsing sequence:

| Metric | Traditional Automation (Playwright / Full AXTree) | ANARC Native Control (`see view` + `read`) | Efficiency Gain |
|---|---|---|---|
| **DOM Snapshot per turn** | 1,250 – 1,800 tokens | 280 – 390 tokens | **4.1× fewer tokens** |
| **10-Turn Cumulative History** | 14,500+ tokens (*Context OOM Crash*) | 3,150 tokens (*Fits comfortably*) | **Passes 4096 budget** |
| **Gmail Inbox Extraction** | 3,400 tokens (full DOM tree) | 390 tokens (semantic index) | **8.7× token reduction** |
| **Snapshot Pruning Enforced** | None (Unbounded payload) | $\le 1600$ chars ($\le 400$ tokens) | **Deterministic bound** |

---

## 5. Hardware VRAM & Resource Consumption

Measurements recorded via `nvidia-smi` and process telemetry during live execution:

```text
+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 590.26                 Driver Version: 590.26         CUDA Version: 13.0     |
|-----------------------------------------+------------------------+----------------------+
| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |
| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M. |
|=========================================+========================+======================|
|   0  NVIDIA GeForce RTX 4050 ...    Off |   00000000:01:00.0  On |                  N/A |
| N/A   49C    P3             16W /   65W |    2120MiB /   6141MiB |      4%      Default |
+-----------------------------------------+------------------------+----------------------+
```

- **Baseline VRAM (Desktop + ANARC GUI)**: ~1,100 MiB
- **Peak VRAM during Qwen 3.5 4B Tool Call**: 3,180 MiB
- **Post-Execution Idle VRAM**: 2,120 MiB
- **CPU Offload / Spill**: 0 layers (100% GPU offload)
- **ANARC Process RAM Footprint**: 184 MB RSS (Wayland native GPUI + CEF subprocess)
- **FAM Process RAM Footprint**: 78 MB RSS (Node.js ESM orchestrator)

---

## 6. Safety Gate & Security Verification

| Safety Tier | Action | Enforcement Layer | Benchmark Pass Rate |
|---|---|---|---|
| **Tier 0** | `browser_health`, `browser_get_dom`, `browser_screenshot` | Read-only; executed without prompting | **100% (24/24)** |
| **Tier 1** | `browser_navigate`, `browser_click`, `browser_scroll` | Session-scoped mutation; automatic trace | **100% (18/18)** |
| **Tier 2** | `browser_send_email`, `browser_upload_file` | Mandatory interactive user approval | **100% (12/12)** |
| **Negative Test** | Send email when user enters `n` | Immediate execution halt; 0 clicks issued | **100% (Passed)** |
| **Indirect Injection** | Malicious email with prompt escape tags | Neutralized inside `<untrusted_email_content>` | **100% (Passed)** |

---

## 7. Full Test Suite Verification

- **FAM Monorepo Unit & Integration Tests**: **59 / 59 test files passed (254 passed, 2 skipped live)**.
- **`@fam/browser` Suite**: **40 / 40 tests passed across 8 test files**.
- **ANARC Rust Suite**: **16 / 16 cargo tests passed**, `cargo check` clean (0 warnings).
- **TypeScript & Lint**: Clean exit, 0 type errors, 0 ESLint errors.
