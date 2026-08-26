# NHD-TV

NHD-TV is a controller-friendly desktop TV environment for Windows, macOS, and Linux. It provides a fullscreen home screen, opens streaming services inside the application, and returns to NHD-TV after the user backs out of a service.

The project is currently in its feasibility phase. The first technical milestone will validate commercial playback, persistent service sessions, nested back navigation, and passive playback observation before the full interface is built.

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

## Planned technology

The leading desktop runtime candidate is Castlabs Electron for Content Security, paired with a TypeScript frontend. This is not considered final until the DRM and service-host feasibility milestone passes.

See [the product specification](docs/product-spec.md), [architecture notes](docs/architecture.md), and [roadmap](docs/roadmap.md) for current decisions.

## Development workflow

Work is tracked with GitHub issues and milestones. Each meaningful change should:

1. Reference an issue with explicit acceptance criteria.
2. Be developed on a focused branch.
3. Be committed in small, coherent, working checkpoints.
4. Be verified before its issue is closed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

