import { io } from "socket.io-client";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import "dotenv/config";

const URL = process.env.BENCH_URL || "http://localhost:8080";
const PASSWORD = "3388Mane@";
const USERNAMES = (process.env.BENCH_USERS || "testuser1,testuser2,bhargav,saksham,bhargavmane")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const STAGES = [5, 20, 50, 100, 250];
const STAGE_MS = Number(process.env.BENCH_STAGE_MS || 60_000);
const MESSAGE_INTERVAL_MS = Number(process.env.BENCH_MESSAGE_INTERVAL_MS || 2_000);
const ACK_TIMEOUT_MS = Number(process.env.BENCH_ACK_TIMEOUT_MS || 10_000);
const CONNECT_TIMEOUT_MS = Number(process.env.BENCH_CONNECT_TIMEOUT_MS || 12_000);
const BATCH_SIZE = Number(process.env.BENCH_CONNECT_BATCH_SIZE || 25);
const OUTPUT_DIR = process.env.BENCH_OUTPUT_DIR || "./benchmark-results";

if (!PASSWORD) throw new Error("Set BENCH_PASSWORD in your .env file.");
if (USERNAMES.length < 2) throw new Error("Provide at least two usernames in BENCH_USERS.");
if (STAGE_MS <= 0 || MESSAGE_INTERVAL_MS <= 0) throw new Error("Stage and message intervals must be positive.");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const runId = `${Date.now()}`;
const counters = {
  connectSuccess: 0, connectFailure: 0,
  loginSuccess: 0, loginFailure: 0,
  roomJoinFailure: 0,
  messageAckSuccess: 0, messageAckFailure: 0,
  messageDeliveries: 0,
};
let currentStageStats = null;
let trafficEnabled = false;
let stopping = false;
let messageSequence = 0;
const pendingMessages = new Map();
const MAX_SAMPLES = 12_000;

function addSample(key, value) {
  if (!Number.isFinite(value) || !currentStageStats) return;
  const list = currentStageStats[key];
  if (list.length < MAX_SAMPLES) list.push(value);
  else if (Math.random() < 0.02) list[Math.floor(Math.random() * list.length)] = value;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)].toFixed(2));
}

function stats(values) {
  if (!values.length) return { count: 0, min: null, avg: null, p50: null, p90: null, p95: null, p99: null, max: null };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    min: Number(Math.min(...values).toFixed(2)),
    avg: Number((sum / values.length).toFixed(2)),
    p50: percentile(values, 0.50), p90: percentile(values, 0.90),
    p95: percentile(values, 0.95), p99: percentile(values, 0.99),
    max: Number(Math.max(...values).toFixed(2)),
  };
}

function emitAck(socket, event, payload, timeoutMs = ACK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} acknowledgement timed out after ${timeoutMs}ms`)), timeoutMs);
    socket.emit(event, payload, response => {
      clearTimeout(timer);
      resolve(response || {});
    });
  });
}

async function connectAndLogin(username, clientIndex, scenario) {
  const socket = io(URL, {
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    timeout: CONNECT_TIMEOUT_MS,
  });

  socket.on("message_new", message => {
    counters.messageDeliveries++;
    const content = typeof message?.content === "string" ? message.content : "";
    const sentAt = pendingMessages.get(content);
    if (sentAt !== undefined) addSample("deliveryMs", performance.now() - sentAt);
  });

  const connectStarted = performance.now();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket connection timed out")), CONNECT_TIMEOUT_MS);
      socket.once("connect", () => { clearTimeout(timer); resolve(); });
      socket.once("connect_error", err => { clearTimeout(timer); reject(err); });
    });
    const connectMs = performance.now() - connectStarted;
    counters.connectSuccess++;

    const loginStarted = performance.now();
    const loginResponse = await emitAck(socket, "user:login", { username, password: PASSWORD });
    const loginMs = performance.now() - loginStarted;
    if (loginResponse.status !== 200 || !loginResponse.token) {
      counters.loginFailure++;
      socket.disconnect();
      throw new Error(`Login failed for ${username}: ${loginResponse.message || `status ${loginResponse.status}`}`);
    }
    counters.loginSuccess++;
    return { socket, username, clientIndex, scenario, connectMs, loginMs, roomId: null, worker: null };
  } catch (error) {
    if (!socket.connected) counters.connectFailure++;
    socket.disconnect();
    throw error;
  }
}

async function createRoom(client, roomName) {
  const response = await emitAck(client.socket, "room:create", {
    name: roomName,
    description: `Socket.IO benchmark ${runId}`,
    isPrivate: false,
  });
  if (response.status !== 200 || !response.room_id) {
    throw new Error(`Room creation failed (${roomName}): ${response.message || JSON.stringify(response)}`);
  }
  client.roomId = String(response.room_id);
  return { roomId: client.roomId, inviteCode: response.inviteCode };
}

async function joinRoomByInvite(client, inviteCode) {
  const response = await emitAck(client.socket, "room:join", { inviteCode });
  if (response.status !== 200 || !response.room_id) {
    throw new Error(`Room join failed for ${client.username}: ${response.message || JSON.stringify(response)}`);
  }
  client.roomId = String(response.room_id);
}

async function joinSocketRoom(client) {
  if (!client.roomId) throw new Error(`No room assigned to ${client.username}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`join_room did not confirm for ${client.username} / ${client.roomId}`));
    }, 5_000);
    const done = () => { cleanup(); resolve(); };
    const cleanup = () => {
      clearTimeout(timer);
      client.socket.off("room_members", done);
      client.socket.off("message_display", done);
    };
    client.socket.once("room_members", done);
    client.socket.once("message_display", done);
    client.socket.emit("join_room", { room_id: client.roomId });
  });
}

async function setupScenario(scenario) {
  const setupClients = [];
  for (let i = 0; i < USERNAMES.length; i++) {
    const client = await connectAndLogin(USERNAMES[i], i, scenario);
    setupClients.push(client);
  }

  const roomsByAccount = [];
  if (scenario === "shared-room") {
    const created = await createRoom(setupClients[0], `bench-${runId}-shared`);
    roomsByAccount.push(...USERNAMES.map(() => ({ roomId: created.roomId, inviteCode: created.inviteCode })));
    for (let i = 1; i < setupClients.length; i++) {
      await joinRoomByInvite(setupClients[i], created.inviteCode);
    }
  } else {
    for (let i = 0; i < setupClients.length; i++) {
      const created = await createRoom(setupClients[i], `bench-${runId}-group-${i + 1}`);
      roomsByAccount[i] = { roomId: created.roomId, inviteCode: created.inviteCode };
    }
  }

  setupClients.forEach((client, i) => {
    client.roomId = roomsByAccount[i].roomId;
  });
  return { clients: setupClients, roomsByAccount };
}

async function addClient(index, scenario, roomsByAccount) {
  const accountIndex = index % USERNAMES.length;
  const client = await connectAndLogin(USERNAMES[accountIndex], index, scenario);
  client.roomId = roomsByAccount[accountIndex].roomId;
  try {
    await joinSocketRoom(client);
  } catch (error) {
    counters.roomJoinFailure++;
    client.socket.disconnect();
    throw error;
  }
  return client;
}

function startMessageWorker(client) {
  client.worker = (async () => {
    while (!stopping) {
      if (!trafficEnabled) {
        await sleep(100);
        continue;
      }
      const content = `bench-${runId}-${client.clientIndex}-${++messageSequence}`;
      pendingMessages.set(content, performance.now());
      if (pendingMessages.size > 50_000) {
        const keysToDelete = [...pendingMessages.keys()].slice(0, 10_000);
        for (const key of keysToDelete) pendingMessages.delete(key);
      }
      const started = performance.now();
      try {
        const response = await emitAck(client.socket, "message:create", {
          roomId: client.roomId,
          content,
          type: "text",
        });
        addSample("ackMs", performance.now() - started);
        if (response.status === 201) counters.messageAckSuccess++;
        else counters.messageAckFailure++;
      } catch {
        counters.messageAckFailure++;
      }
      await sleep(MESSAGE_INTERVAL_MS);
    }
  })();
}

function counterSnapshot() { return { ...counters }; }
function diffCounters(before, after) {
  return Object.fromEntries(Object.keys(after).map(k => [k, after[k] - before[k]]));
}

async function runScenario(scenario) {
  console.log(`\n=== ${scenario} ===`);
  const { clients, roomsByAccount } = await setupScenario(scenario);
  const results = [];
  let nextClientIndex = clients.length;

  for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex++) {
    const target = STAGES[stageIndex];
    currentStageStats = { connectionMs: [], loginMs: [], ackMs: [], deliveryMs: [] };
    const before = counterSnapshot();

    while (clients.length < target) {
      const batch = [];
      const count = Math.min(BATCH_SIZE, target - clients.length);
      for (let i = 0; i < count; i++) batch.push(nextClientIndex++);
      const created = await Promise.all(batch.map(index => addClient(index, scenario, roomsByAccount)));
      clients.push(...created);
      for (const client of created) {
        addSample("connectionMs", client.connectMs);
        addSample("loginMs", client.loginMs);
      }
    }

    // The five setup sockets are the first five simulated users.
    if (stageIndex === 0) {
      for (const client of clients) {
        addSample("connectionMs", client.connectMs);
        addSample("loginMs", client.loginMs);
      }
    }

    for (const client of clients) if (!client.worker) startMessageWorker(client);
    console.log(`Stage ${stageIndex + 1}/5: ${target} concurrent sockets for 60 seconds...`);
    trafficEnabled = true;
    await sleep(STAGE_MS);
    trafficEnabled = false;

    const after = counterSnapshot();
    const deltas = diffCounters(before, after);
    const stageResult = {
      scenario,
      stage: stageIndex + 1,
      concurrentUsers: target,
      durationSeconds: Number((STAGE_MS / 1000).toFixed(1)),
      counters: deltas,
      connectionLatencyMs: stats(currentStageStats.connectionMs),
      loginLatencyMs: stats(currentStageStats.loginMs),
      messageAckLatencyMs: stats(currentStageStats.ackMs),
      messageDeliveryLatencyMs: stats(currentStageStats.deliveryMs),
      messageAcksPerSecond: Number((deltas.messageAckSuccess / (STAGE_MS / 1000)).toFixed(2)),
    };
    results.push(stageResult);
    console.log(`  ACK success: ${deltas.messageAckSuccess}, ACK failures: ${deltas.messageAckFailure}, deliveries: ${deltas.messageDeliveries}`);
    console.log(`  ACK latency p95: ${stageResult.messageAckLatencyMs.p95 ?? "n/a"} ms; throughput: ${stageResult.messageAcksPerSecond} msg/s`);
  }

  stopping = true;
  await Promise.allSettled(clients.map(c => c.worker).filter(Boolean));
  clients.forEach(c => c.socket.disconnect());
  stopping = false;
  trafficEnabled = false;
  return results;
}

function toCsv(rows) {
  const headers = ["scenario", "stage", "concurrentUsers", "durationSeconds", "messageAckSuccess", "messageAckFailure", "messageDeliveries", "messageAcksPerSecond", "ackP50Ms", "ackP95Ms", "ackP99Ms", "deliveryP95Ms", "connectP95Ms", "loginP95Ms"];
  const lines = rows.map(r => [
    r.scenario, r.stage, r.concurrentUsers, r.durationSeconds,
    r.counters.messageAckSuccess, r.counters.messageAckFailure, r.counters.messageDeliveries,
    r.messageAcksPerSecond, r.messageAckLatencyMs.p50, r.messageAckLatencyMs.p95,
    r.messageAckLatencyMs.p99, r.messageDeliveryLatencyMs.p95,
    r.connectionLatencyMs.p95, r.loginLatencyMs.p95,
  ].map(v => v ?? "").join(","));
  return [headers.join(","), ...lines].join("\n");
}

async function main() {
  console.log(`Target: ${URL}`);
  console.log(`Users: ${USERNAMES.length} test accounts reused across simulated sockets`);
  console.log(`Stages: ${STAGES.join(" -> ")} | ${STAGE_MS / 1000}s each | message interval ${MESSAGE_INTERVAL_MS}ms`);
  console.log("Running shared-room scenario first, then separate-room scenario.");

  const allResults = [];
  allResults.push(...await runScenario("shared-room"));
  allResults.push(...await runScenario("separate-rooms"));

  await mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.resolve(OUTPUT_DIR, `socketio-benchmark-${stamp}.json`);
  const csvPath = path.resolve(OUTPUT_DIR, `socketio-benchmark-${stamp}.csv`);
  await writeFile(jsonPath, JSON.stringify({ target: URL, stages: STAGES, stageDurationMs: STAGE_MS, messageIntervalMs: MESSAGE_INTERVAL_MS, results: allResults }, null, 2));
  await writeFile(csvPath, toCsv(allResults));

  console.log("\nBenchmark complete.");
  console.log(`JSON report: ${jsonPath}`);
  console.log(`CSV report:  ${csvPath}`);
}

main().catch(error => {
  console.error("Benchmark failed:", error);
  process.exitCode = 1;
});
