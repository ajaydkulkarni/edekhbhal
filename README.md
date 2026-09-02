# PROJECT-CONTEXT update — 2026-09-02

This guarded updater updates the existing canonical `PROJECT-CONTEXT.md` on branch `v2-rebuild`.

Expected source baseline:
- existing context blob SHA before this documentation update: `6ca55b40f9e9e3faffb2a9c81bf9cd4e68de1621`
- validated application commit: `de512d750c741337bba639daad586a81a055fb85`
- E2E V2 run: `33656347076`
- Demo focused: 10/10 PASS
- Full V2: 46/46 PASS

## Apply

Upload `APPLY-project-context-2026-09-02.mjs` to the repository root, then in Codespaces:

```bash
git pull
node APPLY-project-context-2026-09-02.mjs
git diff --check
git diff -- PROJECT-CONTEXT.md
```

If the updater reports an expected source block was not found, stop. Do not manually edit around it; the canonical file has changed and should be re-read before creating a new updater.

After reviewing the diff:

```bash
git add PROJECT-CONTEXT.md APPLY-project-context-2026-09-02.mjs
git commit -m "update project context for combined build 02"
git push origin v2-rebuild
```
