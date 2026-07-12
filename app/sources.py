from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from .models import CourseItem


BVID_RE = re.compile(r"(BV[0-9A-Za-z]{10})")


@dataclass(frozen=True, slots=True)
class VideoSite:
    key: str
    name: str
    domains: tuple[str, ...]
    engine: str = "yt-dlp"


# These are public-page adapters, not a promise that paid, login-only or DRM media can be downloaded.
VIDEO_SITES = (
    VideoSite("bilibili", "哔哩哔哩", ("bilibili.com", "b23.tv"), "bilibili-api + yt-dlp"),
    VideoSite("douyin", "抖音", ("douyin.com", "iesdouyin.com")),
    VideoSite("ixigua", "西瓜视频", ("ixigua.com",)),
    VideoSite("kuaishou", "快手", ("kuaishou.com", "chenzhongtech.com")),
    VideoSite("youku", "优酷 / 土豆", ("youku.com", "tudou.com")),
    VideoSite("iqiyi", "爱奇艺", ("iqiyi.com",)),
    VideoSite("tencent", "腾讯视频", ("v.qq.com",)),
    VideoSite("mgtv", "芒果 TV", ("mgtv.com",)),
    VideoSite("weibo", "微博视频", ("weibo.com", "weibo.cn")),
    VideoSite("xiaohongshu", "小红书", ("xiaohongshu.com", "xhslink.com")),
    VideoSite("acfun", "AcFun", ("acfun.cn",)),
    VideoSite("huya", "虎牙", ("huya.com",)),
    VideoSite("douyu", "斗鱼", ("douyu.com",)),
)

COOKIE_BROWSERS = {"chrome", "safari", "firefox", "edge", "brave", "chromium"}


def _host_matches(host: str, domain: str) -> bool:
    return host == domain or host.endswith(f".{domain}")


def validate_video_url(url: str) -> str:
    value = url.strip()
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise RuntimeError("请输入完整的 http:// 或 https:// 视频页面地址")
    return value


def identify_site(url: str) -> VideoSite | None:
    host = (urlparse(url).hostname or "").lower()
    return next(
        (site for site in VIDEO_SITES if any(_host_matches(host, domain) for domain in site.domains)),
        None,
    )


def supported_sites() -> list[dict[str, Any]]:
    return [
        {"key": site.key, "name": site.name, "domains": list(site.domains), "engine": site.engine}
        for site in VIDEO_SITES
    ]


def _bilibili_modules():
    try:
        from bilibili_api import request_settings, search, sync, video
    except ImportError as exc:
        raise RuntimeError("B 站来源需要 bilibili-api-python，请执行 pip install -e .") from exc
    try:
        request_settings.set("impersonate", "chrome")
    except Exception:
        pass
    return video, search, sync


def discover_bilibili(url: str, limit: int = 5) -> list[CourseItem]:
    match = BVID_RE.search(url)
    if not match:
        return []
    bvid = match.group(1)
    video, _, sync = _bilibili_modules()
    info = sync(video.Video(bvid=bvid).get_info())
    owner = info.get("owner") or {}
    items: list[CourseItem] = []
    for page_index, page in enumerate(info.get("pages", [])[:limit]):
        number = int(page.get("page", page_index + 1))
        items.append(
            CourseItem(
                id=f"{bvid}-p{number}",
                source_url=f"https://www.bilibili.com/video/{bvid}/?p={number}",
                title=str(page.get("part") or info.get("title") or f"第 {number} 课"),
                index=number,
                duration=page.get("duration"),
                cover_url=info.get("pic"),
                source="bilibili-api-python",
                metadata={
                    "bvid": bvid, "cid": page.get("cid"), "page_index": page_index,
                    "collection": info.get("title", ""), "teacher": owner.get("name", ""),
                    "teacher_mid": owner.get("mid"), "views": (info.get("stat") or {}).get("view"),
                    "copyright": info.get("copyright"),
                },
            )
        )
    return items


def search_bilibili(keyword: str, limit: int = 10) -> list[dict[str, Any]]:
    """Search through bilibili-api-python's maintained WBI adapter."""
    _, search, sync = _bilibili_modules()
    result = sync(
        search.search_by_type(
            keyword=keyword,
            search_type=search.SearchObjectType.VIDEO,
            order_type=search.OrderVideo.TOTALRANK,
            page=1,
            page_size=min(max(limit, 1), 30),
        )
    )
    rows = result.get("result") or []
    return [
        {
            "bvid": row.get("bvid"),
            "title": re.sub(r"<[^>]+>", "", str(row.get("title", ""))),
            "author": row.get("author"), "duration": row.get("duration"),
            "play": row.get("play"), "favorites": row.get("favorites"),
            "description": row.get("description"), "pic": row.get("pic"),
            "url": f"https://www.bilibili.com/video/{row.get('bvid')}/",
        }
        for row in rows[:limit] if row.get("bvid")
    ]


def discover_generic(url: str, limit: int = 5, cookie_browser: str = "") -> list[CourseItem]:
    try:
        import yt_dlp
        from yt_dlp.networking.impersonate import ImpersonateTarget
    except ImportError as exc:
        raise RuntimeError("通用来源解析需要安装 yt-dlp") from exc
    site = identify_site(url)
    options = {
        "quiet": True,
        "no_warnings": True,
        "playlistend": limit,
        "socket_timeout": 30,
        "retries": 3,
        "extractor_retries": 3,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
        },
        "impersonate": ImpersonateTarget.from_str("chrome"),
    }
    if cookie_browser:
        if cookie_browser not in COOKIE_BROWSERS:
            raise RuntimeError("不支持的浏览器 Cookie 来源")
        options["cookiesfrombrowser"] = (cookie_browser,)
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)
    if not info:
        return []
    entries = [entry for entry in (info.get("entries") or [info]) if entry]
    items: list[CourseItem] = []
    for index, entry in enumerate(entries[:limit], 1):
        extractor = str(entry.get("extractor_key") or entry.get("extractor") or "generic")
        items.append(
            CourseItem(
                id=str(entry.get("id") or f"item-{index}"),
                source_url=str(entry.get("webpage_url") or entry.get("original_url") or url),
                title=str(entry.get("title") or f"第 {index} 课"),
                index=index,
                duration=entry.get("duration"),
                cover_url=entry.get("thumbnail"),
                source=site.name if site else extractor,
                metadata={
                    "provider": site.key if site else "generic",
                    "provider_name": site.name if site else extractor,
                    "extractor": extractor,
                    "uploader": entry.get("uploader") or entry.get("channel"),
                    "playlist": info.get("title") if info.get("entries") else None,
                },
            )
        )
    return items


def discover(url: str, limit: int = 5, cookie_browser: str = "") -> list[CourseItem]:
    value = validate_video_url(url)
    site = identify_site(value)
    if site and site.key == "bilibili" and BVID_RE.search(value):
        try:
            items = discover_bilibili(value, limit)
            if items:
                return items
        except Exception:
            # WBI and Bilibili APIs change frequently; yt-dlp is the maintained fallback.
            pass
    try:
        return discover_generic(value, limit, cookie_browser)
    except Exception as exc:
        name = site.name if site else "该网站"
        detail = str(exc).strip().splitlines()[-1] if str(exc).strip() else type(exc).__name__
        raise RuntimeError(
            f"{name}解析失败：{detail}。请确认链接公开可访问；登录、付费或 DRM 视频不受支持。"
        ) from exc


def probe_browser_cookies(url: str, browser: str, timeout: int = 120) -> dict[str, str]:
    value = validate_video_url(url)
    if browser not in COOKIE_BROWSERS:
        raise RuntimeError("不支持的浏览器 Cookie 来源")
    command = [
        sys.executable, "-m", "yt_dlp", "--cookies-from-browser", browser,
        "--impersonate", "chrome",
        "--simulate", "--no-playlist", "--no-warnings", "--socket-timeout", "20",
        "--retries", "1", "--print", "%(extractor_key)s\t%(id)s\t%(title).120s", value,
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            "读取浏览器 Cookie 超时。请检查 macOS 是否正在等待钥匙串授权，并先在该浏览器打开一次目标网站。"
        ) from exc
    if result.returncode:
        detail = (result.stdout + result.stderr).strip().splitlines()
        message = detail[-1] if detail else "未知错误"
        raise RuntimeError(
            f"浏览器 Cookie 检测失败：{message}。请先在该浏览器访问目标网站，并允许 macOS 钥匙串访问。"
        )
    line = next((line for line in reversed(result.stdout.splitlines()) if "\t" in line), "")
    extractor, video_id, title = (line.split("\t", 2) + ["", "", ""])[:3]
    return {
        "browser": browser,
        "extractor": extractor,
        "video_id": video_id,
        "title": title,
        "message": f"{browser} Cookie 可用，已成功解析《{title or video_id}》。Cookie 内容未被保存。",
    }
