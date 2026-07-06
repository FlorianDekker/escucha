# Vamos! — Specificatie leerengine

Vamos! is een Spaanse luister-app in Duolingo-stijl: de gebruiker leert eerst de relevante woorden voor een podcastaflevering, luistert daarna naar de podcast en beantwoordt er vragen over. Dit document beschrijft het complete, evidence-based leerontwerp. Bouw dit exact zo; de keuzes zijn bewust.

Doeltaal: Spaans. Moedertaal gebruiker: Nederlands.

---

## 1. Architectuurprincipe: één scheduler voor alles

Er is precies één spaced-repetition-scheduler in de hele app: **FSRS-6**. Alle leerbare items (woorden, chunks/frases, gemiste zinnen uit podcasts) worden kaarten in dezelfde scheduler. Geen parallel systeem met hardcoded intervallen zoals "dag 1 / dag 3 / dag 7"; FSRS doet dat beter en adaptief.

Implementatie: gebruik een officiële library van Open Spaced Repetition, **niet** zelf implementeren:
- TypeScript/JS: `ts-fsrs` (FSRS-6)
- Python-backend: `py-fsrs` (pip package `fsrs`, versie 6.x, 21 parameters)
- Optimizer voor later (parameters finetunen op echte reviewdata): `fsrs-rs` / `fsrs-optimizer`

Referenties om online te raadplegen indien nodig:
- https://github.com/open-spaced-repetition/ts-fsrs
- https://github.com/open-spaced-repetition/py-fsrs
- https://github.com/ankitects/anki (Anki-broncode, o.a. burying/scheduling)
- https://github.com/open-spaced-repetition/fsrs4anki-helper (Disperse Siblings-logica)

Instellingen:
- `desired_retention = 0.9` als default. Voor woorden die vereist zijn voor een geplande aflevering mag tijdelijk hoger gepland worden (zie §4).
- `learning_steps = [1m, 10m]`, `relearning_steps = [10m]`
- Fuzz aan.

## 2. Woordkaarten: siblings met harde regels

Elk woord (note) genereert twee kaarten (siblings):
- **Herkenning (ES → NL):** vraagkant = alléén native audio van het Spaanse woord, géén tekst. Antwoordkant = audio nogmaals + Spaanse spelling + Nederlandse betekenis + voorbeeldzin (optioneel).
- **Productie (NL → ES):** vraagkant = Nederlands woord (tekst). Na de poging (reveal) direct de correcte native uitspraak afspelen als feedback, plus Spaanse spelling.

Harde regels:
1. **Siblings nooit op dezelfde dag.** Implementeer sibling-dispersie zoals in de FSRS Helper add-on: bij het plannen van een kaart de due-datum verschuiven zodat siblings zo ver mogelijk uit elkaar liggen (idealiter midden in elkaars interval), binnen de fuzz-marge. Anki's "bury tot morgen" is onvoldoende; echt spreiden.
2. **Gefaseerde introductie.** Een nieuw woord start met alléén de herkenningskaart (die is nodig om de podcast te verstaan). De productiekaart wordt pas geïntroduceerd nadat de herkenningskaart de leerfase (learning steps) is gepasseerd, minimaal 1 dag later. Dit lost sibling-interferentie bij introductie by design op.
3. **Acquisitie ≠ retentie.** Nieuwe woorden doorlopen eerst een intra-sessie-acquisitiefase (learning steps 1m/10m, woord moet minimaal 2× goed voordat het als "geleerd" telt en de aflevering unlockt). Daarna neemt FSRS de lange termijn over.

Spaans-specifiek op de reveal expliciet laten zien/horen waar klank en schrift uiteenlopen: klemtoon en accenten (papá/papa), ñ, ll/y, c/z, j/g, stille h.

## 3. Podcastles: guided listening loop

Per les één audiofragment van 60–120 seconden (A2/B1-niveau voor de MVP). Flow:

1. **Context** — één zin setup ("Je hoort twee vrienden over weekendplannen").
2. **Luisterfocus** — toon alléén de vraagstam vooraf ("Luister waarom Ana te laat is"). **Nooit antwoordopties vóór de audio tonen.**
3. **Eerste keer luisteren** — zonder transcript. **Transcript nooit tonen vóór de eerste luisterpoging.**
4. **Gist-MCQ** — één brede vraag, opties verschijnen nu pas.
5. **Gericht herluisteren** — replay van het relevante segment (20–40 sec).
6. **Detailvragen** — mix van MCQ en **audio-cloze** ("No puedo ___ sábado"). Audio-cloze krijgt relatief veel gewicht: het dwingt decoderen op klankniveau.
7. **Evidence-feedback** — na elk antwoord: correct antwoord + de exacte Spaanse zin uit de audio + vertaling + replay-knop voor precies die zin. Nooit alleen "goed/fout".
8. **Transcript-luisterbeurt** — transcript per zin gesynct met audio (per zin volstaat, niet per woord). Spaans eerst, vertaling optioneel.
9. **Chunk-extractie** — 2–5 nuttige frases/chunks uit het fragment (geen losse random woorden), kort gedrild.
10. **Extensief luisteren** — als afsluiting: de volledige aflevering vrij uitluisteren, zonder vragen. Dit is expliciet onderdeel van de flow (volume + tempogewenning), niet optioneel.

## 4. Integratie vocab ↔ podcast (de kern van Vamos!)

1. **Datagedreven pre-teach.** Per aflevering: bepaal de woordenlijst van het transcript, vergelijk met de FSRS-state van de gebruiker (welke woorden kent hij met voldoende retrievability), en selecteer als pre-teach precies de onbekende woorden die nodig zijn om op ~95–98% lexicale dekking van het fragment te komen. Geen handmatige lijstjes.
2. **Podcast als review.** Als de gebruiker in de les een vraag correct beantwoordt die expliciet over een vooraf geleerd woord gaat (audio-cloze of woordvraag), voer dat terug als FSRS-review (rating Good) op de herkenningskaart. Wees conservatief: alleen bij expliciete woordvragen, niet bij algemene begripvragen.
3. **Fouten worden kaarten.** Gemiste chunks, verkeerd beantwoorde audio-clozes en niet-verstane zinnen worden nieuwe kaarten in dezelfde FSRS-scheduler: eerst audio → betekenis; later betekenis → chunk als sibling, met dezelfde dispersie- en faseringsregels als §2.

## 5. Scoring (MVP)

Simpel houden: gist goed/fout, detail goed/fout, en welke chunks naar review zijn gegaan. Feedback aan de gebruiker in die termen ("Je begreep de hoofdlijn, maar miste snelle chunks met *voy a…* — die komen morgen terug"). Geen dashboard met vijf metrics in de MVP.

## 6. MVP-scope

- Eén afleveringsfragment met context, 1 gist-MCQ, 2 detailvragen (waarvan 1 audio-cloze), evidence-feedback met zin-replay, transcript-na-antwoord.
- Pre-teach flow met FSRS-6, herkenningskaarten (audio-only vraagkant), acquisitiefase met learning steps.
- Productiekaarten met gefaseerde introductie + sibling-dispersie.
- Chunk-opslag naar FSRS-review.
- Extensieve luisterstap (hele aflevering afspelen).

Later: optimizer op eigen reviewdata, spraakinput voor productiekaarten, per-woord transcript-sync, dekkingsgraadanalyse verfijnen, **zinsdictee (audio → typen)** als zuivere zinsniveau-decodeertest (opvolger van het geschrapte zinnenbouw-idee; de per-segment echo-zinnen met exacte audiotijden staan hiervoor al klaar in de content).

## 7. Harde regels (samenvatting, niet overtreden)

1. Eén FSRS-6-scheduler voor álle leerbare items.
2. Siblings nooit dezelfde dag; actief dispergeren.
3. Productierichting pas introduceren na de herkenningsrichting (≥1 dag later).
4. Vraagkant herkenningskaart = alleen audio, geen tekst.
5. Antwoordopties nooit vóór de audio; vraagstam mag wel.
6. Transcript nooit vóór de eerste luisterpoging.
7. Feedback altijd met de exacte zin uit de audio + replay.
8. Pre-teach-selectie op basis van lexicale dekking + FSRS-state, niet handmatig.
9. Geen hardcoded reviewschema's naast FSRS.
