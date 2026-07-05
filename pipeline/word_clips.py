"""Bepaal per vocab-item de plek in de audio waar het woord wordt uitgesproken.

Transcribeert de aflevering met faster-whisper (woord-tijdstempels) en zoekt per
vocab-item de beste match: de voorkomens van de woordtokens, gescoord op overlap
van de omringende woorden met exampleEs. Schrijft "clip": {startSec, endSec} in
elk vocab-item van de aflevering-JSON.

Gebruik:
    python3.13 pipeline/word_clips.py <episode.json> <audio.mp3>
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ARTICLES = {"el", "la", "los", "las", "un", "una", "unos", "unas"}
PAD_START = 0.12
PAD_END = 0.25


def norm(w: str) -> str:
    w = w.lower().strip()
    w = "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9ñ]", "", w)


def transcribe(audio_path: str):
    # Cache naast de audio zodat een tweede run (bijv. na een matcher-fix) gratis is.
    cache = Path(audio_path).with_name("words.json")
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))

    from faster_whisper import WhisperModel

    model = WhisperModel("small", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(audio_path, language="es", word_timestamps=True)
    words = []
    for seg in segments:
        for w in seg.words or []:
            n = norm(w.word)
            if n:
                words.append({"w": n, "start": w.start, "end": w.end})
    cache.write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
    return words


def find_clip(words, item):
    tokens = [norm(t) for t in item["es"].split()]
    tokens = [t for t in tokens if t]
    # Lidwoord vooraan niet verplicht in de match (audio zegt bijv. "un chaleco")
    core = tokens[1:] if len(tokens) > 1 and tokens[0] in ARTICLES else tokens
    if not core:
        return None

    context = {norm(t) for t in re.split(r"\s+", item.get("exampleEs", "")) if norm(t)}

    def variants(token):
        # Verbuigingsfallback: enkelvoud/meervoud ("miedo" matcht ook "miedos")
        v = {token, token + "s", token + "es"}
        if token.endswith("es"):
            v.add(token[:-2])
        if token.endswith("s"):
            v.add(token[:-1])
        return v

    def matches(i, exact):
        return all(
            words[i + j]["w"] == core[j] if exact else words[i + j]["w"] in variants(core[j])
            for j in range(len(core))
        )

    candidates = []
    for exact in (True, False):
        for i in range(len(words) - len(core) + 1):
            if matches(i, exact):
                around = {w["w"] for w in words[max(0, i - 8) : i + len(core) + 8]}
                score = len(around & context)
                candidates.append((score, i))
        if candidates:
            break
    if not candidates:
        return None

    score, i = max(candidates)
    start_i, end_i = i, i + len(core) - 1
    # Direct voorafgaand lidwoord meenemen ("la playa" klinkt natuurlijker dan "playa")
    if start_i > 0 and words[start_i - 1]["w"] in ARTICLES:
        start_i -= 1
    return {
        "startSec": round(max(0, words[start_i]["start"] - PAD_START), 2),
        "endSec": round(words[end_i]["end"] + PAD_END, 2),
    }


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    ep_path, audio_path = Path(sys.argv[1]), sys.argv[2]
    ep = json.loads(ep_path.read_text(encoding="utf-8"))

    print("Transcriberen (faster-whisper small, woord-tijdstempels)...")
    words = transcribe(audio_path)
    print(f"{len(words)} woorden herkend")

    missing = []
    for item in ep["vocab"]:
        clip = find_clip(words, item)
        if clip:
            item["clip"] = clip
            print(f"  {item['es']:28s} {clip['startSec']:7.2f} - {clip['endSec']:7.2f}")
        else:
            missing.append(item["es"])
            print(f"  {item['es']:28s} GEEN MATCH")

    ep_path.write_text(json.dumps(ep, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nBijgewerkt: {ep_path}")
    if missing:
        print(f"Zonder clip (handmatig checken): {', '.join(missing)}")


if __name__ == "__main__":
    main()
