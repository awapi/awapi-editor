# This file defines the common tasks for developing this project using the `just` command runner.
# See https://github.com/casey/just for more information.

# Use bash for better compatibility
set shell := ["bash", "-c"]

# Show available commands by default
default:
    @just --list
    
# Install dependencies
install:
    npm install

# Run the application in development mode
dev:
    npm run dev

# Run unit tests continuously (watch mode)
test:
    npm run test:watch

# Run unit tests once
test-once:
    npm run test

# Typecheck the codebase strictly
typecheck:
    npm run typecheck

# Build the application into production bundles
build:
    npm run build

# Package the app for local installation (cross-platform, no GitHub publish)
package:
    npm run package
    @OS=$(uname -s); \
    if [ "$OS" = "Darwin" ]; then \
        open release/AwapiEditor-*.dmg; \
        echo "Drag AwapiEditor to /Applications in the window that just opened."; \
        echo "Then run: xattr -cr /Applications/AwapiEditor.app"; \
    elif [ "$OS" = "Linux" ]; then \
        echo ""; \
        echo "✓ Build complete. AppImage is at:"; \
        ls release/AwapiEditor-*.AppImage 2>/dev/null || ls release/*.AppImage 2>/dev/null; \
        echo ""; \
        echo "To run it:  chmod +x release/AwapiEditor-*.AppImage && ./release/AwapiEditor-*.AppImage"; \
    else \
        echo ""; \
        echo "✓ Build complete. Installer is at:"; \
        ls release/*.exe 2>/dev/null; \
    fi

# Clear caches and build outputs
clean:
    rm -rf dist node_modules
    npm cache clean --force

# Create a new version tag (e.g. 1.0.0) and push to trigger the GitHub Actions
# release workflow. The workflow builds on macOS / Linux / Windows and uploads
# the artifacts to a *draft* GitHub Release (electron-builder's default in a
# multi-OS matrix, to avoid race conditions between runners).
#
# By default the release stays as a draft so you can review it. Pass `publish`
# as the second argument to automatically promote it to the latest release
# once the workflow finishes (end-users' update check only sees published
# releases).
#
#   just release 0.2.7           # draft only (default)
#   just release 0.2.7 publish   # draft + auto-publish when CI finishes
#
# Auto-publish requires the GitHub CLI (`brew install gh` + `gh auth login`).
release version mode="draft":
    @echo "Bumping package.json to {{version}}..."
    npm version {{version}} --no-git-tag-version
    git add package.json package-lock.json
    git commit -m "chore: release v{{version}}"
    git push
    @echo "Creating and pushing release tag v{{version}}..."
    git tag v{{version}}
    git push origin v{{version}}
    @echo ""
    @echo "✓ Tag pushed. GitHub Actions is now building and uploading to a draft release."
    @if [ "{{mode}}" = "publish" ]; then \
        command -v gh >/dev/null 2>&1 || { echo "gh CLI not found. Install with: brew install gh"; exit 1; }; \
        echo "Waiting for the release workflow to finish before publishing..."; \
        sleep 15; \
        gh run watch --exit-status $(gh run list --workflow='Release Builds' --limit 1 --json databaseId --jq '.[0].databaseId') || { echo "Workflow failed — draft left in place for inspection."; exit 1; }; \
        echo "Publishing draft release v{{version}}..."; \
        gh release edit v{{version}} --draft=false --latest; \
        echo "✓ v{{version}} is now the latest release."; \
        echo "  https://github.com/awapi/awapi-editor/releases/tag/v{{version}}"; \
    else \
        echo "  Draft will remain a draft. Publish later with: just publish {{version}}"; \
    fi

# Promote an existing draft GitHub Release to published + mark it as the
# latest release. This is what makes the in-app update notifier see it.
# Requires the GitHub CLI (`brew install gh` and `gh auth login`).
publish version:
    @command -v gh >/dev/null 2>&1 || { echo "gh CLI not found. Install with: brew install gh"; exit 1; }
    @echo "Publishing draft release v{{version}}..."
    gh release edit v{{version}} --draft=false --latest
    @echo "✓ v{{version}} is now the latest release."
    @echo "  https://github.com/awapi/awapi-editor/releases/tag/v{{version}}"


