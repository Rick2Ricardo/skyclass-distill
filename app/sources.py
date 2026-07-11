from __future__ import annotations

import re
from typing import Any

from .models import CourseItem


BVID_RE = re.compile(r"(BV[0-9A-Za-z]{10})")


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


def discover_generic(url: str, limit: int = 5) -> list[CourseItem]:
    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError("通用来源解析需要安装 yt-dlp") from exc
    options = {"quiet": True, "no_warnings": True, "extract_flat": "in_playlist", "playlistend": limit}
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)
    entries = info.get("entries") or [info]
    return [
        CourseItem(
            id=str(entry.get("id") or f"item-{index}"),
            source_url=entry.get("webpage_url") or entry.get("url") or url,
            title=str(entry.get("title") or f"第 {index} 课"), index=index,
            duration=entry.get("duration"), cover_url=entry.get("thumbnail"),
            source=str(entry.get("extractor_key") or "yt-dlp").lower(),
        )
        for index, entry in enumerate(entries[:limit], 1)
    ]


def discover(url: str, limit: int = 5) -> list[CourseItem]:
    if "bilibili.com" in url or BVID_RE.search(url):
        return discover_bilibili(url, limit)
    return discover_generic(url, limit)
