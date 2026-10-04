# Nīkau

AI-assisted activity matching for disability support. Nīkau helps support coordinators and workers find suitable community activities for a client, and explains in plain English why each one was recommended.

Built by Ross and Jove for SD205 (Integrated Studio III), Yoobee Colleges.

## What it does

- Stores client profiles: interests, goals and accessibility needs
- Keeps a catalog of community activities
- Ranks catalog activities for a client and gives a short reason for each pick
- Role-based sign-in for coordinators and workers

## Project structure

```
nikau/
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

## Getting started

Requires Python 3, Node.js and Git.

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

## Project management

- Jira board and Confluence: https://sd205.atlassian.net
- Branches and commits start with the Jira key, for example `SCRUM-40-supabase-setup`

## Status

Sprint 1: tools setup and wireframes.