# notion-charts

GitHub-style habit charts fed by the Notion "Habits" database.

## How it works

1. `scripts/fetch-notion.mjs` reads every row of the Notion database and writes `site/data/habits.json` (one entry per day).
2. `site/` is a static page that draws the heatmaps from that JSON.
3. `.github/workflows/sync.yml` runs the fetch every 30 minutes, commits the JSON when it changed, and deploys `site/` to GitHub Pages.

## Run locally

Create `.env` (see `.env.example`), then:

```bash
node scripts/fetch-notion.mjs
python3 -m http.server 8080 --directory site
```

Open http://localhost:8080. Add `?theme=dark` or `?theme=light` to pin the theme.

## Configuration

| Where | Name | What |
|---|---|---|
| GitHub secret | `NOTION_TOKEN` | Notion integration token |
| GitHub variable | `NOTION_DATABASE_ID` | ID of the Habits database |

To change which habits are charted, edit `CHARTS` at the top of `site/heatmap.js`.
If a checkbox is renamed in Notion, update its name in `HABITS` in `scripts/fetch-notion.mjs`.
