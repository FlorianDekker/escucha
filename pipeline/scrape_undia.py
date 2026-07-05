"""Scraper voor Un día en español (player.timelinenotation.com).

Haalt per aflevering het tijdgecodeerde transcript en de mp3-URL op.

Gebruik:
    python3.13 pipeline/scrape_undia.py <playerUrl> <epId>

Output: pipeline/work/<epId>/scraped.json
    { "title": ..., "audioUrl": ..., "sourceUrl": ..., "blocks": [ {"sec": 7.0, "speaker": "Rodrigo", "html": ..., "text": ...} ] }
"""
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as r:
        return r.read().decode("utf-8", "replace")


def strip_tags(html: str) -> str:
    class S(HTMLParser):
        def __init__(self):
            super().__init__()
            self.parts = []

        def handle_data(self, d):
            self.parts.append(d)

    s = S()
    s.feed(html)
    return re.sub(r"\s+", " ", "".join(s.parts)).strip()


def canonical_audio_url(html: str) -> str:
    m = re.search(r'https?://[^"\']*\.mp3[^"\']*', html)
    if not m:
        raise SystemExit("Geen mp3-URL gevonden")
    url = m.group(0)
    # chtbl.com/track/XXXX/ is een tracking-prefix; de kale URL erachter is canoniek
    track = re.match(r"https?://chtbl\.com/track/[^/]+/(.+)", url)
    if track:
        url = "https://" + track.group(1)
    return url


def parse_blocks(html: str):
    blocks = []
    # Elk transcriptblok: <div class="tag_block ..." data-time="7000" ...> ... transcript_tag_body ...
    for m in re.finditer(
        r'<div class="tag_block[^"]*"[^>]*data-time="(\d+)"[^>]*>(.*?)(?=<div class="tag_block|<div class="episode_page_footer|$)',
        html,
        re.DOTALL,
    ):
        ms = int(m.group(1))
        chunk = m.group(2)
        body = re.search(r'<div class="transcript_tag_body">(.*?)</div>', chunk, re.DOTALL)
        if not body:
            continue  # start/eind-markers en niet-transcript-tags overslaan
        body_html = body.group(1).strip()
        speaker = None
        sp = re.match(r"\s*<strong>([^<:]+):?</strong>\s*(.*)", body_html, re.DOTALL)
        text_html = body_html
        if sp:
            speaker = sp.group(1).strip()
            text_html = sp.group(2).strip()
        blocks.append(
            {
                "sec": ms / 1000.0,
                "speaker": speaker,
                "text": strip_tags(text_html),
            }
        )
    return blocks


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    url, ep_id = sys.argv[1], sys.argv[2]
    html = fetch(url)
    title = strip_tags(re.search(r"<title>(.*?)</title>", html, re.DOTALL).group(1))
    out = {
        "title": title,
        "sourceUrl": url,
        "audioUrl": canonical_audio_url(html),
        "blocks": parse_blocks(html),
    }
    dest = Path(__file__).parent / "work" / ep_id / "scraped.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{dest}: {len(out['blocks'])} blokken, audio: {out['audioUrl']}")


if __name__ == "__main__":
    main()
