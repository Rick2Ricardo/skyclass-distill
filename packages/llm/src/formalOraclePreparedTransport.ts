import { createModels, createProvider, type ImageContent, type Model, type TextContent } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES,
  FORMAL_ORACLE_REQUIRED_NODE_ENGINE,
  assertFormalOraclePreparedProviderRequestArtifact,
  revalidateFormalOraclePreparedProviderRequestArtifact,
  type FormalOraclePreparedProviderRequestArtifactV1,
} from "../../contracts/src/oracle-gate-provider-request.js";
import { sha256Hex } from "../../contracts/src/sha256.js";
import {
  buildFormalOraclePiResponseStreamFixtureV1,
  createFormalOraclePiResponseStreamArtifactV1,
  revalidateFormalOraclePiResponseStreamArtifactV1,
  type FormalOraclePiResponseStreamArtifactV1,
  type FormalOraclePiResponseStreamProofV1,
} from "../../contracts/src/oracle-gate-pi-response-stream.js";
import {
  hashFormalOraclePiFetchBoundaryProofV1,
  hashFormalOraclePiObservedLocalDependencyManifestV1,
  validateFormalOraclePiFetchBoundaryProofV1,
  type FormalOraclePiFetchBoundaryProofV1,
} from "../../contracts/src/oracle-gate-pi-fetch-boundary-proof.js";

export interface FormalOraclePiFetchBoundaryProofResultV1 {
  readonly proof: Readonly<FormalOraclePiFetchBoundaryProofV1>;
  readonly response_stream_artifact: FormalOraclePiResponseStreamArtifactV1;
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

function nodeVersionParts(value: string): [number, number, number] {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error(`Formal Oracle Node version 无效：${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function assertCompatibleNodeEngine(value: string): void {
  const [major, minor] = nodeVersionParts(value);
  if (major < 22 || (major === 22 && minor < 19)) {
    throw new Error(`Formal Oracle runtime Node ${value} 低于 ${FORMAL_ORACLE_REQUIRED_NODE_ENGINE}`);
  }
}

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
}): Promise<FormalOraclePiFetchBoundaryProofResultV1> {
  assertFormalOraclePreparedProviderRequestArtifact(input.prepared);
  assertCompatibleNodeEngine(process.version);
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
  let responseStreamArtifact: FormalOraclePiResponseStreamArtifactV1 | null = null;
  const guardedFetch: typeof globalThis.fetch = async (request, init) => {
    fetchCount += 1;
    if (fetchCount !== 1) throw new Error("Pi fetch-boundary proof 检测到 duplicate/hidden retry");
    const url = String(request);
    const headers = new Headers(init?.headers);
    const actual = bytes(init?.body);
    if (url !== "https://example.invalid/v1/chat/completions" || init?.method !== "POST"
      || headers.get("content-type") !== "application/json" || headers.get("authorization") !== `Bearer ${dummyApiKey}`
      || headers.get("x-stainless-package-version") !== "6.26.0" || headers.get("x-stainless-runtime") !== "node"
      || headers.get("x-stainless-runtime-version") !== process.version
      || headers.get("x-stainless-retry-count") !== "0" || !equal(actual, prepared.body_bytes)
      || sha256Hex(actual) !== prepared.provider_body_sha256) {
      throw new Error("Pi actual fetch init URL/header/body 未精确匹配 prepared artifact");
    }
    capturedRetry = headers.get("x-stainless-retry-count") ?? "";
    const fixture = buildFormalOraclePiResponseStreamFixtureV1({
      response_id: "chatcmpl-formal-fixture",
      model: envelope.model,
      created: 1,
      content_chunks: ["{\"schema_version\":", "\"teacher-evidence-response-v1\",", "\"observed_board_actions\":[],\"generalized_teaching_capability\":{\"name\":\"fixture\",\"mechanism\":\"fixture\",\"action_program\":[\"fixture\"]},\"evidence_claims\":[],\"uncertainties\":[]}"],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
        prompt_tokens_details: { cached_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 0 },
      },
    });
    responseStreamArtifact = createFormalOraclePiResponseStreamArtifactV1({
      raw_sse_bytes: fixture,
      expected_model: envelope.model,
      request_envelope_sha256: prepared.request_envelope_sha256,
      provider_body_sha256: prepared.provider_body_sha256,
      expected_max_input_tokens: prepared.max_input_tokens,
      expected_max_output_tokens: envelope.max_completion_tokens,
    });
    // Response snapshots this exact raw buffer; no equivalent string is built.
    const responseBuffer = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength) as ArrayBuffer;
    return new Response(responseBuffer, { status: 200, headers: { "Content-Type": "text/event-stream" } });
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
  if (result.stopReason !== "stop" || fetchCount !== 1 || onPayloadCount !== 1 || capturedRetry !== "0" || !responseStreamArtifact) {
    throw new Error("Pi fetch-boundary request-path fixture/调用计数未闭合");
  }
  const revalidatedResponseStreamArtifact = revalidateFormalOraclePiResponseStreamArtifactV1(responseStreamArtifact);
  const piText = result.content.filter((item): item is TextContent => item.type === "text").map((item) => item.text).join("");
  const expectedPiText = new TextDecoder("utf-8", { fatal: true }).decode(revalidatedResponseStreamArtifact.assistant_content_bytes);
  const expectedUsage = revalidatedResponseStreamArtifact.proof.normalized_usage;
  if (result.content.some((item) => item.type !== "text") || piText !== expectedPiText || result.responseId !== revalidatedResponseStreamArtifact.proof.response_id
    // Pi only populates responseModel when the provider chunk differs from the
    // requested model; the strict raw parser already rejects such drift.
    || result.responseModel !== undefined || result.rawStopReason !== "stop"
    || result.usage.input !== expectedUsage.input_tokens || result.usage.output !== expectedUsage.output_tokens
    || result.usage.cacheRead !== 0 || result.usage.cacheWrite !== 0 || result.usage.reasoning !== 0
    || result.usage.totalTokens !== expectedUsage.total_tokens) {
    throw new Error(`Pi decoded result 与 fetch-observed SSE artifact 不一致：${JSON.stringify({
      content_types: result.content.map((item) => item.type), pi_text_sha256: sha256Hex(new TextEncoder().encode(piText)),
      expected_text_sha256: revalidatedResponseStreamArtifact.proof.assistant_content_sha256,
      response_id: result.responseId, expected_response_id: revalidatedResponseStreamArtifact.proof.response_id,
      response_model: result.responseModel, expected_model: revalidatedResponseStreamArtifact.proof.model,
      raw_stop_reason: result.rawStopReason, usage: result.usage,
    })}`);
  }
  const proofPayload = {
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
    runtime_node_version: process.version,
    required_node_engine: FORMAL_ORACLE_REQUIRED_NODE_ENGINE,
    node_engine_status: "compatible_runtime_proved",
    runtime_toolchain_status: "runtime_engine_and_local_hashes_proved_external_immutable_capsule_pending",
    local_dependency_manifest_sha256: hashFormalOraclePiObservedLocalDependencyManifestV1(process.version),
    provider_endpoint_account_status: "pending_external_runtime_binding",
    local_fake_response_stream_proof: revalidatedResponseStreamArtifact.proof,
    provider_response_capture_status: "local_memory_fake_sse_proved_external_provider_pending",
    external_toolchain_authenticity_status: "pending_external_immutable_capsule",
    proof_status: "local_fake_fetch_exact_body_proved_non_executable",
    proof_sha256: "0".repeat(64),
    api_execution_allowed: false,
  } satisfies FormalOraclePiFetchBoundaryProofV1;
  proofPayload.proof_sha256 = hashFormalOraclePiFetchBoundaryProofV1(proofPayload);
  const proofReport = validateFormalOraclePiFetchBoundaryProofV1(proofPayload);
  if (!proofReport.valid) throw new Error(`Pi fetch-boundary proof 合同无效：${proofReport.issues[0]}`);
  const proof: FormalOraclePiFetchBoundaryProofV1 = Object.freeze(proofPayload);
  return Object.freeze({ proof, response_stream_artifact: revalidatedResponseStreamArtifact });
}
