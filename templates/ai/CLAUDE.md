<!-- Managed by ormi-cli ai install. -->
# ORMI Claude Instructions

When working in this repository, use the ORMI subgraph skills and keep the workflow centered on `ormi-cli`.

## Use These Skills

Use the installed bundled skills when relevant:

- `subgraph-create` for the full subgraph creation workflow (scaffold, analyze, refine, build)
- `subgraph-deploy` for deploy key retrieval, create, deploy, and post-deploy checks (requires MCP authentication)
- `subgraph-query` for schema-aware GraphQL queries
- `subgraph-monitor` for deployment health and diagnostics
- `subgraph-manage` for remote project and token inspection

## Workflow Rules

- Prefer `ormi-cli init` over hand-writing a new subgraph project.
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

- **`subgraph-create`**: MCP is optional. If MCP tools fail, note what was skipped and continue with CLI-only workflow.
- **`subgraph-deploy`, `subgraph-manage`, `subgraph-query`, `subgraph-monitor`**: MCP authentication is required. If `whoami` fails, tell the user to run `/mcp` to authenticate and STOP. Only fall back to CLI alternatives if MCP is completely unavailable (not configured, connection refused).

Each skill defines its own auth flow — follow the skill's instructions.

**Never:**
- Run `ormi-cli whoami` — this command does not exist; `whoami` is an MCP tool
- Suggest bypassing MCP auth through alternative endpoints
- Store or handle OAuth tokens manually — the client manages this
- Ask the user to choose between MCP and manual key provision — follow the deterministic flow in each skill
