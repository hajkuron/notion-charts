// GitHub-style contribution calendars for the habit data in data/habits.json.

const GREEN = ['#0e4429', '#006d32', '#26a641', '#39d353'];
const BLUE = ['#0a3069', '#0d4a6e', '#0969da', '#54aeff'];
const ORANGE = ['#3d1e00', '#7a2e00', '#bd4b00', '#fb8f44'];

// `colors` runs from the lowest filled level to the highest (all habits of the chart done).
const CHARTS = [
    { title: 'Workout & Nutrition', keys: ['workout', 'nutrition'], colors: [GREEN[1], GREEN[3]] },
    { title: 'Work Business', keys: ['workBusiness'], colors: [BLUE[3]] },
    { title: 'Miracle Morning', keys: ['miracleMorning'], colors: [ORANGE[3]] },
];

const CELL = 11;
const STEP = 15; // cell + 4px gutter
const MONTH_GAP = 10;
const LABEL_WIDTH = 24;
const TOP = 22;
const VISIBLE_MONTHS = 4;
// Four consecutive months never span more than 22 week columns; sizing for that keeps
// squares one size whichever months are showing.
const MAX_COLUMNS = 22;
const VIEW_WIDTH = LABEL_WIDTH + MAX_COLUMNS * STEP - VISIBLE_MONTHS * (STEP - CELL) + (VISIBLE_MONTHS - 1) * MONTH_GAP;
const MONTHS_AHEAD = 11; // how far "Next" may page past the current month
const DAY_MS = 86400000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Days are handled as UTC midnights so daylight-saving shifts can never move a cell.
const toMs = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
// Months are counted from year 0 so paging is plain integer arithmetic.
const monthIndex = (ms) => new Date(ms).getUTCFullYear() * 12 + new Date(ms).getUTCMonth();

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
    return new Date(toMs(iso)).toLocaleDateString('en-US', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
}

// Each month is its own block of week columns, Monday on top.
function monthLayout(index) {
    const year = Math.floor(index / 12);
    const month = index % 12;
    const firstMs = Date.UTC(year, month, 1);
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const lead = (new Date(firstMs).getUTCDay() + 6) % 7;
    return { year, month, firstMs, days, lead, columns: Math.ceil((lead + days) / 7) };
}

const monthWidth = (layout) => layout.columns * STEP - (STEP - CELL);

function computeStats(chart, context) {
    let tracked = 0;
    let completed = 0;
    let best = 0;
    let run = 0;
    let current = 0;
    for (let ms = context.firstMs; ms <= context.todayMs; ms += DAY_MS) {
        const day = context.byDate.get(toIso(ms));
        const complete = !!day && chart.keys.every((key) => day[key]);
        tracked += 1;
        if (complete) {
            completed += 1;
            run += 1;
            best = Math.max(best, run);
            current = run;
        } else {
            // An unfinished today does not break a streak that ran through yesterday.
            if (ms !== context.todayMs) current = 0;
            run = 0;
        }
    }
    return { tracked, completed, best, current };
}

function renderCalendar(chart, context, startIndex) {
    const layouts = [];
    let width = LABEL_WIDTH;
    for (let i = 0; i < VISIBLE_MONTHS; i += 1) {
        const layout = monthLayout(startIndex + i);
        layout.x = width + (i ? MONTH_GAP : 0);
        width = layout.x + monthWidth(layout);
        layouts.push(layout);
    }
    const height = TOP + 7 * STEP - (STEP - CELL);
    const svg = svgEl('svg', {
        class: 'calendar',
        viewBox: `0 0 ${VIEW_WIDTH + 1} ${height + 1}`,
        role: 'img',
        'aria-label': `${chart.title}: one square per day. Details are in the table below.`,
    });

    ['M', 'W', 'F'].forEach((label, index) => {
        svg.append(svgEl('text', { x: 0, y: TOP + index * 2 * STEP + CELL - 2 }, label));
    });

    for (const layout of layouts) {
        const label = layout.month === 0 ? `Jan ${layout.year}` : MONTHS[layout.month];
        svg.append(svgEl('text', { x: layout.x, y: 11 }, label));

        for (let d = 0; d < layout.days; d += 1) {
            const ms = layout.firstMs + d * DAY_MS;
            const iso = toIso(ms);
            const slot = layout.lead + d;
            const tracked = ms >= context.firstMs && ms <= context.todayMs;
            const day = context.byDate.get(iso);
            const done = day ? chart.keys.filter((key) => day[key]).length : 0;
            const rect = svgEl('rect', {
                class: `cell${tracked ? '' : ' untracked'}${ms === context.todayMs ? ' today' : ''}`,
                x: layout.x + Math.floor(slot / 7) * STEP + 0.5,
                y: TOP + (slot % 7) * STEP + 0.5,
                width: CELL,
                height: CELL,
                rx: 2,
                'data-date': iso,
            });
            if (tracked && done > 0) rect.style.fill = chart.colors[done - 1];
            svg.append(rect);
        }
    }
    return svg;
}

function renderLegend(chart) {
    const legend = el('div', { class: 'legend-container' });
    legend.append(el('span', {}, 'Less'));
    const swatches = el('span', { class: 'legend-swatches' });
    swatches.append(el('span', { class: 'swatch' }));
    for (const color of chart.colors) {
        const swatch = el('span', { class: 'swatch' });
        swatch.style.background = color;
        swatches.append(swatch);
    }
    legend.append(swatches, el('span', {}, 'More'));
    return legend;
}

function renderChart(chart, context) {
    const card = el('section', { class: 'calendar-container' });
    const stats = computeStats(chart, context);

    const header = el('div', { class: 'calendar-header' });
    header.append(el('h2', {}, chart.title));
    header.append(el('p', { class: 'stats' },
        `Streak ${stats.current} · Best ${stats.best} · Done ${stats.completed}/${stats.tracked}`));

    const body = el('div', { class: 'calendar-body' });

    const previous = el('button', { class: 'button', type: 'button' }, '← Previous');
    const next = el('button', { class: 'button', type: 'button' }, 'Next →');
    const buttons = el('div', { class: 'button-container' });
    buttons.append(previous, next);
    const footer = el('div', { class: 'button-legend-container' });
    footer.append(buttons, renderLegend(chart));

    card.append(header, body, footer);

    const firstIndex = monthIndex(context.firstMs);
    const todayIndex = monthIndex(context.todayMs);
    // Begin at the first tracked month, or later if needed to keep today in view.
    let start = Math.max(firstIndex, todayIndex - VISIBLE_MONTHS + 1);

    const draw = () => {
        hideTooltip();
        body.replaceChildren(renderCalendar(chart, context, start));
        previous.disabled = start <= firstIndex;
        next.disabled = start + VISIBLE_MONTHS - 1 >= todayIndex + MONTHS_AHEAD;
    };

    previous.addEventListener('click', () => { start -= 1; draw(); });
    next.addEventListener('click', () => { start += 1; draw(); });
    draw();
    attachTooltip(body, chart, context);
    return card;
}

const tooltip = document.getElementById('tooltip');
let activeCell = null;

function hideTooltip() {
    activeCell = null;
    tooltip.hidden = true;
}

function showTooltip(cell, chart, context) {
    if (cell === activeCell) return;
    activeCell = cell;

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

function attachTooltip(body, chart, context) {
    const handle = (event) => {
        const cell = event.target.closest('.cell');
        if (cell) showTooltip(cell, chart, context);
        else hideTooltip();
    };
    body.addEventListener('pointermove', handle);
    body.addEventListener('pointerdown', handle);
    body.addEventListener('pointerleave', (event) => {
        // On touch the tooltip stays until the next tap elsewhere.
        if (event.pointerType === 'mouse') hideTooltip();
    });
}

document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.calendar')) hideTooltip();
});
window.addEventListener('scroll', hideTooltip, true);

function renderTable(days, context) {
    const keys = [...new Set(CHARTS.flatMap((chart) => chart.keys))];
    const table = document.getElementById('table');
    const head = el('tr');
    head.append(el('th', {}, 'Date'));
    for (const key of keys) head.append(el('th', {}, context.names[key] || key));
    const thead = el('thead');
    thead.append(head);

    const tbody = el('tbody');
    for (const day of [...days].reverse()) {
        const row = el('tr');
        row.append(el('td', {}, formatDate(day.date)));
        for (const key of keys) row.append(el('td', {}, day[key] ? 'Done' : 'Not done'));
        tbody.append(row);
    }
    table.replaceChildren(thead, tbody);
    document.getElementById('table-view').hidden = days.length === 0;
}

function render(data) {
    const todayMs = toMs(todayIso());
    const days = data.days.filter((day) => toMs(day.date) <= todayMs);
    const context = {
        byDate: new Map(days.map((day) => [day.date, day])),
        names: Object.fromEntries(data.habits.map((habit) => [habit.key, habit.name])),
        firstMs: days.length ? toMs(days[0].date) : todayMs,
        todayMs,
    };

    const container = document.getElementById('charts');
    container.replaceChildren(...CHARTS.map((chart) => renderChart(chart, context)));
    renderTable(days, context);

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
