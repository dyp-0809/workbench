# Context Map

## Contexts

- [Workstation shell](./packages/shell/CONTEXT.md) — owns the user-facing workspace, homepage, navigation, and action-prompt experience.
- [Local hub](./local-hub/CONTEXT.md) — owns local aggregation of personal-workbench facts and the rules that make them available to the shell.
- [Programming records](./packages/module-records/CONTEXT.md) — owns saved programming references, source snapshots, classifications, and GitHub Star import confirmation.

## Relationships

- **Local hub → Workstation shell**: provides current, explainable work-state facts and eligible prompt candidates; the shell presents them and routes the user to a real action.
- **Workstation shell → Programming records**: presents the “编程 → 记录” page and keeps URL capture/import confirmation in view state until save.
- **Programming records → Local hub**: sends validated fetch, CRUD, category, and import requests; Local hub persists only explicitly confirmed records.
- **Workstation shell → Local hub**: requests refreshed workspace context; it does not invent personal facts when a source is unavailable.
