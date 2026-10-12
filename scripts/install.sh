#!/bin/sh
set -eu
REPO=${AGENT_GITU_RELEASE_REPO:-cmgzone/agent-gitu}
VERSION=${AGENT_GITU_VERSION:-}
INSTALL=${AGENT_GITU_INSTALL_DIR:-"$HOME/.local/share/agent-gitu"}
case "$(uname -s)" in Linux) PLATFORM=linux;; Darwin) PLATFORM=darwin;; *) echo 'Use the Windows installer on this platform.' >&2; exit 1;; esac
case "$(uname -m)" in x86_64|amd64) ARCH=x64;; aarch64|arm64) ARCH=arm64;; *) echo 'Unsupported processor architecture.' >&2; exit 1;; esac
command -v curl >/dev/null; command -v tar >/dev/null
if [ -z "$VERSION" ]; then VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -n 1); fi
case "$VERSION" in ''|*[!0-9a-zA-Z.-]*) echo 'Invalid release version.' >&2; exit 1;; esac
LABEL="agent-gitu-$VERSION-$PLATFORM-$ARCH"
TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"' EXIT HUP INT TERM
BASE="https://github.com/$REPO/releases/download/v$VERSION"
curl -fsSL "$BASE/$LABEL.tar.gz" -o "$TEMP/$LABEL.tar.gz"
curl -fsSL "$BASE/$LABEL.tar.gz.sha256" -o "$TEMP/$LABEL.tar.gz.sha256"
cd "$TEMP"
if command -v sha256sum >/dev/null; then sha256sum -c "$LABEL.tar.gz.sha256"; else shasum -a 256 -c "$LABEL.tar.gz.sha256"; fi
# Extraction is accepted only after verifying the versioned publisher checksum.
tar -xzf "$LABEL.tar.gz"
mkdir -p "$INSTALL" "$HOME/.local/bin"
if [ -e "$INSTALL/$LABEL" ]; then echo 'This release is already installed; existing files were preserved.'; else mv "$LABEL" "$INSTALL/$LABEL"; fi
ln -sfn "$INSTALL/$LABEL/gitu" "$HOME/.local/bin/gitu"
printf 'Installed Agent Gitu %s. Data and connection secrets were preserved.\n' "$VERSION"
printf 'Add %s/.local/bin to PATH, then run gitu serve.\n' "$HOME"
