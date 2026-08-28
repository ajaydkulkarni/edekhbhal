#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/src" ] || [ ! -d "$ROOT/mobile" ]; then
  echo "Run this script from the eDekhbhal repository root."
  exit 1
fi

cp -a "$PACKAGE_DIR/v0.8.0-files/." "$ROOT/"
if [ "$PACKAGE_DIR" != "$ROOT" ]; then
  cp "$PACKAGE_DIR/supabase-v0.8.0-mobile-profile-i18n.sql" "$ROOT/supabase-v0.8.0-mobile-profile-i18n.sql"
fi

python3 - <<'PY'
from pathlib import Path
import json

# Prisma schema: additive profile/password/session/translation fields.
p = Path('prisma/schema.prisma')
text = p.read_text()

if 'passwordHash    String?' not in text:
    text = text.replace(
        '  name          String?\n  emailVerified DateTime?',
        '  name          String?\n  passwordHash  String? @db.Text\n  preferredLanguage String? @db.VarChar(10)\n  emailVerified DateTime?',
        1
    )

session_old = '''model Session {
  id        String @id @default(cuid())
  userId    String
  tokenHash String @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)'''
session_new = '''model Session {
  id        String @id @default(cuid())
  userId    String
  tokenHash String @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  authMethod String? @db.VarChar(30)
  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)'''
if 'authMethod String?' not in text:
    text = text.replace(session_old, session_new, 1)

if 'translations ContentTranslation[]' not in text:
    text = text.replace(
        '  scheduleOccurrences ScheduleOccurrence[]\n}',
        '  scheduleOccurrences ScheduleOccurrence[]\n  translations ContentTranslation[]\n}',
        1
    )

if 'model ContentTranslation {' not in text:
    text += '''

model ContentTranslation {
  id             String   @id @default(cuid())
  organizationId String
  sourceType     String   @db.VarChar(40)
  sourceId       String
  fieldName      String   @db.VarChar(40)
  language       String   @db.VarChar(10)
  sourceHash     String   @db.VarChar(64)
  translatedText String   @db.Text
  provider       String?  @db.VarChar(40)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, sourceType, sourceId, fieldName, language], name: "content_translation_key")
  @@index([organizationId, language])
}
'''

p.write_text(text)

# Version metadata.
root_pkg = Path('package.json')
data = json.loads(root_pkg.read_text())
data['version'] = '0.8.0'
root_pkg.write_text(json.dumps(data, indent=2) + '\n')

mobile_pkg = Path('mobile/package.json')
data = json.loads(mobile_pkg.read_text())
data['version'] = '0.8.0'
data.setdefault('dependencies', {})['expo-speech'] = '~57.0.2'
mobile_pkg.write_text(json.dumps(data, indent=2) + '\n')

app_json = Path('mobile/app.json')
data = json.loads(app_json.read_text())
expo = data['expo']
expo['version'] = '0.8.0'
expo.setdefault('android', {})['versionCode'] = max(int(expo.get('android', {}).get('versionCode', 1)), 2)
expo['android']['softwareKeyboardLayoutMode'] = 'resize'
app_json.write_text(json.dumps(data, indent=2) + '\n')

# Canonical project context update.
ctx = Path('PROJECT-CONTEXT.md')
context = ctx.read_text()
context = context.replace('**Last updated:** 2026-08-28', '**Last updated:** 2026-08-28', 1)
context = context.replace(
    '**Current application version:** v0.7.0 (Supervisor Dashboard & Web UX Modernization)',
    '**Current application version:** v0.8.0 (Mobile UX, Localization & Personal Reporting — validation pending)',
    1
)
old_status = '**Current deployment status:** v0.6.1 Reports is deployed; v0.7.0 Supervisor Dashboard / modern Web shell has passed Web and Mobile automated validation; the v0.7.0 user_presence migration has been applied to staging; ready for GitHub commit and Vercel staging deployment'
new_status = '**Current deployment status:** v0.7.0 Supervisor Dashboard / modern Web shell is deployed and field-validated; v0.8.0 Mobile UX / Localization package is being validated before its database migration, staging deployment and replacement Android APK build'
context = context.replace(old_status, new_status, 1)

marker = '## v0.8.0 — Mobile UX, Localization & Personal Reporting'
if marker not in context:
    context += '''

---

## v0.8.0 — Mobile UX, Localization & Personal Reporting

This increment extends the USER mobile application while preserving the v0.6/v0.7 execution engine, camera-only evidence rules, server-authoritative timers, tenant isolation and Supervisor Dashboard heartbeat architecture.

### Authentication / Profile

- Mobile USER can sign in with **Email + Password** after setting a password.
- Existing email/magic-link sign-in remains available as the initial access and password-recovery path.
- There is no separate username login identity; `User.name` is the editable Display Name and email remains the authentication identity.
- Passwords are never stored in plaintext. `User.passwordHash` stores a one-way scrypt hash.
- `Session.authMethod` records PASSWORD or MAGIC_LINK for secure recovery behavior.
- A magic-link-authenticated session may reset an existing password without knowing the old password; normal password sessions require the current password to change it.
- Password changes revoke other mobile sessions while preserving the current session.
- Mobile Profile supports Display Name, preferred language, password management, Organization/Role/Timezone read-only context and a prominent confirmed Sign Out action.

### Preferred Language / Localization

Supported initial languages:

- English
- Hindi
- Marathi
- Gujarati
- Bengali
- Punjabi
- Tamil
- Telugu
- Kannada
- Malayalam
- Spanish
- French
- Arabic

`User.preferredLanguage = null` means English/default.

Mobile application chrome/navigation/execution/profile/report labels use bundled dictionaries and fall back to English if a label is unavailable. Organization, Property and Work Area names remain business identifiers and are not silently translated.

Admin-authored Schedule/Task content remains English as the authoritative source. For a non-English preference, occurrence Schedule names, Task names and Task instructions are translated server-side and cached in `ContentTranslation`. Cached translations are keyed by Organization/source/field/language plus a source hash, so editing source content naturally invalidates the old cached version.

Translation provider order:

1. `GOOGLE_TRANSLATE_API_KEY` if configured; otherwise
2. a compatible `TRANSLATION_API_URL` with optional `TRANSLATION_API_KEY`.

If no translation provider is configured or a provider fails, execution remains available and the authoritative English content is shown. Translation failure must never block field execution.

### Text to Speech

- Mobile uses Expo Speech / device text-to-speech.
- A speaker button reads the current Task name and detailed instructions.
- When translated content is available, speech uses the selected language locale; otherwise the English source is read.
- Long instructions are chunked to stay within native speech input limits.

### Notes keyboard fix

Task Notes and Schedule Notes use a top-positioned, keyboard-aware modal. Android uses resize keyboard layout mode. The note text and Save/Cancel actions must remain visible while typing.

### Personal Reports

The existing Report tab becomes a searchable personal work-history screen.

Filters:

- Today
- Last 7 days
- Last 30 days
- Custom From/To dates
- Search by Task, Schedule, Property or Work Area

The API is always tenant-scoped and user-scoped. Results expose only that USER's own performance. Each result shows status, planned duration, actual duration, deviation, Task details, evidence count and the USER's recorded Task/Schedule notes. Pagination prevents large histories from being downloaded at once.

### Dashboard heartbeat

The v0.7.0 foreground heartbeat source code is retained. The new v0.8.0 APK is the first planned replacement APK containing both heartbeat and these mobile UX improvements. Once installed and foregrounded, Dashboard Users Online should reflect current workers rather than showing `Working · no heartbeat` for the old APK.

### Database additions

- `User.passwordHash`
- `User.preferredLanguage`
- `Session.authMethod`
- `ContentTranslation`

Migration file: `supabase-v0.8.0-mobile-profile-i18n.sql`.

### Validation gate

Before staging deployment / APK build:

1. Web TypeScript check.
2. Web production build.
3. Mobile clean install.
4. Mobile TypeScript check.
5. Expo Doctor 21/21 expected.
6. Apply the additive Supabase v0.8.0 migration only after compile checks pass.
7. Configure a translation provider secret in Vercel without committing any key.
8. Regression-test claim → QR → timers → evidence → notes → completion → Dashboard → Reports.
'''
ctx.write_text(context)
PY

# Ensure the SDK-aligned speech package and lockfile are present.
cd "$ROOT/mobile"
npx expo install expo-speech@~57.0.2
cd "$ROOT"

echo "v0.8.0 mobile UX files applied."
echo "Next: run ./CHECK-v0.8.0.sh. Do NOT run the Supabase migration until the compile checks are green."
