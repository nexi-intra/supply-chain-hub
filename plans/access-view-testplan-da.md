# Testplan: skrivebeskyttede samlevisninger (1.5.1)

## Forudsætninger

- Der findes mindst to registrerede teams.
- Testpersonen har en godkendt konto i sit normale team.
- Creator kan logge ind i Creator Panel.

## Opret og tildel en samlevisning

1. Log ind som Creator og åbn **Creator Panel → Teams**.
2. Find **Skrivebeskyttede samlevisninger** og vælg **Opret samlevisning**.
3. Giv visningen et navn, vælg mindst to teams og vælg testpersonen.
4. Gem visningen.
5. Kontrollér, at kortet viser visningens navn, teams, personen og mærket **Kun læsning**.

## Test som den tildelte person

1. Log ud og log ind som testpersonen.
2. Kontrollér, at siden **Vælg din visning** viser både personens normale team og den nye samlevisning.
3. Åbn samlevisningen.
4. Kontrollér overblikkets antal personer, ferie, sygdom og Home Office.
5. Skift filteret fra **Alle teams** til hvert enkelt team og kontrollér, at resultaterne ændrer sig.
6. Åbn fanerne **Ferie**, **Vagtplan** og **Personer**.
7. Kontrollér, at hver post har korrekt teamkode, og at der ikke findes knapper til oprettelse, redigering, sletning eller godkendelse.
8. Vælg **Skift visning** og gå tilbage til personens normale team.
9. Kontrollér, at normale rettigheder stadig virker dér.

## Test ændring og tilbagekaldelse

1. Log ind som Creator og rediger samlevisningen.
2. Fjern ét team, tilføj et andet, eller fjern testpersonen, og gem.
3. Log ind igen som testpersonen og kontrollér, at valgmulighederne afspejler ændringen.
4. Slet samlevisningen i Creator Panel.
5. Kontrollér, at ingen teamdata eller brugerkonti er blevet slettet.

## Forventet datalagring

Samlevisninger gemmes i platformrodens `_registry/access-views.json`. Filen indeholder kun visningsnavn, team-id'er og tildelte e-mailadresser. Testpersonen oprettes ikke i de valgte teams' `users`-data.
