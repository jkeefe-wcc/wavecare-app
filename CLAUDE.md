# CLAUDE.md — Wave Care Concierge (wavecare-app)

Project instructions for Claude Code working in this repo. Read this first in any new session.

## What this is

A custom Next.js app replacing AppSheet as the operations tool for Wave Care Concierge (WCC) — a concierge nursing registry/coordination business in Fairfield County, CT. It reads and writes the `WaveCare_Data_Scaffold_v1` Google Sheet directly via the Sheets API, using a service account (no per-user Google sign-in required for data access).

Business model context (for feature decisions, not enforced in code): two lanes — Lane 1 is registry/matching (WCC charges a finder fee), Lane 2 is concierge coordination (WCC charges a coordination fee). Three hard rules the app must never violate in its workflows: (1) the family pays the nurse directly, WCC never processes nurse payment; (2) WCC never schedules or directs a nurse's work — availability and scheduling tools are informational/coordination aids, not dispatch; (3) each nurse is an independent business entity, not a WCC employee — nothing in the UI or data model should imply employment (no "assign," "clock in," etc.).

## Architecture

- **Framework:** Next.js (App Router) + TypeScript + Tailwind, created with `create-next-app`.
- **Data layer:** `lib/sheets.ts` — a Google Sheets API client authenticated via `google-auth-library` JWT (service account), wrapping the `WaveCare_Data_Scaffold_v1` spreadsheet. No database; the Sheet is the system of record.
- **API routes:** `app/api/<resource>/route.ts` — thin wrappers that call the typed fetchers in `lib/sheets.ts`, add computed/virtual columns server-side, and return JSON. One route per DataScaffold tab.
- **Auth (live on Vercel, admin login verified):** Auth.js v5 (`auth.ts`) with Google sign-in. `lib/roles.ts` resolves a verified email to a role: admin = `ADMIN_EMAILS` env (default `jkeefe@wavecareconcierge.com` and `jbkeefe@gmail.com`); nurse = email in any `*email*` column on Nurses; family = email in any `*email*` column on Patients/Engagements. Unknown emails cannot sign in. Role + `nurseId` are cached in the JWT and re-resolved from the sheet at most every 5 minutes (Sheets API read quota is limited). `lib/guard.ts` has `requireRolePage` / `requireRoleApi`. All data API routes are admin-only; nurse screens use server actions with their own checks. `/` routes by role: admin → `/admin`, nurse → `/nurse/availability`, family → `/family` (placeholder).
- **Next.js 16 notes:** Cache Components is on — no `export const dynamic`; wrap request-time data (auth, searchParams) in `<Suspense>`. Fonts are system fonts (no Google Fonts fetch at build).
- **Deploy target:** Vercel.

## Security constraints (hard rule — do not relax)

Do NOT store credentials (Google Workspace or otherwise) in OneDrive or any other cloud-synced location. Credentials for programmatic access live only at:
- `C:\Users\jbkee\.env\` on the user's machine (service account JSON key), or
- a local project folder that is NOT inside OneDrive sync scope, or
- `.env.local` in this repo (already gitignored by default via `create-next-app`) — never commit it, never copy its contents into a doc that syncs to OneDrive/Drive.

Service account: `wavecare-drive-automation@wavecare-operations.iam.gserviceaccount.com`, GCP project `wavecare-operations`, key file `wavecare-sa.json`. The service account has Editor access on the DataScaffold sheet directly (shared with its email), not domain-wide delegation.

## Document & storage strategy

- **Code, this file, and app config** → this repo only (eventually pushed to GitHub + Vercel). Not Drive, not OneDrive.
- **Credentials** → `C:\Users\jbkee\.env\` only. Never Drive, never OneDrive, never committed.
- **Business documents** (business plan, specs shared with others, exports, onboarding packets) → Google Drive as canonical, with the connected OneDrive `WaveCare` folder as a convenient local mirror/working copy. The App Spec lives as a Claude Doc (see Key assets below).
- **Running project decisions/history** → Claude's project memory for the "Concierge Healthcare" project (not a flat file in this repo) — that's what persists across Claude sessions and surfaces in claude.ai too. This repo does not have its own MEMORY.md; see the project memory instead for session-to-session continuity.

## DataScaffold structure

Google Sheet `WaveCare_Data_Scaffold_v1`, ID `17UXMYibGNbYm_z30CZlSNTrMi-r8Ap3mq7FnmBwjw3s`.

Headers are human-readable with spaces (`Expiry Date`, `First Name`, `Engagement Status`) — code matches them exactly; use `nurseIdOf()` / `nurseNameOf()` in `lib/sheets.ts` rather than hardcoding. The API read range is `A3:AZ`, so keep tabs under 52 columns.

Layout convention (applies to every tab): two merged title rows (1–2), header row = **row 3**, data starts at **row 4**. `lib/sheets.ts` hardcodes `HEADER_ROW = 3` and `DATA_ROW = 4` — do not change without updating the Sheet layout too.

Tabs (7):
1. **Nurses** — credential/profile data; ID column is `NurseID`; has `Avail_Mon` … `Avail_Sun` as the baseline recurring-availability layer, values `Yes` (any shift) / `Day` / `Night` / `No` (legacy `Unknown`/blank = No); credential expiries live in-row (`CT License Expiry`, `NY License Expiry`, `Malpractice Expiry`). Lane is on the Engagements tab, not here.
2. **Patients**
3. **Engagements**
4. **Shifts**
5. **Compliance Docs** — license/cert expirations; columns include `Document Type`, `Related ID`, `Expiry Date` (the sheet's own `Days to Expiry` is a formula; the app recomputes it).
6. **Concierge Services**
7. **Nurse_Availability** — the second/third availability layer: date-ranged overrides on top of the Nurses tab's recurring booleans. Columns: `Avail_ID`, `NurseID`, `Date_From`, `Date_To`, `Shift_Type`, `Type` (`Available` or `Blackout`), `Notes`. `Blackout_Dates` on the Nurses tab is deprecated in favor of this tab.

Three-layer nurse availability model (for anyone extending this): Layer 1 = recurring weekly pattern (Nurses tab booleans). Layer 2/3 = date-specific overrides, both explicit availability windows and blackouts (Nurse_Availability tab). `isBlackedOut()` and `availabilitySummary()` in `lib/sheets.ts` implement the merge logic.

## Writes (nurse availability — built)

`/nurse/availability` (N2): weekly pattern writes `Avail_Mon..Sun` (Yes/No) on the Nurses row; date overrides append/clear rows on Nurse_Availability. Server actions in `app/nurse/availability/actions.ts`: the nurse's `NurseID` always comes from the session (never the form); removals verify the row's `NurseID` matches; admins may edit any nurse via `?nurse=<NurseID>`. Writes use header-aware helpers in `lib/sheets.ts` (`updateByHeaders`, `appendByHeaders`, `clearRow`), which refuse to touch rows above the data start. Removal clears the row (leaves a blank row; reads skip blanks). Validation + notes sanitising (formula-injection guard) live in `lib/availability.ts`. Sheet dropdown values: Shift_Type = Day/Night/24hr, Type = Available/Blackout, Avail_* = Yes/No/Unknown/Day/Night (validation on the sheet must include Day and Night).

### Matching rules (`lib/availability.ts`)
A shift is made of halves: Day, Night; 24hr = both (blank shift on an override = both). Per date and half: a Blackout covering it wins; else an Available override opens it; else the weekly pattern decides (Yes = both halves, Day/Night = that half, No/Unknown/blank = none). A range check requires every requested half on every date. `/admin/match` ("Find open nurses") uses `checkRange()` to list nurses open for the whole period vs partly open, flagging expired credentials. Framing: it builds a shortlist for an admin to present; the family chooses (never "assign").

## Role model

- **Admin** — full access; `ADMIN_EMAILS` (default `jkeefe@wavecareconcierge.com`, `jbkeefe@gmail.com`; admin takes priority over nurse if an email is in both). Screens A1–A7.
- **Nurse** — sees/manages own availability (built), compliance docs, assigned engagements. Screens N1–N4. N2 ("My Availability") is the two-part screen: recurring weekly pattern + date-range overrides against Nurse_Availability.
- **Family** — sees own engagement/shift info only. Screens F1–F3.

Full screen-by-screen spec lives in the App Spec Claude Doc (see Key assets).

## Build / run

```bash
npm install
npm run dev     # local dev server
npm run build   # production build
```

Env vars required (`.env.local`, never committed):
```
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=       # full PEM, \n-escaped
SHEET_ID=17UXMYibGNbYm_z30CZlSNTrMi-r8Ap3mq7FnmBwjw3s
AUTH_SECRET=              # openssl rand -base64 32
AUTH_GOOGLE_ID=           # OAuth client ID (GCP console > Credentials)
AUTH_GOOGLE_SECRET=
ADMIN_EMAILS=jkeefe@wavecareconcierge.com,jbkeefe@gmail.com   # comma-separated, optional
```
On Vercel set the same vars; the OAuth client's redirect URI must be `<site>/api/auth/callback/google`.

## Deployment & hosting

- **Live app:** https://wavecare-app.vercel.app (Vercel project `wavecare-app`, team "Wave Care Concierge", **Hobby plan**). Vercel's Hobby terms are non-commercial — move to **Pro** before real nurses/families use it.
- **Repo:** https://github.com/jkeefe-wcc/wavecare-app (private, GitHub account `jkeefe-wcc`, signed up with jkeefe@wavecareconcierge.com). `main` auto-deploys to Vercel on push. Vercel and the Claude GitHub app are each installed on this one repo only.
- **Env vars** are set in Vercel (Project → Settings → Environment Variables) as listed under Build / run, plus `AUTH_TRUST_HOST=true`. Never paste secret values into chat; the user enters them directly.
- **Google OAuth:** client `wavecare-app` (Web application) in GCP project `wavecare-operations` (Google Auth Platform → Clients), consent screen External/Testing with test users = the two admin emails. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://wavecare-app.vercel.app/api/auth/callback/google`. **Before nurses/families sign in, publish the consent screen** (Testing mode only allows listed test users) and add any new domain's redirect URI. Client ID/secret are in `C:\Users\jbkee\.env\wavecare-oauth.txt` (local only).
- **Google Sheets API** must be enabled on the GCP project (it was initially off — caused the first dashboard error).

## Decisions & rationale

- **Sheet as database (pilot):** the DataScaffold Google Sheet is the sole system of record; Vercel stores no data (only the login cookie and operational logs). Chosen for transparency and ease of hand-fixing. All access goes through `lib/sheets.ts`, so a later move to Postgres means swapping that layer plus a one-time import and a small header-mapping step. Sheet limits to remember: ~60 reads/min quota (hence the 5-minute role cache), no transactions (simultaneous edits can overwrite), no enforced uniqueness/links, slows past a few thousand rows. Revisit at real volume or when compliance requires it (row/column-level access, audit logs, a BAA).
- **Custom Next.js app instead of AppSheet:** no per-seat cost, full control.
- **Nurse edits go directly to the sheet** (no approval step). Admins can correct entries via `/nurse/availability?nurse=<NurseID>`.
- **Headers stay human-readable** in the sheet; code matches them rather than renaming the sheet.

## Open compliance question (needs the healthcare attorney)

The Patients tab holds name, DOB, address, surgery type/date, surgeon, hospital and discharge dates. Treat it as sensitive health-related information regardless of whether HIPAA formally applies to WCC (self-pay registry; undetermined). Rules of thumb until counsel advises: keep clinical notes, diagnoses and medical detail out of the sheet and the app (including free-text Notes); keep sheet access limited to the owner and the service account; Vercel Hobby/Pro have no BAA. Also relevant: CT data-privacy and breach-notification law.

## Status & roadmap

Built: Google login with role resolution; admin dashboard (counts, credential/compliance expiry, nurses, engagements); nurse My Availability (N2) with weekly Yes/Day/Night/No pattern + date overrides; admin "Find open nurses" (`/admin/match`); read-only admin API routes for all 7 tabs.
Not built: remaining nurse screens (own credentials, engagements — N1/N3/N4); family screens F1–F3 (`/family` is a placeholder); remaining admin screens (A1–A7 spec); credential-expiry email automations (Auto-1…5); engagement/shift/concierge-service editing; write validation beyond availability.
Housekeeping: delete sample data before real use — **"Katherine Donovan" (N-001), engagement E-001 and their documents are fictional scaffold entries**, and her placeholder email could grant sign-in to whoever owns it. Sheet dropdowns to fix: Shift_Type should be Day/Night/24hr (currently the list sits on the Type column), Type should be Available/Blackout, and `Avail_*` validation needs Day and Night added.

## Gotchas / working notes

- The Claude session sandbox cannot reach Google (oauth2.googleapis.com is blocked), so the app can't be exercised against the real sheet from there; test logic with in-memory fakes and verify on Vercel/locally. Production build also works offline because fonts are system fonts.
- Google Drive MCP can read the sheet (download as xlsx for headers) but cannot write cells.
- Server actions that call `redirect()` must not wrap it in a try/catch that swallows it (see `actions.ts`).
- Notes written with USER_ENTERED are sanitised against spreadsheet formula injection (`sanitizeNotes`).

## Key assets

- App Spec (Claude Doc): https://claude.ai/artifact/CQ3CD8DCotfVW1dMKMeK7p
- DataScaffold Sheet ID: `17UXMYibGNbYm_z30CZlSNTrMi-r8Ap3mq7FnmBwjw3s`
- GCP project: `wavecare-operations`
- Running decisions/history: Claude project memory, "Concierge Healthcare" project

## Conventions for future work in this repo

- Add new API routes per-tab, following the existing pattern in `app/api/*/route.ts`: call the typed fetcher from `lib/sheets.ts`, apply any virtual columns, return JSON, wrap in try/catch returning a 500 with `{ error }`.
- Virtual/computed columns belong in `lib/sheets.ts`, not scattered in route handlers.
- Never hardcode the service account key or any credential value into source files — always read from `process.env`.
- When the data model changes, update both the DataScaffold sheet and the App Spec Claude Doc, not just this repo.
