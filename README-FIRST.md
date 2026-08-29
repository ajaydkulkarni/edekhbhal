# eDekhbhal v0.9.1 — Direct Work Area QR Visibility Hotfix

This is a small Web-only hotfix on top of v0.9.0.

It fixes the remaining Work Areas UX gap by adding QR visibility and printing directly from the standalone **Work Areas** screen.

## Changes

- Work Areas → **View / Reprint QR**
- Work Areas → **Regenerate QR**
- QR modal with actual QR image
- **Print QR** directly from Work Areas
- Work Area Service Status page now visibly renders the active QR image
- no database migration
- no new Android APK

After uploading these extracted files to GitHub and pulling them into Codespaces:

```bash
bash APPLY-v0.9.1.sh
bash CHECK-v0.9.1.sh
```
