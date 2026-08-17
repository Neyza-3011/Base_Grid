# BaseGrid — Multi-Tenant SaaS Platform

Production-ready, ultra-secure SaaS solution for construction, plumbing, HVAC, and electrical service companies. Digitizes field reports, client signatures, materials management, multi-tenant billing via Stripe, and superadmin governance.

## 🚀 Key Features

- **Multi-Tenant Isolation**: Enforced `company_id` filter at database query level (PostgreSQL + Async SQLAlchemy) preventing IDOR and horizontal privilege escalation.
- **Enterprise Authentication**: Email/Password + Google OAuth token validation, short-lived JWT access tokens & HttpOnly refresh tokens.
- **Paywall & Stripe Integration**: 30-day free trial enforcement and multi-tier subscription plans (Starter, Business Pro, Enterprise Unlimited).
- **Master Super-Admin Control Panel**: Real-time tenant oversight, PostgreSQL health metrics, Redis rate-limiting telemetry, and an isolated **Cloned Sandbox Test Environment** (`sandbox_company_id`).
- **OWASP Top 10 Hardened**: Redis sliding window rate-limiting, CSP/HSTS/X-Frame-Options security headers middleware, and password hashing (`argon2id`/`bcrypt`).

## 🛠️ Stack & Architecture

### Backend (`/backend`)

- **FastAPI (Python 3.11+)**
- **Async SQLAlchemy 2.0 & PostgreSQL 16**
- **Redis 7** (Rate Limiting & Token Blacklisting)
- **Pydantic v2 BaseSettings** (`.env` validation)
- **Docker & Docker Compose**

### Frontend (`/src`)

- **React 18 & Vite**
- **TanStack Router**
- **Tailwind CSS**
- **Lucide React Icons & Motion**

## 📦 Getting Started

### Local Development (Frontend)

```bash
npm install
npm run dev
```

### Backend Setup (Docker)

```bash
cd backend
cp .env.example .env
docker-compose up --build
```

The API documentation will be available at `http://localhost:8000/docs` (in non-production mode).
