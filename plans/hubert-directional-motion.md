# Hubert: retningsbestemt gang og glidende overgange

Mål: Hubert skal bevæge sig realistisk. Animationen skal passe til den retning han går i (væk fra kameraet = bagfra, mod kameraet = forfra, skråt = 3/4), og skift mellem aktiviteter skal ske med rigtige overgangsanimationer i stedet for hårde klip.

## Fase 1: Retninger i Blender
- [x] Definér 8 retninger (Ø, NØ, N, NV, V, SV, S, SØ) i forhold til kameraet. V/NV/SV er spejlinger af Ø/NØ/SØ, så der renderes 5 unikke: side, 3/4 væk, bagfra, 3/4 mod, forfra
- [x] Render walk, run og carry i alle 5 retninger (sømløse loops, samme gangcyklus og fod-hastighed som side-strimlen)
- [x] Mål fod-hastigheden pr. retning (`--mode gait`), så han ikke glider på gulvet når han går op/ned i billedet (perspektiv/dybde)
- [x] Tjek look-renders fra hver retning før de endelige strimler

## Fase 2: Overgangsanimationer
- [x] stand (rolig stående idle) som neutral mellemstilling
- [x] sit-down / stand-up (stå -> sid, sid -> stå)
- [x] lie-down / get-up (stå -> lig, lig -> stå), inkl. at dreje rundt i kurven før han lægger sig
- [x] start / stop (fra stå til gang og tilbage, vægtskift i stedet for spring)
- [x] sniff-ned / sniff-op og beg-op / beg-ned hvor det giver mening
- [x] Første og sidste billede skal matche de loops de forbinder

## Fase 3: Afspilning i appen
- [x] Hubert.tsx vælger strimmel ud fra segmentets retning på skærmen (med hysterese, så han ikke flimrer mellem to retninger)
- [x] Ved retningsskift undervejs: blød overgang (kort drejning/crossfade), ikke et klip
- [x] Aktivitetsskift spilles som kæde: nuværende loop -> udgangsovergang -> gang -> indgangsovergang -> nyt loop
- [x] hubertRoutine.ts regner overgangenes varighed med i tidsplanen
- [x] Hukommelse: forudindlæs kun det der er brug for, og hold dekodet billedhukommelse nede (lille skala på strimlerne)

## Fase 4: Verifikation
- [x] tsc, vitest (hubertRoutine m.fl.), E2E `scripts/verify-multiplayer.cjs`
- [x] Skærmbilleder af hver retning og hver overgang i rummet (lys og mørk)
- [ ] Afprøv i sandbox-vinduerne (`node scripts/multiplayer-sandbox.cjs`)
