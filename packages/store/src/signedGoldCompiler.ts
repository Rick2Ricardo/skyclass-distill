import { createHash } from "node:crypto";
import type {
  GoldReviewGroup,
  GoldReviewQueue,
  SignedGoldDataset,
  SignedGoldGroup,
  SignedGoldPackage,
} from "../../contracts/src/index.js";
import { canonicalSignedGoldDatasetPayload, validateSignedGoldDataset, validateSignedGoldRecordSignatures } from "../../contracts/src/index.js";
import { verifyImageEvidence } from "../../media/src/imageEvidence.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function signedGoldDatasetPayloadSha256(dataset: SignedGoldDataset): string {
  return sha256(canonicalSignedGoldDatasetPayload(dataset));
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function assertFiniteIso(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} 时间无效`);
  return timestamp;
}

function assertSignedQueue(queue: GoldReviewQueue): void {
  if (queue.schema_version !== "gold-review-queue-v1") throw new Error("Gold 队列 schema_version 无效");
  if (!queue.summary.paper_gold_ready) throw new Error("Paper Gold 尚未满足全部组裁决、全部包双签和最少接受事件门槛");
  if (queue.summary.accepted_event_count < queue.summary.minimum_required_event_count) throw new Error("Paper Gold 接受事件数低于冻结门槛");
  if (queue.packages.length !== queue.summary.package_count || queue.groups.length !== queue.summary.group_count) throw new Error("Gold 队列汇总计数不一致");
  if (queue.packages.some((item) => !item.fully_signed || item.package_signoffs.length !== 2)) throw new Error("Paper Gold 包必须完成双签");
  if (queue.groups.some((item) => !item.current_decision || !item.package_signed)) throw new Error("Paper Gold 组必须已有决策且所属包完成双签");
}

async function compileGroup(root: string, group: GoldReviewGroup): Promise<SignedGoldGroup | null> {
  const decision = group.current_decision;
  if (!decision) throw new Error(`Gold 组缺少决策：${group.package_id}/${group.group_id}`);
  if (decision.disposition !== "accept") {
    if (decision.final_events.length) throw new Error(`非接受组不得携带最终事件：${group.package_id}/${group.group_id}`);
    return null;
  }
  if (!decision.final_events.length) throw new Error(`接受组缺少最终事件：${group.package_id}/${group.group_id}`);
  if (!group.evidence.length) throw new Error(`接受组缺少视觉证据：${group.package_id}/${group.group_id}`);
  const verified = await Promise.all([...group.evidence]
    .sort((left, right) => compareText(`${left.path}:${left.sha256}`, `${right.path}:${right.sha256}`))
    .map(async (item) => {
      const image = await verifyImageEvidence({ root, assetUri: item.path, expectedSha256: item.sha256 });
      return {
        evidence_id: item.evidence_id,
        side: item.side,
        kind: item.kind,
        label: item.label,
        asset_uri: item.path,
        sha256: image.sha256,
        mime_type: image.mime_type,
        width: image.width,
        height: image.height,
        byte_length: image.byte_length,
      };
    }));
  const canonical = verified.find((item) => item.kind.toLowerCase().includes("comparison"));
  if (!canonical) throw new Error(`接受组缺少可用于多模态蒸馏的 comparison 证据：${group.package_id}/${group.group_id}`);
  return {
    group_id: group.group_id,
    alignment_class: group.alignment_class,
    decision_signature_sha256: decision.signature_sha256,
    decision_revision: decision.revision,
    // Preserve the exact signed decision order; re-sorting would sever the byte-level decision binding.
    final_events: [...decision.final_events],
    canonical_visual_evidence_id: canonical.evidence_id,
    visual_evidence: verified,
    speech_context: { text: group.speech_context, status: "context_not_gold" },
  };
}

export async function buildSignedGoldDataset(root: string, queue: GoldReviewQueue): Promise<SignedGoldDataset> {
  assertSignedQueue(queue);
  const packages: SignedGoldPackage[] = [];
  for (const reviewPackage of [...queue.packages].sort((left, right) => compareText(left.package_id, right.package_id))) {
    const sourceGroups = queue.groups
      .filter((item) => item.package_id === reviewPackage.package_id)
      .sort((left, right) => compareText(left.group_id, right.group_id));
    if (sourceGroups.length !== reviewPackage.group_count) throw new Error(`Gold 包组数不一致：${reviewPackage.package_id}`);
    const groups = (await Promise.all(sourceGroups.map((item) => compileGroup(root, item))))
      .filter((item): item is SignedGoldGroup => Boolean(item));
    const decisionSignatures = sourceGroups.map((item) => item.current_decision!.signature_sha256).sort(compareText);
    const signoffs = [...reviewPackage.package_signoffs].sort((left, right) => compareText(left.signoff_role, right.signoff_role));
    for (const signoff of signoffs) {
      if (JSON.stringify(signoff.decision_signatures) !== JSON.stringify(decisionSignatures)) {
        throw new Error(`Gold 包签字未覆盖当前全部决策：${reviewPackage.package_id}/${signoff.signoff_role}`);
      }
      assertFiniteIso(signoff.signed_at, `${reviewPackage.package_id}/${signoff.signoff_role}`);
    }
    const acceptedEventCount = groups.reduce((sum, item) => sum + item.final_events.length, 0);
    if (acceptedEventCount !== reviewPackage.accepted_event_count) throw new Error(`Gold 包接受事件计数不一致：${reviewPackage.package_id}`);
    packages.push({
      package_id: reviewPackage.package_id,
      source_video_id: reviewPackage.source_video_id,
      source_intake_uri: reviewPackage.intake_path,
      source_intake_sha256: reviewPackage.intake_sha256,
      reviewed_group_count: sourceGroups.length,
      accepted_group_count: groups.length,
      accepted_event_count: acceptedEventCount,
      decision_signatures: decisionSignatures,
      decisions: sourceGroups.map((item) => item.current_decision!).sort((left, right) => compareText(left.group_id, right.group_id)),
      signoffs,
      groups,
    });
  }
  const acceptedGroupCount = packages.reduce((sum, item) => sum + item.accepted_group_count, 0);
  const acceptedEventCount = packages.reduce((sum, item) => sum + item.accepted_event_count, 0);
  if (acceptedEventCount !== queue.summary.accepted_event_count) throw new Error("Gold 数据集接受事件总数与队列不一致");
  const signoffTimes = packages.flatMap((item) => item.signoffs.map((signoff) => assertFiniteIso(signoff.signed_at, signoff.package_id)));
  const frozenAt = new Date(Math.max(...signoffTimes)).toISOString();
  const payload = {
    schema_version: "signed-gold-dataset-v1" as const,
    status: "paper_gold_signed" as const,
    frozen_at: frozenAt,
    source_queue_schema_version: queue.schema_version,
    package_count: packages.length,
    reviewed_group_count: queue.groups.length,
    accepted_group_count: acceptedGroupCount,
    accepted_event_count: acceptedEventCount,
    minimum_required_event_count: queue.summary.minimum_required_event_count,
    packages,
  };
  const datasetSha256 = sha256(canonicalSignedGoldDatasetPayload(payload));
  const dataset: SignedGoldDataset = {
    dataset_id: `signed-gold-${datasetSha256.slice(0, 16)}`,
    dataset_sha256: datasetSha256,
    ...payload,
  };
  const report = validateSignedGoldDataset(dataset);
  if (!report.valid) throw new Error(`Signed Gold 编译结果无效：${report.issues.slice(0, 6).map((item) => `${item.path} ${item.message}`).join("；")}`);
  const signatureIssues = validateSignedGoldRecordSignatures(dataset, sha256);
  if (signatureIssues.length) throw new Error(`Signed Gold 签字链无效：${signatureIssues.slice(0, 6).map((item) => `${item.path} ${item.message}`).join("；")}`);
  return dataset;
}
