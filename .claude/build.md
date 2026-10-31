# Build all dependencies first

npm run build:bruno-common
npm run build:bruno-requests
npm run build:bruno-filestore
npm run build:bruno-converters
npm run build:bruno-query
npm run build:graphql-docs

# Build the web app

npm run build:web

# Build the electron app for your platform

npm run build:electron:mac # or :win or :linux

4. Find the Built App

After building, the packaged app will be in:

- macOS: packages/bruno-electron/out/Bruno-darwin-arm64/ or Bruno-darwin-x64/
- Windows: packages/bruno-electron/out/Bruno-win32-x64/
- Linux: packages/bruno-electron/out/Bruno-linux-x64/

The actual executable will be:

- macOS: Bruno.app
- Windows: Bruno.exe
- Linux: bruno binary
