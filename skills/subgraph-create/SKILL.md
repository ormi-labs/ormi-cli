---
name: subgraph-create
description: Create and scaffold subgraphs for blockchain indexing. Use when user says "create a subgraph", "build a subgraph", "index a contract", "scaffold a subgraph", or "index events from a contract".
---

# Subgraph Create Skill

Create a working subgraph using `ormi-cli init` followed by `ormi-cli abi`. This skill handles the shared setup steps (determine use case, gather inputs, scaffold, fetch ABI, analyze and design, build and verify), then routes to the appropriate specialized skill for the data source configuration.

## When to Use

- User wants to create a subgraph (with or without a contract address)
- User has a **contract address** and wants to scaffold a subgraph
- User wants a **block handler** subgraph (no contract events, indexes block-level data)
- User needs **factory/template pattern** (factory contract deploys child contracts dynamically)
- User wants **multiple contracts** with different ABIs in one subgraph
- User wants **call handlers** (index function calls, not just events)
- User wants **timeseries/aggregation analytics** (daily volumes, hourly snapshots)

## MCP Enrichment (Optional)

MCP tools can provide bonus context but are **never required** to proceed.

**Available enrichment:**

- `list-chains` — verify the network is supported on ORMI
- `search-project-subgraphs` — check if a similar subgraph already exists
- `get-schema` — learn from existing subgraph schemas

**How to use:**

1. If MCP tools are available, try them for additional context
2. If they fail (auth errors, timeouts, not configured):
   - Note to user: "Skipped MCP enrichment (not authenticated). You can run `/mcp` to authenticate later."
   - Continue with CLI-only workflow — do not stop or wait
3. Never block progress due to MCP unavailability

---

## Step 1: Determine Use Case

Ask the user which use case applies:

| #   | Use Case             | Description                                          | Specialized Skill           |
| --- | -------------------- | ---------------------------------------------------- | --------------------------- |
| 1   | **Simple Contract**  | Index events from a single contract                  | `subgraph-create-events`    |
| 2   | **Block Handler**    | Index block-level data (hash, timestamp, gas, miner) | `subgraph-create-handlers`  |
| 3   | **Factory/Template** | Factory creates child contracts dynamically          | `subgraph-create-factory`   |
| 4   | **Multi-Source**     | Multiple contracts with different ABIs               | `subgraph-create-events`    |
| 5   | **Call Handler**     | Index function calls, not just events                | `subgraph-create-handlers`  |
| 6   | **Analytics**        | Timeseries entities, daily/hourly aggregations       | `subgraph-create-analytics` |

> Which use case best describes what you want to build? (You can combine — e.g., Factory + Analytics. For combinations, follow both skills in sequence.)

**For Call Handler (use case 5), immediately warn:**

> **Network Limitation:** Call handlers require the Parity tracing API. They are NOT supported on:
>
> - BNB Chain (BSC)
> - Arbitrum (arbitrum-one, arbitrum-sepolia)
> - Some other L2 networks
>
> Supported networks include Ethereum mainnet, Gnosis, Polygon (matic), Optimism, Base.
> Please confirm your target network supports call handlers before proceeding.

---

## Step 2: Gather Inputs

Collect from the user's message or ask if missing:

| Input            | Required    | Default           | Notes                                                 |
| ---------------- | ----------- | ----------------- | ----------------------------------------------------- |
| Subgraph name    | Yes         | —                 | Used for the subgraph identifier                      |
| Network          | Yes         | —                 | Use network mapping table below                       |
| Target directory | No          | `.` (current dir) | Where to create the project                           |
| Contract address | Conditional | —                 | Required for use cases 1, 3, 4, 5; NOT for block-only |
| Start block      | Conditional | —                 | Auto-detected if using contract address               |

**Network identifiers** — use the primary registry ID:

| Common Name      | `network:` value   |
| ---------------- | ------------------ |
| Ethereum Mainnet | `mainnet`          |
| Arbitrum One     | `arbitrum-one`     |
| Base             | `base`             |
| Optimism         | `optimism`         |
| Polygon          | `matic`            |
| Gnosis           | `gnosis`           |
| BSC              | `bsc`              |
| Avalanche        | `avalanche`        |
| Sepolia          | `sepolia`          |
| Arbitrum Sepolia | `arbitrum-sepolia` |
| Base Sepolia     | `base-sepolia`     |
| Optimism Sepolia | `optimism-sepolia` |

> `ethereum` is NOT valid — use `mainnet` instead.

If MCP is available, use `list-chains` to validate the network name. If not, accept the user's input as-is.

---

## Step 3: Scaffold the Project

`ormi-cli init` supports multiple modes depending on the starting point (also supports `--from-subgraph` for composing from existing deployed subgraphs via IPFS, which is a niche use case):

### 3a: From a contract address (recommended for most use cases)

```bash
ormi-cli init <SUBGRAPH_NAME> <DIRECTORY> --network <NETWORK> --from-contract <ADDRESS> -y
```

This fetches the ABI, auto-detects the start block, and generates a complete scaffold including:

- `subgraph.yaml` with the data source, event handlers, and correct start block
- `schema.graphql` with entity types derived from contract events
- `src/mapping.ts` with event handler stubs
- `abis/<Contract>.json` with the fetched ABI

This automates ABI fetch, start-block detection, and scaffold generation. The AI should still review and enhance the generated schema and mappings for the target use case.

### 3b: From an example subgraph

```bash
ormi-cli init <SUBGRAPH_NAME> <DIRECTORY> --from-example <EXAMPLE_NAME> -y
```

Clones a complete working example from `graphprotocol/graph-tooling`.

### 3c: Empty scaffold (for fully custom subgraphs)

```bash
ormi-cli init <SUBGRAPH_NAME> <DIRECTORY> --network <NETWORK> -y
```

This creates an empty scaffold:

```
├── package.json        # rebranded with ormi-cli commands
├── tsconfig.json       # TypeScript config for AssemblyScript
├── subgraph.yaml       # minimal: specVersion 1.3.0 + schema ref only
├── schema.graphql      # empty
├── abis/               # empty directory
└── src/                # empty directory
```

**Example:**

```bash
ormi-cli init my-subgraph . --network mainnet --from-contract 0x... -y
```

---

## Step 4: Fetch ABI (if contract address provided)

For use cases requiring an ABI (1, 3, 4, 5), use `ormi-cli abi`:

```bash
ormi-cli abi <ADDRESS> --network <NETWORK> --full
```

This returns JSON with:

- `abi` — the ABI array
- `contractName` — the contract name
- `isProxy` — whether it's a proxy contract
- `implementation` — the implementation address (if proxy)
- `startBlock` — the deployment block

**Handle Proxy Contracts:**

- If `isProxy: true`, inform the user:
  > "This is a proxy contract. Using implementation ABI from `<implementation_address>`."
- The `ormi-cli abi` command already fetches the implementation ABI by default

**Save the ABI:**

```bash
# Save to abis/ directory
cp <abi-output> abis/<ContractName>.json
```

---

## Step 5: Analyze and Design

### 5a: Analyze ABI Events

Present the events from the ABI to the user:

```
Found X events in <ContractName>:
1. Transfer(from, to, value) — ERC-20 transfer
2. Approval(owner, spender, value) — ERC-20 approval
3. Swap(sender, amountIn, amountOut, to) — DEX swap
...
```

### 5b: Detect Patterns

Identify common patterns:

- **ERC-20**: Transfer, Approval events
- **ERC-721**: Transfer, Approval, ApprovalForAll events
- **DEX/AMM**: Swap, Mint, Burn, Sync events
- **Lending**: Deposit, Withdraw, Borrow, Repay events

### 5c: Handler/Entity Selection — MANDATORY — NEVER SKIP

> **STOP.** You MUST ask the user what they want to achieve before writing any mapping code.

**Step 1: Ask about the end goal**

Ask the user what they want to achieve:

```
Question: "What do you want to achieve with this subgraph?"
Options:
  ○ Track all transfers/swaps (transaction history)
  ○ Calculate aggregated metrics (daily volume, TVL, prices)
  ○ Track user balances or positions
  ○ Monitor contract state changes
  ○ Index data for a frontend/API
  [Other for custom goal]
```

**Step 2: Based on the goal, suggest the technical approach:**

| Goal                    | Suggested Approach                               |
| ----------------------- | ------------------------------------------------ |
| Transaction history     | Event handlers → immutable entities              |
| Aggregated metrics      | Event handlers + timeseries/aggregation entities |
| User balances/positions | Event handlers + mutable Account entities        |
| Contract state changes  | Function calls (call handlers)                   |
| Frontend/API            | Event handlers + optimized query entities        |
| Custom                  | Discuss requirements, then recommend             |

**Step 3: Confirm the technical implementation**

Present your recommendation with checkboxes for adjustment:

```
"For <goal>, I recommend:
- Handlers: Transfer event, Swap event
- Entities: Transfer (immutable), DailyVolume (timeseries)

Does this look right? Select to adjust:"

Question: "Which events/functions should I use?"
Options:
  ☐ Transfer(from, to, value) — ERC-20 transfer
  ☐ Swap(sender, amountIn, amountOut, to) — DEX swap
  ☐ balanceOf(address) — read token balance
  [multiSelect: true]

Question: "Which entities do you need?"
Options:
  ☐ Transfer — immutable transfer records
  ☐ Account — track balances by address
  ☐ DailyVolume — aggregate daily volume
  ☐ None — just log events, no storage
  [multiSelect: true]
```

**Do NOT proceed until the user confirms:**

- The goal is understood
- The approach (events/functions/both) is agreed
- Specific events/functions are selected
- Entities are confirmed

**Only after confirmation**, proceed to design the schema.

### 5d: Design Schema

Based on the confirmed events and entities:

- Track all transfers? → `Transfer` entity
- Calculate volumes? → `DailyVolume` aggregation entity
- Track user balances? → `Account` entity with balance tracking
- Monitor contract state? → State entity with mutable fields

The specialized skill for your use case provides concrete schema examples.

### 5e: Route to Specialized Skill

Based on the use case selected in Step 1, follow the appropriate specialized skill for Step 6 (data source configuration, schema, and mappings):

| Use Case              | Follow This Skill              |
| --------------------- | ------------------------------ |
| Simple Contract (#1)  | `subgraph-create-events`       |
| Multi-Source (#4)     | `subgraph-create-events`       |
| Block Handler (#2)    | `subgraph-create-handlers`     |
| Call Handler (#5)     | `subgraph-create-handlers`     |
| Factory/Template (#3) | `subgraph-create-factory`      |
| Analytics (#6)        | `subgraph-create-analytics`    |
| **Combination**       | Follow both skills in sequence |

---

## Step 6: Data Source Configuration

> Handled by the specialized skill selected in Step 1. See the routing table in Step 5e above.
> This step covers schema design, mapping handlers, and subgraph.yaml configuration specific to the use case.

---

## Step 7: Build and Verify

### 7a: Install Dependencies

```bash
yarn
# or: npm install
```

### 7b: Run Codegen

```bash
ormi-cli codegen
```

This generates TypeScript types from the ABI and schema.

### 7c: Build

```bash
ormi-cli build
```

If the build succeeds, the subgraph is ready to deploy.

### 7d: Test (Optional)

```bash
ormi-cli test
```

---

## Examples

### Example 1: ERC-20 token tracker

- **User says:** "I want to index transfers from this USDT contract on Ethereum: 0xdAC17F958D2ee523a2206206994597C13D831ec7"
- **Actions:**
  1. Identify as Simple Contract (use case 1) → route to `subgraph-create-events`
  2. Gather: name="usdt-transfers", network="mainnet", address=0xdAC17F...
  3. Run `ormi-cli init usdt-transfers . --network mainnet --from-contract 0xdAC17F958D2ee523a2206206994597C13D831ec7 -y`
  4. Analyze ABI events: Transfer, Approval
  5. Ask user to confirm goal and select events/entities
  6. Follow `subgraph-create-events` for schema and mappings
  7. Build and verify with `ormi-cli codegen && ormi-cli build`
- **Result:** Working subgraph tracking USDT transfers with Transfer and Account entities

### Example 2: DEX with factory pattern

- **User says:** "Index all Uniswap V2 pairs on Base"
- **Actions:**
  1. Identify as Factory/Template (use case 3) → route to `subgraph-create-factory`
  2. Gather: factory address, network="base"
  3. Scaffold and fetch ABI for the factory contract
  4. Follow `subgraph-create-factory` for template-based data source configuration
  5. Build and verify
- **Result:** Subgraph that dynamically indexes each new pair created by the factory

## Troubleshooting

### Build Errors

| Error                                    | Cause                    | Fix                                                    |
| ---------------------------------------- | ------------------------ | ------------------------------------------------------ |
| `Type 'X' is not assignable to type 'Y'` | Type mismatch in mapping | Check generated types in `generated/`                  |
| `Cannot find name 'BigInt'`              | Missing import           | Add `import { BigInt } from '@graphprotocol/graph-ts'` |
| `Entity 'X' has no field 'Y'`            | Schema mismatch          | Update schema.graphql and run codegen                  |

### Runtime Issues

| Issue                | Cause                 | Fix                                     |
| -------------------- | --------------------- | --------------------------------------- |
| Subgraph not syncing | Start block too early | Set `startBlock` to contract deployment |
| Missing events       | Wrong event signature | Copy exact signature from ABI           |
| Null pointer errors  | Entity not found      | Check `load()` returns before accessing |

---

## Quick Reference

```bash
# Scaffold empty project (non-interactive)
ormi-cli init <NAME> <DIR> --network <NETWORK> -y

# Scaffold from contract address
ormi-cli init <NAME> <DIR> --network <NETWORK> --from-contract <ADDRESS> -y

# Fetch ABI
ormi-cli abi <ADDRESS> --network <NETWORK> --full

# Generate types
ormi-cli codegen

# Build subgraph
ormi-cli build

# Deploy
ormi-cli deploy
```
