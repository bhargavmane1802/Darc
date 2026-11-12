// Test entrypoint stubs.
// Import this file FIRST in any test that imports a controller/service.
// It neutralises ioredis side effects and ensures required env vars exist.

process.env.NODE_ENV = 'test';
import Redis from "ioredis";
import { after } from "node:test";

// 1. Prevent ioredis from actually trying to connect during module load.
//    The real config/redis.js does `new Redis(...)` at import, which schedules
//    a connection attempt. Without this stub, the test process hangs/leaks.
if (!Redis.prototype.__darcTestStubbed) {
  Redis.prototype.connect = function () {
    return Promise.resolve();
  };
  // Make the prototype return fake, harmless versions of the methods BullMQ calls
  // before any connection is established (it probes server version etc.).
  Redis.prototype.info = function (_section, cb) {
    if (typeof cb === "function") {
      const cb_ = cb; // bind explicitly
      process.nextTick(() => cb_(null, "redis_version:7.0.0\r\n"));
    }
    return Promise.resolve("redis_version:7.0.0\r\n");
  };
  Redis.prototype.script = function () {
    return Promise.resolve("OK");
  };
  Redis.prototype.options = Redis.prototype.options || {};
  Redis.prototype.status = "ready";
  Redis.prototype.__darcTestStubbed = true;
}

// 2. Ensure all env vars that any service reads at import or at runtime exist.
const ensureEnv = (key, fallback) => {
  if (process.env[key] === undefined || process.env[key] === null || process.env[key] === "") {
    process.env[key] = fallback;
  }
};
ensureEnv("Jwt_Key", "test-jwt-secret");
ensureEnv("FRONTEND_URL", "http://localhost:5173");
ensureEnv("BACKEND_URL", "http://localhost:8080");
ensureEnv("Llm_Api_Key", "test-llm-key");
ensureEnv("PINECONE_API_KEY", "test-pinecone-key");
ensureEnv("GOOGLE_CLIENT_ID", "test-google-id");
ensureEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
ensureEnv("REFRESH_TOKEN", "test-refresh-token");
ensureEnv("REDIS_URL", "");

// 3. Force exit after tests complete to prevent dangling handles (BullMQ/Redis) from hanging the process.
after(() => {
  setTimeout(() => process.exit(0), 50);
});
