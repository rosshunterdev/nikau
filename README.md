# Nīkau

AI-assisted activity matching for disability support. Nīkau helps support coordinators and workers find suitable community activities for a client, and explains in plain English why each one was recommended.

Built by Ross and Jove for SD205 (Integrated Studio III), Yoobee Colleges.

## What it does

- Stores client profiles: interests, goals and accessibility needs
- Keeps a catalog of community activities
- Ranks catalog activities for a client and gives a short reason for each pick
- Role-based sign-in for coordinators and workers

## Getting started

Requires Python 3.14, Node.js and Git. The local database also needs Docker Desktop and the Supabase CLI (see [Local database](#local-database)).

```bash
git clone <repo-url>
cd nikau
```

Copy `.env.example` to `.env` and fill in the values. Never commit secrets. Keep keys in a local `.env` file, which is git-ignored.

### Core API

```bash
cd services/core-api
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check http://localhost:8000/health and http://localhost:8000/docs

### AI Matching

```bash
cd services/ai-matching
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Check http://localhost:8001/health

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Project structure

```
nikau/
├── .github/
│   └── workflows/         # CI: frontend, core-api and ai-matching checks
├── supabase/
│   ├── config.toml        # Local Supabase settings
│   ├── migrations/        # Database schema, applied in timestamp order
│   └── seed.sql           # Local test data only (never pushed to the hosted project)
├── services/
│   ├── core-api/          # FastAPI service: clients, activities, auth, database access
│   │   ├── app/
│   │   │   └── main.py    # App entry point and routes
│   │   ├── tests/
│   │   └── requirements.txt
│   └── ai-matching/       # FastAPI service: activity matching and explanations
│       ├── app/
│       │   └── main.py
│       ├── tests/
│       └── requirements.txt
├── frontend/              # React + TypeScript app (Vite)
│   ├── src/
│   ├── public/
│   └── package.json
├── .env.example           # Template for environment variables (copy to .env)
├── .gitignore
└── README.md
```

| Part | Tech | Local URL |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite | http://localhost:5173 |
| Core API | FastAPI | http://localhost:8000 |
| AI Matching | FastAPI | http://localhost:8001 |
| Database | Supabase (Postgres), run locally in Docker | Studio: http://127.0.0.1:54323 · API: http://127.0.0.1:54321 |

## Local database

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- Supabase CLI **2.121.0 or newer** (check with `supabase --version`). 
- On Windows: `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git` then `scoop install supabase`. 
- To update: `scoop update supabase`. Older versions can't read `supabase/config.toml`.

### Commands (run from the repo root)
```bash 
supabase start      # starts local Supabase in Docker (first run downloads images)
supabase db reset   # rebuilds the local database from supabase/migrations and supabase/seed.sql
supabase stop       # stops it and keeps your data
```

### Test logins (local only)
`supabase/seed.sql` creates fake staff for testing access rules. Password for all: `password123`.

| Email | Role | Organisation |
| --- | --- | --- |
| cora@test.nikau | Coordinator | Test Org |
| will@test.nikau | Support worker | Test Org |
| olive@other.nikau | Coordinator | Other Org |

## Project management

- Jira board and Confluence: https://sd205.atlassian.net
- Branches and commits start with the Jira key, for example `SCRUM-40-supabase-setup`

## Data sources

- Suburb and locality names for the Wellington Region come from
[NZ Suburbs and Localities](https://data.linz.govt.nz/layer/113764-nz-suburbs-and-localities/)
by Toitū Te Whenua Land Information New Zealand.

- Contains data sourced from the LINZ Data Service licensed for reuse under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Status

- Sprint 1: tools setup and wireframes.
- Sprint 2: architecture and foundations (in progress)