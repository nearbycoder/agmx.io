# Security Policy

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report vulnerabilities privately through either:

- **GitHub Security Advisories**: open a private vulnerability report on this repository (`Security → Advisories → Report a vulnerability`).
- **Email**: send details to `abuse@agmx.io` (include reproduction steps, affected endpoints/files, and impact).

We aim to acknowledge reports within 48 hours and coordinate a fix before public disclosure.

## Supported Versions

Security fixes are applied to the `main` branch and released via container builds and the latest versions of `@agmx.io/sdk`, `@agmx.io/cli`, and `agmx` (Python).

## Security Model Highlights

- **Inbound mail verification:** `/api/inbound/ses` cryptographically verifies AWS SNS signatures against `sns.<region>.amazonaws.com` certificates and rejects any topic ARN not listed in `SES_INBOUND_TOPIC_ARNS` in production.
- **Prompt-injection mitigation:** inbound HTML is stripped of hidden content, comments, and invisible Unicode characters to produce `safeText` alongside a `security` risk score. Forged senders (failed DMARC or failed SPF+DKIM) have verification codes and sign-in links withheld from structured extraction.
- **Malware quarantine:** messages flagged `virus: FAIL` by SES have attachment bytes discarded rather than stored or served.
- **Sandboxed HTML rendering:** the web mail client renders untrusted HTML in a sandboxed iframe without `allow-scripts`, with dangerous tags stripped and an inner Content-Security-Policy applied.
- **Agent isolation:** agent-scoped API keys (`agmx_agt_…`) cannot view other agents, change their own send policy, resume paused sending, create forward/webhook rules, or delete/export accounts.
- **Webhook SSRF protection:** in production, outbound webhook targets are DNS-resolved and blocked from hitting loopback, private, and link-local/metadata IP ranges, with redirects disabled.
- **Deployment safety:** production refuses to boot without `BETTER_AUTH_SECRET` and disables `/api/dev/inbound` unless `ENABLE_DEV_INBOUND=true` is explicitly set.
