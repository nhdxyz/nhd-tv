# Security Policy

NHD-TV handles sensitive browser sessions and local remote-control access. Security reports should not include account passwords, cookies, access tokens, or captured service-session data in public issues.

During private development, report security concerns using a GitHub issue labeled `security` only when the issue does not disclose an active secret. Revoke and rotate any exposed credential before recording the incident.

Core security requirements include:

- Service credentials are entered directly into the service page and are never stored by NHD-TV as username/password records.
- Every service page runs sandboxed, without Node.js integration.
- Application profiles and services use explicit session boundaries.
- Phone remotes use short-lived pairing credentials and revocable device tokens.
- Custom services cannot execute unrestricted application-level code.
- Clearing service data removes its local browser session without affecting unrelated services.

