# Vamos! — Design-briefing v4 (voor Claude Design)

Context: jij hebt eerder het design gemaakt voor de Spaans-leerapp Vamos! (aubergine-thema, Nunito + Baloo 2, telefoon-mockups: Thuis, Leerpad met eilanden en "Jouw reis", Aflevering-intro, Woordoefening, Luisteren + vraag, Feedback). Dat design is volledig gebouwd. Daarna is er een evidence-based leerengine ingebouwd (FSRS spaced repetition + een "guided listening"-lesopbouw) waardoor een aantal schermen is veranderd en er nieuwe schermen zijn bijgekomen die nog géén design hebben. Hieronder alles wat je nodig hebt om het design bij te werken. De bestaande stijl (kleuren, 3D-knoppen met schaduw eronder, bottom-sheets, chatbubbel-transcript, eilanden-leerpad) blijft het uitgangspunt.

## Harde regels (mogen in geen enkel ontwerp geschonden worden)

1. Antwoordopties staan NOOIT in beeld voordat de audio is afgespeeld. Een vraagstam vooraf mag wel.
2. Het transcript is NOOIT zichtbaar vóór de eerste luisterpoging (ook niet in de leesmodus).
3. De vraagkant van een woord-herkenningskaart is ALLEEN audio: geen Spaanse tekst zichtbaar tot na het controleren.
4. Feedback op een vraag toont altijd de exacte Spaanse zin uit de audio + vertaling + een replay-knop voor precies die zin (nooit alleen "goed/fout").

## 1. Aflevering-intro (gewijzigd)

- De woordenlijst is niet meer vast: de app kiest zelf maximaal 15 woorden op basis van wat de gebruiker al kent.
- NIEUW element onder de beschrijving: een dekkingsregel, nu als tekstregel "Woorddekking: 58% → 72% na deze les". Ontwerp hier gerust iets grafisch voor (bijv. een kleine voortgangsbalk met twee markers of een voor/na-chip).
- NIEUWE lege-staat: als de gebruiker alle woorden al kent toont het scherm "Je kent alle woorden voor deze aflevering al" met alleen een knop "Doorgaan ▸".
- De rest (cover-art, titel, meta "n fragmenten · n min · n woorden", woordenlijst met speaker-icoontjes, "Leer de woorden"-knop) bestaat al.

## 2. Woordoefening (fors gewijzigd): twee kaarttypen

### 2a. Herkenningskaart (Spaans audio → Nederlands)
- VRAAGKANT: géén Spaans woord in beeld. Alleen een grote luisterknop ("Tik en luister") die de native uitspraak afspeelt, met een herluister-knop. Daaronder de toggle Meerkeuze/Typen en het antwoordgebied: 4 Nederlandse betekenissen (2x2-grid zoals nu) óf een typveld voor de Nederlandse vertaling.
- ANTWOORDKANT (na Controleren): de audio speelt nogmaals, en nu verschijnt de Spaanse spelling groot, de Nederlandse betekenis, de voorbeeldzin uit de aflevering, en een klank/schrift-hint als die relevant is (bijv. "de h schrijf je wel, maar spreek je niet uit" of "ñ klinkt als nj"). Ontwerp die hint als klein, vriendelijk element.
- Nieuwe woorden herhalen binnen de les tot ze 2x goed zijn beantwoord; de voortgangsbalk loopt dus niet strikt lineair. Rechtsboven staat de streak-teller (bestaat al).

### 2b. Productiekaart (Nederlands → Spaans typen)
- NIEUW kaarttype (verschijnt pas een dag nadat het woord herkend wordt): vraagkant toont het NEDERLANDSE woord als tekst, de gebruiker typt het Spaanse woord. Na Controleren speelt direct de native uitspraak en verschijnt de correcte Spaanse spelling.
- Deze kaart heeft geen Meerkeuze/Typen-toggle (altijd typen).

## 3. Luisterles (gewijzigd): guided listening per fragment

Nieuwe fase VÓÓR het luisteren, daarna twee vragen in plaats van één:

### 3a. Luisterfocus (NIEUW scherm/paneel)
- Boven de speler, vóór de eerste play: een klein gedempt regeltje met de context ("Andrea staat voor haar eerste surfles.") en daaronder prominent het label "LUISTERFOCUS" met de vraagstam ("Luister waarom Andrea niet bang meer is."). Geen antwoordopties. De gebruiker tikt daarna zelf op play.

### 3b. Vragensheet (gewijzigd)
- De sheet verschijnt na de auto-pauze, zoals nu, maar het label is nu "VRAAG · HOOFDLIJN" voor de eerste (brede) vraag en "VRAAG · DETAIL" voor de tweede.
- Bij gatentekst-vragen (audio-cloze) staat in de sheet een extra knop "🔊 Speel de zin" die precies de zin met het gat afspeelt.
- Verder ongewijzigd: opties verschijnen pas hier, Controleren onthult groen/rood in de opties, dan Doorgaan naar de volgende vraag.

### 3c. Feedback per fragment (licht gewijzigd)
- Kop op basis van de score van de 2 vragen: alles goed = "¡Correcto!" (groen vinkje), anders "¡Casi!" (gouden uitroepteken) met subregel "1 van de 2 goed". XP-pill eronder.
- Per FOUTE vraag een "JUISTE ANTWOORD"-kaart (met de vraag erboven als er meer vragen waren) én een "HIER HOORDE JE HET"-kaart (bestaat al: play-knop + Spaanse zin + NL-vertaling). Bij alles goed alleen die van de laatste vraag.
- Daarna het transcript van het fragment als chatbubbels met tikbare woorden (bestaat al).

## 4. Chunk-drill (NIEUW scherm)

Aan het einde van elk luisterdeel (na het laatste fragment, vóór het afrondscherm):
- Per chunk (2-5 per les) een oefening: een play-knop die de frase uit de podcast afspeelt, de Spaanse frase groot in beeld ("no sé nadar"), en 4 Nederlandse betekenissen als keuzes. Controleren → groen/rood + vertaling.
- Kop/label-idee: "CHUNK n/m" met een korte uitleg ("Handige frases uit dit fragment").
- Gemiste chunks gaan naar de herhaalstapel; dat meldt het afrondscherm.

## 5. Afrondscherm van een luisterdeel (licht gewijzigd)

- Toont nu "x van de y oefeningen goed" + totaal XP.
- NIEUWE regel als er chunks gemist zijn: "2 chunks gaan naar je herhaalstapel, die komen binnenkort terug."

## 6. Uitluisteren (NIEUW scherm, eigen stap in het leerpad)

- Doel: de hele aflevering vrij uitluisteren, zonder vragen (volume + tempogewenning).
- Elementen: cover-art + afleveringstitel, een korte uitleg ("Luister de aflevering nu vrij uit, zonder vragen"), een speler voor de hele aflevering (play/pauze, tijdbalk, snelheidsknop), en een "Afronden ▸"-knop die vergrendeld is (gedimd) tot minstens 60% is beluisterd of het einde is bereikt.
- Dit scherm mag rustiger/beloninger aanvoelen dan de lesschermen; het is de ontspannen afsluiter.

## 7. Woorden-tab (gewijzigd)

- De herhaalsessie gebruikt nu dezelfde twee kaarttypen als de woordles (herkenning audio-only en productie typen) plus chunk-kaarten (frase-audio → betekenis). De teller "te herhalen" komt uit de scheduler.
- De woordenlijst toont per kaart wanneer die terugkomt ("nu" / "over n dagen").

## 8. Kleine bestaande afwijkingen die in het design mogen landen

- Leerpad-detail heeft rechtsboven een "Jouw reis ▸"-knopje naar het hoofdstukkenoverzicht, en onderaan "Volgende: <hoofdstuk> ▸" / "◂ Terug: <hoofdstuk>"-pills (gebouwd zoals jouw prototype).
- Elke aflevering-eiland-reeks heeft nu deze stappen: Woorden → Luister (2-3 delen) → Lezen → Uitluisteren → Quiz-poort.
- Profiel heeft extra kaarten: Geluidseffecten (aan/uit) en Admin ("Alle lessen ontgrendeld", aan/uit); het leerpad toont dan een klein "ADMIN · alle lessen ontgrendeld"-label.
- In de leesmodus ("Lezen"-stap) verschijnt het transcript pas ná de eerste play, en loopt de actieve zin mee met een gouden rand (bestaat al).

## Prioriteit voor jou

Nieuw design nodig (bestaat nog niet): 2a/2b (woordkaarten), 3a (luisterfocus), 4 (chunk-drill), 6 (uitluisteren), en het grafische element voor de dekkingsregel (1). De rest is bijwerken van bestaande schermen.
