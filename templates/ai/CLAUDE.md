<!-- Managed by ormi-cli ai install. -->
# ORMI Claude Instructions

When working in this repository, use the ORMI subgraph skills and keep the workflow centered on `ormi-cli`.

## Use These Skills

Use the installed bundled skills when relevant:

- `subgraph-create` for the full subgraph creation workflow (scaffold, analyze, refine, build)
- `subgraph-deploy` for auth, create, deploy, and post-deploy checks
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

- chain and project discovery
- deployment lookup and status checks
- logs, block stats, entity stats, and query verification

MCP enriches the workflow but never blocks it. If MCP tools fail (authentication
errors, timeouts, not configured), note what was skipped and continue with
CLI-only commands. Guide the user to run `/mcp` to authenticate if they want
MCP features later.

Do not replace the normal `ormi-cli` build/deploy flow with MCP-only instructions.

**Never:**
- Stop or block progress because MCP is not authenticated
- Suggest bypassing MCP auth through alternative endpoints
- Store or handle OAuth tokens manually — the client manages this
