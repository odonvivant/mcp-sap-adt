# adt-connectivity Specification

## Purpose
Defines how `mcp-sap-adt` knows which SAP systems exist, how to authenticate to each one, and how
tool code reaches a system without depending on the ADT client library directly.

## Requirements

### Requirement: Named system registry loaded from systems.json
The system SHALL load a named registry of SAP systems (arbitrary aliases such as `dev`, `qas`,
`prd`) from a `systems.json` file at startup, where each entry declares at minimum: `url`,
`client`, `auth`, and `mode`. The system SHALL validate the loaded configuration against a schema
and refuse to start if any entry is invalid, reporting which entry and which field failed
validation.

#### Scenario: Valid systems.json loads successfully
- **WHEN** the server starts with a `systems.json` containing one or more well-formed system
  entries
- **THEN** each entry becomes queryable by its alias and the server starts

#### Scenario: Missing systems.json on first run
- **WHEN** the server starts and no `systems.json` exists yet
- **THEN** the server reports that no systems are configured and directs the user to run the setup
  wizard, rather than crashing with an unhandled error

#### Scenario: Invalid entry blocks startup
- **WHEN** `systems.json` contains an entry missing a required field (e.g. no `url`) or an
  unrecognized `auth.type`
- **THEN** the server refuses to start and reports the offending system alias and field

### Requirement: Two supported authentication strategies per system
Each system entry SHALL declare exactly one authentication strategy: `basic` (username/password)
or `cert` (client certificate / mTLS, via PFX or cert+key pair). The system SHALL reject an entry
that specifies both or neither.

#### Scenario: Basic auth system
- **WHEN** a system entry has `auth.type = "basic"` with `user` and `password`
- **THEN** requests to that system authenticate using HTTP basic auth

#### Scenario: Certificate auth system
- **WHEN** a system entry has `auth.type = "cert"` with either a `pfx` + `passphrase` or a
  `cert` + `key` path pair
- **THEN** requests to that system authenticate using a TLS client certificate (mTLS), and no
  username/password is sent

#### Scenario: Ambiguous auth entry rejected
- **WHEN** a system entry specifies both `auth.type = "basic"` fields and `auth.type = "cert"`
  fields, or specifies neither
- **THEN** validation fails for that entry with a message naming the conflict

### Requirement: Secret values may be resolved from environment variables
A system entry's credential fields (password, passphrase) SHALL accept either a literal value or
a reference to an environment variable name, resolved at load time, so that `systems.json` itself
does not have to contain the plaintext secret when the caller prefers to inject it via environment.

#### Scenario: Env-sourced password resolves at load
- **WHEN** a system entry's `password` field is written as an environment-variable reference and
  that variable is set in the process environment
- **THEN** the resolved value is used for authentication and the reference form (not the resolved
  secret) is what appears in any diagnostic output

#### Scenario: Referenced env var missing
- **WHEN** a system entry references an environment variable that is not set
- **THEN** validation fails for that entry, naming the missing variable, without printing any
  credential value

### Requirement: Unknown system alias is rejected with a clear error
Every operation that accepts a `system` alias SHALL validate that alias against the loaded
registry before attempting any network call, and SHALL return a clear, actionable error — not a
generic failure — when the alias is unknown.

#### Scenario: Tool called with unconfigured system alias
- **WHEN** a tool is invoked with a `system` value that does not match any configured alias
- **THEN** the call fails immediately with an error naming the unknown alias and listing the
  configured aliases, and no network request is made

### Requirement: One authenticated session per configured system
The registry SHALL support N independently configured systems within a single server process, and
SHALL maintain (and reuse) one authenticated session per system alias rather than requiring a
separate server process per system.

#### Scenario: Sequential calls to two different systems
- **WHEN** a tool call targets `dev` and a subsequent call targets `qas`
- **THEN** each call authenticates against and executes against its own targeted system, and a
  session established for one alias is never reused for another

### Requirement: Tool code depends only on a gateway abstraction, never on the ADT client directly
Tool implementations SHALL interact with a configured system exclusively through a gateway
abstraction. The concrete ADT client library SHALL be reachable only through that abstraction, so
that guardrail enforcement and error normalization apply uniformly to every call a tool makes,
with no path that bypasses them.

#### Scenario: Every ADT operation a tool invokes passes through the gateway
- **WHEN** any tool executes against a configured system
- **THEN** the call is observable/interceptable at the gateway boundary (for guardrail checks and
  error normalization) rather than reaching the underlying client library directly
