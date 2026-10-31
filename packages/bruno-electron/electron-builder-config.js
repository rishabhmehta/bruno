require('dotenv').config({ path: process.env.DOTENV_PATH });

const isBenchmark = process.env.BRUNO_BENCHMARK === 'true';

/*
 * macOS signing is opt-in and names exactly one certificate, e.g.
 * APPLE_SIGNING_IDENTITY="Jane Doe (ABCDE12345)". Without it the app is not signed at all:
 * left undefined, electron-builder would sign with whichever "Developer ID Application"
 * certificate it finds first in the keychain, which may belong to someone else.
 */
const macSigningIdentity = process.env.APPLE_SIGNING_IDENTITY || null;

// A signed .pkg needs a second certificate ("Developer ID Installer"); electron-builder
// fails without it, so the .pkg target is only built on request.
const buildMacPkg = process.env.MAC_BUILD_PKG === 'true';

const config = {
  appId: process.env.BRUNO_APP_ID || 'com.usebruno.app',
  productName: isBenchmark ? 'Bruno Benchmark' : 'Bruno',
  extraMetadata: {
    brunoBuild: {
      benchmark: isBenchmark,
      builtAt: new Date().toISOString()
    }
  },
  electronVersion: '37.6.1',
  directories: {
    buildResources: 'resources',
    output: 'out'
  },
  extraResources: [
    {
      from: 'resources/data/sample-collection.json',
      to: 'data/sample-collection.json'
    }
  ],
  files: ['**/*'],
  afterSign: 'notarize.js',
  mac: {
    artifactName: '${name}_${version}_${arch}_${os}.${ext}',
    category: 'public.app-category.developer-tools',
    target: [
      ...(buildMacPkg ? [{ target: 'pkg', arch: ['x64', 'arm64'] }] : []),
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64']
      }
    ],
    icon: 'resources/icons/mac/icon.icns',
    hardenedRuntime: true,
    identity: macSigningIdentity,
    // When signing was asked for, a missing certificate must fail the build instead of
    // silently producing an unsigned app.
    forceCodeSigning: Boolean(macSigningIdentity),
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    // Notarization runs in notarize.js (afterSign) with the signer's own Apple ID.
    notarize: false,
    protocols: [
      {
        name: 'Bruno',
        schemes: [
          'bruno'
        ]
      }
    ]
  },
  linux: {
    artifactName: '${name}_${version}_${arch}_${os}.${ext}',
    icon: 'resources/icons/png',
    target: [
      {
        target: 'AppImage',
        arch: ['x64', 'arm64']
      },
      {
        target: 'deb',
        arch: ['x64', 'arm64']
      },
      {
        target: 'rpm',
        arch: ['x64', 'arm64']
      }
    ],
    protocols: [
      {
        name: 'Bruno',
        schemes: ['bruno']
      }
    ],
    category: 'Development',
    desktop: {
      MimeType: 'x-scheme-handler/bruno;'
    }
  },
  deb: {
    // Docs: https://www.electron.build/configuration/linux#debian-package-options
    depends: [
      'libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'xdg-utils',
      'libatspi2.0-0',
      'libuuid1',
      'libsecret-1-0',
      'libasound2' // #1036
    ]
  },
  // Bundle git so Snap/sandbox installs can find it (#5667)
  snap: {
    stagePackages: ['default', 'git'],
    // electron-builder's app part strips usr/bin, so expose git from git-core
    environment: {
      PATH: '$SNAP/usr/lib/git-core:$SNAP/usr/sbin:$SNAP/usr/bin:$SNAP/sbin:$SNAP/bin:$PATH',
      GIT_EXEC_PATH: '$SNAP/usr/lib/git-core'
    }
  },
  win: {
    artifactName: '${name}_${version}_${arch}_win.${ext}',
    icon: 'resources/icons/win/icon.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64', 'arm64']
      }
    ],
    sign: null,
    publisherName: 'Bruno Software Inc'
  },
  nsis: {
    include: 'resources/installer.nsh',
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  },
  pkg: {
    installLocation: '/Applications',
    isRelocatable: false
  }
};

module.exports = config;
