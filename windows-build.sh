#!/bin/bash
# Build the Windows installer. Run from Git Bash: the electron build step is a bash
# script. The installer is unsigned (see .claude/build.md, "Windows").
set -euo pipefail
cd "$(dirname "$0")"

# Shared packages, in the order `npm run setup` builds them
npm run build:graphql-docs
npm run build:bruno-query
npm run build:bruno-common
npm run build:bruno-converters
npm run build:bruno-requests
npm run build:schema-types
npm run build:bruno-filestore
npm run build:bruno-sqlite
npm run sandbox:bundle-libraries --workspace=packages/bruno-js

npm run build:web
npm run build:electron:win
