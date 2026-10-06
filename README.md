# notion-charts

Habit charts fed by the Notion "Habits" and "Goals" databases.

- `site/index.html`: GitHub-style calendars
- `site/charts.html`: weekly and daily progress per area, with goal scores

## How it works

1. `scripts/fetch-notion.mjs` reads both Notion databases and writes `site/data/habits.json` (one entry per day, plus the goals).
2. `site/` holds two static pages that draw from that JSON.
3. `.github/workflows/sync.yml` runs the fetch every 30 minutes, commits the JSON when it changed, and deploys `site/` to GitHub Pages.

## Run locally

Create `.env` (see `.env.example`), then:

```bash
node scripts/fetch-notion.mjs
python3 -m http.server 8080 --directory site
```

Open http://localhost:8080.

## Configuration

| Where | Name | What |
|---|---|---|
| GitHub secret | `NOTION_TOKEN` | Notion integration token |
| GitHub variable | `NOTION_DATABASE_ID` | ID of the Habits database |
| GitHub variable | `NOTION_GOALS_DATABASE_ID` | ID of the Goals database |

To change which habits get a calendar, edit `CHARTS` at the top of `site/heatmap.js`.
To change which habits belong to Body or Business, edit `AREAS` at the top of `site/charts.js`.

Goals need an `Area` matching an area name, a `Score` from 1 to 100, and a `Week` written as `5.10-11.10.2026`.
If a checkbox is renamed in Notion, update its name in `HABITS` in `scripts/fetch-notion.mjs`.
