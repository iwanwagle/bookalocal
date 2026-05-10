# 🚀 Bookalocal.com — Deployment Guide

## Overview

| Layer | Service | Cost |
|-------|---------|------|
| Frontend | Vercel (free tier) | Free |
| Backend | Railway | ~$5/mo |
| Database | Railway PostgreSQL | ~$5/mo |
| File Storage | Cloudinary (free tier) | Free |
| Payments | Stripe | 2.9% + 30¢/txn |

---

## 1. Database Setup (Railway)

```bash
# 1. Create Railway account at railway.app
# 2. New Project → Add PostgreSQL
# 3. Copy the DATABASE_URL from the Variables tab

# Run migrations locally against Railway DB
DATABASE_URL=<your-railway-db-url> node src/database/migrate.js
DATABASE_URL=<your-railway-db-url> node src/database/seed.js
```

---

## 2. Backend Deployment (Railway)

```bash
# 1. Fork/clone the repo to GitHub

# 2. Railway: New Project → Deploy from GitHub → select repo
# 3. Set Root Directory to: bookalocal/backend
# 4. Add all environment variables (see .env.example):

PORT=5000
DATABASE_URL=<railway-postgres-url>
JWT_SECRET=<generate-with: openssl rand -hex 64>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=<app-password>
CLIENT_URL=https://bookalocal.vercel.app

# 5. Railway will auto-detect Node.js and deploy
# 6. Your API will be at: https://bookalocal-backend.up.railway.app
```

### Stripe Webhook Setup
```bash
# In Stripe Dashboard → Webhooks → Add endpoint
# URL: https://your-backend.railway.app/api/payments/webhook
# Events: payment_intent.succeeded, payment_intent.payment_failed, charge.refunded
```

---

## 3. Frontend Deployment (Vercel)

```bash
# 1. Push code to GitHub

# 2. Vercel: New Project → Import from GitHub
# 3. Set Root Directory to: bookalocal/frontend
# 4. Framework Preset: Next.js

# 5. Add Environment Variables:
NEXT_PUBLIC_API_URL=https://your-backend.railway.app/api
NEXT_PUBLIC_STRIPE_KEY=pk_live_...
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...   # optional for maps

# 6. Deploy! Vercel handles everything automatically.
```

---

## 4. Cloudinary Setup (Image Storage)

```bash
# 1. Sign up at cloudinary.com (free 25GB)
# 2. Dashboard → API Keys → copy credentials
# 3. Create upload presets:
#    Settings → Upload → Add upload preset
#    Name: bookalocal_listings  (unsigned)
```

---

## 5. Domain Setup

```bash
# Vercel:
# Project Settings → Domains → Add: bookalocal.com
# Add CNAME record: www → cname.vercel-dns.com

# Railway (custom domain):
# Service Settings → Networking → Custom Domain
# Add A record pointing to Railway's IP
```

---

## 6. Production Checklist

- [ ] Change all `pk_test_` Stripe keys to `pk_live_`
- [ ] Change all `sk_test_` Stripe keys to `sk_live_`
- [ ] Set `NODE_ENV=production` on Railway
- [ ] Enable Vercel Analytics
- [ ] Set up error monitoring (Sentry — free tier)
- [ ] Configure rate limiting for production traffic
- [ ] Set up database backups on Railway
- [ ] Enable Cloudflare CDN for faster global delivery
- [ ] Set up Google Analytics / Plausible
- [ ] Configure SMTP properly (SendGrid recommended for production)

---

## 7. Local Development

```bash
# Clone repo
git clone https://github.com/yourname/bookalocal.git
cd bookalocal

# Backend setup
cd backend
npm install
cp .env.example .env
# Fill in your .env values (PostgreSQL local, Stripe test keys)

# Create local DB and run migrations
createdb bookalocal
node src/database/migrate.js
node src/database/seed.js  # adds sample data + test accounts

npm run dev   # runs on :5000

# Frontend setup (new terminal)
cd ../frontend
npm install
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:5000/api
# NEXT_PUBLIC_STRIPE_KEY=pk_test_...

npm run dev   # runs on :3000
```

---

## Test Accounts (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Traveler | sarah@traveler.com | Travel@123 |
| Traveler | mike@traveler.com | Travel@123 |
| Guide | hari@guide.com | Guide@123 |
| Guide | maya@guide.com | Guide@123 |
| Guide | ram@guide.com | Guide@123 |
| Admin | admin@bookalocal.com | Admin@123 |

---

## Estimated Monthly Costs (Production)

| Service | Cost |
|---------|------|
| Vercel (Pro) | $20/mo |
| Railway Backend | $5/mo |
| Railway PostgreSQL | $5/mo |
| Cloudinary | Free (up to 25GB) |
| Stripe | 2.9% + $0.30 per transaction |
| **Total** | **~$30/mo + Stripe fees** |

At 100 bookings/month averaging NPR 15,000 (~$112), Stripe fees ≈ $35/mo.
Total cost: ~$65/mo. Revenue at 15% commission: $1,680/mo. **ROI: 25x** 🚀
