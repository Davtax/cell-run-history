'use strict';

const vscode = require('vscode');
const { RunHistory, jupyterTiming, lastExecutedText, parseJupyterTiming, tooltipMarkdown } = require('./history');

const NOTEBOOK_TYPE = 'jupyter-notebook';

function activate(context) {
  const settings = () => vscode.workspace.getConfiguration('cellRunHistory');
  const history = new RunHistory(settings().get('maxRuns', 5));
  const changed = new vscode.EventEmitter();
  const keyOf = (cell) => cell.document.uri.toString();
  // Cells whose execution summary was reset (queued or running), when VS Code shows its own execution state.
  const pending = new Set();

  // The ipynb serializer exposes the cell metadata of the file as cell.metadata.metadata.
  const savedTiming = (cell) => parseJupyterTiming(cell.metadata?.metadata?.execution);

  // Runs from earlier sessions are only known through the saved timing; runs made before the extension activated
  // only through the last execution summary of each cell.
  const seed = (notebook) => {
    if (notebook.notebookType !== NOTEBOOK_TYPE) {
      return;
    }
    for (const cell of notebook.getCells()) {
      const timing = savedTiming(cell);
      if (timing) {
        history.record(keyOf(cell), { executionOrder: cell.metadata?.execution_count ?? undefined, timing });
      }
      history.record(keyOf(cell), cell.executionSummary);
    }
  };
  vscode.workspace.notebookDocuments.forEach(seed);

  // Save the timing of a finished run in the cell metadata, in the format of JupyterLab's execute-time extension, so it
  // is shown again when the notebook is reopened (in VS Code or JupyterLab).
  const saveTiming = async (cell, { startTime, endTime }) => {
    if (!settings().get('recordTiming', true)) {
      return;
    }
    const saved = savedTiming(cell);
    if (saved && saved.startTime === Math.floor(startTime) && saved.endTime === Math.floor(endTime)) {
      return;
    }
    const metadata = {
      ...cell.metadata,
      metadata: { ...(cell.metadata?.metadata ?? {}), execution: jupyterTiming(startTime, endTime) },
    };
    const edit = new vscode.WorkspaceEdit();
    edit.set(cell.notebook.uri, [vscode.NotebookEdit.updateCellMetadata(cell.index, metadata)]);
    await vscode.workspace.applyEdit(edit);
  };

  context.subscriptions.push(
    changed,
    vscode.workspace.onDidOpenNotebookDocument((notebook) => {
      seed(notebook);
      changed.fire();
    }),
    vscode.workspace.onDidChangeNotebookDocument((event) => {
      if (event.notebook.notebookType !== NOTEBOOK_TYPE) {
        return;
      }
      let updated = false;
      for (const { cell, executionSummary } of event.cellChanges) {
        if (!executionSummary) {
          continue;
        }
        const key = keyOf(cell);
        const wasPending = pending.has(key);
        if (!executionSummary.timing && executionSummary.success === undefined) {
          pending.add(key);
        } else {
          pending.delete(key);
        }
        updated ||= wasPending !== pending.has(key);
        if (!history.record(key, executionSummary)) {
          continue;
        }
        updated = true;
        const timing = executionSummary.timing;
        if (typeof timing?.endTime === 'number') {
          saveTiming(cell, timing).catch((error) => console.error('cell-run-history: could not save timing', error));
        }
      }
      if (updated) {
        changed.fire();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('cellRunHistory.maxRuns')) {
        history.setMaxRuns(settings().get('maxRuns', 5));
        changed.fire();
      }
    }),
    vscode.notebooks.registerNotebookCellStatusBarItemProvider(NOTEBOOK_TYPE, {
      onDidChangeCellStatusBarItems: changed.event,
      provideCellStatusBarItems(cell) {
        const runs = history.get(keyOf(cell));
        if (runs.length === 0) {
          return [];
        }
        // Always the last completed run, as JupyterLab shows it. While the cell runs again this is still the previous
        // run: VS Code only reports the timing of a run once it has finished.
        const item = new vscode.NotebookCellStatusBarItem(lastExecutedText(runs[0]), vscode.NotebookCellStatusBarAlignment.Left);
        // The workbench renders a non-string tooltip as markdown. A plain object is used because MarkdownString keeps
        // its text in private fields that do not survive the transfer from the extension host.
        item.tooltip = { value: tooltipMarkdown(runs), supportThemeIcons: true };
        item.priority = -100; // After the built-in execution state and timer.

        // VS Code shows its own state (check mark, spinner) and timer only for cells run in this session; separate it.
        const summary = cell.executionSummary;
        if (!summary?.timing && summary?.success === undefined && !pending.has(keyOf(cell))) {
          return [item];
        }
        const separator = new vscode.NotebookCellStatusBarItem('│', vscode.NotebookCellStatusBarAlignment.Left);
        separator.priority = -99;
        return [separator, item];
      },
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
