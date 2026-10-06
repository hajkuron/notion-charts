// Running score per area since the first tracked day.
//
// Each day adds the share of the area's habits that were done (0 to 1), so every
// area climbs towards the same dashed line: one point per day, a perfect record.

const AREAS = [
    { name: 'Body', color: '#3b82f6', pointStyle: 'circle', keys: ['workout', 'nutrition'] },
    { name: 'Business', color: '#ef4444', pointStyle: 'rect', keys: ['workFocused', 'workBusiness'] },
    { name: 'Mind', color: '#a78bfa', pointStyle: 'triangle', keys: ['miracleMorning', 'read', 'screenTime'] },
];

const DAY_MS = 86400000;
const TEXT = '#a3a3a3';
const GRID = '#262626';

// Days are handled as UTC midnights so daylight-saving shifts can never move a day.
const toMs = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);

function todayIso() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function el(tag, attributes = {}, text) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
}

const formatDay = (ms, options) => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options });
const formatScore = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
const percent = (score, possible) => (possible ? Math.round((score / possible) * 100) : 0);

// Running totals with a zero starting point, so day one already draws a line.
function runningScore(area, dayMs, byDate) {
    let total = 0;
    return [0, ...dayMs.map((ms) => {
        const day = byDate.get(toIso(ms));
        const done = day ? area.keys.filter((key) => day[key]).length : 0;
        total += done / area.keys.length;
        return total;
    })];
}

function renderStats(series, possible, names) {
    const grid = document.getElementById('stats');
    grid.replaceChildren();
    for (const { area, data } of series) {
        const score = data[data.length - 1];
        const card = el('div', { class: 'stat-card' });
        const label = el('div', { class: 'stat-label' });
        const dot = el('span', { class: 'dot' });
        dot.style.background = area.color;
        label.append(dot, document.createTextNode(area.name));
        card.append(
            label,
            el('div', { class: 'stat-value' }, `${percent(score, possible)}%`),
            el('div', { class: 'stat-detail' }, `${formatScore(score)} of ${possible} · ${area.keys.map((key) => names[key] || key).join(', ')}`),
        );
        grid.append(card);
    }
}

function renderChart(series, dayMs) {
    const days = dayMs.length;
    const labels = ['Start', ...dayMs.map((ms) => formatDay(ms, { day: 'numeric', month: 'short' }))];
    const titles = ['Start', ...dayMs.map((ms, index) =>
        `Day ${index + 1} · ${formatDay(ms, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`)];
    // Markers on every day stop being readable past a couple of months.
    const pointRadius = days <= 62 ? 4 : 0;

    const datasets = series.map(({ area, data }) => ({
        label: area.name,
        data,
        borderColor: area.color,
        backgroundColor: area.color,
        borderWidth: 2,
        pointRadius,
        pointHoverRadius: 5,
        pointBackgroundColor: area.color,
        pointBorderColor: '#0a0a0a',
        pointBorderWidth: 1.5,
        pointStyle: area.pointStyle,
        tension: 0,
        fill: false,
    }));
    datasets.push({
        label: 'Perfect',
        data: labels.map((_, index) => index),
        borderColor: '#525252',
        backgroundColor: '#525252',
        borderWidth: 1.5,
        borderDash: [5, 5],
        pointRadius: 0,
        pointHoverRadius: 0,
        pointStyle: 'line',
        tension: 0,
        fill: false,
    });

    new Chart(document.getElementById('cumulative-chart'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { size: 12, weight: '500' }, padding: 14, usePointStyle: true, color: TEXT },
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#1f1f1f',
                    borderColor: '#404040',
                    borderWidth: 1,
                    padding: 12,
                    titleColor: '#ffffff',
                    bodyColor: TEXT,
                    usePointStyle: true,
                    callbacks: {
                        title: (items) => titles[items[0].dataIndex],
                        label: (item) => {
                            const possible = item.dataIndex;
                            if (item.dataset.label === 'Perfect') return ` Perfect: ${possible}`;
                            return ` ${item.dataset.label}: ${formatScore(item.parsed.y)} of ${possible} (${percent(item.parsed.y, possible)}%)`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 12, weight: '500' }, color: TEXT, padding: 8, maxRotation: 0, autoSkipPadding: 24 },
                    border: { color: GRID },
                },
                y: {
                    beginAtZero: true,
                    suggestedMax: Math.max(days, 1),
                    grid: { color: GRID, lineWidth: 1 },
                    ticks: { font: { size: 12, weight: '500' }, color: TEXT, padding: 8, precision: 0 },
                    title: { display: true, text: 'Score (1 = a perfect day)', color: TEXT, font: { size: 11, weight: '500' } },
                    border: { color: GRID },
                },
            },
            interaction: { mode: 'index', intersect: false },
        },
    });
}

function render(data) {
    const todayMs = toMs(todayIso());
    const days = data.days.filter((day) => toMs(day.date) <= todayMs);
    const firstMs = days.length ? toMs(days[0].date) : todayMs;
    const byDate = new Map(days.map((day) => [day.date, day]));
    const names = Object.fromEntries(data.habits.map((habit) => [habit.key, habit.name]));

    // Every day since the first entry counts, including days with no card in Notion.
    const dayMs = [];
    for (let ms = firstMs; ms <= todayMs; ms += DAY_MS) dayMs.push(ms);
    const series = AREAS.map((area) => ({ area, data: runningScore(area, dayMs, byDate) }));

    document.getElementById('status').hidden = true;
    document.getElementById('dashboard').hidden = false;
    document.getElementById('range').textContent =
        `since ${formatDay(firstMs, { day: 'numeric', month: 'short', year: 'numeric' })} · ${dayMs.length} ${dayMs.length === 1 ? 'day' : 'days'}`;
    renderStats(series, dayMs.length, names);
    renderChart(series, dayMs);

    if (data.updatedAt) {
        const updated = new Date(data.updatedAt).toLocaleString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        document.getElementById('updated').textContent = `Last change synced ${updated}`;
    }
}

async function init() {
    try {
        const response = await fetch('data/habits.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        render(await response.json());
    } catch (error) {
        console.error('Could not load chart data:', error);
        document.getElementById('status').textContent = 'Could not load the chart data. Try reloading.';
    }
}

init();
