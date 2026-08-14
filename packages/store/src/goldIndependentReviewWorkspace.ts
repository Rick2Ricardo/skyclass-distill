import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { GoldIndependentReviewerSlot, GoldIndependentReviewPacket } from "../../contracts/src/gold-independent-review-workspace.js";

const MANIFEST_URI = "research/board2skill/GOLD_INDEPENDENT_REVIEW_MANIFEST_V1.json";
const PACKAGE_URI = "research/board2skill/GOLD_INDEPENDENT_REVIEW_PACKAGE_V1.json";
const TEMPLATE_URIS: Record<GoldIndependentReviewerSlot, string> = {
  visual_reviewer: "research/board2skill/GOLD_INDEPENDENT_REVIEW_VISUAL_TEMPLATE_V1.json",
  physics_reviewer: "research/board2skill/GOLD_INDEPENDENT_REVIEW_PHYSICS_TEMPLATE_V1.json",
};
const MANIFEST_JSON_SHA256 = "1150a7a4f5283ab2e3c1688ecde1ceb5396ee4c62ccc758332880b12723af9b0";
const PACKAGE_JSON_SHA256 = "4eb8bc0e23526523903e97102cd4d69dfa8ac022467de0092f5cb54518d0eaed";
const MANIFEST_PAYLOAD_SHA256 = "87a8a583a884b8a6702f5db0a8fafdf747cce79404d06232ca5a94ddd815014e";
const REVIEW_PACKAGE_SHA256 = "21de05a19d9cdccf47c4aab05562cb1463d02d0a2eb275c567fd84186b7211e7";

const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const domainHash = (domain: string, value: unknown): string => sha256(`${domain}\0${JSON.stringify(value)}`);
const record = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]): boolean => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function inside(base: string, target: string): boolean {
  const path = relative(resolve(base), resolve(target));
  return path === "" || (!path.startsWith("..") && !path.startsWith("/") && !path.startsWith("\\"));
}

export function parseGoldIndependentReviewerSlot(value: unknown): GoldIndependentReviewerSlot {
  if (value !== "visual_reviewer" && value !== "physics_reviewer") throw new Error("reviewer slot 必须是 visual_reviewer 或 physics_reviewer");
  return value;
}

export class GoldIndependentReviewWorkspace {
  constructor(private readonly root: string) {}

  private async controlledBytes(uri: string, expectedSha256?: string, expectedLength?: number): Promise<Buffer> {
    const path = resolve(this.root, uri);
    if (!inside(this.root, path)) throw new Error(`独立评审资产越界: ${uri}`);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o022) !== 0) throw new Error(`独立评审资产不是受控普通文件: ${uri}`);
    const real = await realpath(path);
    if (!inside(this.root, real)) throw new Error(`独立评审资产真实路径越界: ${uri}`);
    const bytes = await readFile(real);
    if (expectedSha256 && sha256(bytes) !== expectedSha256) throw new Error(`独立评审资产 SHA 漂移: ${uri}`);
    if (expectedLength !== undefined && bytes.byteLength !== expectedLength) throw new Error(`独立评审资产长度漂移: ${uri}`);
    return bytes;
  }

  private async sources(slot: GoldIndependentReviewerSlot): Promise<{ manifest: Record<string, any>; template: Record<string, any>; templateSha: string }> {
    const packageBytes = await this.controlledBytes(PACKAGE_URI, PACKAGE_JSON_SHA256);
    const reviewPackage = JSON.parse(packageBytes.toString("utf8")) as unknown;
    if (!record(reviewPackage) || !exact(reviewPackage, ["schema_version", "manifest_payload_sha256", "manifest_json_sha256", "visual_template_sha256", "physics_template_sha256", "review_package_sha256"])) throw new Error("独立评审 package 字段无效");
    const { review_package_sha256: packageCommitment, ...packagePayload } = reviewPackage;
    if (reviewPackage.schema_version !== "gold-independent-review-package-v1" || packageCommitment !== REVIEW_PACKAGE_SHA256
      || packageCommitment !== domainHash("skyclass/gold-independent-review-package/v1", packagePayload)
      || reviewPackage.manifest_payload_sha256 !== MANIFEST_PAYLOAD_SHA256 || reviewPackage.manifest_json_sha256 !== MANIFEST_JSON_SHA256) throw new Error("独立评审 package 根无效");
    const templateSha = String(reviewPackage[slot === "visual_reviewer" ? "visual_template_sha256" : "physics_template_sha256"]);
    const [manifestBytes, templateBytes] = await Promise.all([
      this.controlledBytes(MANIFEST_URI, MANIFEST_JSON_SHA256),
      this.controlledBytes(TEMPLATE_URIS[slot], templateSha),
    ]);
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as unknown;
    const template = JSON.parse(templateBytes.toString("utf8")) as unknown;
    if (!record(manifest) || !record(template)) throw new Error("独立评审 manifest/template 无效");
    const { manifest_payload_sha256: manifestCommitment, ...manifestPayload } = manifest;
    if (manifestCommitment !== MANIFEST_PAYLOAD_SHA256 || manifestCommitment !== domainHash("skyclass/gold-independent-review-manifest/v1", manifestPayload)
      || !Array.isArray(manifest.cards) || manifest.cards.length !== 52) throw new Error("独立评审 manifest 根或分母无效");
    if (!exact(template, ["schema_version", "manifest_payload_sha256", "manifest_json_sha256", "reviewer_slot", "status", "reviewer_id", "reviewer_role", "instructions", "items"])
      || template.schema_version !== "gold-independent-assessment-v1" || template.reviewer_slot !== slot || template.status !== "unfilled_template"
      || template.reviewer_id !== null || template.reviewer_role !== null || template.manifest_payload_sha256 !== MANIFEST_PAYLOAD_SHA256
      || template.manifest_json_sha256 !== MANIFEST_JSON_SHA256 || !Array.isArray(template.items) || template.items.length !== 52) throw new Error("独立评审 template 无效");
    return { manifest, template, templateSha };
  }

  async packet(slotInput: unknown): Promise<GoldIndependentReviewPacket> {
    const slot = parseGoldIndependentReviewerSlot(slotInput);
    const { manifest, template, templateSha } = await this.sources(slot);
    const cards = new Map<string, Record<string, any>>();
    for (const card of manifest.cards) {
      if (!record(card) || typeof card.card_sha256 !== "string" || cards.has(card.card_sha256)) throw new Error("独立评审 card 无效或重复");
      const { card_sha256: commitment, ...payload } = card;
      if (commitment !== domainHash("skyclass/gold-independent-review-card/v1", payload)) throw new Error("独立评审 card commitment 无效");
      cards.set(commitment, card);
    }
    const seen = new Set<string>();
    const items = template.items.map((item: unknown, index: number) => {
      if (!record(item) || !exact(item, ["presentation_index", "card_sha256", "package_id", "group_id", "decision"])
        || item.presentation_index !== index + 1 || item.decision !== null || seen.has(String(item.card_sha256))) throw new Error("独立评审 template item 无效");
      const card = cards.get(String(item.card_sha256));
      if (!card || item.package_id !== card.package_id || item.group_id !== card.group_id) throw new Error("独立评审 template/card 混搭");
      seen.add(String(item.card_sha256));
      return { presentation_index: index + 1, card_sha256: String(item.card_sha256), package_id: String(item.package_id), group_id: String(item.group_id), card };
    });
    return {
      schema_version: "gold-independent-review-workspace-packet-v1",
      status: "read_only_frozen_evidence_local_draft_only",
      reviewer_slot: slot,
      manifest_payload_sha256: MANIFEST_PAYLOAD_SHA256,
      manifest_json_sha256: MANIFEST_JSON_SHA256,
      template_json_sha256: templateSha,
      review_package_sha256: REVIEW_PACKAGE_SHA256,
      assessment_header: {
        schema_version: "gold-independent-assessment-v1",
        manifest_payload_sha256: MANIFEST_PAYLOAD_SHA256,
        manifest_json_sha256: MANIFEST_JSON_SHA256,
        reviewer_slot: slot,
        instructions: template.instructions,
      },
      counts: { item_count: 52, evidence_asset_count: Number(manifest.counts.evidence_asset_count), evidence_byte_length: Number(manifest.counts.evidence_byte_length) },
      items: items as GoldIndependentReviewPacket["items"],
      invariants: {
        server_write_allowed: false,
        gold_decision_created: false,
        peer_completed_assessment_exposed: false,
        browser_draft_is_not_gold: true,
        reviewer_identity_is_external_governance: true,
      },
    };
  }

  async evidence(slotInput: unknown, cardSha256: string, index: number): Promise<{ bytes: Buffer; mime: string }> {
    if (!/^[a-f0-9]{64}$/.test(cardSha256) || !Number.isSafeInteger(index) || index < 0) throw new Error("独立评审 evidence 参数无效");
    const packet = await this.packet(slotInput);
    const item = packet.items.find((entry) => entry.card_sha256 === cardSha256);
    const evidence = item?.card.evidence[index];
    if (!item || !evidence || evidence.evidence_index !== index) throw new Error("独立评审 evidence 不存在");
    const bytes = await this.controlledBytes(evidence.asset_uri, evidence.sha256, evidence.byte_length);
    const extension = evidence.asset_uri.toLowerCase().split(".").at(-1);
    const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "image/png";
    return { bytes, mime };
  }
}
