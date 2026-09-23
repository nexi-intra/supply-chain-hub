# Lokal preview af 1.5.7 med M:-data

Kun lokal visning. Ingen publicering eller overskrivning af eksisterende release.

## Fase 1 - forudsætninger

- [x] Kontroller at designrettelserne er på `develop/1.5.7`.
- [x] Kontroller at den pakkede konfiguration peger på det tilgængelige M:-lager.

## Fase 2 - frisk build

- [x] Byg renderer og pak Windows-appen i en ny mappe uden for repoet.
- [x] Kontroller at ZIP, programfil og datakonfiguration følger med.

## Fase 3 - live preview

- [x] Start den pakkede app og verificer datamappen i opstartsloggen.
- [x] Giv stien til den lokale preview og beskriv eventuelle login-krav.

Build: `C:\Users\jacso\AppData\Local\Temp\sch-157-m-preview-20260923-114234`.
Appens opstartslog bekraefter M:-lageret; gennemgang bag login kraever brugerens egen konto.