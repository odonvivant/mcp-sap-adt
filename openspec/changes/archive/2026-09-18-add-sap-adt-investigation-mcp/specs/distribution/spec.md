## Purpose

Defines the first-run setup experience and the install documentation that lets a user go from
`git clone` to a working MCP connection across every supported harness.

## ADDED Requirements

### Requirement: Quickstart is clone + one install command + one setup command
A user SHALL be able to get from a fresh clone to a running server with exactly: clone, install/
build, and run the setup wizard — no manual editing of a config file required for a first-time
single-system setup.

#### Scenario: First-time setup produces a working systems.json
- **WHEN** a user runs the install and setup commands on a fresh clone and answers the wizard
  prompts for one system
- **THEN** a valid `systems.json` exists afterward and the server starts successfully against it

### Requirement: Interactive setup wizard collects one system at a time and writes systems.json
The setup wizard SHALL prompt, per system, for: alias, URL, client, auth type (basic or cert),
the corresponding credential/cert-path fields, and guardrail mode — and SHALL let the user add
multiple systems in one run. On completion it SHALL write a `systems.json` that passes the
`adt-connectivity` registry's validation.

#### Scenario: Wizard supports adding multiple systems in one run
- **WHEN** a user completes the prompts for one system and chooses to add another
- **THEN** the wizard collects a second system entry and both appear in the resulting
  `systems.json`

#### Scenario: Wizard output is immediately valid
- **WHEN** the wizard finishes writing `systems.json`
- **THEN** the file satisfies the same schema the server validates at startup, with no manual
  edits needed

### Requirement: Secrets are never logged or echoed during setup
The setup wizard SHALL NOT print, log, or echo back any password, passphrase, or private key
content at any point during or after the prompt sequence — including in confirmation summaries.

#### Scenario: Password entry is not echoed
- **WHEN** a user enters a password or passphrase during the wizard
- **THEN** no terminal output, log line, or summary screen displays that value in plaintext

### Requirement: systems.json is excluded from version control by default
A freshly cloned repository SHALL be configured (e.g. via `.gitignore`) so that a generated
`systems.json` is never accidentally committed.

#### Scenario: Generated file is ignored by git
- **WHEN** `systems.json` is created by the setup wizard in a clone of this repository
- **THEN** `git status` does not list it as a trackable/untracked-for-commit change

### Requirement: README covers every supported MCP harness
The README SHALL include working configuration instructions for: Claude Desktop, Claude Code, VS
Code / GitHub Copilot, and Cline. The VS Code / GitHub Copilot path SHALL include a
`.vscode/mcp.json` template using `${input:...}` placeholders for secrets (no hardcoded
credentials in the template) and an install deep-link badge for one-click add.

#### Scenario: VS Code path requires no hand-written JSON
- **WHEN** a user follows the VS Code / GitHub Copilot section of the README
- **THEN** they can add the server via the provided `.vscode/mcp.json` template or the install
  badge, entering secrets only through VS Code's own input prompts

#### Scenario: Each harness section is independently sufficient
- **WHEN** a user follows only the Claude Desktop section (or only Claude Code, or only Cline)
- **THEN** that section alone contains enough configuration detail to connect the server, without
  needing to read the other harness sections

### Requirement: Troubleshooting guidance is keyed to the AdtError shape
The README SHALL include a troubleshooting section that maps the structured error categories
defined in `tools` (auth failure, object/system not found, syntax error, guardrail denial) to
concrete user-facing guidance, so a user can self-diagnose without reading source code.

#### Scenario: User sees a 401 and consults the README
- **WHEN** a tool call fails with the "authentication problem" error category
- **THEN** the troubleshooting section names that category and lists the likely causes/fixes for it
