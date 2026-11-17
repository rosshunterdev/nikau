# Nīkau

AI-assisted activity matching for disability support. Nīkau helps support coordinators and workers find suitable community activities for a client, and explains in plain English why each one was recommended.

Built by Ross and Jove for SD205 (Integrated Studio III), Yoobee Colleges. This is a student prototype: it uses fake data only and is not for real clients.

**Live demo:** https://nikau-wheat.vercel.app (demo logins are in the submission document, not in this repo).

## What it does

- Stores client profiles: interests, goals, accessibility needs and sensory preferences
- Keeps a shared catalogue of community activities and the providers who run them
- Filters the catalogue for a client, then ranks the shortlist with Gemini and gives a short plain-English reason for each pick
- Lets workers save leads from a match, and coordinators review a matching log (with CSV download)
- Role-based sign-in: support workers see only the clients assigned to them, coordinators see their whole organisation (see [docs/access-rules.md](docs/access-rules.md))

## Getting started

Requires Python 3.14, Node.js 22 and Git. The local database also needs Docker Desktop and the Supabase CLI (see [Local database](#local-database)).

```bash
git clone <repo-url>
cd nikau
```

### Environment files
Each part reads its own settings file. Copy each template, then fill in the blanks:

| Template | Copy to | Used by |
| --- | --- | --- |
| `.env.example` | `.env` (repo root) | AI Matching |
| `services/core-api/.env.example` | `services/core-api/.env` | Core API |
| `frontend/.env.example` | `frontend/.env.local` | Frontend |

- Supabase values for local development: run `supabase status -o env` from the repo root.
- `GEMINI_API_KEY`: create one in Google AI Studio.
- `MATCHING_SERVICE_KEY`: the Core API and AI Matching must have the **same** value, or every match shows the fallback message. Make one with:
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(32))"
  ```
- `CORS_ORIGINS` must be a JSON list, for example `["http://localhost:5173","http://localhost:5174"]`. A plain URL stops the Core API from starting.

All `.env` files are git-ignored. Never commit real keys or paste them into chat, Jira or screenshots. Use different keys locally and on Vercel.

### Run order
Start the local database first (see [Local database](#local-database)), then the Core API, AI Matching and the frontend, each in its own terminal.

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

### Checks before a pull request
CI runs these on every pull request, so run them first:

| Part | Run from | Commands |
| --- | --- | --- |
| Core API | `services/core-api` (venv active) | `pip install -r requirements-dev.txt`, `ruff check .`, `python -m pytest` |
| AI Matching | `services/ai-matching` (venv active) | `pip install -r requirements-dev.txt`, `ruff check .`, `python -m pytest` |
| Frontend | `frontend` | `npm run lint`, `npm run build` |
| Database | repo root | see [Database tests](#database-tests) |

## Project structure

```
nikau/
├── .github/
│   └── workflows/         # CI: frontend, core-api, ai-matching and database checks
├── docs/                  # API contract, access rules, Gemini spike notes (docs/spikes)
├── fixtures/              # Sample clients and activities for tests and the spike
├── supabase/
│   ├── config.toml        # Local Supabase settings
│   ├── migrations/        # Database schema, applied in timestamp order
│   ├── db-tests/          # SQL tests for access rules and save functions (run in CI)
│   ├── seeds/             # Activity catalogue test data (loaded after seed.sql)
│   ├── demo/              # demo_logins.sql: demo organisation for the hosted project (run by hand once)
│   └── seed.sql           # Local test data only (never pushed to the hosted project)
├── services/
│   ├── core-api/          # FastAPI service: clients, activities, leads, matching, database access
│   │   ├── app/
│   │   │   ├── main.py    # App entry point
│   │   │   ├── routers/   # One file of endpoints per area (clients, leads, matching...)
│   │   │   └── schemas/   # Request and response shapes
│   │   ├── tests/
│   │   ├── .env.example   # Core API settings (copy to services/core-api/.env)
│   │   └── requirements.txt
│   └── ai-matching/       # FastAPI service: ranks the shortlist with Gemini and explains why
│       ├── ai_matching/   # Contract and Gemini call
│       ├── app/
│       │   └── main.py    # App entry point
│       ├── tests/
│       └── requirements.txt
├── frontend/              # React + TypeScript app (Vite)
│   ├── src/
│   ├── public/
│   ├── .env.example       # Frontend settings (copy to frontend/.env.local)
│   └── package.json
├── .env.example           # AI Matching settings (copy to .env in the repo root)
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
- Supabase CLI **2.121.0 or newer** (check with `supabase --version`). Older versions can't read `supabase/config.toml`.
  - Install on Windows: `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git` then `scoop install supabase`
  - Update: `scoop update supabase`

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

### Database tests
`supabase/db-tests/` holds SQL tests for the access rules (RLS) and save functions.
Each file runs as the seed users (Cora, Will, Olive), checks what they can and can't do,
then rolls everything back, so the seed data is never changed.
CI runs them on every pull request that changes `supabase/` (`.github/workflows/db-tests.yml`).

Run them locally from the repo root (PowerShell, Docker running):
```powershell
supabase db reset
Get-ChildItem supabase\db-tests\*.sql | ForEach-Object {
  "== $($_.Name)"
  Get-Content $_.FullName -Raw | docker exec -i supabase_db_nikau psql -U postgres -v ON_ERROR_STOP=1 -q
}
```
Each file prints `NOTICE: SCRUM-xx: all tests passed`; any failed check stops with an error.

Adding a test: create the next numbered file, start with `begin;`, end with `rollback;`,
use `assert` for each check, and finish with a `raise notice '... all tests passed'`.

#### Core API tests against the database
`services/core-api/tests/db/` signs in as the seed users and calls the real API, so RLS and the save functions run for real. With Supabase running (`supabase db reset` first for fresh seed data), from `services/core-api`:
```bash
python -m pytest tests/db -v
```
They're skipped when local Supabase isn't running, or when `services/core-api/.env` points somewhere other than `localhost`, so `python -m pytest` still works anywhere. They never run against a hosted database, because they create and delete rows. In CI they run in the same `db-tests` workflow as the SQL tests.

If `supabase start` fails on Windows with "forbidden by its access permissions", Windows has reserved the port. In an Administrator PowerShell, run `net stop winnat` then `net start winnat`.

### Writing migrations
- Create one with `supabase migration new <name>`. Never edit a migration that has already been merged: add a new one.
- **Say who can run every new database function.** SCRUM-61 stopped new functions being runnable by `public` and `anon` (signed-out visitors). Supabase still lets signed-in users (`authenticated`) run them by default, but we don't rely on that default: any function the app calls ends its migration with both lines:
  ```sql
  revoke execute on function public.<name>(<args>) from public, anon;
  grant execute on function public.<name>(<args>) to authenticated;
  ```
  The `revoke` makes sure signed-out visitors can't call it. The `grant` states in the migration itself that signed-in staff can, so it keeps working even if Supabase's default changes. See `create_client_full` in `20261030135700_save_client_functions.sql` for an example.
- Add or update a test file in `supabase/db-tests/` for any new rule or function.


## Deployment

| Part | Where | Notes |
| --- | --- | --- |
| Frontend | Vercel project `nikau-frontend` | Deploys on every push to `main` |
| Core API | Vercel project `nikau-core-api` | Own environment variables (see the `.env.example` files) |
| AI Matching | Vercel project `nikau-ai-matching` | `MATCHING_SERVICE_KEY` must match the Core API's |
| Database | Hosted Supabase project | Code deploys do **not** change it |

Database changes are separate from code deploys. After merging a migration, run `supabase db push` from the repo root (it is linked to the hosted project), then check `supabase migration list` shows Local and Remote match.
The hosted project has no seed data. `supabase/demo/demo_logins.sql` creates the demo organisation once the two demo logins exist in the Supabase dashboard.
Secrets live only in Vercel and in git-ignored `.env` files. Use different keys locally and on Vercel.

## Known limitations
- Prototype only: fake data, no real client information. A real version would need a paid AI tier that does not train on prompts.
- Built desktop first. Phone layouts are only partly fixed (SCRUM-128).
- AI explanations can contain small wording slips or filler (SCRUM-115).
- The app can't delete clients or providers, and archiving an activity has no undo.
- Activities are added by hand, so the catalogue grows slowly. Ideas for later are labelled `future-work` in Jira.

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

Code freeze for the SD205 hand-in (21 Nov 2026): no new features, only fixes, testing and documentation.
