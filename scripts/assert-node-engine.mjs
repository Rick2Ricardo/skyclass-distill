const REQUIRED_MAJOR = 22;
const REQUIRED_MINOR = 19;

export function assertNodeEngine(value = process.version) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error(`无法解析 Node 版本：${value}`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major < REQUIRED_MAJOR || (major === REQUIRED_MAJOR && minor < REQUIRED_MINOR)) {
    throw new Error(`SkyClass Distill 要求 Node >=22.19.0；当前为 ${value}`);
  }
}

assertNodeEngine();
