# Show the available project commands.
default:
    @just --list

# Install the exact dependency versions from the lockfile.
[env('CI', 'true')]
install:
    pnpm install --frozen-lockfile

# Compile the TypeScript sources.
build:
    pnpm build

# Run the test suite once.
test:
    pnpm test

# Check formatting and lint rules.
lint:
    pnpm lint

# Apply safe formatting and lint fixes.
format:
    pnpm format

# Type-check source and test code.
typecheck:
    pnpm typecheck

# Run the complete quality gate.
check:
    just --fmt --check
    pnpm check

# Check production dependencies for known vulnerabilities.
audit:
    pnpm audit --prod

# Preview the files that would be published to npm.
pack:
    npm pack --dry-run

# Reproduce the CI quality gate from a clean locked install.
ci: install
    just check
    just audit
