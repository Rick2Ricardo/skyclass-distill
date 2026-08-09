import { spawn, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const children: ChildProcess[] = [];

function launch(command: string, args: string[], label: string): ChildProcess {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", env: process.env });
  child.on("error", (error) => process.stderr.write(`[${label}] ${error.message}\n`));
  children.push(child);
  return child;
}

function shutdown(signal: NodeJS.Signals): void {
  for (const child of children) if (!child.killed) child.kill(signal);
}

const tsx = join(root, "node_modules", ".bin", "tsx");
const api = launch(tsx, ["apps/anyteacher/src/server.ts"], "studio");

for (const signal of ["SIGINT", "SIGTERM"] as NodeJS.Signals[]) {
  process.on(signal, () => { shutdown(signal); process.exit(0); });
}

api.on("exit", (code) => {
  shutdown("SIGTERM");
  process.exit(code ?? 0);
});
