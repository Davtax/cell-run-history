'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const {
  RunHistory,
  formatDateTime,
  formatDuration,
  formatTime,
  jupyterTiming,
  lastExecutedText,
  parseJupyterTiming,
  tooltipMarkdown,
} = require('./history');

const summary = (order, start, end, success = true) => ({ executionOrder: order, success, timing: { startTime: start, endTime: end } });

// Timing written by JupyterLab in dev/ThreeLevelSystem.ipynb.
const JUPYTERLAB_EXECUTION = {
  'iopub.execute_input': '2026-10-01T10:41:20.132354Z',
  'iopub.status.busy': '2026-10-01T10:41:20.131981Z',
  'iopub.status.idle': '2026-10-01T10:41:20.571254Z',
  'shell.execute_reply': '2026-10-01T10:41:20.570796Z',
  'shell.execute_reply.started': '2026-10-01T10:41:20.132339Z',
};

// ---------------------------------------------------------------------------------------------------------------------
// history.js
// ---------------------------------------------------------------------------------------------------------------------

test('keeps the newest runs first, up to maxRuns', () => {
  const h = new RunHistory(3);
  for (let i = 1; i <= 5; i++) assert.ok(h.record('c', summary(i, i * 1000, i * 1000 + 10)));
  assert.deepStrictEqual(h.get('c').map((r) => r.order), [5, 4, 3]);
});

test('a finishing run updates the running entry instead of adding one', () => {
  const h = new RunHistory();
  h.record('c', { executionOrder: 1, timing: { startTime: 100 } });
  assert.strictEqual(h.get('c')[0].end, undefined);
  assert.ok(h.record('c', summary(1, 100, 350)));
  assert.strictEqual(h.get('c').length, 1);
  assert.strictEqual(h.get('c')[0].end, 350);
  assert.strictEqual(h.record('c', summary(1, 100, 350)), false, 'identical summary is not a change');
});

test('ignores summaries without timing and replayed older runs', () => {
  const h = new RunHistory();
  assert.strictEqual(h.record('c', undefined), false);
  assert.strictEqual(h.record('c', { executionOrder: 1 }), false);
  h.record('c', summary(2, 2000, 2100));
  assert.strictEqual(h.record('c', summary(1, 1000, 1100)), false);
  assert.deepStrictEqual(h.get('c').map((r) => r.order), [2]);
});

test('setMaxRuns trims existing histories', () => {
  const h = new RunHistory(5);
  for (let i = 1; i <= 5; i++) h.record('c', summary(i, i, i + 1));
  h.setMaxRuns(2);
  assert.deepStrictEqual(h.get('c').map((r) => r.order), [5, 4]);
});

test('formats durations in ms below 0.1 s, then s, m and h', () => {
  assert.strictEqual(formatDuration(15.2), '15ms');
  assert.strictEqual(formatDuration(99.4), '99ms');
  assert.strictEqual(formatDuration(100), '0.10s');
  assert.strictEqual(formatDuration(1234.6), '1.23s');
  assert.strictEqual(formatDuration(59994), '59.99s');
  assert.strictEqual(formatDuration(125300), '2m 5.3s');
  assert.strictEqual(formatDuration(3723000), '1h 2m 3s');
  const t = new Date(2026, 9, 1, 14, 5, 9).getTime();
  assert.strictEqual(formatDateTime(t), '2026-10-01 14:05:09');
  assert.strictEqual(formatTime(t, t), '14:05:09');
  assert.strictEqual(formatTime(t, t + 86400000 * 2), '2026-10-01 14:05:09');
});

test('status bar text matches JupyterLab', () => {
  const t = new Date(2026, 9, 1, 12, 41, 21).getTime();
  assert.strictEqual(lastExecutedText({ start: t, end: t + 15 }), 'Last executed at 2026-10-01 12:41:21 in 15ms');
  assert.strictEqual(lastExecutedText({ start: t }), 'Last executed at 2026-10-01 12:41:21');
});

test('parses the timing saved by JupyterLab', () => {
  const timing = parseJupyterTiming(JUPYTERLAB_EXECUTION);
  assert.strictEqual(timing.startTime, Date.UTC(2026, 9, 1, 10, 41, 20, 132));
  assert.strictEqual(timing.endTime, Date.UTC(2026, 9, 1, 10, 41, 20, 570));
  assert.strictEqual(parseJupyterTiming({ 'iopub.status.busy': JUPYTERLAB_EXECUTION['iopub.status.busy'], 'iopub.status.idle': JUPYTERLAB_EXECUTION['iopub.status.idle'] }).endTime, Date.UTC(2026, 9, 1, 10, 41, 20, 571));
  for (const bad of [undefined, null, 'x', {}, { 'iopub.execute_input': 'nope', 'shell.execute_reply': 'nope' }, { 'iopub.execute_input': '2026-10-01T10:00:01Z', 'shell.execute_reply': '2026-10-01T10:00:00Z' }]) {
    assert.strictEqual(parseJupyterTiming(bad), undefined, JSON.stringify(bad));
  }
});

test('written timing round-trips and uses the JupyterLab keys', () => {
  const start = Date.UTC(2026, 9, 1, 10, 41, 20, 132);
  const written = jupyterTiming(start, start + 438);
  assert.deepStrictEqual(Object.keys(written).sort(), Object.keys(JUPYTERLAB_EXECUTION).sort());
  assert.strictEqual(written['iopub.execute_input'], '2026-10-01T10:41:20.132Z');
  assert.deepStrictEqual(parseJupyterTiming(written), { startTime: start, endTime: start + 438 });
});

test('tooltip is a markdown table, newest first, with status marks', () => {
  const t = new Date(2026, 9, 1, 14, 0, 0).getTime();
  const md = tooltipMarkdown([
    { order: 3, start: t + 2000, end: undefined },
    { order: 2, start: t + 1000, end: t + 1500, success: false },
    { order: 1, start: t, end: t + 2500, success: true },
  ], t);
  const rows = md.split('\n');
  assert.strictEqual(rows[0], '**Last 3 runs**');
  assert.strictEqual(rows[4], '| [3] | 14:00:02 | running… |  |');
  assert.strictEqual(rows[5], '| [2] | 14:00:01 | 0.50s | ✗ |');
  assert.strictEqual(rows[6], '| [1] | 14:00:00 | 2.50s | ✓ |');
});

// ---------------------------------------------------------------------------------------------------------------------
// extension.js against a fake vscode API
// ---------------------------------------------------------------------------------------------------------------------

function loadExtension({ notebooks = [], settings = {} } = {}) {
  const listeners = {};
  const applied = [];
  const config = { maxRuns: 5, recordTiming: true, ...settings };
  let provider;
  class EventEmitter {
    constructor() { this.handlers = []; this.event = (h) => this.handlers.push(h); }
    fire() { this.handlers.forEach((h) => h()); }
    dispose() {}
  }
  const on = (name) => (handler) => { listeners[name] = handler; return { dispose() {} }; };
  const fakeVscode = {
    EventEmitter,
    NotebookCellStatusBarAlignment: { Left: 1, Right: 2 },
    NotebookCellStatusBarItem: class { constructor(text, alignment) { this.text = text; this.alignment = alignment; } },
    NotebookEdit: { updateCellMetadata: (index, metadata) => ({ index, metadata }) },
    WorkspaceEdit: class { set(uri, edits) { this.uri = uri; this.edits = edits; } },
    workspace: {
      notebookDocuments: notebooks,
      getConfiguration: () => ({ get: (key, fallback) => config[key] ?? fallback }),
      onDidOpenNotebookDocument: on('open'),
      onDidChangeNotebookDocument: on('change'),
      onDidChangeConfiguration: on('config'),
      applyEdit: async (edit) => {
        applied.push(edit);
        for (const { index, metadata } of edit.edits) {
          const notebook = notebooks.find((nb) => nb.uri === edit.uri);
          notebook.getCells()[index].metadata = metadata;
        }
        return true;
      },
    },
    notebooks: {
      registerNotebookCellStatusBarItemProvider: (type, p) => { assert.strictEqual(type, 'jupyter-notebook'); provider = p; return { dispose() {} }; },
    },
  };
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) { return request === 'vscode' ? fakeVscode : originalLoad.call(this, request, ...rest); };
  try {
    delete require.cache[require.resolve('./extension')];
    require('./extension').activate({ subscriptions: [] });
  } finally {
    Module._load = originalLoad;
  }
  return { listeners, applied, config, provider: () => provider };
}

function makeNotebook(cellsMetadata, notebookType = 'jupyter-notebook') {
  const notebook = { uri: `file:///${notebookType}.ipynb`, notebookType };
  const cells = cellsMetadata.map((metadata, index) => ({
    index,
    notebook,
    metadata,
    executionSummary: metadata.execution_count ? { executionOrder: metadata.execution_count } : undefined,
    document: { uri: { toString: () => `${notebook.uri}#cell-${index}` } },
  }));
  notebook.getCells = () => cells;
  return notebook;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Status items of a cell: { separator, item } (separator undefined when not shown). */
function statusItems(ext, cell) {
  const items = ext.provider().provideCellStatusBarItems(cell);
  const separator = items.find((i) => i.text === '│');
  const item = items.find((i) => i.text !== '│');
  if (separator) {
    assert.ok(separator.priority > item.priority, 'separator is left of the status');
    assert.strictEqual(separator.tooltip, undefined);
  }
  return { separator, item, count: items.length };
}

test('a cell shows its saved timing, keeps the previous run while running, then the new run', async () => {
  const notebook = makeNotebook([
    { execution_count: 5, metadata: { execution: JUPYTERLAB_EXECUTION } },
    { execution_count: null, metadata: {} },
  ]);
  const ext = loadExtension({ notebooks: [notebook] });
  const [saved, fresh] = notebook.getCells();

  const { item, separator } = statusItems(ext, saved);
  assert.strictEqual(separator, undefined, 'no bar before VS Code shows its own state (earlier session)');
  assert.strictEqual(item.text, lastExecutedText({ start: Date.UTC(2026, 9, 1, 10, 41, 20, 132), end: Date.UTC(2026, 9, 1, 10, 41, 20, 570) }));
  assert.match(item.text, /^Last executed at 2026-10-01 \d\d:41:20 in 0\.44s$/);
  assert.match(item.tooltip.value, /\| \[5\] \| .* \| 0\.44s \|/);
  assert.deepStrictEqual(ext.provider().provideCellStatusBarItems(fresh), [], 'never-run cell has no item');

  // Run the saved cell in this session. While it runs VS Code reports no timing (only start and end together).
  const start = Date.now();
  saved.executionSummary = { executionOrder: undefined, success: undefined, timing: undefined };
  ext.listeners.change({ notebook, cellChanges: [{ cell: saved, executionSummary: saved.executionSummary }] });
  const running = statusItems(ext, saved);
  assert.strictEqual(running.item.text, item.text, 'previous run shown while running');
  assert.ok(running.separator, 'bar shown next to the VS Code spinner');
  saved.executionSummary = summary(6, start, start + 1234);
  ext.listeners.change({ notebook, cellChanges: [{ cell: saved, executionSummary: saved.executionSummary }] });
  await tick();

  const { item: after, separator: afterSeparator } = statusItems(ext, saved);
  assert.ok(afterSeparator, 'bar shown next to the VS Code check mark and timer');
  assert.strictEqual(after.text, lastExecutedText({ start, end: start + 1234 }));
  assert.match(after.text, / in 1\.23s$/);
  assert.deepStrictEqual([...after.tooltip.value.matchAll(/\| \[(\d+)\] \|/g)].map((m) => Number(m[1])), [6, 5]);

  // The finished run was saved once, in JupyterLab's format, keeping the other metadata.
  assert.strictEqual(ext.applied.length, 1);
  assert.strictEqual(saved.metadata.execution_count, 5);
  assert.deepStrictEqual(parseJupyterTiming(saved.metadata.metadata.execution), { startTime: start, endTime: start + 1234 });

  // The metadata change event (no execution summary) must not save again.
  ext.listeners.change({ notebook, cellChanges: [{ cell: saved, executionSummary: undefined }] });
  await tick();
  assert.strictEqual(ext.applied.length, 1);
});

test('keeps the newest runs per cell and follows maxRuns', async () => {
  const notebook = makeNotebook([{ execution_count: null, metadata: {} }]);
  const ext = loadExtension({ notebooks: [notebook] });
  const [cell] = notebook.getCells();
  let refreshes = 0;
  ext.provider().onDidChangeCellStatusBarItems(() => refreshes++);

  const base = Date.now();
  for (let i = 1; i <= 7; i++) {
    cell.executionSummary = { executionOrder: i, timing: { startTime: base + i * 1000 } };
    ext.listeners.change({ notebook, cellChanges: [{ cell, executionSummary: cell.executionSummary }] });
    cell.executionSummary = summary(i, base + i * 1000, base + i * 1000 + 250);
    ext.listeners.change({ notebook, cellChanges: [{ cell, executionSummary: cell.executionSummary }] });
  }
  await tick();

  const { item } = statusItems(ext, cell);
  assert.deepStrictEqual([...item.tooltip.value.matchAll(/\| \[(\d+)\] \|/g)].map((m) => Number(m[1])), [7, 6, 5, 4, 3]);
  assert.strictEqual(refreshes, 14);

  ext.config.maxRuns = 2;
  ext.listeners.config({ affectsConfiguration: (key) => key === 'cellRunHistory.maxRuns' });
  assert.strictEqual([...statusItems(ext, cell).item.tooltip.value.matchAll(/\| \[\d+\] \|/g)].length, 2);
});

test('recordTiming=false leaves the notebook untouched; other notebook types are ignored', async () => {
  const notebook = makeNotebook([{ execution_count: null, metadata: {} }]);
  const ext = loadExtension({ notebooks: [notebook], settings: { recordTiming: false } });
  const [cell] = notebook.getCells();
  const start = Date.now();
  cell.executionSummary = summary(1, start, start + 10);
  ext.listeners.change({ notebook, cellChanges: [{ cell, executionSummary: cell.executionSummary }] });
  await tick();
  assert.strictEqual(ext.applied.length, 0);
  assert.strictEqual(statusItems(ext, cell).count, 2, 'status and bar');

  const other = makeNotebook([{ metadata: {} }], 'interactive');
  const [otherCell] = other.getCells();
  ext.listeners.change({ notebook: other, cellChanges: [{ cell: otherCell, executionSummary: summary(1, start, start + 10) }] });
  assert.deepStrictEqual(ext.provider().provideCellStatusBarItems(otherCell), []);
});
