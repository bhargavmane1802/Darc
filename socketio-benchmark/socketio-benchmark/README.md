# Socket.IO Benchmarks

## Install

```bash
npm install socket.io-client dotenv
```

Use Node.js 18+ with ES modules enabled (already configured in the repository root `package.json`).

## Configure

Copy `.env.example` to `.env` and set `BENCH_PASSWORD` to the password for the authorized test accounts in `BENCH_USERS`. Do not commit `.env`.

---

## 1. Full Message Controller Benchmark (`message-benchmark.js`)

Benchmarks **every route, alias, and controller function** in `backend/src/controllers/message.controller.js` and `backend/src/routers/message.Router.js` across configurable concurrency stages and both **shared-room** and **single-room** topologies:

| Phase / Route | Controller Function | Registered Socket Events | Broadcast / Side Effects Tested |
|---|---|---|---|
| `create` | `messageCreateSocket` (`handleMessageCreate` / `handleMessageSend`) | `message:create`, `message:send`, `message_send`, `create_message` | `message_new` broadcast, MongoDB insert, Redis recent-cache insert, `text`/`mixed`/`image` payloads |
| `display` | `messageDisplaySocket` (`handleMessageDisplay`) | `message:display`, `display_message`, `message_display` | Synchronized cold/burst wave (lock/stampede contention) + sustained reads, string & object payloads, limits `30/60/100` |
| `update` | `messageUpdateSocket` (`handleMessageUpdate`) | `message:update`, `update_message`, `message_update` | `update_message` broadcast, ownership check, MongoDB update, Redis `updateMessageInRecentCache` |
| `read` | `messageReadSocket` (`handleMessageRead`) | `message:read` (ack) + `read_message` (positional) | `readUpdate_message` broadcast, `message_read_success`, first-time `readBy.push` + `save()` vs idempotent reads |
| `delete` | `messageDeleteSocket` (`handleMessageDelete`) | `message:delete`, `delete_message`, `message_delete` | `delete_message` broadcast, ownership check, MongoDB `deleteOne` |
| `mixed` | All 5 controller functions concurrently | Weighted concurrent lifecycle (`create:35, display:30, read:15, update:12, delete:8`) | Combined read/write/delete contention with per-route breakdown |

### Scenarios

- **`shared-room`**: All concurrent sockets across all accounts join one shared room (maximum $O(N)$ broadcast fan-out per write and single-room DB/cache contention).
- **`single-room`**: Isolated single rooms:
  - `--single-room-mode per-account` (default): each test account owns its own room (matches `separate-rooms` in `benchmark.js`).
  - `--single-room-mode per-socket`: every connected socket creates its own dedicated room (strictly 1 socket per room even at 250 concurrent sockets).

### Run

```bash
# Full benchmark (shared-room + single-room, stages 5 -> 20 -> 50 -> 100 -> 250, all 6 route phases + 15 alias checks)
node message-benchmark.js

# Quick smoke/iteration run (stages 5 -> 20 -> 50, 10s per phase)
node message-benchmark.js --quick

# Custom stages, specific routes, per-socket single rooms, fast JWT handshake ramp-up, and auto room cleanup
node message-benchmark.js \
  --stages 5,20,50,100,250 \
  --scenarios shared-room,single-room \
  --routes create,display,update,read,delete,mixed \
  --single-room-mode per-socket \
  --auth-mode token \
  --cleanup

# View all CLI flags
node message-benchmark.js --help
```

Or from the repository root:

```bash
npm run bench:messages
npm run bench:messages:quick
```

### Reports & Telemetry Metrics

Each run writes three timestamped files to `benchmark-results/`:

- `message-benchmark-<timestamp>.json` — full metadata, 15-route alias verification, per-stage/per-route latency stats (`min`, `avg`, `p50`, `p90`, `p95`, `p99`, `max`), delivery fan-out stats, `displayBurst` stats, `mixed` per-route breakdown, status breakdowns, error samples, **server telemetry**, and load-generator `clientMetrics`.
- `message-benchmark-<timestamp>.csv` — flat spreadsheet-ready metrics per `(scenario, stage, route)` including cache, DB, CPU, memory, and event-loop columns.
- `message-benchmark-<timestamp>.md` — side-by-side Markdown tables for route latencies + a dedicated **System, Cache, Database & Event-Loop Telemetry** table per scenario.

When the backend is running (`backend/index.js`), it exposes `GET /__bench/metrics` (disableable in production via `BENCH_METRICS_ENABLED=false`), which `message-benchmark.js` snapshots before and after every route phase to record:

| Metric | How It Is Measured |
|---|---|
| **Cache hit ratio** | Application recent-message cache (`hits / (hits + misses + fallbacks)` instrumented in `message.controller.js`) + Redis `INFO stats` keyspace hit ratio (`keyspace_hits / (keyspace_hits + keyspace_misses)`) |
| **Database queries per second (QPS)** | MongoDB Node driver command monitoring (`monitorCommands: true`) total & per-command QPS (`find`, `insert`, `update`, `delete`, `findAndModify`, `aggregate`) + MongoDB `serverStatus.opcounters` QPS when permitted |
| **Database load** | Active DB saturation factor (`totalQueryTimeMs / phaseWallMs`), peak simultaneous in-flight queries, DB query latency (`avg` / `p95` / `p99`), plus MongoDB `activeClients`, `currentQueue`, and `connections` when permitted |
| **CPU utilization** | Backend Node `process.cpuUsage()` (`processCpuPct` & core-normalized `processCpuNormalizedPct`) + host `os.cpus()` system CPU % + 1-min load average |
| **Memory utilization** | Backend `rssMB` / `peakRssMB`, `heapUsedMB` / `peakHeapUsedMB` / `heapTotalMB`, `heapUsedPct`, `heapLimitPct`, plus host `systemMemUsedPct` |
| **Event-loop lag** | Backend `monitorEventLoopDelay({ resolution: 10 })` reset per phase (`min`, `mean`, `p50`, `p90`, `p95`, `p99`, `max` in ms) |

Pass `--no-server-metrics` (or `--metrics-url <url>`) to control telemetry polling. Pressing `Ctrl+C` during a run stops cleanly and flushes all completed results to disk.

---

## 2. Original Create-Only Baseline Benchmark (`benchmark.js`)

```bash
node benchmark.js
```

Runs the original `shared-room` and `separate-rooms` baseline for `message:create` across `5, 20, 50, 100, 250` concurrent connections (60s per stage), outputting `socketio-benchmark-*.json` and `socketio-benchmark-*.csv`.
