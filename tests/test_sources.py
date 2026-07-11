import sys
from types import SimpleNamespace

import pytest

from app.sources import discover_generic, identify_site, supported_sites, validate_video_url


@pytest.mark.parametrize(
    ("url", "key"),
    [
        ("https://www.bilibili.com/video/BV1234567890", "bilibili"),
        ("https://v.douyin.com/example/", "douyin"),
        ("https://v.qq.com/x/cover/example.html", "tencent"),
        ("https://www.iqiyi.com/v_example.html", "iqiyi"),
        ("https://www.xiaohongshu.com/explore/example", "xiaohongshu"),
    ],
)
def test_identify_domestic_video_sites(url: str, key: str):
    assert identify_site(url).key == key


def test_validate_video_url_rejects_non_web_schemes():
    with pytest.raises(RuntimeError, match="http"):
        validate_video_url("file:///tmp/video.mp4")


def test_supported_sites_exposes_public_catalog():
    keys = {site["key"] for site in supported_sites()}
    assert {"bilibili", "douyin", "youku", "iqiyi", "tencent"} <= keys


def test_generic_discovery_normalizes_provider_metadata(monkeypatch):
    info = {
        "id": "demo/unsafe",
        "title": "公开物理课",
        "duration": 123,
        "webpage_url": "https://v.qq.com/x/cover/demo.html",
        "extractor_key": "TencentVideo",
        "uploader": "示例老师",
    }

    class FakeYDL:
        def __init__(self, options):
            self.options = options

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def extract_info(self, url, download):
            assert download is False
            assert self.options["playlistend"] == 5
            return info

    monkeypatch.setitem(sys.modules, "yt_dlp", SimpleNamespace(YoutubeDL=FakeYDL))
    item = discover_generic(info["webpage_url"], 5)[0]

    assert item.source == "腾讯视频"
    assert item.metadata["provider"] == "tencent"
    assert item.metadata["extractor"] == "TencentVideo"
    assert item.metadata["uploader"] == "示例老师"
