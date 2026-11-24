# Hjemmearbejdsmønster med ugeinterval (1.5.8)

Mål: Hver valgt hverdag kan gentages hver 1.-52. uge fra en første dato, f.eks. hver anden onsdag og hver tredje torsdag samtidig. Gamle ugentlige mønstre og enkelt-dags-undtagelser skal fortsat virke. Kun lokal 1.5.8-udvikling; ingen release.

## Fase 1 - Datamodel og beregning
- [x] Tilføj valgfrit interval og første forekomst pr. ugedag uden at ændre eksisterende mønstre.
- [x] Genbrug den eksisterende ugeberegning, og test årsskifte, sommertid og undtagelsers forrang.

## Fase 2 - Betjening
- [x] Giv hver valgt ugedag sit eget ugeinterval og sin egen dato for første forekomst.
- [x] Kontrollér interval og ugedag før gemning; vis de relevante valg på dansk, engelsk og finsk.

## Fase 3 - Verifikation
- [x] Kør fokuserede datotests og oversættelseskontrol (26 frontendtests), 134 backendtests samt den endelige lokale 1.5.8-build.
- [x] Forsiden, kalenderen og fælleshubs bruger samme beregning; Huberts separate backendopslag og cross-team-adgang er tilpasset og 134 tests består. Ingen udgivelse.

Start med fase 1: `weekdays` bevares uændret, mens kun dage med længere interval får en ankerdato og et interval i mønstret.