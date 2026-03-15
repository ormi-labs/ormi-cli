---
name: subgraph-deploy
description: Deploy subgraphs to ORMI and verify deployment health
---

# Subgraph Deploy Skill

Deploy a built subgraph to ORMI infrastructure and confirm it is indexing correctly.

## When to Use

User has a built subgraph (`ormi-cli build` succeeds) and wants to deploy to ORMI.

## CLI-First Rule

Deploy and auth flows should go through `ormi-cli` first.

- Prefer `ormi-cli build`, `ormi-cli create`, and `ormi-cli deploy` for release flow
- Use MCP tools for API key retrieval, discovery, verification, and post-deploy inspection
- Do not bypass the CLI by describing manual upload steps unless the CLI path has already failed

## MCP Authentication Required

This skill requires MCP authentication to fetch the deploy key. If MCP is not authenticated:

> MCP is not authenticated. Run `/mcp` to authenticate with `subgraph-mcp`, then try again.

The deploy key is fetched at deploy time via MCP `list-project-tokens` — there is no persistent key storage.

## Step 1: Gather Deploy Inputs (MANDATORY)

Before deploying, collect and confirm:

| Input | Required | How to Determine |
|-------|----------|------------------|
| Project | Yes | Ask user; use MCP `list-projects` / `select-project` |
| Subgraph name | Yes | Confirm with user; check via MCP `search-project-subgraphs` |
| Version label | Yes | Ask user (e.g., "v0.0.1") |

**Ask the user:**
1. "Which project do you want to deploy to?" (if multiple; auto-select if only one)
2. "What is the subgraph name?"
3. "What version label? (e.g., v0.0.1)"

## Step 2: Ensure the Build is Current

```bash
ormi-cli codegen
ormi-cli build
```

If the build fails, fix the build errors — check the error table in the `subgraph-create` skill for common solutions. Do not deploy broken code.

## Step 3: Get Deploy Key via MCP

**MCP authentication is required.** If MCP is not authenticated:

> MCP is not authenticated. Run `/mcp` to authenticate with `subgraph-mcp`, then try again.

**Once MCP is authenticated:**

1. **Resolve project** — use `select-project` if needed, or auto-select if only one
2. **Fetch tokens** — call MCP `list-project-tokens` with the project ID
3. **Select token** — use the first token's `Key` field

**If no tokens exist:**
> No API tokens found for this project. Create one at [ORMI App](https://app.ormilabs.com) → Settings → API Keys.
> Then run this deploy again.

## Step 4: Register the Subgraph Name (First Deploy Only)

```bash
ormi-cli create <subgraph-name> --deploy-key <key-from-mcp>
```

This registers the name on the ORMI node. Only needed once per subgraph name. If the name already exists, skip to Step 5.

Format: `username/subgraph-name` or just `subgraph-name`.

## Step 5: Confirm and Deploy

Summarize before executing:

> | Setting | Value |
> |---------|-------|
> | Project | `<project-name>` |
> | Subgraph | `<subgraph-name>` |
> | Version | `<version-label>` |
> | Deploy key | ✓ (from MCP) |

Then execute:

```bash
ormi-cli deploy <subgraph-name> --deploy-key <key-from-mcp> --version-label <version>
```

The deploy command will:
1. Compile the subgraph (if not already built)
2. Upload build artifacts to ORMI IPFS
3. Deploy to the ORMI subgraph node
4. Print the playground and query endpoint URLs

## Step 6: Verify Deployment

Immediately after deploy, check that indexing has started:

**If MCP is available:**
1. Find the deployment: use `search-project-subgraphs` MCP tool
2. Check sync status: use `get-subgraph-status` MCP tool
   - Look for `synced: false` with a non-zero `latestBlock` — indexing is in progress
   - `synced: true` — fully caught up
3. Check for errors: use `get-subgraph-logs` MCP tool
   - Any `ERROR` entries indicate mapping handler failures — fix and redeploy
4. Track indexing speed: use `get-block-stats` MCP tool

**If MCP is unavailable:**
- Query the GraphQL endpoint printed by the deploy command:
  ```bash
  curl -X POST <ENDPOINT_URL> \
    -H "Content-Type: application/json" \
    -d '{"query": "{ _meta { block { number } hasIndexingErrors } }"}'
  ```
- Check the ORMI web UI for deployment status

## Step 7: Subsequent Deployments

For code updates, bump the version label:

```bash
ormi-cli deploy <subgraph-name> --deploy-key <key-from-mcp> --version-label v0.0.2
```

ORMI keeps deployment history. The latest version receives queries by default.

## Step 8: Verify Data (Once Synced)

Once synced, verify the indexed data:

**If MCP is available:** Use the `execute-query` MCP tool with a simple query:
```graphql
{
  transfers(first: 5, orderBy: timestamp, orderDirection: desc) {
    id
    from { id }
    to { id }
    amount
  }
}
```

**If MCP is unavailable:** Query the GraphQL endpoint directly:
```bash
curl -X POST <ENDPOINT_URL> \
  -H "Content-Type: application/json" \
  -d '{"query": "{ transfers(first: 5) { id } }"}'
```

Compare results against on-chain data to confirm correctness.

## Common Issues

| Problem | Fix |
|---|---|
| Auth failure during deploy | Ensure MCP is authenticated, or provide `--deploy-key` directly |
| IPFS upload timeout | Check network; retry with `--ipfs` pointing to an alternative node |
| Indexing errors in logs | Fix handler code, redeploy with incremented version label |
| `subgraph_create` error: name exists | Skip `ormi-cli create` — name already registered |
| Slow indexing | Normal for historical data — monitor with `get-block-stats` |
| No API tokens found | Create one at [ORMI App](https://app.ormilabs.com) → Settings → API Keys |

For ongoing monitoring after deployment, use the `subgraph-monitor` skill.

## Direct CLI Usage (Without Skill)

If the user prefers to deploy directly without the skill:

```bash
# Provide deploy key via flag
ormi-cli deploy <subgraph-name> --deploy-key <key> --version-label v0.0.1

# Or via environment variable
ORMI_DEPLOY_KEY=<key> ormi-cli deploy <subgraph-name> --version-label v0.0.1
```

## MCP Tools Used

- `whoami` — verify authentication
- `list-projects` / `select-project` — resolve project
- `list-project-tokens` — fetch deploy key
- `search-project-subgraphs` — find the deployment
- `get-subgraph-status` — check sync progress
- `get-subgraph-logs` — watch for indexing errors
- `get-block-stats` — track indexing speed
- `execute-query` — verify indexed data
