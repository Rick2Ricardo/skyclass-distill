import { join, resolve } from "node:path";

function invocationRoot(): string {
  return resolve(process.env.SKYCLASS_ROOT ?? process.env.ANYTEACHER_ROOT ?? process.env.INIT_CWD ?? process.cwd());
}

export const ROOT = invocationRoot();
export const DATA_DIR = resolve(process.env.SKYCLASS_DATA_DIR ?? process.env.ANYTEACHER_DATA_DIR ?? process.env.DATA_DIR ?? join(ROOT, "data"));
export const WEB_DIST_DIR = resolve(process.env.SKYCLASS_WEB_DIST_DIR ?? process.env.ANYTEACHER_WEB_DIST_DIR ?? join(ROOT, "apps", "anyteacher", "web", "dist"));
export const PORT = Number(process.env.SKYCLASS_PORT ?? process.env.ANYTEACHER_PORT ?? process.env.PORT ?? 3000);
