# Tools

Shared family dashboard at [ranch.knipe.io](https://ranch.knipe.io). Next.js, one shared password, hosted on Cloudflare Workers. COI PDFs and Santos hours-sheet photos live in R2.

Anyone with the password can get in. That is intentional.

## First-time setup

```bash
git clone git@github.com:niborg/ranch-tools.git
cd ranch-tools
npm install
cp .env.example .env.local
```

Edit `.env.local`:

- `SITE_PASSWORD` — what people type on `/login`
- `AUTH_SECRET` — cookie signing key only. Generate with `openssl rand -base64 32`
- `ANTHROPIC_API_KEY` — reviews uploaded certificates of insurance

```bash
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Log in, then you should see the tool cards. The session cookie lasts 30 days. COI uploads need the R2 binding from [`wrangler.jsonc`](wrangler.jsonc) (`npm run preview` or a logged-in `npm run dev`).

`.env.local` and `.dev.vars` stay off git. Use the `*.example` files as templates.

## Day to day

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js local server (uses `.env.local`) |
| `npm test` | Vitest — auth, COI, crew hours, review helpers |
| `npm run build` | Production Next.js build (used by deploy) |
| `npm run preview` | Build + run the Worker locally (needs `.dev.vars`) |
| `npm run deploy` | Manual OpenNext upload to Cloudflare (usually unnecessary) |

Pushing `main` to GitHub deploys [ranch.knipe.io](https://ranch.knipe.io). `npm run deploy` is only for a local emergency upload. It is an **npm script**. Do not use `npx run deploy`.

Workers-runtime preview:

```bash
cp .dev.vars.example .dev.vars
# fill in SITE_PASSWORD, AUTH_SECRET, and ANTHROPIC_API_KEY
npm run preview
```

## How auth works

No users table. Two secrets:

1. Login compares the form password to `SITE_PASSWORD` (timing-safe).
2. Failed tries are rate limited per client IP: 5 failures in 15 minutes, plus a Cloudflare burst cap of 10 login posts per minute in production.
3. On success the server sets an httpOnly cookie signed with `AUTH_SECRET`.
4. The dashboard layout checks that cookie. `/login` is public. After login, `?next=` can send someone back to the page they wanted (only in-app paths).

Code: [`lib/auth.ts`](lib/auth.ts), [`lib/login-rate-limit.ts`](lib/login-rate-limit.ts), [`app/actions/auth.ts`](app/actions/auth.ts). Tests live next to those files.

## Deploy to Cloudflare

A push to `main` on GitHub deploys the live app. Cloudflare Workers Builds watches [niborg/ranch-tools](https://github.com/niborg/ranch-tools), builds with OpenNext, and uploads the Worker named `ranch` at **ranch.knipe.io**. Other branches do not go live.

Do not run `npm run deploy` after a `main` push unless that GitHub build failed. The local script is the same OpenNext upload, used for first-time setup or if Builds is down.

Config is [`wrangler.jsonc`](wrangler.jsonc). DNS for `knipe.io` stays on Cloudflare; deploy creates the `ranch` custom domain record. Apex mail on `knipe.io` is not touched (MX/SPF/DKIM stay on the root). Crew-hour mail uses Email Sending on the `ranch` subdomain only.

## Crew hours

Wednesday at 4pm Pacific, the Worker emails `susie.knipe@gmail.com` from `admin@ranch.knipe.io` with a link to [`/attendance`](https://ranch.knipe.io/attendance). After she logs in and submits days plus a required photo of Santos's hours sheet, the same sender emails `suzeadmin@gmail.com` the report with the JPEG attached.

iPhone photos are shrunk on the phone when the browser can do it, then again on the Worker with the Cloudflare Images binding (HEIC included) so the stored copy and the email stay small. Email Sending caps the whole message at 5 MiB. Local preview cannot serialize binary attachments — check that part on a deploy.

Each week's JPEG lives at `sheets/{year}-{week}/sheet.jpg` in the hours R2 bucket (ISO week, same Monday–Sunday as the form). The object name is the catalog: listing `sheets/` is the index, and `/attendance/sheet/2026-36` opens that week. Submitting again overwrites that week.

Cloudflare cron is UTC and does not follow DST, so the Worker fires at **23:00 UTC Wednesday** and **00:00 UTC Thursday** and only sends when it is actually 4pm in `America/Los_Angeles`.

## COI reviews

After someone uploads a certificate and the review finishes, the same sender emails `nk@nknipe.com` with the PDF attached and the Anthropic write-up in the body (or the failure reason if the review did not finish). Add `nk@nknipe.com` as a verified destination so a 10 MB COI stays under the 25 MiB verified-recipient cap.

Email will not send until Email Sending is onboarded for **ranch.knipe.io** (not Email Routing — Routing would move apex MX). In the Cloudflare dashboard: **Compute → Email Service → Email Sending → Onboard Domain → ranch.knipe.io**. That adds bounce/SPF/DKIM records under `cf-bounce.ranch.knipe.io` and DMARC under `_dmarc.ranch.knipe.io`.

Add `susie.knipe@gmail.com`, `suzeadmin@gmail.com`, and `nk@nknipe.com` as destination addresses and click the confirmation links. Sending to those verified addresses stays on the Workers Free plan.

`npm run dev` can show the form, but the report email needs the Worker `EMAIL` binding (`npm run preview` or production).

```bash
npx wrangler login          # once, account that owns knipe.io
npm run deploy
npx wrangler secret put SITE_PASSWORD
npx wrangler secret put AUTH_SECRET
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler r2 bucket create family-tools-coi
npx wrangler r2 bucket create family-tools-hours
```

Secrets are stored on the Worker, not in the repo. Until the login secrets are set, login says the site isn’t configured. Changing a secret is the same `secret put` again; no redeploy required.

Create the `family-tools-coi` and `family-tools-hours` R2 buckets once. The Worker bindings are `COI_BUCKET` and `HOURS_BUCKET` in [`wrangler.jsonc`](wrangler.jsonc). Hours-sheet compression uses the `IMAGES` binding (Images Free plan is enough at family volume).

Later deploys are a push to `main`. Use `npm run deploy` only if you need to publish without GitHub.

If deploy complains that `ranch.knipe.io` already has a DNS record, delete that `ranch` record in Cloudflare DNS (only that name) and deploy again. If you previously used `tools.knipe.io`, delete that `tools` record too so it does not keep pointing at the old hostname.

## Layout

```
app/login/              public password page
app/(app)/              gated dashboard (add tools here)
app/(app)/attendance/   crew hours form, sheet archive, sheet viewer
app/(app)/coi/          COI upload and review
app/actions/            server actions (login, logout, COI, attendance)
lib/auth.ts             cookie + password helpers
lib/login-rate-limit.ts login retry cap per IP
lib/attendance.ts       week labels, form validation, email copy
lib/attendance-sheet.ts hours-sheet photo validation, compression, R2
lib/images.ts           Cloudflare Images binding
lib/coi/                upload validation, R2 records, Anthropic review, email
skills/coi-review/      SKILL.md used as the review prompt
proxy.ts                copies the request path so login can send people back
worker.ts               OpenNext fetch handler + Wednesday cron
wrangler.jsonc          Worker name, domain, cron, email, R2
open-next.config.ts     OpenNext Cloudflare adapter
```

New tools go under `app/(app)/` so they stay behind the password.

Review instructions live in [`skills/coi-review/SKILL.md`](skills/coi-review/SKILL.md). Push to `main` after changing it.

## Cost

Workers, R2, Images transformations (hours-sheet shrinks), and mail to the verified destination addresses stay in the free tier at family volume. Anthropic is billed per review. Idle is $0.
