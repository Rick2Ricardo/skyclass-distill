from pathlib import Path

import pytest

from app.upload_store import UploadError, UploadStore


def test_upload_store_sanitizes_filename_and_rejects_bad_ids(tmp_path: Path):
    uploads = UploadStore(tmp_path)

    assert uploads.safe_filename("../../课堂.mp4") == "课堂.mp4"
    with pytest.raises(UploadError):
        uploads.safe_filename("notes.txt")
    with pytest.raises(UploadError):
        uploads.directory("../escape")


def test_upload_store_builds_local_course_items(tmp_path: Path):
    uploads = UploadStore(tmp_path)
    upload_id = "a1b2c3d4e5f6"
    directory = uploads.directory(upload_id)
    directory.mkdir(parents=True)
    (directory / "001-第一课.mp4").write_bytes(b"not-real-media")

    items = uploads.course_items(upload_id)

    assert len(items) == 1
    assert items[0].title == "第一课"
    assert items[0].source == "local-upload"
    assert items[0].metadata["local_path"].endswith("001-第一课.mp4")
