<!-- Managed by ormi-cli ai install. -->
# ORMI Claude Instructions

When working in this repository, use the ORMI subgraph skills and keep the workflow centered on `ormi-cli`.

## Skill Routing

Match user intent to the right skill:

| User Intent | Skill |
|---|---|
| "create", "new", "init", "scaffold" | `subgraph-create` |
| "deploy", "publish", "push", "release" | `subgraph-deploy` |
| "query", "show data", "get transfers/pools/...", "fetch" | `subgraph-query` |
| "status", "health", "sync", "errors", "logs", "monitor" | `subgraph-monitor` |
| "review", "audit", "check" + correctness/performance/best practices | `subgraph-review` |
| "project", "token", "api key", "access", "manage" | `subgraph-manage` |

## Lifecycle Order

For end-to-end workflows, follow this sequence:

1. Create: `subgraph-create`
2. Review: `subgraph-review` (optional, before deploy)
3. Deploy: `subgraph-deploy`
4. Monitor: `subgraph-monitor` (ongoing)

## Workflow Rules

- Prefer `ormi-cli init` over hand-writing a new subgraph project. For custom subgraphs without a contract address, `subgraph-create` creates project files manually.
- Prefer `ormi-cli add` over manually wiring a new data source from scratch.
- Run `ormi-cli codegen` after schema or ABI changes.
- Run `ormi-cli build` and `ormi-cli test` before proposing deployment.
- Use `ormi-cli create` and `ormi-cli deploy` for release steps.
- Use `ormi-cli local` for local node workflows.

Only fall back to direct edits of `subgraph.yaml`, `schema.graphql`, mappings, or generated artifacts when the CLI-generated baseline needs refinement.

## MCP Role

If `subgraph-mcp` is available, use it for:

- authentication verification (`whoami` — MCP tool only, NOT a CLI command)
- deploy key retrieval (`list-project-tokens`)
- chain and project discovery
- deployment lookup and status checks
- logs, block stats, entity stats, and query verification

**MCP auth rules depend on the skill:**

- **`subgraph-create`, `subgraph-review`**: MCP is optional. If MCP tools fail, note what was skipped and continue with CLI-only workflow.
- **`subgraph-deploy`, `subgraph-manage`, `subgraph-query`, `subgraph-monitor`**: MCP authentication is required. If `whoami` fails, tell the user to run `/mcp` to authenticate and STOP. Only fall back to CLI alternatives if MCP is completely unavailable (not configured, connection refused).

Each skill defines its own auth flow — follow the skill's instructions.

**Never:**
- Run `ormi-cli whoami` — this command does not exist; `whoami` is an MCP tool
- Suggest bypassing MCP auth through alternative endpoints
- Store or handle OAuth tokens manually — the client manages this
- Ask the user to choose between MCP and manual key provision — follow the deterministic flow in each skill
