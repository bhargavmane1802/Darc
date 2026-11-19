import os from "node:os";
import v8 from "node:v8";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";

const MAX_QUERY_SAMPLES = 10_000;
const IGNORED_MONGO_COMMANDS = new Set([
  "hello",
  "isMaster",
  "ismaster",
  "ping",
  "serverStatus",
  "buildInfo",
  "endSessions",
  "saslStart",
  "saslContinue",
  "getFreeMonitoringStatus",
]);

let initialized = false;
let elHistogram = null;
let samplerTimer = null;
let mongoAttached = false;

// Peak trackers (resettable per benchmark phase)
let peakRssBytes = 0;
let peakHeapUsedBytes = 0;

// Application-level cache telemetry (monotonic counters)
const cacheStats = {
  hits: 0,
  misses: 0,
  fallbacks: 0,
  writes: {
    init: 0,
    insert: 0,
    update: 0,
    delete: 0,
    skipped: 0,
  },
  errors: 0,
};

// MongoDB driver-level telemetry (monotonic + resettable phase samples)
const mongoStats = {
  attached: false,
  totalQueries: 0,
  succeeded: 0,
  failed: 0,
  totalDurationMs: 0,
  inFlight: 0,
  peakInFlight: 0,
  byCommand: {
    find: 0,
    insert: 0,
    update: 0,
    delete: 0,
    findAndModify: 0,
    count: 0,
    aggregate: 0,
    other: 0,
  },
  phaseSamples: [],
  phaseSeen: 0,
};

function classifyCommand(name) {
  const cmd = String(name || "").toLowerCase();
  if (cmd === "find" || cmd === "getmore") return "find";
  if (cmd === "insert") return "insert";
  if (cmd === "update") return "update";
  if (cmd === "delete") return "delete";
  if (cmd === "findandmodify") return "findAndModify";
  if (cmd === "count" || cmd === "distinct") return "count";
  if (cmd === "aggregate") return "aggregate";
  return "other";
}

function recordQuerySample(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  mongoStats.phaseSeen++;
  if (mongoStats.phaseSamples.length < MAX_QUERY_SAMPLES) {
    mongoStats.phaseSamples.push(durationMs);
  } else {
    const idx = Math.floor(Math.random() * mongoStats.phaseSeen);
    if (idx < MAX_QUERY_SAMPLES) mongoStats.phaseSamples[idx] = durationMs;
  }
}

function summarizeSamples(values) {
  if (!values.length) {
    return { count: 0, min: null, avg: null, p50: null, p90: null, p95: null, p99: null, max: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) sum += sorted[i];
  const pct = p => Number(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))].toFixed(2));
  return {
    count: sorted.length,
    min: Number(sorted[0].toFixed(2)),
    avg: Number((sum / sorted.length).toFixed(2)),
    p50: pct(0.5),
    p90: pct(0.9),
    p95: pct(0.95),
    p99: pct(0.99),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

function readSystemCpuTicks() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { cores: cpus.length, idle, total };
}

function parseRedisInfo(raw) {
  const map = {};
  if (typeof raw !== "string") return map;
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return map;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function readEventLoopLag() {
  if (!elHistogram) {
    return { min: null, mean: null, p50: null, p90: null, p95: null, p99: null, max: null };
  }
  const toMs = ns => {
    if (!Number.isFinite(ns) || ns < 0) return 0;
    return Number((ns / 1e6).toFixed(2));
  };
  if (elHistogram.count === 0) {
    return { min: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  }
  return {
    min: toMs(elHistogram.min),
    mean: toMs(elHistogram.mean),
    p50: toMs(elHistogram.percentile(50)),
    p90: toMs(elHistogram.percentile(90)),
    p95: toMs(elHistogram.percentile(95)),
    p99: toMs(elHistogram.percentile(99)),
    max: toMs(elHistogram.max),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Instrumentation Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function initBenchMetrics() {
  if (initialized) return;
  initialized = true;

  elHistogram = monitorEventLoopDelay({ resolution: 10 });
  elHistogram.enable();

  const updatePeaks = () => {
    const mem = process.memoryUsage();
    if (mem.rss > peakRssBytes) peakRssBytes = mem.rss;
    if (mem.heapUsed > peakHeapUsedBytes) peakHeapUsedBytes = mem.heapUsed;
  };
  updatePeaks();
  samplerTimer = setInterval(updatePeaks, 500);
  if (typeof samplerTimer.unref === "function") samplerTimer.unref();
}

export function resetBenchPhaseMetrics() {
  if (elHistogram) elHistogram.reset();
  const mem = process.memoryUsage();
  peakRssBytes = mem.rss;
  peakHeapUsedBytes = mem.heapUsed;
  mongoStats.peakInFlight = mongoStats.inFlight;
  mongoStats.phaseSamples = [];
  mongoStats.phaseSeen = 0;
}

export function attachMongoMetrics(mongooseInstance) {
  if (mongoAttached || !mongooseInstance?.connection) return false;
  let client = null;
  try {
    client =
      typeof mongooseInstance.connection.getClient === "function"
        ? mongooseInstance.connection.getClient()
        : mongooseInstance.connection.client;
  } catch {
    return false;
  }
  if (!client || typeof client.on !== "function") return false;

  mongoAttached = true;
  mongoStats.attached = true;

  client.on("commandStarted", event => {
    if (IGNORED_MONGO_COMMANDS.has(event?.commandName)) return;
    mongoStats.inFlight++;
    if (mongoStats.inFlight > mongoStats.peakInFlight) {
      mongoStats.peakInFlight = mongoStats.inFlight;
    }
  });

  client.on("commandSucceeded", event => {
    if (IGNORED_MONGO_COMMANDS.has(event?.commandName)) return;
    mongoStats.inFlight = Math.max(0, mongoStats.inFlight - 1);
    mongoStats.totalQueries++;
    mongoStats.succeeded++;
    const bucket = classifyCommand(event.commandName);
    mongoStats.byCommand[bucket] = (mongoStats.byCommand[bucket] || 0) + 1;
    const dur = Number(event?.duration);
    if (Number.isFinite(dur) && dur >= 0) {
      mongoStats.totalDurationMs += dur;
      recordQuerySample(dur);
    }
  });

  client.on("commandFailed", event => {
    if (IGNORED_MONGO_COMMANDS.has(event?.commandName)) return;
    mongoStats.inFlight = Math.max(0, mongoStats.inFlight - 1);
    mongoStats.totalQueries++;
    mongoStats.failed++;
    const bucket = classifyCommand(event.commandName);
    mongoStats.byCommand[bucket] = (mongoStats.byCommand[bucket] || 0) + 1;
    const dur = Number(event?.duration);
    if (Number.isFinite(dur) && dur >= 0) {
      mongoStats.totalDurationMs += dur;
      recordQuerySample(dur);
    }
  });

  return true;
}

export function recordCacheHit() {
  cacheStats.hits++;
}

export function recordCacheMiss() {
  cacheStats.misses++;
}

export function recordCacheFallback() {
  cacheStats.fallbacks++;
}

export function recordCacheWrite(kind = "insert") {
  if (kind in cacheStats.writes) {
    cacheStats.writes[kind]++;
  }
}

export function recordCacheError() {
  cacheStats.errors++;
}

export async function collectBenchMetricsSnapshot({ mongoose = null, redis = null, reset = false } = {}) {
  if (!initialized) initBenchMetrics();
  if (mongoose && !mongoAttached && mongoose.connection?.readyState === 1) {
    attachMongoMetrics(mongoose);
  }

  const mem = process.memoryUsage();
  if (mem.rss > peakRssBytes) peakRssBytes = mem.rss;
  if (mem.heapUsed > peakHeapUsedBytes) peakHeapUsedBytes = mem.heapUsed;

  const heapStats = v8.getHeapStatistics();
  const sysTotalMem = os.totalmem();
  const sysFreeMem = os.freemem();

  // Best-effort MongoDB serverStatus (gracefully skipped on restricted tiers like Atlas M0)
  let mongoServerStatus = null;
  if (mongoose?.connection?.readyState === 1 && mongoose.connection.db) {
    try {
      const status = await withTimeout(mongoose.connection.db.admin().serverStatus(), 1500);
      mongoServerStatus = {
        opcounters: status.opcounters || null,
        connections: status.connections
          ? {
              current: status.connections.current ?? null,
              available: status.connections.available ?? null,
              active: status.connections.active ?? null,
            }
          : null,
        globalLock: status.globalLock
          ? {
              activeClients: status.globalLock.activeClients || null,
              currentQueue: status.globalLock.currentQueue || null,
            }
          : null,
        mem: status.mem
          ? {
              residentMB: status.mem.resident ?? null,
              virtualMB: status.mem.virtual ?? null,
            }
          : null,
      };
    } catch {
      mongoServerStatus = null;
    }
  }

  // Best-effort Redis INFO stats & memory
  let redisInfo = null;
  const redisConnected = Boolean(redis && (redis.status === "ready" || redis.isReady));
  if (redisConnected && typeof redis.info === "function") {
    try {
      const [statsRaw, memRaw, clientsRaw] = await withTimeout(
        Promise.all([redis.info("stats"), redis.info("memory"), redis.info("clients")]),
        1500
      );
      const s = parseRedisInfo(statsRaw);
      const m = parseRedisInfo(memRaw);
      const c = parseRedisInfo(clientsRaw);
      redisInfo = {
        connected: true,
        keyspaceHits: Number(s.keyspace_hits || 0),
        keyspaceMisses: Number(s.keyspace_misses || 0),
        totalCommandsProcessed: Number(s.total_commands_processed || 0),
        instantaneousOpsPerSec: Number(s.instantaneous_ops_per_sec || 0),
        usedMemoryBytes: Number(m.used_memory || 0),
        usedMemoryRssBytes: Number(m.used_memory_rss || 0),
        connectedClients: Number(c.connected_clients || 0),
      };
    } catch {
      redisInfo = { connected: false };
    }
  } else {
    redisInfo = { connected: false };
  }

  const snapshot = {
    timestampMs: Date.now(),
    perfNowMs: performance.now(),
    uptimeSec: Number(process.uptime().toFixed(2)),
    cpu: {
      processUsageUs: process.cpuUsage(),
      systemTicks: readSystemCpuTicks(),
      loadAvg: os.loadavg().map(n => Number(n.toFixed(2))),
    },
    memory: {
      rssBytes: mem.rss,
      peakRssBytes,
      heapUsedBytes: mem.heapUsed,
      peakHeapUsedBytes,
      heapTotalBytes: mem.heapTotal,
      heapLimitBytes: heapStats.heap_size_limit,
      externalBytes: mem.external,
      arrayBuffersBytes: mem.arrayBuffers,
      systemTotalBytes: sysTotalMem,
      systemFreeBytes: sysFreeMem,
    },
    eventLoopLagMs: readEventLoopLag(),
    cache: {
      app: {
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        fallbacks: cacheStats.fallbacks,
        writes: { ...cacheStats.writes },
        errors: cacheStats.errors,
      },
      redis: redisInfo,
    },
    database: {
      driverMonitorAttached: mongoStats.attached,
      totalQueries: mongoStats.totalQueries,
      succeeded: mongoStats.succeeded,
      failed: mongoStats.failed,
      totalDurationMs: Number(mongoStats.totalDurationMs.toFixed(2)),
      inFlight: mongoStats.inFlight,
      peakInFlight: mongoStats.peakInFlight,
      byCommand: { ...mongoStats.byCommand },
      queryLatencyMs: summarizeSamples(mongoStats.phaseSamples),
      serverStatus: mongoServerStatus,
    },
  };

  if (reset) {
    resetBenchPhaseMetrics();
  }

  return snapshot;
}

export function createBenchMetricsHandler({ mongoose = null, redis = null } = {}) {
  return async (req, res) => {
    try {
      const reset = req.query?.reset === "1" || req.query?.reset === "true";
      const snapshot = await collectBenchMetricsSnapshot({ mongoose, redis, reset });
      res.status(200).json(snapshot);
    } catch (err) {
      res.status(500).json({ message: "Failed to collect benchmark metrics", error: err.message });
    }
  };
}
