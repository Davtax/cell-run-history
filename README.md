# Cell Run History

For Jupyter notebooks in VS Code, a status like JupyterLab's execute-time extension:

- **If the cell ran before**, its status bar shows `Last executed at 2026-10-01 12:41:21 in 15ms`. Durations are in ms
  below 0.1 s, then `1.23s`, `2m 5.3s` or `1h 2m 3s`. Runs from earlier sessions come from the `execution` cell metadata saved by JupyterLab or by this
  extension.
- **While the cell runs again**, the status keeps showing the previous run; it switches to the new run when it finishes.
  (VS Code reports the timing of a run only once it has finished.)
- **Hover** the status to see the last runs of the cell (execution count, start time, duration, success), newest first.

VS Code always adds its own execution state (check mark / spinner) and timer to cells run in the current session, and
has no setting to remove them; a `│` separates them from this status. `hide-builtin-status.css` hides them, but it needs a custom-CSS extension that patches VS Code.

Settings:

- `cellRunHistory.maxRuns` (default 5): number of runs kept per cell.
- `cellRunHistory.recordTiming` (default true): save the timing of each run in the cell metadata, in JupyterLab's
  format, so the last run is shown when the notebook is reopened (in VS Code or JupyterLab). Turn it off to leave
  notebooks untouched.

The history of earlier runs lives in memory for the current window session; only the last run is saved in the notebook.

Build and install (from WSL):

```bash
node --test test.js
python3 package.py
~/.vscode-server/bin/*/bin/code-server --install-extension cell-run-history-0.4.0.vsix
```

Then run **Developer: Reload Window** in VS Code.
