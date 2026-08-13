import { createModels, createProvider, type ImageContent, type Model, type TextContent } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { LookupAddress } from "node:dns";
import { lookup as nodeLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import {
  FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES,
  FORMAL_ORACLE_REQUIRED_NODE_ENGINE,
  revalidateFormalOraclePreparedProviderRequestArtifact,
  type FormalOraclePreparedProviderRequestArtifactV1,
} from "../../contracts/src/oracle-gate-provider-request.js";
import {
  createFormalOracleTransportCaptureArtifactV1,
  assertFormalOracleTransportCaptureArtifactV1,
  revalidateFormalOracleTransportCaptureArtifactV1,
  isPublicFormalOracleIpAddress,
  type FormalOracleCapturedPublicHeaderV1,
  type FormalOracleTransportCaptureArtifactV1,
} from "../../contracts/src/oracle-gate-transport-capture.js";
import { sha256Hex } from "../../contracts/src/sha256.js";
import { createFormalOraclePiResponseStreamArtifactV1, type FormalOraclePiResponseStreamArtifactV1 } from "../../contracts/src/oracle-gate-pi-response-stream.js";
import {
  createFormalOracleInvalidResponseArtifactV1,
  createFormalOracleTransportMetadataInvalidResponseArtifactV1,
  type FormalOracleInvalidResponseArtifactV1,
} from "../../contracts/src/oracle-gate-invalid-response.js";
import type { OracleGateResponseArm } from "../../contracts/src/oracle-gate-response.js";
import {
  assertActiveFormalOracleTransportAuthorityCapability,
  type FormalOracleTransportAuthorityCapability,
} from "../../distillation/src/oracleTransportAuthorityGate.js";
import {
  consumeFormalOracleSingleConsumeDispatchLease,
  type FormalOracleSingleConsumeDispatchLease,
} from "../../store/src/formalOracleRunStore.js";
import {
  consumeFormalOracleSingleConsumeDispatchLeaseV2,
  type FormalOracleSingleConsumeDispatchLeaseV2,
} from "../../store/src/formalOraclePreregistrationStoreV2.js";

export interface FormalOracleCredentialProvider {
  withCredential<T>(binding: Readonly<FormalOracleTransportAuthorityCapability["account"]>, callback: (apiKey: string) => Promise<T>): Promise<T>;
}

export interface FormalOraclePinnedHttpsRequestV1 {
  url: string;
  method: "POST";
  headers: Headers;
  body: Uint8Array;
  selected_address: string;
  selected_family: 4 | 6;
  timeout_ms: number;
  max_response_bytes: number;
  signal?: AbortSignal;
}

export interface FormalOraclePinnedHttpsResponseV1 {
  status: number;
  headers: Array<{ name: string; value: string }>;
  body: Uint8Array;
  complete: boolean;
}

interface FormalOracleSenderRuntimeV1 {
  resolveAll(hostname: string): Promise<LookupAddress[]>;
  sendPinned(input: FormalOraclePinnedHttpsRequestV1): Promise<FormalOraclePinnedHttpsResponseV1>;
}

declare const authoritativeSenderCaptureBrand: unique symbol;
export type FormalOracleAuthoritativeTransportCaptureArtifactV1 = FormalOracleTransportCaptureArtifactV1 & {
  readonly [authoritativeSenderCaptureBrand]: "runtime_sender_authoritative_capture";
};

const authoritativeCaptures = new WeakSet<object>();
const authoritativeSources = new WeakMap<object, FormalOracleTransportCaptureArtifactV1>();

function mintAuthoritativeSenderCapture(
  value: FormalOracleTransportCaptureArtifactV1,
): FormalOracleAuthoritativeTransportCaptureArtifactV1 {
  assertFormalOracleTransportCaptureArtifactV1(value);
  revalidateFormalOracleTransportCaptureArtifactV1(value);
  authoritativeCaptures.add(value);
  authoritativeSources.set(value, value);
  return value as FormalOracleAuthoritativeTransportCaptureArtifactV1;
}

export function assertFormalOracleAuthoritativeTransportCaptureArtifactV1(
  value: FormalOracleAuthoritativeTransportCaptureArtifactV1,
): void {
  if (!value || typeof value !== "object" || !authoritativeCaptures.has(value as object)) {
    throw new Error("Formal authoritative transport capture 必须来自真实 sender 路径");
  }
  const source = authoritativeSources.get(value as object);
  if (!source || JSON.stringify(source.record) !== JSON.stringify(value.record)
    || source.captured_entity_bytes?.byteLength !== value.captured_entity_bytes?.byteLength
    || source.captured_entity_bytes?.some((byte, index) => byte !== value.captured_entity_bytes![index])) {
    throw new Error("Formal authoritative transport capture 漂移");
  }
}

export type FormalOracleSingleConsumeSendResultV1 = {
  stage: "formal_oracle_single_consume_transport_capture_only";
  capture_artifact: FormalOracleAuthoritativeTransportCaptureArtifactV1 | null;
  response_artifact: FormalOraclePiResponseStreamArtifactV1 | null;
  invalid_response_artifact: FormalOracleInvalidResponseArtifactV1 | null;
  request_started: boolean;
  provider_result_cross_check_status: "strict_complete_stop_cross_checked" | "not_available_for_unknown_or_invalid";
  error_code: "dns_resolution_failed_before_send" | "transport_response_incomplete_or_unknown" | "transport_complete_entity_invalid" | null;
  api_execution_allowed: false;
};
export type FormalOracleSingleConsumeSendResultV2 = FormalOracleSingleConsumeSendResultV1;

type FormalOracleDispatchLeaseAny = FormalOracleSingleConsumeDispatchLease | FormalOracleSingleConsumeDispatchLeaseV2;
type FormalOracleSingleConsumeSenderInput<TLease extends FormalOracleDispatchLeaseAny> = {
  authority: FormalOracleTransportAuthorityCapability;
  dispatch_lease: TLease;
  prepared: FormalOraclePreparedProviderRequestArtifactV1;
  credential_provider: FormalOracleCredentialProvider;
  signal?: AbortSignal;
  max_response_bytes?: number;
  expected_arm: OracleGateResponseArm;
};
type FormalOracleConsumedLeaseView = {
  run_sha256: string;
  execution_plan_sha256: string;
  request_id: string;
  intent_sha256: string;
  attempt_ordinal: number;
  request_envelope_sha256: string;
  provider_body_sha256: string;
};

function snapshotSingleConsumeSenderInput<TLease extends FormalOracleDispatchLeaseAny>(
  input: FormalOracleSingleConsumeSenderInput<TLease>,
): Readonly<FormalOracleSingleConsumeSenderInput<TLease>> {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype
    || Object.getOwnPropertySymbols(input).length || Object.hasOwn(input, "toJSON")) {
    throw new Error("Formal sender input 必须是 plain object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const required = ["authority", "dispatch_lease", "prepared", "credential_provider", "expected_arm"];
  const optional = ["signal", "max_response_bytes"];
  const keys = Object.keys(descriptors);
  if (required.some((key) => !keys.includes(key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error("Formal sender input 字段集合无效");
  }
  const read = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`Formal sender input.${key} 含 accessor/隐藏字段`);
    }
    return descriptor.value;
  };
  const provider = read("credential_provider");
  if (!provider || typeof provider !== "object" || Array.isArray(provider) || Object.getPrototypeOf(provider) !== Object.prototype
    || Object.getOwnPropertySymbols(provider).length || Object.hasOwn(provider, "toJSON")) {
    throw new Error("Formal sender credential_provider 必须是 plain object");
  }
  const providerDescriptors = Object.getOwnPropertyDescriptors(provider);
  if (JSON.stringify(Object.keys(providerDescriptors).sort()) !== JSON.stringify(["withCredential"])) {
    throw new Error("Formal sender credential_provider 字段集合无效");
  }
  const withCredentialDescriptor = providerDescriptors.withCredential;
  if (!withCredentialDescriptor || !("value" in withCredentialDescriptor)
    || withCredentialDescriptor.enumerable !== true || typeof withCredentialDescriptor.value !== "function") {
    throw new Error("Formal sender credential_provider.withCredential 含 accessor 或无效函数");
  }
  const expectedArm = read("expected_arm");
  if (!["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"].includes(String(expectedArm))) {
    throw new Error("Formal sender expected_arm 无效");
  }
  const maxResponseBytes = descriptors.max_response_bytes ? read("max_response_bytes") : undefined;
  if (maxResponseBytes !== undefined && (!Number.isSafeInteger(maxResponseBytes) || Number(maxResponseBytes) <= 0)) {
    throw new Error("Formal sender max_response_bytes 无效");
  }
  const signal = descriptors.signal ? read("signal") : undefined;
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error("Formal sender signal 无效");
  const credentialProvider = Object.freeze({
    withCredential: withCredentialDescriptor.value as FormalOracleCredentialProvider["withCredential"],
  });
  return Object.freeze({
    authority: read("authority") as FormalOracleTransportAuthorityCapability,
    dispatch_lease: read("dispatch_lease") as TLease,
    prepared: read("prepared") as FormalOraclePreparedProviderRequestArtifactV1,
    credential_provider: credentialProvider,
    ...(signal === undefined ? {} : { signal: signal as AbortSignal }),
    ...(maxResponseBytes === undefined ? {} : { max_response_bytes: Number(maxResponseBytes) }),
    expected_arm: expectedArm as OracleGateResponseArm,
  });
}

const COMPAT = Object.freeze({
  supportsStore: true, supportsDeveloperRole: false, supportsReasoningEffort: false,
  supportsUsageInStreaming: true, supportsFinishReason: true, maxTokensField: "max_completion_tokens" as const,
  requiresToolResultName: false, requiresAssistantAfterToolResult: false, requiresThinkingAsText: false,
  requiresReasoningContentOnAssistantMessages: false, thinkingFormat: "openai" as const, zaiToolStream: false,
  supportsThinkingTokenBudget: false, supportsOpenAIGrammarTools: false, supportsStrictMode: true,
  sendSessionAffinityHeaders: false, sessionAffinityFormat: "openai" as const, supportsLongCacheRetention: false,
  openRouterRouting: undefined, vercelGatewayRouting: undefined, cacheControlFormat: undefined,
  deferredToolsMode: undefined, chatTemplateKwargs: undefined, chatTemplateArgs: undefined,
});

function bytes(value: unknown): Uint8Array {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (value && ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  throw new Error("Formal sender body 必须是 string/bytes");
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function canonicalAddresses(raw: LookupAddress[]): Array<{ address: string; family: 4 | 6 }> {
  if (!Array.isArray(raw) || !raw.length) throw new Error("DNS 未返回地址");
  const values = raw.map((item) => ({ address: item.address, family: item.family as 4 | 6 }));
  if (values.some((item) => (item.family !== 4 && item.family !== 6) || !isPublicFormalOracleIpAddress(item.address, item.family))) {
    throw new Error("DNS answers 必须全部是 canonical public IP");
  }
  values.sort((a, b) => `${a.family}:${a.address}`.localeCompare(`${b.family}:${b.address}`));
  if (new Set(values.map((item) => `${item.family}:${item.address}`)).size !== values.length) throw new Error("DNS answers 重复");
  return values;
}

function publicHeaders(input: Array<{ name: string; value: string }>): FormalOracleCapturedPublicHeaderV1[] {
  const allowed = new Set(["content-type", "x-request-id", "request-id", "openai-request-id"]);
  return input.map((item) => ({ name: item.name.toLowerCase(), value: item.value.trim() }))
    .filter((item): item is FormalOracleCapturedPublicHeaderV1 => allowed.has(item.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function nodeVersionCompatible(): boolean {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(process.version);
  return Boolean(match && (Number(match![1]) > 22 || Number(match![1]) === 22 && Number(match![2]) >= 19));
}

const nodeFormalOracleSenderRuntime: FormalOracleSenderRuntimeV1 = Object.freeze({
  resolveAll: (hostname: string) => nodeLookup(hostname, { all: true, verbatim: true }),
  sendPinned: (input: FormalOraclePinnedHttpsRequestV1) => new Promise<FormalOraclePinnedHttpsResponseV1>((resolve, reject) => {
    const url = new URL(input.url);
    let settled = false, complete = false, status = 0;
    let responseHeaders: Array<{ name: string; value: string }> = [];
    const chunks: Buffer[] = [];
    let length = 0;
    const finish = (value: FormalOraclePinnedHttpsResponseV1): void => { if (!settled) { settled = true; resolve(value); } };
    let pinnedLookupCalled = false;
    const request = httpsRequest(url, {
      method: input.method, headers: Object.fromEntries(input.headers.entries()), signal: input.signal,
      servername: url.hostname, timeout: input.timeout_ms, agent: false,
      lookup: (hostname, _options, callback) => {
        if (hostname !== url.hostname) return callback(new Error("Pinned lookup hostname drift"), "", 4);
        pinnedLookupCalled = true;
        callback(null, input.selected_address, input.selected_family);
      },
    }, (response) => {
      const expectedFamily = input.selected_family === 4 ? "IPv4" : "IPv6";
      if (!pinnedLookupCalled || response.socket.remoteAddress !== input.selected_address
        || response.socket.remoteFamily !== expectedFamily) {
        request.destroy(new Error("Pinned HTTPS socket address/family drift"));
        return;
      }
      status = response.statusCode ?? 0;
      responseHeaders = Object.entries(response.headers).flatMap(([name, value]) => value === undefined ? []
        : Array.isArray(value) ? value.map((item) => ({ name, value: item })) : [{ name, value: String(value) }]);
      response.on("data", (chunk: Buffer) => {
        const copy = Buffer.from(chunk); length += copy.length;
        if (length > input.max_response_bytes) request.destroy(new Error("Formal response entity 超过上限"));
        else chunks.push(copy);
      });
      response.on("end", () => { complete = true; finish({ status, headers: responseHeaders, body: Buffer.concat(chunks), complete: true }); });
      response.on("aborted", () => finish({ status, headers: responseHeaders, body: Buffer.concat(chunks), complete: false }));
      response.on("error", () => finish({ status, headers: responseHeaders, body: Buffer.concat(chunks), complete: false }));
    });
    request.on("timeout", () => request.destroy(new Error("Formal request timeout")));
    request.on("error", (error) => {
      if (status > 0 || chunks.length) finish({ status, headers: responseHeaders, body: Buffer.concat(chunks), complete });
      else if (!settled) { settled = true; reject(error); }
    });
    request.end(Buffer.from(input.body));
  }),
});

function makeCapture(input: {
  authority: FormalOracleTransportAuthorityCapability;
  lease: FormalOracleConsumedLeaseView;
  addresses: Array<{ address: string; family: 4 | 6 }>;
  selected: { address: string; family: 4 | 6 };
  startedAt: string;
  finishedAt: string;
  responseHeadersReceivedAt: string | null;
  status: "complete_fetch_entity" | "partial_fetch_entity_unknown" | "request_started_no_response_unknown";
  httpStatus: number | null;
  headers: FormalOracleCapturedPublicHeaderV1[];
  entity: Uint8Array | null;
}): FormalOracleAuthoritativeTransportCaptureArtifactV1 {
  const contentType = input.headers.find((item) => item.name === "content-type")?.value.split(";", 1)[0]?.trim().toLowerCase() ?? null;
  const requestId = input.headers.find((item) => item.name === "x-request-id")?.value
    ?? input.headers.find((item) => item.name === "request-id")?.value
    ?? input.headers.find((item) => item.name === "openai-request-id")?.value ?? null;
  const built = createFormalOracleTransportCaptureArtifactV1({
    transport_registry_sha256: input.authority.transport_registry_sha256, run_sha256: input.lease.run_sha256,
    execution_plan_sha256: input.lease.execution_plan_sha256, request_id: input.lease.request_id, intent_sha256: input.lease.intent_sha256,
    attempt_ordinal: input.lease.attempt_ordinal, request_envelope_sha256: input.lease.request_envelope_sha256,
    provider_body_sha256: input.lease.provider_body_sha256, provider_body_profile: input.authority.provider_body_profile,
    prepared_adapter_version: input.authority.prepared_adapter_version, transport: "pi", model: input.authority.model,
    endpoint: structuredClone(input.authority.endpoint), account: { provider_id: input.authority.account.provider_id,
      account_key_id: input.authority.account.account_key_id, credential_key_id: input.authority.account.credential_key_id },
    dns_resolution_policy: "all_answers_public_selected_address_pinned_lookup-v1", resolved_addresses: input.addresses,
    selected_address: input.selected.address, selected_family: input.selected.family, request_started_at: input.startedAt,
    response_headers_received_at: input.responseHeadersReceivedAt, capture_finished_at: input.finishedAt, network_request_started: true,
    capture_status: input.status, response_http_status: input.httpStatus, response_public_headers: input.headers,
    provider_http_request_id: requestId, response_content_type: contentType, captured_entity_bytes: input.entity,
    error_code: input.status === "complete_fetch_entity" ? null : "transport_response_incomplete_or_unknown",
    provenance_status: "runtime_https_pinned_lookup_capture_external_worm_pending", api_execution_allowed: false,
  });
  return mintAuthoritativeSenderCapture(built);
}

function invalidArtifactForCompleteCapture(input: {
  capture: FormalOracleAuthoritativeTransportCaptureArtifactV1;
  authority: FormalOracleTransportAuthorityCapability;
  lease: FormalOracleConsumedLeaseView;
  prepared: FormalOraclePreparedProviderRequestArtifactV1;
  expectedArm: OracleGateResponseArm;
}): FormalOracleInvalidResponseArtifactV1 {
  if (input.capture.record.capture_status !== "complete_fetch_entity" || input.capture.captured_entity_bytes === null) {
    throw new Error("只有完整 fetch entity 才能构造 invalid response artifact");
  }
  const common = {
    raw_sse_bytes: input.capture.captured_entity_bytes,
    expected_model: input.authority.model,
    expected_arm: input.expectedArm,
    request_envelope_sha256: input.lease.request_envelope_sha256,
    provider_body_sha256: input.lease.provider_body_sha256,
    expected_max_input_tokens: input.prepared.max_input_tokens,
    expected_max_output_tokens: input.prepared.body.max_completion_tokens,
  };
  return input.capture.record.response_http_status === 200
    && input.capture.record.response_content_type === "text/event-stream"
    ? createFormalOracleInvalidResponseArtifactV1(common)
    : createFormalOracleTransportMetadataInvalidResponseArtifactV1(common);
}

/**
 * Runs one already-durable request. This is not a public execution API: it
 * requires two callback-scoped capabilities and returns api=false capture only.
 */
async function sendFormalOracleSingleConsumeRequest(
  input: Readonly<FormalOracleSingleConsumeSenderInput<FormalOracleDispatchLeaseAny>>,
): Promise<FormalOracleSingleConsumeSendResultV1> {
  assertActiveFormalOracleTransportAuthorityCapability(input.authority);
  const lease: FormalOracleConsumedLeaseView = input.dispatch_lease.stage === "durable_dispatch_intent_v2_single_consume_lease"
    ? consumeFormalOracleSingleConsumeDispatchLeaseV2(input.dispatch_lease)
    : consumeFormalOracleSingleConsumeDispatchLease(input.dispatch_lease);
  if (!nodeVersionCompatible()) throw new Error(`Formal sender Node ${process.version} 低于 ${FORMAL_ORACLE_REQUIRED_NODE_ENGINE}`);
  const prepared = revalidateFormalOraclePreparedProviderRequestArtifact(input.prepared);
  const authority = input.authority;
  if (authority.run_sha256 !== lease.run_sha256 || authority.execution_plan_sha256 !== lease.execution_plan_sha256
    || authority.model !== prepared.body.model || authority.provider_body_profile !== prepared.provider_body_profile
    || authority.prepared_adapter_version !== prepared.adapter_version
    || lease.request_envelope_sha256 !== prepared.request_envelope_sha256 || lease.provider_body_sha256 !== prepared.provider_body_sha256) {
    throw new Error("Formal sender authority/lease/prepared roots 未闭合");
  }
  const runtime = nodeFormalOracleSenderRuntime;
  let addresses: Array<{ address: string; family: 4 | 6 }>;
  try { addresses = canonicalAddresses(await runtime.resolveAll(new URL(authority.endpoint.base_url).hostname)); }
  catch { return { stage: "formal_oracle_single_consume_transport_capture_only", capture_artifact: null, response_artifact: null, invalid_response_artifact: null, request_started: false, provider_result_cross_check_status: "not_available_for_unknown_or_invalid", error_code: "dns_resolution_failed_before_send", api_execution_allowed: false }; }
  const selected = addresses[0];
  const startedAt = new Date().toISOString();
  return input.credential_provider.withCredential(authority.account, async (apiKey) => {
    if (typeof apiKey !== "string" || !apiKey || /[\r\n]/.test(apiKey)) throw new Error("Formal sender callback credential 无效");
    const model: Model<"openai-completions"> = {
      id: prepared.body.model, name: prepared.body.model, api: "openai-completions", provider: authority.account.provider_id,
      baseUrl: authority.endpoint.base_url, reasoning: false, input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000,
      maxTokens: prepared.body.max_completion_tokens, compat: COMPAT,
    };
    const models = createModels();
    models.setProvider(createProvider({
      id: authority.account.provider_id, name: "Formal Oracle pinned HTTPS sender", baseUrl: model.baseUrl,
      auth: { apiKey: { name: authority.account.credential_key_id, resolve: async () => ({ auth: { apiKey }, source: "external callback secret" }) } },
      models: [model], api: openAICompletionsApi(),
    }));
    let started = false;
    let capture: FormalOracleAuthoritativeTransportCaptureArtifactV1 | null = null;
    const guardedFetch: typeof globalThis.fetch = async (request, init) => {
      if (started) throw new Error("Formal sender duplicate/hidden retry");
      started = true;
      assertActiveFormalOracleTransportAuthorityCapability(authority);
      const headers = new Headers(init?.headers), actual = bytes(init?.body);
      if (String(request) !== authority.endpoint.chat_completions_url || init?.method !== "POST"
        || headers.get("authorization") !== `Bearer ${apiKey}` || headers.get("x-stainless-retry-count") !== "0"
        || !equal(actual, prepared.body_bytes) || sha256Hex(actual) !== prepared.provider_body_sha256) throw new Error("Pi fetch init 与 frozen authority/body 不一致");
      let response: FormalOraclePinnedHttpsResponseV1;
      try {
        assertActiveFormalOracleTransportAuthorityCapability(authority);
        response = await runtime.sendPinned({
          url: authority.endpoint.chat_completions_url, method: "POST", headers, body: actual,
          selected_address: selected.address, selected_family: selected.family, timeout_ms: prepared.timeout_ms,
          max_response_bytes: input.max_response_bytes ?? 8 * 1024 * 1024, signal: input.signal,
        });
      } catch {
        capture = makeCapture({ authority, lease, addresses, selected, startedAt, finishedAt: new Date().toISOString(),
          responseHeadersReceivedAt: null, status: "request_started_no_response_unknown", httpStatus: null, headers: [], entity: null });
        throw new Error("Formal sender started request without response headers");
      }
      const normalized = publicHeaders(response.headers);
      const headersAt = new Date().toISOString();
      capture = makeCapture({ authority, lease, addresses, selected, startedAt, finishedAt: new Date().toISOString(),
        responseHeadersReceivedAt: headersAt, status: response.complete ? "complete_fetch_entity" : "partial_fetch_entity_unknown",
        httpStatus: response.status, headers: normalized, entity: response.body });
      const body = response.body.buffer.slice(response.body.byteOffset, response.body.byteOffset + response.body.byteLength) as ArrayBuffer;
      return new Response(body, { status: response.status, headers: Object.fromEntries(response.headers.map((item) => [item.name, item.value])) });
    };
    const user = prepared.body.messages[1].content;
    const content: Array<TextContent | ImageContent> = user.map((item) => item.type === "text" ? { type: "text", text: item.text }
      : { type: "image", mimeType: "image/jpeg", data: item.image_url.url.slice("data:image/jpeg;base64,".length) });
    try {
      const result = await models.complete(model, { systemPrompt: prepared.body.messages[0].content, messages: [{ role: "user", content, timestamp: 0 }], tools: [] }, {
        apiKey, temperature: 0, maxTokens: prepared.body.max_completion_tokens, samplingParams: { seed: prepared.body.seed },
        cacheRetention: "none", timeoutMs: prepared.timeout_ms, maxRetries: 0, maxRetryDelayMs: 0, signal: input.signal,
        fetch: guardedFetch, onPayload: (payload) => {
          const observed = new TextEncoder().encode(JSON.stringify(payload));
          if (!equal(observed, prepared.body_bytes)) throw new Error("Pi onPayload 与 frozen provider body 不一致");
          return undefined;
        },
      });
      const completedCapture: FormalOracleAuthoritativeTransportCaptureArtifactV1 = (() => {
        if (capture === null) throw new Error("Formal sender 未生成 transport capture");
        return capture;
      })();
      const metadataValid = completedCapture.record.capture_status === "complete_fetch_entity"
        && completedCapture.record.response_http_status === 200
        && completedCapture.record.response_content_type === "text/event-stream";
      let responseArtifact: FormalOraclePiResponseStreamArtifactV1 | null = null;
      let invalidResponseArtifact: FormalOracleInvalidResponseArtifactV1 | null = null;
      if (metadataValid && completedCapture.captured_entity_bytes !== null) {
        try {
          responseArtifact = createFormalOraclePiResponseStreamArtifactV1({ raw_sse_bytes: completedCapture.captured_entity_bytes,
            expected_model: authority.model, request_envelope_sha256: lease.request_envelope_sha256,
            provider_body_sha256: lease.provider_body_sha256, expected_max_input_tokens: prepared.max_input_tokens,
            expected_max_output_tokens: prepared.body.max_completion_tokens });
          try {
            invalidResponseArtifact = createFormalOracleInvalidResponseArtifactV1({ raw_sse_bytes: completedCapture.captured_entity_bytes,
              expected_model: authority.model, expected_arm: input.expected_arm, request_envelope_sha256: lease.request_envelope_sha256,
              provider_body_sha256: lease.provider_body_sha256, expected_max_input_tokens: prepared.max_input_tokens,
              expected_max_output_tokens: prepared.body.max_completion_tokens });
            responseArtifact = null;
          } catch { /* all three strict stages passed, so the valid artifact remains authoritative */ }
        } catch {
          invalidResponseArtifact = invalidArtifactForCompleteCapture({
            capture: completedCapture, authority, lease, prepared, expectedArm: input.expected_arm,
          });
        }
      } else if (completedCapture.record.capture_status === "complete_fetch_entity" && completedCapture.captured_entity_bytes !== null) {
        invalidResponseArtifact = invalidArtifactForCompleteCapture({
          capture: completedCapture, authority, lease, prepared, expectedArm: input.expected_arm,
        });
      }
      const valid = responseArtifact !== null;
      return { stage: "formal_oracle_single_consume_transport_capture_only", capture_artifact: completedCapture,
        response_artifact: responseArtifact, invalid_response_artifact: invalidResponseArtifact, request_started: started,
        provider_result_cross_check_status: valid && result.stopReason === "stop"
          ? "strict_complete_stop_cross_checked" : "not_available_for_unknown_or_invalid",
        error_code: valid ? null : completedCapture.record.capture_status === "complete_fetch_entity" ? "transport_complete_entity_invalid" : "transport_response_incomplete_or_unknown",
        api_execution_allowed: false };
    } catch {
      const failedCapture = capture as unknown as FormalOracleAuthoritativeTransportCaptureArtifactV1 | null;
      let invalidResponseArtifact: FormalOracleInvalidResponseArtifactV1 | null = null;
      if (failedCapture?.record.capture_status === "complete_fetch_entity" && failedCapture.captured_entity_bytes !== null) {
        try {
          invalidResponseArtifact = invalidArtifactForCompleteCapture({
            capture: failedCapture, authority, lease, prepared, expectedArm: input.expected_arm,
          });
        } catch { /* a valid strict entity can only arrive here after a non-response sender failure */ }
      }
      return { stage: "formal_oracle_single_consume_transport_capture_only", capture_artifact: capture,
        response_artifact: null, invalid_response_artifact: invalidResponseArtifact, request_started: started,
        provider_result_cross_check_status: "not_available_for_unknown_or_invalid",
        error_code: failedCapture?.record.capture_status === "complete_fetch_entity" ? "transport_complete_entity_invalid" : "transport_response_incomplete_or_unknown",
        api_execution_allowed: false };
    }
  });
}

export function sendFormalOracleSingleConsumeRequestV1(input: {
  authority: FormalOracleTransportAuthorityCapability;
  dispatch_lease: FormalOracleSingleConsumeDispatchLease;
  prepared: FormalOraclePreparedProviderRequestArtifactV1;
  credential_provider: FormalOracleCredentialProvider;
  signal?: AbortSignal;
  max_response_bytes?: number;
  expected_arm: OracleGateResponseArm;
}): Promise<FormalOracleSingleConsumeSendResultV1> {
  return sendFormalOracleSingleConsumeRequest(snapshotSingleConsumeSenderInput(input));
}

/** Breaking V2 dispatch lease; transport capture leaves remain V1 byte evidence. */
export function sendFormalOracleSingleConsumeRequestV2(input: {
  authority: FormalOracleTransportAuthorityCapability;
  dispatch_lease: FormalOracleSingleConsumeDispatchLeaseV2;
  prepared: FormalOraclePreparedProviderRequestArtifactV1;
  credential_provider: FormalOracleCredentialProvider;
  signal?: AbortSignal;
  max_response_bytes?: number;
  expected_arm: OracleGateResponseArm;
}): Promise<FormalOracleSingleConsumeSendResultV2> {
  return sendFormalOracleSingleConsumeRequest(snapshotSingleConsumeSenderInput(input));
}
