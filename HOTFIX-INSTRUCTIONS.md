# eDekhbhal v0.6.0 — Evidence Storage Type Hotfix

This fixes the Vercel TypeScript error:

`'actualSize' is possibly 'undefined'`

## Why it happened

Supabase Storage's object metadata type allows `size` to be absent/undefined.
The application was already checking the uploaded object, but TypeScript correctly
refused to compare an optional `size` value against the configured byte limit.

## Fix

The storage helper now validates `data.size` and returns a strict:

`Promise<{ size: number; contentType: string | null }>`

The evidence confirmation route also performs a defensive runtime size check.

## Upload to GitHub

Replace these two files, preserving their exact paths:

- `src/lib/supabaseStorage.ts`
- `src/app/api/mobile/occurrence-tasks/[id]/evidence/confirm/route.ts`

No Supabase SQL needs to be rerun.
No Vercel environment variable needs to be changed.

The previous Prisma/tsconfig hotfix should remain in place.
