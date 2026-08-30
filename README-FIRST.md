# eDekhbhal Next Preview 01B

Purpose: remove the temporary QR diagnostics after the mobile QR issue was resolved, while preserving the corrected V2 API fallback.

## Apply from repository root

```bash
bash APPLY-next-preview-01b.sh
bash CHECK-next-preview-01b.sh
```

If checks pass, restore `tsconfig.tsbuildinfo` if TypeScript modified it, then commit and push the intended files to `v2-rebuild`.

No SQL/database change is required.
