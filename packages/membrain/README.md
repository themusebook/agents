# 🧠 Membrain — Selective Memory for Solana Trading Agents

> Vendored into `cheshire-terminal-agents` as **`packages/membrain`**. Catalog agents use this as the default memory source (`ct-agents memory`). Node host: `robinhood-src/membrainMemory.js`. JSON HTTP on `:9091` for JS agents; gRPC on `:9090`.

<p align="center">
  <strong>Structured, revisable memory substrate for autonomous DeFi agents on Solana</strong>
</p>

<p align="center">
  <a href="https://openclawd.biz"><img src="https://img.shields.io/badge/$CLAWD-on_Solana-9945FF?style=for-the-badge" alt="$CLAWD"></a>
  <a href="https://x.com/clawddevs"><img src="https://img.shields.io/badge/@clawddevs-X-000000?style=for-the-badge&logo=x" alt="X"></a>
  <img src="https://img.shields.io/badge/Go-1.24+-00ADD8?style=for-the-badge&logo=go" alt="Go">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

---

**Membrain** is the memory and persistence layer for the [OpenClawd](https://openclawd.biz) agent platform. It gives autonomous trading agents structured, revisable memory with built-in decay, trust-gated retrieval, and audit trails — purpose-built for Solana DeFi, on-chain intelligence, and financial decision-making.

Instead of an append-only context window or flat text log, agents get typed memory records that can be consolidated, revised, contested, and pruned over time. This means your trading agent doesn't just remember — it **learns**.

## Why Membrain for Trading Agents

Most agent "memory" is either ephemeral (context windows that reset) or an append-only RAG pipeline. That gives retrieval, but not learning: market patterns get stale, trading strategies drift, and the system cannot revise itself safely.

Membrain makes memory **selective** and **revisable** for financial contexts:

- **Market observations** decay naturally unless reinforced by profitable outcomes
- **Trading strategies** (competence records) track success rates across market conditions
- **Wallet intelligence** persists as semantic facts with trust-gated access
- **Plan graphs** encode reusable multi-step DeFi workflows (swap → stake → claim)
- **Audit trails** provide full provenance for every memory revision

---

## Table of Contents

- [60-Second Mental Model](#60-second-mental-model)
- [Key Features](#key-features)
- [Memory Types for Trading](#memory-types-for-trading)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [gRPC API](#grpc-api)
- [TypeScript Client](#typescript-client)
- [Python Client](#python-client)
- [Integration with ClawdBot](#integration-with-clawdbot)
- [License](#license)

---

## 60-Second Mental Model

1. **Ingest** — Market events, swap outcomes, wallet observations, price alerts.
2. **Consolidate** — Episodic trades become semantic patterns, competence records, and plan graphs.
3. **Retrieve** — Layered retrieval with trust gating and salience ranking.
4. **Revise** — Supersede, fork, contest, or retract knowledge with evidence.
5. **Decay** — Stale market observations fade unless reinforced by profitable outcomes.

## Key Features

- **Typed Memory** — Explicit schemas for episodic (trades), semantic (market facts), competence (strategies), working (active positions), and plan graphs (DeFi workflows).
- **Revisable Knowledge** — Supersede, fork, retract, merge, and contest records with full provenance.
- **Competence Learning** — Agents learn *how* to trade (strategies, success rates), not just *what* happened.
- **Decay and Consolidation** — Time-based salience decay keeps memory current; background consolidation extracts patterns from trade history.
- **LLM-Based Extraction** — Episodic trade records can be converted into typed semantic facts (market patterns, whale behaviors) asynchronously.
- **Trust-Aware Retrieval** — Sensitivity levels (public, low, medium, high, hyper) with graduated access control for multi-agent environments.
- **Encryption at Rest** — SQLCipher for wallet data, private key references, and trading signals.
- **gRPC API** — 15-method service with TypeScript and Python client SDKs.
- **Vector-Aware Retrieval** — pgvector-backed similarity search for strategy and pattern matching.

## Memory Types for Trading

| Type | Purpose | Trading Example |
|------|---------|----|
| **Episodic** | Raw trade/event capture (immutable) | Jupiter swap executed: SOL→USDC, 2.3 SOL, slippage 0.8% |
| **Working** | Active position state | "Long 500K $CLAWD at $0.0032, stop-loss at $0.0028" |
| **Semantic** | Stable market facts | "$CLAWD liquidity peaks 2-4pm UTC", "Wallet 8bit... is a whale accumulator" |
| **Competence** | Learned strategies with success tracking | "Mean reversion on pump.fun tokens: buy at -30% from ATH, sell at -10%. Win rate: 72%" |
| **Plan Graph** | Reusable DeFi workflows | Multi-step: check liquidity → set slippage → swap via Jupiter → verify balance → log P&L |

## Quick Start

### Prerequisites

- Go 1.22 or later
- Make
- Protocol Buffers compiler (`protoc` >= 3.20) for gRPC development

### Build and Run

```bash
cd membrain

# Build the daemon
make build

# Run tests
make test

# Start with default SQLite storage
./bin/membraned

# Start with Postgres + pgvector
./bin/membraned --postgres-dsn postgres://membrain:membrain@localhost:5432/membrain?sslmode=disable

# With custom config
./bin/membraned --config /path/to/config.yaml
```

### Using the Go Library

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/GustyCube/membrane/pkg/ingestion"
    "github.com/GustyCube/membrane/pkg/membrane"
    "github.com/GustyCube/membrane/pkg/retrieval"
    "github.com/GustyCube/membrane/pkg/schema"
)

func main() {
    cfg := membrane.DefaultConfig()
    cfg.DBPath = "clawd-agent.db"

    m, err := membrane.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer m.Stop()

    ctx := context.Background()
    m.Start(ctx)

    // Ingest a trade event
    rec, _ := m.IngestEvent(ctx, ingestion.IngestEventRequest{
        Source:    "clawd-trader",
        EventKind: "swap_executed",
        Ref:       "jupiter-swap#42",
        Summary:   "Swapped 2.3 SOL → 1,450 USDC via Jupiter, slippage 0.8%",
        Tags:      []string{"jupiter", "swap", "SOL", "USDC"},
    })
    fmt.Printf("Ingested trade record: %s\n", rec.ID)

    // Ingest a market observation
    m.IngestObservation(ctx, ingestion.IngestObservationRequest{
        Source:    "clawd-scanner",
        Subject:   "$CLAWD",
        Predicate: "liquidity_pattern",
        Object:    "volume peaks 2-4pm UTC on pump.fun graduated tokens",
        Tags:      []string{"market-pattern", "liquidity"},
    })

    // Track active position
    m.IngestWorkingState(ctx, ingestion.IngestWorkingStateRequest{
        Source:     "clawd-trader",
        ThreadID:   "position-001",
        State:      schema.TaskStateExecuting,
        NextActions: []string{"monitor price", "check stop-loss", "evaluate exit"},
    })

    // Retrieve trading knowledge
    resp, _ := m.Retrieve(ctx, &retrieval.RetrieveRequest{
        TaskDescriptor: "evaluate SOL/USDC swap opportunity",
        Trust: &retrieval.TrustContext{
            MaxSensitivity: schema.SensitivityMedium,
            Authenticated:  true,
        },
        MemoryTypes: []schema.MemoryType{
            schema.MemoryTypeCompetence,
            schema.MemoryTypeSemantic,
        },
    })

    for _, r := range resp.Records {
        fmt.Printf("Found: %s (type=%s, confidence=%.2f)\n", r.ID, r.Type, r.Confidence)
    }
}
```

## Architecture

Membrain runs as a long-lived daemon or embedded Go library:

```
+------------------+     +------------------+     +----------------------+
|  Ingestion Plane |---->|   Policy Plane   |---->| Storage & Retrieval  |
+------------------+     +------------------+     +----------------------+
        |                        |                         |
   Trade events,            Classification,            SQLCipher (encrypted),
   swap outcomes,           sensitivity,               audit trails,
   market observations      decay profiles             trust-gated access
```

### Deployment Tiers

| Tier | Backend | Embedding | LLM | Use Case |
|------|---------|-----------|-----|----------|
| **1** | SQLite | - | - | Single-agent trading bot, zero-infra |
| **2** | Postgres | - | - | Multi-agent deployment, concurrent writers |
| **3** | Postgres + pgvector | Yes | - | Strategy similarity search, pattern matching |
| **4** | Postgres + pgvector | Yes | Yes | Full system: auto-extract market patterns from trade history |

### Background Jobs

| Job | Default Interval | Purpose |
|-----|-----------------|----|
| **Decay** | 1 hour | Time-based salience decay (stale market observations fade) |
| **Pruning** | With decay | Auto-prune records below salience threshold |
| **Consolidation** | 6 hours | Extract patterns from trade history into semantic facts + competence records |

## Configuration

```yaml
backend: "sqlite"
db_path: "membrain.db"
listen_addr: ":9090"
decay_interval: "1h"
consolidation_interval: "6h"
default_sensitivity: "low"
selection_confidence_threshold: 0.7

# Optional: Postgres + pgvector for multi-agent
# postgres_dsn: "postgres://membrain:membrain@localhost:5432/membrain?sslmode=disable"

# Optional: embedding-backed strategy search
# embedding_endpoint: "https://api.openai.com/v1/embeddings"
# embedding_model: "text-embedding-3-small"
# embedding_dimensions: 1536

# Optional: LLM-backed pattern extraction
# llm_endpoint: "https://api.openai.com/v1/chat/completions"
# llm_model: "gpt-5-mini"

rate_limit_per_second: 100
```

| Environment Variable | Purpose |
|-----|---------|
| `MEMBRAIN_ENCRYPTION_KEY` | SQLCipher encryption key |
| `MEMBRAIN_POSTGRES_DSN` | PostgreSQL connection string |
| `MEMBRAIN_EMBEDDING_API_KEY` | API key for embeddings |
| `MEMBRAIN_LLM_API_KEY` | API key for LLM extraction |
| `MEMBRAIN_API_KEY` | Bearer token for gRPC auth |

## gRPC API

| Method | Description |
|--------|-------------|
| `IngestEvent` | Create episodic record (trade, swap, alert) |
| `IngestToolOutput` | Create record from tool invocation |
| `IngestObservation` | Create semantic record (market fact, wallet pattern) |
| `IngestOutcome` | Update episodic record with trade outcome (P&L) |
| `IngestWorkingState` | Track active position state |
| `Retrieve` | Layered retrieval with trust context |
| `RetrieveByID` | Fetch single record by ID |
| `Supersede` | Replace a record with updated version |
| `Fork` | Create conditional variant (different market condition) |
| `Retract` | Mark record as invalid |
| `Merge` | Combine multiple observations into one |
| `Contest` | Mark record as contested by conflicting evidence |
| `Reinforce` | Boost salience (strategy was profitable) |
| `Penalize` | Reduce salience (strategy lost money) |
| `GetMetrics` | Retrieve observability snapshot |

## TypeScript Client

```bash
npm install @gustycube/membrane
```

```ts
import { MembraneClient, Sensitivity } from "@gustycube/membrane";

const membrain = new MembraneClient("localhost:9090", { apiKey: "your-key" });

// Ingest a trade event
const record = await membrain.ingestEvent("swap_executed", "jupiter-swap#42", {
  summary: "Swapped 2.3 SOL → 1,450 USDC via Jupiter Ultra",
  tags: ["jupiter", "swap", "SOL", "USDC"]
});

// Retrieve trading knowledge
const results = await membrain.retrieve("evaluate SOL swap opportunity", {
  trust: {
    max_sensitivity: Sensitivity.MEDIUM,
    authenticated: true,
    actor_id: "clawd-trader",
    scopes: []
  },
  memoryTypes: ["semantic", "competence"]
});

// Reinforce a profitable strategy
await membrain.reinforce(record.id, "clawd-trader", "trade was profitable +12%");

membrain.close();
```

## Python Client

```bash
pip install -e clients/python
```

```python
from membrane import MembraneClient, Sensitivity, TrustContext

client = MembraneClient("localhost:9090", api_key="your-key")

# Ingest a market observation
record = client.ingest_event(
    source="clawd-scanner",
    event_kind="market_signal",
    ref="pump-scan#99",
    summary="$CLAWD volume spike 340% in 15m, whale accumulation detected",
    tags=["clawd", "volume", "whale", "signal"],
)

# Retrieve relevant strategies
results = client.retrieve(
    task_descriptor="respond to volume spike on pump.fun token",
    trust=TrustContext(max_sensitivity=Sensitivity.MEDIUM, authenticated=True),
    memory_types=["competence", "semantic"],
)
```

## Integration with ClawdBot

Membrain powers the memory layer for [ClawdBot](../X/) (`@clawddevs`):

```
ClawdBot (X/Telegram)
    │
    ├── Trade executed via Jupiter
    │   └── IngestEvent → episodic record
    │
    ├── Market scan detected pattern
    │   └── IngestObservation → semantic record
    │
    ├── Strategy succeeded/failed
    │   └── Reinforce/Penalize → update competence
    │
    └── Next trade decision
        └── Retrieve → competence + semantic context
```

### Memory Flow for Trading

1. **Ingest** — Every swap, scan, and alert creates an episodic record
2. **Consolidate** — Background job extracts patterns: "tokens with >50K liquidity and <1h age tend to 3x"
3. **Retrieve** — Before each trade, query competence records for relevant strategies
4. **Reinforce/Penalize** — After trade settles, update the strategy's success rate
5. **Decay** — Stale market observations naturally fade; profitable strategies persist

---

## Observability

```json
{
  "total_records": 2847,
  "records_by_type": {
    "episodic": 1920,
    "semantic": 480,
    "competence": 215,
    "plan_graph": 42,
    "working": 190
  },
  "avg_salience": 0.58,
  "avg_confidence": 0.74,
  "competence_success_rate": 0.68,
  "plan_reuse_frequency": 4.2,
  "revision_rate": 0.12
}
```

---

## Project Structure

```
membrain/
├── api/              # Protobuf definitions + gRPC service
├── clients/
│   ├── typescript/   # TypeScript SDK (@gustycube/membrane)
│   └── python/       # Python SDK
├── cmd/
│   ├── membraned/    # Daemon binary
│   └── membrane-eval/ # Evaluation harness
├── pkg/
│   ├── consolidation/ # Background pattern extraction
│   ├── decay/         # Time-based salience decay
│   ├── embedding/     # pgvector embedding support
│   ├── ingestion/     # Event, observation, state ingestion
│   ├── membrane/      # Core library (embedded mode)
│   ├── metrics/       # Observability metrics
│   ├── retrieval/     # Trust-gated layered retrieval
│   ├── revision/      # Supersede, fork, retract, merge, contest
│   ├── schema/        # Memory type schemas
│   └── storage/       # SQLite/Postgres backends
├── tests/            # Integration + eval tests
├── tools/            # Evaluation tooling
├── docker-compose.yml
├── go.mod
├── go.sum
└── Makefile
```

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

**Membrain** — Selective memory for autonomous trading agents. Part of the [OpenClawd](https://openclawd.biz) platform. $CLAWD on Solana.
