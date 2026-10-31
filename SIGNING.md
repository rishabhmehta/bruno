# Signing and releasing the Techpix build of Bruno

**Start here if you've been asked to build and sign this app.** This page is the
checklist and map; the detailed steps live in the documents linked below.

This repository is **Techpix's fork of [Bruno](https://github.com/usebruno/bruno)**
(an open-source API client, built with Electron). It adds a Git Sync feature and is
built and signed separately from official Bruno:

- It's signed with **your own Apple Developer ID**, as an individual developer. Not
  with Bruno's and not with any company certificate. The repo names no signer; you put
  your details in a local `.env` file that is never committed.
- Its bundle ID is **`in.techpix.bruno`** (official Bruno is `com.usebruno.app`).
- `publishing.md` in this folder comes from upstream Bruno and describes **their**
  release process. **It does not apply here.**

---

## What you need

| Item | Where it comes from | Needed for |
|---|---|---|
| A Mac, macOS with Xcode command-line tools | `xcode-select --install` | Any macOS build |
| Node **v22.12.0** (see `.nvmrc`) and npm | nvm or nodejs.org | Building |
| Apple Developer Program membership (**Individual**) | developer.apple.com, paid yearly | Signing |
| **Developer ID Application** certificate in your login keychain | Apple developer portal | Signing |
| **App-specific password** for your Apple ID | account.apple.com | Notarization |
| Your **Team ID** (10 characters) | Shown with your certificate | Notarization |
| *(Optional)* **Developer ID Installer** certificate | Apple developer portal | Only for a `.pkg` installer |

Windows: **your Apple certificate cannot sign the Windows installer.** Today the
Windows build is unsigned. See "Windows" in the build guide before promising a
signed Windows release.

---

## Checklist

1. [ ] Read **[`.claude/build.md`](.claude/build.md)**, the full guide. In order:
       *Read this first* → *macOS: one-time setup* → *macOS: building*.
2. [ ] Create your certificate and app-specific password (*one-time setup*, steps 1–3).
3. [ ] `cp packages/bruno-electron/.env.sample packages/bruno-electron/.env` and fill
       it in (*one-time setup*, step 4). Leave `BRUNO_APP_ID = in.techpix.bruno` as it is.
4. [ ] From the repo root: `nvm use && npm i --legacy-peer-deps && ./mac-build.sh`
5. [ ] Check the result (*Check the result before sending it to anyone*):
       `codesign` shows **your** name and Team ID, and `spctl` says
       `accepted  source=Notarized Developer ID`.
6. [ ] Send the `.dmg` files from `packages/bruno-electron/out/`: `arm64` for Apple
       Silicon Macs, `x64` for Intel.

If anything fails, the build stops with a message saying what's missing. The
*What the build refuses to do* table in the guide explains each one.

---

## Documents and files

### Read

| Document | What's in it |
|---|---|
| [`.claude/build.md`](.claude/build.md) | **The build and signing guide.** Apple setup, `.env`, building, verifying, Windows options, quick reference. |
| [`packages/bruno-electron/.env.sample`](packages/bruno-electron/.env.sample) | Every signing variable with a comment. Copy it to `.env` in the same folder. |

### Run

| File | What it does |
|---|---|
| [`mac-build.sh`](mac-build.sh) | Builds all shared packages, the web app, then the signed and notarized macOS app. |
| [`windows-build.sh`](windows-build.sh) | Same for Windows (run from Git Bash on Windows). Produces an **unsigned** installer. |

### Only if something needs changing

| File | What it controls |
|---|---|
| [`packages/bruno-electron/electron-builder-config.js`](packages/bruno-electron/electron-builder-config.js) | Bundle ID, build targets, which certificate signs (from `.env`), Windows signing (`win.sign`). |
| [`packages/bruno-electron/notarize.js`](packages/bruno-electron/notarize.js) | Sends the signed app to Apple for notarization. Runs automatically after signing. |
| [`packages/bruno-electron/resources/entitlements.mac.plist`](packages/bruno-electron/resources/entitlements.mac.plist) | macOS permissions the signed app requests (JIT for the JavaScript engine). |

---

## Rules that matter

- **Never commit `packages/bruno-electron/.env`.** It holds your Apple ID and app
  password. It's gitignored. Keep it that way.
- **Don't change `BRUNO_APP_ID` between releases.** A different ID makes macOS and
  Windows install a second copy instead of updating.
- **Only your certificate is used.** The build signs only with the identity named
  in `.env`. If your Mac has other Developer ID certificates (for example a client's),
  they are ignored. If yours is missing, the build fails rather than falling back to
  another one or to an unsigned app.
- **Don't send a build that fails the `spctl` check.** It will be blocked on other Macs.

---

## Background (not needed for signing)

The `.claude/git-sync/` folder documents the fork's Git Sync feature: how conflicts
are handled, a bug write-up, and the roadmap. Read it only if you're working on that
feature.
