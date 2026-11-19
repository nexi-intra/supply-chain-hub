## Supply Chain Hub 1.5.8

This release brings the 1.5.8 work together without changing published 1.5.7 artifacts or the shared in-app update drive.

- Make shift comments a single employee/day note across the schedule, all assigned tasks and the team-status widget. Keep today in focus while the schedule finishes loading.
- Add a per-user toggle to hide unassigned tasks in the home widget. Roles configured to appear only when assigned keep that behavior.
- Support separate weekly recurrence intervals for each chosen home-office weekday, including cross-team views and Hubert lookups.
- Render original-layout DOCX guides through the locally installed Microsoft Word instead of LibreOffice, preserve the source document, and compact the preview toolbar.
- Improve Arcade retry keys, Chickeninvasion replay rendering, Nexi Flyer controls, and Brick Break sizing, formations and level-transition effects.

Release gate: full native/frontend tests, TypeScript/Vite build, packaged Electron login smoke with isolated local storage, and ZIP checksum verification. Microsoft Word must be installed on computers that convert an original-layout guide without a saved PDF preview. No in-app updater package is published to M: by this PR.
