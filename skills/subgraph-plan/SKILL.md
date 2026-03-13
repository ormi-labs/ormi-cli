---
name: subgraph-plan
description: Analyze a contract ABI and design a subgraph — entity model, event selection, schema structure
---

# Subgraph Plan Skill

Analyze a contract address or ABI and produce a concrete subgraph plan: which events to index, how to model entities, and how they relate.

## When to Use

- User says "I want to index contract 0x..." or "help me plan a subgraph for this ABI"
- User has an ABI or contract address and wants to know what to build before writing code

## CLI-First Rule

Prefer planning around `ormi-cli` workflows instead of inventing a manual implementation path.

- Assume project creation will start with `ormi-cli init`
- Assume additional contracts will be added with `ormi-cli add`
- Treat direct schema or mapping authoring as refinement after the CLI scaffold exists
- If `ormi-cli` can discover or generate something, use that as the baseline and review the result instead of recreating it from scratch

## Step 1: Identify the Target

Ask for or confirm:
- Contract address and network (e.g. `0x1f98...` on Ethereum mainnet)
- ABI file path (if already downloaded) or note that `ormi-cli init --from-contract` will fetch it
- Subgraph name and target directory (required for non-interactive mode)

Use `list-chains` MCP tool to confirm the network name matches what ORMI supports.

## Step 2: Check for Existing Subgraphs

Before designing from scratch:
1. Use `search-project-subgraphs` to find any existing subgraphs for this contract
2. If found, use `get-schema` to understand what's already indexed
3. Reuse patterns where appropriate; avoid duplicating work

## Step 3: Analyze the ABI

For each **event** in the ABI, assess:

| Question | Guidance |
|---|---|
| Is this data useful? | State changes (Transfer, Swap, Deposit) yes; administrative events (OwnershipTransferred) usually no |
| What entity does it affect? | Map to the core concept, not the event name |
| Is it high-frequency? | High-frequency events → consider aggregation entities |

Identify known patterns:
- **ERC-20**: Transfer, Approval → Token, Account, Transfer entities
- **ERC-721/1155**: Transfer, ApprovalForAll → NFT, Owner entities
- **AMM/DEX**: Swap, Mint, Burn → Pool, Token, Swap entities
- **Governance**: ProposalCreated, Voted → Proposal, Vote entities
- **Staking**: Staked, Withdrawn, RewardClaimed → Position, Reward entities

## Step 4: Design Entities

**Core principles:**

- One entity per **concept**, not per event (e.g. `Account` not `TransferSender`)
- **Immutable** entities for historical records: `@entity(immutable: true)` — use for event logs, transactions
- **Mutable** entities for current state: balances, positions, totals
- ID conventions:
  - Events: `event.transaction.hash.concatI32(event.logIndex.toI32())`
  - Accounts/tokens: `event.params.address` (as Bytes)
  - Pairs/pools: derived from constituent addresses

**Common field types:**
```graphql
id: Bytes!          # addresses, hash-derived IDs
amount: BigInt!     # token amounts (use BigDecimal for display)
timestamp: BigInt!  # event.block.timestamp
blockNumber: BigInt!
txHash: Bytes!      # event.transaction.hash
```

**Relationships:**
```graphql
# One-to-many: from parent
transfers: [Transfer!]! @derivedFrom(field: "account")

# Many-to-many: via join entity
type PoolToken @entity { pool: Pool!, token: Token! }
```

**Aggregation entities** for metrics (daily/hourly):
```graphql
type DailyVolume @entity {
  id: String!       # "poolAddress-dayId"
  pool: Pool!
  volumeUSD: BigDecimal!
  date: Int!
}
```

## Step 5: Produce the Plan

Output a structured plan containing:

1. **Summary**: what the subgraph indexes and why
2. **Entity list**: each entity with fields, immutability, and purpose
3. **Event-to-handler mapping**: which events feed which entities
4. **Recommended `ormi-cli` workflow**: whether to start with `ormi-cli init --from-contract ...` or `ormi-cli add ...`
5. **Schema adjustments after scaffold**: what should be changed in the generated files
6. **Open questions**: anything that needs clarification before building

Wait for user approval before proceeding to `subgraph-develop`.

## MCP Tools Used

- `list-chains` — confirm network
- `search-project-subgraphs` — check for existing subgraphs
- `get-schema` — learn from existing subgraph schemas
