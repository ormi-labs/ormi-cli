# Plan: Fix Ormi CLI AI Install (Modeled on Context7)

## Context

Ormi CLI's `ai install` command is broken. Context7's `setup` command works perfectly and is used by millions. The root cause is that Ormi's implementation diverges from what agents actually expect in their config files. This plan fixes every discrepancy by aligning Ormi's implementation with Context7's proven approach.

**Source of truth**: Context7 CLI at `tmp/context7/packages/cli/src/`

---

## Phase 1: Restructure Agent Definitions ~~DONE~~

**Status**: COMPLETE. `yarn dev-check` passes.

**Goal**: Replace the flat, inflexible `AgentConfig` type with Context7's agent-centric model where each agent owns its MCP entry format, config key, paths, skills dir, and detection logic.

### 1a. Rewrite `src/lib/types.ts`

**Current** (`types.ts:1-41`):
```ts
// Flat structure. McpConfig has no concept of:
// - Different config keys per agent (mcpServers vs mcp vs mcp_servers)
// - Different entry formats per agent (url vs httpUrl vs serverUrl)
// - Multiple candidate paths (OpenCode has 4 possible config locations)
// - TOML vs JSON config format (Codex uses TOML)
export interface AgentConfig {
  detectInstalled: () => Promise<boolean>
  displayName: string
  globalSkillsDir: string
  mcp?: McpConfig        // Only has configPath.global and configPath.local
  name: string
  skillsDir: string
}

export interface McpConfig {
  configPath: {
    global: string
    local: string
  }
}
```

**Target** (modeled on Context7 `agents.ts:36-54`):
```ts
export type AgentType = 'claude-code' | 'cursor' | 'gemini-cli' | 'codex' | 'opencode'

export interface AgentConfig {
  name: AgentType
  displayName: string

  mcp: {
    projectPaths: string[]       // Multiple candidates, e.g. OpenCode has 4
    globalPaths: string[]        // Multiple candidates
    configKey: string            // 'mcpServers' | 'mcp' | 'mcp_servers'
    buildEntry: (url: string) => Record<string, unknown>  // Agent-specific format
  }

  skill: {
    dir: (scope: 'project' | 'global') => string
  }

  detect: {
    projectPaths: string[]
    globalPaths: string[]
  }
}
```

**Key differences from current**:
- `mcp` is now **required** (not optional) - we only support 5 agents that all have MCP
- `buildEntry(url)` returns the correct JSON object per agent (different field names, presence/absence of `type`). **Note**: Context7 uses `buildEntry(auth: AuthOptions)` to support OAuth/API-key headers — we intentionally simplify to `buildEntry(url: string)` since Ormi doesn't use per-user auth headers. If auth is added later, this signature will need to change.
- `configKey` varies per agent: `mcpServers` (Claude, Cursor, Gemini), `mcp` (OpenCode), `mcp_servers` (Codex)
- `projectPaths` / `globalPaths` are arrays (not single strings) for multi-candidate resolution
- Skills use a `dir(scope)` function instead of separate `skillsDir` / `globalSkillsDir`
- **Drop `SetupOptions` interface** - it is unused (each command parses its own flags via oclif). Remove it entirely.
- **Drop `McpConfig` interface** - replaced by generic `Record<string, unknown>` in the new `readJsonConfig`/`mergeServerEntry` functions.
- Dropped: `antigravity`, `claude-desktop`, `cline`, `continue`, `kilo`, `kiro`, `roo`, `vscode-copilot`, `windsurf` (9 agents removed, none had working MCP)

### 1b. Rewrite `src/lib/agents.ts`

Replace the entire file. Each agent definition comes directly from Context7 `agents.ts:67-206`.

**Agent definitions** (each with exact MCP entry format from Context7):

| Agent | configKey | projectPaths | globalPaths | buildEntry format |
|-------|-----------|-------------|-------------|-------------------|
| **Claude Code** | `mcpServers` | `[".mcp.json"]` | `["~/.claude.json"]` | `{ type: "http", url }` |
| **Cursor** | `mcpServers` | `[".cursor/mcp.json"]` | `["~/.cursor/mcp.json"]` | `{ url }` (no type!) |
| **Gemini CLI** | `mcpServers` | `[".gemini/settings.json"]` | `["~/.gemini/settings.json"]` | `{ httpUrl: url }` (httpUrl, not url!) |
| **OpenCode** | `mcp` | `["opencode.json", "opencode.jsonc", ".opencode.json", ".opencode.jsonc"]` | `["~/.config/opencode/opencode.json", "~/.config/opencode/opencode.jsonc", "~/.config/opencode/.opencode.json", "~/.config/opencode/.opencode.jsonc"]` | `{ type: "remote", url, enabled: true }` |
| **Codex** | `mcp_servers` | `[".codex/config.toml"]` | `["~/.codex/config.toml"]` | `{ type: "http", url }` (TOML output!) |

**Skill directories** (from Context7 `agents.ts` `skill.dir`):

| Agent | Global skills dir | Project skills dir |
|-------|-------------------|-------------------|
| Claude Code | `~/.claude/skills` | `.claude/skills` |
| Cursor | `~/.cursor/skills` | `.cursor/skills` |
| Gemini CLI | `~/.gemini/skills` | `.gemini/skills` |
| OpenCode | `~/.agents/skills` | `.agents/skills` |
| Codex | `~/.agents/skills` | `.agents/skills` |

**Detection paths** (from Context7 `agents.ts` `detect`):

| Agent | projectPaths | globalPaths |
|-------|-------------|-------------|
| Claude Code | `[".mcp.json", ".claude"]` | `["~/.claude"]` |
| Cursor | `[".cursor"]` | `["~/.cursor"]` |
| Gemini CLI | `[".gemini"]` | `["~/.gemini"]` |
| OpenCode | `["opencode.json", "opencode.jsonc", ".opencode.json", ".opencode.jsonc"]` | `["~/.config/opencode"]` |
| Codex | `[".codex"]` | `["~/.codex"]` |

**Functions to implement** (modeled on Context7):
- `getAgent(name: AgentType): AgentConfig` - from `agents.ts:208`
- `ALL_AGENT_NAMES: AgentType[]` - from `agents.ts:212`
- `detectAgents(scope: 'project' | 'global'): Promise<AgentType[]>` - from `agents.ts:223-238`

**Note**: `resolveMcpPath` belongs in `src/lib/mcp-config.ts` (Phase 2), not here — it's config-path resolution, not agent definition. See Phase 2b.

**Functions to remove** (no longer needed):
- `getMcpConfigPath()` - replaced by `resolveMcpPath()` in `mcp-config.ts` (Phase 2b)
- `getSkillsDirectory()` - replaced by `agent.skill.dir(scope)`
- `getMcpCapableAgents()` - all 5 agents are MCP capable
- `getSkillsCapableAgents()` - all 5 agents are skills capable
- `hasExistingInstallation()` - simplify or remove

### 1c. Update `test/lib/agents.test.ts`

Replace all tests to match the new `AgentConfig` structure. Tests should verify:

- Each agent has correct `configKey`
- Each agent's `buildEntry()` produces the correct field names
- `detectAgents` finds agents by their detection paths
- `resolveMcpPath` tests belong in `test/lib/mcp-config.test.ts` (Phase 2g)

---

## Phase 2: Rewrite MCP Config Writer ~~DONE~~

**Status**: COMPLETE. `yarn dev-check` passes. 129 tests passing.

**Goal**: Replace the hardcoded `{ type: 'http', url }` MCP config module with Context7's flexible approach that supports different config keys, JSON comment stripping, TOML, and multi-candidate path resolution.

### 2a. Add JSON comment stripping to `src/lib/mcp-config.ts`

**Context7 reference**: `mcp-writer.ts:4-27`

Add `stripJsonComments()` function that removes `//` and `/* */` comments from JSON before parsing. This is critical because many agent config files (Cursor, VS Code) contain comments.

Current `readMcpConfig` (`mcp-config.ts:80-87`):
```ts
export function readMcpConfig(configPath: string): McpConfig {
  if (!existsSync(configPath)) return {}
  const content = readFileSync(configPath, 'utf8')
  return JSON.parse(content) as McpConfig  // CRASHES on commented JSON
}
```

Replace with generic `readJsonConfig` that strips comments:
```ts
function stripJsonComments(text: string): string {
  // Copy from Context7 mcp-writer.ts:4-27 - exact same logic
  // Handles string preservation, // comments, /* */ comments
}

export function readJsonConfig(filePath: string): Record<string, unknown> {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch {
    return {}
  }
  raw = raw.trim()
  if (!raw) return {}
  return JSON.parse(stripJsonComments(raw))
}
```

### 2b. Add `resolveMcpPath` to `src/lib/mcp-config.ts`

**Context7 reference**: `mcp-writer.ts:64-72`

```ts
export async function resolveMcpPath(candidates: string[]): Promise<string> {
  // Check each candidate path, return first that exists on disk
  // If none exist, return the first candidate (it will be created)
}
```

### 2c. Add generic `mergeServerEntry` that accepts `configKey` parameter

**Context7 reference**: `mcp-writer.ts:43-62`

**Note**: Also add `removeServerEntry(existing, configKey, serverName)` for uninstall support.

Current code hardcodes `mcpServers` as the config key. Replace with:
```ts
export function mergeServerEntry(
  existing: Record<string, unknown>,
  configKey: string,           // 'mcpServers' | 'mcp' | 'mcp_servers'
  serverName: string,
  entry: Record<string, unknown>
): { config: Record<string, unknown>; alreadyExists: boolean }
```

### 2d. Add TOML support for Codex

**Context7 reference**: `mcp-writer.ts:82-160`

No TOML parser library is needed — Context7 uses string manipulation for both read and write.

Codex uses TOML config at `~/.codex/config.toml`. Need:
- `appendTomlServer(filePath, serverName, entry)` - appends/replaces TOML block
- `removeTomlServer(filePath, serverName)` - removes TOML block (regex-based, no parser needed)
- `buildTomlServerBlock(serverName, entry)` - builds TOML section string

TOML format expected:
```toml
[mcp_servers.subgraph-mcp]
type = "http"
url = "https://mcp.subgraph.ormilabs.com"
```

### 2e. Add trailing newline to written config files

**Context7 reference**: `mcp-writer.ts:79` - `JSON.stringify(config, null, 2) + "\n"`

Current code (`mcp-config.ts:150`) doesn't add trailing newline:
```ts
writeFileSync(configPath, JSON.stringify(config, undefined, 2))  // No \n at end
```

Fix to: `JSON.stringify(config, undefined, 2) + '\n'`

### 2f. Update `configureMcpServer` to accept agent config

Replace the current signature:
```ts
configureMcpServer(configPath: string, url: string): Result
```

With a new signature that takes the full agent config so it can:
1. Use `agent.mcp.configKey` (not hardcoded `mcpServers`)
2. Use `agent.mcp.buildEntry(url)` (agent-specific entry format)
3. Detect `.toml` extension and use TOML writer instead of JSON

```ts
configureMcpServer(
  agent: AgentConfig,
  scope: 'project' | 'global',
  url: string,
  serverName?: string,  // defaults to 'subgraph-mcp', pass 'admin-mcp' for admin mode
  cwd?: string
): Result
```

**Admin MCP support**: The current `configureAdminMcpServer()` function uses a separate server name (`admin-mcp`) and URL (`ADMIN_MCP_URL`). Rather than keeping a separate function, fold admin support into `configureMcpServer` via the optional `serverName` parameter. The `--admin` flag in `install.ts` passes `serverName: 'admin-mcp'` and `url: ADMIN_MCP_URL`. Similarly, add `unconfigureMcpServer(agent, scope, serverName?, cwd?)` for removal.

### 2g. Update `test/lib/mcp-config.test.ts`

Add tests for:
- JSON with comments is parsed correctly
- Different config keys work (`mcpServers`, `mcp`, `mcp_servers`)
- TOML config is written correctly for Codex
- Agent-specific entry formats are correct
- Trailing newline is present in output

---

## Phase 3: Fix Skills Installation (Drop Symlinks)

**Goal**: Replace symlink-first approach with direct file copy (like Context7's `installSkillFiles`).

### 3a. Rewrite `installSkill` in `src/lib/skills.ts`

**Context7 reference**: `installer.ts:6-26`

Current flow (`skills.ts:112-175`):
1. Remove existing skill directory
2. Try `symlinkSync` first
3. Fall back to `writeFileSync`

Problem: Symlinks break when the npm package is updated/reinstalled because the symlink target no longer exists.

New flow (copy Context7's approach):
1. Create target directory
2. Copy SKILL.md content directly (no symlink)
3. No directory removal needed before write

Change in `installSkill` function (`skills.ts:141-153`):
```ts
// REMOVE this symlink block:
try {
  symlinkSync(sourcePath, targetFile)
  return { ... }
} catch {}

// KEEP only this copy block:
mkdirSync(targetDirectory, { recursive: true })
writeFileSync(targetFile, skillContent)
```

Also remove `symlinkSync` from the import (`skills.ts:7`).

### 3b. Update `test/lib/skills.test.ts`

Add test verifying:
- Skills are regular files (not symlinks)
- Skill content matches bundled content exactly
- Reinstall overwrites existing skill

---

## Phase 4: Update Install/Uninstall Commands

**Goal**: Update `install.ts` and `uninstall.ts` to work with the new agent model.

### 4a. Rewrite `src/commands/ai/install.ts`

Key changes:
1. **Import new agent functions**: `getAgent`, `ALL_AGENT_NAMES`, `detectAgents`, `resolveMcpPath` instead of old ones
2. **MCP configuration loop** - use new `configureMcpServer(agent, scope, url)` signature
3. **Skills directory** - use `agent.skill.dir(scope)` instead of `getSkillsDirectory()`
4. **Agent selection** - only 5 agents, all have MCP + skills
5. **Remove `getCapabilityLabel`** - all agents have same capabilities now
6. **Project instruction files** - keep for claude-code (CLAUDE.md) and codex (AGENTS.md)

**Context7 reference flow** (`setup.ts:263-350`):
```
For each agent:
  1. Resolve MCP path from candidates: resolveMcpPath(agent.mcp.globalPaths/projectPaths)
  2. If .toml -> appendTomlServer()
     If .json -> readJsonConfig() + mergeServerEntry(configKey, buildEntry(url)) + writeJsonConfig()
  3. Install skill: agent.skill.dir(scope) + write SKILL.md
  4. Install project instructions (for local installs)
  5. Verify (for global installs)
```

### 4b. Rewrite `src/commands/ai/uninstall.ts`

Same structural changes as install:
1. Use new agent model
2. Use `readJsonConfig` with comment stripping
3. Use correct config keys per agent
4. **TOML uninstall for Codex**: No TOML parser library is needed. Use the same regex approach as Context7's `appendTomlServer` replacement logic — find the `[mcp_servers.subgraph-mcp]` section header, then remove all lines up to the next `[` section header (or end of file), including any subsections like `[mcp_servers.subgraph-mcp.http_headers]`. Add `removeTomlServer(filePath, serverName)` to `mcp-config.ts` alongside `appendTomlServer`.

### 4c. Rewrite `src/commands/ai/doctor.ts`

Update to use new agent model and config reading. Use `readJsonConfig` (with comment stripping) and `agent.mcp.configKey` to read per-agent configs correctly.

### 4d. Update `src/lib/verify.ts`

Currently only 3 agents have CLI verification commands (claude-code, codex, gemini-cli). Update to:
1. Use new `AgentType` from the 5-agent set
2. Keep existing verification for claude-code (`claude mcp get subgraph-mcp`), codex (`codex mcp list --json`), and gemini-cli (`gemini mcp list`)
3. For Cursor and OpenCode: return `{ available: false, verified: false, message: "No CLI verification available" }` — neither has a CLI command to list MCP servers
4. Accept optional `serverName` parameter (for admin MCP verification)

---

## Phase 5: Verify and Test

### 5a. Unit tests

Run: `yarn test`

Verify:
- `test/lib/mcp-config.test.ts` - JSON comments, different config keys, TOML, entry formats
- `test/lib/agents.test.ts` - Agent definitions, path resolution, detection
- `test/lib/skills.test.ts` - No symlinks, direct copy
- `test/lib/project-instructions.test.ts` - Update for gemini-cli → GEMINI.md and opencode → AGENTS.md mappings

### 5b. Manual integration test

For each of the 5 agents, test:
```bash
# Global install
ormi-cli ai install -a <agent> -g -y

# Verify config file was written correctly:
# Claude Code: cat ~/.claude.json  (should have mcpServers.subgraph-mcp with type:http, url)
# Cursor: cat ~/.cursor/mcp.json  (should have mcpServers.subgraph-mcp with url only, no type)
# Gemini: cat ~/.gemini/settings.json  (should have mcpServers.subgraph-mcp with httpUrl, not url)
# Codex: cat ~/.codex/config.toml  (should have [mcp_servers.subgraph-mcp] TOML block)
# OpenCode: cat <resolved-config>  (should have mcp.subgraph-mcp with type:remote, enabled:true)

# Local install
ormi-cli ai install -a <agent> -y

# Uninstall
ormi-cli ai uninstall -a <agent> -g -y
```

### 5c. Build

```bash
yarn build
```

---

## File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `src/lib/types.ts` | **Rewrite** - New `AgentConfig` with `mcp.configKey`, `mcp.buildEntry`, `mcp.projectPaths/globalPaths` arrays, `skill.dir()` | 1a |
| `src/lib/agents.ts` | **Rewrite** - 5 agents only, each with exact Context7 MCP format, paths, detection | 1b |
| `src/lib/mcp-config.ts` | **Rewrite** - Add `stripJsonComments`, `readJsonConfig`, `resolveMcpPath`, `mergeServerEntry(configKey)`, `removeServerEntry`, TOML support (`appendTomlServer`, `removeTomlServer`), trailing newline, admin MCP via `serverName` param | 2a-2g |
| `src/lib/skills.ts` | **Edit** - Remove symlink, keep only direct copy | 3a |
| `src/commands/ai/install.ts` | **Rewrite** - Use new agent model, new MCP writer, new skills dir resolution | 4a |
| `src/commands/ai/uninstall.ts` | **Rewrite** - Same structural changes | 4b |
| `src/commands/ai/doctor.ts` | **Edit** - Update imports and config reading | 4c |
| `src/lib/verify.ts` | **Edit** - Update for 5-agent `AgentType`, keep verification for claude-code/codex/gemini-cli, no-op for cursor/opencode, optional `serverName` for admin | 4d |
| `src/lib/constants.ts` | **No change** | - |
| `src/lib/project-instructions.ts` | **Edit** - Update `getProjectInstructionFilesForAgent` mapping: add `gemini-cli → ['GEMINI.md']` and `opencode → ['AGENTS.md']`. Add bundled `GEMINI.md` template to `/templates/ai/`. Cursor has no project instruction convention — returns `[]`. | 4a |
| `test/lib/types reference` | All tests update to match new interfaces | 1c, 2g, 3b |
| `/templates/ai/GEMINI.md` | **New** - Bundled project instruction template for Gemini CLI | 4a |

---

## Agents Being Dropped

These 9 agents are removed because they either have no MCP support, no proven config paths, or were never tested:

| Dropped Agent | Reason |
|--------------|--------|
| `antigravity` | Niche agent, no Context7 equivalent |
| `claude-desktop` | Desktop app, different config model (not in Context7) |
| `cline` | No standard MCP config path |
| `continue` | No standard MCP config path |
| `kilo` | No standard MCP config path |
| `kiro` | No standard MCP config path |
| `roo` | No standard MCP config path |
| `vscode-copilot` | Config path varies by platform, not in Context7's 5 |
| `windsurf` | Config format uncertain, not in Context7's 5 |

**Deprecation handling**: If a user passes `-a windsurf` (or any dropped agent), the CLI should print a clear error: `Agent "windsurf" is no longer supported. Supported agents: claude-code, cursor, gemini-cli, codex, opencode`. Additionally, `detectAgents` should warn if it finds config files for dropped agents on disk (e.g. `~/.codeium/windsurf`) so users know those are no longer managed.

---

## Migration: Existing Installs with Wrong Format

Users who previously ran `ormi-cli ai install` for Cursor or Gemini have the wrong MCP entry format (the old code wrote `{ type: "http", url }` for all agents). The new `configureMcpServer` uses `mergeServerEntry` which overwrites the existing `subgraph-mcp` entry when `alreadyExists` is true. So a simple re-run of `ormi-cli ai install` will correct the format — no manual cleanup needed. The `doctor` command should detect format mismatches (e.g. Cursor config has `type` field, or Gemini config uses `url` instead of `httpUrl`) and advise re-running install.

---

## Critical MCP Entry Formats (Reference Table)

This is the single most important thing to get right. Each agent expects different fields:

```
Claude Code:  { "type": "http", "url": "https://..." }
Cursor:       { "url": "https://..." }                    // NO type field
Gemini CLI:   { "httpUrl": "https://..." }                // httpUrl not url
OpenCode:     { "type": "remote", "url": "...", "enabled": true }
Codex:        TOML: [mcp_servers.subgraph-mcp]\ntype = "http"\nurl = "..."
```
