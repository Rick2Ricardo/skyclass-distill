import { createPublicKey, KeyObject, verify, type KeyLike } from "node:crypto";
import {
  oracleGateRatingLedgerSignaturePreimage,
  validateOracleGateCompletedRatingSet,
  validateOracleGatePublicEvidenceAgainstBlindArtifacts,
  type OracleGateCompletedRatingSetV1,
  type OracleGatePublicEvidencePackageV1,
  type OracleGateRatingAssignmentV1,
  type OracleGateRatingPlanV1,
  type PrivateAnswerKeyV1,
  type PublicBlindPackageV1,
} from "../../contracts/src/index.js";

export interface TrustedOracleGateRatingSetCapabilityV1 {
  readonly stage: "trusted_two_rater_rating_set_verified";
  readonly rating_set: Readonly<OracleGateCompletedRatingSetV1>;
  readonly rating_plan: Readonly<OracleGateRatingPlanV1>;
  readonly rating_assignment: Readonly<OracleGateRatingAssignmentV1>;
  readonly public_evidence_package: Readonly<OracleGatePublicEvidencePackageV1>;
  readonly api_execution_allowed: false;
}
const active = new WeakSet<object>();
class Capability implements TrustedOracleGateRatingSetCapabilityV1 {
  readonly stage = "trusted_two_rater_rating_set_verified" as const;
  readonly api_execution_allowed = false as const;
  constructor(
    readonly rating_set: Readonly<OracleGateCompletedRatingSetV1>,
    readonly rating_plan: Readonly<OracleGateRatingPlanV1>,
    readonly rating_assignment: Readonly<OracleGateRatingAssignmentV1>,
    readonly public_evidence_package: Readonly<OracleGatePublicEvidencePackageV1>,
  ) {
    Object.freeze(this);
  }
  toJSON(): never {
    throw Error("trusted rating capability 不得序列化");
  }
}
function clonePlain<T>(value: T): T {
  if (value === null || ["string", "number", "boolean"].includes(typeof value))
    return value;
  if (!value || typeof value !== "object") throw Error("只允许plain data快照");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype)
      throw Error("数组原型无效");
    if (
      Object.getOwnPropertySymbols(value).length ||
      Object.entries(descriptors).some(
        ([key, descriptor]) =>
          key !== "length" &&
          (!("value" in descriptor) || !descriptor.enumerable),
      )
    )
      throw Error("禁止accessor/symbol/non-enumerable");
    const names = Object.keys(descriptors).filter((k) => k !== "length");
    if (names.length !== value.length || names.some((k, i) => k !== String(i)))
      throw Error("数组必须稠密");
    return value.map((item) => clonePlain(item)) as T;
  }
  if (
    Object.getOwnPropertySymbols(value).length ||
    Object.values(descriptors).some((d) => !("value" in d) || !d.enumerable)
  )
    throw Error("禁止accessor/symbol/non-enumerable");
  if (
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.hasOwn(value, "toJSON")
  )
    throw Error("对象原型/toJSON无效");
  const output: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors))
    output[key] = clonePlain(descriptor.value);
  return output as T;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function publicKey(value: KeyLike): { key: KeyObject; der: Buffer } {
  const parsed =
    value instanceof KeyObject && value.type === "public"
      ? value
      : createPublicKey(value);
  if (parsed.type !== "public" || parsed.asymmetricKeyType !== "ed25519")
    throw Error("trusted rating key 必须Ed25519");
  const der = Buffer.from(parsed.export({ format: "der", type: "spki" }));
  return {
    key: createPublicKey({
      key: Buffer.from(der),
      format: "der",
      type: "spki",
    }),
    der,
  };
}
export function assertActiveTrustedOracleGateRatingSetCapability(
  value: TrustedOracleGateRatingSetCapabilityV1,
): void {
  if (!value || typeof value !== "object" || !active.has(value as object))
    throw Error("trusted rating capability 无效、伪造或已过期");
  if (
    !Object.isFrozen(value) ||
    !Object.isFrozen(value.rating_set) ||
    !Object.isFrozen(value.rating_set.ledgers)
  )
    throw Error("trusted rating capability 快照不再冻结");
}
export async function withTrustedOracleGateRatingSet<T>(input: {
  rating_set: OracleGateCompletedRatingSetV1;
  rating_plan: OracleGateRatingPlanV1;
  rating_assignment: OracleGateRatingAssignmentV1;
  public_evidence_package: OracleGatePublicEvidencePackageV1;
  public_blind_package: PublicBlindPackageV1;
  private_answer_key: PrivateAnswerKeyV1;
  trusted_rater_keys: ReadonlyMap<string, KeyLike>;
  callback: (capability: TrustedOracleGateRatingSetCapabilityV1) => Promise<T>;
}): Promise<T> {
  let ratingSet:OracleGateCompletedRatingSetV1,plan:OracleGateRatingPlanV1,assignment:OracleGateRatingAssignmentV1,evidence:OracleGatePublicEvidencePackageV1,pub:PublicBlindPackageV1,key:PrivateAnswerKeyV1;
  try {
    ratingSet=deepFreeze(clonePlain(input.rating_set));plan=deepFreeze(clonePlain(input.rating_plan));assignment=deepFreeze(clonePlain(input.rating_assignment));evidence=deepFreeze(clonePlain(input.public_evidence_package));pub=deepFreeze(clonePlain(input.public_blind_package));key=deepFreeze(clonePlain(input.private_answer_key));
  } catch(error) { throw Error(`rating输入不是安全plain data：${error instanceof Error?error.message:"clone失败"}`); }
  const structural = validateOracleGateCompletedRatingSet(
    ratingSet,plan,assignment,evidence,pub,
  );
  if (!structural.valid)
    throw Error(
      `rating set 无效：${structural.issues[0]?.path} ${structural.issues[0]?.message}`,
    );
  const blind = validateOracleGatePublicEvidenceAgainstBlindArtifacts(
    evidence,pub,key,
  );
  if (!blind.valid)
    throw Error(
      `public evidence/private mapping 无效：${blind.issues[0]?.path}`,
    );
  const post = validateOracleGateCompletedRatingSet(
    ratingSet,
    plan,
    assignment,
    evidence,
    pub,
  );
  const postBlind = validateOracleGatePublicEvidenceAgainstBlindArtifacts(
    evidence,
    pub,
    key,
  );
  if (!post.valid || !postBlind.valid) throw Error("rating快照复验失败");
  const trusted = ratingSet.ledgers.map((ledger) => {
    const material = input.trusted_rater_keys.get(ledger.signer_key_id);
    if (!material) throw Error(`缺少可信评分者key：${ledger.signer_key_id}`);
    return publicKey(material);
  });
  if (trusted[0].der.equals(trusted[1].der))
    throw Error("两名评分者不得使用同一Ed25519公钥的不同alias");
  for (const [index, ledger] of ratingSet.ledgers.entries()) {
    const signature = Buffer.from(ledger.signature_base64, "base64");
    if (
      signature.length !== 64 ||
      signature.toString("base64") !== ledger.signature_base64 ||
      !verify(
        null,
        oracleGateRatingLedgerSignaturePreimage(ledger),
        trusted[index].key,
        signature,
      )
    )
      throw Error(`评分ledger签名无效：${ledger.signer_key_id}`);
  }
  const capability = new Capability(ratingSet, plan, assignment, evidence);
  active.add(capability);
  try {
    return await input.callback(capability);
  } finally {
    active.delete(capability);
  }
}
