# Instructie: aflevering-JSON genereren

Je zet een gescrapete podcast-aflevering om naar een Escucha-aflevering-JSON. Input: `pipeline/work/<epId>/scraped.json` (blokken met `sec`, `speaker`, `text`). Referentie voor het schema: `public/content/episodes/undia/undia-s1e1.json`.

## Stappen

1. Lees `scraped.json` volledig. Bepaal `durationSec` via de Spreaker-API (`https://api.spreaker.com/v2/episodes/<id>` uit de audioUrl, veld `duration` in ms) of laat het einde van het laatste blok + 45s als schatting en meld dat.
2. **Segmenten**: groepeer blokken tot fragmenten van 30-60 seconden op thematische grenzen (scènewissel, nieuw gespreksonderwerp). Segmentgrenzen liggen per constructie op blokgrenzen. De Babbel-outro (productie-credits) krijgt géén segment. Elke `sentences[]`-entry = één blok (startSec, speaker, es). Corrigeer evidente typo's in sprekersnamen.
3. **Vocab**: kies 8-12 kernwoorden/frases die (a) frequent of dragend zijn in dit verhaal en (b) nuttig op A1-niveau. Elk item: `id` (kebab-case), `es` (met lidwoord bij zelfstandige naamwoorden), `nl`, `exampleEs` (letterlijke zin uit de aflevering), `core: true`.
4. **Glossary**: map van genormaliseerd woord (lowercase, zonder leestekens, mét accenten) naar korte NL-vertaling, voor ALLE inhoudswoorden in de segments (werkwoordsvormen apart opnemen zoals ze voorkomen). Eigennamen krijgen een korte duiding. Doel: validator-dekking ≥95%.
4b. **Intro-regel**: alleen de allereerste aflevering van de app behoudt de generieke podcast-welkomstintro van Rodrigo ("Hola, soy Rodrigo... este pódcast es perfecto para ti"). Bij alle andere afleveringen begint het eerste segment bij de aflevering-specifieke preview of het verhaal zelf; de generieke welkomstzinnen krijgen geen segment. Dek verder het volledige verhaal; alleen pure Babbel-productiecredits en bonus-promo's krijgen geen segment.

4d. **Guided listening (schema v3, spec §3)**: per segment ook:
   - `"contextNl"`: één korte setup-zin voor het fragment ("Andrea staat voor haar eerste surfles").
   - `"focusNl"`: de luisterfocus, een vraagstam zónder antwoordopties ("Luister waarom Andrea niet bang meer is"). Sluit aan op de gist-vraag.
   - `questions[0]` is de GIST-vraag (breed, over de hoofdlijn; promptNl matcht de focus), `questions[1]` de detailvraag. Maak bij ongeveer de helft van de segmenten de detailvraag een `gap` (audio-cloze: de app speelt dan de evidence-zin als audio bij de vraag), zodat audio-cloze zwaar meeweegt.
   - `"chunks"`: 1 à 2 nuttige frases per segment als `[{ "es": "<letterlijke frase, 2-6 woorden>", "nl": "<vertaling>" }]` (geen losse random woorden; denk aan "voy a...", "no sé nadar", "otra vez"). Tijden vult `evidence_times.py`.

4c. **Echo-zin** (schema v2): kies per segment één letterlijke zin uit dat segment van 4-12 woorden, ergens rond het midden, die dragend en goed na te bouwen is. Schrijf hem als `"echo": { "es": "<zin>" }` op het segment; de tijden (startSec/endSec = pauzepunt) vult `evidence_times.py` in. De app pauzeert daar en laat de gebruiker de zin nabouwen met woordtegels.

5. **Vragen** (schema v2): per segment een array `"questions"` met precies TWEE vragen, mix over de aflevering van de drie typen:
   - `mc`: begripsvraag over de inhoud (promptNl, 4 choices, answerIndex, explanationNl met het letterlijke Spaanse citaat als bewijs)
   - `vocabInContext`: "Je hoorde \"...\", wat betekent ...?" gekoppeld aan een `vocabId`
   - `gap`: één zin uit het segment met `___` (textEs) + 4 keuzes voor het ontbrekende woord
   Het juiste antwoord staat NIET altijd op index 0: varieer answerIndex. Afleiders moeten plausibel maar eenduidig fout zijn. Alle promptNl/choices/explanationNl in natuurlijk Nederlands, geen em-dash.
   Elke vraag krijgt ook een `evidence`-object: de letterlijke zin(nen) uit het transcript waarin het antwoord te horen was (`es`) plus een natuurlijke NL-vertaling (`nl`). De audiotijden van evidence én echo worden daarna gevuld met `python3.13 pipeline/evidence_times.py <episode.json> pipeline/work/<epId>` (vereist words.json van word_clips.py).
6. Schrijf naar `public/content/episodes/<podcastId>/<epId>.json` en voeg de aflevering toe aan `public/content/ladder.json`: nieuwe unit met steps `words`, 2 (of bij >7 min: 3) `listen`-delen met gebalanceerde segmentIds, en `gate` met passPct 80.
7. Draai `python3.13 pipeline/word_clips.py <episode.json> pipeline/work/<epId>/audio.mp3` om per vocab-item de audioclip (woord uitgesproken in de podcast) toe te voegen; download de mp3 eerst als die er nog niet staat. Los items "zonder clip" op door het woord of de matcher te checken.
8. Draai `python3.13 pipeline/validate.py <pad>` en los alle FOUTEN en zo veel mogelijk WAARSCHUWINGEN op.
