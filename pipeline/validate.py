"""Valideer een aflevering-JSON tegen het Escucha-schema en sanity-checks.

Gebruik:
    python3.13 pipeline/validate.py public/content/episodes/undia/undia-s1e1.json
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

QUESTION_TYPES = {"mc", "vocabInContext", "gap"}
MIN_SEG, MAX_SEG = 20, 75
GLOSSARY_COVERAGE = 0.95

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def normalize(word: str) -> str:
    return re.sub(r"[¿?¡!.,;:\"'«»()\[\]…–—-]", "", word.lower()).strip()


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


STOPWORDS = set(
    """el la los las un una unos unas de del a al y o u e que qué en es son ser estar con por para mi mis tu tus su sus yo tú él ella nosotros ellos se me te le lo les nos si sí no ni como cómo cuando cuándo donde dónde quien quién cual cuál más pero este esta esto ese esa eso hay ha he has hemos han era fue muy ya tan sin sobre entre hasta desde mí ti hace poco entonces cada ti otro otra ahora aquí allí así todo toda vamos va van estás está estoy eres soy tiene tengo tienes puede puedo puedes""".split()
)


def check_episode(path: Path):
    ep = json.loads(path.read_text(encoding="utf-8"))

    for field in ["schemaVersion", "id", "podcastId", "title", "level", "audioUrl", "durationSec", "source", "vocab", "glossary", "segments"]:
        if field not in ep:
            err(f"veld ontbreekt: {field}")
    if errors:
        return ep

    if not ep["audioUrl"].startswith("http"):
        err("audioUrl is geen URL")
    for f in ["rssUrl", "transcriptUrl", "attributionNl"]:
        if f not in ep["source"]:
            err(f"source.{f} ontbreekt")

    # vocab
    ids = set()
    for v in ep["vocab"]:
        for f in ["id", "es", "nl", "exampleEs"]:
            if f not in v:
                err(f"vocab-item mist veld {f}: {v}")
        if v["id"] in ids:
            err(f"dubbel vocab-id: {v['id']}")
        ids.add(v["id"])
    ncore = sum(1 for v in ep["vocab"] if v.get("core"))
    if not (6 <= ncore <= 15):
        warn(f"{ncore} kernwoorden (richtlijn 8-12)")

    # segments
    prev_end = 0.0
    all_words = []
    for seg in ep["segments"]:
        sid = seg.get("id", "?")
        if seg["startSec"] < prev_end:
            err(f"{sid}: startSec {seg['startSec']} < einde vorige segment {prev_end}")
        if seg["endSec"] <= seg["startSec"]:
            err(f"{sid}: endSec <= startSec")
        dur = seg["endSec"] - seg["startSec"]
        if not (MIN_SEG <= dur <= MAX_SEG):
            warn(f"{sid}: duur {dur:.0f}s buiten richtlijn {MIN_SEG}-{MAX_SEG}s")
        if seg["endSec"] > ep["durationSec"] + 1:
            err(f"{sid}: endSec {seg['endSec']} voorbij durationSec {ep['durationSec']}")
        if seg["startSec"] - prev_end > 20 and prev_end > 0:
            warn(f"{sid}: gat van {seg['startSec'] - prev_end:.0f}s na vorige segment")
        prev_end = seg["endSec"]

        for s in seg.get("sentences", []):
            if not (seg["startSec"] <= s["startSec"] <= seg["endSec"]):
                err(f"{sid}: zin-startSec {s['startSec']} buiten segment")
            all_words += [normalize(w) for w in s["es"].split()]

        questions = seg.get("questions") or ([seg["question"]] if seg.get("question") else [])
        if not questions:
            err(f"{sid}: geen vragen")
            continue
        if "questions" in seg and len(questions) != 2:
            warn(f"{sid}: {len(questions)} vragen (richtlijn: 2)")
        for qi, q in enumerate(questions):
            tag = f"{sid}.q{qi + 1}"
            if q["type"] not in QUESTION_TYPES:
                err(f"{tag}: onbekend vraagtype {q['type']}")
            if q["type"] == "gap" and "textEs" not in q:
                err(f"{tag}: gap-vraag zonder textEs")
            if not (0 <= q["answerIndex"] < len(q["choices"])):
                err(f"{tag}: answerIndex buiten bereik")
            if len(q["choices"]) < 3:
                warn(f"{tag}: maar {len(q['choices'])} keuzes")
            if q["type"] == "vocabInContext" and q.get("vocabId") not in ids:
                err(f"{tag}: vocabId {q.get('vocabId')} bestaat niet in vocab")

        # schema v3: contextNl/focusNl + chunks
        if "questions" in seg:
            if not seg.get("focusNl"):
                warn(f"{sid}: geen focusNl (luisterfocus, schema v3)")
            if not seg.get("contextNl"):
                warn(f"{sid}: geen contextNl (schema v3)")
            chunks = seg.get("chunks") or []
            if not (1 <= len(chunks) <= 3):
                warn(f"{sid}: {len(chunks)} chunks (richtlijn 1-2)")
            for ch in chunks:
                nw = len(ch.get("es", "").split())
                if not (2 <= nw <= 7):
                    warn(f"{sid}: chunk '{ch.get('es', '')[:30]}' heeft {nw} woorden (richtlijn 2-6)")

        echo = seg.get("echo")
        if "questions" in seg and not echo:
            warn(f"{sid}: geen echo-zin (schema v2 verwacht er een)")
        if echo:
            n_words = len([w for w in echo["es"].split() if w.strip()])
            if not (4 <= n_words <= 14):
                warn(f"{sid}: echo-zin heeft {n_words} woorden (richtlijn 4-12)")
            if "endSec" in echo and not (seg["startSec"] < echo["endSec"] <= seg["endSec"]):
                err(f"{sid}: echo-pauzepunt buiten het segment")

    # glossary-dekking van inhoudswoorden
    glossary = {normalize(k) for k in ep["glossary"]}
    glossary_noacc = {strip_accents(g) for g in glossary}
    content = [w for w in all_words if w and w not in STOPWORDS and not w.isdigit()]
    missing = sorted({w for w in content if w not in glossary and strip_accents(w) not in glossary_noacc})
    coverage = 1 - len({w for w in content if w not in glossary and strip_accents(w) not in glossary_noacc}) / max(1, len(set(content)))
    if coverage < GLOSSARY_COVERAGE:
        warn(f"glossary-dekking {coverage:.0%} < {GLOSSARY_COVERAGE:.0%}; ontbrekend (uniek): {', '.join(missing[:40])}")

    def seg_questions(s):
        return s.get("questions") or ([s["question"]] if s.get("question") else [])

    ntypes = {
        t: sum(1 for s in ep["segments"] for q in seg_questions(s) if q.get("type") == t)
        for t in QUESTION_TYPES
    }
    if 0 in ntypes.values():
        warn(f"vraagtypemix onvolledig: {ntypes}")

    return ep


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    path = Path(sys.argv[1])
    ep = check_episode(path)
    print(f"== {path.name} ({len(ep.get('segments', []))} segmenten) ==")
    for w in warnings:
        print(f"  WAARSCHUWING: {w}")
    for e in errors:
        print(f"  FOUT: {e}")
    if not errors and not warnings:
        print("  OK, geen problemen")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
