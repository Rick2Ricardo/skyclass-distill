from pathlib import Path

from app.artifacts import VersionedJsonArtifact, content_fingerprint


def test_versioned_artifact_requires_matching_version_and_input(tmp_path: Path):
    fingerprint = content_fingerprint({"lesson": 1})
    artifact = VersionedJsonArtifact(tmp_path / "lesson.json", "v1")
    artifact.save({"ok": True}, fingerprint)

    assert artifact.load(fingerprint) == {"ok": True}
    assert artifact.load(content_fingerprint({"lesson": 2})) is None
    assert VersionedJsonArtifact(artifact.path, "v2").load(fingerprint) is None


def test_versioned_artifact_clear_removes_payload_and_metadata(tmp_path: Path):
    artifact = VersionedJsonArtifact(tmp_path / "checkpoint.json", "v1")
    artifact.save({"step": 2}, "input")
    artifact.clear()

    assert not artifact.path.exists()
    assert not artifact.metadata_path.exists()
