# Contributing to NHD-TV

## Issue-first development

Create or select a GitHub issue before beginning a meaningful feature, bug fix, or technical investigation. Issues should explain the user-visible outcome, constraints, and verifiable acceptance criteria.

Use these primary labels:

- `feature`: user-visible functionality
- `bug`: incorrect behavior
- `feasibility`: a technical question that must be proven
- `security`: authentication, session, remote-control, or plugin boundaries
- `platform`: operating-system-specific work
- `documentation`: product or developer documentation

## Branches and commits

Create focused branches using names such as `feat/service-store` or `spike/drm-host`. Prefer conventional commit prefixes:

- `feat:` new functionality
- `fix:` bug fixes
- `test:` test-only changes
- `docs:` documentation
- `refactor:` behavior-preserving restructuring
- `chore:` project maintenance

Commit frequently, but keep each commit coherent and usable. Do not commit credentials, streaming session data, generated user profiles, or remote-pairing secrets.

## Pull requests and closing issues

Pull requests should link the relevant issue, summarize verification, and call out known limitations. Close an issue only after every acceptance criterion has been verified. Prefer closing through the merged pull request so the implementation remains traceable.

## Security boundaries

Streaming-service pages are untrusted web content. They must not receive Node.js access, unrestricted application IPC, local database access, remote-control tokens, or credentials belonging to other services.

