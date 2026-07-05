"""Vul audiotijden in voor question.evidence (de zin waarin het antwoord zat).

Zoekt per evidence.es de best passende woordreeks in de whisper-woordtijden
(words.json, gemaakt/gecachet door word_clips.py) via een schuivend venster met
fuzzy score, en schrijft startSec/endSec in het evidence-object. Het venster
moet binnen het segment van de vraag vallen (marge 5s).

Gebruik:
    python3.13 pipeline/evidence_times.py <episode.json> <work-dir met words.json>
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

PAD_START = 0.15
PAD_END = 0.35
MIN_SCORE = 0.6


def norm(w: str) -> str:
    w = w.lower().strip()
    w = "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9ñ]", "", w)


def find_span(words, phrase, win_start, win_end):
    tokens = [norm(t) for t in re.split(r"\s+", phrase) if norm(t)]
    if not tokens:
        return None
    idxs = [
        i
        for i, w in enumerate(words)
        if win_start - 5 <= w["start"] <= win_end + 5
    ]
    if not idxs or len(idxs) < len(tokens) // 2:
        return None
    lo, hi = idxs[0], idxs[-1]
    best = None
    n = len(tokens)
    for i in range(lo, hi - n // 2 + 1):
        window = [words[i + j]["w"] for j in range(min(n, len(words) - i))]
        hits = sum(1 for a, b in zip(tokens, window) if a == b)
        score = hits / n
        if best is None or score > best[0]:
            best = (score, i, min(i + n, len(words)) - 1)
    if not best or best[0] < MIN_SCORE:
        return None
    _, i, j = best
    return {
        "startSec": round(max(0, words[i]["start"] - PAD_START), 2),
        "endSec": round(words[j]["end"] + PAD_END, 2),
    }


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    ep_path = Path(sys.argv[1])
    words = json.loads((Path(sys.argv[2]) / "words.json").read_text(encoding="utf-8"))
    ep = json.loads(ep_path.read_text(encoding="utf-8"))

    for seg in ep["segments"]:
        ev = seg.get("question", {}).get("evidence")
        if not ev or "startSec" in ev:
            continue
        span = find_span(words, ev["es"], seg["startSec"], seg["endSec"])
        if span:
            ev.update(span)
            print(f"  {seg['id']}: {span['startSec']:7.2f} - {span['endSec']:7.2f}")
        else:
            print(f"  {seg['id']}: GEEN MATCH, valt terug op hele segment")
            ev.update({"startSec": seg["startSec"], "endSec": seg["endSec"]})

    ep_path.write_text(json.dumps(ep, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Bijgewerkt: {ep_path}")


if __name__ == "__main__":
    main()
