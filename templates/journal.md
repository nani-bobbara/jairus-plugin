# Jairus journal

Append-only session log written by the jairus commands (never by hand, never edited). One line per
event: `<UTC time> · <command> · <feature or —> · <event> · next: <the single next action>`.
It is a handoff between sessions, not state: the backlog and `jairus.json` decide the state.

