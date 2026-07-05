# Vamos!

Duolingo-achtige web-app om Spaans te leren met echte podcasts: eerst de kernwoorden oefenen, dan luisteren met auto-pauze per fragment en een vraag over wat je net hoorde, daarna meelezen met tap-op-woord-vertaling. Voortgang (streak, XP, spaced repetition) staat in localStorage.

## Ontwikkelen

```
npm install
npm run dev
```

Deploy gaat automatisch naar GitHub Pages via `.github/workflows/deploy.yml` bij een push naar `main`.

## Nieuwe aflevering toevoegen (pipeline)

1. `python3.13 pipeline/scrape_undia.py <playerUrl> <epId>` (Un día en español: transcript + tijdcodes uit de timeline-player)
2. Volg `pipeline/PROMPT.md` om er met Claude Code een aflevering-JSON van te maken
3. `python3.13 pipeline/validate.py public/content/episodes/<podcast>/<epId>.json`
4. Aflevering opnemen in `public/content/ladder.json`

## Bronnen en attributie

De audio wordt gestreamd vanaf de originele podcast-feeds en de transcripts komen van de websites van de makers; bij elke aflevering staat bronvermelding met link. Alle rechten liggen bij de makers (o.a. Babbel voor Un día en español). Dit is een persoonlijk leerproject.
