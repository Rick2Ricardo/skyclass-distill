import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmCallControl, LlmRequestAudit } from "../../llm/src/client.js";
import type { OraclePilotArm, OraclePilotPackage } from "./oraclePilot.js";

vi.mock("./oraclePilot.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./oraclePilot.js")>()),
  validateOraclePilotPairing: () => [],
}));

import {
  assertOracleGateFormalReadiness,
  runOracleGateSmoke,
  validateOracleGateResponse,
  type OracleGateSmokeConfig,
} from "./oracleGateRunner.js";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const roots: string[] = [];
const arms: OraclePilotArm[] = ["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function pilot(sha256: string): OraclePilotPackage {
  const samples = ["case-1", "case-2"].flatMap((caseId) => arms.map((arm) => ({
    case_id: caseId,
    arm,
    evidence_mode: arm === "transcript_only" ? "text" as const : arm === "oracle_delta" ? "temporal_board" as const : "static_frames" as const,
    source_video_id: "video-1",
    delta_id: `delta-${caseId}`,
    time: { start: 1, end: 2 },
    speech_ids: [`speech-${caseId}`],
    transcript: "老师说明板书变化。",
    evidence_text: arm === "oracle_delta" ? "提供 before/delta/after。" : "提供配对证据。",
    image_assets: arm === "transcript_only" ? [] : [{ asset_uri: "source.png", sha256 }],
    paired_context_sha256: "a".repeat(64),
    condition_sha256: createHash("sha256").update(`${caseId}-${arm}`).digest("hex"),
  })));
  return {
    schema_version: "oracle-pilot-package-v1",
    bundle_id: "fixture-bundle",
    protocol: {
      protocol_version: "oracle-value-gate-v1",
      prompt_version: "oracle-gate-prompt-v1",
      visual_items_per_visual_arm: 1,
      speech_window_seconds: 3,
      visual_budget_rule: "one_preprocessed_canvas_per_visual_arm",
      runtime_pixel_and_token_audit_required: true,
    },
    samples,
    blind_evaluation_items: [],
    answer_key: samples.map((sample) => ({
      blind_id: `blind-${sample.case_id}-${sample.arm}`,
      paired_case_id: `paired-${sample.case_id}`,
      case_id: sample.case_id,
      arm: sample.arm,
      evidence_mode: sample.evidence_mode,
      condition_sha256: sample.condition_sha256,
    })),
  };
}

const config: OracleGateSmokeConfig = {
  schema_version: "oracle-gate-smoke-config-v1",
  prompt_version: "oracle-gate-prompt-v1",
  output_schema_version: "teacher-evidence-response-v1",
  seeds: [17],
  temperature: 0,
  max_output_tokens: 1024,
  cache_retention: "none",
  transport: "pi",
  tools_policy: "none",
  canvas: { mime_type: "image/jpeg", width: 1920, height: 360, quality: 88 },
};

describe("Oracle Gate executable smoke", () => {
  it("runs exactly 2 cases x 4 arms through the same frozen Pi protocol", async () => {
    const root = await mkdtemp(join(tmpdir(), "oracle-gate-"));
    roots.push(root);
    await writeFile(join(root, "source.png"), PNG_1X1);
    await writeFile(join(root, "bundle.json"), "{}\n");
    const sha256 = createHash("sha256").update(PNG_1X1).digest("hex");
    const calls: Array<{ imageCount: number; control?: LlmCallControl; audit: LlmRequestAudit }> = [];
    const client = {
      options: { model: "vision-fixture" },
      async chatJsonAudited(system: string, user: string, images = [], temperature = 0, control?: LlmCallControl) {
        const submittedVisuals = images.map((image: { label: string; bytes?: Uint8Array; sha256?: string; mime_type?: "image/jpeg" }) => ({
          label: image.label,
          sha256: String(image.sha256),
          mime_type: image.mime_type ?? "image/jpeg",
          byte_length: image.bytes?.byteLength ?? 0,
        }));
        const audit: LlmRequestAudit = {
          request_sha256: createHash("sha256").update(JSON.stringify({
            model: "vision-fixture",
            system,
            user,
            temperature,
            control: {
              transport: control?.transport ?? "auto",
              max_output_tokens: control?.maxOutputTokens ?? null,
              seed: control?.seed ?? null,
              cache_retention: control?.cacheRetention ?? null,
              tools_policy: "none",
            },
            visuals: submittedVisuals,
          })).digest("hex"),
          model: "vision-fixture",
          attempt_count: 1,
          submitted_visuals: submittedVisuals,
          provider_response_received: true,
          stop_reason: "stop",
          usage: { input: 100, output: 20, totalTokens: 120 },
          transport: "pi",
          temperature,
          max_output_tokens: control?.maxOutputTokens ?? null,
          seed: control?.seed ?? null,
          cache_retention: control?.cacheRetention ?? null,
          tools_policy: "none",
        };
        calls.push({ imageCount: images.length, control, audit });
        return {
          value: {
            schema_version: "teacher-evidence-response-v1",
            observed_board_actions: [],
            generalized_teaching_capability: { name: "证据约束讲解", mechanism: "先观察再抽象", action_program: ["确认可见变化"] },
            evidence_claims: [],
            uncertainties: ["Alice passed the exam"],
          },
          audit,
        };
      },
    };
    const result = await runOracleGateSmoke({ client, pilot: pilot(sha256), bundlePath: join(root, "bundle.json"), config });
    expect(calls).toHaveLength(8);
    expect(calls.map((call) => call.imageCount)).toEqual([0, 1, 1, 1, 0, 1, 1, 1]);
    expect(calls.every((call) => call.control?.transport === "pi"
      && call.control.cacheRetention === "none"
      && call.control.maxOutputTokens === 1024
      && call.control.seed === 17)).toBe(true);
    expect(result.manifest).toMatchObject({ decision: "not_evaluable", case_count: 2, request_count: 8, seed_count: 1 });
    expect(result.private_run_records.filter((record) => record.canonical_visual).every((record) => (
      record.canonical_visual?.width === 1920
      && record.canonical_visual.height === 360
      && record.canonical_visual.mime_type === "image/jpeg"
    ))).toBe(true);
    expect(JSON.stringify(result.blind_items)).not.toMatch(/transcript_only|static_final_board|uniform_frame|oracle_delta|condition_sha256/);
    expect(result.private_answer_key).toHaveLength(8);
    expect(result.blind_items.every((item) => JSON.stringify(item.response).includes("Alice passed the exam"))).toBe(true);
  });

  it("keeps the formal path closed until Gold, teacher, seed, and temporal gates are satisfied", () => {
    expect(() => assertOracleGateFormalReadiness({
      event_count: 2, signed_event_count: 0, teacher_ids: ["teacher-1"], seeds: [1], multi_edit_window_count: 0,
    })).toThrow("至少需要 30 个 Gold 事件");
    expect(() => assertOracleGateFormalReadiness({
      event_count: 30, signed_event_count: 30, teacher_ids: ["teacher-1", "teacher-2"], seeds: [1, 2, 3], multi_edit_window_count: 1,
    })).not.toThrow();
    expect(() => assertOracleGateFormalReadiness({
      event_count: Number.POSITIVE_INFINITY, signed_event_count: Number.POSITIVE_INFINITY,
      teacher_ids: ["teacher-1", "teacher-2"], seeds: [1, 2, 3], multi_edit_window_count: 1,
    })).toThrow("有限非负安全整数");
    expect(() => assertOracleGateFormalReadiness({
      event_count: 30, signed_event_count: 30, teacher_ids: [" ", "  "], seeds: [1, 2, 3], multi_edit_window_count: 1,
    })).toThrow("至少需要 2 位教师");
    expect(() => assertOracleGateFormalReadiness({
      event_count: 30, signed_event_count: 30, teacher_ids: ["teacher-1", "teacher-2"], seeds: [1, Number.NaN, 3], multi_edit_window_count: 1,
    })).toThrow("formal seed 必须是安全整数");
  });

  it("rejects a provider-selected retry instead of admitting it as one randomized observation", async () => {
    const root = await mkdtemp(join(tmpdir(), "oracle-gate-retry-"));
    roots.push(root);
    await writeFile(join(root, "source.png"), PNG_1X1);
    await writeFile(join(root, "bundle.json"), "{}\n");
    const sha256 = createHash("sha256").update(PNG_1X1).digest("hex");
    const client = {
      options: { model: "vision-fixture" },
      async chatJsonAudited(system: string, user: string, images = [], temperature = 0, control?: LlmCallControl) {
        const submittedVisuals = images.map((image: { label: string; bytes?: Uint8Array; sha256?: string; mime_type?: "image/jpeg" }) => ({
          label: image.label, sha256: String(image.sha256), mime_type: image.mime_type ?? "image/jpeg", byte_length: image.bytes?.byteLength ?? 0,
        }));
        return {
          value: { schema_version: "teacher-evidence-response-v1", observed_board_actions: [], generalized_teaching_capability: { name: "能力", mechanism: "机制", action_program: ["动作"] }, evidence_claims: [], uncertainties: [] },
          audit: {
            request_sha256: createHash("sha256").update(JSON.stringify({ model: "vision-fixture", system, user, temperature, control: { transport: control?.transport ?? "auto", max_output_tokens: control?.maxOutputTokens ?? null, seed: control?.seed ?? null, cache_retention: control?.cacheRetention ?? null, tools_policy: "none" }, visuals: submittedVisuals })).digest("hex"),
            model: "vision-fixture", attempt_count: 2, submitted_visuals: submittedVisuals, provider_response_received: true, stop_reason: "stop", usage: { input: 10, output: 10, totalTokens: 20 }, transport: "pi", temperature, max_output_tokens: control?.maxOutputTokens ?? null, seed: control?.seed ?? null, cache_retention: control?.cacheRetention ?? null, tools_policy: "none",
          } satisfies LlmRequestAudit,
        };
      },
    };
    await expect(runOracleGateSmoke({ client, pilot: pilot(sha256), bundlePath: join(root, "bundle.json"), config }))
      .rejects.toThrow("必须是单次 attempt");
  });

  it("freezes the FIX prompt as a single region-claim decoupling intervention", async () => {
    const root = await mkdtemp(join(tmpdir(), "oracle-gate-fix-prompt-"));roots.push(root);await writeFile(join(root,"source.png"),PNG_1X1);await writeFile(join(root,"bundle.json"),"{}\n");const sha256=createHash("sha256").update(PNG_1X1).digest("hex");const prompts:string[]=[];
    const client={options:{model:"vision-fixture"},async chatJsonAudited(system:string,user:string,images=[],temperature=0,control?:LlmCallControl){prompts.push(user);const submittedVisuals=images.map((image:{label:string;bytes?:Uint8Array;sha256?:string;mime_type?:"image/jpeg"})=>({label:image.label,sha256:String(image.sha256),mime_type:image.mime_type??"image/jpeg",byte_length:image.bytes?.byteLength??0}));return{value:{schema_version:"teacher-evidence-response-v1",observed_board_actions:[],generalized_teaching_capability:{name:"能力",mechanism:"机制",action_program:["动作"]},evidence_claims:[],uncertainties:[]},audit:{request_sha256:createHash("sha256").update(JSON.stringify({model:"vision-fixture",system,user,temperature,control:{transport:control?.transport??"auto",max_output_tokens:control?.maxOutputTokens??null,seed:control?.seed??null,cache_retention:control?.cacheRetention??null,tools_policy:"none"},visuals:submittedVisuals})).digest("hex"),model:"vision-fixture",attempt_count:1,submitted_visuals:submittedVisuals,provider_response_received:true,stop_reason:"stop",usage:{input:10,output:10,totalTokens:20},transport:"pi",temperature,max_output_tokens:control?.maxOutputTokens??null,seed:control?.seed??null,cache_retention:control?.cacheRetention??null,tools_policy:"none"} satisfies LlmRequestAudit};}};
    const fixPilot=pilot(sha256);fixPilot.protocol.prompt_version="oracle-gate-prompt-v2-region-claim-decoupled";await runOracleGateSmoke({client,pilot:fixPilot,bundlePath:join(root,"bundle.json"),config:{...config,prompt_version:"oracle-gate-prompt-v2-region-claim-decoupled"}});expect(prompts).toHaveLength(8);expect(prompts.every((prompt)=>prompt.includes("操作类型、板书内容、区域位置不得捆绑")&&prompt.includes("region 仅保留在 observed_board_actions.region"))).toBe(true);
  });

  it("rejects nested condition leakage and evidence slots unavailable to the text arm", () => {
    const response = {
      schema_version: "teacher-evidence-response-v1",
      observed_board_actions: [],
      generalized_teaching_capability: { name: "能力", mechanism: "机制", action_program: ["动作"] },
      evidence_claims: [{ claim: "看到了图", evidence_slot: "visual-1" }],
      uncertainties: [],
    };
    expect(() => validateOracleGateResponse(response, "transcript_only")).toThrow("evidence_slot 无效");
    expect(() => validateOracleGateResponse({
      ...response,
      evidence_claims: [],
      generalized_teaching_capability: { ...response.generalized_teaching_capability, arm: "oracle_delta" },
    }, "transcript_only")).toThrow("字段集合无效");
  });
});
