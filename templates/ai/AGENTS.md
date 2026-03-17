<!-- Managed by ormi-cli ai install. -->
# ORMI Agent Instructions

Use these rules when working in this repository.

## Purpose

This project uses `ormi-cli` for subgraph development on ORMI.

## Preferred Workflow

When the task is about creating, updating, testing, deploying, querying, or monitoring subgraphs:

1. Prefer the bundled `subgraph-*` skills if they are available in the client.
2. Prefer `ormi-cli` CLI commands over manual file creation.
3. Use MCP tools for discovery, inspection, and verification, not as a replacement for the CLI workflow.

## CLI-First Rules

Prefer this order:

1. `ormi-cli init` to scaffold a new subgraph project
2. `ormi-cli add` to add new contracts or data sources
3. `ormi-cli codegen` after schema or ABI changes
4. `ormi-cli build` to validate compilation
5. `ormi-cli test` for local test validation
6. `ormi-cli create` and `ormi-cli deploy` for release flow
7. `ormi-cli local` for local node workflows

Only edit `subgraph.yaml`, `schema.graphql`, mappings, or generated code directly after the CLI scaffold exists and only where the CLI output needs refinement.

For custom subgraphs without a contract address, use `subgraph-create-custom` which creates project files manually instead of using `ormi-cli init`.

## Skill Routing

Match user intent to the right skill:

| User Intent | Skill |
|---|---|
| "create", "new", "init", "scaffold" + contract address | `subgraph-create-from-contract` |
| "create", "new" + NO address / "block handler" / "factory" / "analytics" / "multi-source" | `subgraph-create-custom` |
| "deploy", "publish", "push", "release" | `subgraph-deploy` |
| "query", "show data", "get transfers/pools/...", "fetch" | `subgraph-query` |
| "status", "health", "sync", "errors", "logs", "monitor" | `subgraph-monitor` |
| "review", "audit", "check" + correctness/performance/best practices | `subgraph-review` |
| "project", "token", "api key", "access", "manage" | `subgraph-manage` |

## Lifecycle Order

For end-to-end workflows, follow this sequence:

1. Create: `subgraph-create-from-contract` or `subgraph-create-custom`
2. Review: `subgraph-review` (optional, before deploy)
3. Deploy: `subgraph-deploy`
4. Monitor: `subgraph-monitor` (ongoing)

## Behavior

- Keep workflows anchored to real `ormi-cli` commands.
- Summarize what the CLI generated before making manual refinements.
- When debugging, rerun the relevant `ormi-cli` command first and use its output to drive the fix.
- For destructive actions like cleanup or removal, explain the impact before executing them.

## MCP Authentication

The `subgraph-mcp` server uses OAuth2 authentication. `whoami` is an MCP tool for verifying auth — do NOT run `ormi-cli whoami` (this CLI command does not exist).

**MCP auth rules depend on the skill:**

- **`subgraph-create-from-contract`, `subgraph-create-custom`, `subgraph-review`**: MCP is optional. If MCP tools fail, note what was skipped and continue with CLI-only workflow.
- **`subgraph-deploy`, `subgraph-manage`, `subgraph-query`, `subgraph-monitor`**: MCP authentication is required. If `whoami` fails, tell the user to run `/mcp` (or their client's MCP mechanism) to authenticate and STOP. Only fall back to CLI alternatives if MCP is completely unavailable.

Each skill defines its own auth flow — follow the skill's instructions.

**Never:**
- Run `ormi-cli whoami` — this command does not exist
- Suggest bypassing MCP auth through alternative endpoints
- Store or handle OAuth tokens manually — the client manages this
- Ask the user to choose between MCP and manual key provision — follow the deterministic flow in each skill
