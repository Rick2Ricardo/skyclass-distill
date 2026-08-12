import { createModels, createProvider, type ImageContent, type Model, type TextContent } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES,
  assertFormalOraclePreparedProviderRequestArtifact,
  revalidateFormalOraclePreparedProviderRequestArtifact,
  type FormalOraclePreparedProviderRequestArtifactV1,
} from "../../contracts/src/oracle-gate-provider-request.js";
import { sha256Hex } from "../../contracts/src/sha256.js";

export interface FormalOraclePiFetchBoundaryProofV1 {
  schema_version: "formal-oracle-pi-fetch-boundary-proof-v1";
  request_envelope_sha256: string;
  provider_body_sha256: string;
  captured_url: "https://example.invalid/v1/chat/completions";
  captured_method: "POST";
  fetch_count: 1;
  on_payload_count: 1;
  on_payload_replacement: false;
  sdk_retry_count_header: "0";
  completion_method: "models.complete_non_simple";
  requested_max_tokens: number;
  captured_max_completion_tokens: number;
  redirect_policy_status: "pending_not_bound_by_pi_sdk_fetch_boundary";
  node_engine_status: "pending_incompatible_node_engine";
  runtime_toolchain_status: "pending_incompatible_node_engine_and_external_immutable_capsule";
  provider_endpoint_account_status: "pending_external_runtime_binding";
  provider_response_capture_status: "pending_strict_sse_capture_contract";
  external_toolchain_authenticity_status: "pending_external_immutable_capsule";
  proof_status: "local_fake_fetch_exact_body_proved_non_executable";
  api_execution_allowed: false;
}

const COMPAT = Object.freeze({
  supportsStore: true,
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
  supportsUsageInStreaming: true,
  supportsFinishReason: true,
  maxTokensField: "max_completion_tokens" as const,
  requiresToolResultName: false,
  requiresAssistantAfterToolResult: false,
  requiresThinkingAsText: false,
  requiresReasoningContentOnAssistantMessages: false,
  thinkingFormat: "openai" as const,
  zaiToolStream: false,
  supportsThinkingTokenBudget: false,
  supportsOpenAIGrammarTools: false,
  supportsStrictMode: true,
  sendSessionAffinityHeaders: false,
  sessionAffinityFormat: "openai" as const,
  supportsLongCacheRetention: false,
  openRouterRouting: undefined,
  vercelGatewayRouting: undefined,
  cacheControlFormat: undefined,
  deferredToolsMode: undefined,
  chatTemplateKwargs: undefined,
  chatTemplateArgs: undefined,
});

function bytes(value: unknown): Uint8Array {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (value && ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  throw new Error("Pi fetch init.body 必须是 string/bytes");
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

async function assertObservedLocalToolchain(): Promise<void> {
  const root = process.cwd();
  const files = [
    ["node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js", FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES.pi_openai_completions_source_sha256],
    ["node_modules/@earendil-works/pi-ai/package.json", FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES.pi_package_json_sha256],
    ["node_modules/openai/package.json", FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES.openai_package_json_sha256],
    ["node_modules/openai/client.mjs", FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES.openai_client_source_sha256],
    ["node_modules/openai/internal/request-options.mjs", FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES.openai_request_encoder_source_sha256],
    ["node_modules/openai/resources/chat/completions/completions.mjs", FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES.openai_chat_completions_source_sha256],
  ] as const;
  await Promise.all(files.map(async ([path, expected]) => {
    const observed = sha256Hex(new Uint8Array(await readFile(resolve(root, path))));
    if (observed !== expected) throw new Error(`Pi fetch-boundary local toolchain hash mismatch: ${path}`);
  }));
}

/**
 * Runs the real Pi 0.84.1 openai-completions adapter through Models.complete
 * (never completeSimple) into an internal guarded fake fetch at example.invalid.
 * It proves local payload→SDK body equality only; it is not a production sender.
 */
export async function proveNonProductionFormalOraclePiFetchBoundary(input: {
  prepared: FormalOraclePreparedProviderRequestArtifactV1;
  signal?: AbortSignal;
}): Promise<FormalOraclePiFetchBoundaryProofV1> {
  assertFormalOraclePreparedProviderRequestArtifact(input.prepared);
  if (process.version !== FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES.observed_node_version) throw new Error("Pi fetch-boundary Node observation 与冻结 local hashes 不一致");
  await assertObservedLocalToolchain();
  const prepared = revalidateFormalOraclePreparedProviderRequestArtifact(input.prepared);
  const envelope = prepared.body;
  const user = envelope.messages[1].content;
  const contextContent: Array<TextContent | ImageContent> = user.map((item) => item.type === "text"
    ? { type: "text", text: item.text }
    : (() => {
      const match = /^data:(image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(item.image_url.url);
      if (!match) throw new Error("Pi fetch-boundary image data URL 无效");
      return { type: "image" as const, mimeType: match[1], data: match[2] };
    })());
  const providerId = "formal-oracle-pi-fetch-boundary-proof";
  const dummyApiKey = "formal-oracle-local-proof-no-network";
  const model: Model<"openai-completions"> = {
    id: envelope.model,
    name: envelope.model,
    api: "openai-completions",
    provider: providerId,
    baseUrl: "https://example.invalid/v1",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: envelope.max_completion_tokens,
    compat: COMPAT,
  };
  const models = createModels();
  models.setProvider(createProvider({
    id: providerId,
    name: "Formal Oracle non-production Pi fetch-boundary proof",
    baseUrl: model.baseUrl,
    auth: { apiKey: { name: "fixed local dummy key", resolve: async () => ({ auth: { apiKey: dummyApiKey }, source: "internal non-network fixture" }) } },
    models: [model],
    api: openAICompletionsApi(),
  }));

  let fetchCount = 0;
  let onPayloadCount = 0;
  let capturedRetry = "";
  const guardedFetch: typeof globalThis.fetch = async (request, init) => {
    fetchCount += 1;
    if (fetchCount !== 1) throw new Error("Pi fetch-boundary proof 检测到 duplicate/hidden retry");
    const url = String(request);
    const headers = new Headers(init?.headers);
    const actual = bytes(init?.body);
    if (url !== "https://example.invalid/v1/chat/completions" || init?.method !== "POST"
      || headers.get("content-type") !== "application/json" || headers.get("authorization") !== `Bearer ${dummyApiKey}`
      || headers.get("x-stainless-package-version") !== "6.26.0" || headers.get("x-stainless-runtime") !== "node"
      || headers.get("x-stainless-runtime-version") !== FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES.observed_node_version
      || headers.get("x-stainless-retry-count") !== "0" || !equal(actual, prepared.body_bytes)
      || sha256Hex(actual) !== prepared.provider_body_sha256) {
      throw new Error("Pi actual fetch init URL/header/body 未精确匹配 prepared artifact");
    }
    capturedRetry = headers.get("x-stainless-retry-count") ?? "";
    const fixture = [
      `data: ${JSON.stringify({ id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: envelope.model, choices: [{ index: 0, delta: { role: "assistant", content: "{}" }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: envelope.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    return new Response(fixture, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  const result = await models.complete(model, {
    systemPrompt: envelope.messages[0].content,
    messages: [{ role: "user", content: contextContent, timestamp: 0 }],
    tools: [],
  }, {
    apiKey: dummyApiKey,
    temperature: envelope.temperature,
    maxTokens: envelope.max_completion_tokens,
    samplingParams: { seed: envelope.seed },
    cacheRetention: "none",
    timeoutMs: prepared.timeout_ms,
    maxRetries: 0,
    maxRetryDelayMs: 0,
    signal: input.signal,
    fetch: guardedFetch,
    onPayload: (payload) => {
      onPayloadCount += 1;
      const observed = new TextEncoder().encode(JSON.stringify(payload));
      if (onPayloadCount !== 1 || !equal(observed, prepared.body_bytes) || sha256Hex(observed) !== prepared.provider_body_sha256) {
        throw new Error("Pi onPayload 与 prepared body 不一致或重复");
      }
      return undefined;
    },
  });
  // The fixture merely lets Pi drain the request path. Its parsed contents do
  // not prove the future strict raw-SSE/usage/stop capture contract.
  if (result.stopReason !== "stop" || fetchCount !== 1 || onPayloadCount !== 1 || capturedRetry !== "0") {
    throw new Error("Pi fetch-boundary request-path fixture/调用计数未闭合");
  }
  return Object.freeze({
    schema_version: "formal-oracle-pi-fetch-boundary-proof-v1",
    request_envelope_sha256: prepared.request_envelope_sha256,
    provider_body_sha256: prepared.provider_body_sha256,
    captured_url: "https://example.invalid/v1/chat/completions",
    captured_method: "POST",
    fetch_count: 1,
    on_payload_count: 1,
    on_payload_replacement: false,
    sdk_retry_count_header: "0",
    completion_method: "models.complete_non_simple",
    requested_max_tokens: envelope.max_completion_tokens,
    captured_max_completion_tokens: envelope.max_completion_tokens,
    redirect_policy_status: "pending_not_bound_by_pi_sdk_fetch_boundary",
    node_engine_status: "pending_incompatible_node_engine",
    runtime_toolchain_status: "pending_incompatible_node_engine_and_external_immutable_capsule",
    provider_endpoint_account_status: "pending_external_runtime_binding",
    provider_response_capture_status: "pending_strict_sse_capture_contract",
    external_toolchain_authenticity_status: "pending_external_immutable_capsule",
    proof_status: "local_fake_fetch_exact_body_proved_non_executable",
    api_execution_allowed: false,
  });
}
