# NPV Loss Calculator — Deployment Guide

## What This Is
A role-based web app for calculating NPV loss on real estate payment deviations.
- **Site Head**: sees only assigned towers, uses CV w/o Buffer
- **Business Head**: sees all towers, uses CV-EVO
- **Super Admin**: full admin panel — towers, units, schedules, users, audit log

---

## Prerequisites
- Free [Supabase](https://supabase.com) account
- Free [Vercel](https://vercel.com) account
- Node.js 18+ (for local development only)

---

## Step 1 — Set Up Supabase

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Give it a name (e.g. `npv-tool`) and set a strong database password
3. Wait ~2 minutes for the project to boot
4. Go to **SQL Editor** → **New Query**
5. Copy the entire contents of `supabase/schema.sql` and paste it → **Run**
6. You should see: _"Success. No rows returned."_

### Get your keys
Go to **Project Settings → API**:
- `NEXT_PUBLIC_SUPABASE_URL` — the **Project URL**
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the **anon / public** key
- `SUPABASE_SERVICE_ROLE_KEY` — the **service_role** key (keep this secret)

---

## Step 2 — Create the Super Admin User

1. In Supabase → **Authentication → Users** → **Invite user**
2. Enter your email address
3. After the user is created, go to **SQL Editor** and run:

```sql
UPDATE public.profiles
SET role = 'super_admin', name = 'Your Name'
WHERE email = 'your@email.com';
```

4. Check your email and set your password via the invite link

---

## Step 3 — Deploy to Vercel

### Option A: Deploy from GitHub (recommended)
1. Push this folder to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. In **Environment Variables**, add all three keys from Step 1
4. Click **Deploy**

### Option B: Deploy via Vercel CLI
```bash
npm install -g vercel
cd npv-tool
npm install
vercel
# Follow prompts, then add env vars in Vercel dashboard
```

---

## Step 4 — First Login & Setup

1. Visit your Vercel URL → login with your super admin email
2. Go to **Admin → Towers** → Add your towers
3. Go to **Admin → Units & Pricing** → Upload Excel or add manually
4. Go to **Admin → Payment Schedules** → Set milestones per tower
5. Go to **Admin → Users** → Create Site Head / Business Head accounts and assign towers

---

## Excel Upload Format

The upload accepts `.xlsx` files. Expected column headers (case-insensitive):

| Column | Notes |
|--------|-------|
| Unit No | Unit number |
| Floor | Floor number |
| Typology | e.g. "3 BED W/ STUDY LUXE" |
| Carpet | Carpet area in sqft |
| EBVT | Exclusive Balcony/Verandah/Terrace |
| Net Area | Total net area |
| Car Parking | Number of spots |
| CV - evo | Contract value (EVO) |
| CV w/o Notional Buffers | Contract value without buffer |

---

## Payment Schedule: Booking-Relative Milestones

When adding milestones in Admin → Payment Schedules:
- **Booking Relative = ON** → enter number of days from booking (e.g. 0 = booking day, 21 = 21 days after booking)
- **Booking Relative = OFF** → enter a fixed calendar date

---

## Local Development

```bash
cp .env.example .env.local
# Fill in your Supabase keys in .env.local

npm install
npm run dev
# Open http://localhost:3000
```

---

## Security Notes

- All pages are server-side protected — unauthenticated users are redirected to `/login`
- Row-Level Security (RLS) is enforced in Supabase — Site Heads physically cannot query other towers' data
- Service role key is only used server-side (API routes) and never exposed to the browser
- All admin actions are logged to the audit_log table with timestamp and user email

---

## Folder Structure

```
npv-tool/
├── pages/
│   ├── index.js          → Redirect based on role
│   ├── login.js          → Login page
│   ├── calculator.js     → Main NPV tool
│   └── admin/
│       ├── index.js      → Dashboard
│       ├── towers.js     → Tower management
│       ├── units.js      → Unit pricing
│       ├── schedules.js  → Payment schedules
│       ├── users.js      → User management
│       └── audit.js      → Audit log
├── pages/api/admin/
│   ├── users.js          → Create/update/delete users
│   └── units/upload.js   → Excel bulk import
├── components/
│   └── AdminLayout.js    → Sidebar navigation
├── lib/
│   ├── supabase.js       → Supabase client setup
│   └── auth.js           → SSR auth helpers
├── supabase/
│   └── schema.sql        → Run this first in Supabase
├── styles/
│   └── globals.css       → Global styles
└── .env.example          → Copy to .env.local
```
