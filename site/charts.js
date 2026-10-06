// Weekly and daily habit charts, with goal scores from the Notion "Goals" database.
// Shared by charts.html (area charts) and habits.html (one chart per habit); each
// page gets the sections whose elements it contains.
//
// A habit's weekly score is the share of the week's days it was done, so it climbs
// through the week. An area's score is the average of its habits.

// `name` must match the Area option in the Goals database.
const AREAS = [
    {
        name: 'Body',
        color: '#3b82f6',
        shades: ['#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'],
        pointStyle: 'circle',
        keys: ['workout', 'nutrition', 'miracleMorning', 'screenTime'],
    },
    {
        name: 'Business',
        color: '#ef4444',
        shades: ['#ef4444', '#f87171', '#fca5a5', '#fee2e2'],
        pointStyle: 'rect',
        keys: ['workBusiness', 'workFocused', 'highAgency', 'screenTime'],
    },
];
const SHARED_COLOR = '#a78bfa'; // habits that count towards more than one area
const WEEKS_IN_OVERVIEW = 12;
const WEEKS_IN_SELECTOR = 6;

const DAY_MS = 86400000;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TEXT = '#a3a3a3';
const GRID = '#262626';

// Days are handled as UTC midnights so daylight-saving shifts can never move a day.
const toMs = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
const mondayOf = (ms) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS;

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

function formatRange(startMs) {
    const format = (ms, options) => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options });
    const endMs = startMs + 6 * DAY_MS;
    const sameMonth = new Date(startMs).getUTCMonth() === new Date(endMs).getUTCMonth();
    const start = format(startMs, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
    return `${start}–${format(endMs, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function buildWeeks(firstMs, todayMs) {
    const weeks = [];
    const currentStart = mondayOf(todayMs);
    for (let startMs = mondayOf(firstMs); startMs <= currentStart; startMs += 7 * DAY_MS) {
        const isCurrent = startMs === currentStart;
        weeks.push({
            startMs,
            number: weeks.length + 1,
            isCurrent,
            // Index of the last day with data: today for the running week, Sunday otherwise.
            lastDay: isCurrent ? (todayMs - startMs) / DAY_MS : 6,
            // The first week only counts the days since tracking began.
            goalDays: 7 - Math.max(0, (firstMs - startMs) / DAY_MS),
        });
    }
    return weeks;
}

// Cumulative % of the week's goal after each day; null for days still to come.
function habitProgress(key, week, byDate) {
    let done = 0;
    return DAY_LABELS.map((_, index) => {
        if (index > week.lastDay) return null;
        if (byDate.get(toIso(week.startMs + index * DAY_MS))?.[key]) done += 1;
        return (done / week.goalDays) * 100;
    });
}

function areaProgress(area, week, byDate) {
    const perHabit = area.keys.map((key) => habitProgress(key, week, byDate));
    return DAY_LABELS.map((_, index) => {
        if (index > week.lastDay) return null;
        return perHabit.reduce((sum, series) => sum + series[index], 0) / perHabit.length;
    });
}

// Average of the scored goals for an area in a week; unscored goals are left out.
function goalScore(area, week, goals) {
    const scores = goals
        .filter((goal) => goal.area === area.name && toMs(goal.weekStart) === week.startMs && goal.score !== null)
        .map((goal) => goal.score);
    return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

// Empty slots draw nothing, so their colour only shows up as the legend swatch.
function barShade(area, score) {
    if (score === null || score === undefined) return area.shades[1];
    if (score >= 100) return area.shades[0];
    if (score >= 80) return area.shades[1];
    if (score >= 50) return area.shades[2];
    return area.shades[3];
}

function lineDataset(area, data) {
    return {
        type: 'line',
        label: `${area.name} habits`,
        data,
        borderColor: area.color,
        backgroundColor: area.color,
        borderWidth: 2,
        pointRadius: 5,
        pointBackgroundColor: area.color,
        pointBorderColor: '#0a0a0a',
        pointBorderWidth: 2,
        pointStyle: area.pointStyle,
        tension: 0.4,
        fill: false,
        order: 0,
    };
}

function barDataset(area, data) {
    return {
        type: 'bar',
        label: `${area.name} goal score`,
        data,
        backgroundColor: (context) => barShade(area, context.raw),
        borderWidth: 0,
        borderRadius: 4,
        pointStyle: 'rectRounded',
        maxBarThickness: 28,
        categoryPercentage: 0.7,
        barPercentage: 0.6,
        order: 1,
    };
}

const tooltipStyle = {
    mode: 'index',
    intersect: false,
    backgroundColor: '#1f1f1f',
    borderColor: '#404040',
    borderWidth: 1,
    padding: 12,
    titleColor: '#ffffff',
    bodyColor: TEXT,
    usePointStyle: true,
};

function percentAxis(max, stepSize, fontSize) {
    return {
        beginAtZero: true,
        max,
        grid: { color: GRID, lineWidth: 1 },
        ticks: {
            stepSize,
            font: { size: fontSize, weight: '500' },
            color: TEXT,
            padding: 8,
            callback: (value) => (value > 100 ? '' : `${value}%`),
        },
        border: { color: GRID },
    };
}

function categoryAxis(fontSize) {
    return {
        grid: { display: false },
        ticks: { font: { size: fontSize, weight: '500' }, color: TEXT, padding: 8 },
        border: { color: GRID },
    };
}

const goalLine = {
    id: 'goalLine',
    afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const y = scales.y.getPixelForValue(80);
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('80% Goal', chartArea.right - 8, y - 6);
        ctx.restore();
    },
};

function comboChart(canvas, labels, datasets, titles) {
    return new Chart(canvas, {
        type: 'bar',
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
                    ...tooltipStyle,
                    filter: (item) => item.parsed.y !== null,
                    callbacks: {
                        title: (items) => titles[items[0].dataIndex],
                        label: (item) => ` ${item.dataset.label}: ${Math.round(item.parsed.y)}%`,
                    },
                },
            },
            // Headroom above 100% keeps the top points and their outline from clipping.
            scales: { x: categoryAxis(12), y: percentAxis(110, 20, 12) },
            interaction: { mode: 'index', intersect: false },
        },
        plugins: [goalLine],
    });
}

function renderWeekly(state) {
    const weeks = state.weeks.slice(-WEEKS_IN_OVERVIEW);
    const datasets = [];
    for (const area of AREAS) {
        datasets.push(lineDataset(area, weeks.map((week) => areaProgress(area, week, state.byDate)[week.lastDay])));
    }
    for (const area of AREAS) {
        datasets.push(barDataset(area, weeks.map((week) => goalScore(area, week, state.goals))));
    }
    comboChart(
        document.getElementById('weekly-chart'),
        weeks.map((week) => `Week ${week.number}`),
        datasets,
        weeks.map((week) => `Week ${week.number} · ${formatRange(week.startMs)}${week.isCurrent ? ' (so far)' : ''}`),
    );
}

let dailyChart = null;
let habitCharts = [];

function renderDaily(state, week) {
    const datasets = [];
    for (const area of AREAS) datasets.push(lineDataset(area, areaProgress(area, week, state.byDate)));
    // The week's goal score sits on Sunday, the day the week is judged.
    for (const area of AREAS) {
        const bars = new Array(7).fill(null);
        bars[6] = goalScore(area, week, state.goals);
        datasets.push(barDataset(area, bars));
    }

    if (dailyChart) dailyChart.destroy();
    dailyChart = comboChart(
        document.getElementById('daily-chart'),
        DAY_LABELS,
        datasets,
        DAY_LABELS.map((_, index) => new Date(week.startMs + index * DAY_MS).toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC',
        })),
    );

    document.getElementById('week-range').textContent = formatRange(week.startMs);

    const list = document.getElementById('goal-list');
    list.replaceChildren();
    for (const goal of state.goals.filter((item) => toMs(item.weekStart) === week.startMs)) {
        const area = AREAS.find((item) => item.name === goal.area);
        const item = el('li');
        const dot = el('span', { class: 'dot' });
        dot.style.background = area ? area.color : TEXT;
        item.append(dot, document.createTextNode(`${goal.name || 'Untitled goal'} `),
            el('strong', {}, goal.score === null ? 'not scored' : `${goal.score}`));
        list.append(item);
    }
}

function habitColor(key) {
    const areas = AREAS.filter((area) => area.keys.includes(key));
    return areas.length === 1 ? areas[0].color : SHARED_COLOR;
}

function renderHabits(state, week) {
    habitCharts.forEach((chart) => chart.destroy());
    habitCharts = [];
    const grid = document.getElementById('habits-grid');
    grid.replaceChildren();
    document.getElementById('week-range').textContent = formatRange(week.startMs);

    const keys = [...new Set(AREAS.flatMap((area) => area.keys))];
    for (const key of keys) {
        const color = habitColor(key);
        const progress = habitProgress(key, week, state.byDate);
        const done = Math.round((progress[week.lastDay] / 100) * week.goalDays);
        const areas = AREAS.filter((area) => area.keys.includes(key)).map((area) => area.name).join(' + ');

        const card = el('div', { class: 'task-card' });
        const title = el('div', { class: 'task-card-title' });
        const dot = el('span', { class: 'dot' });
        dot.style.background = color;
        title.append(dot, document.createTextNode(state.names[key] || key));
        const wrapper = el('div', { class: 'task-chart-wrapper' });
        const canvas = el('canvas');
        wrapper.append(canvas);
        card.append(title, el('div', { class: 'task-frequency' },
            `${areas} · ${done} of ${week.goalDays} days done`), wrapper);
        grid.append(card);

        habitCharts.push(new Chart(canvas, {
            type: 'line',
            data: {
                labels: DAY_LABELS,
                datasets: [
                    {
                        label: 'Progress',
                        data: progress,
                        borderColor: color,
                        backgroundColor: color,
                        borderWidth: 2,
                        pointRadius: 4,
                        pointBackgroundColor: color,
                        pointBorderColor: '#0a0a0a',
                        pointBorderWidth: 1.5,
                        tension: 0.4,
                        fill: false,
                    },
                    {
                        label: 'Goal',
                        data: DAY_LABELS.map(() => 100),
                        borderColor: '#525252',
                        borderWidth: 1.5,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        fill: false,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipStyle,
                        padding: 10,
                        filter: (item) => item.datasetIndex === 0 && item.parsed.y !== null,
                        callbacks: { label: (item) => ` ${Math.round(item.parsed.y)}% of the week's goal` },
                    },
                },
                scales: { x: categoryAxis(10), y: percentAxis(110, 25, 10) },
                interaction: { mode: 'index', intersect: false },
            },
        }));
    }
}

function renderWeekSelector(state) {
    const selector = document.getElementById('week-selector');
    const select = (week, button) => {
        selector.querySelectorAll('.week-btn').forEach((other) => other.classList.remove('active'));
        button.classList.add('active');
        if (document.getElementById('daily-chart')) renderDaily(state, week);
        if (document.getElementById('habits-grid')) renderHabits(state, week);
    };

    let latest = null;
    for (const week of state.weeks.slice(-WEEKS_IN_SELECTOR)) {
        const button = el('button', { class: 'week-btn', type: 'button', title: formatRange(week.startMs) }, `Week ${week.number}`);
        button.addEventListener('click', () => select(week, button));
        selector.append(button);
        latest = { week, button };
    }
    select(latest.week, latest.button);
}

function render(data) {
    const todayMs = toMs(todayIso());
    const days = data.days.filter((day) => toMs(day.date) <= todayMs);
    const firstMs = days.length ? toMs(days[0].date) : todayMs;
    const state = {
        byDate: new Map(days.map((day) => [day.date, day])),
        names: Object.fromEntries(data.habits.map((habit) => [habit.key, habit.name])),
        goals: data.goals || [],
        weeks: buildWeeks(firstMs, todayMs),
    };

    document.getElementById('status').hidden = true;
    document.getElementById('dashboard').hidden = false;
    if (document.getElementById('weekly-chart')) renderWeekly(state);
    renderWeekSelector(state);

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
