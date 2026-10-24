# Studio Ledger

Production finance, projects, schedule and crew for **The Madking Studios**, **Space & Gravity** and the shared **Office**.

- **Partners** (emails in `PARTNER_EMAILS`) see everything: money overview, ledger, voice logging, invoices, Ask, budgets, rates, team access.
- **Employees** (added by a partner under *Team access*) see projects (no budgets), plans, the schedule/calendar and the people directory (no rates). Every money route is checked on the server, so employees can't reach financial data even by calling the API directly.
- All records live in one Google Sheet (tabs: Ledger, Projects, Schedule, People, Team). Schedule entries sync to a shared Google Calendar. Invoices are stored privately in Vercel Blob and only partners can open them.

## One-time setup (about 30 minutes, on a laptop)

### 1. Google Cloud project
1. Go to <https://console.cloud.google.com>, create a project called **Studio Ledger**.
2. **APIs & Services → Library**: enable **Google Sheets API** and **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**: choose **External**, app name *Studio Ledger*, your email as support and developer contact. Scopes: leave the defaults (email, profile, openid). Then **Publish app** (sign-in-only apps don't need Google verification). If you leave it in Testing, add all five partners and every employee under *Test users*.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**: type *Web application*.
   - Authorised JavaScript origins: `https://YOUR-APP.vercel.app`
   - Authorised redirect URIs: `https://YOUR-APP.vercel.app/api/auth/callback/google`
   - Copy the **Client ID** and **Client secret**.
5. **Credentials → Create credentials → Service account**: name it `studio-ledger`, skip the optional steps. Open it → **Keys → Add key → JSON**. A file downloads; you need its `client_email` and `private_key`.

### 2. Share the Sheet and Calendar with the service account
1. Open the **Production tracker** Sheet → Share → paste the service account's `client_email` → **Editor**. Untick "Notify".
2. In Google Calendar create a new calendar **Studio Productions** (Other calendars → + → Create new calendar).
   - Its settings → *Share with specific people* → add the service account email → **Make changes to events**.
   - Also add your partners and employees (See all event details) so it shows in their own Google Calendar app.
   - Copy the **Calendar ID** under *Integrate calendar* (looks like `…@group.calendar.google.com`).

### 3. Claude API key
<https://console.anthropic.com> → API keys → Create key. Add a little credit under Billing. Paste the key only into Vercel, never into chat.

### 4. Vercel
1. **Add New → Project → Import** the `studio-ledger` GitHub repo. Framework: Next.js (auto-detected). Deploy once (it will fail to sign in until the variables are set; that's fine) and note the URL.
2. **Storage → Create → Blob** (choose **Private** if it asks for an access type) → connect it to this project. Vercel adds the Blob settings (BLOB_STORE_ID etc.) automatically.
3. **Settings → Environment Variables** — add each of these (Production + Preview):

| Name | Value |
| --- | --- |
| `NEXTAUTH_URL` | `https://YOUR-APP.vercel.app` |
| `NEXTAUTH_SECRET` | any long random string (e.g. from <https://generate-secret.vercel.app/32>) |
| `GOOGLE_CLIENT_ID` | from step 1.4 |
| `GOOGLE_CLIENT_SECRET` | from step 1.4 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key |
| `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON key, pasted exactly including `-----BEGIN PRIVATE KEY-----` |
| `GOOGLE_SHEET_ID` | `1jg1wfQkmXckCkLbz9Ivf1TRrebzXJwNFXSMLtTM-ZZo` |
| `GOOGLE_CALENDAR_ID` | from step 2.2 |
| `PARTNER_EMAILS` | the five partners' Google emails, comma-separated |
| `ANTHROPIC_API_KEY` | from step 3 |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` (optional) |

4. **Deployments → Redeploy**. Open the URL, sign in with a partner Gmail.
5. Use the OAuth redirect URL from step 1.4 with the final domain if you add a custom domain later (e.g. `ledger.themadkingstudios.com`), and update `NEXTAUTH_URL`.

### 5. Add to the phone home screen
Open the app in Safari → Share → **Add to Home Screen**. On Android Chrome → ⋮ → **Install app**.

## Daily use
- **Studio** (home): orbit of every project by pipeline stage, what needs attention, retainer output for the month, insights charts and the pipeline.
- **Projects**: grouped by pipeline stage. Each project page has Overview (objective, scope, brand context, POCs, updates), Tickets (with standard ticket sets), Deliverables, Content, Schedule and, for partners, Money.
- **Tickets**: every task with priority, status, POCs and deadline. Filters by project, person, priority, status and due date.
- **Content**: the posting calendar (reels, statics, carousels…) with status from Idea to Posted.
- **Team**: everyone's open work and P1s. Partners set job titles and groups.
- **Log** (+): tap *Speak* (or the keyboard mic) and say what was spent or received. Several items at once is fine. Check the cards and save. *Attach invoice* reads a photo or PDF.
- **Ask** (magnifier, top right): "AI subscriptions and credits this month" → table with exact totals.
- **Schedule**: add shoots, recces, meetings; assign crew; every entry appears in the Studio Productions Google Calendar. Open an entry → **Call sheet** for a printable sheet.
- **Today**: everyone checks in each morning with their plan for the day, and checks out in the evening with what's finished and what's pending. Partners see the whole team's day, who's late or missing, and a monthly attendance table. Late = after 10:30 IST (change with `LATE_AFTER`, e.g. `10:00`).
- **Projects**: budget, stage, plan/strategy. Employees can move stages and edit plans.
- **Menu → Team access**: give employees access by Google email, or remove it.

## Local development
```
npm install
cp .env.example .env.local   # fill in values, NEXTAUTH_URL=http://localhost:3000
npm run dev
```
Add `http://localhost:3000/api/auth/callback/google` to the OAuth client's redirect URIs for local sign-in.
