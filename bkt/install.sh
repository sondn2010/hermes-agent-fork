#!/usr/bin/env sh
# Thin wrapper: see install.mjs.
set -eu
exec node "$(dirname "$0")/install.mjs" "$@"
