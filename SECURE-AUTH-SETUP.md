# Secure Admin Authentication V1 — Corrected

This package replaces the previous authentication code. It uses **bcryptjs**, matching the `$2b$...` password hash generated locally on the admin phone.

## Files
- `api/admin/login.js`
- `api/admin/me.js`
- `api/admin/logout.js`
- `admin-auth.js`
- `package.json`

## Vercel environment variables
Keep these existing variables:
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`

Do not send these values through chat.

## Admin page
The sign-in button should call `adminLogin()` and the logout button should call `secureLogout()`. Load `admin-auth.js` on the admin page.

## Important
The earlier temporary `ALLOW_HASH_GENERATOR` variable should now be set to `false` or removed. If the old `api/admin/generate-hash.js` exists, remove it from the repository before production use.

## Deployment
Copy the files from this package into the matching locations in the existing website repository. Do not replace the homepage, gallery, training, news, or other V2 files.
Then commit/push and redeploy on Vercel.
