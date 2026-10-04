# Nīkau

AI-assisted activity matching for disability support. Nīkau helps support coordinators and workers find suitable community activities for a client, and explains in plain English why each one was recommended.

Built by Ross and Jove for SD205 (Integrated Studio III), Yoobee Colleges.

## What it does

- Stores client profiles: interests, goals and accessibility needs
- Keeps a catalog of community activities
- Ranks catalog activities for a client and gives a short reason for each pick
- Role-based sign-in for coordinators and workers

## Architecture

Three independently deployable services in one repo (planned layout, names to be confirmed at scaffold):

| Folder | Purpose |
|---|---|
| `frontend/` | Web UI |
| `core-api/` | Clients, activity catalog, auth |
| `ai-service/` | Matching and explanation service |

## Getting started

Setup instructions will be added as each service is scaffolded.

Never commit secrets. Keep keys in a local `.env` file, which is git-ignored.

## Project management

- Jira board and Confluence: https://sd205.atlassian.net
- Branches and commits start with the Jira key, for example `SCRUM-40-supabase-setup`

## Status

Sprint 1: tools setup and wireframes.
