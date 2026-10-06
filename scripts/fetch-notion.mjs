// Pulls the Notion "Habits" and "Goals" databases and writes site/data/habits.json.
// Zero dependencies: needs Node 20+ (built-in fetch).
//
//   NOTION_TOKEN              integration token (required)
//   NOTION_DATABASE_ID        the Habits database (required)
//   NOTION_GOALS_DATABASE_ID  the Goals database (optional; no goal scores without it)
//   HABITS_TIMEZONE           used only when a row has no usable date in its title

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'site/data/habits.json');
const NOTION_VERSION = '2022-06-28';

// key used in the JSON -> checkbox property name in Notion
const HABITS = [
    { key: 'workout', name: '👟 Workout' },
    { key: 'nutrition', name: '🍎 Nutrition' },
    { key: 'miracleMorning', name: '🌅 Miracle morning' },
    { key: 'workBusiness', name: '💼 Work business' },
    { key: 'workFocused', name: '🎯 Work focused CC' },
    { key: 'highAgency', name: '🚀 High agency/ HIM' },
    { key: 'screenTime', name: 'Screen time < 2h' },
    { key: 'read', name: '📚 Read' },
];

loadDotEnv();

const TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const GOALS_DATABASE_ID = process.env.NOTION_GOALS_DATABASE_ID;
const TIMEZONE = process.env.HABITS_TIMEZONE || 'Europe/Ljubljana';

if (!TOKEN || !DATABASE_ID) {
    console.error('NOTION_TOKEN and NOTION_DATABASE_ID must be set (env or .env).');
    process.exit(1);
}

// Local runs read .env; in GitHub Actions the values come from secrets.
function loadDotEnv() {
    const path = resolve(ROOT, '.env');
    if (!existsSync(path)) return;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (match && process.env[match[1]] === undefined) {
            process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
    }
}

async function notion(path, body) {
    const response = await fetch(`https://api.notion.com/v1${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Notion API ${response.status}: ${data.message || JSON.stringify(data)}`);
    }
    return data;
}

async function fetchAllRows(databaseId) {
    const rows = [];
    let cursor;
    do {
        const page = await notion(`/databases/${databaseId}/query`, {
            page_size: 100,
            ...(cursor ? { start_cursor: cursor } : {}),
        });
        rows.push(...page.results);
        cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return rows;
}

// Emoji and spacing in property names get edited in Notion; compare on letters only.
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

function findProperty(properties, wanted) {
    if (properties[wanted]) return properties[wanted];
    const target = normalize(wanted);
    const name = Object.keys(properties).find((candidate) => normalize(candidate) === target);
    return name ? properties[name] : undefined;
}

function dateInTimezone(iso) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date(iso));
}

// The row title is the day ("2026-10-06"). Fall back to the date property, then creation time.
function rowDate(row) {
    const properties = row.properties;
    const titleProperty = Object.values(properties).find((property) => property.type === 'title');
    const title = plainText(titleProperty?.title);
    const fromTitle = title.match(/\d{4}-\d{2}-\d{2}/);
    if (fromTitle && !Number.isNaN(Date.parse(fromTitle[0]))) return fromTitle[0];

    const createdAt = findProperty(properties, 'Created at')?.date?.start;
    if (createdAt) return createdAt.slice(0, 10);

    return dateInTimezone(row.created_time);
}

function toDay(row) {
    const day = { date: rowDate(row) };
    for (const habit of HABITS) {
        const property = findProperty(row.properties, habit.name);
        if (!property) throw new Error(`Property "${habit.name}" not found in the Notion database.`);
        day[habit.key] = property.checkbox === true;
    }
    return day;
}

// Two cards for the same day count as one: a habit is done if either has it checked.
function mergeByDate(days) {
    const byDate = new Map();
    for (const day of days) {
        const existing = byDate.get(day.date);
        if (!existing) {
            byDate.set(day.date, day);
            continue;
        }
        for (const habit of HABITS) existing[habit.key] = existing[habit.key] || day[habit.key];
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const plainText = (parts) => (parts || []).map((part) => part.plain_text).join('').trim();

// A goal's week is a label like "5.10-11.10.2026" (day.month-day.month.year).
// Returns the Monday of that week as YYYY-MM-DD, or null if the label does not parse.
function weekStart(label) {
    const match = (label || '').match(/^\s*(\d{1,2})\.(\d{1,2})\.?\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/);
    if (!match) return null;
    const [startDay, startMonth, , endMonth, endYear] = match.slice(1).map(Number);
    // A week running from December into January starts in the previous year.
    const year = startMonth > endMonth ? endYear - 1 : endYear;
    const start = new Date(Date.UTC(year, startMonth - 1, startDay));
    if (start.getUTCMonth() !== startMonth - 1) return null;
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    return start.toISOString().slice(0, 10);
}

function toGoal(row) {
    const properties = row.properties;
    const name = plainText(Object.values(properties).find((property) => property.type === 'title')?.title);
    const week = findProperty(properties, 'Week')?.select?.name;
    const area = findProperty(properties, 'Area')?.select?.name;
    const score = findProperty(properties, 'Score')?.number;
    const start = weekStart(week);
    if (!area || !start) {
        console.warn(`Skipping goal "${name}": ${area ? `cannot read week "${week}"` : 'no area set'}`);
        return null;
    }
    return { name, area, week, weekStart: start, score: score ?? null };
}

const rows = await fetchAllRows(DATABASE_ID);
const days = mergeByDate(rows.map(toDay));

let goals = [];
if (GOALS_DATABASE_ID) {
    const goalRows = await fetchAllRows(GOALS_DATABASE_ID);
    goals = goalRows.map(toGoal).filter(Boolean)
        .sort((a, b) => `${a.weekStart}${a.area}${a.name}`.localeCompare(`${b.weekStart}${b.area}${b.name}`));
} else {
    console.warn('NOTION_GOALS_DATABASE_ID is not set; goal scores are left out.');
}

const content = { habits: HABITS, days, goals };

// Keep the old timestamp when nothing changed so an unchanged sync produces no diff.
let updatedAt = new Date().toISOString();
if (existsSync(OUTPUT)) {
    const previous = JSON.parse(readFileSync(OUTPUT, 'utf8'));
    const { habits, days: previousDays, goals: previousGoals } = previous;
    const same = JSON.stringify({ habits, days: previousDays, goals: previousGoals }) === JSON.stringify(content);
    if (same && previous.updatedAt) updatedAt = previous.updatedAt;
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify({ updatedAt, ...content }, null, 2)}\n`);
console.log(`Wrote ${days.length} day(s) and ${goals.length} goal(s) to site/data/habits.json`);
