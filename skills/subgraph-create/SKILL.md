---
name: subgraph-create
description: Create a complete subgraph from a contract address — scaffold, analyze ABI, refine schema and mappings, build, and verify
---

# Subgraph Create Skill

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
| Network | Yes | — (e.g., mainnet, arbitrum-one, base) |
| Protocol | No | ethereum |
| Subgraph name | No | Derive from contract name or address |
| Target directory | No | `./<subgraph-name>` |

If MCP is available, use `list-chains` to validate the network name.
If MCP is not available, accept the user's network name as-is.

## Step 2: Scaffold with ormi-cli init

Run non-interactive init with all required arguments:

```bash
ormi-cli init <SUBGRAPH_NAME> <DIRECTORY> \
  --from-contract <ADDRESS> \
  --network <NETWORK> \
  --protocol <PROTOCOL> \
  --skip-install \
  --skip-git
```

Then install dependencies:

```bash
cd <DIRECTORY>
yarn install
```

**Generated project structure:**
```
<DIRECTORY>/
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

### 3c: Event Selection

Based on user input (or smart defaults if user says "index everything"):

- **Include** by default: state-changing events (Transfer, Swap, Deposit, etc.)
- **Skip** by default: administrative events (OwnershipTransferred, Paused, Unpaused)
  unless the user requests them
- **Flag** high-frequency events that may benefit from aggregation entities
  (e.g., daily/hourly volume summaries)

## Step 4: Refine Schema, Manifest, and Mappings

Inspect what `ormi-cli init` generated and refine based on the ABI analysis.

### 4a: Refine schema.graphql

Compare the generated schema against the target entities. Apply these principles:

**Entity design:**
- One entity per **concept**, not per event (e.g., `Account` not `TransferSender`)
- `@entity(immutable: true)` for historical records (event logs, transactions)
- Mutable entities for current state (balances, positions, totals)
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

```typescript
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

**Critical patterns:**
- Always check `Entity.load()` before creating — never double-create
- Call `.save()` on every modified entity
- Use `BigInt.fromI32()`, not plain integers
- Event param names must match ABI exactly (case-sensitive)
- Null checks: use `if (entity == null)` (not `!entity` in AssemblyScript)

**Common pitfalls:**
- Forgetting `.save()` — entity changes are lost
- Using `i32` where `BigInt` is needed (overflow on large token amounts)
- Missing imports from `../generated/schema` or `../generated/Contract/Contract`

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
- **To deploy**: Use the `subgraph-deploy` skill or run manually:
  ```bash
  ormi-cli auth login <deploy-key>
  ormi-cli create <subgraph-name>
  ormi-cli deploy <subgraph-name> --version-label v0.0.1
  ```
- **To add more contracts**: `ormi-cli add <address>`
- **To monitor after deploy**: Use the `subgraph-monitor` skill

## MCP Tools Used (Optional, Non-Blocking)

- `list-chains` — validate network name
- `search-project-subgraphs` — discover existing subgraphs for the contract
- `get-schema` — learn from existing subgraph schemas
