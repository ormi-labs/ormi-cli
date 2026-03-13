<!-- Managed by ormi-cli ai install. -->
# ORMI Claude Instructions

When working in this repository, use the ORMI subgraph skills and keep the workflow centered on `ormi-cli`.

## Use These Skills

Use the installed bundled skills when relevant:

- `subgraph-plan` for ABI and schema planning
- `subgraph-develop` for scaffolding and implementation
- `subgraph-build-test` for codegen, build, test, and local validation
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

Do not replace the normal `ormi-cli` build/deploy flow with MCP-only instructions.

## MCP Authentication

The `subgraph-mcp` server requires OAuth2 authentication. This is mandatory - no workarounds.

**If MCP tools return authentication errors (401, 403, "unauthorized", "token expired"):**

1. **STOP** - Do not attempt workarounds or alternative approaches
2. **Inform the user** - The MCP server requires authentication
3. **Guide them to authenticate:**
   - In Claude Code: Run `/mcp` and select the `subgraph-mcp` server to trigger OAuth flow
   - The client will open a browser for OAuth2 login
4. **Wait for auth** - Do not proceed with MCP-dependent tasks until auth succeeds

**Never:**
- Suggest bypassing MCP auth
- Propose alternative API endpoints to circumvent auth
- Store or handle OAuth tokens manually - the client manages this
