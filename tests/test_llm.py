import urllib.request

from app.llm import _SameOriginPostRedirect


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
