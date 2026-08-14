import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  GoldIndependentReviewCandidate,
  GoldIndependentReviewDecision,
  GoldIndependentReviewDisposition,
  GoldIndependentReviewFinalEvent,
  GoldIndependentReviewPacket,
  GoldIndependentReviewerSlot,
} from "../../../../../packages/contracts/src/index.js";
import { buildGoldIndependentAssessmentV1 } from "../../../../../packages/contracts/src/index.js";
import { api } from "../api.js";

type Flash = (message: string, error?: boolean) => void;
type LocalDraft = {
  disposition: GoldIndependentReviewDisposition;
  selected_candidate_ids: string[];
  final_events: Record<string, GoldIndependentReviewFinalEvent>;
  rationale: string;
  reviewed_at?: string;
  complete: boolean;
};
type LocalSession = { reviewer_id: string; reviewer_role: string; drafts: Record<string, LocalDraft> };

function storageKey(packet: GoldIndependentReviewPacket): string {
  return `gold-independent-review:${packet.manifest_json_sha256}:${packet.template_json_sha256}:${packet.review_package_sha256}:${packet.reviewer_slot}`;
}

function isLocalSession(value: unknown): value is LocalSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  if (typeof session.reviewer_id !== "string" || typeof session.reviewer_role !== "string"
    || !session.drafts || typeof session.drafts !== "object" || Array.isArray(session.drafts)) return false;
  return Object.values(session.drafts).every((draft) => {
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) return false;
    const row = draft as Record<string, unknown>;
    if (!["accept", "reject", "not_an_event", "unknown"].includes(String(row.disposition))
      || !Array.isArray(row.selected_candidate_ids) || !row.selected_candidate_ids.every((id) => typeof id === "string")
      || !row.final_events || typeof row.final_events !== "object" || Array.isArray(row.final_events)
      || typeof row.rationale !== "string" || typeof row.complete !== "boolean"
      || (row.reviewed_at !== undefined && typeof row.reviewed_at !== "string")) return false;
    return Object.values(row.final_events as Record<string, unknown>).every((event) => {
      if (!event || typeof event !== "object" || Array.isArray(event)) return false;
      const value = event as Record<string, unknown>;
      const time = value.time as Record<string, unknown> | undefined;
      return typeof value.event_id === "string" && Array.isArray(value.source_event_refs) && value.source_event_refs.every((id) => typeof id === "string")
        && ["ADD", "ERASE", "MODIFY", "CONNECT", "atomic_ERASE+ADD"].includes(String(value.operation))
        && Boolean(time) && Number.isFinite(time?.start) && Number.isFinite(time?.end) && typeof value.semantic_label === "string";
    });
  });
}

function persistSession(key: string, session: LocalSession): boolean {
  try { window.localStorage.setItem(key, JSON.stringify(session)); return true; } catch { return false; }
}

const slots: Array<{ value: GoldIndependentReviewerSlot; title: string; role: string }> = [
  { value: "visual_reviewer", title: "视觉评审", role: "视觉证据评审员" },
  { value: "physics_reviewer", title: "物理评审", role: "物理语义评审员" },
];

function initialSlot(): GoldIndependentReviewerSlot | null {
  const value = new URLSearchParams(window.location.search).get("reviewer_slot");
  return value === "visual_reviewer" || value === "physics_reviewer" ? value : null;
}

function initialDraft(): LocalDraft {
  return { disposition: "unknown", selected_candidate_ids: [], final_events: {}, rationale: "", complete: false };
}

function allowedOperations(candidate: GoldIndependentReviewCandidate): GoldIndependentReviewFinalEvent["operation"][] {
  if (candidate.operation !== "unknown") return [candidate.operation];
  if (candidate.relation) return ["CONNECT"];
  if (candidate.modification) return ["MODIFY"];
  return ["ADD", "ERASE", "atomic_ERASE+ADD"];
}

function eventFromCandidate(candidate: GoldIndependentReviewCandidate): GoldIndependentReviewFinalEvent {
  return {
    event_id: candidate.event_id,
    source_event_refs: [...candidate.source_event_refs],
    operation: allowedOperations(candidate)[0],
    time: { ...candidate.time },
    semantic_label: candidate.semantic_label,
    region: candidate.region,
    relation: candidate.relation,
    modification: candidate.modification,
  };
}

function decisionFromDraft(draft: LocalDraft, candidates: GoldIndependentReviewCandidate[]): GoldIndependentReviewDecision {
  if (draft.rationale.trim().length < 8) throw new Error("请写至少 8 个字符的可见证据理由");
  if (draft.disposition !== "accept") {
    return { disposition: draft.disposition, selected_candidate_ids: [], final_events: [], rationale: draft.rationale.trim(), reviewed_at: new Date().toISOString() };
  }
  if (!draft.selected_candidate_ids.length) throw new Error("接受结论必须至少选择一个候选");
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const rows = draft.selected_candidate_ids.map((candidateId) => {
    const candidate = candidateById.get(candidateId);
    const event = draft.final_events[candidateId];
    if (!candidate || !event || !Number.isFinite(event.time.start) || !Number.isFinite(event.time.end) || event.time.end <= event.time.start || !event.semantic_label.trim()) {
      throw new Error("所选候选的操作、边界或语义尚未闭合");
    }
    return { candidateId, event };
  }).sort((left, right) => left.event.time.start - right.event.time.start || left.event.event_id.localeCompare(right.event.event_id, "en"));
  return {
    disposition: "accept",
    selected_candidate_ids: rows.map((row) => row.candidateId),
    final_events: rows.map((row) => row.event),
    rationale: draft.rationale.trim(),
    reviewed_at: new Date().toISOString(),
  };
}

export function IndependentGoldReview({ flash }: { flash: Flash }) {
  const [slot, setSlot] = useState<GoldIndependentReviewerSlot | null>(initialSlot);
  const [packet, setPacket] = useState<GoldIndependentReviewPacket | null>(null);
  const [session, setSession] = useState<LocalSession>({ reviewer_id: "", reviewer_role: "", drafts: {} });
  const [activeIndex, setActiveIndex] = useState(0);

  const sessionKey = packet ? storageKey(packet) : "";
  const activeItem = packet?.items[activeIndex] ?? null;
  const activeDraft = activeItem ? session.drafts[activeItem.card_sha256] ?? initialDraft() : initialDraft();
  const completedCount = packet?.items.filter((item) => session.drafts[item.card_sha256]?.complete).length ?? 0;

  const load = useCallback(async (selected: GoldIndependentReviewerSlot) => {
    const next = await api<GoldIndependentReviewPacket>(`/api/gold-independent-review/${selected}`);
    setPacket(next);
    const key = storageKey(next);
    try {
      const saved = window.localStorage.getItem(key);
      const parsed = saved ? JSON.parse(saved) as unknown : null;
      if (isLocalSession(parsed)) setSession(parsed);
      else setSession({ reviewer_id: "", reviewer_role: slots.find((item) => item.value === selected)?.role ?? "独立评审员", drafts: {} });
    } catch {
      setSession({ reviewer_id: "", reviewer_role: "独立评审员", drafts: {} });
    }
  }, []);

  useEffect(() => {
    if (!slot) return;
    load(slot).catch((cause) => flash(cause instanceof Error ? cause.message : String(cause), true));
  }, [flash, load, slot]);

  useEffect(() => {
    if (sessionKey && !persistSession(sessionKey, session)) flash("浏览器无法持久保存草稿；请不要刷新，并尽快完成导出。", true);
  }, [flash, session, sessionKey]);

  const updateDraft = (patch: Partial<LocalDraft>) => {
    if (!activeItem) return;
    setSession((value) => ({ ...value, drafts: { ...value.drafts, [activeItem.card_sha256]: { ...activeDraft, ...patch, complete: false } } }));
  };

  const toggleCandidate = (candidate: GoldIndependentReviewCandidate) => {
    const selected = activeDraft.selected_candidate_ids.includes(candidate.candidate_id);
    const ids = selected ? activeDraft.selected_candidate_ids.filter((id) => id !== candidate.candidate_id) : [...activeDraft.selected_candidate_ids, candidate.candidate_id];
    const events = { ...activeDraft.final_events };
    if (selected) delete events[candidate.candidate_id];
    else events[candidate.candidate_id] = eventFromCandidate(candidate);
    updateDraft({ selected_candidate_ids: ids, final_events: events });
  };

  const updateEvent = (candidateId: string, patch: Partial<GoldIndependentReviewFinalEvent>) => {
    const current = activeDraft.final_events[candidateId];
    if (!current) return;
    updateDraft({ final_events: { ...activeDraft.final_events, [candidateId]: { ...current, ...patch } } });
  };

  const saveItem = () => {
    if (!activeItem) return;
    try {
      const decision = decisionFromDraft(activeDraft, activeItem.card.candidates);
      setSession((value) => ({ ...value, drafts: { ...value.drafts, [activeItem.card_sha256]: {
        disposition: decision.disposition,
        selected_candidate_ids: decision.selected_candidate_ids,
        final_events: Object.fromEntries(decision.selected_candidate_ids.map((id, index) => [id, decision.final_events[index]])),
        rationale: decision.rationale,
        reviewed_at: decision.reviewed_at,
        complete: true,
      } } }));
      const next = packet?.items.findIndex((item, index) => index > activeIndex && !session.drafts[item.card_sha256]?.complete) ?? -1;
      if (next >= 0) setActiveIndex(next);
      flash(`第 ${activeItem.presentation_index} 项已保存到本机草稿（未写入 Gold）`);
    } catch (cause) { flash(cause instanceof Error ? cause.message : String(cause), true); }
  };

  const clearItem = () => {
    if (!activeItem) return;
    setSession((value) => {
      const drafts = { ...value.drafts };
      delete drafts[activeItem.card_sha256];
      return { ...value, drafts };
    });
    flash(`第 ${activeItem.presentation_index} 项本机草稿已清除`);
  };

  const decisions = useMemo(() => {
    if (!packet) return {};
    return Object.fromEntries(packet.items.flatMap((item) => {
      const draft = session.drafts[item.card_sha256];
      if (!draft?.complete || !draft.reviewed_at) return [];
      return [[item.card_sha256, {
        disposition: draft.disposition,
        selected_candidate_ids: draft.selected_candidate_ids,
        final_events: draft.selected_candidate_ids.map((id) => draft.final_events[id]),
        rationale: draft.rationale,
        reviewed_at: draft.reviewed_at,
      } satisfies GoldIndependentReviewDecision]];
    }));
  }, [packet, session.drafts]);

  const exportAssessment = () => {
    if (!packet) return;
    try {
      const assessment = buildGoldIndependentAssessmentV1({ packet, reviewer_id: session.reviewer_id, reviewer_role: session.reviewer_role, decisions });
      const blob = new Blob([`${JSON.stringify(assessment, null, 2)}\n`], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `gold-${packet.reviewer_slot}-completed.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      flash("完整独立评审 JSON 已导出；仍未写入 Gold");
    } catch (cause) { flash(cause instanceof Error ? cause.message : String(cause), true); }
  };

  if (!slot) return <section className="independent-slot-picker">
    <div className="paper-panel independent-intro"><p className="eyebrow">INDEPENDENT DOUBLE REVIEW · SESSION REQUIRED</p><h2>请使用研究负责人分配的评审链接</h2><p>为避免两名评审看到彼此的呈现顺序，这个入口不提供席位切换。负责人应分别发放带有 reviewer_slot 的视觉或物理评审链接；浏览器仅保存本地草稿，不读取另一名评审的完成文件，也不会创建 Gold 决策。</p></div>
  </section>;

  if (!packet || !activeItem) return <div className="agent-running"><span className="pulse" /><div><b>正在校验冻结评审证据</b><small>核对 52 张卡片、模板根与证据索引…</small></div></div>;

  const card = activeItem.card;
  const roleTitle = slots.find((item) => item.value === slot)?.title;
  return <div className="independent-review-stack">
    <section className="paper-panel independent-toolbar">
      <div><p className="eyebrow">{roleTitle} · LOCAL DRAFT ONLY</p><h2>{completedCount} / {packet.counts.item_count} 已完成</h2><small>证据 {packet.counts.evidence_asset_count} 项 · 草稿只在当前浏览器 · 无服务器写接口</small></div>
      <div className="independent-identity"><input aria-label="评审者 ID" value={session.reviewer_id} onChange={(event) => setSession((value) => ({ ...value, reviewer_id: event.target.value }))} placeholder="评审者 ID" /><input aria-label="评审者角色" value={session.reviewer_role} onChange={(event) => setSession((value) => ({ ...value, reviewer_role: event.target.value }))} placeholder="评审者角色" /><button className="primary" disabled={completedCount !== 52} onClick={exportAssessment}>导出完整 JSON</button></div>
    </section>

    <div className="gold-review-layout">
      <aside className="paper-panel gold-group-list independent-card-list"><h2>52 项独立评审</h2><div>{packet.items.map((item, index) => {
        const done = session.drafts[item.card_sha256]?.complete;
        return <button className={index === activeIndex ? "active" : ""} key={item.card_sha256} onClick={() => setActiveIndex(index)}><i className={done ? "accept" : ""} /><span><b>{String(item.presentation_index).padStart(2, "0")} · {item.group_id}</b><small>{item.package_id}</small></span><em>{done ? "done" : "open"}</em></button>;
      })}</div></aside>

      <main className="gold-review-main">
        <section className="paper-panel gold-group-head"><div><p className="eyebrow">ITEM {activeItem.presentation_index} / 52</p><h2>{card.group_id}</h2></div><div><span>{card.alignment_class}</span><span>{card.group_time.start.toFixed(3)}–{card.group_time.end.toFixed(3)}s</span><span>{card.candidates.length} candidates</span></div></section>
        <section className="gold-evidence-grid independent-evidence-grid">{card.evidence.map((item) => <figure className="paper-panel" key={item.evidence_index}><img loading="lazy" src={`/api/gold-independent-review/${slot}/evidence?card_sha256=${encodeURIComponent(activeItem.card_sha256)}&index=${item.evidence_index}`} alt={`${item.side} ${item.label}`} /><figcaption><span>{item.side}</span><b>{item.label}</b><small>{item.kind} · {item.sha256.slice(0, 10)}</small></figcaption></figure>)}</section>
        <section className="gold-detail-grid"><article className="paper-panel gold-source-events"><p className="eyebrow">SOURCE EVENTS</p>{card.source_events.map((event) => <div key={event.event_id}><span>{event.side}</span><div><b>{event.operation} · {event.semantic_label}</b><small>{event.event_id} · {event.time ? `${event.time.start}–${event.time.end}s` : "time pending"}</small></div></div>)}</article><div><article className="paper-panel gold-speech"><p className="eyebrow">SPEECH · CONTEXT, NOT GOLD</p><p>{card.speech_context.text || "无语音上下文"}</p></article>{card.unresolved_fields.length > 0 && <article className="paper-panel gold-unresolved"><p className="eyebrow">HUMAN QUESTIONS</p><ol>{card.unresolved_fields.map((field) => <li key={field}>{field}</li>)}</ol></article>}</div></section>

        <section className="paper-panel gold-decision"><p className="eyebrow">INDEPENDENT DECISION · LOCAL ONLY</p><div className="gold-dispositions">{(["accept", "reject", "not_an_event", "unknown"] as GoldIndependentReviewDisposition[]).map((value) => <button className={activeDraft.disposition === value ? "active" : ""} key={value} onClick={() => updateDraft({ disposition: value, selected_candidate_ids: value === "accept" ? activeDraft.selected_candidate_ids : [], final_events: value === "accept" ? activeDraft.final_events : {} })}>{value}</button>)}</div>
          {activeDraft.disposition === "accept" && <div className="gold-candidates">{card.candidates.map((candidate) => {
            const selected = activeDraft.selected_candidate_ids.includes(candidate.candidate_id);
            const event = activeDraft.final_events[candidate.candidate_id] ?? eventFromCandidate(candidate);
            return <article className={`gold-candidate ${candidate.acceptance_ready ? "" : "blocked"}`} key={candidate.candidate_id}><label><input type="checkbox" checked={selected} onChange={() => toggleCandidate(candidate)} /><span><b>{candidate.operation} · {candidate.semantic_label}</b><small>{candidate.candidate_id} · {candidate.time.start}–{candidate.time.end}s</small>{candidate.acceptance_blockers.map((blocker) => <em key={blocker}>{blocker}</em>)}</span></label>{selected && <div className="gold-event-editor"><select aria-label="最终操作" value={event.operation} onChange={(e) => updateEvent(candidate.candidate_id, { operation: e.target.value as GoldIndependentReviewFinalEvent["operation"] })}>{allowedOperations(candidate).map((operation) => <option key={operation}>{operation}</option>)}</select><input aria-label="开始时间" value={event.time.start} type="number" step="0.001" onChange={(e) => updateEvent(candidate.candidate_id, { time: { ...event.time, start: Number(e.target.value) } })} /><input aria-label="结束时间" value={event.time.end} type="number" step="0.001" onChange={(e) => updateEvent(candidate.candidate_id, { time: { ...event.time, end: Number(e.target.value) } })} /><input aria-label="语义标签" value={event.semantic_label} onChange={(e) => updateEvent(candidate.candidate_id, { semantic_label: e.target.value })} /></div>}</article>;
          })}</div>}
          <div className="gold-review-form"><label className="wide">可见证据理由<textarea value={activeDraft.rationale} onChange={(event) => updateDraft({ rationale: event.target.value })} placeholder="说明边界、可见内容与操作判断；不要把语音上下文当作视觉 Gold。" /></label></div><div className="independent-item-actions"><button className="primary" onClick={saveItem}>保存本项到本机草稿</button><button onClick={clearItem}>清除此项草稿</button></div><p className="gold-signature">{activeDraft.complete ? `本机完成于 ${activeDraft.reviewed_at}` : "未完成 · 不产生 Gold 决策、签字或接受事件"}</p>
        </section>
      </main>
    </div>
  </div>;
}
