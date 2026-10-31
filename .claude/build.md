# Building and signing the app

This fork is built and signed by **an individual developer with their own Apple
Developer account**. Nothing in the repo names a signer: whoever builds puts their
own details in `packages/bruno-electron/.env`. Without that file the build is
**unsigned**, which is fine for testing on your own machine but not for sending to
anyone.

---

## Read this first

1. **An unsigned build will not open on someone else's Mac.** Since macOS 15
   (Sequoia), a downloaded unsigned app is blocked, and the "Open anyway" route is
   buried in System Settings. To share the app, it must be **signed and notarized**.
2. **Only the certificate you name is used.** The build never picks a certificate
   from the keychain by itself. A Mac can hold several (for example a client's), and
   it would otherwise take the first one it finds.
3. **The bundle ID is still Bruno's** (`com.usebruno.app`) unless you set
   `BRUNO_APP_ID`. If people might also have the official Bruno installed, set your
   own (e.g. `com.yourname.bruno`). Otherwise macOS treats the two as the same app:
   same name in Applications, same `bruno://` links. Decide this **before** the first
   release. Changing it later makes macOS see a different app.
4. **The Apple certificate does nothing for Windows.** See the Windows section.

---

## macOS: one-time setup (the signer does this once)

### 1. Apple Developer Program

Enroll at https://developer.apple.com/programs/ as an **Individual**. It's a paid,
yearly membership. Enrollment can take a day or two.

### 2. Create a "Developer ID Application" certificate

Only the account holder can create this kind of certificate. On an individual
account, that's you.

1. Open **Keychain Access** → menu **Keychain Access → Certificate Assistant →
   Request a Certificate From a Certificate Authority**. Enter your email, choose
   **Saved to disk**, save the `.certSigningRequest` file.
2. Go to https://developer.apple.com/account/resources/certificates → **+** →
   **Developer ID Application** → upload that file → download the `.cer`.
3. Double-click the `.cer`. It's added to your login keychain, paired with the
   private key from step 1.
4. Check it's there:
   ```bash
   security find-identity -v -p codesigning
   ```
   You should see a line like
   `"Developer ID Application: Jane Doe (ABCDE12345)"`.
   `Jane Doe (ABCDE12345)` is your **signing identity**, and `ABCDE12345` is your
   **Team ID**.

> Building on another Mac? Export the certificate **with its private key** from
> Keychain Access as a `.p12` and import it there. The `.cer` alone can't sign.

Optional: a **Developer ID Installer** certificate (same steps, different type) is
only needed if you also want a `.pkg` installer. The `.dmg` and `.zip` don't need it.

### 3. App-specific password (for notarization)

Apple checks every signed app before macOS will open it after download. That check
is called **notarization**. The build does it automatically using your Apple ID, but
needs an app-specific password, not your normal one:

https://account.apple.com → **Sign-In and Security** → **App-Specific Passwords** →
generate one (e.g. named "bruno notarize").

### 4. Fill in `.env`

```bash
cp packages/bruno-electron/.env.sample packages/bruno-electron/.env
```

Edit `packages/bruno-electron/.env` (it's gitignored, so it never gets committed):

```
APPLE_SIGNING_IDENTITY = Jane Doe (ABCDE12345)
APPLE_ID = jane@example.com
APPLE_APP_SPECIFIC_PASSWORD = abcd-efgh-ijkl-mnop
APPLE_TEAM_ID = ABCDE12345
SKIP_NOTARIZE = false
MAC_BUILD_PKG = false
BRUNO_APP_ID =
```

`APPLE_SIGNING_IDENTITY` is the text from step 2 **without** the
`Developer ID Application: ` prefix. The Team ID in it must match `APPLE_TEAM_ID`,
or the build stops with an error saying so.

---

## macOS: building

From the repo root:

```bash
nvm use                    # Node version from .nvmrc
npm i --legacy-peer-deps   # after pulling new code
./mac-build.sh
```

`mac-build.sh` builds the shared packages, the web app, and then the Electron app.
Signing and notarization happen inside the last step. Notarization usually takes a
few minutes, and the terminal prints `Notarizing …` while it waits for Apple.

**Output** (in `packages/bruno-electron/out/`):

| File | What it is |
|---|---|
| `bruno_<version>_arm64_mac.dmg` | Installer for Apple Silicon Macs |
| `bruno_<version>_x64_mac.dmg` | Installer for Intel Macs |
| `bruno_<version>_*_mac.zip` | Same apps, zipped |
| `mac-arm64/Bruno.app`, `mac/Bruno.app` | The apps themselves |

### Check the result before sending it to anyone

```bash
APP=packages/bruno-electron/out/mac-arm64/Bruno.app
codesign -dv --verbose=2 "$APP" 2>&1 | grep -E "Authority|TeamIdentifier"
#   should show "Developer ID Application: <your name>" and your Team ID
spctl --assess --type execute --verbose "$APP"
#   should say: accepted   source=Notarized Developer ID
```

If `spctl` says `rejected`, don't ship it. The usual cause is that notarization was
skipped or failed.

### What the build refuses to do (on purpose)

| Situation | What happens |
|---|---|
| `APPLE_SIGNING_IDENTITY` empty | Unsigned build, no notarization. For local testing only. |
| Identity set but not in the keychain | Build **fails** (it used to quietly produce an unsigned app). |
| Identity set, notarization details missing | Build **fails** and lists what's missing. Set `SKIP_NOTARIZE = true` to sign without notarizing for a local test. |
| Identity's team ≠ `APPLE_TEAM_ID` | Build **fails** before contacting Apple. |
| Apple rejects notarization | Build **fails** (it used to log the error and carry on). |
| `MAC_BUILD_PKG = true` without an Installer certificate | Build fails at the `.pkg` step. |

---

## Windows

**Short answer: the Apple certificate does not work for Windows, and today the
Windows installer is unsigned.** It still installs and runs, but:

- Windows shows a blue **"Windows protected your PC"** (SmartScreen) screen on first
  run. Users must click **More info → Run anyway**.
- Some company-managed PCs block unsigned installers outright.

To sign for Windows you need a **separate Windows code-signing certificate**. This
is **not set up yet**, and it is a decision with cost:

| Option | Notes |
|---|---|
| **Certificate from a certificate authority** (DigiCert, Sectigo, SSL.com, …) | Since 2023 these come on a hardware USB token or in the provider's cloud, not as a file. Yearly cost. SmartScreen warnings fade as the app builds up download reputation. |
| **Microsoft Artifact Signing** (formerly Trusted Signing) | Cloud signing with a low monthly fee. Microsoft limits who can sign up by country and organisation type, and **I haven't checked whether an individual in your country qualifies**. Check Microsoft's current eligibility page before choosing it. |

Two technical notes for whoever picks this up:

- `packages/bruno-electron/electron-builder-config.js` has `win.sign: null`, which
  turns Windows signing off. That's the line to change.
- Built-in support for Microsoft's cloud signing needs a newer electron-builder than
  the one this repo uses (24.x). Plan for either an upgrade or a small custom sign
  script.

### Building on Windows

From **Git Bash** (the Electron build step is a bash script), with Node from `.nvmrc`:

```bash
npm i --legacy-peer-deps
./windows-build.sh
```

Output: `packages/bruno-electron/out/bruno_<version>_x64_win.exe` (and `arm64`).

---

## Linux

`npm run build:electron:linux` after the same package builds as `mac-build.sh`.
Linux packages aren't code-signed in the same way, so nothing extra is needed.

---

## Quick reference

| I want to… | Do this |
|---|---|
| Test locally, no signing | Leave `APPLE_SIGNING_IDENTITY` empty, run `./mac-build.sh` |
| Sign but skip notarization (local check) | Identity set, `SKIP_NOTARIZE = true` |
| Build something to send to people | Identity + Apple ID + app password + Team ID set, then verify with `spctl` |
| Also get a `.pkg` | `MAC_BUILD_PKG = true` and a Developer ID Installer certificate |
| Keep it apart from official Bruno | `BRUNO_APP_ID = com.yourname.bruno` (decide before first release) |
