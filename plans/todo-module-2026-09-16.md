# Rename "Projekt" module to "To Do" + add personal to-do's

Date: 2026-09-16

Keep the internal module id, KV key ('projects') and View type 'projects' UNCHANGED
so existing team data is not broken. Only user-facing labels change, and a new
per-user personal to-do list is added inside the module.

## Phase 1 - Rename (labels only) [x]
- [x] src/lib/translations.ts: da + en `hub.modules.projects` -> "To Do";
      `hub.descriptions.projects` -> team + personal to-do wording. (fi is a separate
      object without this label -> falls back; "To Do" is language-neutral.)
- [x] src/components/CommandPalette.tsx: label -> "To Do".
- [x] src/views/ProjectBoard.tsx: header title -> "To Do"; create button/dialog wording.

## Phase 2 - Personal to-do's [x]
- [x] electron/securedIpc.cjs: add `todos-personal-` to PERSONAL_KEY so only the owner
      (key ends with -email/-userId) can write their personal to-do list. Read stays
      per-user (client only ever loads its own key, like hub-dashboard-<email>).
- [x] electron/securedIpc.test.cjs: assert owner can write todos-personal-<own> but not
      another user's.
- [x] src/views/ProjectBoard.tsx: wrap content in Tabs (Team to-do's | Personlige to-do's).
      Personal tab = per-user checklist stored in `todos-personal-${userEmail}` with
      add / toggle-done / delete via the atomic kvArrays helpers.

## Notes
- Personal to-do shape: { id, title, done, createdAt }.
- Team to-do's = the existing projects board (open / in-progress / completed), unchanged
  apart from labels.
- Personal to-do's are per-user; not cryptographically private from managers (same model
  as hub-dashboard-<email>), just separated in the UI and write-protected to the owner.
