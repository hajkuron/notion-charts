// GitHub-style contribution heatmaps for the habit data in data/habits.json.

const CHARTS = [
    { title: 'Workout & nutrition', keys: ['workout', 'nutrition'], hue: 'green' },
    { title: 'Work business', keys: ['workBusiness'], hue: 'blue' },
    { title: 'Miracle morning', keys: ['miracleMorning'], hue: 'orange' },
];

const WEEKS = 53;
const CELL = 11;
const STEP = 14;
const LEFT = 28;
const TOP = 16;
const DAY_MS = 86400000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Days are handled as UTC midnights so daylight-saving shifts can never move a cell.
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

function svgEl(tag, attributes = {}, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
}

function formatDate(iso) {
    return new Date(toMs(iso)).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
}

// The year shown starts at the first tracked week and fills left to right.
// Once there is more than a year of history it becomes the latest 53 weeks.
function chartWindow(firstMs, todayMs) {
    let start = mondayOf(firstMs);
    if (todayMs > start + WEEKS * 7 * DAY_MS - DAY_MS) {
        start = mondayOf(todayMs) - (WEEKS - 1) * 7 * DAY_MS;
    }
    return start;
}

function levelClass(done, total) {
    if (done === 0) return 'level-none';
    return done === total ? 'level-full' : 'level-half';
}

function computeStats(chart, byDate, firstMs, todayMs) {
    let tracked = 0;
    let completed = 0;
    let best = 0;
    let run = 0;
    let current = 0;
    for (let ms = firstMs; ms <= todayMs; ms += DAY_MS) {
        const day = byDate.get(toIso(ms));
        const complete = !!day && chart.keys.every((key) => day[key]);
        tracked += 1;
        if (complete) {
            completed += 1;
            run += 1;
            best = Math.max(best, run);
            current = run;
        } else {
            // An unfinished today does not break a streak that ran through yesterday.
            if (ms !== todayMs) current = 0;
            run = 0;
        }
    }
    return { tracked, completed, best, current };
}

function renderStats(stats) {
    const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
    const list = el('dl', { class: 'stats' });
    const items = [
        ['Current streak', days(stats.current)],
        ['Best streak', days(stats.best)],
        ['Completed', `${stats.completed} / ${stats.tracked}`],
    ];
    for (const [label, value] of items) {
        const item = el('div', { class: 'stat' });
        item.append(el('dt', {}, label), el('dd', {}, value));
        list.append(item);
    }
    return list;
}

function renderLegend(chart) {
    const levels = chart.keys.length > 1
        ? [['level-none', 'None'], ['level-half', '1 of 2'], ['level-full', 'Both']]
        : [['level-none', 'Missed'], ['level-full', 'Done']];
    const list = el('ul', { class: 'legend' });
    for (const [className, label] of levels) {
        const item = el('li');
        item.append(el('span', { class: `swatch ${className}` }), document.createTextNode(label));
        list.append(item);
    }
    return list;
}

function renderHeatmap(chart, context) {
    const { byDate, firstMs, todayMs, startMs } = context;
    const width = LEFT + WEEKS * STEP;
    const height = TOP + 7 * STEP;
    const svg = svgEl('svg', {
        class: 'heatmap',
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': `${chart.title}: one square per day. Details are in the table below.`,
    });

    ['Mon', 'Wed', 'Fri'].forEach((label, index) => {
        svg.append(svgEl('text', { x: 0, y: TOP + index * 2 * STEP + CELL - 2 }, label));
    });

    // A month is labelled on the first column that contains its 1st.
    const monthOfColumn = (week) => new Date(startMs + week * 7 * DAY_MS + 6 * DAY_MS);
    let lastLabelWeek = -4;
    for (let week = 0; week < WEEKS; week += 1) {
        const date = monthOfColumn(week);
        const startsMonth = week === 0 || date.getUTCMonth() !== monthOfColumn(week - 1).getUTCMonth();
        if (!startsMonth || week - lastLabelWeek < 3 || week > WEEKS - 2) continue;
        // The first column may be the tail of the previous month; label it only if it has room.
        if (week === 0 && monthOfColumn(2).getUTCMonth() !== date.getUTCMonth()) continue;
        const month = date.getUTCMonth();
        const label = month === 0 ? `Jan ${date.getUTCFullYear()}` : MONTHS[month];
        svg.append(svgEl('text', { x: LEFT + week * STEP, y: 9 }, label));
        lastLabelWeek = week;
    }

    for (let week = 0; week < WEEKS; week += 1) {
        for (let weekday = 0; weekday < 7; weekday += 1) {
            const ms = startMs + (week * 7 + weekday) * DAY_MS;
            const iso = toIso(ms);
            const tracked = ms >= firstMs && ms <= todayMs;
            const day = byDate.get(iso);
            const done = day ? chart.keys.filter((key) => day[key]).length : 0;
            const classes = ['cell', tracked ? levelClass(done, chart.keys.length) : 'untracked'];
            if (ms === todayMs) classes.push('today');
            svg.append(svgEl('rect', {
                class: classes.join(' '),
                x: LEFT + week * STEP + 1,
                y: TOP + weekday * STEP + 1,
                width: CELL,
                height: CELL,
                rx: 2.5,
                'data-date': iso,
            }));
        }
    }
    return svg;
}

function renderChart(chart, context) {
    const card = el('section', { class: `card hue-${chart.hue}` });

    const header = el('div', { class: 'card-header' });
    header.append(el('h2', {}, chart.title));
    header.append(renderStats(computeStats(chart, context.byDate, context.firstMs, context.todayMs)));

    const scroll = el('div', { class: 'heatmap-scroll' });
    const svg = renderHeatmap(chart, context);
    scroll.append(svg);

    const footer = el('div', { class: 'card-footer' });
    footer.append(renderLegend(chart));

    card.append(header, scroll, footer);
    attachTooltip(svg, chart, context);
    return { card, scroll };
}

const tooltip = document.getElementById('tooltip');
let activeCell = null;

function hideTooltip() {
    if (activeCell) activeCell.classList.remove('active');
    activeCell = null;
    tooltip.hidden = true;
}

function showTooltip(cell, chart, context) {
    if (cell === activeCell) return;
    hideTooltip();
    activeCell = cell;
    cell.classList.add('active');

    const iso = cell.dataset.date;
    const ms = toMs(iso);
    tooltip.replaceChildren();
    tooltip.append(el('div', { class: 'tooltip-date' }, formatDate(iso) + (ms === context.todayMs ? ' · Today' : '')));

    if (ms > context.todayMs) {
        tooltip.append(el('div', { class: 'tooltip-note' }, 'Still to come'));
    } else if (ms < context.firstMs) {
        tooltip.append(el('div', { class: 'tooltip-note' }, 'Before tracking started'));
    } else {
        const day = context.byDate.get(iso);
        const rows = el('ul', { class: 'tooltip-rows' });
        for (const key of chart.keys) {
            const done = !!day && day[key];
            const row = el('li', done ? {} : { class: 'missed' });
            row.append(el('span', {}, context.names[key] || key), el('span', {}, done ? 'Done' : 'Not done'));
            rows.append(row);
        }
        tooltip.append(rows);
    }

    tooltip.hidden = false;
    const box = cell.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const left = Math.min(Math.max(8, box.left + box.width / 2 - tip.width / 2), window.innerWidth - tip.width - 8);
    const above = box.top - tip.height - 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${above >= 8 ? above : box.bottom + 8}px`;
}

function attachTooltip(svg, chart, context) {
    const handle = (event) => {
        const cell = event.target.closest('.cell');
        if (cell) showTooltip(cell, chart, context);
        else hideTooltip();
    };
    svg.addEventListener('pointermove', handle);
    svg.addEventListener('pointerdown', handle);
    svg.addEventListener('pointerleave', (event) => {
        // On touch the tooltip stays until the next tap elsewhere.
        if (event.pointerType === 'mouse') hideTooltip();
    });
}

document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.heatmap')) hideTooltip();
});
window.addEventListener('scroll', hideTooltip, true);

function renderTable(data, context) {
    const keys = [...new Set(CHARTS.flatMap((chart) => chart.keys))];
    const table = document.getElementById('table');
    const head = el('tr');
    head.append(el('th', {}, 'Date'));
    for (const key of keys) head.append(el('th', {}, context.names[key] || key));
    const thead = el('thead');
    thead.append(head);

    const tbody = el('tbody');
    for (const day of [...data.days].reverse()) {
        const row = el('tr');
        row.append(el('td', {}, formatDate(day.date)));
        for (const key of keys) row.append(el('td', {}, day[key] ? 'Done' : 'Not done'));
        tbody.append(row);
    }
    table.replaceChildren(thead, tbody);
    document.getElementById('table-view').hidden = data.days.length === 0;
}

function render(data) {
    const todayMs = toMs(todayIso());
    const days = data.days.filter((day) => toMs(day.date) <= todayMs);
    const firstMs = days.length ? toMs(days[0].date) : todayMs;
    const context = {
        byDate: new Map(days.map((day) => [day.date, day])),
        names: Object.fromEntries(data.habits.map((habit) => [habit.key, habit.name])),
        firstMs,
        todayMs,
        startMs: chartWindow(firstMs, todayMs),
    };

    const container = document.getElementById('charts');
    container.replaceChildren();
    const todayColumn = Math.floor((todayMs - context.startMs) / (7 * DAY_MS));
    for (const chart of CHARTS) {
        const { card, scroll } = renderChart(chart, context);
        container.append(card);
        // On narrow screens the chart scrolls sideways; scroll only as far as needed to show today.
        const scale = scroll.scrollWidth / (LEFT + WEEKS * STEP);
        scroll.scrollLeft = Math.max(0, (LEFT + (todayColumn + 3) * STEP) * scale - scroll.clientWidth);
    }

    renderTable({ days }, context);

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
        console.error('Could not load habit data:', error);
        document.getElementById('status').textContent = 'Could not load the habit data. Try reloading.';
    }
}

init();
