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

- Prefer `ormi-cli auth token` and `ormi-cli auth login` for auth state
- Prefer `ormi-cli build`, `ormi-cli create`, and `ormi-cli deploy` for release flow
- Use MCP tools mainly for discovery, verification, and post-deploy inspection
- Do not bypass the CLI by describing manual upload steps unless the CLI path has already failed

## MCP Enrichment (Optional)

The deploy flow itself is entirely CLI-based and does not require MCP. MCP tools
provide optional post-deploy verification.

**Post-deploy verification tools (optional):**
- `search-project-subgraphs` — find the deployment
- `get-subgraph-status` — check sync progress
- `get-subgraph-logs` — watch for indexing errors
- `get-block-stats` — track indexing speed
- `execute-query` — verify indexed data

**If MCP is unavailable:**
1. Deploy proceeds normally via CLI
2. For verification without MCP:
   - Query the GraphQL endpoint directly (URL printed by deploy command)
   - Check status in the ORMI web UI
3. Note to user: "Post-deploy verification was skipped (MCP not authenticated).
   Run `/mcp` to authenticate for deployment health checks."

## Step 1: Auth Check

Before anything, confirm a deploy key is available:

```bash
ormi-cli auth token
```

If this fails (no key stored):
1. If MCP is available, try the `whoami` MCP tool to get your ORMI API key
2. If MCP is unavailable, guide user to ORMI web UI → Settings → API Keys
3. Store the key: `ormi-cli auth login <key>`
4. Or set the env var: `export ORMI_DEPLOY_KEY=<key>`

## Step 2: Ensure the Build is Current

```bash
ormi-cli codegen
ormi-cli build
```

If the build fails, fix the build errors — check the error table in the `subgraph-create` skill for common solutions. Do not deploy broken code.

## Step 3: Register the Subgraph Name (First Deploy Only)

```bash
ormi-cli create <subgraph-name>
```

This registers the name on the ORMI node. Only needed once per subgraph name. If the name already exists, skip to Step 4.

Format: `username/subgraph-name` or just `subgraph-name`.

## Step 4: Deploy

```bash
ormi-cli deploy <subgraph-name>
```

You will be prompted for a version label (e.g. `v0.0.1`). Or pass it directly:

```bash
ormi-cli deploy <subgraph-name> --version-label v0.0.1
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
ormi-cli deploy <subgraph-name> --version-label v0.0.2
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
| Auth failure during deploy | Run `ormi-cli auth login` and retry |
| IPFS upload timeout | Check network; retry with `--ipfs` pointing to an alternative node |
| Indexing errors in logs | Fix handler code, redeploy with incremented version label |
| `subgraph_create` error: name exists | Skip `ormi-cli create` — name already registered |
| Slow indexing | Normal for historical data — monitor with `get-block-stats` |

For ongoing monitoring after deployment, use the `subgraph-monitor` skill.

## MCP Tools Used

- `whoami` — obtain API key
- `search-project-subgraphs` — find the deployment
- `get-subgraph-status` — check sync progress
- `get-subgraph-logs` — watch for indexing errors
- `get-block-stats` — track indexing speed
- `execute-query` — verify indexed data
