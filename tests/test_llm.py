import urllib.request
from pathlib import Path

from app.llm import _SameOriginPostRedirect, multimodal_content, parse_json_object


def test_same_origin_redirect_preserves_post_body_and_authorization():
    request = urllib.request.Request(
        "https://relay.example/v1/chat/completions",
        data=b"{}",
        method="POST",
        headers={"Authorization": "Bearer secret"},
    )

    redirected = _SameOriginPostRedirect().redirect_request(
        request, None, 302, "Found", {}, "https://relay.example/v1/chat/completions/",
    )

    assert redirected is not None
    assert redirected.get_method() == "POST"
    assert redirected.data == b"{}"
    assert redirected.get_header("Authorization") == "Bearer secret"


def test_cross_origin_redirect_is_rejected():
    request = urllib.request.Request(
        "https://relay.example/v1/chat/completions",
        data=b"{}",
        method="POST",
        headers={"Authorization": "Bearer secret"},
    )

    redirected = _SameOriginPostRedirect().redirect_request(
        request, None, 302, "Found", {}, "https://other.example/v1/chat/completions",
    )

    assert redirected is None


def test_multimodal_content_embeds_labeled_local_image(tmp_path: Path):
    frame = tmp_path / "frame.jpg"
    frame.write_bytes(b"jpeg-bytes")

    content = multimodal_content("分析课堂", [("F001@00:12", frame)])

    assert content[0] == {"type": "text", "text": "分析课堂"}
    assert "F001@00:12" in content[1]["text"]
    assert content[2]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert content[2]["image_url"]["detail"] == "low"


def test_parse_json_object_repairs_common_missing_and_trailing_commas():
    malformed = '{"lesson":"质点"\n"evidence":[{"frame":"F001"},],}'

    assert parse_json_object(malformed) == {
        "lesson": "质点",
        "evidence": [{"frame": "F001"}],
    }
