# FairShift — Build Spec (internal contract for contributors)

Decent-work platform for employee-intensive organisations (UN SDG 8). Two industries ship in the box:
**construction** (daily-wage site workers) and **college** (campus support staff). One worker app, one admin app.

Hard constraints: single Docker container on Google Cloud Run · repo < 10 MB · one git branch (`main`) ·
no secrets in the repo · must work with **no Google credentials at all** (memory store + heuristic AI fallback)
so tests, local dev and judges' demo never break.

## Layout (single npm package)

```
src/shared/      types.ts (domain types), api.ts (request/response shapes), industries.ts (industry configs)
src/server/      index.ts (boot), app.ts (Hono app factory), config.ts (env)
  domain/        pure functions, no I/O: payroll.ts, attendance.ts, fatigue.ts, quitRisk.ts, qrToken.ts,
                 passport.ts, anonymity.ts, triage.ts (heuristic fallback)
  store/         repo.ts (Repo interface), memory.ts, firestore.ts, seed.ts
  services/      ai.ts (Gemini via Vertex AI, falls back to domain/triage.ts)
  routes/        auth.ts, attendance.ts, pay.ts, reports.ts, feedback.ts, passport.ts, admin.ts
  middleware/    auth.ts (session cookie → c.var.user, requireRole), security.ts (headers, rate limit)
src/web/         Preact SPA (Vite). main.tsx, app.tsx, router.ts, api.ts, i18n/{en,hi,ta}.json, i18n.ts,
                 speech.ts, components/, pages/worker/, pages/admin/, pages/public/
tests/           mirrors src/ (vitest). tests/web uses jsdom.
```

Server serves the built SPA from `dist/web` and the API under `/api`. Port from `PORT` (default 8080).

## Environment (all optional)

| var | default | purpose |
|---|---|---|
| `SESSION_SECRET` | random per boot (dev) | HMAC for session JWT + QR tokens + feedback dedupe |
| `STORE` | `memory` | `memory` or `firestore` |
| `GOOGLE_CLOUD_PROJECT` | – | enables Vertex AI when set |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | Vertex region |
| `GEMINI_MODEL` | `gemini-2.5-flash` | model id |
| `PASSPORT_PRIVATE_KEY` | generated per boot | Ed25519 PKCS8 PEM for signing skill passports |

On Cloud Run, Vertex/Firestore authenticate via the service account (ADC) — **no API keys**.

## Domain rules (exact — tests assert these)

Money is integer **paise** internally (₹1 = 100). Times are ISO strings; all day bucketing uses `Asia/Kolkata` (UTC+5:30, no DST — implement as fixed +330 min offset).

### Industry config (`src/shared/industries.ts`)
```
construction: payModel 'daily', dailyWage 75000 (₹750), regularHoursPerDay 8, overtimeMultiplier 2,
              nightAllowancePerHour 2500, halfDayThresholdHours 4,
              hazardCategories: fall_height, scaffolding, electrical, heavy_machinery, ppe_missing, heat_stress, harassment, wage_issue, other
              checkInModes: ['qr','geo']
college:      payModel 'monthly', monthlySalary 1800000 (₹18,000), workingDaysPerMonth 26, regularHoursPerDay 8,
              overtimeMultiplier 2, nightAllowancePerHour 2000, halfDayThresholdHours 4,
              hazardCategories: electrical, chemical_lab, slippery_floor, fire_safety, workload, harassment, wage_issue, other
              checkInModes: ['qr','geo']
```
Adding hospital/factory = adding one config object; nothing else changes.

### Attendance (`attendance.ts`)
- `summariseShift(shift, cfg)` → `{ hours, regularHours, overtimeHours, nightHours }` (hours rounded to 2 dp).
  - hours = checkOut − checkIn. Open shift (no checkOut) → hours 0.
  - regularHours = min(hours, regularHoursPerDay); overtimeHours = max(0, hours − regularHoursPerDay).
  - nightHours = overlap with 22:00–06:00 IST.
- `summarisePeriod(shifts, cfg)` → totals + `daysWorked` (distinct IST days with hours ≥ halfDayThreshold count 1, hours > 0 and < threshold count 0.5).

### Payroll (`payroll.ts`) — `computePayslip(worker, shifts, period, cfg)` → `Payslip`
- hourlyRate: daily → dailyWage / regularHoursPerDay; monthly → monthlySalary / workingDaysPerMonth / regularHoursPerDay.
- **base**: daily → dailyWage × daysWorked. monthly → monthlySalary − (absentDays × monthlySalary / workingDaysPerMonth), where absentDays = max(0, workingDaysInPeriod − daysWorked) and workingDaysInPeriod = period.workingDays (given).
- **overtime** = overtimeHours × hourlyRate × overtimeMultiplier.
- **night** = nightHours × nightAllowancePerHour.
- gross = base + overtime + night.
- **pf** = 12% of base (EPF), capped at 180000 (12% of ₹15,000).
- **esi** = 0.75% of gross if gross ≤ 2100000 (₹21,000) else 0.
- **advance** = worker.advanceThisPeriod (paise, default 0).
- net = gross − pf − esi − advance. Round each line to nearest paise (Math.round).
- Each line = `{ key, amount, params }` where key is an i18n key (`pay.base`, `pay.overtime`, `pay.night`, `pay.pf`, `pay.esi`, `pay.advance`) and params carry the numbers used (e.g. `{ days: 22, rate: 75000 }`) so the UI can render "22 days × ₹750" in any language.

### Fatigue (`fatigue.ts`) — `detectFatigue(shifts, now)` → `FatigueFlag[]`
Rules on completed shifts (look-back 14 days):
- `long_shift`: any shift > 12 h → severity `high`.
- `short_rest`: gap between consecutive shifts < 10 h → `medium`.
- `no_rest_day`: ≥ 7 consecutive IST days with a shift → `high`.
- `weekly_overload`: > 60 h in any rolling 7-day window ending on a shift day → `medium`.
Flag = `{ rule, severity, detail: Record<string, number|string>, at }`. De-duplicate per rule (keep most recent).

### Quit risk (`quitRisk.ts`) — `scoreQuitRisk(input)` → `{ score 0–100, level, factors[] }`
Input: last-14-day shifts, fatigue flags, scheduledDays (14d), tenureDays. **Never** uses anonymous reports or feedback (anonymity guarantee).
- overtime hours (14d) > 20 → +25 (`factor: 'high_overtime'`)
- fatigue: +10 per flag, cap 30 (`'fatigue'`)
- absences = scheduledDays − daysWorked: +8 each, cap 24 (`'absences'`)
- tenureDays < 90 → +15 (`'new_joiner'`)
- attendance trend: daysWorked in last 7 < daysWorked in previous 7 by ≥ 2 → +10 (`'declining_attendance'`)
- cap 100. level: < 30 `low`, < 60 `medium`, else `high`. factors include points.

### Rotating QR (`qrToken.ts`)
- `qrToken(siteId, secret, now)` = `${siteId}.${window}.${hmac16}` where window = floor(epochSec / 60), hmac16 = first 16 hex of HMAC-SHA256(secret, `${siteId}.${window}`).
- `verifyQrToken(token, secret, now)` → siteId | null. Accept current or previous window only. Constant-time compare.

### Geofence
- `withinGeofence(site, lat, lng)` haversine metres ≤ site.radiusM.

### Anonymity (`anonymity.ts`)
- `caseCode()` → 8 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (crypto random), formatted `XXXX-XXXX`.
- `dayBucket(date)` → `YYYY-MM-DD` IST. Reports store **only** day, never time, never worker id, never IP.
- `redactPII(text)` → masks phone numbers (10-digit Indian, optional +91), emails, Aadhaar-like 12 digits (4-4-4), replacing with `[redacted]`.
- `aggregateFeedback(responses, minGroup = 5)` → `null` if responses.length < minGroup, else averages per question (1 dp) + count. Comments only included when ≥ minGroup, shuffled.
- `feedbackDedupeKey(userId, siteId, month, secret)` → HMAC hex; stored in a separate set, never alongside the response.

### Triage fallback (`triage.ts`) — `heuristicTriage(text, cfg)` → `{ category, severity }`
Keyword lists (English + a few Hindi/Tamil romanised and native words) per category; severity `critical` if words like fell/fall/blood/injur/fire/shock/collapse/गिर/आग/தீ/விழு appear, `high` for electrical/harassment, `medium` default, `low` for suggestions.

### Passport (`passport.ts`)
- Entry `{ id, workerId, kind: 'training'|'certification'|'experience', title, issuer, issuedOn (YYYY-MM-DD), hours?, industry }`.
- `signPassport(payload, privateKey)` → token `base64url(JSON payload).base64url(ed25519 sig)`.
- `verifyPassport(token, publicKey)` → payload | null. Public key served at `/api/passport/public-key` (PEM) so any employer can verify offline.

### Report SLA
critical 24 h, high 72 h, medium 7 d, low 14 d — measured in days since `createdDay`; `overdue` boolean in admin views.

## API contract (JSON; shapes in `src/shared/api.ts`)

Auth: httpOnly, Secure (in prod), SameSite=Lax cookie `fs_session` = HS256 JWT `{ sub, role, siteId, exp }` (12 h).
Errors: `{ error: string }` with proper status. All bodies validated with zod. Rate limit: 60 req/min/IP on `/api/*`, 10/min on report + feedback POST.

| method | path | role | body → response |
|---|---|---|---|
| GET | `/api/health` | – | `{ ok: true }` |
| GET | `/api/auth/personas` | – | `Persona[]` (demo logins) |
| POST | `/api/auth/demo` | – | `{ personaId }` → `Me` + sets cookie |
| POST | `/api/auth/logout` | any | `{ ok }` |
| GET | `/api/me` | any | `Me` |
| POST | `/api/attendance/check-in` | worker | `{ qrToken } \| { lat, lng }` → `Shift` |
| POST | `/api/attendance/check-out` | worker | `{}` → `Shift` (with summary) |
| GET | `/api/attendance/me` | worker | `{ open: Shift\|null, recent: ShiftWithSummary[], fatigue: FatigueFlag[] }` |
| GET | `/api/pay/me?period=YYYY-MM` | worker | `Payslip` |
| POST | `/api/reports` | – (optional session only for siteId; **worker id never stored**) | `{ siteId, text?, audioBase64?, audioMime?, language, category? }` → `{ caseCode, category, severity }` |
| GET | `/api/reports/track/:caseCode` | – | `ReportPublic` |
| POST | `/api/feedback` | worker | `{ ratings: {safety,fairness,respect,workload} 1–5, comment? }` → `{ ok }` (409 if already this month) |
| GET | `/api/passport/me` | worker | `{ entries, shareToken }` |
| GET | `/api/passport/verify?token=` | – | `{ valid, payload? }` |
| GET | `/api/passport/public-key` | – | text/plain PEM |
| GET | `/api/admin/overview` | admin | `AdminOverview` (KPIs, 14-day attendance series, fatigue list, quit-risk list, report counts) |
| GET | `/api/admin/reports` | admin | `ReportAdmin[]` for admin's site |
| PATCH | `/api/admin/reports/:id` | admin | `{ status, note? }` → `ReportAdmin` |
| GET | `/api/admin/feedback` | admin | `FeedbackAggregate \| { insufficient: true, count }` |
| GET | `/api/admin/qr` | admin | `{ token, expiresInSec }` (kiosk display, refresh every 30 s) |
| POST | `/api/admin/passport` | admin | `{ workerId, kind, title, hours? }` → `PassportEntry` |
| GET | `/api/admin/workers` | admin | `WorkerSummary[]` |

## Seed data (`store/seed.ts`)
Org "FairShift Demo". Sites:
- `site-skyline` construction "Skyline Towers, Chennai" (13.0827, 80.2707, radius 300 m).
- `site-greenfield` college "Greenfield College Campus" (12.8231, 80.0442, radius 500 m).
Workers (≥ 5 per site, mixed languages en/hi/ta) with 21 days of shifts generated deterministically relative to "now"; include one worker with a 13 h shift + 8 consecutive days (fatigue + high quit risk), one new joiner with absences. Admins: `admin-skyline`, `admin-greenfield`. Personas exposed for demo: one worker + one admin per site. Seed ~6 reports per site in mixed statuses/languages, ~7 feedback responses per site, 2–4 passport entries per worker.

## Web UX rules
- Mobile-first, works at 320 px, total JS < 150 KB gz. No UI framework besides Preact.
- Icon + text + 🔊 read-aloud on every primary action; big tap targets (≥ 48 px); high contrast (WCAG AA); visible focus; skip link; `<html lang>` follows chosen language; respects `prefers-reduced-motion` and dark mode.
- Language chosen on first screen (labels in native script: English, हिन्दी, தமிழ்); persisted in localStorage (try/catch).
- Voice: `speechSynthesis` for read-aloud (`en-IN`, `hi-IN`, `ta-IN`); `MediaRecorder` for voice reports (max 60 s), text fallback always available.
- QR check-in: `BarcodeDetector` when available, else manual code entry; geolocation button as alternative.
- Hash router: `#/`, `#/w` (worker home), `#/w/attendance`, `#/w/pay`, `#/w/report`, `#/w/skills`, `#/w/feedback`, `#/a` (admin dashboard), `#/a/reports`, `#/a/qr`, `#/a/workers`, `#/a/feedback`, `#/track`, `#/verify`.
