# Ormi CLI — Comprehensive Plan: End-to-End Subgraph Development

## Context

**Goal:** Enable AI-assisted end-to-end subgraph development — from analyzing a contract ABI to a deployed, monitored subgraph on ORMI. This requires CLI commands, development lifecycle skills, and integration with existing MCP tools.

**Current state:**
- **CLI (ormi-cli):** Has `ormi ai install/uninstall/doctor` for configuring AI agents with MCP + skills. No graph-cli commands, no auth, no deploy.
- **MCP server (subgraph-mcp):** 15 user-mode tools covering post-deployment workflows: querying (get-schema, execute-query), discovery (list-projects, search-project-subgraphs, list-chains), and monitoring (get-api-stats, get-block-stats, get-entity-stats, get-subgraph-logs, get-subgraph-status). All read-only.
- **Skills:** 3 skills covering post-deployment: subgraph-query, subgraph-monitor, subgraph-manage.
- **Gap:** The entire development lifecycle (planning, scaffolding, schema design, mapping, building, testing, deploying) has zero coverage in skills or tools.

**Key facts:**
- ORMI uses the same JSON-RPC protocol as graph-node
- Current deploy workflow: `graph deploy <name> --node https://api.subgraph.ormilabs.com/deploy --ipfs https://api.subgraph.ormilabs.com/ipfs --deploy-key <key>`
- Auth is browser-based Firebase OAuth

---

## Architecture Overview

```
AI Agent (Claude Code / Cursor / etc.)
  │
  ├── Skills (teach HOW to do things)
  │   ├── subgraph-plan          ← NEW: ABI analysis, entity design
  │   ├── subgraph-develop       ← NEW: scaffold, schema, mappings
  │   ├── subgraph-build-test    ← NEW: compile, test, debug
  │   ├── subgraph-deploy        ← NEW: deploy to ORMI, version mgmt
  │   ├── subgraph-query         ← EXISTS: query deployed subgraphs
  │   ├── subgraph-monitor       ← EXISTS: monitor health & performance
  │   └── subgraph-manage        ← EXISTS: project & token management
  │
  ├── MCP Tools (remote API access via subgraph-mcp)
  │   ├── get-schema, execute-query, whoami, list-projects, ...  ← EXISTS
  │   └── (read-only — no new tools needed for MVP)
  │
  └── CLI Commands (local operations via ormi-cli)
      ├── ormi init/build/codegen/add/clean/test  ← NEW: graph-cli pass-through
      ├── ormi deploy/create/remove               ← NEW: graph-cli + ORMI defaults
      ├── ormi auth login/token                   ← NEW: Firebase OAuth
      └── ormi ai install/uninstall/doctor        ← EXISTS
```

The AI agent combines skills (knowledge), MCP tools (remote API), and CLI commands (local operations) to provide the full workflow.

---

## Part 1: CLI Commands

### Phase 1A: Add graph-cli dependency + pass-through commands ✅

**Modify `package.json`:**
- Add `"@graphprotocol/graph-cli": "^0.98.1"` to dependencies ✅
- Do NOT add as oclif plugin — import internals directly ✅

**Create re-export wrappers** (one-line files): ✅

| File | Re-exports from | Purpose | Status |
|---|---|---|---|
| `src/commands/init.ts` | `graph-cli/dist/commands/init.js` | Scaffold new subgraph from contract/example | ✅ |
| `src/commands/build.ts` | `graph-cli/dist/commands/build.js` | Compile AS to WASM | ✅ |
| `src/commands/codegen.ts` | `graph-cli/dist/commands/codegen.js` | Generate AS types from schema + ABI | ✅ |
| `src/commands/add.ts` | `graph-cli/dist/commands/add.js` | Add datasource to manifest | ✅ |
| `src/commands/clean.ts` | `graph-cli/dist/commands/clean.js` | Remove generated/ and build/ | ✅ |
| `src/commands/test.ts` | `graph-cli/dist/commands/test.js` | Run Matchstick tests | ✅ |
| `src/commands/local.ts` | `graph-cli/dist/commands/local.js` | Docker-compose local env | ✅ |
| `src/commands/node.ts` | `graph-cli/dist/commands/node.js` | Install graph-node binary | ✅ |

Pattern: `export { default } from '@graphprotocol/graph-cli/dist/commands/init.js';`

### Phase 1B: ORMI deploy/create/remove commands

Since ORMI speaks the same JSON-RPC, subclass graph-cli commands and override defaults.

**Add ORMI constants to `src/lib/constants.ts`:**
```typescript
export const ORMI_NODE_URL = 'https://api.subgraph.ormilabs.com/deploy';
export const ORMI_IPFS_URL = 'https://api.subgraph.ormilabs.com/ipfs';
```

**`src/commands/deploy.ts`** — Subclass graph-cli DeployCommand:
- Override `static flags`: `node` defaults to `ORMI_NODE_URL`, `ipfs` defaults to `ORMI_IPFS_URL`
- Override deploy-key resolution: check `--deploy-key` flag → `ORMI_DEPLOY_KEY` env → `~/.ormi/config.json` → fallback to graph-cli config
- Reference: `/tmp/graph-tooling/packages/cli/src/commands/deploy.ts`

**`src/commands/create.ts`** — Subclass graph-cli CreateCommand:
- Override `node` default to `ORMI_NODE_URL`
- Remove deprecation state
- Reference: `/tmp/graph-tooling/packages/cli/src/commands/create.ts`

**`src/commands/remove.ts`** — Same pattern as create.

**`src/commands/publish.ts`** — Stub initially, TBD when ORMI publish API is defined.

### Phase 1C: Auth + Config (Simplified)

**Philosophy:** Keep auth simple. Deploy is a local operation requiring filesystem access, so CLI must handle it. MCP server provides the primary mechanism for obtaining API keys.

**`src/lib/config.ts`** — `~/.ormi/config.json` management:
- `readConfig()`, `writeConfig()`, `getDeployKey()`, `setDeployKey()`

**`src/commands/auth/login.ts`** — Store deploy key:
1. Accept deploy key as argument or prompt
2. Store in `~/.ormi/config.json`

**`src/commands/auth/token.ts`** — Print stored deploy key, or exit 1 if not set.

**Skill responsibility:** Skills that use CLI commands requiring API keys must verify auth first:
1. Check if deploy key is set locally (via `ormi auth token` or reading config)
2. If not set, use MCP tool to obtain API key
3. Store key using `ormi auth login <key>`
4. Then proceed with the command
5. (Fallback: guide user to ORMI web UI if MCP tool unavailable)

### Phase 1D: Polish
- Delete `src/commands/hello/` placeholder
- Update oclif topics in `package.json`
- Add ORMI branding to help output

---

## Part 2: Development Lifecycle Skills

These are the critical missing pieces. Each skill teaches AI agents how to perform a phase of subgraph development.

### Skill: `subgraph-plan` (NEW)

**Purpose:** Analyze a contract address or ABI and plan the subgraph — what events to index, how to structure entities, what relationships to model.

**When triggered:** User says "I want to index contract 0x1234" or "help me plan a subgraph for this ABI"

**Content outline:**
1. **Starting from a contract address:**
   - Use MCP `list-chains` to confirm the network
   - Use MCP `search-public-subgraphs` to check if similar subgraphs exist
   - If existing subgraph found: use `get-schema` to understand existing patterns
   - Fetch ABI: from the user-provided file, or note that `ormi init --from-contract` will fetch it

2. **ABI analysis workflow:**
   - Identify all events in the ABI
   - For each event: assess data value (is this worth indexing?)
   - Group related events (e.g., Transfer + Approval for ERC-20)
   - Identify common patterns: ERC-20, ERC-721, ERC-1155, AMM, Governance, Staking

3. **Entity design guidelines:**
   - Map events to entities (one entity per core concept, not per event)
   - Design relationships: one-to-many, many-to-many via join entities
   - Aggregation entities for counters/totals (e.g., `DailyVolume`)
   - Immutable entities for historical data (events/transactions)
   - Mutable entities for current state (balances, positions)
   - ID naming conventions: `event.transaction.hash.concatI32(event.logIndex.toI32())`
   - `@derivedFrom` for reverse lookups
   - Use `BigInt`/`BigDecimal` for amounts, `Bytes` for addresses

4. **Output:** A plan document with recommended schema entities, their fields, and which events feed them

**MCP tools used:** `list-chains`, `search-public-subgraphs`, `get-schema`

### Skill: `subgraph-develop` (NEW)

**Purpose:** Scaffold a subgraph project, write `schema.graphql`, and write AssemblyScript mapping handlers.

**When triggered:** User has a plan and wants to create the subgraph code

**Content outline:**
1. **Scaffolding:**
   - `ormi init --from-contract <address> --network <network>` for new project
   - `ormi init --from-example` for learning/templates
   - Project structure: `subgraph.yaml`, `schema.graphql`, `src/mappings/`, `abis/`

2. **Manifest (`subgraph.yaml`) reference:**
   - specVersion, schema, dataSources structure
   - startBlock selection (contract deployment block)
   - Event handlers, call handlers, block handlers
   - Templates for factory patterns (e.g., Uniswap pairs)

3. **Schema design patterns:**
   - Entity definitions with `@entity` directive
   - Immutable entities: `@entity(immutable: true)` for event logs
   - Derived fields: `@derivedFrom(field: "...")`
   - Full-text search: `@fulltext` directive
   - Common field types and when to use them

4. **AssemblyScript mapping patterns:**
   - Event handler signature: `export function handleTransfer(event: Transfer): void`
   - Loading entities: `Entity.load(id)` vs `new Entity(id)`
   - Saving entities: `entity.save()`
   - BigInt/BigDecimal arithmetic
   - Byte array conversions
   - Accessing event parameters: `event.params.fieldName`
   - Accessing block/transaction data: `event.block.timestamp`, `event.transaction.hash`
   - Common pitfalls: null handling, integer overflow, store access patterns

5. **Adding more datasources:**
   - `ormi add <address>` to add additional contracts
   - Manual template creation for factory patterns

6. **After writing code:**
   - `ormi codegen` to generate types from schema + ABI
   - Fix any codegen errors before building

**MCP tools used:** None directly (this is local file operations)

### Skill: `subgraph-build-test` (NEW)

**Purpose:** Build, test, and debug subgraphs locally before deployment.

**When triggered:** User has written subgraph code and wants to verify it works

**Content outline:**
1. **Build workflow:**
   - `ormi codegen` — generate AssemblyScript types (must run after schema/ABI changes)
   - `ormi build` — compile AssemblyScript to WASM
   - Common build errors and fixes:
     - Type mismatches (BigInt vs i32)
     - Missing imports
     - Null reference errors
     - Store access in wrong context

2. **Testing with Matchstick:**
   - `ormi test` — run Matchstick test suite
   - Test file structure: `tests/*.test.ts`
   - Creating mock events: `newMockEvent()`
   - Asserting entity state: `assert.fieldEquals()`
   - Testing patterns: event handler tests, entity relationship tests

3. **Local development environment:**
   - `ormi local` — Docker-based local graph-node
   - Deploy to local node for integration testing
   - Querying local deployment

4. **Debugging common issues:**
   - Compilation errors: type system, null handling, imports
   - Runtime errors: entity not found, store conflicts
   - Mapping logic: verify with test queries after local deploy

**MCP tools used:** None directly (local operations)

### Skill: `subgraph-deploy` (NEW)

**Purpose:** Deploy subgraphs to ORMI infrastructure and manage versions.

**When triggered:** User has a built subgraph and wants to deploy to ORMI

**Content outline:**
1. **Auth prerequisite (run first):**
   - Check if deploy key is set: `ormi auth token`
   - If not set: use MCP tool to obtain API key, then `ormi auth login <key>`
   - Fallback: guide user to ORMI web UI

2. **Pre-deployment checklist:**
   - Ensure `ormi build` succeeds
   - Confirm subgraph name is created: `ormi create <name> --node <node>`

2. **First deployment:**
   ```
   ormi auth login                    # authenticate with ORMI
   ormi create <subgraph-name>        # register the name
   ormi deploy <subgraph-name>        # build + upload + deploy
   ```

3. **Subsequent deployments (version updates):**
   ```
   ormi deploy <subgraph-name> --version-label v0.0.2
   ```

4. **Post-deployment verification:**
   - Use MCP `search-project-subgraphs` to find the deployment
   - Use MCP `get-subgraph-status` to check sync progress
   - Use MCP `get-subgraph-logs` to watch for indexing errors
   - Use MCP `get-block-stats` to track indexing speed
   - Once synced: use MCP `execute-query` to verify data

5. **Monitoring ongoing health:**
   - Direct to subgraph-monitor skill for detailed monitoring
   - Key metrics: sync %, error rate, latency

6. **Common deployment issues:**
   - Auth failures: re-run `ormi auth login`
   - IPFS upload failures: check network connectivity
   - Indexing errors: check logs, fix mapping code, redeploy

**MCP tools used:** `search-project-subgraphs`, `get-subgraph-status`, `get-subgraph-logs`, `get-block-stats`, `execute-query`

---

## Part 3: End-to-End Workflow

This is how all the pieces come together when a user says:
> "I want to index events from contract 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984 on mainnet"

### Step 1: Plan (skill: subgraph-plan)
1. AI uses MCP `list-chains` to confirm "mainnet" = Ethereum mainnet
2. AI uses MCP `search-public-subgraphs` to check for existing Uniswap subgraphs
3. AI analyzes the contract ABI (user provides or `ormi init` fetches)
4. AI recommends entities and schema design
5. User approves the plan

### Step 2: Scaffold (skill: subgraph-develop)
1. AI runs `ormi init --from-contract 0x1f98... --network mainnet`
2. Project structure created with auto-fetched ABI
3. AI writes `schema.graphql` based on plan
4. AI writes AssemblyScript mapping handlers
5. AI runs `ormi codegen` to generate types

### Step 3: Build & Test (skill: subgraph-build-test)
1. AI runs `ormi build` to compile
2. If errors: AI reads build output, fixes code, retries
3. AI writes Matchstick tests
4. AI runs `ormi test` to verify

### Step 4: Deploy (skill: subgraph-deploy)
1. AI checks auth: `ormi auth token` (if not set, use MCP tool to obtain key, then `ormi auth login <key>`)
2. AI creates subgraph: `ormi create <name>`
3. AI deploys: `ormi deploy <name>`
4. AI uses MCP tools to verify deployment status

### Step 5: Monitor (skill: subgraph-monitor, existing)
1. AI monitors sync progress via MCP `get-block-stats`
2. AI checks for errors via MCP `get-subgraph-logs`
3. Once synced, AI verifies data via MCP `execute-query`

---

## File Summary

### Files to create:

**CLI commands:**
```
src/commands/init.ts              # re-export from graph-cli
src/commands/build.ts             # re-export from graph-cli
src/commands/codegen.ts           # re-export from graph-cli
src/commands/add.ts               # re-export from graph-cli
src/commands/clean.ts             # re-export from graph-cli
src/commands/test.ts              # re-export from graph-cli
src/commands/local.ts             # re-export from graph-cli
src/commands/node.ts              # re-export from graph-cli
src/commands/deploy.ts            # subclass graph-cli + ORMI defaults
src/commands/create.ts            # subclass graph-cli + ORMI defaults
src/commands/remove.ts            # subclass graph-cli + ORMI defaults
src/commands/publish.ts           # stub (ORMI publish API TBD)
src/commands/auth/login.ts        # store deploy key
src/commands/auth/token.ts        # print stored key
src/lib/config.ts                 # ~/.ormi/config.json management
```

**Skills:**
```
skills/subgraph-plan/SKILL.md     # ABI analysis, entity design
skills/subgraph-develop/SKILL.md  # scaffold, schema, mappings
skills/subgraph-build-test/SKILL.md  # compile, test, debug
skills/subgraph-deploy/SKILL.md   # deploy to ORMI, version mgmt
```

### Files to modify:
```
package.json                      # add @graphprotocol/graph-cli, oclif topics
src/lib/constants.ts              # add ORMI_NODE_URL, ORMI_IPFS_URL
src/lib/skills.ts                 # add new skills to BUNDLED_SKILLS array
```

**MCP server (subgraph-mcp):**
```
Add tool to obtain/generate deploy key (primary source for auth)
```

### Files to delete:
```
src/commands/hello/               # placeholder
```

---

## Implementation Order

1. **Phase 1: CLI commands** (Part 1A-1D above)
   - Unblocks: Skills can reference `ormi` commands
   - Verification: `ormi build --help`, `ormi deploy --help` work

2. **Phase 2: Development skills** (Part 2)
   - Write `subgraph-plan`, `subgraph-develop`, `subgraph-build-test`, `subgraph-deploy`
   - Add to `BUNDLED_SKILLS` in `src/lib/skills.ts`
   - Verification: `ormi ai install` installs all 7 skills

3. **Phase 3: End-to-end test**
   - Verify: AI agent can go from "index contract 0x..." to deployed subgraph using skills + CLI + MCP tools

---

## Open Questions

1. **Deep imports from graph-cli** — Need to verify `@graphprotocol/graph-cli/dist/commands/deploy.js` is importable (no restrictive `exports` field in their package.json). Checked: graph-cli has no `exports` field, so deep imports should work.
2. **ORMI publish API** — What does the publish flow look like? Stub initially.
3. **MCP tool for API key** — Need MCP tool to obtain/generate deploy keys. What endpoint does this call?
4. **graph-cli peer dependencies** — graph-cli has heavy deps (assemblyscript, docker-compose, gluegun, jayson, kubo-rpc-client). Need to verify these resolve correctly when graph-cli is a dependency of ormi-cli.
