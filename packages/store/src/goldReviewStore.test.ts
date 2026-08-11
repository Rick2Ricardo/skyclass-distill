import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GoldReviewStore } from "./goldReviewStore.js";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; data: string; store: GoldReviewStore; intakePath: string }> {
  const root = await mkdtemp(join(tmpdir(), "gold-review-root-"));
  const data = await mkdtemp(join(tmpdir(), "gold-review-data-"));
  created.push(root, data);
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const imageHash = createHash("sha256").update(image).digest("hex");
  const manifestPath = join(root, "research/board2skill/oracle_pilot_clips.json");
  const intakePath = join(root, "research/board2skill/intake.json");
  const imagePath = join(root, "data/evidence.jpg");
  await Promise.all([mkdir(dirname(manifestPath), { recursive: true }), mkdir(dirname(imagePath), { recursive: true })]);
  await writeFile(imagePath, image);
  await writeFile(manifestPath, JSON.stringify({ clips: [{ oracle_annotation: { adjudication_intake_path: "research/board2skill/intake.json" } }] }));
  await writeFile(intakePath, JSON.stringify({
    schema_version: "temporal-board-adjudication-intake-v1",
    package_id: "package-1",
    source_video_id: "video-1",
    items: [{
      group_id: "G01",
      alignment_class: "matched",
      alignment_window: { start: 10, end: 12 },
      a_side: { events: [{ event_id: "a-1", operation: "add", time: { start: 10, end: 12 }, semantic_label: "新增箭头", status: "needs_review" }] },
      b_side: { events: [{ event_id: "b-1", operation: "add", time: { start: 10.1, end: 11.9 }, semantic_label: "新增箭头", status: "needs_review" }] },
      evidence_assets: [{ side: "A", kind: "comparison", path: "data/evidence.jpg", sha256: imageHash }],
      proposal: { candidate_events: [{ candidate_id: "G01-C1", source_event_refs: ["a-1", "b-1"], operation: "add", time: { start: 10, end: 12 }, semantic_label: "新增箭头" }] },
      unresolved_fields: ["边界"],
    }],
  }));
  return { root, data, store: new GoldReviewStore(root, data), intakePath };
}

describe("GoldReviewStore", () => {
  it("normalizes intakes and keeps review revisions append-only", async () => {
    const { store } = await fixture();
    const queue = await store.queue();
    expect(queue.summary).toMatchObject({ package_count: 1, group_count: 1, decided_count: 0, paper_gold_ready: false });
    expect(queue.groups[0].candidates[0]).toMatchObject({ candidate_id: "G01-C1", operation: "ADD", acceptance_ready: true });

    const accepted = await store.decide({
      package_id: "package-1",
      group_id: "G01",
      disposition: "accept",
      selected_candidate_ids: ["G01-C1"],
      adjudicator_id: "expert-1",
      adjudicator_role: "physics-reviewer",
      rationale: "A/B 视觉证据一致，边界采用共同包络。",
    });
    expect(accepted).toMatchObject({ revision: 1, disposition: "accept" });
    expect(accepted.final_events).toHaveLength(1);

    const revised = await store.decide({
      package_id: "package-1",
      group_id: "G01",
      disposition: "unknown",
      adjudicator_id: "expert-1",
      adjudicator_role: "physics-reviewer",
      rationale: "重新检查后发现遮挡，暂不纳入 Gold。",
    });
    expect(revised.revision).toBe(2);
    expect(revised.parent_signature_sha256).toBe(accepted.signature_sha256);
    expect((await store.queue()).groups[0].current_decision?.signature_sha256).toBe(revised.signature_sha256);
  });

  it("freezes a package only after every group is decided", async () => {
    const { store } = await fixture();
    await expect(store.signPackage({ package_id: "package-1", signoff_role: "visual_adjudicator", adjudicator_id: "expert-1", adjudicator_role: "visual-reviewer", statement: "我确认全部事件已经完成复核并冻结。" }))
      .rejects.toThrow("每个 review group");
    await store.decide({
      package_id: "package-1",
      group_id: "G01",
      disposition: "reject",
      adjudicator_id: "expert-1",
      adjudicator_role: "physics-reviewer",
      rationale: "变化不满足持久性门槛，因此拒绝。",
    });
    const signoff = await store.signPackage({
      package_id: "package-1",
      signoff_role: "visual_adjudicator",
      adjudicator_id: "expert-1",
      adjudicator_role: "visual-reviewer",
      statement: "我确认本包全部组已按冻结规范完成人工裁决。",
    });
    expect(signoff.decision_signatures).toHaveLength(1);
    expect((await store.queue()).summary).toMatchObject({ signed_package_count: 0, minimum_required_event_count: 30, paper_gold_ready: false });
    expect((await store.queue()).groups[0]).toMatchObject({ package_locked: true, package_signed: false });
    await expect(store.decide({
      package_id: "package-1",
      group_id: "G01",
      disposition: "unknown",
      adjudicator_id: "expert-1",
      adjudicator_role: "physics-reviewer",
      rationale: "签字后不应允许再修改这一组。",
    })).rejects.toThrow("签字锁定");
    await expect(store.signPackage({
      package_id: "package-1",
      signoff_role: "physics_reviewer",
      adjudicator_id: "expert-1",
      adjudicator_role: "physics-reviewer",
      statement: "我确认物理内容准确，并同意冻结当前仲裁包。",
    })).rejects.toThrow("不同人员");
    await store.signPackage({
      package_id: "package-1",
      signoff_role: "physics_reviewer",
      adjudicator_id: "expert-2",
      adjudicator_role: "physics-reviewer",
      statement: "我确认物理内容准确，并同意冻结当前仲裁包。",
    });
    expect((await store.queue()).summary.signed_package_count).toBe(1);
  });

  it("serves only frozen evidence with a matching hash", async () => {
    const { root, store } = await fixture();
    expect((await store.evidence("package-1", "G01", 0)).mime).toBe("image/png");
    await writeFile(join(root, "data/evidence.jpg"), "tampered");
    await expect(store.evidence("package-1", "G01", 0)).rejects.toThrow("SHA-256");
    await expect(store.evidence("package-1", "G01", 1)).rejects.toThrow("不存在");
  });

  it("fails closed when a signed source intake changes", async () => {
    const { root, store } = await fixture();
    await store.decide({
      package_id: "package-1",
      group_id: "G01",
      disposition: "reject",
      adjudicator_id: "expert-1",
      adjudicator_role: "physics-reviewer",
      rationale: "该事件不满足冻结规范，因此拒绝。",
    });
    const intakePath = join(root, "research/board2skill/intake.json");
    const intake = JSON.parse(await readFile(intakePath, "utf8"));
    intake.items[0].alignment_class = "tampered";
    await writeFile(intakePath, JSON.stringify(intake));
    await expect(store.queue()).rejects.toThrow("决策链校验失败");
  });

  it("rejects forged or duplicated final events", async () => {
    const { store } = await fixture();
    const base = {
      package_id: "package-1",
      group_id: "G01",
      disposition: "accept" as const,
      selected_candidate_ids: ["G01-C1"],
      adjudicator_id: "expert-1",
      adjudicator_role: "physics-reviewer",
      rationale: "A/B 证据一致，采用共同可见边界。",
    };
    const event = {
      event_id: "G01-C1",
      source_event_refs: ["a-1", "b-1"],
      operation: "ADD" as const,
      time: { start: 10, end: 12 },
      semantic_label: "新增箭头",
      region: null,
      relation: null,
      modification: null,
    };
    await expect(store.decide({ ...base, final_events: [{ ...event, event_id: "forged" }] })).rejects.toThrow(/不对应|恰好对应/);
    await expect(store.decide({ ...base, final_events: [event, event] })).rejects.toThrow(/重复|恰好对应/);
    await expect(store.decide({ ...base, final_events: [{ ...event, source_event_refs: ["a-1"] }] })).rejects.toThrow("冻结来源");
    await expect(store.decide({ ...base, final_events: [{ ...event, operation: "ERASE" }] })).rejects.toThrow("改变候选操作");
    await expect(store.decide({ ...base, final_events: [{ ...event, time: { start: 1, end: 2 } }] })).rejects.toThrow("证据窗口");
  });

  it("requires relation and modification closure for typed operations", async () => {
    const { store } = await fixture();
    const input = {
      package_id: "package-1",
      group_id: "G01",
      disposition: "accept" as const,
      selected_candidate_ids: ["G01-C1"],
      adjudicator_id: "expert-1",
      adjudicator_role: "physics-reviewer",
      rationale: "人工尝试改变操作类型，应被系统拒绝。",
      final_events: [{
        event_id: "G01-C1",
        source_event_refs: ["a-1", "b-1"],
        operation: "CONNECT" as const,
        time: { start: 10, end: 12 },
        semantic_label: "连接两个对象",
        region: null,
        relation: null,
        modification: null,
      }],
    };
    await expect(store.decide(input)).rejects.toThrow(/改变候选操作|relation closure/);
  });

  it("serializes concurrent revisions without corrupting the append-only chain", async () => {
    const { store } = await fixture();
    const common = {
      package_id: "package-1",
      group_id: "G01",
      adjudicator_id: "expert-1",
      adjudicator_role: "physics-reviewer",
    };
    const results = await Promise.all([
      store.decide({ ...common, disposition: "reject", rationale: "第一位复核者认为证据不足以构成事件。" }),
      store.decide({ ...common, disposition: "unknown", rationale: "第二次复核保守标记为证据仍然不足。" }),
    ]);
    expect(results.map((item) => item.revision).sort()).toEqual([1, 2]);
    expect((await store.queue()).groups[0].current_decision?.revision).toBe(2);
  });

  it("serializes package signoff against concurrent decisions", async () => {
    const { store } = await fixture();
    await store.decide({
      package_id: "package-1", group_id: "G01", disposition: "reject", adjudicator_id: "expert-1",
      adjudicator_role: "visual-reviewer", rationale: "视觉证据不满足事件持久性门槛，因此拒绝。",
    });
    const results = await Promise.allSettled([
      store.signPackage({
        package_id: "package-1", signoff_role: "visual_adjudicator", adjudicator_id: "expert-1",
        adjudicator_role: "visual-reviewer", statement: "我确认全部组已经按视觉证据完成裁决并锁定。",
      }),
      store.decide({
        package_id: "package-1", group_id: "G01", disposition: "unknown", adjudicator_id: "expert-2",
        adjudicator_role: "physics-reviewer", rationale: "签字同时发起的修订不应破坏冻结链。",
      }),
    ]);
    expect(results.map((item) => item.status)).toEqual(["fulfilled", "rejected"]);
    expect((await store.queue()).groups[0]).toMatchObject({ package_locked: true, current_decision: { revision: 1 } });
  });

  it("requires exact candidate coverage, visual evidence, and observation-only labels", async () => {
    const first = await fixture();
    const intake = JSON.parse(await readFile(first.intakePath, "utf8"));
    intake.items[0].proposal.candidate_events.push({
      candidate_id: "G01-C2", source_event_refs: ["a-1", "b-1"], operation: "add",
      time: { start: 10, end: 12 }, semantic_label: "新增第二个箭头",
    });
    await writeFile(first.intakePath, JSON.stringify(intake));
    await expect(first.store.decide({
      package_id: "package-1", group_id: "G01", disposition: "accept", selected_candidate_ids: ["G01-C1", "G01-C2"],
      final_events: [{
        event_id: "G01-C1", source_event_refs: ["a-1", "b-1"], operation: "ADD", time: { start: 10, end: 12 },
        semantic_label: "新增箭头", region: null, relation: null, modification: null,
      }],
      adjudicator_id: "expert-1", adjudicator_role: "visual-reviewer", rationale: "两个候选必须各自形成一个最终事件。",
    })).rejects.toThrow("恰好对应");
    await expect(first.store.decide({
      package_id: "package-1", group_id: "G01", disposition: "accept", selected_candidate_ids: ["G01-C1"],
      final_events: [{
        event_id: "G01-C1", source_event_refs: ["a-1", "b-1"], operation: "ADD", time: { start: 10, end: 12 },
        semantic_label: "学生已经理解摩擦力方向", region: null, relation: null, modification: null,
      }],
      adjudicator_id: "expert-1", adjudicator_role: "visual-reviewer", rationale: "可见语义不得伪造学生已经学会的结果。",
    })).rejects.toThrow("学生学习结果");
    for (const semanticLabel of [
      "全班都掌握了摩擦力方向", "大家都听懂了牛顿定律", "学习效果显著提高", "students now understand friction",
      "孩子已经掌握了摩擦力方向", "学生对摩擦力方向很熟悉", "全体均已掌握牛顿定律", "班级正确率提高", "小明答对了这道题",
    ]) {
      await expect(first.store.decide({
        package_id: "package-1", group_id: "G01", disposition: "accept", selected_candidate_ids: ["G01-C1"],
        final_events: [{
          event_id: "G01-C1", source_event_refs: ["a-1", "b-1"], operation: "ADD", time: { start: 10, end: 12 },
          semantic_label: semanticLabel, region: null, relation: null, modification: null,
        }],
        adjudicator_id: "expert-1", adjudicator_role: "visual-reviewer", rationale: "禁止把无法观察的学习结果写成板书语义事实。",
      })).rejects.toThrow("学生学习结果");
    }

    const second = await fixture();
    const noEvidence = JSON.parse(await readFile(second.intakePath, "utf8"));
    noEvidence.items[0].evidence_assets = [];
    await writeFile(second.intakePath, JSON.stringify(noEvidence));
    await expect(second.store.decide({
      package_id: "package-1", group_id: "G01", disposition: "accept", selected_candidate_ids: ["G01-C1"],
      adjudicator_id: "expert-1", adjudicator_role: "visual-reviewer", rationale: "没有视觉证据时必须拒绝接受事件。",
    })).rejects.toThrow("视觉证据");
  });

  it("re-verifies visual evidence bytes before accepting a decision", async () => {
    const { root, store, intakePath } = await fixture();
    const fake = Buffer.from("not-a-decodable-image");
    const intake = JSON.parse(await readFile(intakePath, "utf8"));
    intake.items[0].evidence_assets[0].sha256 = createHash("sha256").update(fake).digest("hex");
    await writeFile(join(root, "data/evidence.jpg"), fake);
    await writeFile(intakePath, JSON.stringify(intake));
    await expect(store.decide({
      package_id: "package-1", group_id: "G01", disposition: "accept", selected_candidate_ids: ["G01-C1"],
      adjudicator_id: "expert-1", adjudicator_role: "visual-reviewer", rationale: "即使哈希匹配，也必须是能够完整解码的真实图像。",
    })).rejects.toThrow(/图像|解码|PNG|JPEG/);
    expect((await store.queue()).summary.decided_count).toBe(0);
  });

  it("rejects an intake symlink that resolves outside the repository", async () => {
    const { data, store, intakePath } = await fixture();
    const outside = join(data, "outside-intake.json");
    await writeFile(outside, await readFile(intakePath));
    await rm(intakePath);
    await symlink(outside, intakePath);
    await expect(store.queue()).rejects.toThrow("真实路径越界");
  });

  it("fails closed when compiling an unsigned or undersized Paper Gold queue", async () => {
    const { store } = await fixture();
    await expect(store.compileDataset()).rejects.toThrow("Paper Gold 尚未满足");
  });

  it("compiles a fully signed 30-event queue into one deterministic content-addressed dataset", async () => {
    const { data, store, intakePath } = await fixture();
    const intake = JSON.parse(await readFile(intakePath, "utf8"));
    intake.items[0].proposal.candidate_events = Array.from({ length: 30 }, (_, index) => ({
      candidate_id: `G01-C${index + 1}`,
      source_event_refs: ["a-1", "b-1"],
      operation: "add",
      time: { start: 10, end: 12 },
      semantic_label: `新增可见箭头 ${index + 1}`,
    }));
    await writeFile(intakePath, JSON.stringify(intake));
    const queue = await store.queue();
    const selected = queue.groups[0].candidates.map((item) => item.candidate_id);
    await store.decide({
      package_id: "package-1", group_id: "G01", disposition: "accept", selected_candidate_ids: selected,
      adjudicator_id: "expert-1", adjudicator_role: "visual-reviewer", rationale: "三十个事件均有同组视觉证据并逐项确认。",
    });
    await store.signPackage({
      package_id: "package-1", signoff_role: "visual_adjudicator", adjudicator_id: "expert-1",
      adjudicator_role: "visual-reviewer", statement: "我确认全部视觉事件已经逐项核验并锁定当前决策。",
    });
    await store.signPackage({
      package_id: "package-1", signoff_role: "physics_reviewer", adjudicator_id: "expert-2",
      adjudicator_role: "physics-reviewer", statement: "我确认物理语义准确并同意将当前版本冻结为 Gold。",
    });
    const first = await store.compileDataset();
    const second = await store.compileDataset();
    expect(second).toEqual(first);
    expect(first.dataset).toMatchObject({
      schema_version: "signed-gold-dataset-v1",
      status: "paper_gold_signed",
      package_count: 1,
      reviewed_group_count: 1,
      accepted_group_count: 1,
      accepted_event_count: 30,
    });
    expect(first.dataset.packages[0].groups[0].final_events.map((item) => item.event_id))
      .toEqual(first.dataset.packages[0].decisions[0].final_events.map((item) => item.event_id));
    expect(first.dataset.packages[0].groups[0].speech_context.status).toBe("context_not_gold");
    expect(first.dataset.packages[0].groups[0].visual_evidence[0]).toMatchObject({ mime_type: "image/png", width: 1, height: 1 });
    expect(first.dataset_uri).toBe(`board2skill/signed-gold/${first.dataset.dataset_sha256}/dataset.json`);
    expect(JSON.parse(await readFile(join(data, first.dataset_uri), "utf8"))).toEqual(first.dataset);

    const outside = await mkdtemp(join(tmpdir(), "signed-gold-outside-"));
    created.push(outside);
    const contentDirectory = dirname(join(data, first.dataset_uri));
    await rm(contentDirectory, { recursive: true, force: true });
    await symlink(outside, contentDirectory);
    await expect(store.compileDataset()).rejects.toThrow("符号链接");
  });

  it("re-verifies signed evidence before compiling the immutable dataset", async () => {
    const { root, store, intakePath } = await fixture();
    const intake = JSON.parse(await readFile(intakePath, "utf8"));
    intake.items[0].proposal.candidate_events = Array.from({ length: 30 }, (_, index) => ({
      candidate_id: `G01-C${index + 1}`, source_event_refs: ["a-1", "b-1"], operation: "add",
      time: { start: 10, end: 12 }, semantic_label: `新增线段 ${index + 1}`,
    }));
    await writeFile(intakePath, JSON.stringify(intake));
    const selected = (await store.queue()).groups[0].candidates.map((item) => item.candidate_id);
    await store.decide({
      package_id: "package-1", group_id: "G01", disposition: "accept", selected_candidate_ids: selected,
      adjudicator_id: "expert-1", adjudicator_role: "visual-reviewer", rationale: "接受全部已逐项核验的可见线段事件。",
    });
    await store.signPackage({
      package_id: "package-1", signoff_role: "visual_adjudicator", adjudicator_id: "expert-1",
      adjudicator_role: "visual-reviewer", statement: "我确认全部视觉事件已经核验并锁定当前决策。",
    });
    await store.signPackage({
      package_id: "package-1", signoff_role: "physics_reviewer", adjudicator_id: "expert-2",
      adjudicator_role: "physics-reviewer", statement: "我确认物理语义准确并同意冻结当前 Gold 版本。",
    });
    await writeFile(join(root, "data/evidence.jpg"), "tampered-after-signoff");
    await expect(store.compileDataset()).rejects.toThrow("SHA-256");
  });
});
