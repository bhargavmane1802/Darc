import { io } from "socket.io-client";
import os from "node:os";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env next to this script first, then fall back to cwd .env.
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// CLI Argument & Environment Configuration
// ─────────────────────────────────────────────────────────────────────────────

const ALL_ROUTES = ["create", "display", "update", "read", "delete", "mixed"];
const VALID_SCENARIOS = new Set(["shared-room", "single-room"]);
const VALID_SINGLE_ROOM_MODES = new Set(["per-account", "per-socket"]);
const VALID_AUTH_MODES = new Set(["login", "token"]);

function printHelp() {
  console.log(`
DARC Message Controller Multi-Stage Concurrency Benchmark
=========================================================

Benchmarks all Socket.IO routes & controller functions in message.controller.js
and message.Router.js across configurable concurrency stages and both
shared-room and single-room topologies.

Usage:
  node message-benchmark.js [options]

Options:
  --url <url>                  Target server URL (env: BENCH_URL, default: http://localhost:8080)
  --stages <csv>               Concurrency stages (env: BENCH_STAGES, default: 5,20,50,100,250)
  --scenarios <csv>            Scenarios: shared-room,single-room (env: BENCH_SCENARIOS)
  --routes <csv>               Routes/phases: create,display,update,read,delete,mixed (env: BENCH_ROUTES)
  --stage-ms <ms>              Duration per route phase in ms (env: BENCH_ROUTE_STAGE_MS, default: 20000)
  --interval-ms <ms>           Per-client interval between ops in ms (env: BENCH_OP_INTERVAL_MS, default: 1000)
  --single-room-mode <mode>    per-account | per-socket (env: BENCH_SINGLE_ROOM_MODE, default: per-account)
  --auth-mode <mode>           login | token (env: BENCH_AUTH_MODE, default: login)
  --seed-messages <n>          Min messages per room before display/read (env: BENCH_SEED_MESSAGES, default: 60)
  --display-limit <n>          Base limit for message:display (env: BENCH_DISPLAY_LIMIT, default: 60)
  --ack-timeout-ms <ms>        Ack timeout in ms (env: BENCH_ACK_TIMEOUT_MS, default: 10000)
  --batch-size <n>             Socket ramp-up batch size (env: BENCH_CONNECT_BATCH_SIZE, default: 25)
  --mixed-weights <spec>       Mixed workload weights (default: create:35,display:30,read:15,update:12,delete:8)
  --output-dir <dir>           Output directory for JSON/CSV/MD reports (env: BENCH_OUTPUT_DIR)
  --metrics-url <url>          Backend telemetry endpoint (env: BENCH_METRICS_URL, default: <url>/__bench/metrics)
  --no-server-metrics          Disable polling backend CPU/mem/DB/cache/event-loop telemetry
  --cleanup                    Remove benchmark rooms after each scenario (env: BENCH_CLEANUP_ROOMS=true)
  --skip-aliases               Skip pre-flight verification of all 15 route aliases
  --quick                      Quick preset: stages=5,20,50 stage-ms=10000 interval-ms=500
  --help, -h                   Show this help message

Examples:
  node message-benchmark.js
  node message-benchmark.js --quick
  node message-benchmark.js --stages 5,20,50,100 --scenarios shared-room,single-room --routes create,display,update,read,delete,mixed
  node message-benchmark.js --single-room-mode per-socket --auth-mode token --cleanup
`);
}

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--quick") {
      args.quick = true;
    } else if (token === "--cleanup") {
      args.cleanup = true;
    } else if (token === "--skip-aliases") {
      args.skipAliases = true;
    } else if (token === "--no-server-metrics") {
      args.noServerMetrics = true;
    } else if (token.startsWith("--")) {
      const eqIdx = token.indexOf("=");
      if (eqIdx !== -1) {
        args[token.slice(2, eqIdx)] = token.slice(eqIdx + 1);
      } else {
        const key = token.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
          args[key] = true;
        } else {
          args[key] = next;
          i++;
        }
      }
    }
  }
  return args;
}

function parseIntList(raw, fallback) {
  if (!raw) return fallback;
  const parsed = String(raw)
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0);
  return parsed.length ? parsed : fallback;
}

function parseScenarioList(raw) {
  const fallback = ["shared-room", "single-room"];
  if (!raw) return fallback;
  const normalized = String(raw)
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .map(s => (s === "separate-rooms" || s === "separate-room" || s === "isolated" ? "single-room" : s));
  for (const s of normalized) {
    if (!VALID_SCENARIOS.has(s)) {
      throw new Error(`Invalid scenario "${s}". Expected one of: shared-room, single-room`);
    }
  }
  return normalized.length ? [...new Set(normalized)] : fallback;
}

function parseRouteList(raw) {
  if (!raw) return [...ALL_ROUTES];
  const list = String(raw)
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  for (const r of list) {
    if (!ALL_ROUTES.includes(r)) {
      throw new Error(`Invalid route "${r}". Expected one of: ${ALL_ROUTES.join(", ")}`);
    }
  }
  return list.length ? [...new Set(list)] : [...ALL_ROUTES];
}

function parseMixedWeights(raw) {
  const defaults = { create: 35, display: 30, read: 15, update: 12, delete: 8 };
  if (!raw) return defaults;
  const result = { create: 0, display: 0, read: 0, update: 0, delete: 0 };
  for (const part of String(raw).split(",")) {
    const [k, v] = part.split(":").map(s => s.trim().toLowerCase());
    if (k in result && Number.isFinite(Number(v)) && Number(v) >= 0) {
      result[k] = Number(v);
    }
  }
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  if (total <= 0) return defaults;
  return result;
}

const cli = parseCliArgs(process.argv.slice(2));
if (cli.help) {
  printHelp();
  process.exit(0);
}

const CONFIG = {
  url: cli.url || process.env.BENCH_URL || "http://localhost:8080",
  password: process.env.BENCH_PASSWORD || "",
  usernames: (process.env.BENCH_USERS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
  stages: parseIntList(
    cli.stages || (cli.quick ? "50,100,200,400,650" : process.env.BENCH_STAGES),
    [5, 20, 50, 100, 250]
  ),
  scenarios: parseScenarioList(cli.scenarios || process.env.BENCH_SCENARIOS),
  routes: parseRouteList(cli.routes || process.env.BENCH_ROUTES),
  stageMs: Number(
    cli["stage-ms"] ||
      (cli.quick ? 10_000 : process.env.BENCH_ROUTE_STAGE_MS || 20_000)
  ),
  opIntervalMs: Number(
    cli["interval-ms"] ||
      (cli.quick
        ? 500
        : process.env.BENCH_OP_INTERVAL_MS ||
          process.env.BENCH_MESSAGE_INTERVAL_MS ||
          1_000)
  ),
  singleRoomMode: (
    cli["single-room-mode"] ||
    process.env.BENCH_SINGLE_ROOM_MODE ||
    "per-account"
  ).toLowerCase(),
  authMode: (
    cli["auth-mode"] ||
    process.env.BENCH_AUTH_MODE ||
    "login"
  ).toLowerCase(),
  seedMessages: Number(
    cli["seed-messages"] || (cli.quick ? 20 : process.env.BENCH_SEED_MESSAGES || 60)
  ),
  displayLimit: Number(
    cli["display-limit"] || process.env.BENCH_DISPLAY_LIMIT || 60
  ),
  ackTimeoutMs: Number(
    cli["ack-timeout-ms"] || process.env.BENCH_ACK_TIMEOUT_MS || 10_000
  ),
  connectTimeoutMs: Number(process.env.BENCH_CONNECT_TIMEOUT_MS || 12_000),
  batchSize: Number(
    cli["batch-size"] || process.env.BENCH_CONNECT_BATCH_SIZE || 25
  ),
  mixedWeights: parseMixedWeights(
    cli["mixed-weights"] || process.env.BENCH_MIXED_WEIGHTS
  ),
  cleanupRooms:
    Boolean(cli.cleanup) ||
    String(process.env.BENCH_CLEANUP_ROOMS || "").toLowerCase() === "true",
  skipAliases: Boolean(cli.skipAliases),
  enableServerMetrics:
    !cli.noServerMetrics &&
    String(process.env.BENCH_SERVER_METRICS || "true").toLowerCase() !== "false",
  metricsUrl:
    cli["metrics-url"] ||
    process.env.BENCH_METRICS_URL ||
    `${(cli.url || process.env.BENCH_URL || "http://localhost:8080").replace(/\/+$/, "")}/__bench/metrics`,
  outputDir: path.resolve(
    __dirname,
    cli["output-dir"] || process.env.BENCH_OUTPUT_DIR || "./benchmark-results"
  ),
};

if (!CONFIG.password) {
  throw new Error("Set BENCH_PASSWORD in socketio-benchmark/.env (or environment).");
}
if (CONFIG.usernames.length < 2) {
  throw new Error("Provide at least two comma-separated usernames in BENCH_USERS.");
}
if (!VALID_SINGLE_ROOM_MODES.has(CONFIG.singleRoomMode)) {
  throw new Error(`Invalid single-room-mode "${CONFIG.singleRoomMode}". Use per-account or per-socket.`);
}
if (!VALID_AUTH_MODES.has(CONFIG.authMode)) {
  throw new Error(`Invalid auth-mode "${CONFIG.authMode}". Use login or token.`);
}
if (!(CONFIG.stageMs > 0) || !(CONFIG.opIntervalMs > 0)) {
  throw new Error("stageMs and opIntervalMs must be positive numbers.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities & Metrics Engine
// ─────────────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const runId = `${Date.now()}`;
const MAX_SAMPLES = 15_000;
const MAX_PENDING_KEYS = 50_000;
const MAX_ROOM_LIVE_MESSAGES = 500;
const MAX_ERROR_SAMPLES = 10;

let opSequence = 0;
let aborted = false;

function reservoirPush(list, value, seenCount) {
  if (!Number.isFinite(value)) return;
  if (list.length < MAX_SAMPLES) {
    list.push(value);
  } else {
    const idx = Math.floor(Math.random() * seenCount);
    if (idx < MAX_SAMPLES) list[idx] = value;
  }
}

function percentileSorted(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return Number(sorted[idx].toFixed(2));
}

function summarizeSamples(values) {
  if (!values.length) {
    return {
      count: 0,
      min: null,
      avg: null,
      p50: null,
      p90: null,
      p95: null,
      p99: null,
      max: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) sum += sorted[i];
  return {
    count: sorted.length,
    min: Number(sorted[0].toFixed(2)),
    avg: Number((sum / sorted.length).toFixed(2)),
    p50: percentileSorted(sorted, 0.5),
    p90: percentileSorted(sorted, 0.9),
    p95: percentileSorted(sorted, 0.95),
    p99: percentileSorted(sorted, 0.99),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

function createOpTracker() {
  return {
    success: 0,
    failure: 0,
    deliveries: 0,
    ackSamples: [],
    ackSeen: 0,
    deliverySamples: [],
    deliverySeen: 0,
    statusBreakdown: {},
    errorSamples: [],
    extra: {},
  };
}

function recordAck(tracker, ok, latencyMs, statusKey, errorMsg = null) {
  if (ok) tracker.success++;
  else tracker.failure++;

  tracker.ackSeen++;
  reservoirPush(tracker.ackSamples, latencyMs, tracker.ackSeen);

  const key = String(statusKey ?? (ok ? "ok" : "error"));
  tracker.statusBreakdown[key] = (tracker.statusBreakdown[key] || 0) + 1;

  if (!ok && errorMsg && tracker.errorSamples.length < MAX_ERROR_SAMPLES) {
    if (!tracker.errorSamples.includes(errorMsg)) {
      tracker.errorSamples.push(errorMsg);
    }
  }
}

function recordDelivery(tracker, latencyMs) {
  if (!tracker) return;
  tracker.deliveries++;
  if (Number.isFinite(latencyMs) && latencyMs >= 0) {
    tracker.deliverySeen++;
    reservoirPush(tracker.deliverySamples, latencyMs, tracker.deliverySeen);
  }
}

function finalizeOpTracker(tracker, durationSec) {
  const total = tracker.success + tracker.failure;
  const errorRatePct = total > 0 ? Number(((tracker.failure / total) * 100).toFixed(2)) : 0;
  return {
    success: tracker.success,
    failure: tracker.failure,
    total,
    errorRatePct,
    opsPerSecond: Number((tracker.success / durationSec).toFixed(2)),
    deliveries: tracker.deliveries,
    deliveriesPerSecond: Number((tracker.deliveries / durationSec).toFixed(2)),
    ackLatencyMs: summarizeSamples(tracker.ackSamples),
    deliveryLatencyMs: summarizeSamples(tracker.deliverySamples),
    statusBreakdown: tracker.statusBreakdown,
    errorSamples: tracker.errorSamples,
    ...(Object.keys(tracker.extra).length ? { extra: tracker.extra } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server & Client System / DB / Cache / Event-Loop Telemetry
// ─────────────────────────────────────────────────────────────────────────────

const clientElHistogram = monitorEventLoopDelay({ resolution: 10 });
clientElHistogram.enable();

let serverMetricsAvailable = CONFIG.enableServerMetrics;
let serverMetricsWarned = false;

function round2(n) {
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

function bytesToMB(bytes) {
  return Number.isFinite(bytes) ? Number((bytes / (1024 * 1024)).toFixed(2)) : null;
}

async function fetchServerMetricsSnapshot({ reset = false } = {}) {
  if (!serverMetricsAvailable) return null;
  const url = reset
    ? `${CONFIG.metricsUrl}${CONFIG.metricsUrl.includes("?") ? "&" : "?"}reset=true`
    : CONFIG.metricsUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (!serverMetricsWarned) {
      serverMetricsWarned = true;
      console.warn(
        `[WARN] Backend telemetry endpoint (${CONFIG.metricsUrl}) unavailable (${err.message}); ` +
          `server CPU/memory/DB/cache/event-loop metrics will be null.`
      );
    }
    serverMetricsAvailable = false;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function captureClientSnapshot({ reset = false } = {}) {
  const toMs = ns => (Number.isFinite(ns) && ns > 0 ? round2(ns / 1e6) : 0);
  const elLag =
    clientElHistogram.count > 0
      ? {
          mean: toMs(clientElHistogram.mean),
          p50: toMs(clientElHistogram.percentile(50)),
          p95: toMs(clientElHistogram.percentile(95)),
          p99: toMs(clientElHistogram.percentile(99)),
          max: toMs(clientElHistogram.max),
        }
      : { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };

  const snap = {
    perfNowMs: performance.now(),
    cpuUsageUs: process.cpuUsage(),
    memory: process.memoryUsage(),
    eventLoopLagMs: elLag,
  };
  if (reset) clientElHistogram.reset();
  return snap;
}

function diffClientMetrics(before, after) {
  if (!before || !after) return null;
  const wallMs = Math.max(after.perfNowMs - before.perfNowMs, 1);
  const deltaCpuMs =
    (after.cpuUsageUs.user - before.cpuUsageUs.user +
      (after.cpuUsageUs.system - before.cpuUsageUs.system)) /
    1000;
  const cores = Math.max(os.cpus().length, 1);
  return {
    processCpuPct: round2((deltaCpuMs / wallMs) * 100),
    processCpuNormalizedPct: round2((deltaCpuMs / (wallMs * cores)) * 100),
    rssMB: bytesToMB(after.memory.rss),
    heapUsedMB: bytesToMB(after.memory.heapUsed),
    eventLoopLagMs: after.eventLoopLagMs,
  };
}

function diffServerMetrics(before, after) {
  if (!before || !after) return null;

  const wallMs = Math.max(
    (after.perfNowMs ?? after.timestampMs) - (before.perfNowMs ?? before.timestampMs),
    1
  );
  const wallSec = wallMs / 1000;

  // 1. CPU Utilization
  const dUserUs = Math.max(0, (after.cpu?.processUsageUs?.user ?? 0) - (before.cpu?.processUsageUs?.user ?? 0));
  const dSysUs = Math.max(0, (after.cpu?.processUsageUs?.system ?? 0) - (before.cpu?.processUsageUs?.system ?? 0));
  const deltaProcCpuMs = (dUserUs + dSysUs) / 1000;
  const cores = Math.max(after.cpu?.systemTicks?.cores || 1, 1);
  const processCpuPct = round2((deltaProcCpuMs / wallMs) * 100);
  const processCpuNormalizedPct = round2((deltaProcCpuMs / (wallMs * cores)) * 100);

  const dSysTotal = (after.cpu?.systemTicks?.total ?? 0) - (before.cpu?.systemTicks?.total ?? 0);
  const dSysIdle = (after.cpu?.systemTicks?.idle ?? 0) - (before.cpu?.systemTicks?.idle ?? 0);
  const systemCpuPct =
    dSysTotal > 0 ? round2(((dSysTotal - dSysIdle) / dSysTotal) * 100) : null;

  // 2. Memory Utilization
  const m = after.memory || {};
  const heapUsedPct =
    m.heapTotalBytes > 0 ? round2((m.heapUsedBytes / m.heapTotalBytes) * 100) : null;
  const heapLimitPct =
    m.heapLimitBytes > 0 ? round2((m.heapUsedBytes / m.heapLimitBytes) * 100) : null;
  const sysUsedBytes =
    Number.isFinite(m.systemTotalBytes) && Number.isFinite(m.systemFreeBytes)
      ? m.systemTotalBytes - m.systemFreeBytes
      : null;
  const systemMemUsedPct =
    m.systemTotalBytes > 0 && sysUsedBytes !== null
      ? round2((sysUsedBytes / m.systemTotalBytes) * 100)
      : null;

  // 3. Cache Hit Ratio (App Recent-Message Cache + Redis Server Keyspace)
  const appBefore = before.cache?.app || {};
  const appAfter = after.cache?.app || {};
  const appHits = Math.max(0, (appAfter.hits ?? 0) - (appBefore.hits ?? 0));
  const appMisses = Math.max(0, (appAfter.misses ?? 0) - (appBefore.misses ?? 0));
  const appFallbacks = Math.max(0, (appAfter.fallbacks ?? 0) - (appBefore.fallbacks ?? 0));
  const appErrors = Math.max(0, (appAfter.errors ?? 0) - (appBefore.errors ?? 0));
  const appLookups = appHits + appMisses + appFallbacks;
  const appHitRatioPct = appLookups > 0 ? round2((appHits / appLookups) * 100) : null;

  const appWrites = {
    init: Math.max(0, (appAfter.writes?.init ?? 0) - (appBefore.writes?.init ?? 0)),
    insert: Math.max(0, (appAfter.writes?.insert ?? 0) - (appBefore.writes?.insert ?? 0)),
    update: Math.max(0, (appAfter.writes?.update ?? 0) - (appBefore.writes?.update ?? 0)),
    delete: Math.max(0, (appAfter.writes?.delete ?? 0) - (appBefore.writes?.delete ?? 0)),
    skipped: Math.max(0, (appAfter.writes?.skipped ?? 0) - (appBefore.writes?.skipped ?? 0)),
  };

  const rBefore = before.cache?.redis;
  const rAfter = after.cache?.redis;
  let redisStats = { connected: false };
  if (rBefore?.connected && rAfter?.connected) {
    const redisHits = Math.max(0, (rAfter.keyspaceHits ?? 0) - (rBefore.keyspaceHits ?? 0));
    const redisMisses = Math.max(0, (rAfter.keyspaceMisses ?? 0) - (rBefore.keyspaceMisses ?? 0));
    const redisLookups = redisHits + redisMisses;
    const redisCmds = Math.max(
      0,
      (rAfter.totalCommandsProcessed ?? 0) - (rBefore.totalCommandsProcessed ?? 0)
    );
    redisStats = {
      connected: true,
      hits: redisHits,
      misses: redisMisses,
      hitRatioPct: redisLookups > 0 ? round2((redisHits / redisLookups) * 100) : null,
      commandsPerSec: round2(redisCmds / wallSec),
      instantaneousOpsPerSec: rAfter.instantaneousOpsPerSec ?? null,
      usedMemoryMB: bytesToMB(rAfter.usedMemoryBytes),
      connectedClients: rAfter.connectedClients ?? null,
    };
  }

  const effectiveHitRatioPct =
    appHitRatioPct !== null ? appHitRatioPct : (redisStats.hitRatioPct ?? null);

  // 4. Database Load & Queries Per Second (QPS)
  const dbBefore = before.database || {};
  const dbAfter = after.database || {};
  const deltaQueries = Math.max(0, (dbAfter.totalQueries ?? 0) - (dbBefore.totalQueries ?? 0));
  const deltaFailedQueries = Math.max(0, (dbAfter.failed ?? 0) - (dbBefore.failed ?? 0));
  const deltaDurationMs = Math.max(0, (dbAfter.totalDurationMs ?? 0) - (dbBefore.totalDurationMs ?? 0));

  const byCommand = {};
  const byCommandQps = {};
  for (const key of ["find", "insert", "update", "delete", "findAndModify", "count", "aggregate", "other"]) {
    const d = Math.max(0, (dbAfter.byCommand?.[key] ?? 0) - (dbBefore.byCommand?.[key] ?? 0));
    byCommand[key] = d;
    byCommandQps[key] = round2(d / wallSec);
  }

  // Optional MongoDB serverStatus opcounters delta
  let serverStatusSummary = null;
  if (dbBefore.serverStatus?.opcounters && dbAfter.serverStatus?.opcounters) {
    const opBefore = dbBefore.serverStatus.opcounters;
    const opAfter = dbAfter.serverStatus.opcounters;
    const dOp = k => Math.max(0, Number(opAfter[k] ?? 0) - Number(opBefore[k] ?? 0));
    const totalOps = dOp("query") + dOp("insert") + dOp("update") + dOp("delete") + dOp("getmore");
    serverStatusSummary = {
      opcountersQps: {
        total: round2(totalOps / wallSec),
        query: round2(dOp("query") / wallSec),
        insert: round2(dOp("insert") / wallSec),
        update: round2(dOp("update") / wallSec),
        delete: round2(dOp("delete") / wallSec),
        command: round2(dOp("command") / wallSec),
      },
      connections: dbAfter.serverStatus.connections || null,
      activeClients: dbAfter.serverStatus.globalLock?.activeClients || null,
      currentQueue: dbAfter.serverStatus.globalLock?.currentQueue || null,
      mongoResidentMemMB: dbAfter.serverStatus.mem?.residentMB ?? null,
    };
  }

  const queriesPerSecond = dbAfter.driverMonitorAttached
    ? round2(deltaQueries / wallSec)
    : (serverStatusSummary?.opcountersQps?.total ?? null);

  return {
    windowSeconds: round2(wallSec),
    cpu: {
      processCpuPct,
      processCpuNormalizedPct,
      systemCpuPct,
      cores,
      loadAvg1m: after.cpu?.loadAvg?.[0] ?? null,
    },
    memory: {
      rssMB: bytesToMB(m.rssBytes),
      peakRssMB: bytesToMB(m.peakRssBytes),
      heapUsedMB: bytesToMB(m.heapUsedBytes),
      peakHeapUsedMB: bytesToMB(m.peakHeapUsedBytes),
      heapTotalMB: bytesToMB(m.heapTotalBytes),
      heapLimitMB: bytesToMB(m.heapLimitBytes),
      externalMB: bytesToMB(m.externalBytes),
      heapUsedPct,
      heapLimitPct,
      systemMemUsedPct,
      systemMemUsedMB: bytesToMB(sysUsedBytes),
      systemMemTotalMB: bytesToMB(m.systemTotalBytes),
    },
    eventLoopLagMs: after.eventLoopLagMs || null,
    cache: {
      effectiveHitRatioPct,
      appHitRatioPct,
      appHits,
      appMisses,
      appFallbacks,
      appErrors,
      appWrites,
      redis: redisStats,
    },
    database: {
      driverMonitorAttached: Boolean(dbAfter.driverMonitorAttached),
      queriesPerSecond,
      totalQueries: deltaQueries,
      failedQueries: deltaFailedQueries,
      dbLoadFactor: round2(deltaDurationMs / wallMs),
      totalQueryTimeMs: round2(deltaDurationMs),
      peakInFlightQueries: dbAfter.peakInFlight ?? null,
      queryLatencyMs: dbAfter.queryLatencyMs || null,
      byCommand,
      byCommandQps,
      serverStatus: serverStatusSummary,
    },
  };
}

// Active phase collector & pending broadcast timestamps
let activePhase = null; // { route, trackers: { create, display, update, read, delete, overall } }

const pendingBroadcasts = {
  create: new Map(), // content -> sentAt
  update: new Map(), // updatedContent -> sentAt
  delete: new Map(), // messageId -> sentAt
  read: new Map(),   // `${roomId}:${userId}:${messageId}` -> sentAt
};

function trackPending(kind, key) {
  const map = pendingBroadcasts[kind];
  map.set(key, performance.now());
  if (map.size > MAX_PENDING_KEYS) {
    let removed = 0;
    for (const k of map.keys()) {
      map.delete(k);
      if (++removed >= 10_000) break;
    }
  }
}

function clearPendingBroadcasts() {
  pendingBroadcasts.create.clear();
  pendingBroadcasts.update.clear();
  pendingBroadcasts.delete.clear();
  pendingBroadcasts.read.clear();
}

function recordBroadcastArrival(kind, key) {
  if (!activePhase) return;
  const sentAt = key ? pendingBroadcasts[kind].get(key) : undefined;
  const latency = sentAt !== undefined ? performance.now() - sentAt : NaN;

  if (activePhase.route === "mixed") {
    recordDelivery(activePhase.trackers[kind], latency);
    recordDelivery(activePhase.trackers.overall, latency);
  } else if (activePhase.route === kind) {
    recordDelivery(activePhase.trackers[kind], latency);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Helpers
// ─────────────────────────────────────────────────────────────────────────────

function emitAck(socket, event, payload, timeoutMs = CONFIG.ackTimeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${event} ack timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    socket.emit(event, payload, response => {
      clearTimeout(timer);
      resolve(response || {});
    });
  });
}

// Positional read_message route does not pass a callback to messageReadRoute;
// it confirms via "message_read_success" to the caller.
function emitReadPositional(socket, roomId, messageId, timeoutMs = CONFIG.ackTimeoutMs) {
  return new Promise((resolve, reject) => {
    const targetId = String(messageId);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`read_message timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onSuccess = payload => {
      if (String(payload?.messageId) === targetId) {
        cleanup();
        resolve({ status: 200, ...payload });
      }
    };
    const onError = payload => {
      cleanup();
      resolve({ status: payload?.status || 500, message: payload?.message || "read_message error" });
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message_read_success", onSuccess);
      socket.off("error", onError);
    };

    socket.on("message_read_success", onSuccess);
    socket.once("error", onError);
    socket.emit("read_message", roomId, messageId);
  });
}

function attachBroadcastListeners(socket, clientRef) {
  socket.on("message_new", message => {
    if (!clientRef.active) return;
    const content = typeof message?.content === "string" ? message.content : "";
    const key = content || (message?.imageUrl ? `img:${message.imageUrl}` : "");
    recordBroadcastArrival("create", key);
  });

  socket.on("update_message", message => {
    if (!clientRef.active) return;
    const content = typeof message?.content === "string" ? message.content : "";
    recordBroadcastArrival("update", content);
  });

  socket.on("delete_message", messageId => {
    if (!clientRef.active) return;
    recordBroadcastArrival("delete", messageId ? String(messageId) : "");
  });

  socket.on("readUpdate_message", payload => {
    if (!clientRef.active || !payload) return;
    const key = `${payload.room_id}:${payload.user_id}:${payload.lastReadMessageId}`;
    recordBroadcastArrival("read", key);
  });
}

async function connectSocket({ username, clientIndex, scenario, authToken = null, cachedUserId = null }) {
  const socketOpts = {
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    timeout: CONFIG.connectTimeoutMs,
  };
  if (authToken) {
    socketOpts.auth = { token: authToken };
  }

  const socket = io(CONFIG.url, socketOpts);
  const clientRef = { active: false };
  attachBroadcastListeners(socket, clientRef);

  const connectStarted = performance.now();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Socket connection timed out")),
        CONFIG.connectTimeoutMs
      );
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("connect_error", err => {
        clearTimeout(timer);
        reject(err);
      });
    });
    const connectMs = performance.now() - connectStarted;

    let loginMs = 0;
    let token = authToken;
    let userId = cachedUserId;

    if (!authToken) {
      const loginStarted = performance.now();
      const loginRes = await emitAck(socket, "user:login", {
        username,
        password: CONFIG.password,
      });
      loginMs = performance.now() - loginStarted;
      if (loginRes.status !== 200 || !loginRes.token) {
        socket.disconnect();
        const err = new Error(
          `Login failed for ${username}: ${loginRes.message || `status ${loginRes.status}`}`
        );
        err.stage = "login";
        throw err;
      }
      token = loginRes.token;
      userId = String(loginRes.user?.id || loginRes.user?._id || "");
    }

    return Object.assign(clientRef, {
      socket,
      username,
      userId,
      token,
      clientIndex,
      scenario,
      connectMs,
      loginMs,
      joinRoomMs: 0,
      roomId: null,
      roomName: null,
      // Pools owned exclusively by this socket to avoid cross-socket delete races:
      ownedMessageIds: [],       // for update & isolated delete phases
      updatableMessageIds: [],   // live owned messages in mixed phase
      deletableMessageIds: [],   // owned messages reserved for delete in mixed phase
      readMessageIds: new Set(), // messages this socket already marked as read
      updateCursor: 0,
      displayCursor: 0,
      readCursor: 0,
    });
  } catch (error) {
    socket.disconnect();
    if (!error.stage) error.stage = "connect";
    throw error;
  }
}

async function createRoom(client, roomName) {
  const res = await emitAck(client.socket, "room:create", {
    name: roomName,
    description: `Message controller benchmark ${runId}`,
    isPrivate: false,
  });
  if (res.status !== 200 || !res.room_id) {
    throw new Error(`Room creation failed (${roomName}): ${res.message || JSON.stringify(res)}`);
  }
  client.roomId = String(res.room_id);
  client.roomName = roomName;
  return {
    roomId: client.roomId,
    roomName,
    inviteCode: res.inviteCode,
    ownerClient: client,
  };
}

async function joinRoomByInvite(client, inviteCode) {
  const res = await emitAck(client.socket, "room:join", { inviteCode });
  if ((res.status !== 200 && res.status !== 409) || !res.room_id) {
    throw new Error(`Room join failed for ${client.username}: ${res.message || JSON.stringify(res)}`);
  }
  client.roomId = String(res.room_id);
}

async function joinSocketRoom(client) {
  if (!client.roomId) throw new Error(`No room assigned to ${client.username}`);
  const started = performance.now();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`join_room did not confirm for ${client.username} / ${client.roomId}`));
    }, 8_000);
    const done = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      client.socket.off("room_members", done);
      client.socket.off("message_display", done);
    };
    client.socket.once("room_members", done);
    client.socket.once("message_display", done);
    client.socket.emit("join_room", { room_id: client.roomId });
  });
  client.joinRoomMs = performance.now() - started;
}

// ─────────────────────────────────────────────────────────────────────────────
// Room State Pool Helpers
// ─────────────────────────────────────────────────────────────────────────────

function addLiveRoomMessage(roomLiveMap, roomId, entry) {
  let list = roomLiveMap.get(roomId);
  if (!list) {
    list = [];
    roomLiveMap.set(roomId, list);
  }
  list.push(entry);
  if (list.length > MAX_ROOM_LIVE_MESSAGES) {
    list.splice(0, list.length - MAX_ROOM_LIVE_MESSAGES);
  }
}

function removeLiveRoomMessage(roomLiveMap, roomId, messageId) {
  const list = roomLiveMap.get(roomId);
  if (!list) return;
  const idx = list.findIndex(m => m.messageId === messageId);
  if (idx !== -1) list.splice(idx, 1);
}

function pickMessageToRead(client, roomLiveMap) {
  const list = roomLiveMap.get(client.roomId);
  if (!list || !list.length) return null;

  // Prefer an unread message from another user (triggers readBy.push + save)
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    if (item.senderId !== client.userId && !client.readMessageIds.has(item.messageId)) {
      return { messageId: item.messageId, isFirstRead: true };
    }
  }
  // Next prefer any unread message in the room (single-room first read)
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    if (!client.readMessageIds.has(item.messageId)) {
      return { messageId: item.messageId, isFirstRead: true };
    }
  }
  // Fall back to cycling existing live messages (idempotent repeat read)
  const item = list[client.readCursor++ % list.length];
  return { messageId: item.messageId, isFirstRead: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight Verification of All 15 Registered Message Socket Routes & Aliases
// ─────────────────────────────────────────────────────────────────────────────

async function verifyAllMessageRoutes() {
  console.log("\n=== Pre-flight Verification: All 15 message.Router.js Socket Events ===");
  const c1 = await connectSocket({ username: CONFIG.usernames[0], clientIndex: 0, scenario: "verify" });
  const c2 = await connectSocket({ username: CONFIG.usernames[1], clientIndex: 1, scenario: "verify" });
  const report = [];
  let verifyRoom = null;

  const check = async (event, category, fn) => {
    const started = performance.now();
    try {
      const detail = await fn();
      const latencyMs = Number((performance.now() - started).toFixed(2));
      report.push({ event, category, ok: true, latencyMs, ...detail });
      console.log(`  [PASS] ${event.padEnd(18)} (${category.padEnd(7)}) ${latencyMs} ms`);
    } catch (err) {
      const latencyMs = Number((performance.now() - started).toFixed(2));
      report.push({ event, category, ok: false, latencyMs, error: err.message });
      console.log(`  [FAIL] ${event.padEnd(18)} (${category.padEnd(7)}) ${err.message}`);
    }
  };

  try {
    verifyRoom = await createRoom(c1, `bench-verify-${runId}`);
    await joinRoomByInvite(c2, verifyRoom.inviteCode);
    const roomId = verifyRoom.roomId;
    const createdIds = [];

    // 1. Create routes (4 aliases)
    const createCases = [
      { event: "message:create", payload: { roomId, content: `verify-create-${runId}`, type: "text" } },
      { event: "message:send", payload: { roomId, content: `verify-send-${runId}`, type: "text" } },
      {
        event: "message_send",
        payload: {
          roomId,
          content: `verify-mixed-${runId}`,
          imageUrl: `https://example.com/bench-${runId}.png`,
          type: "mixed",
        },
      },
      {
        event: "create_message",
        payload: {
          roomId,
          imageUrl: `https://example.com/bench-img-${runId}.png`,
          type: "image",
        },
      },
    ];

    for (const tc of createCases) {
      await check(tc.event, "create", async () => {
        const res = await emitAck(c1.socket, tc.event, tc.payload);
        if (res.status !== 201 || !res.data?._id) {
          throw new Error(`Expected 201 with data._id, got ${JSON.stringify(res)}`);
        }
        createdIds.push(String(res.data._id));
        return { status: res.status };
      });
    }

    // 2. Display routes (3 aliases — object & string payloads)
    const displayCases = [
      { event: "message:display", payload: { roomId, limit: 60 } },
      { event: "display_message", payload: roomId },
      { event: "message_display", payload: { roomId, limit: 100 } },
    ];

    for (const tc of displayCases) {
      await check(tc.event, "display", async () => {
        const res = await emitAck(c2.socket, tc.event, tc.payload);
        if (res.status !== 200 || !Array.isArray(res.messages)) {
          throw new Error(`Expected 200 with messages[], got ${JSON.stringify(res)}`);
        }
        return { status: res.status, messageCount: res.messages.length };
      });
    }

    // 3. Update routes (3 aliases)
    const updateCases = [
      { event: "message:update", payload: { roomId, messageId: createdIds[0], content: `verify-upd-1-${runId}` } },
      { event: "update_message", payload: { roomId, messageId: createdIds[1], content: `verify-upd-2-${runId}`, type: "text" } },
      { event: "message_update", payload: { roomId, messageId: createdIds[2], content: `verify-upd-3-${runId}` } },
    ];

    for (const tc of updateCases) {
      await check(tc.event, "update", async () => {
        const res = await emitAck(c1.socket, tc.event, tc.payload);
        if (res.status !== 200) {
          throw new Error(`Expected 200, got ${JSON.stringify(res)}`);
        }
        return { status: res.status };
      });
    }

    // 4. Read routes (2 aliases: object+ack & positional+event)
    await check("message:read", "read", async () => {
      const res = await emitAck(c2.socket, "message:read", { roomId, messageId: createdIds[0] });
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${JSON.stringify(res)}`);
      }
      return { status: res.status };
    });

    await check("read_message", "read", async () => {
      const res = await emitReadPositional(c2.socket, roomId, createdIds[1]);
      if (res.status !== 200) {
        throw new Error(`Expected 200 via message_read_success, got ${JSON.stringify(res)}`);
      }
      return { status: res.status };
    });

    // 5. Delete routes (3 aliases)
    const deleteCases = [
      { event: "message:delete", messageId: createdIds[0] },
      { event: "delete_message", messageId: createdIds[1] },
      { event: "message_delete", messageId: createdIds[2] },
    ];

    for (const tc of deleteCases) {
      await check(tc.event, "delete", async () => {
        const res = await emitAck(c1.socket, tc.event, { roomId, messageId: tc.messageId });
        if (res.status !== 200) {
          throw new Error(`Expected 200, got ${JSON.stringify(res)}`);
        }
        return { status: res.status };
      });
    }

    if (CONFIG.cleanupRooms && verifyRoom) {
      await emitAck(c1.socket, "room:remove", { name: verifyRoom.roomName }).catch(() => {});
    }
  } finally {
    c1.socket.disconnect();
    c2.socket.disconnect();
  }

  const passed = report.filter(r => r.ok).length;
  console.log(`Pre-flight alias verification: ${passed}/${report.length} routes passed.`);
  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual Route Operations (Timed & Instrumented)
// ─────────────────────────────────────────────────────────────────────────────

async function execCreateOp(client, tracker, roomLiveMap, { forMixed = false } = {}) {
  const seq = ++opSequence;
  const mod = seq % 20;
  let payload;
  let broadcastKey;

  if (mod === 0) {
    // 5% image-only payload
    const imageUrl = `https://bench.local/img/${runId}/${client.clientIndex}/${seq}.png`;
    payload = { roomId: client.roomId, imageUrl, type: "image" };
    broadcastKey = `img:${imageUrl}`;
  } else if (mod <= 2) {
    // 10% mixed payload (text + imageUrl)
    const content = `bench-mixed-${runId}-${client.clientIndex}-${seq}`;
    payload = {
      roomId: client.roomId,
      content,
      imageUrl: `https://bench.local/img/${runId}/${client.clientIndex}/${seq}.png`,
      type: "mixed",
    };
    broadcastKey = content;
  } else {
    // 85% text payload
    const content = `bench-txt-${runId}-${client.clientIndex}-${seq}`;
    payload = { roomId: client.roomId, content, type: "text" };
    broadcastKey = content;
  }

  trackPending("create", broadcastKey);
  const started = performance.now();
  try {
    const res = await emitAck(client.socket, "message:create", payload);
    const latency = performance.now() - started;
    const ok = res.status === 201 && Boolean(res.data?._id);
    recordAck(tracker, ok, latency, res.status, ok ? null : res.message || `status ${res.status}`);

    if (ok) {
      const messageId = String(res.data._id);
      if (forMixed) {
        // Partition mixed messages so delete never races with update/read on other sockets
        if (seq % 4 === 0) {
          client.deletableMessageIds.push(messageId);
        } else {
          client.updatableMessageIds.push(messageId);
          if (client.updatableMessageIds.length > 50) client.updatableMessageIds.shift();
          addLiveRoomMessage(roomLiveMap, client.roomId, {
            messageId,
            senderId: client.userId,
          });
        }
      } else {
        client.ownedMessageIds.push(messageId);
        addLiveRoomMessage(roomLiveMap, client.roomId, {
          messageId,
          senderId: client.userId,
        });
      }
    }
    return ok;
  } catch (err) {
    recordAck(tracker, false, performance.now() - started, "timeout", err.message);
    return false;
  }
}

async function execDisplayOp(client, tracker) {
  const limits = [30, CONFIG.displayLimit, 100];
  const idx = client.displayCursor++;
  // Periodically send plain string roomId to cover string branch in messageDisplayRoute
  const payload =
    idx % 5 === 4
      ? client.roomId
      : { roomId: client.roomId, limit: limits[idx % limits.length] };

  const started = performance.now();
  try {
    const res = await emitAck(client.socket, "message:display", payload);
    const latency = performance.now() - started;
    const ok = res.status === 200 && Array.isArray(res.messages);
    recordAck(tracker, ok, latency, res.status, ok ? null : res.message || `status ${res.status}`);
    if (ok) {
      tracker.extra.totalMessagesReturned =
        (tracker.extra.totalMessagesReturned || 0) + res.messages.length;
    }
    return ok;
  } catch (err) {
    recordAck(tracker, false, performance.now() - started, "timeout", err.message);
    return false;
  }
}

async function execUpdateOp(client, tracker, poolKey = "ownedMessageIds") {
  const pool = client[poolKey];
  if (!pool || !pool.length) return false;
  const messageId = pool[client.updateCursor++ % pool.length];
  const seq = ++opSequence;
  const updatedContent = `bench-upd-${runId}-${client.clientIndex}-${seq}`;
  const payload =
    seq % 3 === 0
      ? { roomId: client.roomId, messageId, content: updatedContent, type: "text" }
      : { roomId: client.roomId, messageId, content: updatedContent };

  trackPending("update", updatedContent);
  const started = performance.now();
  try {
    const res = await emitAck(client.socket, "message:update", payload);
    const latency = performance.now() - started;
    const ok = res.status === 200;
    recordAck(tracker, ok, latency, res.status, ok ? null : res.message || `status ${res.status}`);
    return ok;
  } catch (err) {
    recordAck(tracker, false, performance.now() - started, "timeout", err.message);
    return false;
  }
}

async function execReadOp(client, tracker, roomLiveMap) {
  const target = pickMessageToRead(client, roomLiveMap);
  if (!target) return false;

  const { messageId, isFirstRead } = target;
  const seq = ++opSequence;
  const usePositional = seq % 5 === 0; // 20% positional read_message, 80% ack message:read
  const broadcastKey = `${client.roomId}:${client.userId}:${messageId}`;
  trackPending("read", broadcastKey);

  const started = performance.now();
  try {
    const res = usePositional
      ? await emitReadPositional(client.socket, client.roomId, messageId)
      : await emitAck(client.socket, "message:read", { roomId: client.roomId, messageId });
    const latency = performance.now() - started;
    const ok = res.status === 200;
    recordAck(tracker, ok, latency, res.status, ok ? null : res.message || `status ${res.status}`);
    if (ok) {
      client.readMessageIds.add(messageId);
      if (client.readMessageIds.size > 2_000) {
        client.readMessageIds.clear();
      }
      if (isFirstRead) {
        tracker.extra.firstTimeReads = (tracker.extra.firstTimeReads || 0) + 1;
      } else {
        tracker.extra.repeatReads = (tracker.extra.repeatReads || 0) + 1;
      }
      if (usePositional) {
        tracker.extra.positionalRouteOps = (tracker.extra.positionalRouteOps || 0) + 1;
      } else {
        tracker.extra.ackRouteOps = (tracker.extra.ackRouteOps || 0) + 1;
      }
    }
    return ok;
  } catch (err) {
    recordAck(tracker, false, performance.now() - started, "timeout", err.message);
    return false;
  }
}

async function mintOwnedMessage(client) {
  const seq = ++opSequence;
  const res = await emitAck(client.socket, "message:create", {
    roomId: client.roomId,
    content: `bench-seed-${runId}-${client.clientIndex}-${seq}`,
    type: "text",
  });
  if (res.status === 201 && res.data?._id) {
    return String(res.data._id);
  }
  return null;
}

async function execDeleteOp(client, tracker, roomLiveMap, poolKey = "ownedMessageIds") {
  const pool = client[poolKey];
  let messageId = pool && pool.length ? pool.pop() : null;

  if (!messageId) {
    // Replenish a fresh owned message outside the delete latency timer
    try {
      messageId = await mintOwnedMessage(client);
      if (messageId) {
        tracker.extra.replenishCreates = (tracker.extra.replenishCreates || 0) + 1;
      }
    } catch {
      return false;
    }
    if (!messageId) return false;
  } else {
    removeLiveRoomMessage(roomLiveMap, client.roomId, messageId);
  }

  trackPending("delete", messageId);
  const started = performance.now();
  try {
    const res = await emitAck(client.socket, "message:delete", {
      roomId: client.roomId,
      messageId,
    });
    const latency = performance.now() - started;
    const ok = res.status === 200;
    recordAck(tracker, ok, latency, res.status, ok ? null : res.message || `status ${res.status}`);
    return ok;
  } catch (err) {
    recordAck(tracker, false, performance.now() - started, "timeout", err.message);
    return false;
  }
}

function buildWeightedPicker(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  return () => {
    let r = Math.random() * total;
    for (const [op, w] of entries) {
      r -= w;
      if (r <= 0) return op;
    }
    return entries[entries.length - 1][0];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase Execution Engine
// ─────────────────────────────────────────────────────────────────────────────

async function ensureRoomSeedMessages(clients, roomLiveMap, minPerRoom) {
  // Group clients by roomId so we only seed rooms that are under-populated
  const roomToClients = new Map();
  for (const c of clients) {
    if (!roomToClients.has(c.roomId)) roomToClients.set(c.roomId, []);
    roomToClients.get(c.roomId).push(c);
  }

  for (const [roomId, roomClients] of roomToClients.entries()) {
    const existing = roomLiveMap.get(roomId)?.length || 0;
    const needed = Math.max(0, minPerRoom - existing);
    if (needed === 0) continue;

    // Seed in modest parallel batches across clients in that room
    const batch = 10;
    let seeded = 0;
    while (seeded < needed && !aborted) {
      const count = Math.min(batch, needed - seeded);
      const jobs = [];
      for (let i = 0; i < count; i++) {
        const c = roomClients[(seeded + i) % roomClients.length];
        jobs.push(
          mintOwnedMessage(c)
            .then(messageId => {
              if (messageId) {
                c.ownedMessageIds.push(messageId);
                addLiveRoomMessage(roomLiveMap, roomId, { messageId, senderId: c.userId });
              }
            })
            .catch(() => {})
        );
      }
      await Promise.all(jobs);
      seeded += count;
    }
  }
}

async function ensureEachClientOwnsMessage(clients, poolKey, minCount = 1) {
  const needy = clients.filter(c => c[poolKey].length < minCount);
  if (!needy.length) return;
  for (let i = 0; i < needy.length; i += CONFIG.batchSize) {
    const slice = needy.slice(i, i + CONFIG.batchSize);
    await Promise.all(
      slice.map(async c => {
        while (c[poolKey].length < minCount && !aborted) {
          const messageId = await mintOwnedMessage(c).catch(() => null);
          if (!messageId) break;
          c[poolKey].push(messageId);
        }
      })
    );
  }
}

async function runRoutePhase({ scenario, stageIndex, targetUsers, route, clients, roomLiveMap, rampMetrics }) {
  clearPendingBroadcasts();

  // Pre-conditions per route (untracked setup so measured phase stays pure)
  if (route === "display") {
    await ensureRoomSeedMessages(clients, roomLiveMap, CONFIG.seedMessages);
  } else if (route === "update") {
    await ensureEachClientOwnsMessage(clients, "ownedMessageIds", 1);
  } else if (route === "read") {
    await ensureRoomSeedMessages(clients, roomLiveMap, Math.min(CONFIG.seedMessages, 25));
  } else if (route === "mixed") {
    await ensureRoomSeedMessages(clients, roomLiveMap, Math.min(CONFIG.seedMessages, 20));
    await ensureEachClientOwnsMessage(clients, "updatableMessageIds", 1);
    await ensureEachClientOwnsMessage(clients, "deletableMessageIds", 1);
  }

  const trackers = {
    create: createOpTracker(),
    display: createOpTracker(),
    update: createOpTracker(),
    read: createOpTracker(),
    delete: createOpTracker(),
    overall: createOpTracker(),
  };

  activePhase = { route, trackers };

  // Capture & reset server + client telemetry right before measured phase begins
  const serverBefore = await fetchServerMetricsSnapshot({ reset: true });
  const clientBefore = captureClientSnapshot({ reset: true });

  // Synchronized cold/burst wave for display phase to measure stampede / lock contention
  let displayBurstSummary = null;
  if (route === "display") {
    const burstTracker = createOpTracker();
    const burstStart = performance.now();
    await Promise.all(clients.map(c => execDisplayOp(c, burstTracker)));
    const burstElapsedSec = Math.max((performance.now() - burstStart) / 1000, 0.001);
    displayBurstSummary = finalizeOpTracker(burstTracker, burstElapsedSec);
  }

  const pickMixedOp = route === "mixed" ? buildWeightedPicker(CONFIG.mixedWeights) : null;
  let running = true;
  const phaseStart = performance.now();

  const workers = clients.map(client =>
    (async () => {
      // Stagger worker starts to simulate steady concurrent traffic
      await sleep(Math.floor(Math.random() * Math.min(CONFIG.opIntervalMs, 500)));

      while (running && !aborted) {
        if (route === "create") {
          await execCreateOp(client, trackers.create, roomLiveMap, { forMixed: false });
        } else if (route === "display") {
          await execDisplayOp(client, trackers.display);
        } else if (route === "update") {
          await execUpdateOp(client, trackers.update, "ownedMessageIds");
        } else if (route === "read") {
          await execReadOp(client, trackers.read, roomLiveMap);
        } else if (route === "delete") {
          await execDeleteOp(client, trackers.delete, roomLiveMap, "ownedMessageIds");
        } else if (route === "mixed") {
          let chosen = pickMixedOp();
          if (chosen === "update" && !client.updatableMessageIds.length) chosen = "create";
          if (chosen === "delete" && !client.deletableMessageIds.length) chosen = "create";
          if (chosen === "read" && !(roomLiveMap.get(client.roomId)?.length)) chosen = "create";

          const opTracker = trackers[chosen];
          const beforeSuccess = opTracker.success;
          const beforeFailure = opTracker.failure;
          const opStart = performance.now();

          if (chosen === "create") {
            await execCreateOp(client, opTracker, roomLiveMap, { forMixed: true });
          } else if (chosen === "display") {
            await execDisplayOp(client, opTracker);
          } else if (chosen === "update") {
            await execUpdateOp(client, opTracker, "updatableMessageIds");
          } else if (chosen === "read") {
            await execReadOp(client, opTracker, roomLiveMap);
          } else if (chosen === "delete") {
            await execDeleteOp(client, opTracker, roomLiveMap, "deletableMessageIds");
          }

          const opElapsed = performance.now() - opStart;
          const succeeded = opTracker.success > beforeSuccess;
          const failed = opTracker.failure > beforeFailure;
          if (succeeded || failed) {
            recordAck(trackers.overall, succeeded, opElapsed, succeeded ? chosen : `${chosen}:err`);
          }
        }

        if (!running || aborted) break;
        await sleep(CONFIG.opIntervalMs);
      }
    })()
  );

  // Sleep for configured phase duration (in 250ms ticks so Ctrl+C responds promptly)
  const deadline = Date.now() + CONFIG.stageMs;
  while (Date.now() < deadline && !aborted) {
    await sleep(Math.min(250, deadline - Date.now()));
  }
  running = false;
  await Promise.allSettled(workers);

  // Brief grace period for trailing broadcast deliveries
  await sleep(150);
  const actualDurationSec = Number(((performance.now() - phaseStart) / 1000).toFixed(2));
  activePhase = null;

  const [serverAfter, clientAfter] = [
    await fetchServerMetricsSnapshot({ reset: false }),
    captureClientSnapshot({ reset: false }),
  ];
  const serverMetrics = diffServerMetrics(serverBefore, serverAfter);
  const clientMetrics = diffClientMetrics(clientBefore, clientAfter);

  const primaryTracker = route === "mixed" ? trackers.overall : trackers[route];
  const primaryStats = finalizeOpTracker(primaryTracker, actualDurationSec);

  if (route === "display" && primaryTracker.success > 0) {
    primaryStats.avgMessagesReturned = Number(
      ((primaryTracker.extra.totalMessagesReturned || 0) / primaryTracker.success).toFixed(1)
    );
  }

  const phaseResult = {
    scenario,
    singleRoomMode: scenario === "single-room" ? CONFIG.singleRoomMode : null,
    stage: stageIndex + 1,
    targetUsers,
    concurrentUsers: clients.length,
    route,
    durationSeconds: actualDurationSec,
    ...primaryStats,
    rampMetrics,
    serverMetrics,
    clientMetrics,
  };

  if (displayBurstSummary) {
    phaseResult.displayBurst = displayBurstSummary;
  }

  if (route === "mixed") {
    phaseResult.byRoute = {
      create: finalizeOpTracker(trackers.create, actualDurationSec),
      display: finalizeOpTracker(trackers.display, actualDurationSec),
      update: finalizeOpTracker(trackers.update, actualDurationSec),
      read: finalizeOpTracker(trackers.read, actualDurationSec),
      delete: finalizeOpTracker(trackers.delete, actualDurationSec),
    };
  }

  // Console summary for this phase
  const burstNote = displayBurstSummary
    ? ` | burst p95: ${displayBurstSummary.ackLatencyMs.p95 ?? "n/a"} ms`
    : "";
  const deliveryNote =
    primaryStats.deliveries > 0
      ? ` | deliveries: ${primaryStats.deliveries} (p95: ${primaryStats.deliveryLatencyMs.p95 ?? "n/a"} ms)`
      : "";
  console.log(
    `    [${route.padEnd(7)}] ok=${primaryStats.success} err=${primaryStats.failure} ` +
      `(${primaryStats.errorRatePct}%) | ${primaryStats.opsPerSecond} ops/s | ` +
      `ack p50=${primaryStats.ackLatencyMs.p50 ?? "n/a"} p95=${primaryStats.ackLatencyMs.p95 ?? "n/a"} ` +
      `p99=${primaryStats.ackLatencyMs.p99 ?? "n/a"} ms${deliveryNote}${burstNote}`
  );
  if (serverMetrics) {
    const appCacheStr =
      serverMetrics.cache.appHitRatioPct !== null
        ? `${serverMetrics.cache.appHitRatioPct}% (${serverMetrics.cache.appHits}H/${serverMetrics.cache.appMisses}M/${serverMetrics.cache.appFallbacks}FB)`
        : "n/a";
    const redisCacheStr =
      serverMetrics.cache.redis?.hitRatioPct !== null && serverMetrics.cache.redis?.hitRatioPct !== undefined
        ? `${serverMetrics.cache.redis.hitRatioPct}%`
        : "n/a";
    const dbQpsStr = serverMetrics.database.queriesPerSecond ?? "n/a";
    const dbLoadStr = serverMetrics.database.dbLoadFactor ?? "n/a";
    const dbP95Str = serverMetrics.database.queryLatencyMs?.p95 ?? "n/a";
    const cpuStr = `${serverMetrics.cpu.processCpuPct ?? "n/a"}% (sys ${serverMetrics.cpu.systemCpuPct ?? "n/a"}%)`;
    const memStr = `${serverMetrics.memory.rssMB ?? "n/a"}MB RSS / ${serverMetrics.memory.heapUsedPct ?? "n/a"}% heap`;
    const elStr = `p50=${serverMetrics.eventLoopLagMs?.p50 ?? "n/a"} p95=${serverMetrics.eventLoopLagMs?.p95 ?? "n/a"} p99=${serverMetrics.eventLoopLagMs?.p99 ?? "n/a"} ms`;
    console.log(
      `              sys: CPU=${cpuStr} | Mem=${memStr} | EL-lag ${elStr} | ` +
        `DB QPS=${dbQpsStr} load=${dbLoadStr} p95=${dbP95Str}ms | AppCache=${appCacheStr} RedisHit=${redisCacheStr}`
    );
  }

  return phaseResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario Orchestration (shared-room & single-room)
// ─────────────────────────────────────────────────────────────────────────────

async function setupScenario(scenario) {
  const setupClients = [];
  const accountTokens = [];
  const createdRooms = []; // tracked for optional cleanup

  for (let i = 0; i < CONFIG.usernames.length; i++) {
    const client = await connectSocket({
      username: CONFIG.usernames[i],
      clientIndex: i,
      scenario,
    });
    setupClients.push(client);
    accountTokens[i] = { token: client.token, userId: client.userId };
  }

  const roomsByAccount = [];
  if (scenario === "shared-room") {
    const created = await createRoom(setupClients[0], `bench-msg-${runId}-shared`);
    createdRooms.push(created);
    for (let i = 0; i < setupClients.length; i++) {
      roomsByAccount[i] = { roomId: created.roomId, inviteCode: created.inviteCode };
    }
    for (let i = 1; i < setupClients.length; i++) {
      await joinRoomByInvite(setupClients[i], created.inviteCode);
    }
  } else {
    // single-room: each account starts with its own isolated room
    for (let i = 0; i < setupClients.length; i++) {
      const created = await createRoom(setupClients[i], `bench-msg-${runId}-single-a${i + 1}`);
      createdRooms.push(created);
      roomsByAccount[i] = { roomId: created.roomId, inviteCode: created.inviteCode };
    }
  }

  return { clients: setupClients, accountTokens, roomsByAccount, createdRooms };
}

async function addClient(index, scenario, accountTokens, roomsByAccount, createdRooms) {
  const accountIndex = index % CONFIG.usernames.length;
  const authInfo = CONFIG.authMode === "token" ? accountTokens[accountIndex] : null;
  const client = await connectSocket({
    username: CONFIG.usernames[accountIndex],
    clientIndex: index,
    scenario,
    authToken: authInfo?.token || null,
    cachedUserId: authInfo?.userId || null,
  });

  if (scenario === "single-room" && CONFIG.singleRoomMode === "per-socket") {
    // Dedicated room per socket (strictly 1 socket per room at all concurrency stages)
    const created = await createRoom(client, `bench-msg-${runId}-single-s${index}`);
    createdRooms.push(created);
    // room:create already calls socket.join(room._id.toString())
  } else {
    client.roomId = roomsByAccount[accountIndex].roomId;
    try {
      await joinSocketRoom(client);
    } catch (err) {
      client.socket.disconnect();
      err.stage = "join_room";
      throw err;
    }
  }

  return client;
}

async function runScenario(scenario) {
  const modeLabel =
    scenario === "single-room" ? `single-room (${CONFIG.singleRoomMode})` : "shared-room";
  console.log(`\n======================================================================`);
  console.log(`SCENARIO: ${modeLabel}`);
  console.log(`======================================================================`);

  const { clients, accountTokens, roomsByAccount, createdRooms } = await setupScenario(scenario);
  const roomLiveMap = new Map();
  const scenarioResults = [];
  let nextClientIndex = clients.length;

  try {
    for (let stageIndex = 0; stageIndex < CONFIG.stages.length && !aborted; stageIndex++) {
      const target = CONFIG.stages[stageIndex];
      const connSamples = [];
      const loginSamples = [];
      const joinSamples = [];
      const rampFailures = { connect: 0, login: 0, joinRoom: 0 };

      if (stageIndex === 0) {
        for (const c of clients) {
          connSamples.push(c.connectMs);
          if (c.loginMs > 0) loginSamples.push(c.loginMs);
        }
      }

      while (clients.length < target && !aborted) {
        const count = Math.min(CONFIG.batchSize, target - clients.length);
        const batchIndices = [];
        for (let i = 0; i < count; i++) batchIndices.push(nextClientIndex++);

        const settled = await Promise.allSettled(
          batchIndices.map(idx =>
            addClient(idx, scenario, accountTokens, roomsByAccount, createdRooms)
          )
        );

        let batchSuccess = 0;
        for (const item of settled) {
          if (item.status === "fulfilled") {
            const c = item.value;
            clients.push(c);
            connSamples.push(c.connectMs);
            if (c.loginMs > 0) loginSamples.push(c.loginMs);
            if (c.joinRoomMs > 0) joinSamples.push(c.joinRoomMs);
            batchSuccess++;
          } else {
            const stage = item.reason?.stage;
            if (stage === "login") rampFailures.login++;
            else if (stage === "join_room") rampFailures.joinRoom++;
            else rampFailures.connect++;
          }
        }

        // Prevent infinite loop if server refuses all connections in a batch
        if (batchSuccess === 0) {
          console.warn(
            `  [WARN] Batch failed completely at ${clients.length}/${target} sockets; continuing with active sockets.`
          );
          break;
        }
      }

      const rampMetrics = {
        newSocketsAdded: connSamples.length,
        failures: rampFailures,
        connectionLatencyMs: summarizeSamples(connSamples),
        loginLatencyMs: summarizeSamples(loginSamples),
        joinRoomLatencyMs: summarizeSamples(joinSamples),
      };

      const activeClients = clients.slice(0, Math.min(target, clients.length));
      for (const c of clients) c.active = false;
      for (const c of activeClients) c.active = true;

      const activeRooms = new Set(activeClients.map(c => c.roomId)).size;
      console.log(
        `\n  Stage ${stageIndex + 1}/${CONFIG.stages.length}: ` +
          `${activeClients.length}/${target} concurrent sockets across ${activeRooms} room(s) ` +
          `(${(CONFIG.stageMs / 1000).toFixed(0)}s per route phase)`
      );

      for (const route of CONFIG.routes) {
        if (aborted) break;
        const result = await runRoutePhase({
          scenario,
          stageIndex,
          targetUsers: target,
          route,
          clients: activeClients,
          roomLiveMap,
          rampMetrics,
        });
        scenarioResults.push(result);
      }
    }
  } finally {
    for (const c of clients) c.active = false;
    if (CONFIG.cleanupRooms && createdRooms.length) {
      console.log(`  Cleaning up ${createdRooms.length} benchmark room(s)...`);
      for (let i = 0; i < createdRooms.length; i += CONFIG.batchSize) {
        const slice = createdRooms.slice(i, i + CONFIG.batchSize);
        await Promise.allSettled(
          slice.map(room =>
            room.ownerClient?.socket?.connected
              ? emitAck(room.ownerClient.socket, "room:remove", { name: room.roomName })
              : Promise.resolve()
          )
        );
      }
    }
    for (const c of clients) {
      try {
        c.socket.disconnect();
      } catch {
        // ignore
      }
    }
  }

  return scenarioResults;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Serializers (JSON, CSV, Markdown)
// ─────────────────────────────────────────────────────────────────────────────

function toCsv(rows) {
  const headers = [
    "scenario",
    "singleRoomMode",
    "stage",
    "targetUsers",
    "concurrentUsers",
    "route",
    "durationSeconds",
    "success",
    "failure",
    "errorRatePct",
    "opsPerSecond",
    "deliveries",
    "deliveriesPerSecond",
    "ackMinMs",
    "ackAvgMs",
    "ackP50Ms",
    "ackP90Ms",
    "ackP95Ms",
    "ackP99Ms",
    "ackMaxMs",
    "deliveryP50Ms",
    "deliveryP95Ms",
    "deliveryP99Ms",
    "displayBurstP95Ms",
    "connectP95Ms",
    "loginP95Ms",
    "joinRoomP95Ms",
    "cacheHitRatioPct",
    "appCacheHitRatioPct",
    "redisCacheHitRatioPct",
    "appCacheHits",
    "appCacheMisses",
    "appCacheFallbacks",
    "dbQueriesPerSecond",
    "dbLoadFactor",
    "dbPeakInFlight",
    "dbQueryAvgMs",
    "dbQueryP95Ms",
    "serverProcessCpuPct",
    "serverNormalizedCpuPct",
    "serverSystemCpuPct",
    "serverRssMB",
    "serverPeakRssMB",
    "serverHeapUsedMB",
    "serverHeapUsedPct",
    "serverSystemMemUsedPct",
    "eventLoopLagMeanMs",
    "eventLoopLagP50Ms",
    "eventLoopLagP95Ms",
    "eventLoopLagP99Ms",
    "eventLoopLagMaxMs",
  ];

  const lines = rows.map(r => {
    const sm = r.serverMetrics;
    return [
      r.scenario,
      r.singleRoomMode ?? "",
      r.stage,
      r.targetUsers,
      r.concurrentUsers,
      r.route,
      r.durationSeconds,
      r.success,
      r.failure,
      r.errorRatePct,
      r.opsPerSecond,
      r.deliveries,
      r.deliveriesPerSecond,
      r.ackLatencyMs.min,
      r.ackLatencyMs.avg,
      r.ackLatencyMs.p50,
      r.ackLatencyMs.p90,
      r.ackLatencyMs.p95,
      r.ackLatencyMs.p99,
      r.ackLatencyMs.max,
      r.deliveryLatencyMs.p50,
      r.deliveryLatencyMs.p95,
      r.deliveryLatencyMs.p99,
      r.displayBurst?.ackLatencyMs?.p95 ?? "",
      r.rampMetrics?.connectionLatencyMs?.p95 ?? "",
      r.rampMetrics?.loginLatencyMs?.p95 ?? "",
      r.rampMetrics?.joinRoomLatencyMs?.p95 ?? "",
      sm?.cache?.effectiveHitRatioPct ?? "",
      sm?.cache?.appHitRatioPct ?? "",
      sm?.cache?.redis?.hitRatioPct ?? "",
      sm?.cache?.appHits ?? "",
      sm?.cache?.appMisses ?? "",
      sm?.cache?.appFallbacks ?? "",
      sm?.database?.queriesPerSecond ?? "",
      sm?.database?.dbLoadFactor ?? "",
      sm?.database?.peakInFlightQueries ?? "",
      sm?.database?.queryLatencyMs?.avg ?? "",
      sm?.database?.queryLatencyMs?.p95 ?? "",
      sm?.cpu?.processCpuPct ?? "",
      sm?.cpu?.processCpuNormalizedPct ?? "",
      sm?.cpu?.systemCpuPct ?? "",
      sm?.memory?.rssMB ?? "",
      sm?.memory?.peakRssMB ?? "",
      sm?.memory?.heapUsedMB ?? "",
      sm?.memory?.heapUsedPct ?? "",
      sm?.memory?.systemMemUsedPct ?? "",
      sm?.eventLoopLagMs?.mean ?? "",
      sm?.eventLoopLagMs?.p50 ?? "",
      sm?.eventLoopLagMs?.p95 ?? "",
      sm?.eventLoopLagMs?.p99 ?? "",
      sm?.eventLoopLagMs?.max ?? "",
    ]
      .map(v => v ?? "")
      .join(",");
  });

  return [headers.join(","), ...lines].join("\n");
}

function toMarkdown(payload) {
  const lines = [];
  lines.push(`# DARC Message Controller Benchmark Report`);
  lines.push("");
  lines.push(`- **Target:** \`${payload.meta.target}\``);
  lines.push(`- **Started:** ${payload.meta.startedAt}`);
  lines.push(`- **Completed:** ${payload.meta.completedAt}`);
  lines.push(`- **Stages:** ${payload.meta.stages.join(" -> ")} concurrent sockets`);
  lines.push(`- **Scenarios:** ${payload.meta.scenarios.join(", ")} (single-room mode: \`${payload.meta.singleRoomMode}\`)`);
  lines.push(`- **Routes:** ${payload.meta.routes.join(", ")}`);
  lines.push(`- **Phase Duration:** ${payload.meta.stageDurationMs / 1000}s | **Op Interval:** ${payload.meta.opIntervalMs}ms | **Auth Mode:** \`${payload.meta.authMode}\``);
  lines.push("");

  if (payload.aliasVerification?.length) {
    lines.push("## Pre-Flight Route & Alias Verification (15 Socket Events)");
    lines.push("");
    lines.push("| Event | Category | Result | Latency (ms) | Notes |");
    lines.push("|---|---|---|---|---|");
    for (const item of payload.aliasVerification) {
      const note = item.ok
        ? item.messageCount !== undefined
          ? `status=${item.status}, messages=${item.messageCount}`
          : `status=${item.status}`
        : item.error;
      lines.push(`| \`${item.event}\` | ${item.category} | ${item.ok ? "PASS" : "FAIL"} | ${item.latencyMs} | ${note} |`);
    }
    lines.push("");
  }

  for (const scenario of payload.meta.scenarios) {
    const rows = payload.results.filter(r => r.scenario === scenario);
    if (!rows.length) continue;

    lines.push(`## Scenario: \`${scenario}\``);
    lines.push("");
    lines.push("| Stage | Users | Route | Success | Fail | Err% | Ops/s | Ack p50 (ms) | Ack p95 (ms) | Ack p99 (ms) | Deliveries | Delivery p95 (ms) | Burst p95 (ms) |");
    lines.push("|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const r of rows) {
      lines.push(
        `| ${r.stage} | ${r.concurrentUsers} | \`${r.route}\` | ${r.success} | ${r.failure} | ${r.errorRatePct}% | ${r.opsPerSecond} | ` +
          `${r.ackLatencyMs.p50 ?? "-"} | ${r.ackLatencyMs.p95 ?? "-"} | ${r.ackLatencyMs.p99 ?? "-"} | ` +
          `${r.deliveries} | ${r.deliveryLatencyMs.p95 ?? "-"} | ${r.displayBurst?.ackLatencyMs?.p95 ?? "-"} |`
      );
    }
    lines.push("");

    const telemetryRows = rows.filter(r => r.serverMetrics);
    if (telemetryRows.length) {
      lines.push(`### System, Cache, Database & Event-Loop Telemetry (\`${scenario}\`)`);
      lines.push("");
      lines.push(
        "| Stage | Users | Route | App Cache Hit% | App H/M/FB | Redis Hit% | DB QPS | DB Load | Peak DB In-Flight | DB p95 (ms) | Proc CPU% | Sys CPU% | RSS / Peak (MB) | Heap% | Sys Mem% | EL Lag p50/p95/p99 (ms) |"
      );
      lines.push(
        "|---:|---:|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---|"
      );
      for (const r of telemetryRows) {
        const sm = r.serverMetrics;
        const appCachePct =
          sm.cache.appHitRatioPct !== null ? `${sm.cache.appHitRatioPct}%` : "-";
        const redisCachePct =
          sm.cache.redis?.hitRatioPct !== null && sm.cache.redis?.hitRatioPct !== undefined
            ? `${sm.cache.redis.hitRatioPct}%`
            : "-";
        const appHmfb = `${sm.cache.appHits}/${sm.cache.appMisses}/${sm.cache.appFallbacks}`;
        const rssPair = `${sm.memory.rssMB ?? "-"} / ${sm.memory.peakRssMB ?? "-"}`;
        const elTriple = `${sm.eventLoopLagMs?.p50 ?? "-"}/${sm.eventLoopLagMs?.p95 ?? "-"}/${sm.eventLoopLagMs?.p99 ?? "-"}`;
        lines.push(
          `| ${r.stage} | ${r.concurrentUsers} | \`${r.route}\` | ${appCachePct} | ${appHmfb} | ${redisCachePct} | ` +
            `${sm.database.queriesPerSecond ?? "-"} | ${sm.database.dbLoadFactor ?? "-"} | ` +
            `${sm.database.peakInFlightQueries ?? "-"} | ${sm.database.queryLatencyMs?.p95 ?? "-"} | ` +
            `${sm.cpu.processCpuPct ?? "-"}% | ${sm.cpu.systemCpuPct ?? "-"}% | ${rssPair} | ` +
            `${sm.memory.heapUsedPct ?? "-"}% | ${sm.memory.systemMemUsedPct ?? "-"}% | ${elTriple} |`
        );
      }
      lines.push("");
    }

    const mixedRows = rows.filter(r => r.route === "mixed" && r.byRoute);
    if (mixedRows.length) {
      lines.push(`### Mixed-Workload Per-Route Breakdown (\`${scenario}\`)`);
      lines.push("");
      lines.push("| Stage | Users | Sub-Route | Success | Fail | Ops/s | Ack p50 (ms) | Ack p95 (ms) | Ack p99 (ms) |");
      lines.push("|---:|---:|---|---:|---:|---:|---:|---:|---:|");
      for (const mr of mixedRows) {
        for (const sub of ["create", "display", "update", "read", "delete"]) {
          const s = mr.byRoute[sub];
          lines.push(
            `| ${mr.stage} | ${mr.concurrentUsers} | \`${sub}\` | ${s.success} | ${s.failure} | ${s.opsPerSecond} | ` +
              `${s.ackLatencyMs.p50 ?? "-"} | ${s.ackLatencyMs.p95 ?? "-"} | ${s.ackLatencyMs.p99 ?? "-"} |`
          );
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function writeReports(payload) {
  await mkdir(CONFIG.outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(CONFIG.outputDir, `message-benchmark-${stamp}.json`);
  const csvPath = path.join(CONFIG.outputDir, `message-benchmark-${stamp}.csv`);
  const mdPath = path.join(CONFIG.outputDir, `message-benchmark-${stamp}.md`);

  await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(csvPath, toCsv(payload.results), "utf8");
  await writeFile(mdPath, toMarkdown(payload), "utf8");

  return { jsonPath, csvPath, mdPath };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Entrypoint
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString();
  const allResults = [];
  let aliasVerification = [];

  process.on("SIGINT", () => {
    if (aborted) process.exit(130);
    aborted = true;
    console.warn("\n[SIGINT] Stopping benchmark gracefully and saving collected results...");
  });

  console.log("DARC Message Controller Multi-Stage Concurrency Benchmark");
  console.log(`Target:           ${CONFIG.url}`);
  console.log(`Accounts:         ${CONFIG.usernames.length} (${CONFIG.usernames.join(", ")})`);
  console.log(`Stages:           ${CONFIG.stages.join(" -> ")} concurrent sockets`);
  console.log(`Scenarios:        ${CONFIG.scenarios.join(", ")} (single-room mode: ${CONFIG.singleRoomMode})`);
  console.log(`Routes/Phases:    ${CONFIG.routes.join(", ")}`);
  console.log(`Phase Duration:   ${CONFIG.stageMs / 1000}s | Op Interval: ${CONFIG.opIntervalMs}ms | Auth: ${CONFIG.authMode}`);
  console.log(`Server Telemetry: ${CONFIG.enableServerMetrics ? CONFIG.metricsUrl : "disabled"}`);

  if (!CONFIG.skipAliases) {
    aliasVerification = await verifyAllMessageRoutes();
  }

  for (const scenario of CONFIG.scenarios) {
    if (aborted) break;
    const scenarioResults = await runScenario(scenario);
    allResults.push(...scenarioResults);
  }

  const payload = {
    meta: {
      runId,
      target: CONFIG.url,
      startedAt,
      completedAt: new Date().toISOString(),
      aborted,
      usersCount: CONFIG.usernames.length,
      stages: CONFIG.stages,
      scenarios: CONFIG.scenarios,
      singleRoomMode: CONFIG.singleRoomMode,
      routes: CONFIG.routes,
      stageDurationMs: CONFIG.stageMs,
      opIntervalMs: CONFIG.opIntervalMs,
      authMode: CONFIG.authMode,
      seedMessages: CONFIG.seedMessages,
      displayLimit: CONFIG.displayLimit,
      mixedWeights: CONFIG.mixedWeights,
      cleanupRooms: CONFIG.cleanupRooms,
    },
    aliasVerification,
    results: allResults,
  };

  const { jsonPath, csvPath, mdPath } = await writeReports(payload);
  console.log("\nBenchmark complete.");
  console.log(`JSON report:     ${jsonPath}`);
  console.log(`CSV report:      ${csvPath}`);
  console.log(`Markdown report: ${mdPath}`);
}

main().catch(err => {
  console.error("Message benchmark failed:", err);
  process.exitCode = 1;
});
