---
name: subgraph-create
description: Use when the user wants to create a new subgraph, scaffold from a contract address, or build custom indexing patterns like block handlers, factories, multi-source, call handlers, or analytics
---

# Subgraph Create Skill

Create a working subgraph using `ormi-cli init` followed by `ormi-cli abi` — supports all use cases from simple contract indexing to advanced patterns like factories, call handlers, and analytics.

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

| # | Use Case | Description | Key Feature |
|---|---|---|---|
| 1 | **Simple Contract** | Index events from a single contract | `eventHandlers`, standard flow |
| 2 | **Block Handler** | Index block-level data (hash, timestamp, gas, miner) | `blockHandlers`, dummy ABI |
| 3 | **Factory/Template** | Factory creates child contracts dynamically | `templates` + `Template.create()` |
| 4 | **Multi-Source** | Multiple contracts with different ABIs | Multiple `dataSources` entries |
| 5 | **Call Handler** | Index function calls, not just events | `callHandlers` (network-limited) |
| 6 | **Analytics** | Timeseries entities, daily/hourly aggregations | `@entity(timeseries: true)` + `@aggregation` |

> Which use case best describes what you want to build? (You can combine — e.g., Factory + Analytics)

**For Call Handler (use case 5), immediately warn:**

> ⚠️ **Network Limitation:** Call handlers require the Parity tracing API. They are NOT supported on:
> - BNB Chain (BSC)
> - Arbitrum (arbitrum-one, arbitrum-sepolia)
> - Some other L2 networks
>
> Supported networks include Ethereum mainnet, Gnosis, Polygon (matic), Optimism, Base.
> Please confirm your target network supports call handlers before proceeding.

---

## Step 2: Gather Inputs

Collect from the user's message or ask if missing:

| Input | Required | Default | Notes |
|---|---|---|---|
| Subgraph name | Yes | — | Used for the subgraph identifier |
| Network | Yes | — | Use network mapping table below |
| Target directory | No | `.` (current dir) | Where to create the project |
| Contract address | Conditional | — | Required for use cases 1, 3, 4, 5; NOT for block-only |
| Start block | Conditional | — | Auto-detected if using contract address |

**Network identifiers** — use the primary registry ID:

| Common Name | `network:` value |
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

> ⚠️ `ethereum` is NOT valid — use `mainnet` instead.

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

> ⛔ **STOP.** You MUST ask the user what they want to achieve before writing any mapping code.

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

| Goal | Suggested Approach |
|------|-------------------|
| Transaction history | Event handlers → immutable entities |
| Aggregated metrics | Event handlers + timeseries/aggregation entities |
| User balances/positions | Event handlers + mutable Account entities |
| Contract state changes | Function calls (call handlers) |
| Frontend/API | Event handlers + optimized query entities |
| Custom | Discuss requirements, then recommend |

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

**Do NOT proceed to Step 6 until the user confirms:**
- The goal is understood
- The approach (events/functions/both) is agreed
- Specific events/functions are selected
- Entities are confirmed

**Only after confirmation**, proceed to design the schema.

### 5d: Design Schema

Based on the confirmed events and entities:

For example:
- Track all transfers? → `Transfer` entity
- Calculate volumes? → `DailyVolume` aggregation entity
- Track user balances? → `Account` entity with balance tracking

---

## Step 6: Add Data Source

### 6a: Save ABI

```bash
# ABI should already be saved from Step 4
# If manual ABI, save to:
# abis/<ContractName>.json
```

### 6b: Update subgraph.yaml

**For Simple Contract (Use Case 1):**

```yaml
specVersion: 1.3.0
schema:
  file: ./schema.graphql
indexerHints:
  prune: auto
dataSources:
  - kind: ethereum/contract
    name: <ContractName>
    network: <NETWORK>
    source:
      address: "<CONTRACT_ADDRESS>"
      abi: <ContractName>
      startBlock: <START_BLOCK>
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - <EntityName>
      abis:
        - name: <ContractName>
          file: ./abis/<ContractName>.json
      eventHandlers:
        - event: Transfer(indexed address,indexed address,uint256)
          handler: handleTransfer
      file: ./src/<contractName>.ts
```

**For Block Handler (Use Case 2):**

Create `abis/Dummy.json`:
```json
[]
```

```yaml
specVersion: 1.3.0
schema:
  file: ./schema.graphql
indexerHints:
  prune: auto
dataSources:
  - kind: ethereum/contract
    name: BlockIndexer
    network: <NETWORK>
    source:
      abi: Dummy
      startBlock: <START_BLOCK>
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Block
      abis:
        - name: Dummy
          file: ./abis/Dummy.json
      blockHandlers:
        - handler: handleBlock
      file: ./src/mapping.ts
```

> Note: `source` does NOT include `address` for block-only handlers.

**Block Handler Filter Options:**

```yaml
# Option A: Only blocks with calls to this contract (requires Parity tracing)
blockHandlers:
  - handler: handleBlockWithCall
    filter:
      kind: call

# Option B: Every Nth block
blockHandlers:
  - handler: handleBlock
    filter:
      kind: polling
      every: 10

# Option C: Run once at start as initialization
blockHandlers:
  - handler: handleOnce
    filter:
      kind: once
```

> The `call` filter requires Parity tracing — not supported on BSC, Arbitrum, Polygon, Optimism.

**For Factory/Template (Use Case 3):**

```yaml
specVersion: 1.3.0
schema:
  file: ./schema.graphql
indexerHints:
  prune: auto
dataSources:
  - kind: ethereum/contract
    name: Factory
    network: <NETWORK>
    source:
      address: "<FACTORY_ADDRESS>"
      abi: Factory
      startBlock: <START_BLOCK>
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Pair
        - Factory
      abis:
        - name: Factory
          file: ./abis/Factory.json
        - name: Pair
          file: ./abis/Pair.json
      eventHandlers:
        - event: PairCreated(indexed address,indexed address,address,uint256)
          handler: handlePairCreated
      file: ./src/factory.ts
templates:
  - kind: ethereum/contract
    name: Pair
    network: <NETWORK>
    source:
      abi: Pair
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Pair
        - Swap
      abis:
        - name: Pair
          file: ./abis/Pair.json
      eventHandlers:
        - event: Swap(indexed address,uint256,uint256,uint256,uint256,indexed address)
          handler: handleSwap
      file: ./src/pair.ts
```

In the factory mapping, instantiate templates:
```typescript
import { Pair as PairTemplate } from '../generated/templates'

export function handlePairCreated(event: PairCreatedEvent): void {
  // Create template instance for the new pair
  PairTemplate.create(event.params.pair)
}
```

**Cascading Templates (factory creates contracts that create more contracts):**

When a factory creates child contracts that in turn emit events to discover further contracts, you chain multiple templates. Each template handler can instantiate the next.

```yaml
# Append the following dataSources/templates to an existing manifest
# Example: Registry → Provider → Pool
dataSources:
  - kind: ethereum/contract
    name: Registry
    network: <NETWORK>
    source:
      address: "<REGISTRY_ADDRESS>"
      abi: Registry
      startBlock: <START_BLOCK>
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Provider
      abis:
        - name: Registry
          file: ./abis/Registry.json
      eventHandlers:
        - event: ProviderRegistered(address)
          handler: handleProviderRegistered
      file: ./src/registry.ts

templates:
  - kind: ethereum/contract
    name: Provider
    network: <NETWORK>
    source:
      abi: Provider
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Pool
      abis:
        - name: Provider
          file: ./abis/Provider.json
      eventHandlers:
        - event: PoolCreated(address)
          handler: handlePoolCreated
      file: ./src/provider.ts

  - kind: ethereum/contract
    name: Pool
    network: <NETWORK>
    source:
      abi: Pool
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Pool
        - Deposit
      abis:
        - name: Pool
          file: ./abis/Pool.json
      eventHandlers:
        - event: Deposit(indexed address,address,uint256)
          handler: handleDeposit
      file: ./src/pool.ts
```

Cascading template instantiation in mappings:
```typescript
// src/registry.ts — Level 1: Registry creates Provider
import { ProviderRegistered } from '../generated/Registry/Registry'
import { Provider as ProviderTemplate } from '../generated/templates'

export function handleProviderRegistered(event: ProviderRegistered): void {
  ProviderTemplate.create(event.params.provider)
}

// src/provider.ts — Level 2: Provider creates Pool
import { PoolCreated } from '../generated/templates/Provider/Provider'
import { Pool as PoolTemplate } from '../generated/templates'

export function handlePoolCreated(event: PoolCreated): void {
  PoolTemplate.create(event.params.pool)
}

// src/pool.ts — Level 3: Pool handles events
import { Deposit } from '../generated/templates/Pool/Pool'

export function handleDeposit(event: Deposit): void {
  // Handle deposit events for this pool instance
}
```

**Key points for cascading templates:**

- Each template level can import and instantiate any template from `../generated/templates`
- Include in `mapping.abis` every ABI the current handler binds or calls (via `Contract.bind()`). A downstream template's ABI belongs in that template definition; add it to the upstream mapping only if that upstream handler also reads the downstream contract's state
- A template only starts indexing from the block where `Template.create(...)` runs forward — it does **not** backfill prior events. If downstream contracts may already exist before discovery, read current state or enumerate children in the creator handler and instantiate templates there
- There is no hard limit on nesting depth, but each level adds indexing overhead
- All templates must be declared in the top-level `templates:` array — nesting is only in the mapping logic

**For Multi-Source (Use Case 4):**

```yaml
specVersion: 1.3.0
schema:
  file: ./schema.graphql
indexerHints:
  prune: auto
dataSources:
  - kind: ethereum/contract
    name: TokenA
    network: <NETWORK>
    source:
      address: "<TOKEN_A_ADDRESS>"
      abi: ERC20
      startBlock: <START_BLOCK_A>
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Transfer
      abis:
        - name: ERC20
          file: ./abis/ERC20.json
      eventHandlers:
        - event: Transfer(indexed address,indexed address,uint256)
          handler: handleTransferA
      file: ./src/tokenA.ts

  - kind: ethereum/contract
    name: TokenB
    network: <NETWORK>
    source:
      address: "<TOKEN_B_ADDRESS>"
      abi: ERC20
      startBlock: <START_BLOCK_B>
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Transfer
      abis:
        - name: ERC20
          file: ./abis/ERC20.json
      eventHandlers:
        - event: Transfer(indexed address,indexed address,uint256)
          handler: handleTransferB
      file: ./src/tokenB.ts
```

**For Call Handler (Use Case 5):**

```yaml
specVersion: 1.3.0
schema:
  file: ./schema.graphql
indexerHints:
  prune: auto
dataSources:
  - kind: ethereum/contract
    name: <ContractName>
    network: <NETWORK>
    source:
      address: "<CONTRACT_ADDRESS>"
      abi: <ContractName>
      startBlock: <START_BLOCK>
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Call
      abis:
        - name: <ContractName>
          file: ./abis/<ContractName>.json
      callHandlers:
        - function: mint(address,uint256)
          handler: handleMintCall
      file: ./src/<contractName>.ts
```

> ⚠️ Call handlers require Parity tracing API — not available on BSC, Arbitrum, some L2s.

### 6c: Create schema.graphql

Based on the use case and entities discussed:

**Basic entity (immutable for event-based data):**
```graphql
type Transfer @entity(immutable: true) {
  id: Bytes!
  from: Bytes!
  to: Bytes!
  value: BigInt!
  timestamp: BigInt!
  transaction: Bytes!
}
```

**Interface types (for event polymorphism — multiple event types sharing common fields):**
```graphql
# Define shared fields in an interface
interface DomainEvent {
  id: Bytes!
  domain: Domain!
  blockNumber: BigInt!
}

# Each implementing type includes all interface fields plus its own
type Transfer implements DomainEvent @entity(immutable: true) {
  id: Bytes!
  domain: Domain!
  blockNumber: BigInt!
  owner: Account!
}

type NewOwner implements DomainEvent @entity(immutable: true) {
  id: Bytes!
  domain: Domain!
  blockNumber: BigInt!
  parentDomain: Domain!
  owner: Account!
}
```

Use interfaces when multiple event entities share common fields. Queries can then fetch all implementations via the interface type.

**Enum types (for categorical fields):**
```graphql
enum Action {
  Deposit
  Withdraw
  Borrow
  Repay
  Liquidation
}

type UserTransaction @entity(immutable: true) {
  id: Bytes!
  user: Bytes!
  action: Action!
  amount: BigInt!
  timestamp: BigInt!
}
```

Use enums for fields with a fixed set of values (action types, asset types, statuses).

**For Analytics (Use Case 6) — Timeseries + Aggregation:**

> Requires `specVersion: 1.1.0` or higher. Aggregation entities are **automatically computed** by the database — you only write handlers to save raw timeseries data points.

```graphql
type TokenData @entity(timeseries: true) {
  id: Int8!
  timestamp: Timestamp!
  token: Bytes!
  amount: BigDecimal!
  priceUSD: BigDecimal!
}

type TokenStats @aggregation(intervals: ["hour", "day"], source: "TokenData") {
  id: Int8!
  timestamp: Timestamp!
  token: Bytes!
  totalVolume: BigDecimal! @aggregate(fn: "sum", arg: "amount")
  priceUSD: BigDecimal! @aggregate(fn: "last", arg: "priceUSD")
  count: Int8! @aggregate(fn: "count", cumulative: true)
}
```

**Timeseries entity rules:**
- `id` MUST be `Int8!` (auto-incremented by graph-node)
- `timestamp` MUST be `Timestamp!` (auto-set to block timestamp)
- Timeseries entities are always immutable (implied by `timeseries: true`)
- All other fields are your raw data points

**Aggregation entity rules:**
- Defined with `@aggregation(intervals: [...], source: "...")`
- `intervals`: `"hour"` and/or `"day"`
- `source`: name of the timeseries entity to aggregate
- `id` MUST be `Int8!`, `timestamp` MUST be `Timestamp!`
- Non-aggregated fields (like `token`) become **dimensions** — aggregations are grouped by them
- Use `@aggregate(fn: "...", arg: "...")` on aggregated fields

**Available aggregation functions:**

| Function | Description |
|---|---|
| `sum` | Total of all values |
| `count` | Number of values |
| `min` | Minimum value |
| `max` | Maximum value |
| `first` | First value in the period |
| `last` | Last value in the period |

**Advanced `arg` expressions:**
- Field reference: `@aggregate(fn: "sum", arg: "amount")`
- Arithmetic: `@aggregate(fn: "sum", arg: "priceUSD * amount")`
- SQL functions: `@aggregate(fn: "max", arg: "greatest(amount0, amount1, 0)")`
- Conditional: `@aggregate(fn: "sum", arg: "case when amount0 > amount1 then amount0 else 0 end")`

**Querying aggregated data:**
```graphql
{
  tokenStats(
    interval: "hour"
    where: { token: "0x1234...", timestamp_gte: "1704164640000000", timestamp_lt: "1704251040000000" }
  ) {
    id
    timestamp
    token
    totalVolume
    priceUSD
    count
  }
}
```

**Manual Day/Hour Snapshots (recommended for most analytics):**

> Most production DeFi subgraphs (Uniswap V3, Aave V3, etc.) use manual snapshot entities instead of `@entity(timeseries: true)`. This approach works on all graph-node versions and gives full control over ID construction and update logic. Prefer this when you need OHLC tracking, per-entity snapshots, or compatibility with older deployments.

**Schema — define mutable snapshot entities:**

```graphql
# Global daily aggregate (e.g., protocol-wide volume)
type ProtocolDayData @entity(immutable: false) {
  id: ID!                          # dayID as string (e.g., "19637")
  date: Int!                       # dayStartTimestamp
  dailyVolumeETH: BigDecimal!
  dailyVolumeUSD: BigDecimal!
  totalVolumeETH: BigDecimal!
  totalVolumeUSD: BigDecimal!
  txCount: Int!
}

# Per-entity daily snapshot (e.g., per-pool, per-token)
type PoolDayData @entity(immutable: false) {
  id: ID!                          # "<poolAddress>-<dayID>" (e.g., "0xabc...-19637")
  date: Int!                       # dayStartTimestamp
  pool: Pool!
  open: BigDecimal!                # OHLC price tracking
  high: BigDecimal!
  low: BigDecimal!
  close: BigDecimal!
  volumeToken0: BigDecimal!
  volumeToken1: BigDecimal!
  txCount: Int!
}

# Per-entity hourly snapshot
type TokenHourData @entity(immutable: false) {
  id: ID!                          # "<tokenAddress>-<hourID>"
  periodStartUnix: Int!
  token: Token!
  open: BigDecimal!
  high: BigDecimal!
  low: BigDecimal!
  close: BigDecimal!
  priceUSD: BigDecimal!
  volume: BigDecimal!
}
```

**ID construction patterns:**

| Snapshot Scope | ID Pattern | Example |
|---|---|---|
| Protocol-wide daily | `dayID.toString()` | `"19637"` |
| Per-entity daily | `address.toHexString().concat('-').concat(dayID.toString())` | `"0xabc...-19637"` |
| Per-entity hourly | `address.toHexString().concat('-').concat(hourID.toString())` | `"0xabc...-471288"` |

**Mapping — full snapshot handler pattern:**

> **Prerequisite:** This example assumes a mutable `Pool` entity (with `token0Price` field) is already being maintained by other handlers. The snapshot handler reads current state from it.

```typescript
import { Swap as SwapEvent } from '../generated/<DataSourceName>/<ContractName>'
import { PoolDayData, Pool } from '../generated/schema'
import { BigDecimal } from '@graphprotocol/graph-ts'

export function handleSwap(event: SwapEvent): void {
  // --- Day/Hour window calculation ---
  const timestamp = event.block.timestamp.toI32()
  const dayID = timestamp / 86400           // seconds per day
  const dayStartTimestamp = dayID * 86400
  // For hourly: const hourID = timestamp / 3600

  // --- Build composite ID ---
  const dayPoolID = event.address
    .toHexString()
    .concat('-')
    .concat(dayID.toString())

  // --- Load or create snapshot ---
  let poolDayData = PoolDayData.load(dayPoolID)
  const pool = Pool.load(event.address.toHexString())!

  if (poolDayData == null) {
    poolDayData = new PoolDayData(dayPoolID)
    poolDayData.date = dayStartTimestamp
    poolDayData.pool = event.address.toHexString()
    // Initialize OHLC with current price
    poolDayData.open = pool.token0Price
    poolDayData.high = pool.token0Price
    poolDayData.low = pool.token0Price
    poolDayData.close = pool.token0Price
    poolDayData.volumeToken0 = BigDecimal.fromString("0")
    poolDayData.volumeToken1 = BigDecimal.fromString("0")
    poolDayData.txCount = 0
  }

  // --- Update OHLC ---
  const price = pool.token0Price
  if (price.gt(poolDayData.high)) {
    poolDayData.high = price
  }
  if (price.lt(poolDayData.low)) {
    poolDayData.low = price
  }
  poolDayData.close = price

  // --- Update running totals ---
  // Note: Swap amounts are signed deltas. Use .abs() if you need absolute volume.
  // For token precision, divide by 10^decimals (e.g., BigInt.fromI32(10).pow(u8(decimals)))
  poolDayData.volumeToken0 = poolDayData.volumeToken0.plus(
    event.params.amount0.toBigDecimal()
  )
  poolDayData.volumeToken1 = poolDayData.volumeToken1.plus(
    event.params.amount1.toBigDecimal()
  )
  poolDayData.txCount += 1
  poolDayData.save()
}
```

**Key points for manual snapshots:**

- Use `@entity(immutable: false)` — snapshots are updated within their time window
- Always load-before-create to avoid overwriting existing data
- OHLC: set open on first write, update high/low on every write, always update close
- Running totals: accumulate volume/count within the window
- The `date` or `periodStartUnix` field stores the window start timestamp for filtering
- Swap event amounts are signed (positive/negative) — use `.abs()` for absolute volume tracking
- Normalize amounts by token decimals before accumulating for accurate totals

### 6d: Create Mapping Files

Create the TypeScript mapping files in `src/`:

**Basic event handler:**
```typescript
import { Transfer as TransferEvent } from '../generated/<ContractName>/<ContractName>'
import { Transfer } from '../generated/schema'
import { Bytes, BigInt } from '@graphprotocol/graph-ts'

export function handleTransfer(event: TransferEvent): void {
  let entity = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.from = event.params.from
  entity.to = event.params.to
  entity.value = event.params.value
  entity.timestamp = event.block.timestamp
  entity.transaction = event.transaction.hash
  entity.save()
}
```

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

## Common Patterns

### Pattern: Track Running Totals

> For full OHLC snapshots and per-entity day/hour windows, see "Manual Day/Hour Snapshots" in Step 6c.

```typescript
// Simple protocol-wide daily total (minimal pattern)
let dayID = event.block.timestamp.toI32() / 86400
let dailyVolume = DailyVolume.load(dayID.toString())

if (dailyVolume == null) {
  dailyVolume = new DailyVolume(dayID.toString())
  dailyVolume.volume = BigDecimal.fromString("0")
  dailyVolume.txCount = 0
}

dailyVolume.volume = dailyVolume.volume.plus(event.params.value.toBigDecimal())
dailyVolume.txCount += 1
dailyVolume.save()
```

### Pattern: Load Contract Instances

```typescript
import { Contract } from '../generated/<ContractName>/<ContractName>'
import { Address } from '@graphprotocol/graph-ts'

// Read contract state
let contract = Contract.bind(Address.fromBytes(event.address))
let result = contract.someViewFunction()
```

### Pattern: IPFS Content

```typescript
import { ipfs } from '@graphprotocol/graph-ts'

// Load IPFS content (for NFT metadata, etc.)
let hash = event.params.tokenURI.split('/').pop()
let data = ipfs.cat(hash)
if (data) {
  // Parse JSON, extract attributes
}
```

### Pattern: Helper Library Structure (multi-file mappings)

For subgraphs with more than a few event handlers, organize mapping code across multiple files with shared helpers. This keeps handlers focused and avoids duplicate logic.

**Recommended directory structure:**

```
src/
├── common/
│   ├── constants.ts    # Protocol constants, addresses, token definitions
│   ├── utils.ts        # Shared utility functions (ID construction, conversions)
│   └── entityGetters.ts # Reusable entity load-or-create patterns
├── handlers/
│   ├── pool.ts         # Pool-related event handlers
│   ├── token.ts        # Token-related event handlers
│   └── snapshots.ts    # Day/hour snapshot update functions
└── helpers/
    └── pricing.ts      # Price calculation logic (oracle, whitelist traversal)
```

> **Manifest wiring:** Each data source/template in `subgraph.yaml` points its `file:` path directly at the handler file (e.g., `file: ./src/handlers/pool.ts`), not at a central `mapping.ts`. Each handler file contains the exported functions referenced by `eventHandlers` / `callHandlers`.

**constants.ts — protocol addresses and configuration:**

```typescript
import { BigInt, BigDecimal } from '@graphprotocol/graph-ts'

// Addresses stored as strings for ID construction; use Address.fromString() for .bind() calls
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const FACTORY_ADDRESS = '0x...'  // Your factory address

// Numeric constants
export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)
export const ZERO_BD = BigDecimal.fromString('0')
export const ONE_BD = BigDecimal.fromString('1')

// Time constants (seconds)
export const SECONDS_PER_DAY = 86400
export const SECONDS_PER_HOUR = 3600
```

**utils.ts — shared helper functions:**

```typescript
import { Address } from '@graphprotocol/graph-ts'
import { SECONDS_PER_DAY, SECONDS_PER_HOUR } from './constants'
// ERC20 import path depends on your manifest data source name, e.g.:
// import { ERC20 } from '../../generated/templates'

export function dayID(timestamp: i32): string {
  return (timestamp / SECONDS_PER_DAY).toString()
}

export function hourID(timestamp: i32): string {
  return (timestamp / SECONDS_PER_HOUR).toString()
}

export function fetchTokenSymbol(address: Address, ERC20: any): string {
  let contract = ERC20.bind(address)
  let result = contract.try_symbol()
  return result.reverted ? 'UNKNOWN' : result.value
}
```

**entityGetters.ts — reusable load-or-create:**

```typescript
import { Account } from '../../generated/schema'
import { ZERO_BD } from './constants'

export function getOrCreateAccount(id: string): Account {
  let account = Account.load(id)
  if (account == null) {
    account = new Account(id)
    account.balance = ZERO_BD
    account.txCount = 0
    account.save()
  }
  return account
}
```

**How to use in handlers:**

```typescript
// src/handlers/pool.ts — referenced in manifest as file: ./src/handlers/pool.ts
import { getOrCreateAccount } from '../common/entityGetters'

export function handleSwap(event: Swap): void {
  let account = getOrCreateAccount(event.params.sender.toHexString())
  account.txCount += 1
  account.save()
}
```

**Key points:**

- Import helpers with relative paths: `'../common/constants'`, `'../helpers/pricing'`
- Each manifest `file:` entry points directly to the handler file (e.g., `file: ./src/handlers/pool.ts`)
- Keep handler files thin — delegate logic to helpers
- Constants files avoid magic numbers and repeated `BigDecimal.fromString("0")` calls
- Entity getter functions centralize the load-or-create pattern to prevent inconsistencies
- For DeFi subgraphs, a `helpers/pricing.ts` file typically handles token price lookups via oracle contracts or whitelist pool traversal

---

## Guardrails — CRITICAL

These rules prevent common build failures and runtime errors. **Always follow them.**

### Entity Immutability

**Every entity MUST have `@entity(immutable: true)` or `@entity(immutable: false)`.**

- **Immutable entities** (`immutable: true`): Event-based data that never changes (Transfers, Swaps). Use `id: Bytes!` with `event.transaction.hash.concatI32(event.logIndex.toI32())`.
- **Mutable entities** (`immutable: false`): State that updates (Accounts, Pools). Use `id: ID!` with string IDs.
- **Timeseries entities** (`timeseries: true`): Analytics. Use `id: Int8!` and `timestamp: Timestamp!`.

```graphql
# ✅ CORRECT: Immutable event entity
type Transfer @entity(immutable: true) {
  id: Bytes!
  from: Bytes!
  to: Bytes!
  value: BigInt!
}

# ✅ CORRECT: Mutable state entity
type Account @entity(immutable: false) {
  id: ID!
  balance: BigInt!
}

# ❌ WRONG: Missing immutability annotation
type Transfer @entity {
  id: Bytes!
}
```

### BigInt Arithmetic

**Operators `+`, `-`, `*`, `/` do NOT work on BigInt.** Use methods instead:

```typescript
// ❌ WRONG: Operators don't compile
let sum = a + b
let diff = a - b

// ✅ CORRECT: Use methods
let sum = a.plus(b)
let diff = a.minus(b)
let product = a.times(b)
let quotient = a.div(b)
```

### Bytes to Address Conversion

**`Contract.bind()` requires `Address` type, not `Bytes`.** Always convert:

```typescript
import { Address } from '@graphprotocol/graph-ts'

// ❌ WRONG: event.address is Bytes, not Address
let contract = Contract.bind(event.address)

// ✅ CORRECT: Convert Bytes to Address
let contract = Contract.bind(Address.fromBytes(event.address))
```

### Factory/Template Guardrails

1. **Template name is case-sensitive** — must match `templates:` entry exactly:
   ```yaml
   templates:
     - name: Pair  # This name...
   ```
   ```typescript
   import { Pair as PairTemplate } from '../generated/templates'
   PairTemplate.create(event.params.pair)  # ...must match this exactly
   ```

2. **`Template.create()` takes `Address`, not `Bytes`**:
   ```typescript
   // If event.params.pair is Bytes:
   PairTemplate.create(Address.fromBytes(event.params.pair))
   // If it's already Address:
   PairTemplate.create(event.params.pair)
   ```

### Block Handler Guardrails

1. **Use a dummy ABI** — create `abis/Dummy.json` with `[]`
2. **No `address` in source** — block handlers don't watch a specific address:
   ```yaml
   source:
     abi: Dummy
     startBlock: 12345678
     # NO address field!
   ```
3. **Handler receives `ethereum.Block`**, not an event:
   ```typescript
   import { ethereum } from '@graphprotocol/graph-ts'

   export function handleBlock(block: ethereum.Block): void {
     let hash = block.hash
     let timestamp = block.timestamp
   }
   ```

### Call Handler Guardrails

**Call handlers require Parity tracing API.** NOT supported on:
- BNB Chain (BSC)
- Arbitrum (arbitrum-one, arbitrum-sepolia)
- Some L2 networks

**Supported:** Ethereum mainnet, Gnosis, Polygon (matic), Optimism, Base.

Always warn users before implementing call handlers on unsupported networks.

### Common AssemblyScript Pitfalls

| Pitfall | Wrong | Correct |
|---------|-------|---------|
| Null check | `if (!entity)` | `if (entity == null)` |
| Int to BigInt | `let x: BigInt = 0` | `let x = BigInt.fromI32(0)` |
| String to BigDecimal | `BigDecimal.fromI32(1)` | `BigDecimal.fromString("1")` |
| Missing `.save()` | Entity created but not saved | Always call `entity.save()` |
| Missing imports | Use type without import | Import from `@graphprotocol/graph-ts` |

```typescript
// Null check pattern
let entity = Entity.load(id)
if (entity == null) {  // NOT: if (!entity)
  entity = new Entity(id)
}
entity.save()  // ALWAYS save!
```

### Performance Best Practices

1. **Use `Bytes!` for immutable entity IDs** — faster than string IDs
2. **Use `@derivedFrom` for reverse lookups** — avoids loading entities
3. **Avoid `eth_call` in hot paths** — contract reads are slow
4. **Smart ID patterns** — encode day in ID for time-based entities:
   ```typescript
   // For immutable entities using Bytes IDs:
   let dayID = event.block.timestamp.toI32() / 86400
   let id = Bytes.fromI32(dayID)
   // For mutable snapshot entities using string IDs:
   // let id = dayID.toString()
   ```

### BigDecimal Patterns

```typescript
// ✅ Create from string
let zero = BigDecimal.fromString("0")
let one = BigDecimal.fromString("1")

// ❌ WRONG: fromI32 doesn't exist on BigDecimal
let wrong = BigDecimal.fromI32(0)  // Compile error!

// Convert BigInt to BigDecimal
let bdValue = bigIntValue.toBigDecimal()
```

### Build Error Reference

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot use operator '+' with BigInt` | Using `+` on BigInt | Use `.plus()` method |
| `Type 'Bytes' is not assignable to 'Address'` | Passing Bytes to bind() | Use `Address.fromBytes()` |
| `Entity 'X' has no field 'Y'` | Schema mismatch | Update schema, run codegen |
| `Cannot find name 'BigInt'` | Missing import | Add `import { BigInt } from '@graphprotocol/graph-ts'` |
| `Argument of type 'null' is not assignable` | Missing null check | Check `== null` before access |
| `Template 'X' not found` | Name mismatch | Check case-sensitive template name |

---

## Troubleshooting

### Build Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Type 'X' is not assignable to type 'Y'` | Type mismatch in mapping | Check generated types in `generated/` |
| `Cannot find name 'BigInt'` | Missing import | Add `import { BigInt } from '@graphprotocol/graph-ts'` |
| `Entity 'X' has no field 'Y'` | Schema mismatch | Update schema.graphql and run codegen |

### Runtime Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Subgraph not syncing | Start block too early | Set `startBlock` to contract deployment |
| Missing events | Wrong event signature | Copy exact signature from ABI |
| Null pointer errors | Entity not found | Check `load()` returns before accessing |

---

## Quick Reference

```bash
# Scaffold empty project (non-interactive)
ormi-cli init <NAME> <DIR> --network <NETWORK> -y

# Fetch ABI
ormi-cli abi <ADDRESS> --network <NETWORK> --full

# Generate types
ormi-cli codegen

# Build subgraph
ormi-cli build

# Deploy
ormi-cli deploy
```
