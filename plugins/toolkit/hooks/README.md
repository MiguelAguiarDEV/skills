# hooks/

In use. Lifecycle hooks for the `toolkit` plugin, declared in
[`hooks.json`](./hooks.json) at this folder. Hooks are plugin-wide: they run
for every session where `toolkit` is installed, regardless of which skill
(if any) is active.

| Event | What runs | For which skill |
|---|---|---|
| `UserPromptSubmit` | `date` injection (current day + `HH:MM`) | `daily-journal` (time-aware morning/evening behaviour) |
| `UserPromptSubmit` | `skills/nudge/scripts/check_alerts.py` | `nudge` (surfaces due reminders) |
| `SessionStart` | [`always-on.sh`](./always-on.sh) | `i-have-adhd` (injects the ruleset only if the opt-in flag file exists) |

All three are no-ops or near-no-ops when unused: the `date` echo is a few
bytes of context, `check_alerts.py` prints nothing when no reminder is due,
and `always-on.sh` exits immediately unless
`${CLAUDE_CONFIG_DIR:-~/.claude}/.i-have-adhd-always` exists. Each has a
5s timeout and never blocks the session.

See [Hooks](https://code.claude.com/docs/en/hooks) and the
[plugin structure reference](https://code.claude.com/docs/en/plugins-reference).
