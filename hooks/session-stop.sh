#!/usr/bin/env bash
# Coil Stop hook
# Records session end. Currently a no-op placeholder.
# Future: could summarize session activity.

set -euo pipefail

# The Stop hook receives the transcript via stdin in some configurations.
# For now, we just exit cleanly. The PreCompact agent-type hook handles
# the actual knowledge extraction (configured separately in hooks.json).

exit 0
