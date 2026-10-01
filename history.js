'use strict';

/** Last runs of every notebook cell, newest first. Kept free of the vscode API so it can be tested with plain Node. */
class RunHistory {
  constructor(maxRuns = 5) {
    this.maxRuns = maxRuns;
    this._runs = new Map();
  }

  /**
   * Record a cell execution summary ({ executionOrder, success, timing: { startTime, endTime } }).
   * A summary with the same start time as the newest run updates it (e.g. a running cell that finished).
   * Returns true when the history of the cell changed.
   */
  record(key, summary) {
    const timing = summary && summary.timing;
    if (!timing || typeof timing.startTime !== 'number') {
      return false;
    }

    const run = {
      start: timing.startTime,
      end: typeof timing.endTime === 'number' ? timing.endTime : undefined,
      success: summary.success,
      order: summary.executionOrder,
    };
    const runs = this._runs.get(key) || [];
    const newest = runs[0];

    if (newest && newest.start === run.start) {
      if (newest.end === run.end && newest.success === run.success && newest.order === run.order) {
        return false;
      }
      runs[0] = run;
    } else if (newest && run.start < newest.start) {
      return false; // An older summary replayed (e.g. on reopen) must not hide newer runs.
    } else {
      runs.unshift(run);
      runs.length = Math.min(runs.length, this.maxRuns);
    }

    this._runs.set(key, runs);
    return true;
  }

  get(key) {
    return this._runs.get(key) || [];
  }

  setMaxRuns(maxRuns) {
    this.maxRuns = maxRuns;
    for (const runs of this._runs.values()) {
      runs.length = Math.min(runs.length, maxRuns);
    }
  }
}

/** Human-readable duration: 15ms below 0.1 s, then 0.25s, 12.34s, 2m 5.3s, 1h 2m 3s. */
function formatDuration(ms) {
  if (ms < 100) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${(seconds - 60 * minutes).toFixed(1)}s`;
  }
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}h ${minutes}m ${total % 60}s`;
}

const pad = (n) => String(n).padStart(2, '0');

/** Local date and time, YYYY-MM-DD HH:MM:SS. */
function formatDateTime(epochMs) {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Local time, with the date only when it is not today. */
function formatTime(epochMs, now = Date.now()) {
  const full = formatDateTime(epochMs);
  return new Date(now).toDateString() === new Date(epochMs).toDateString() ? full.slice(11) : full;
}

/** Status bar text of a run, as JupyterLab's execute-time extension shows it. */
function lastExecutedText(run) {
  const started = `Last executed at ${formatDateTime(run.start)}`;
  return run.end === undefined ? started : `${started} in ${formatDuration(run.end - run.start)}`;
}

/**
 * Timing saved by JupyterLab in the ``execution`` cell metadata (ISO timestamps in UTC), as { startTime, endTime } in
 * epoch milliseconds, or undefined when absent or invalid.
 */
function parseJupyterTiming(execution) {
  if (!execution || typeof execution !== 'object') {
    return undefined;
  }
  const time = (...keys) => {
    for (const key of keys) {
      const value = typeof execution[key] === 'string' ? Date.parse(execution[key]) : NaN;
      if (!Number.isNaN(value)) {
        return value;
      }
    }
    return undefined;
  };
  const startTime = time('iopub.execute_input', 'shell.execute_reply.started', 'iopub.status.busy');
  const endTime = time('shell.execute_reply', 'iopub.status.idle');
  if (startTime === undefined || endTime === undefined || endTime < startTime) {
    return undefined;
  }
  return { startTime, endTime };
}

/** ``execution`` cell metadata in JupyterLab's format for a run between two epoch-millisecond times. */
function jupyterTiming(startTime, endTime) {
  const start = new Date(startTime).toISOString();
  const end = new Date(endTime).toISOString();
  return {
    'iopub.execute_input': start,
    'iopub.status.busy': start,
    'iopub.status.idle': end,
    'shell.execute_reply': end,
    'shell.execute_reply.started': start,
  };
}

/** Markdown table of the runs, newest first. */
function tooltipMarkdown(runs, now = Date.now()) {
  const lines = [`**Last ${runs.length === 1 ? 'run' : `${runs.length} runs`}**`, '', '| Run | Started | Duration | |', '|---|---|---:|---|'];
  for (const run of runs) {
    const order = run.order === undefined ? '' : `[${run.order}]`;
    const duration = run.end === undefined ? 'running…' : formatDuration(run.end - run.start);
    const status = run.success === false ? '✗' : run.success === true ? '✓' : '';
    lines.push(`| ${order} | ${formatTime(run.start, now)} | ${duration} | ${status} |`);
  }
  return lines.join('\n');
}

module.exports = {
  RunHistory,
  formatDateTime,
  formatDuration,
  formatTime,
  jupyterTiming,
  lastExecutedText,
  parseJupyterTiming,
  tooltipMarkdown,
};
