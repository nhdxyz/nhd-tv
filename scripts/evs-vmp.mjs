import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const environmentRoot = path.join(projectRoot, ".tools", "evs");
const environmentPython = process.platform === "win32"
  ? path.join(environmentRoot, "Scripts", "python.exe")
  : path.join(environmentRoot, "bin", "python");
const electronPackage = path.join(projectRoot, "node_modules", "electron", "dist");

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function findBootstrapPython() {
  const candidates = process.platform === "win32"
    ? [["py", ["-3"]], ["python", []], ["python3", []]]
    : [["python3", []], ["python", []]];

  for (const [executable, prefix] of candidates) {
    const result = spawnSync(executable, [...prefix, "--version"], { stdio: "ignore" });

    if (result.status === 0) {
      return { executable, prefix };
    }
  }

  throw new Error("Python 3.7 or newer is required to install the Castlabs EVS client.");
}

function requireEnvironment() {
  if (!existsSync(environmentPython)) {
    throw new Error("EVS tooling is not installed. Run `pnpm evs:setup` first.");
  }
}

function requireElectronPackage() {
  if (!existsSync(electronPackage)) {
    throw new Error("The ECS runtime is missing. Run `pnpm install` and `pnpm runtime:install` first.");
  }
}

const command = process.argv[2];

if (command === "setup") {
  const python = findBootstrapPython();
  run(python.executable, [...python.prefix, "-m", "venv", environmentRoot]);
  run(environmentPython, ["-m", "pip", "install", "--upgrade", "castlabs-evs"]);
  console.log("Castlabs EVS tooling installed in .tools/evs.");
} else if (command === "signup") {
  requireEnvironment();
  run(environmentPython, ["-m", "castlabs_evs.account", "signup"]);
} else if (command === "sign") {
  requireEnvironment();
  requireElectronPackage();
  run(environmentPython, ["-m", "castlabs_evs.vmp", "sign-pkg", electronPackage]);
} else if (command === "verify") {
  requireEnvironment();
  requireElectronPackage();
  run(environmentPython, ["-m", "castlabs_evs.vmp", "verify-pkg", "--streaming", electronPackage]);
} else {
  console.error("Usage: node scripts/evs-vmp.mjs <setup|signup|sign|verify>");
  process.exit(2);
}
