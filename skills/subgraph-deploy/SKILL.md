---
name: subgraph-deploy
description: Deploy subgraphs to ORMI and verify deployment health
---

# Subgraph Deploy Skill

Deploy a built subgraph to ORMI infrastructure and confirm it is indexing correctly.

## When to Use

User has a built subgraph (`ormi build` succeeds) and wants to deploy to ORMI.

## Step 1: Auth Check

Before anything, confirm a deploy key is available:

```bash
ormi auth token
```

If this fails (no key stored):
1. Use the `whoami` MCP tool to get your ORMI API key
2. Store it: `ormi auth login <key>`
3. Or set the env var: `export ORMI_DEPLOY_KEY=<key>`

Fallback: guide user to ORMI web UI → Settings → API Keys.

## Step 2: Ensure the Build is Current

```bash
ormi build
```

If the build fails, use `subgraph-build-test` to fix it first. Do not deploy broken code.

## Step 3: Register the Subgraph Name (First Deploy Only)

```bash
ormi create <subgraph-name>
```

This registers the name on the ORMI node. Only needed once per subgraph name. If the name already exists, skip to Step 4.

Format: `username/subgraph-name` or just `subgraph-name`.

## Step 4: Deploy

```bash
ormi deploy <subgraph-name>
```

You will be prompted for a version label (e.g. `v0.0.1`). Or pass it directly:

```bash
ormi deploy <subgraph-name> --version-label v0.0.1
```

The deploy command will:
1. Compile the subgraph (if not already built)
2. Upload build artifacts to ORMI IPFS
3. Deploy to the ORMI graph node
4. Print the playground and query endpoint URLs

## Step 5: Verify Deployment

Immediately after deploy, check that indexing has started:

1. Find the deployment: use `search-project-subgraphs` MCP tool
2. Check sync status: use `get-subgraph-status` MCP tool
   - Look for `synced: false` with a non-zero `latestBlock` — indexing is in progress
   - `synced: true` — fully caught up
3. Check for errors: use `get-subgraph-logs` MCP tool
   - Any `ERROR` entries indicate mapping handler failures — fix and redeploy
4. Track indexing speed: use `get-block-stats` MCP tool

## Step 6: Subsequent Deployments

For code updates, bump the version label:
```bash
ormi deploy <subgraph-name> --version-label v0.0.2
```

ORMI keeps deployment history. The latest version receives queries by default.

## Step 7: Verify Data (Once Synced)

Once `get-subgraph-status` shows `synced: true`, verify the data:

```bash
# Use execute-query MCP tool with a simple query:
{
  transfers(first: 5, orderBy: timestamp, orderDirection: desc) {
    id
    from { id }
    to { id }
    amount
  }
}
```

Compare results against on-chain data to confirm correctness.

## Common Issues

| Problem | Fix |
|---|---|
| Auth failure during deploy | Run `ormi auth login` and retry |
| IPFS upload timeout | Check network; retry with `--ipfs` pointing to an alternative node |
| Indexing errors in logs | Fix handler code, redeploy with incremented version label |
| `subgraph_create` error: name exists | Skip `ormi create` — name already registered |
| Slow indexing | Normal for historical data — monitor with `get-block-stats` |

For ongoing monitoring after deployment, use the `subgraph-monitor` skill.

## MCP Tools Used

- `whoami` — obtain API key
- `search-project-subgraphs` — find the deployment
- `get-subgraph-status` — check sync progress
- `get-subgraph-logs` — watch for indexing errors
- `get-block-stats` — track indexing speed
- `execute-query` — verify indexed data
