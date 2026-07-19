#!/usr/bin/env python3
"""note の RSS から最新記事を取得し、index.html の最新記事カードを更新する。

- Python 標準ライブラリのみ使用
- 許可する記事URLは https://note.com/tsudsuraya/n/ で始まるもののみ
- 取得失敗・形式異常時は index.html を書き換えず終了コード 1
- 内容が同じ場合はファイルを更新しない
"""
import html
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

RSS_URL = "https://note.com/tsudsuraya/rss/"
ALLOWED_PREFIX = "https://note.com/tsudsuraya/n/"
INDEX_PATH = Path(__file__).resolve().parent.parent / "index.html"
MARKER_START = "<!-- LATEST_ARTICLE_START -->"
MARKER_END = "<!-- LATEST_ARTICLE_END -->"


def fetch_latest():
    """RSS の先頭記事の (title, link) を返す。異常時は例外を投げる。"""
    req = urllib.request.Request(
        RSS_URL, headers={"User-Agent": "Mozilla/5.0 (cut-the-world_linktree updater)"}
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        data = res.read()
    root = ET.fromstring(data)
    item = root.find("./channel/item")
    if item is None:
        raise ValueError("RSS に item が見つかりません")
    title = (item.findtext("title") or "").strip()
    link = (item.findtext("link") or "").strip()
    if not title:
        raise ValueError("記事タイトルが空です")
    if not link.startswith(ALLOWED_PREFIX):
        raise ValueError(f"許可されていない記事URLです: {link}")
    return title, link


def build_block(title, link):
    """マーカーを含む最新記事カードのHTMLブロックを組み立てる。"""
    t = html.escape(title)
    l = html.escape(link)
    return "\n".join([
        MARKER_START,
        f'      <a class="book" href="{l}" target="_blank" rel="noopener">',
        '        <span class="dot"></span>',
        '        <span class="label"><span class="title">最新記事</span>',
        f'        <span class="sub">{t}</span></span>',
        '        <span class="arrow">&rsaquo;</span>',
        '      </a>',
        '      ' + MARKER_END,
    ])


def main():
    try:
        title, link = fetch_latest()
    except Exception as e:
        print(f"RSS の取得に失敗しました: {e}", file=sys.stderr)
        return 1

    try:
        with open(INDEX_PATH, "r", encoding="utf-8", newline="") as f:
            src = f.read()
    except OSError as e:
        print(f"index.html を読めません: {e}", file=sys.stderr)
        return 1

    pattern = re.compile(
        re.escape(MARKER_START) + r".*?" + re.escape(MARKER_END), re.DOTALL
    )
    if not pattern.search(src):
        print("index.html にマーカーが見つかりません", file=sys.stderr)
        return 1

    block = build_block(title, link)
    new_src = pattern.sub(lambda _: block, src, count=1)

    if new_src == src:
        print(f"変更なし: {title} ({link})")
        return 0

    with open(INDEX_PATH, "w", encoding="utf-8", newline="") as f:
        f.write(new_src)
    print(f"更新しました: {title} ({link})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
