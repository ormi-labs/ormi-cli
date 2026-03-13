---
name: subgraph-manage
description: Manage subgraph projects and access
---

# Subgraph Manage Skill

This skill teaches you how to manage subgraph projects, navigate the project hierarchy, and handle API access tokens.

## CLI-First Rule

Prefer `ormi-cli` CLI commands for local project management tasks, and use MCP tools for hosted project discovery and account-aware inspection.

- Use `ormi-cli auth token` or `ormi-cli auth login` when the task is about the local deploy key
- Use MCP project tools when the task is about remote projects, teams, tokens, or deployments
- If the user is asking to manage a local subgraph repo, check whether `ormi-cli create`, `ormi-cli deploy`, or `ormi-cli remove` is the more direct path before reaching for MCP

## MCP Authentication Required

All MCP tools in this skill require OAuth2 authentication. If you receive authentication errors:

| Error | Action |
|-------|--------|
| 401 Unauthorized | User needs to authenticate via `/mcp` command |
| 403 Forbidden | Token may be expired - re-authenticate |
| "unauthorized" | OAuth flow not completed - guide user to authenticate |
| "token expired" | Refresh token failed - re-authenticate |

**When auth fails:**
1. STOP - Do not attempt workarounds
2. Tell the user: "The subgraph-mcp server requires authentication"
3. Guide them: "Run `/mcp` and select `subgraph-mcp` to authenticate"
4. Wait for successful auth before continuing

## Overview

Subgraphs are organized into projects. Understanding this hierarchy is essential for discovering and managing your deployments.

## Tools Used

- `whoami` - Verify authentication and user identity
- `list-projects` - Get all projects belonging to the authenticated user
- `search-project-subgraphs` - Find deployments within a project
- `list-project-tokens` - Manage API access tokens for a project

## Project Hierarchy

```
User Account
├── Personal Projects
│   └── Subgraph Deployments
└── Team Projects
    └── Subgraph Deployments
```

## Workflow

### Step 1: Verify Authentication

Always start by verifying the user is authenticated:

```json
{
  "tool": "whoami"
}
```

**Returns:**
- Email
- Name
- Level
- Creator level

If authentication fails, the user needs to complete the OAuth 2.0 flow first.

### Step 2: List Projects

Get all projects the user has access to:

```json
{
  "tool": "list-projects"
}
```

**Returns:**
- Project ID (needed for most other tools)
- Project name
- Type (personal/team)
- Team role (for team projects)
- Timestamps

### Step 3: Handle Multi-Project Users

**If user has multiple projects:**
- Present the list of projects
- Ask which project to work with
- Use the selected project's ID for subsequent operations

**If user has only one project:**
- Use it automatically without asking

**Example workflow:**
```
1. Call list-projects
2. If >1 project: "Which project would you like to use?"
3. Store the project_id for subsequent calls
```

### Step 4: Explore Project Subgraphs

Once you have a project ID, discover its subgraphs:

```json
{
  "tool": "search-project-subgraphs",
  "parameters": {
    "project_id": "your-project-id",
    "search": "optional-search-term",
    "status": "live",
    "chain_name": "optional-chain-filter"
  }
}
```

**Filter options:**
- `search`: Partial match on name, chain_name, or deploy_version
- `status`: live, paused, syncing, error, warning
- `chain_name`: Exact match on chain name
- `limit`: Max results (default 50)
- `offset`: Pagination offset

### Step 5: Manage API Tokens

Retrieve API access tokens for a project:

```json
{
  "tool": "list-project-tokens",
  "parameters": {
    "project_id": "your-project-id"
  }
}
```

**Returns:**
- Token name
- Expiration time
- Rate limits
- Project scope

**Note:** The actual token key is only returned at creation time and cannot be retrieved afterward.

## Project Types

### Personal Projects
- Owned by individual user
- Full control over all operations
- No team role management

### Team Projects
- Shared among team members
- Roles: owner, admin, member, viewer
- Role determines available operations

## Subgraph Discovery: Project vs Public

### search-project-subgraphs
Use for your own projects:
- Shows all visible deployments
- Full operational details
- Requires project_id

### search-public-subgraphs
Use for exploring public subgraphs:
- Only shows subgraphs with `authorized_open=true`
- From all users
- No project_id required

```json
{
  "tool": "search-public-subgraphs",
  "parameters": {
    "keyword": "uniswap",
    "chain": "mainnet"
  }
}
```

## Common Scenarios

### "Show me my subgraphs"
```
1. whoami (verify auth)
2. list-projects (get project IDs)
3. For each project: search-project-subgraphs
4. Present combined results
```

### "Find my Uniswap subgraphs"
```
1. list-projects
2. For each project: search-project-subgraphs with search="uniswap"
3. Present matching results
```

### "Get API tokens for my project"
```
1. list-projects
2. Select project (ask if multiple)
3. list-project-tokens
```

### "What chains are my subgraphs on?"
```
1. list-projects
2. For each project: search-project-subgraphs
3. Extract unique chain_name values
```

## Best Practices

1. **Always verify auth first** - Use `whoami` before other operations
2. **Cache project IDs** - Store project_id after listing to avoid repeated calls
3. **Present choices clearly** - When multiple projects exist, show names and types
4. **Handle empty results** - Gracefully inform when no subgraphs or tokens found
5. **Respect project scope** - API tokens are project-specific

## Global Project ID Rule

For ALL tools requiring `project_id`:
- **Multiple projects:** ASK which project to use
- **Single project:** Use it automatically

This applies to:
- `search-project-subgraphs`
- `list-project-tokens`
- `get-subgraph-status`
