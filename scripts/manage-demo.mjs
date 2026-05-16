import { execFile } from "node:child_process";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const runtimeDir = join(root, ".runtime");
const statePath = join(runtimeDir, "services.json");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const services = [
  {
    id: "runtime",
    name: "FutureTech Runtime",
    port: 4096,
    command: "opencode",
    args: [
      "serve",
      "--port",
      "4096",
      "--hostname",
      "127.0.0.1",
      "--cors",
      "http://localhost:5174",
      "--cors",
      "http://127.0.0.1:5174",
      "--cors",
      "http://localhost:5175",
      "--cors",
      "http://127.0.0.1:5175",
      "--print-logs",
    ],
    readyUrl: "http://127.0.0.1:4096/global/health",
    logFile: "futuretech-runtime.log",
  },
  {
    id: "consoleProxy",
    name: "FutureTech Console Proxy",
    port: 5175,
    command: process.execPath,
    args: ["server/futuretechConsoleProxy.mjs"],
    readyUrl: "http://127.0.0.1:5175/global/health",
    logFile: "futuretech-console-proxy.log",
  },
  {
    id: "web",
    name: "AgentOS Web",
    port: 5174,
    command: npmCommand,
    args: ["run", "dev", "--", "--port", "5174"],
    readyUrl: "http://127.0.0.1:5174/",
    logFile: "agentos-web.log",
  },
];

function loadState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function execFileText(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: root }, (error, stdout) => {
      resolve(error ? "" : stdout.trim());
    });
  });
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function pidsOnPort(port) {
  const output = await execFileText("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"]);
  return output
    .split(/\s+/)
    .map((pid) => Number(pid))
    .filter(Boolean);
}

async function isPortBusy(port) {
  return (await pidsOnPort(port)).length > 0;
}

async function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitForUrl(url, timeoutMs = 20000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {
      // Keep waiting until the service opens its port.
    }

    await wait(500);
  }

  return false;
}

async function killPid(pid, signal = "SIGTERM") {
  if (!isPidAlive(pid)) return;

  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already gone or owned by another process.
    }
  }
}

async function stopService(service, state) {
  const knownPid = state[service.id]?.pid;
  const portPids = await pidsOnPort(service.port);
  const pids = [...new Set([knownPid, ...portPids].filter(Boolean).map(Number))];

  if (pids.length === 0) {
    console.log(`- ${service.name}: not running`);
    return;
  }

  console.log(`- ${service.name}: stopping ${pids.join(", ")}`);
  await Promise.all(pids.map((pid) => killPid(pid, "SIGTERM")));

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const remaining = await pidsOnPort(service.port);
    if (remaining.length === 0 && (!knownPid || !isPidAlive(knownPid))) return;
    await wait(250);
  }

  const remaining = [...new Set([knownPid, ...(await pidsOnPort(service.port))].filter(Boolean).map(Number))];
  await Promise.all(remaining.map((pid) => killPid(pid, "SIGKILL")));
}

async function startService(service, state) {
  const existingPid = state[service.id]?.pid;

  if (existingPid && isPidAlive(existingPid)) {
    console.log(`- ${service.name}: already running on ${service.port} (pid ${existingPid})`);
    return;
  }

  const portPids = await pidsOnPort(service.port);
  if (portPids.length > 0) {
    console.log(`- ${service.name}: port ${service.port} is already in use by pid ${portPids.join(", ")}`);
    state[service.id] = {
      pid: portPids[0],
      port: service.port,
      external: true,
      adoptedAt: new Date().toISOString(),
    };
    return;
  }

  mkdirSync(runtimeDir, { recursive: true });
  const logPath = join(runtimeDir, service.logFile);
  const logFd = openSync(logPath, "a");
  const child = spawn(service.command, service.args, {
    cwd: root,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
    },
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });

  child.unref();
  state[service.id] = {
    pid: child.pid,
    port: service.port,
    log: logPath,
    command: `${service.command} ${service.args.join(" ")}`,
    startedAt: new Date().toISOString(),
  };
  saveState(state);

  process.stdout.write(`- ${service.name}: starting on ${service.port} (pid ${child.pid}) ... `);
  const ready = await waitForUrl(service.readyUrl);
  console.log(ready ? "ready" : `not ready yet, check ${logPath}`);
}

async function startAll() {
  const state = loadState();
  console.log("Starting AgentOS demo services");

  for (const service of services) {
    await startService(service, state);
  }

  saveState(state);
  console.log("\nOpen http://localhost:5174/");
  console.log(`Logs: ${runtimeDir}`);
}

async function stopAll() {
  const state = loadState();
  console.log("Stopping AgentOS demo services");

  for (const service of [...services].reverse()) {
    await stopService(service, state);
    delete state[service.id];
  }

  saveState(state);
  console.log("Stopped");
}

async function statusAll() {
  const state = loadState();
  console.log("AgentOS demo service status");

  for (const service of services) {
    const portPids = await pidsOnPort(service.port);
    const knownPid = state[service.id]?.pid;
    const healthy = await waitForUrl(service.readyUrl, 1200);
    const pidText = portPids.length > 0 ? portPids.join(", ") : knownPid || "-";
    console.log(
      `- ${service.name}: ${healthy ? "healthy" : "down"} | port ${service.port} | pid ${pidText}`
    );
  }
}

async function restartAll() {
  await stopAll();
  console.log("");
  await startAll();
}

const action = process.argv[2] || "start";

try {
  if (action === "start") await startAll();
  else if (action === "stop") await stopAll();
  else if (action === "restart") await restartAll();
  else if (action === "status") await statusAll();
  else {
    console.error(`Unknown action: ${action}`);
    console.error("Usage: node scripts/manage-demo.mjs start|stop|restart|status");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
