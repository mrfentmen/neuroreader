# Security Policy

## Supported versions

NeuroReader is a public beta. Security fixes are developed on the `main` branch and included in the next available release.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Older releases | Best effort |

## Reporting a vulnerability

Please do **not** open a public GitHub issue for a security vulnerability, and do not include private page text, saved readings, account details, browser history, or secrets in a report.

Use GitHub's **Private Vulnerability Reporting** flow for this repository when it is available. If that flow is unavailable, contact the maintainer through the email address shown in the repository's public store/support materials and write **NeuroReader security report** in the subject line. Send only a concise description, affected file or release, reproduction steps using non-sensitive test content, and the impact you observed.

If you are unsure whether a behavior is security-sensitive, report it privately first. We will acknowledge a credible report when practical, investigate it, and coordinate a fix or public advisory when appropriate. Please give us a reasonable opportunity to fix the issue before public disclosure.

## Scope

In scope:

- Cross-site scripting or unsafe handling of webpage text in the web app or extensions.
- Extension privilege or messaging issues that allow unintended page access or data disclosure.
- Release or CI supply-chain issues that could alter published artifacts.
- Privacy issues that cause text, saved readings, settings, or browsing data to leave the user's device unexpectedly.

Out of scope:

- A site refusing transformation, bot walls, browser-owned pages, closed shadow roots, cross-origin frames, canvas editors, or site markup changes documented as known limitations.
- Issues that require a user to install a modified or untrusted extension package.
- Reports containing real private content or credentials. Please reproduce with synthetic text.
- Social engineering, denial-of-service attacks against third parties, or vulnerabilities in independent services linked from NeuroReader.

## Privacy boundary

NeuroReader is designed to process text locally. The project does not operate a server that receives pasted text or transformed webpage content. Browser extension settings and explicitly saved readings remain in browser storage. Optional support links and external store services are independent third parties; do not include their account or payment information in a report.

## Safe testing

Use a local fixture, synthetic text, or a test account. Do not probe YouTube, Reddit, GitHub, or another third-party service in a way that bypasses access controls or exposes someone else's data. Do not commit proof-of-concept payloads containing real secrets or personal information.

The repository's normal checks include formula tests, browser extension end-to-end suites, release validation, dependency auditing, immutable GitHub Action pin checks, and packaging checksum verification. A passing test suite does not make an unreviewed report safe to publish; report privately when in doubt.
