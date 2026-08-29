# eDekhbhal v0.8.1 — Mobile Navigation Visibility Hotfix

This hotfix addresses the Android field-test issue where the bottom navigation tabs were rendered too close to / underneath the Android system navigation area, making Report and Profile appear missing.

## Scope

- Safe-area-aware bottom tab height and padding.
- Explicit active/inactive tab colors.
- Custom tab icons now receive the navigator tint color.
- Stronger label contrast and weight.
- Preserves My Work / Scan / Report / Profile.
- Version becomes 0.8.1; Android versionCode becomes 3.
- No database migration.

## Apply sequence

1. Extract this ZIP locally.
2. Upload the **contents** of this extracted folder to the GitHub repository root, preserving the `v0.8.1-files/` path.
3. In Codespaces, from `/workspaces/edekhbhal`, run:

```bash
git pull
bash APPLY-v0.8.1.sh
git status --short
```

4. Then run:

```bash
bash CHECK-v0.8.1.sh
```

5. After checks pass, commit/push and build a new Android preview APK. The expected Android versionCode is 3.
