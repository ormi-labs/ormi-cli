---
name: subgraph-deploy
description: Deploy subgraphs to ORMI and verify deployment health
---

# Subgraph Deploy Skill

Deploy a built subgraph to ORMI infrastructure and confirm it is indexing correctly.

## When to Use

User has a built subgraph (`ormi-cli build` succeeds) and wants to deploy to ORMI.

## CLI-First Rule

Use `ormi-cli` for build and deploy commands; use MCP tools for authentication, key retrieval, discovery, and post-deploy inspection.

- Use `ormi-cli codegen`, `ormi-cli build`, and `ormi-cli deploy` for the release flow
- Use MCP tools (`whoami`, `list-projects`, `list-project-tokens`, etc.) for authentication and API key retrieval — there are no CLI equivalents for these operations
- Do not bypass the CLI by describing manual upload steps unless the CLI path has already failed

## Step 1: Authenticate and Get Deploy Key

### 1a: Check MCP Authentication

Call the MCP `whoami` tool (do NOT run `ormi-cli whoami` — this CLI command does not exist):

```json
{
  "tool": "whoami"
}
```

**Branch on result:**

- **`whoami` succeeds** (returns email, name, etc.) → continue to Step 1b
- **`whoami` fails (auth error)** → tell the user:
  > MCP is not authenticated. Run `/mcp` to authenticate with `ormi`, then try again.
  **STOP here. Do not continue. Do not offer alternatives.**
- **MCP server unavailable** (tool not found, connection error) → ask the user:
  > MCP is not available. Please provide your deploy key directly (find it at [ORMI App](https://app.ormilabs.com) → Settings → API Keys), or run `/mcp` to configure MCP first.
  If the user provides a key, use it directly in Step 4. If not, STOP.

### 1b: Resolve Project and Fetch Deploy Key

1. **Resolve project** — call MCP `list-projects`, then `select-project` if needed, or auto-select if only one
2. **Fetch tokens** — call MCP `list-project-tokens` with the project ID
3. **Select token** — use the first token's `Key` field

**If no tokens exist:**
> No API tokens found for this project. Create one at [ORMI App](https://app.ormilabs.com) → Settings → API Keys.
> Then run this deploy again.

## Step 2: Gather Deploy Inputs

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

## Step 3: Ensure the Build is Current

```bash
ormi-cli codegen
ormi-cli build
```

If the build fails, fix the build errors — check the error table in the `subgraph-create-from-contract` skill for common solutions. Do not deploy broken code.

## Step 4: Confirm and Deploy

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

## Step 5: Verify Deployment

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

## Step 6: Subsequent Deployments

For code updates, bump the version label:

```bash
ormi-cli deploy <subgraph-name> --deploy-key <key-from-mcp> --version-label v0.0.2
```

ORMI keeps deployment history. The latest version receives queries by default.

## Step 7: Verify Data (Once Synced)

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
| Auth failure during deploy | Run `/mcp` to authenticate with `ormi`, then retry. If MCP is unavailable, provide `--deploy-key` directly |
| IPFS upload timeout | Check network; retry with `--ipfs` pointing to an alternative node |
| Indexing errors in logs | Fix handler code, redeploy with incremented version label |
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

- `whoami` — verify MCP authentication (MCP tool only — NOT a CLI command)
- `list-projects` / `select-project` — resolve project
- `list-project-tokens` — fetch deploy key
- `search-project-subgraphs` — find the deployment
- `get-subgraph-status` — check sync progress
- `get-subgraph-logs` — watch for indexing errors
- `get-block-stats` — track indexing speed
- `execute-query` — verify indexed data
