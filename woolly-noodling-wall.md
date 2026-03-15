# Plan: Unified Auth Flow for Subgraph Deploy

## Context

Currently, `ormi-cli` has separate `auth login` and `auth token` commands that manage a deploy key in `~/.ormi-cli/config.json`. The user wants to:
1. Eliminate auth commands from ormi-cli
2. Use shared config at `~/.ormi/config.json` (directory already exists at `~/.ormi/`)
3. Add an MCP server tool to write deploy keys to the shared config
4. Make the deploy skill more interactive with clarifying questions
5. If no API key exists, direct user to ORMI app to create one

### Config format change

Old: `{"deployKey": "single-key"}`
New: `{"deployKeys": {"project-id-1": "key1", "project-id-2": "key2"}}`

The deploy **skill** (not CLI) reads the config, picks the right key by project, and passes it via `--deploy-key` flag to `ormi-cli`. The CLI code stays simple.

---

## Phase 1: Update ormi-cli Config Path & Remove Auth Commands

### Step 1.1: Change config path to `~/.ormi`

**File:** `src/lib/config.ts`
- Line 5: Change `'.ormi-cli'` to `'.ormi'`
- Remove `setDeployKey()` (lines 16-20) — dead code after auth commands removed
- Remove `writeConfig()` (lines 30-33) — only caller was `setDeployKey()`
- Keep `getDeployKey()` and `readConfig()` — still used by `rpc-client.ts` as fallback

### Step 1.2: Delete auth command files

**Delete:**
- `src/commands/auth/login.ts`
- `src/commands/auth/token.ts`

No `src/commands/auth/index.ts` exists. No test files exist for auth commands.

### Step 1.3: Remove `auth` topic from oclif config

**File:** `package.json` (lines 72-74)
- Remove the `"auth"` topic entry from `oclif.topics`

### Step 1.4: Update error message in deploy command

**File:** `src/commands/deploy.ts` (lines 183-185)
- Change the auth failure message from:
  `'\nRun \`ormi-cli auth login\` to set your deploy key.'`
- To:
  `'\nAdd your deploy key to ~/.ormi/config.json or set ORMI_DEPLOY_KEY env var.\nCreate an API key at https://app.ormilabs.com → Settings → API Keys.'`

### Step 1.5: Regenerate auto-generated files

- Run `npx oclif manifest` to regenerate `oclif.manifest.json`
- Run `npx oclif readme` to regenerate `USAGE.md` (auth commands will be automatically removed)

---

## Phase 2: Add MCP Server Tool — `setup-deploy-key`

**Repo:** `/Users/vineet/git/ormi/subgraph-mcp`

Add a new tool that fetches a project's API token and writes it to `~/.ormi/config.json`.

### Step 2.1: Add params type

**File:** `internal/tools/types.go`

```go
type SetupDeployKeyParams struct {
    ProjectID string `json:"project_id,omitempty" jsonschema:"Project ID to set up deploy key for. Optional if a project is selected via select-project."`
}
```

### Step 2.2: Implement `setup-deploy-key` tool

**New file:** `internal/tools/setup_deploy_key.go`

Tool behavior:
1. **Resolve project ID** — use provided `project_id`, or session-selected project, or:
   - Call `list-projects` API
   - If exactly 1 project → use it automatically
   - If multiple → return error asking user to select one first (via `select-project`)
2. **Fetch existing tokens** — call `/api/access_tokens/query_project_tokens` with the project ID
   - If tokens exist → use the first one's `Key` field
   - If no tokens → return error directing user to create one at ORMI app
3. **Read existing config** — read `~/.ormi/config.json` if it exists, preserve other fields
4. **Write config** — merge `deployKeys` map entry into config:
   ```json
   {"deployKeys": {"<project-id>": "<key>"}}
   ```
   - Create `~/.ormi/` directory with `0700` permissions if needed
   - Write file with `0600` permissions
5. **Return success message** — confirm which project's key was saved

**Reference patterns:**
- `list_project_tokens.go` — API call pattern for fetching tokens
- `select_project.go` — project ID resolution and session management
- `helpers.go` — `resolveProjectID()` helper for project ID fallback logic

### Step 2.3: Register the tool

**File:** `internal/tools/tools.go`
- Add `mcp.AddTool(server, &SetupDeployKeyTool, SetupDeployKey)` to `AddTools()`

### Step 2.4: Handle MCP auth errors in skill

MCP auth sometimes fails silently in AI clients. The deploy skill must:
- Check if MCP tools are available before relying on them
- If MCP auth fails, fall back to manual instructions (direct user to ORMI app)
- Never block the deploy flow due to MCP unavailability

---

## Phase 3: Update Subgraph Deploy Skill

**File:** `skills/subgraph-deploy/SKILL.md`

Complete rewrite with interactive flow modeled after `subgraph-create/SKILL.md`.

### Step 3.1: Gather Deploy Inputs (MANDATORY)

Before deploying, collect and confirm:

| Input | Required | How to Determine |
|-------|----------|------------------|
| Project | Yes | Ask user; use MCP `list-projects` / `select-project` if available |
| Subgraph name | Yes | Confirm with user; check via MCP `search-project-subgraphs` |
| Version label | Yes | Ask user (e.g., "v0.0.1") |
| Deploy key | Yes | Check `~/.ormi/config.json` `deployKeys` map or `ORMI_DEPLOY_KEY` env |

Ask the user:
1. "Which project do you want to deploy to?" (if multiple; auto-select if only one)
2. "What is the subgraph name?"
3. "What version label? (e.g., v0.0.1)"

### Step 3.2: Check Deploy Key

Check if a deploy key is available for the selected project:

1. Read `~/.ormi/config.json` → look up `deployKeys[projectId]`
2. Check `ORMI_DEPLOY_KEY` env var

**If no deploy key found:**

Try MCP first (if authenticated):
- Use `setup-deploy-key` tool to fetch and save the key
- If MCP fails silently or isn't authenticated, fall back to manual instructions

Manual fallback:
> No deploy key found. Create one at [ORMI App](https://app.ormilabs.com) → Settings → API Keys.
> Then add it to `~/.ormi/config.json`:
> ```json
> {"deployKeys": {"your-project-id": "your-api-key"}}
> ```
> Or set: `export ORMI_DEPLOY_KEY=your-api-key`
>
> Let me know when you've added the key.

### Step 3.3: Confirm and Deploy

Summarize before executing:
> | Setting | Value |
> |---------|-------|
> | Project | `<project-name>` |
> | Subgraph | `<subgraph-name>` |
> | Version | `<version-label>` |
> | Deploy key | ✓ |

Then execute:
```bash
ormi-cli deploy <subgraph-name> --deploy-key <key> --version-label <version>
```

### Step 3.4: Remove all auth command references

Replace all mentions of `ormi-cli auth login` / `ormi-cli auth token` with config file or `setup-deploy-key` MCP tool instructions.

---

## Phase 4: Update Other Skills & Documentation

### Step 4.1: Update subgraph-manage skill

**File:** `skills/subgraph-manage/SKILL.md`
- Line 14: Remove `ormi-cli auth token` / `ormi-cli auth login` references
- Line 24: Replace with `setup-deploy-key` MCP tool or config file instructions

### Step 4.2: Update subgraph-create skill

**File:** `skills/subgraph-create/SKILL.md`
- Line 424: Replace `ormi-cli auth login <deploy-key>` with:
  ```
  # Set up deploy key (MCP): use setup-deploy-key tool
  # Or manually: add to ~/.ormi/config.json
  ```

### Step 4.3: Update README.md

**File:** `README.md`
- Line 398: Replace `ormi-cli auth login` with config file / env var / MCP instructions

### Step 4.4: USAGE.md auto-regenerated

`USAGE.md` will be regenerated in Step 1.5 — no manual edits needed.

---

## Files to Modify — Complete List

### ormi-cli (`/Users/vineet/git/ormi/ormi-cli`)

| File | Change |
|------|--------|
| `src/lib/config.ts` | Change path to `~/.ormi`, remove `setDeployKey()` and `writeConfig()` |
| `src/commands/auth/login.ts` | **DELETE** |
| `src/commands/auth/token.ts` | **DELETE** |
| `src/commands/deploy.ts` | Update auth failure error message (line 185) |
| `package.json` | Remove `auth` topic from `oclif.topics` (line 72-74) |
| `oclif.manifest.json` | Regenerate via `npx oclif manifest` |
| `USAGE.md` | Regenerate via `npx oclif readme` |
| `skills/subgraph-deploy/SKILL.md` | Rewrite with interactive flow |
| `skills/subgraph-manage/SKILL.md` | Remove auth command references (lines 14, 24) |
| `skills/subgraph-create/SKILL.md` | Update deploy instructions (line 424) |
| `README.md` | Update auth instructions (line 398) |

### subgraph-mcp (`/Users/vineet/git/ormi/subgraph-mcp`)

| File | Change |
|------|--------|
| `internal/tools/setup_deploy_key.go` | **NEW** — tool to fetch token and write to config |
| `internal/tools/types.go` | Add `SetupDeployKeyParams` struct |
| `internal/tools/tools.go` | Register `setup-deploy-key` tool in `AddTools()` |

### Files NOT modified (intentional):

| File | Reason |
|------|--------|
| `src/lib/rpc-client.ts` | Still uses `getDeployKey()` — works as fallback for `ORMI_DEPLOY_KEY` env var |
| `src/commands/create.ts` | Uses `--deploy-key` flag — no auth command refs |
| `src/commands/remove.ts` | Same as create.ts |
| `src/lib/mcp-config.ts` | `.ormi-cli-backup` is a backup filename suffix, not a config directory |
| `src/commands/ai/doctor.ts` | Same — backup file suffix check |
| `test/lib/mcp-config.test.ts` | Tests backup suffix, not config directory |
| `src/lib/constants.ts` | `AUTH_FAILURE_PATTERN` still needed for deploy error detection |

---

## Verification

1. **ormi-cli build:**
   - `npm run build` — no compile errors
   - `npx oclif manifest` and `npx oclif readme` — complete without errors
   - `npm test` — all existing tests pass

2. **Auth commands removed:**
   - `ormi-cli auth login` → unknown command
   - `ormi-cli auth token` → unknown command
   - `ormi-cli help` → no auth commands listed

3. **MCP tool (`setup-deploy-key`):**
   - Build MCP server: `go build ./cmd/server`
   - Authenticate via MCP client
   - Call `setup-deploy-key` with a project that has tokens
   - Verify `~/.ormi/config.json` contains `{"deployKeys": {"<project-id>": "<key>"}}`
   - Call again with different project → verify both keys in map

4. **End-to-end deploy skill flow:**
   - Start with no `~/.ormi/config.json`
   - Invoke deploy skill → should prompt for project, check for key
   - If MCP authenticated: `setup-deploy-key` writes key → deploy proceeds
   - If MCP not authenticated: shows manual instructions → user adds key → deploy proceeds
   - Verify `--deploy-key <key>` is passed to `ormi-cli deploy`

5. **Direct CLI still works:**
   - `ormi-cli deploy my-subgraph --deploy-key <key> --version-label v0.0.1` → works without config
   - `ORMI_DEPLOY_KEY=<key> ormi-cli deploy my-subgraph --version-label v0.0.1` → works via env var
