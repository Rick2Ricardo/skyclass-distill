import { describe, expect, it } from "vitest";
import {
  createFormalOracleTransportCaptureArtifactV1,
  hashFormalOracleTransportCaptureRecordV1,
  isPublicFormalOracleIpAddress,
  revalidateFormalOracleTransportCaptureArtifactV1,
  validateFormalOracleTransportCaptureRecordV1,
  type FormalOracleTransportCaptureBuildInputV1,
  type FormalOracleTransportCaptureRecordV1,
} from "./oracle-gate-transport-capture.js";

function input(): FormalOracleTransportCaptureBuildInputV1 {
  return {
    transport_registry_sha256: "1".repeat(64), run_sha256: "2".repeat(64), execution_plan_sha256: "3".repeat(64),
    request_id: "FREQ-1", intent_sha256: "4".repeat(64), attempt_ordinal: 1,
    request_envelope_sha256: "5".repeat(64), provider_body_sha256: "6".repeat(64),
    provider_body_profile: "pi-openai-completions-fetch-boundary-v1",
    prepared_adapter_version: "formal-oracle-pi-fetch-boundary-adapter-v1", transport: "pi", model: "fixture-model",
    endpoint: { base_url: "https://api.example.com/v1", chat_completions_url: "https://api.example.com/v1/chat/completions", method: "POST", redirect_policy: "error", tls_required: true },
    account: { provider_id: "fixture-provider", account_key_id: "account-1", credential_key_id: "credential-1" },
    dns_resolution_policy: "all_answers_public_selected_address_pinned_lookup-v1",
    resolved_addresses: [{ address: "8.8.4.4", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }],
    selected_address: "8.8.4.4", selected_family: 4,
    request_started_at: "2026-08-13T00:00:00.000Z", response_headers_received_at: "2026-08-13T00:00:01.000Z",
    capture_finished_at: "2026-08-13T00:00:02.000Z", network_request_started: true, capture_status: "complete_fetch_entity",
    response_http_status: 200,
    response_public_headers: [{ name: "content-type", value: "text/event-stream" }, { name: "x-request-id", value: "req-1" }],
    provider_http_request_id: "req-1", response_content_type: "text/event-stream",
    captured_entity_bytes: new TextEncoder().encode("data: [DONE]\n\n"), error_code: null,
    provenance_status: "runtime_https_pinned_lookup_capture_external_worm_pending", api_execution_allowed: false,
  };
}

describe("Formal Oracle transport capture", () => {
  it("binds runtime DNS, selected public address, normalized headers, and exact entity bytes", () => {
    const artifact = createFormalOracleTransportCaptureArtifactV1(input());
    expect(validateFormalOracleTransportCaptureRecordV1(artifact.record)).toEqual({ valid: true, issues: [] });
    expect(revalidateFormalOracleTransportCaptureArtifactV1(artifact).record).toEqual(artifact.record);
    expect(artifact.record).toMatchObject({
      capture_status: "complete_fetch_entity", response_http_status: 200, response_content_type: "text/event-stream",
      captured_entity_object_uri: `runs/${"2".repeat(64)}/objects/transport-captured-entities/${artifact.record.captured_entity_bytes_sha256}/entity.bin`,
      captured_entity_byte_length: 14, provider_http_request_id: "req-1", api_execution_allowed: false,
    });
    expect(() => JSON.stringify(artifact)).not.toThrow();
    artifact.captured_entity_bytes![0] ^= 1;
    expect(() => revalidateFormalOracleTransportCaptureArtifactV1(artifact)).toThrow("漂移");
    expect(() => revalidateFormalOracleTransportCaptureArtifactV1(structuredClone(artifact))).toThrow("伪造");
  });

  it("rejects private, reserved, mapped, documentation, and noncanonical IP answers", () => {
    for (const address of ["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.1", "192.168.1.1", "198.18.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "01.2.3.4", "::1", "fe80::1", "fc00::1", "::ffff:8.8.8.8", "2001:db8::1", "2002:808:808::1"]) {
      expect(isPublicFormalOracleIpAddress(address)).toBe(false);
    }
    expect(isPublicFormalOracleIpAddress("8.8.8.8", 4)).toBe(true);
    expect(isPublicFormalOracleIpAddress("2606:4700:4700::1111", 6)).toBe(true);
    const privateAnswer = input();
    privateAnswer.resolved_addresses = [{ address: "127.0.0.1", family: 4 }];
    privateAnswer.selected_address = "127.0.0.1";
    expect(() => createFormalOracleTransportCaptureArtifactV1(privateAnswer)).toThrow("resolved_addresses");
  });

  it("distinguishes complete, partial unknown, and no-response unknown captures", () => {
    const partial = input();
    partial.capture_status = "partial_fetch_entity_unknown";
    partial.error_code = "transport_response_incomplete_or_unknown";
    const partialArtifact = createFormalOracleTransportCaptureArtifactV1(partial);
    expect(validateFormalOracleTransportCaptureRecordV1(partialArtifact.record).valid).toBe(true);
    expect(partialArtifact.record.captured_entity_object_uri).toMatch(/\/entity\.bin$/);

    const none = input();
    none.capture_status = "request_started_no_response_unknown";
    none.response_headers_received_at = null; none.response_http_status = null; none.response_public_headers = [];
    none.provider_http_request_id = null; none.response_content_type = null; none.captured_entity_bytes = null;
    none.error_code = "transport_response_incomplete_or_unknown";
    const artifact = createFormalOracleTransportCaptureArtifactV1(none);
    expect(artifact.captured_entity_bytes).toBeNull();
    expect(validateFormalOracleTransportCaptureRecordV1(artifact.record)).toEqual({ valid: true, issues: [] });

    const downgrade = structuredClone(partial) as FormalOracleTransportCaptureBuildInputV1;
    downgrade.capture_status = "complete_fetch_entity";
    expect(() => createFormalOracleTransportCaptureArtifactV1(downgrade)).toThrow("error_code");
  });

  it("rejects self-consistent cross-root, selected-IP, header, and domain-hash drift", () => {
    const artifact = createFormalOracleTransportCaptureArtifactV1(input());
    for (const mutate of [
      (value: FormalOracleTransportCaptureRecordV1) => { value.selected_address = "1.1.1.1"; },
      (value: FormalOracleTransportCaptureRecordV1) => { value.response_content_type = "application/json"; },
      (value: FormalOracleTransportCaptureRecordV1) => { value.provider_http_request_id = "other"; },
      (value: FormalOracleTransportCaptureRecordV1) => { value.resolved_addresses = [{ address: "10.0.0.1", family: 4 }]; value.selected_address = "10.0.0.1"; },
    ]) {
      const changed = structuredClone(artifact.record) as FormalOracleTransportCaptureRecordV1;
      mutate(changed);
      changed.capture_record_sha256 = hashFormalOracleTransportCaptureRecordV1(changed);
      expect(validateFormalOracleTransportCaptureRecordV1(changed).valid).toBe(false);
    }
    const plain = structuredClone(artifact.record) as FormalOracleTransportCaptureRecordV1;
    plain.capture_record_sha256 = plain.captured_entity_bytes_sha256!;
    expect(validateFormalOracleTransportCaptureRecordV1(plain).valid).toBe(false);
  });
});
