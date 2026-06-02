# Deployment Checklist

Steps to verify before publishing a new release to any hosting environment.

---

## Build

- [ ] `npm run build` passes with no errors
- [ ] Confirm `ADMIN_PIN` / `AdminPinEntry` are absent from the production bundle:
  ```bash
  grep -c "ADMIN_PIN" dist/assets/index-*.js   # must return 0
  ```
- [ ] Confirm `.env` is **not** committed and `VITE_ANTHROPIC_API_KEY` is set in the hosting environment's secrets / env vars (not hardcoded)

---

## Security headers (production)

The Vite dev server and `npm run preview` apply a Content Security Policy automatically via `vite.config.js`. For production deployments these headers must be set at the CDN or server layer — they are **not** injected into the built HTML by Vite.

Copy the exact policy from the `CSP` constant in `vite.config.js` and configure it in your hosting platform:

| Platform | How to set |
|---|---|
| **Netlify** | Add to `public/_headers` or `netlify.toml` `[[headers]]` block |
| **Vercel** | Add to `vercel.json` under `"headers"` |
| **Nginx** | `add_header Content-Security-Policy "…";` in the server block |
| **Apache** | `Header always set Content-Security-Policy "…"` in `.htaccess` |

Required headers (values in `vite.config.js`):

```
Content-Security-Policy: <copy from vite.config.js CSP constant>
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

- [ ] Verify headers are live after deploy:
  ```bash
  curl -sI https://your-domain.example.com | grep -i "content-security\|x-frame\|x-content-type\|referrer"
  ```

---

## Runtime audit — `mespeak` TTS library

`NamingModule` uses `mespeak` for phoneme audio hints. The library loads its voice data from bundled JSON files (no network call expected), but this should be confirmed on each significant dependency update.

- [ ] Open the deployed app in Chrome DevTools → **Network** tab
- [ ] Filter by domain — confirm **no requests** go to any domain other than `api.anthropic.com` and the app's own origin
- [ ] If any unexpected outbound request appears from `mespeak`, open a privacy issue before releasing

---

## Smoke test

- [ ] First-launch privacy notice appears and can be accepted
- [ ] Caregiver PIN entry works; default PIN (0000) triggers the forced PIN-change flow
- [ ] Dr. Aria responds to a chat message (confirms API key and CSP `connect-src` are both working)
- [ ] Personal photo upload works; bulk import works
- [ ] Progress → Generate Report completes without error
- [ ] Backup download produces a `.ppabak` file; restore from that file reloads cleanly
