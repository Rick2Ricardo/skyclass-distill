import {
  assertFormalOraclePreparedProviderRequestArtifact,
  revalidateFormalOraclePreparedProviderRequestArtifact,
  type FormalOraclePreparedProviderRequestArtifactV1,
} from "../../contracts/src/oracle-gate-provider-request.js";

export type FormalOracleInjectedFetch = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Non-production harness for proving exact fetch initialization. It only accepts
 * reserved `.invalid` endpoints and an injected fetch, never global fetch. This
 * does not authorize API execution or prove a real endpoint/account binding.
 */
export async function exerciseNonProductionFormalOraclePreparedTransportWithFakeFetch(input: {
  prepared: FormalOraclePreparedProviderRequestArtifactV1;
  endpoint: string;
  api_key: string;
  fetch: FormalOracleInjectedFetch;
  signal?: AbortSignal;
}): Promise<Response> {
  assertFormalOraclePreparedProviderRequestArtifact(input.prepared);
  let endpoint: URL;
  try { endpoint = new URL(input.endpoint); } catch { throw new Error("Prepared transport endpoint 无效"); }
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "example.invalid" || endpoint.username || endpoint.password
    || endpoint.hash || endpoint.pathname !== "/v1/chat/completions" || endpoint.search) {
    throw new Error("Prepared transport harness 只允许固定 example.invalid HTTPS endpoint");
  }
  if (typeof input.api_key !== "string" || !input.api_key || /[\r\n]/.test(input.api_key)) throw new Error("Prepared transport runtime API key 无效");
  if (typeof input.fetch !== "function") throw new Error("Prepared transport 必须注入 fake fetch");
  const verified = revalidateFormalOraclePreparedProviderRequestArtifact(input.prepared);
  const timeout = AbortSignal.timeout(verified.timeout_ms);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const body = Uint8Array.from(verified.body_bytes);
  if (body.byteLength !== input.prepared.body_bytes.byteLength
    || !body.every((byte, index) => byte === input.prepared.body_bytes[index])) throw new Error("Prepared transport body bytes 在发送前漂移");
  return input.fetch(endpoint.href, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.api_key}` },
    body,
    signal,
  });
}
