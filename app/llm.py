from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


class _SameOriginPostRedirect(urllib.request.HTTPRedirectHandler):
    """Keep relay POST bodies on same-origin redirects without leaking API keys elsewhere."""

    def redirect_request(self, request, fp, code, message, headers, new_url):
        source = urllib.parse.urlparse(request.full_url)
        target = urllib.parse.urlparse(new_url)
        if request.get_method() == "POST" and (source.scheme, source.netloc) == (target.scheme, target.netloc):
            return urllib.request.Request(
                new_url, data=request.data, method="POST",
                headers=dict(request.headers),
            )
        return None


@dataclass(slots=True)
class LLMClient:
    base_url: str
    api_key: str
    model: str
    timeout: int = 180
    max_attempts: int = 3

    @property
    def endpoint(self) -> str:
        base = self.base_url.rstrip("/")
        if base.endswith("/chat/completions"):
            return base
        return base + "/chat/completions"

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    def chat_json(self, system: str, user: str, temperature: float = 0.2) -> dict[str, Any]:
        if not self.configured:
            raise RuntimeError("尚未配置中转 API：需要 base_url、api_key 和 model")
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            # Avoid reusing a connection that the relay may have already closed.
            "Connection": "close",
        }
        opener = urllib.request.build_opener(_SameOriginPostRedirect())
        last_error: Exception | None = None
        attempts = max(1, self.max_attempts)
        for attempt in range(attempts):
            request = urllib.request.Request(self.endpoint, data=data, method="POST", headers=headers)
            try:
                with opener.open(request, timeout=self.timeout) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                content = payload["choices"][0]["message"]["content"]
                return parse_json_object(content)
            except (
                urllib.error.URLError, urllib.error.HTTPError, TimeoutError,
                ConnectionError, OSError, KeyError, IndexError, json.JSONDecodeError,
            ) as exc:
                last_error = exc
                if attempt < attempts - 1:
                    time.sleep(2 ** attempt)
        detail = getattr(last_error, "read", lambda: b"")()
        if isinstance(detail, bytes):
            detail = detail.decode("utf-8", "ignore")[-800:]
        raise RuntimeError(f"中转 API 调用失败：{last_error}; {detail}")

    def test(self) -> dict[str, Any]:
        result = self.chat_json(
            "只输出 JSON。", '返回 {"ok": true, "message": "连接成功"}，不要添加其他字段。', 0,
        )
        return result


def parse_json_object(text: str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(text, dict):
        return text
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise
