#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith("--")) {
    const next = process.argv[i + 1];
    args.set(arg.slice(2), next && !next.startsWith("--") ? next : "true");
    if (next && !next.startsWith("--")) i += 1;
  }
}

const agentId = args.get("agent-id");
const tokenFile = args.get("token-file");
const output = args.get("output") || "heartbeat-log.public.json";
const count = Number(args.get("count") || "0");
const intervalMs = Number(args.get("interval-ms") || "300000");
const version = args.get("version") || "tracepatch-relay-162-1.0.0";

if (!agentId) {
  throw new Error("--agent-id is required");
}

const token = process.env.BEACON_RELAY_TOKEN || (tokenFile ? (await readFile(tokenFile, "utf8")).trim() : "");
if (!token) {
  throw new Error("Provide BEACON_RELAY_TOKEN or --token-file");
}

const log = [];
const endpoint = "https://rustchain.org/beacon/relay/heartbeat";

async function heartbeat(index) {
  const startedAt = new Date();
  const payload = {
    agent_id: agentId,
    status: "alive",
    uptime: Math.floor((Date.now() - runStartedAt) / 1000),
    version,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = { text: await response.text() };
  }

  const entry = {
    index,
    timestamp_utc: startedAt.toISOString(),
    http_status: response.status,
    ok: response.ok,
    response: body,
  };
  log.push(entry);
  await writeFile(output, JSON.stringify({
    agent_id: agentId,
    endpoint,
    interval_ms: intervalMs,
    requested_count: count,
    generated_at: new Date().toISOString(),
    entries: log,
  }, null, 2));
  console.log(JSON.stringify(entry));
}

const runStartedAt = Date.now();
let index = 1;
while (count === 0 || index <= count) {
  await heartbeat(index);
  if (count !== 0 && index >= count) break;
  index += 1;
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
