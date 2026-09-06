# Context Map

## Contexts

- [Workstation shell](./packages/shell/CONTEXT.md) — owns the user-facing workspace, homepage, navigation, and action-prompt experience.
- [Local hub](./local-hub/CONTEXT.md) — owns local aggregation of personal-workbench facts and the rules that make them available to the shell.

## Relationships

- **Local hub → Workstation shell**: provides current, explainable work-state facts and eligible prompt candidates; the shell presents them and routes the user to a real action.
- **Workstation shell → Local hub**: requests refreshed workspace context; it does not invent personal facts when a source is unavailable.
