# eDekhbhal v0.3.0

This release adds the management features requested after the QR-cycle validation.

## Added
- My Profile: logged-in user can maintain their display name.
- Team / User Management: Admin can add users by email, assign ADMIN / PROPERTY_MANAGER / USER roles, change roles, and inactivate/reactivate memberships.
- Organization Settings: Organization name is permanently read-only after creation. Admin can edit address/time zone and upload a logo.
- Organization logo is displayed in the top-right navigation area.
- Property creation prefills/inherits the current Organization address, while saving a separate Property copy.
- Property view/edit/inactivate/reactivate.
- Work Area view/edit/inactivate/reactivate.
- Standalone Work Areas page with mandatory active Parent Property selector.
- Parent Property is always visible in Work Area management screens.
- New and changed management actions continue to be audit logged with old/new values.

## Required database upgrade
Before testing v0.3.0 functionality, run `supabase-v0.3.0.sql` in the Supabase SQL Editor.

## Logo storage note
For this staging build, uploaded logos up to 1 MB are stored as a data URL in `Organization.logoUrl`. This gives you a working upload immediately without additional Supabase Storage setup. Before production, move organization logos to Supabase Storage or another object store.
