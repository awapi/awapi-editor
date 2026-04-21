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

# Clear caches and build outputs
clean:
    rm -rf dist node_modules
    npm cache clean --force

# Create a new version tag (e.g. 1.0.0) and push to trigger the GitHub Actions release
release version:
    @echo "Creating and pushing release tag v{{version}}..."
    git tag v{{version}}
    git push origin v{{version}}

