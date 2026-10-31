#!/bin/bash
# Build the macOS app. Signing is controlled by packages/bruno-electron/.env
# (see packages/bruno-electron/.env.sample and .claude/build.md).
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
npm run build:electron:mac
