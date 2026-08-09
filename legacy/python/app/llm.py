from __future__ import annotations

import base64
import json
import mimetypes
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
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

    def chat_json(
        self,
        system: str,
        user: str,
        temperature: float = 0.2,
        max_attempts: int | None = None,
        timeout: int | None = None,
    ) -> dict[str, Any]:
        if not self.configured:
            raise RuntimeError("尚未配置中转 API：需要 base_url、api_key 和 model")
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        return self._post_json(body, max_attempts=max_attempts, timeout=timeout)

    def chat_json_multimodal(
        self,
        system: str,
        user: str,
        images: list[tuple[str, Path]],
        temperature: float = 0.2,
        max_attempts: int | None = None,
        timeout: int | None = None,
    ) -> dict[str, Any]:
        """Call an OpenAI-compatible vision model with labeled local images."""
        if not self.configured:
            raise RuntimeError("尚未配置中转 API：需要 base_url、api_key 和 model")
        if not images:
            raise RuntimeError("多模态分析需要至少一张有效关键帧")
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": multimodal_content(user, images)},
            ],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        return self._post_json(body, max_attempts=max_attempts, timeout=timeout)

    def _post_json(
        self,
        body: dict[str, Any],
        max_attempts: int | None = None,
        timeout: int | None = None,
    ) -> dict[str, Any]:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            # Avoid reusing a connection that the relay may have already closed.
            "Connection": "close",
        }
        opener = urllib.request.build_opener(_SameOriginPostRedirect())
        last_error: Exception | None = None
        attempts = max(1, max_attempts if max_attempts is not None else self.max_attempts)
        request_timeout = timeout if timeout is not None else self.timeout
        for attempt in range(attempts):
            request = urllib.request.Request(self.endpoint, data=data, method="POST", headers=headers)
            try:
                with opener.open(request, timeout=request_timeout) as response:
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


def multimodal_content(user: str, images: list[tuple[str, Path]]) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = [{"type": "text", "text": user}]
    for label, image_path in images:
        path = Path(image_path)
        if not path.is_file():
            raise RuntimeError(f"多模态分析失败：关键帧不存在 · {label}")
        mime_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        content.extend([
            {"type": "text", "text": f"下一张图像的证据编号是 {label}；请在输出中原样保留该编号。"},
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{encoded}", "detail": "low"},
            },
        ])
    return content


def parse_json_object(text: str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(text, dict):
        return text
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    candidates = [cleaned]
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start >= 0 and end > start and (start != 0 or end != len(cleaned) - 1):
        candidates.append(cleaned[start : end + 1])
    last_error: json.JSONDecodeError | None = None
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = exc
        repaired = _repair_common_json(candidate)
        if repaired != candidate:
            try:
                return json.loads(repaired)
            except json.JSONDecodeError as exc:
                last_error = exc
    if last_error is not None:
        raise last_error
    raise json.JSONDecodeError("未找到 JSON 对象", cleaned, 0)


def _repair_common_json(value: str, max_fixes: int = 8) -> str:
    """Conservatively repair commas commonly omitted by compatible relays."""
    repaired = value
    for _ in range(max_fixes):
        try:
            json.loads(repaired)
            return repaired
        except json.JSONDecodeError as exc:
            position = exc.pos
            if not 0 <= position < len(repaired):
                return repaired
            previous = position - 1
            while previous >= 0 and repaired[previous].isspace():
                previous -= 1
            current = repaired[position]
            previous_char = repaired[previous] if previous >= 0 else ""
            message = exc.msg.lower()
            if "trailing comma" in message and current == ",":
                repaired = repaired[:position] + repaired[position + 1 :]
                continue
            if "expecting ',' delimiter" in message:
                if current in '"[{' and previous_char in '"}]0123456789':
                    repaired = repaired[:position] + "," + repaired[position:]
                    continue
            if (
                ("expecting property name" in message and current == "}")
                or ("expecting value" in message and current in "]}")
            ) and previous_char == ",":
                repaired = repaired[:previous] + repaired[previous + 1 :]
                continue
            return repaired
    return repaired
