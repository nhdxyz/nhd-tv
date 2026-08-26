# NHD-TV

NHD-TV is a controller-friendly desktop TV environment for Windows, macOS, and Linux. The project is currently in Milestone 0: feasibility, where the highest-risk assumptions are tested before the full product shell is built.

## Product model

- NHD-TV is the parent TV environment.
- Streaming services run as child applications inside NHD-TV.
- Each service owns its browsing and playback interfaces.
- Back traverses the service until its root screen, where NHD-TV asks whether to quit the service.
- Continue Watching observes service playback without replacing service controls or resume behavior.
- The Store lets users enable only the services they want on their home screen.

## Initial targets

- Windows is the first polished platform.
- macOS and Linux remain architectural targets from the beginning.
- The initial feasibility matrix covers Netflix, YouTube, and Disney+.
- Keyboard and mouse, Xbox-style controllers, and a locally paired phone remote are first-class input methods.

## Current host spike

The first spike uses Castlabs Electron for Content Security (ECS) to run a trusted local shell beside an isolated streaming-service view. It includes a Shaka Player Widevine test service, a narrow IPC bridge, strict navigation rules, and automated security-policy tests.

## Development setup

Prerequisites:

- Node.js 24.3 or newer
- pnpm 11.9.0
- Internet access on first launch so ECS can install its native runtime and Widevine component

Install and verify:

```sh
pnpm install
pnpm runtime:install
pnpm check
pnpm start
```

In the feasibility shell, select a service from the matrix and press Escape to return to NHD-TV. The Shaka entry is the public Widevine test; commercial-service credentials must be entered directly into their isolated service pages. Escape is a temporary spike behavior; the nested Back and quit flow is tracked separately.

## Project documents

- [Product specification](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [DRM host feasibility result](docs/feasibility/drm-host.md)
- [Commercial-service compatibility matrix](docs/feasibility/service-matrix.md)

Streaming-service credentials and cookies stay in per-service persistent Electron session partitions and must never be committed.

## Development workflow

Work is tracked with GitHub issues and milestones. Each meaningful change should:

1. Reference an issue with explicit acceptance criteria.
2. Be developed on a focused branch.
3. Be committed in small, coherent, working checkpoints.
4. Be verified before its issue is closed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
