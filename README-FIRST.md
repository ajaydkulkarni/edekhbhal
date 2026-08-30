# eDekhbhal Next Preview 01A

Purpose: diagnose the mobile Work Area QR mismatch without changing database records.

Apply from the repository root:

```bash
bash APPLY-next-preview-01a.sh
bash CHECK-next-preview-01a.sh
```

If checks pass, commit and push to `v2-rebuild`. Let Vercel redeploy, then build a fresh Android preview APK because the mobile scanner UI changed.

No SQL change is required. Do not regenerate QR codes for this patch.
