# 🌍 Bookalocal.com — Local Guide Marketplace

A production-ready marketplace platform for booking verified local guides. Initially launching in Nepal.

## 🏗️ Architecture

```
bookalocal/
├── frontend/          # Next.js 14 + Tailwind CSS
├── backend/           # Node.js + Express + PostgreSQL
└── docs/              # API docs, schema, deployment guide
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Stripe account
- Google Maps API key

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/bookalocal.git
cd bookalocal

# Install frontend deps
cd frontend && npm install

# Install backend deps
cd ../backend && npm install
```

### 2. Environment Setup

```bash
# Backend (.env)
cp backend/.env.example backend/.env
# Fill in: DATABASE_URL, JWT_SECRET, STRIPE_SECRET_KEY, etc.

# Frontend (.env.local)
cp frontend/.env.example frontend/.env.local
# Fill in: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, etc.
```

### 3. Database Setup

```bash
cd backend
npm run db:migrate
npm run db:seed
```

### 4. Run Development

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Visit: http://localhost:3000

---

## 🌐 Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full deployment instructions.

**Frontend**: Vercel  
**Backend**: Railway or AWS EC2  
**Database**: Railway PostgreSQL or AWS RDS  
**File Storage**: AWS S3 / Cloudinary

---

## 👥 Default Test Accounts

After seeding:
- **Admin**: admin@bookalocal.com / Admin@123
- **Guide**: hari@guide.com / Guide@123
- **Traveler**: sarah@traveler.com / Travel@123

---

## 📄 License

MIT
