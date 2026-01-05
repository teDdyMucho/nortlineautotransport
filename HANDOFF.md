# EasyDrive - Client Deployment / Ownership Handoff

This project is a Vite + React frontend deployed on Netlify, with:
- Supabase (Auth + Postgres) for customer login, staff/admin, orders, receipts
- Stripe Checkout for payments (via Netlify Functions)
- Netlify Functions in `netlify/functions`

This guide is written so the CLIENT can deploy and fully own:
- The website + domain
- Supabase project
- Google OAuth provider (Google Login)
- Stripe account + payouts

---

## 0) What the client needs (accounts)
- GitHub account (repo ownership)
- Netlify account (hosting)
- Supabase account (database + auth)
- Google Cloud account (OAuth credentials)
- Stripe account (payments + bank payouts)

---

## 1) Get the code
Choose one:
- Fork this repo into the client’s GitHub
- Or clone + push into a new repo owned by the client

---

## 2) Deploy on Netlify
1. Netlify → Add new site → Import from Git
2. Select the client-owned GitHub repo
3. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Node version is already set to 20 in `netlify.toml`

After the first deploy, add environment variables (next section) and redeploy.

---

## 3) Environment variables (Netlify)
Netlify → Site settings → Environment variables

### 3.1 Frontend (Vite) variables
Used in the browser:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 3.2 Server (Netlify Functions) variables
Used only by Netlify Functions:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Notes:
- `SUPABASE_SERVICE_ROLE_KEY` is secret and must never be exposed to the browser.
- Payments go to the Stripe account that owns the `STRIPE_SECRET_KEY`.

---

## 4) Supabase setup (client-owned)
### 4.1 Create a Supabase project
Supabase → New project → save:
- Project URL (example: `https://YOUR_PROJECT_REF.supabase.co`)
- Anon key
- Service role key

### 4.2 Create DB tables + policies
Supabase → SQL Editor → run:
- `supabase/schema.sql`

This creates:
- `orders`, `order_events`
- `receipts`
- `staff_profiles` (required for `/admin`)

### 4.3 Configure Auth URL settings
Supabase → Authentication → URL Configuration:
- Site URL: `https://YOUR_DOMAIN`
- Redirect URLs (recommended):
  - `https://YOUR_DOMAIN/**`
  - `http://localhost:5173/**` (optional local dev)
  - `https://**--YOUR_NETLIFY_SITE_NAME.netlify.app/**` (optional deploy previews)

---

## 5) Google Login (Supabase provider)
This app uses Supabase OAuth (`signInWithOAuth({ provider: 'google' })`).

### 5.1 Create Google OAuth credentials
Google Cloud Console:
1. Create/select a project
2. Configure OAuth consent screen (External)
3. Create OAuth Client ID (Web application)
4. Add this Authorized redirect URI (Supabase callback):
   - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

### 5.2 Enable Google provider in Supabase
Supabase → Authentication → Providers → Google:
- Enable
- Paste Google Client ID + Client Secret
- Save

---

## 6) Stripe payments (client-owned)
### 6.1 Stripe account + API keys
Stripe Dashboard:
- Use Test mode while testing
- Switch to Live mode when ready to accept real payments

Put the Stripe secret key into Netlify:
- `STRIPE_SECRET_KEY`

### 6.2 Stripe webhook (required)
This project expects a webhook endpoint:
- `https://YOUR_DOMAIN/.netlify/functions/stripe-webhook`

Stripe Dashboard → Developers → Webhooks:
- Add endpoint (in the correct mode: Test vs Live)
- Listen for event:
  - `checkout.session.completed`
- Copy signing secret (`whsec_...`) and set in Netlify:
  - `STRIPE_WEBHOOK_SECRET`

---

## 7) Admin / staff access setup
Admin portal URL:
- `https://YOUR_DOMAIN/admin`

Production staff login uses:
- Supabase Auth (email/password)
- A matching row in `staff_profiles`

### 7.1 Create staff user (Supabase Auth)
Supabase → Authentication → Users → Add user
- Email + password

### 7.2 Insert staff profile row
Supabase → SQL Editor:

```sql
insert into public.staff_profiles (user_id, role, email, name, active)
values (
  'PASTE_AUTH_USER_UUID_HERE',
  'admin',
  'admin@yourdomain.com',
  'Admin',
  true
)
on conflict (user_id) do update
set role = excluded.role,
    email = excluded.email,
    name = excluded.name,
    active = excluded.active;
```

---

## 8) External dependencies the client may want to replace (for full ownership)
### 8.1 Document extraction endpoint (Railway)
There are hardcoded calls to:
- `https://primary-production-6722.up.railway.app/webhook/upload`
- `https://primary-production-6722.up.railway.app/webhook/Dox`

Files:
- `src/components/FileUploadSection.tsx`
- `src/components/OrderWizard.tsx`

If the client wants full ownership, replace these URLs with the client’s own backend endpoint (or disable extraction).

### 8.2 Google Maps embed API key
There is a hardcoded Google Maps embed key in:
- `src/components/FileUploadSection.tsx`

If the client wants full ownership, they should create their own Google Maps API key and replace it (recommended: move into an environment variable).

---

## 9) Local development (optional)
1. Install: `npm install`
2. Create `.env.local` based on `.env.example` and `.env.local.example`
3. Run: `npm run dev`

---

## 10) Go-live checklist
- Supabase schema applied (`supabase/schema.sql`)
- Supabase Auth URLs set to production domain
- Google provider enabled in Supabase
- Netlify env vars set (VITE_* + server vars)
- Stripe webhook created for `/.netlify/functions/stripe-webhook`
- Admin staff user created (Supabase Auth + `staff_profiles` row)
- Final Netlify deploy completed
