# Release 1.5.2 + opstart af 1.5.3

Repo: nexi-intra/supply-chain-hub. Workflow: develop/x -> release/x -> PR mod main -> GitHub release.

## Fase 1 - GitHub PR + release for 1.5.2
- [ ] Opret scripts/github-ops.cjs (supply-chain-hub variant)
- [ ] Opret branch release/1.5.2 og commit alle 1.5.2-aendringer
- [ ] Push release/1.5.2 til origin
- [ ] Opret PR release/1.5.2 -> main med release-noter
- [ ] Opret GitHub release v1.5.2 (kun noter, ingen zip-asset)

## Fase 2 - Gor klar til 1.5.3
- [ ] Opret branch develop/1.5.3 og bump package.json til 1.5.3
- [ ] Push develop/1.5.3 til origin
- [ ] Kopier mappen til "Supply-Chain-Hub 1.5.3" (uden node_modules, release, dist)
- [ ] Bekraeft ny mappe er paa develop/1.5.3 og version 1.5.3

## Noter
- Release-asset udelades bevidst; klienterne opdaterer via appens egen updater fra M:.
- 1.5.2-modellen ligger allerede paa M: (ai-model), og manifestet peger korrekt paa 1.5.2.
- Ny 1.5.3-mappe skal koere `npm install` foer dev, da node_modules ikke kopieres.
