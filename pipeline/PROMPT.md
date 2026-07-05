# Instructie: aflevering-JSON genereren

Je zet een gescrapete podcast-aflevering om naar een Escucha-aflevering-JSON. Input: `pipeline/work/<epId>/scraped.json` (blokken met `sec`, `speaker`, `text`). Referentie voor het schema: `public/content/episodes/undia/undia-s1e1.json`.

## Stappen

1. Lees `scraped.json` volledig. Bepaal `durationSec` via de Spreaker-API (`https://api.spreaker.com/v2/episodes/<id>` uit de audioUrl, veld `duration` in ms) of laat het einde van het laatste blok + 45s als schatting en meld dat.
2. **Segmenten**: groepeer blokken tot fragmenten van 30-60 seconden op thematische grenzen (scènewissel, nieuw gespreksonderwerp). Segmentgrenzen liggen per constructie op blokgrenzen. De Babbel-outro (productie-credits) krijgt géén segment. Elke `sentences[]`-entry = één blok (startSec, speaker, es). Corrigeer evidente typo's in sprekersnamen.
3. **Vocab**: kies 8-12 kernwoorden/frases die (a) frequent of dragend zijn in dit verhaal en (b) nuttig op A1-niveau. Elk item: `id` (kebab-case), `es` (met lidwoord bij zelfstandige naamwoorden), `nl`, `exampleEs` (letterlijke zin uit de aflevering), `core: true`.
4. **Glossary**: map van genormaliseerd woord (lowercase, zonder leestekens, mét accenten) naar korte NL-vertaling, voor ALLE inhoudswoorden in de segments (werkwoordsvormen apart opnemen zoals ze voorkomen). Eigennamen krijgen een korte duiding. Doel: validator-dekking ≥95%.
5. **Vragen**: per segment precies één vraag, mix over de aflevering van de drie typen:
   - `mc`: begripsvraag over de inhoud (promptNl, 4 choices, answerIndex, explanationNl met het letterlijke Spaanse citaat als bewijs)
   - `vocabInContext`: "Je hoorde \"...\", wat betekent ...?" gekoppeld aan een `vocabId`
   - `gap`: één zin uit het segment met `___` (textEs) + 4 keuzes voor het ontbrekende woord
   Het juiste antwoord staat NIET altijd op index 0: varieer answerIndex. Afleiders moeten plausibel maar eenduidig fout zijn. Alle promptNl/choices/explanationNl in natuurlijk Nederlands, geen em-dash.
6. Schrijf naar `public/content/episodes/<podcastId>/<epId>.json` en voeg de aflevering toe aan `public/content/ladder.json`: nieuwe unit met steps `words`, 2 (of bij >7 min: 3) `listen`-delen met gebalanceerde segmentIds, en `gate` met passPct 80.
7. Draai `python3.13 pipeline/word_clips.py <episode.json> pipeline/work/<epId>/audio.mp3` om per vocab-item de audioclip (woord uitgesproken in de podcast) toe te voegen; download de mp3 eerst als die er nog niet staat. Los items "zonder clip" op door het woord of de matcher te checken.
8. Draai `python3.13 pipeline/validate.py <pad>` en los alle FOUTEN en zo veel mogelijk WAARSCHUWINGEN op.
