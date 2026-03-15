---
name: subgraph-create-from-contract
description: Create a complete subgraph from a contract address — scaffold, analyze ABI, refine schema and mappings, build, and verify
---

# Subgraph Create From Contract Skill

Create a working subgraph from a contract address in a single workflow: scaffold, analyze, refine, build.

## When to Use

- User says "Create a subgraph for contract 0x..." or similar
- User wants to go from contract address to working, buildable subgraph in one flow
- User says "Initialize a new ORMI subgraph project"

## CLI-First Rule

Use `ormi-cli` to scaffold and update the project wherever possible.

- Use `ormi-cli init` to create the initial project
- Use `ormi-cli add` to add new contracts or data sources
- Use `ormi-cli codegen` after schema or ABI changes
- Use `ormi-cli build` for compile verification
- Do not hand-write `subgraph.yaml`, `schema.graphql`, or mappings from scratch when
  `ormi-cli` can create the baseline first

## MCP Enrichment (Optional)

MCP tools can provide bonus context but are **never required** to proceed.

**Available enrichment:**
- `list-chains` — verify the network is supported on ORMI
- `search-project-subgraphs` — check if a subgraph already exists for this contract
- `get-schema` — learn from existing subgraph schemas

**How to use:**
1. If MCP tools are available, try them for additional context
2. If they fail (auth errors, timeouts, not configured):
   - Note to user: "Skipped MCP enrichment (not authenticated). You can run `/mcp`
     to authenticate later for additional context."
   - Continue with CLI-only workflow — do not stop or wait
3. Never block progress due to MCP unavailability

## Step 1: Gather Inputs

Collect from the user's message or ask if missing:

| Input | Required | Default |
|-------|----------|---------|
| Contract address | Yes | — |
| Network | Yes | — |
| Protocol | No | ethereum |
| Subgraph name | No | Derive from contract name or address |
| Target directory | No | `.` (current working directory) |

**Network identifiers** — `--network` requires the primary registry ID, not common names:

| Common Name | `--network` value |
|---|---|
| Ethereum Mainnet | `mainnet` |
| Arbitrum One | `arbitrum-one` |
| Base | `base` |
| Optimism | `optimism` |
| Polygon | `matic` |
| Gnosis | `gnosis` |
| BSC | `bsc` |
| Avalanche | `avalanche` |
| Sepolia | `sepolia` |
| Arbitrum Sepolia | `arbitrum-sepolia` |
| Base Sepolia | `base-sepolia` |
| Optimism Sepolia | `optimism-sepolia` |

Common mistake: `ethereum` is NOT valid — use `mainnet` instead.
If MCP is available, use `list-chains` to validate the network name.
If MCP is not available, accept the user's network name as-is.

## Step 2: Scaffold with ormi-cli init

Run non-interactive init with all required arguments:

```bash
ormi-cli init <SUBGRAPH_NAME> . \
  --from-contract <ADDRESS> \
  --network <NETWORK> \
  --protocol <PROTOCOL> \
  --skip-install \
  --skip-git
```

**Generated project structure:**
```
├── subgraph.yaml        # manifest
├── schema.graphql       # entity definitions
├── src/
│   └── <contract>.ts    # AssemblyScript event handlers
├── abis/
│   └── <Contract>.json  # contract ABI
├── networks.json        # network configuration
├── package.json         # rebranded to use ormi-cli
└── tsconfig.json
```

## Step 2.5: Install Dependencies (REQUIRED)

If you used `--skip-install`, you MUST install dependencies before running codegen or build.

> ⚠️ **Known Issue: ormi-cli npm dependency**
>
> `ormi-cli init` generates a `package.json` with `"ormi-cli": "0.1.0"` as a dependency.
> If `ormi-cli` is not yet published to npm, `npm install` will fail with a 404 error.
>
> **Workaround:** Update `package.json` to use a local `file:` path before running `npm install`:
>
> ```json
> // Replace:
> "ormi-cli": "0.1.0"
>
> // With (adjust path to your local checkout):
> "ormi-cli": "file:/path/to/ormi-cli"
> ```

```bash
# After scaffolding, if ormi-cli is not on npm, update package.json first
# Then run:
npm install
```

**Recommended workflow:**
```bash
# Option A - Let init install (simpler, no extra step needed):
ormi-cli init <SUBGRAPH_NAME> . --from-contract 0x... --network mainnet --protocol ethereum --skip-git

# Option B - Skip install, install manually (faster, but extra step):
# If ormi-cli is unpublished, configure package.json to use a local file: path first
ormi-cli init <SUBGRAPH_NAME> . --from-contract 0x... --network mainnet --protocol ethereum --skip-install --skip-git
# Edit package.json to point ormi-cli to local file: path
npm install  # <-- REQUIRED before codegen!
```

## Step 3: Analyze the ABI

Read the generated ABI file from `abis/` and analyze its contents.

### 3a: Proxy Detection

Check for proxy contract indicators:

**Proxy signals (ABI contains):**
- Events: `AdminChanged`, `Upgraded`, `BeaconUpgraded`
- Functions: `implementation()`, `upgradeTo()`, `upgradeToAndCall()`

**Combined with absence of domain events** (no `Transfer`, `Swap`, `Deposit`, etc.)
and **few total events** (< 5).

**If proxy detected:**
1. Tell the user: "This appears to be a proxy contract. The ABI contains
   upgrade/admin events but lacks business logic events."
2. Suggest: "The implementation contract's ABI is needed. You can:
   - Find the implementation address on the block explorer (Read as Proxy → Implementation Address)
   - Provide the implementation ABI file manually
   - Re-run with the implementation address: `ormi-cli init ... --from-contract <impl-address>`"
3. Ask: "Would you like to provide the implementation address or ABI, or proceed
   with the proxy ABI as-is?"
4. If user provides implementation ABI, use `ormi-cli add <impl-address>` or re-scaffold.

### 3b: Contract Pattern Detection

Identify the contract type by checking for known event signatures:

| Pattern | Key Events | Suggested Entities |
|---------|-----------|-------------------|
| **ERC-20 Token** | `Transfer(address,address,uint256)`, `Approval(address,address,uint256)` | Account, Transfer, Approval |
| **ERC-721 NFT** | `Transfer(address,address,uint256)`, `ApprovalForAll(address,address,bool)` | Token, Owner, Transfer |
| **ERC-1155 Multi-Token** | `TransferSingle`, `TransferBatch`, `URI` | Token, Balance, Transfer |
| **AMM/DEX** | `Swap`, `Mint`, `Burn`, `Sync` | Pool, Token, Swap, LiquidityPosition |
| **Governance** | `ProposalCreated`, `VoteCast`, `ProposalExecuted` | Proposal, Vote, Governor |
| **Staking** | `Staked`, `Withdrawn`, `RewardPaid`/`RewardClaimed` | Staker, StakePosition, Reward |
| **Lending** | `Deposit`, `Borrow`, `Repay`, `Liquidation` | Market, Position, LiquidationEvent |

**When a pattern is detected:**
1. Tell the user: "This contract matches the **[pattern]** pattern based on
   events: [list matching events]."
2. Suggest entities and indexing approach for that pattern
3. Ask: "Do you want to index all these events, or focus on specific ones?"

**When no pattern matches:**
1. List all events found in the ABI with a brief description of each
2. Ask: "Which of these events do you want to index?"

### 3c: Event Selection (MANDATORY — NEVER SKIP)

**You MUST ask the user which events to index. NEVER assume the user wants all events.**

Present the events found in the ABI and ask for selection:

> I found these events in the ABI:
>
> | Event | Description | Type |
> |-------|-------------|------|
> | Transfer | Token transfers | Core |
> | Approval | Token approvals | Core |
> | OwnershipTransferred | Ownership changes | Admin |
> | Paused/Unpaused | Pause state changes | Admin |
>
> Which events do you want to index?
> - **Core events only** (Transfer, Approval) — recommended
> - **All events** — includes administrative
> - **Custom** — specify which events

**Default recommendation:** For standard token contracts (ERC-20, ERC-721, ERC-1155),
core events are sufficient for most use cases. Administrative events add indexing
overhead and are rarely queried.

**Only skip asking if the user explicitly says "index everything" or "use all events".**

## Step 4: Refine Schema, Manifest, and Mappings

Inspect what `ormi-cli init` generated and refine based on the ABI analysis.

### 4a: Refine schema.graphql

Compare the generated schema against the target entities. Apply these principles:

**⚠️ CRITICAL: ORMI requires explicit immutability for ALL entities**

Every entity MUST specify `@entity(immutable: true)` or `@entity(immutable: false)`:

| Type | Directive | Examples |
|------|-----------|----------|
| Mutable | `@entity(immutable: false)` | Account, Token, ContractState (state that changes) |
| Immutable | `@entity(immutable: true)` | Transfer, Approval (historical event records) |

```graphql
type Account @entity(immutable: false) {  # balance changes
  id: Bytes!
  balance: BigInt!
}

type Transfer @entity(immutable: true) {  # historical record
  id: Bytes!
  from: Bytes!
  to: Bytes!
  amount: BigInt!
}
```

**Entity design:**
- One entity per **concept**, not per event (e.g., `Account` not `TransferSender`)
- `@entity(immutable: true)` for historical records (event logs, transactions)
- `@entity(immutable: false)` for current state (balances, positions, totals)
- `@derivedFrom` for reverse lookups

**ID conventions:**
- Events: `event.transaction.hash.concatI32(event.logIndex.toI32())`
- Accounts/tokens: `event.params.address` (as `Bytes`)
- Pairs/pools: derived from constituent addresses

**Common field types:**
```graphql
id: Bytes!           # addresses, hash-derived IDs
amount: BigInt!      # token amounts (use BigDecimal for display)
timestamp: BigInt!   # event.block.timestamp
blockNumber: BigInt!
txHash: Bytes!       # event.transaction.hash
```

**Relationships:**
```graphql
# One-to-many via @derivedFrom
transfers: [Transfer!]! @derivedFrom(field: "account")

# Many-to-many via join entity
type PoolToken @entity { pool: Pool!, token: Token! }
```

**Aggregation entities** for high-frequency events:
```graphql
type DailyVolume @entity {
  id: String!       # "poolAddress-dayId"
  pool: Pool!
  volumeUSD: BigDecimal!
  date: Int!
}
```

After modifying the schema, run codegen immediately:
```bash
ormi-cli codegen
```

### 4b: Refine subgraph.yaml

Check and fix:
- **startBlock**: Must be the contract deployment block, not 0. Check block explorer for deployment tx
- **eventHandlers**: Ensure all selected events have handlers listed
- **entities**: List all entity names used by each data source
- **ABI paths**: Verify file references are correct

### 4c: Write AssemblyScript Mappings

Inspect the generated mappings and refine handlers. Follow these patterns:

**Type imports for contract binding:**

When calling contract view functions, you need the `Address` type:

```typescript
// Import Address along with other types
import { BigInt, Bytes, Address } from "@graphprotocol/graph-ts"
import { Transfer as TransferEvent } from '../generated/Contract/Contract'
import { Account, Transfer } from '../generated/schema'

export function handleTransfer(event: TransferEvent): void {
  // Load or create mutable entity
  let from = Account.load(event.params.from)
  if (from == null) {
    from = new Account(event.params.from)
    from.balance = BigInt.fromI32(0)
  }
  from.balance = from.balance.minus(event.params.value)
  from.save()

  // Create immutable event record
  const transfer = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  transfer.from = event.params.from
  transfer.to = event.params.to
  transfer.amount = event.params.value
  transfer.timestamp = event.block.timestamp
  transfer.blockNumber = event.block.number
  transfer.txHash = event.transaction.hash
  transfer.save()
}
```

**⚠️⚠️⚠️ MOST COMMON ERROR: BigInt Arithmetic ⚠️⚠️⚠️**

AssemblyScript does NOT support `+`, `-`, `*` operators for BigInt.
You MUST use method calls instead:

```typescript
// ❌ WRONG - crashes the compiler
balance = balance + amount
count = count + 1
total = amount * price

// ✅ CORRECT - use method calls
balance = balance.plus(amount)
balance = balance.minus(amount)
total = amount.times(price)
count = count.plus(BigInt.fromI32(1))
```

**This is the #1 cause of build failures. Double-check ALL arithmetic operations!**

**Critical patterns:**
- Always check `Entity.load()` before creating — never double-create
- Call `.save()` on every modified entity
- Use `BigInt.fromI32()`, not plain integers
- Event param names must match ABI exactly (case-sensitive)
- Null checks: use `if (entity == null)` (not `!entity` in AssemblyScript)
- **Convert `Bytes` to `Address` for contract binding:**
  ```typescript
  // event.address is Bytes, but Contract.bind() expects Address
  let contract = Contract.bind(Address.fromBytes(event.address))

  // Or if using a stored contractAddress variable:
  function getOrCreateToken(contractAddress: Bytes): Token {
    ...
    let contract = Contract.bind(Address.fromBytes(contractAddress))
    ...
  }
  ```

**Common pitfalls:**
- Forgetting `.save()` — entity changes are lost
- Using `i32` where `BigInt` is needed (overflow on large token amounts)
- Missing imports from `../generated/schema` or `../generated/Contract/Contract`
- Passing `Bytes` where `Address` is expected (use `Address.fromBytes()`)
- Unused variables — only call helper functions if you need their return value

## Step 5: Build and Verify

```bash
ormi-cli codegen   # regenerate types if schema or ABI changed
ormi-cli build
```

**If codegen fails:**
- Check GraphQL syntax in `schema.graphql` (`@entity`, `@derivedFrom` directives)
- Verify ABI file paths in `subgraph.yaml`
- Check for missing ABI entries for events referenced in the manifest

**If build fails — common errors:**

| Error | Fix |
|-------|-----|
| `Type 'i32' is not assignable to type 'BigInt'` | Use `BigInt.fromI32(n)` |
| `Cannot find name 'X'` | Add import from `../generated/Contract/Contract` or `../generated/schema` |
| `Object is possibly null` | Add null check: `if (entity == null) { entity = new Entity(id) }` |
| `Property 'X' does not exist on type 'Y'` | Run `ormi-cli codegen` after schema changes |

Iterate until build succeeds. Re-run codegen after any schema or ABI change.

## Step 6: Explain Results

Summarize what was created:

1. **Contract type**: What pattern was detected (or "custom")
2. **Entities**: List each entity with its purpose and whether it's immutable
3. **Event handlers**: Which on-chain events are being indexed and what they do
4. **Schema relationships**: How entities connect to each other
5. **Start block**: What block indexing begins from and why
6. **Known limitations**: Anything skipped, incomplete, or needing attention

## Step 7: Next Steps

Guide the user on what to do after creation:

- **To test**: `ormi-cli test` (requires Matchstick test files)
- **To deploy**: Use the `subgraph-deploy` skill (authenticates via MCP and fetches deploy key automatically)
- **To add more contracts**: `ormi-cli add <address>`
- **To monitor after deploy**: Use the `subgraph-monitor` skill

## MCP Tools Used (Optional, Non-Blocking)

- `list-chains` — validate network name
- `search-project-subgraphs` — discover existing subgraphs for the contract
- `get-schema` — learn from existing subgraph schemas
