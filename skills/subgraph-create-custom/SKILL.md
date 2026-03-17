---
name: subgraph-create-custom
description: Create a subgraph without a contract address — block handlers, custom ABIs, factory patterns, multi-source, call handlers, and analytics
---

# Subgraph Create Custom Skill

Create a working subgraph from scratch without `ormi-cli init` — for block handlers, custom ABIs, factory/template patterns, multi-source subgraphs, call handlers, and analytics.

## When to Use

- User wants a **block handler** subgraph (no contract events, indexes block-level data)
- User has their **own ABI** and wants custom schema/mappings (not from a deployed contract)
- User needs **factory/template pattern** (factory contract deploys child contracts dynamically)
- User wants **multiple contracts** with different ABIs in one subgraph
- User wants **call handlers** (index function calls, not just events)
- User wants **timeseries/aggregation analytics** (daily volumes, hourly snapshots)
- User says "create a subgraph" but has **NO contract address**

## When NOT to Use

- User has a contract address and wants standard scaffolding → use `subgraph-create-from-contract` instead

## CLI-First Rule (No `ormi-cli init`)

`ormi-cli init` **requires** `--from-contract` — it errors without a contract address.

For custom subgraphs:

- Use the **Write tool** to create all project files manually
- Run `ormi-cli codegen` after creating schema and ABI files
- Run `ormi-cli build` for compile verification
- Use `ormi-cli add <address>` to add data sources to an existing project
- **Do NOT call `ormi-cli init`** — it will fail without `--from-contract`

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

## Step 1: Determine Use Case (MANDATORY — NEVER SKIP)

**You MUST ask the user which use case applies before writing any files.**

Present this table and ask:

| # | Use Case | Description | Key Feature |
|---|---|---|---|
| 1 | **Block Handler** | Index block-level data (hash, timestamp, gas, miner) | `blockHandlers`, dummy ABI |
| 2 | **Custom Contract** | User provides their own ABI | `eventHandlers` with user-supplied ABI |
| 3 | **Factory/Template** | Factory creates child contracts dynamically | `templates` + `Template.create()` |
| 4 | **Multi-Source** | Multiple contracts with different ABIs | Multiple `dataSources` entries |
| 5 | **Call Handler** | Index function calls, not just events | `callHandlers` (network-limited) |
| 6 | **Analytics** | Timeseries entities, daily/hourly aggregations | `@entity(timeseries: true)` + `@aggregation` (auto-computed) |

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
| Project name | Yes | — | Used for directory name and package.json `name` |
| Network | Yes | — | Use network mapping table below |
| Target directory | No | `.` (current dir) | Where to create the project folder |
| Start block | Conditional | — | Contract deployment block. Auto-detected if using contract address |
| Contract address | Conditional | — | Required for use cases 2, 3, 4, 5; NOT for block-only. Enables auto ABI fetch |
| ABI file/content | Conditional | — | Alternative to contract address. Manual ABI input |

### ABI Source Options

For use cases requiring an ABI (2, 3, 4, 5), you can provide it in two ways:

**Option A: Contract Address (Recommended)**

Provide the contract address and network. The skill will:

1. Run `ormi-cli abi <ADDRESS> --network <NETWORK> --full` to fetch the ABI
2. Auto-detect if it's a proxy contract and fetch the implementation ABI
3. Auto-detect the start block

Example prompt:
> "Create a subgraph for contract 0x1F98431c8ad98523631ae4a59f267346ea31f984 on mainnet"

**Option B: Manual ABI**

Provide the ABI content directly. Use this when:
- The contract is not verified on Etherscan/Sourcify
- You need a specific version of the ABI
- The contract is on a network not supported by block explorers

Example prompt:
> "Create a subgraph with this ABI: [{...}]"

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

## Step 2.5: Fetch ABI (if contract address provided)

If the user provided a contract address instead of an ABI:

1. **Fetch the ABI and metadata** using the ormi-cli abi command:

   ```bash
   ormi-cli abi <ADDRESS> --network <NETWORK> --full
   ```

2. **Parse the response** to extract:
   - `abi` — the ABI array
   - `contractName` — the contract name
   - `isProxy` — whether it's a proxy contract
   - `implementation` — the implementation address (if proxy)
   - `startBlock` — the deployment block

3. **Handle Proxy Contracts**:
   - If `isProxy: true`, inform the user:
     > "This is a proxy contract. Using implementation ABI from `<implementation_address>`."
   - The `ormi-cli abi` command already fetches the implementation ABI by default

4. **Save the ABI** to `abis/<ContractName>.json`

5. **Use auto-detected values**:
   - `contractName` → use in manifest and file names
   - `startBlock` → use in manifest `source.startBlock`

6. **Continue to Step 3** with the fetched ABI

---

## Step 3: Create Project Structure

### 3a: Create Directory Layout

Create the following structure under the target directory:

```
<project-name>/
├── package.json
├── tsconfig.json
├── subgraph.yaml
├── schema.graphql
├── abis/
│   └── [ABI files]
└── src/
    └── [mapping files]
```

### 3b: Create `package.json`

```json
{
  "name": "<project-name>",
  "version": "0.1.0",
  "scripts": {
    "codegen": "ormi-cli codegen",
    "build": "ormi-cli build",
    "test": "ormi-cli test",
    "clean": "ormi-cli clean",
    "deploy": "ormi-cli deploy"
  },
  "dependencies": {
    "ormi-cli": "0.1.0"
  },
  "devDependencies": {
    "@graphprotocol/graph-ts": "0.35.1"
  }
}
```

> ⚠️ **Known Issue: ormi-cli npm dependency**
>
> `package.json` references `"ormi-cli": "0.1.0"` as a dependency.
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

### 3c: Create `tsconfig.json`

```json
{
  "extends": "@graphprotocol/graph-ts/types/tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

### 3d: Create ABI Files

Create ABI files in `abis/` per use case:

**Block Handler only:** Create `abis/Dummy.json` with empty ABI:
```json
[]
```

Block handlers still require a dummy ABI entry in the manifest — the `[]` file satisfies this requirement.

**Custom Contract:** Copy the user's ABI to `abis/<ContractName>.json`

**Factory/Template:** Create both:
- `abis/Factory.json` — the factory contract ABI
- `abis/Child.json` — the child/template contract ABI

**Multi-Source:** Create one ABI file per contract in `abis/`.

### 3e: Create `subgraph.yaml`

Use `specVersion: 1.3.0` and `apiVersion: 0.0.9` for all templates.

---

**Use Case 1 — Block Handler:**

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
> The `abi: Dummy` entry is required even though no events are used.

**Block Handler Filter Options (optional):**

The block handler above runs on every block. You can add filters to reduce load:

```yaml
# Option A: Only blocks with calls to this contract (requires Parity tracing)
blockHandlers:
  - handler: handleBlockWithCall
    filter:
      kind: call

# Option B: Every Nth block (specVersion >= 0.0.8)
blockHandlers:
  - handler: handleBlock
    filter:
      kind: polling
      every: 10

# Option C: Run once at start as initialization (specVersion >= 0.0.8)
blockHandlers:
  - handler: handleOnce
    filter:
      kind: once
```

> The `call` filter requires Parity tracing — not supported on BSC, Arbitrum, Polygon, Optimism.
> The `polling` and `once` filters work on all networks.

---

**Use Case 2 — Custom Contract:**

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
        - event: <EventSignature(type,type)>
          handler: handle<EventName>
      file: ./src/mapping.ts
```

---

**Use Case 3 — Factory/Template:**

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
        - Factory
      abis:
        - name: Factory
          file: ./abis/Factory.json
        - name: Child
          file: ./abis/Child.json
      eventHandlers:
        - event: <ChildCreatedEvent(address,...)>
          handler: handleChildCreated
      file: ./src/factory.ts
templates:
  - name: Child
    kind: ethereum/contract
    source:
      abi: Child
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - <ChildEntityName>
      abis:
        - name: Child
          file: ./abis/Child.json
      eventHandlers:
        - event: <ChildEvent(type,...)>
          handler: handle<ChildEvent>
      file: ./src/child.ts
```

---

**Use Case 4 — Multi-Source:**

```yaml
specVersion: 1.3.0
schema:
  file: ./schema.graphql
indexerHints:
  prune: auto
dataSources:
  - kind: ethereum/contract
    name: <ContractA>
    network: <NETWORK>
    source:
      address: "<CONTRACT_A_ADDRESS>"
      abi: <ContractA>
      startBlock: <START_BLOCK>
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - <EntityA>
      abis:
        - name: <ContractA>
          file: ./abis/<ContractA>.json
      eventHandlers:
        - event: <EventA(type,...)>
          handler: handle<EventA>
      file: ./src/contractA.ts
  - kind: ethereum/contract
    name: <ContractB>
    network: <NETWORK>
    source:
      address: "<CONTRACT_B_ADDRESS>"
      abi: <ContractB>
      startBlock: <START_BLOCK>
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - <EntityB>
      abis:
        - name: <ContractB>
          file: ./abis/<ContractB>.json
      eventHandlers:
        - event: <EventB(type,...)>
          handler: handle<EventB>
      file: ./src/contractB.ts
```

---

**Use Case 5 — Call Handler:**

> ⚠️ **Before creating files, confirm the target network supports Parity tracing.**
> Call handlers do NOT work on BSC, Arbitrum, or networks without Parity tracing.

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
      callHandlers:
        - function: <functionSignature(type,type)>
          handler: handle<FunctionName>Call
      file: ./src/mapping.ts
```

---

**Use Case 6 — Analytics (Timeseries + Aggregation):**

> Requires `specVersion: 1.1.0` or higher. Uses built-in timeseries and aggregation — aggregation entities are **automatically computed** by the database, no manual aggregation code needed.

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
        - <TimeseriesEntityName>
      abis:
        - name: <ContractName>
          file: ./abis/<ContractName>.json
      eventHandlers:
        - event: <EventSignature(type,type)>
          handler: handle<EventName>
      file: ./src/mapping.ts
```

> Note: The manifest for analytics looks like a normal event-based subgraph.
> The timeseries/aggregation magic is entirely in `schema.graphql` — see Step 3f.

---

### 3f: Create `schema.graphql`

**⚠️ CRITICAL: Every entity MUST have explicit immutability.**

ORMI requires `@entity(immutable: true)` or `@entity(immutable: false)` on EVERY entity. A missing directive will cause a build error.

| Directive | Use When |
|---|---|
| `@entity(immutable: true)` | Historical records that never change (event logs, transfers, transactions) |
| `@entity(immutable: false)` | Current state that changes over time (balances, positions, totals, counters) |

**Use Case 1 — Block Handler:**

```graphql
type Block @entity(immutable: true) {
  id: Bytes!
  number: BigInt!
  timestamp: BigInt!
  hash: Bytes!
  parentHash: Bytes!
  gasUsed: BigInt!
  gasLimit: BigInt!
}
```

**Use Case 2 — Custom Contract (example event entity):**

```graphql
type EventRecord @entity(immutable: true) {
  id: Bytes!
  sender: Bytes!
  value: BigInt!
  timestamp: BigInt!
  blockNumber: BigInt!
  txHash: Bytes!
}

type Account @entity(immutable: false) {
  id: Bytes!
  totalEvents: BigInt!
  lastSeen: BigInt!
}
```

**Use Case 3 — Factory/Template:**

```graphql
type Factory @entity(immutable: false) {
  id: Bytes!
  childCount: BigInt!
}

type Child @entity(immutable: false) {
  id: Bytes!
  factory: Factory!
  createdAt: BigInt!
  createdAtBlock: BigInt!
}

type ChildEvent @entity(immutable: true) {
  id: Bytes!
  child: Child!
  timestamp: BigInt!
  txHash: Bytes!
}
```

**Use Case 4 — Multi-Source:**

```graphql
type EventFromA @entity(immutable: true) {
  id: Bytes!
  sender: Bytes!
  value: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type EventFromB @entity(immutable: true) {
  id: Bytes!
  user: Bytes!
  amount: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type GlobalStats @entity(immutable: false) {
  id: Bytes!
  totalEventsA: BigInt!
  totalEventsB: BigInt!
}
```

> Each contract typically gets its own entity types. Shared/aggregate entities (like `GlobalStats`) can be updated from multiple mapping files.

**Use Case 5 — Call Handler:**

```graphql
type FunctionCall @entity(immutable: true) {
  id: Bytes!
  caller: Bytes!
  inputParam1: String!
  inputParam2: String!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}
```

> Call handler entities capture function inputs and outputs, not event emissions. Model fields based on the function signature parameters.

**Use Case 6 — Analytics (Timeseries + Aggregation):**

> Requires `specVersion: 1.1.0`. Aggregation entities are **automatically computed** by the database — you only write handlers to save raw timeseries data points.

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

> After creating `schema.graphql` and installing dependencies (Step 4), run `ormi-cli codegen` before writing mappings (Step 5).

---

## Step 3.5: Handler and Entity Selection (MANDATORY — NEVER SKIP)

**You MUST ask the user before writing mapping code. NEVER assume the user wants all handlers or all data fields.**

**For event-based use cases (2, 3, 4):**

If the user provided an ABI, parse it and list all events:

> I found these events in the ABI:
>
> | Event | Parameters | Suggested Use |
> |---|---|---|
> | `<EventA>` | `(address indexed from, uint256 amount)` | Index for tracking transfers |
> | `<EventB>` | `(address indexed user, uint256 fee)` | Index for fee tracking |
>
> Which events do you want to index?
> - **Specific events** — choose from the list above
> - **All events** — index everything

**Only skip asking if the user explicitly said "index everything" or "all events".**

**For block handlers (use case 1):**

Ask which block data fields to capture:

> For block handler, which data fields do you want to capture?
> - `hash`, `number`, `timestamp` (minimal — fast indexing)
> - `gasUsed`, `gasLimit` (add gas metrics)
> - `parentHash` (add parent reference)
> - `miner` (add miner address)
> - All of the above

**For factory/template (use case 3):**

Ask about BOTH layers:
1. Which factory events to watch (e.g., child creation events)
2. Which child contract events/calls to index in the template

**For call handlers (use case 5):**

Ask which function calls to index. Parse the ABI and list all non-view, non-pure functions:

> I found these functions in the ABI:
>
> | Function | Parameters | Returns |
> |---|---|---|
> | `createGravatar` | `(string displayName, string imageUrl)` | — |
> | `updateGravatar` | `(string displayName, string imageUrl)` | — |
>
> Which function calls do you want to index?

**For analytics (use case 6):**

Ask what metrics to aggregate and at which intervals:

> For analytics, I need to know:
> 1. Which events provide the raw data points? (e.g., Swap, Transfer)
> 2. What metrics should be aggregated? (e.g., volume, price, count)
> 3. What intervals? (`hour`, `day`, or both)
> 4. Any dimensions to group by? (e.g., per-token, per-pool)

---

## Step 4: Install Dependencies (REQUIRED)

After creating all files:

```bash
npm install
```

> ⚠️ If `ormi-cli` is not published to npm, this will fail with a 404.
> Update `package.json` to use a local `file:` path first (see Step 3b).

> **Detecting the local `ormi-cli` path:**
>
> If you are in the `ormi-cli` repo, use the repo root:
> ```bash
> # From within the ormi-cli repo:
> "ormi-cli": "file:$(pwd)"
>
> # Or use the absolute path:
> "ormi-cli": "file:/Users/<username>/git/ormi/ormi-cli"
> ```
>
> If `ormi-cli` is installed globally, check with:
> ```bash
> which ormi-cli
> npm list -g ormi-cli
> ```

---

## Step 5: Write Mapping Code and Build

### 5a: Block Handler Mapping

```typescript
import { ethereum, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { Block } from "../generated/schema"

export function handleBlock(block: ethereum.Block): void {
  let entity = new Block(block.hash)
  entity.number = block.number
  entity.timestamp = block.timestamp
  entity.hash = block.hash
  entity.parentHash = block.parentHash
  entity.gasUsed = block.gasUsed
  entity.gasLimit = block.gasLimit
  entity.save()
}
```

> ⚠️ Block handler parameter is `ethereum.Block`, NOT an event type.
> Signature is `handleBlock(block: ethereum.Block): void`.

### 5b: Custom Contract / Event Handler Mapping

```typescript
import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import { MyEvent } from "../generated/MyContract/MyContract"
import { EventRecord, Account } from "../generated/schema"

export function handleMyEvent(event: MyEvent): void {
  // Immutable event record
  let record = new EventRecord(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  record.sender = event.params.sender
  record.value = event.params.value
  record.timestamp = event.block.timestamp
  record.blockNumber = event.block.number
  record.txHash = event.transaction.hash
  record.save()

  // Mutable account state
  let account = Account.load(event.params.sender)
  if (account == null) {
    account = new Account(event.params.sender)
    account.totalEvents = BigInt.fromI32(0)
  }
  account.totalEvents = account.totalEvents.plus(BigInt.fromI32(1))
  account.lastSeen = event.block.timestamp
  account.save()
}
```

### 5c: Factory Handler Mapping (`src/factory.ts`)

```typescript
import { BigInt } from "@graphprotocol/graph-ts"
import { ChildCreated } from "../generated/Factory/Factory"
import { Child as ChildTemplate } from "../generated/templates"
import { Factory, Child } from "../generated/schema"

export function handleChildCreated(event: ChildCreated): void {
  // Track factory state
  let factory = Factory.load(event.address)
  if (factory == null) {
    factory = new Factory(event.address)
    factory.childCount = BigInt.fromI32(0)
  }
  factory.childCount = factory.childCount.plus(BigInt.fromI32(1))
  factory.save()

  // Create child entity
  let child = new Child(event.params.childAddress)
  child.factory = event.address
  child.createdAt = event.block.timestamp
  child.createdAtBlock = event.block.number
  child.save()

  // Activate the template to start indexing the child contract
  ChildTemplate.create(event.params.childAddress)
}
```

### 5d: Child Template Mapping (`src/child.ts`)

```typescript
import { BigInt } from "@graphprotocol/graph-ts"
import { SomeEvent } from "../generated/templates/Child/Child"
import { ChildEvent } from "../generated/schema"

export function handleSomeEvent(event: SomeEvent): void {
  let entity = new ChildEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.child = event.address
  entity.timestamp = event.block.timestamp
  entity.txHash = event.transaction.hash
  entity.save()
}
```

### 5e: Multi-Source Mapping

Each contract gets its own mapping file with imports from its respective generated directory.

**`src/contractA.ts`:**

```typescript
import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import { EventA } from "../generated/ContractA/ContractA"
import { EventFromA, GlobalStats } from "../generated/schema"

export function handleEventA(event: EventA): void {
  let record = new EventFromA(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  record.sender = event.params.sender
  record.value = event.params.value
  record.timestamp = event.block.timestamp
  record.txHash = event.transaction.hash
  record.save()

  // Update shared stats entity
  let stats = GlobalStats.load(Bytes.fromI32(0))
  if (stats == null) {
    stats = new GlobalStats(Bytes.fromI32(0))
    stats.totalEventsA = BigInt.fromI32(0)
    stats.totalEventsB = BigInt.fromI32(0)
  }
  stats.totalEventsA = stats.totalEventsA.plus(BigInt.fromI32(1))
  stats.save()
}
```

**`src/contractB.ts`:**

```typescript
import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import { EventB } from "../generated/ContractB/ContractB"
import { EventFromB, GlobalStats } from "../generated/schema"

export function handleEventB(event: EventB): void {
  let record = new EventFromB(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  record.user = event.params.user
  record.amount = event.params.amount
  record.timestamp = event.block.timestamp
  record.txHash = event.transaction.hash
  record.save()

  // Update shared stats entity
  let stats = GlobalStats.load(Bytes.fromI32(0))
  if (stats == null) {
    stats = new GlobalStats(Bytes.fromI32(0))
    stats.totalEventsA = BigInt.fromI32(0)
    stats.totalEventsB = BigInt.fromI32(0)
  }
  stats.totalEventsB = stats.totalEventsB.plus(BigInt.fromI32(1))
  stats.save()
}
```

> **Key pattern:** Each mapping file imports events from its own generated contract directory (`../generated/ContractA/ContractA` vs `../generated/ContractB/ContractB`), but they share schema entity imports from `../generated/schema`.
> Each mapping file path must match the `file:` field in the corresponding `dataSources` entry in `subgraph.yaml`.

### 5f: Call Handler Mapping

```typescript
import { Bytes } from "@graphprotocol/graph-ts"
import { CreateGravatarCall } from "../generated/MyContract/MyContract"
import { FunctionCall } from "../generated/schema"

export function handleCreateGravatarCall(call: CreateGravatarCall): void {
  let entity = new FunctionCall(call.transaction.hash)
  entity.caller = call.from
  entity.inputParam1 = call.inputs._displayName
  entity.inputParam2 = call.inputs._imageUrl
  entity.blockNumber = call.block.number
  entity.timestamp = call.block.timestamp
  entity.txHash = call.transaction.hash
  entity.save()
}
```

**Call handler key differences from event handlers:**

| Aspect | Event Handler | Call Handler |
|---|---|---|
| Parameter type | `<EventName>` (e.g., `Transfer`) | `<FunctionName>Call` (e.g., `CreateGravatarCall`) |
| Access data | `event.params.<name>` | `call.inputs.<name>` and `call.outputs.<name>` |
| Generated from | ABI event entries | ABI function entries |
| Trigger | Contract emits a log | Function is called externally |
| Import path | `../generated/<Contract>/<Contract>` | `../generated/<Contract>/<Contract>` (same) |
| Network support | All EVM networks | Only networks with Parity tracing API |

> **Input parameter naming:** Codegen prefixes function parameters with `_` (underscore). So a Solidity function `createGravatar(string displayName, string imageUrl)` generates `call.inputs._displayName` and `call.inputs._imageUrl`.
>
> **When function is called by the contract itself:** Call handlers only trigger when the function is called by an account OTHER than the contract itself, or when it is marked as `external` in Solidity and called as part of another function in the same contract.

### 5g: Analytics / Timeseries Mapping

With built-in timeseries (specVersion >= 1.1.0), you only save raw data points. **Aggregation entities are computed automatically by graph-node — you do NOT write code for them.**

```typescript
import { BigDecimal } from "@graphprotocol/graph-ts"
import { Swap } from "../generated/Pool/Pool"
import { TokenData } from "../generated/schema"

export function handleSwap(event: Swap): void {
  // Save a timeseries data point — id and timestamp are auto-managed
  let data = new TokenData(0)
  data.token = event.address
  data.amount = event.params.amount.toBigDecimal()
  data.priceUSD = event.params.priceUSD.toBigDecimal()
  data.save()

  // That's it! TokenStats aggregation entities (hourly/daily sums, counts, etc.)
  // are automatically computed by graph-node based on the @aggregation schema.
  // No manual aggregation code needed.
}
```

**Key differences from regular entity handlers:**

| Aspect | Regular Entity | Timeseries Entity |
|---|---|---|
| ID type | `Bytes!` (you set it) | `Int8!` (auto-incremented, pass `0`) |
| Timestamp | You set it manually | `Timestamp!` (auto-set to block timestamp) |
| Mutability | You choose | Always immutable |
| Aggregation | Manual code in handlers | Automatic via `@aggregation` schema entities |
| BigDecimal usage | Rare | Common (financial amounts, prices) |

**BigDecimal patterns:**

```typescript
// ❌ WRONG — no BigDecimal.fromI32()
let amount = BigDecimal.fromI32(100)

// ✅ CORRECT — use fromString
let amount = BigDecimal.fromString("100")
let zero = BigDecimal.fromString("0")

// ✅ Convert BigInt to BigDecimal
let amount = event.params.value.toBigDecimal()

// ✅ BigDecimal arithmetic uses the same method call pattern as BigInt
let total = price.times(quantity)
let half = total.div(BigDecimal.fromString("2"))
```

### 5h: Run Build

```bash
ormi-cli codegen
ormi-cli build
```

Iterate until build succeeds. Re-run `ormi-cli codegen` after any schema or ABI change.

---

## Step 6: Guardrails (CRITICAL — READ ALL)

### 6a: Entity Immutability (ORMI Required)

Every entity MUST have `@entity(immutable: true)` or `@entity(immutable: false)`.
Missing this directive causes a build error.

```graphql
# ❌ WRONG — missing immutability directive
type Transfer @entity {
  id: Bytes!
}

# ✅ CORRECT
type Transfer @entity(immutable: true) {
  id: Bytes!
}
```

### 6b: BigInt Arithmetic ⚠️⚠️⚠️

AssemblyScript does NOT support `+`, `-`, `*`, `/` operators on BigInt.
**This is the #1 cause of build failures.**

```typescript
// ❌ WRONG — compiler error
count = count + 1
balance = balance - amount
total = price * quantity

// ✅ CORRECT — use method calls
count = count.plus(BigInt.fromI32(1))
balance = balance.minus(amount)
total = price.times(quantity)
volume = total.div(BigInt.fromI32(100))
```

**Double-check every arithmetic operation before building.**

### 6c: Bytes to Address Conversion

When binding a contract for view function calls, `event.address` is `Bytes` but `Contract.bind()` expects `Address`:

```typescript
import { Address } from "@graphprotocol/graph-ts"
import { MyContract } from "../generated/MyContract/MyContract"

// ❌ WRONG
let contract = MyContract.bind(event.address)

// ✅ CORRECT
let contract = MyContract.bind(Address.fromBytes(event.address))
```

### 6d: Factory/Template Guardrails

- `Template.create()` takes an `Address` parameter — NOT `Bytes`
- Template name in `ChildTemplate.create(...)` import MUST match `templates[].name` in `subgraph.yaml` exactly (case-sensitive)
- Import templates from `../generated/templates`, NOT from `../generated/schema`
- Use `DataSourceContext` to pass state from parent to template:

```typescript
import { DataSourceContext } from "@graphprotocol/graph-ts"
import { Child as ChildTemplate } from "../generated/templates"

let context = new DataSourceContext()
context.setString("factoryAddress", event.address.toHexString())
ChildTemplate.createWithContext(event.params.childAddress, context)
```

### 6e: Block Handler Guardrails

- The dummy ABI (`[]`) MUST exist at the path specified in `subgraph.yaml`
- `source` in `subgraph.yaml` does NOT include `address` for block-only handlers
- `source` MUST include `abi: Dummy` (or whatever name you gave it)
- Handler signature is `handleBlock(block: ethereum.Block): void`
- The parameter is `ethereum.Block`, NOT an event type

### 6f: Call Handler Guardrails

- Confirm network supports Parity tracing BEFORE creating files
- Call handler signature: `handle<FunctionName>Call(call: <FunctionName>Call): void`
- The generated call type comes from `../generated/<ContractName>/<ContractName>`
- Do NOT use on BSC, Arbitrum, or networks without Parity tracing API

### 6g: Common AssemblyScript Pitfalls

```typescript
// ❌ Null check — use == null, not !
if (!entity) { ... }           // wrong in AssemblyScript
if (entity == null) { ... }   // correct

// ❌ Missing .save() — entity changes are silently lost
entity.value = newValue
// forgot entity.save()

// ✅ Always call .save() after mutations
entity.value = newValue
entity.save()

// ❌ Plain integer where BigInt needed
entity.count = 0               // wrong — type mismatch
entity.count = BigInt.fromI32(0)  // correct

// ❌ Missing import from generated files
import { Transfer } from "../generated/schema"  // only schema types here
import { Transfer as TransferEvent } from "../generated/Contract/Contract"  // event types here

// ❌ Case mismatch on event param names
event.params.From  // wrong — params are camelCase as in ABI
event.params.from  // correct
```

### 6h: Performance Best Practices

These recommendations come from the official Graph Protocol best practices and significantly impact indexing speed and query performance.

**1. Use `Bytes!` for entity IDs (28% faster queries, 48% faster indexing):**

```graphql
# ❌ SLOW — String IDs
type Transfer @entity(immutable: true) {
  id: String!  # Don't use String unless human-readable
}

# ✅ FAST — Bytes IDs
type Transfer @entity(immutable: true) {
  id: Bytes!
}
```

Only use `String!` IDs when the ID truly contains human-readable text. Never use the deprecated `ID!` type (it's a synonym for `String!`).

**2. Use `@derivedFrom` instead of arrays:**

```graphql
# ❌ SLOW — storing array on entity (grows unbounded, slows indexing)
type Token @entity(immutable: false) {
  id: Bytes!
  transfers: [Transfer!]!
}

# ✅ FAST — use @derivedFrom reverse lookup
type Token @entity(immutable: false) {
  id: Bytes!
  transfers: [Transfer!]! @derivedFrom(field: "token")
}

type Transfer @entity(immutable: true) {
  id: Bytes!
  token: Token!
  amount: BigInt!
}
```

For one-to-many: store the relationship on the 'one' side (Transfer has `token: Token!`), derive the array on the 'many' side with `@derivedFrom`.

**3. Avoid `eth_calls` — they are the #1 cause of slow indexing:**

```typescript
// ❌ SLOW — eth_call for every event
let contract = MyContract.bind(Address.fromBytes(event.address))
let result = contract.someViewFunction()

// ✅ FAST — use event data directly
let value = event.params.value
```

If `eth_calls` are unavoidable, declare them in the manifest for parallel execution (specVersion >= 1.2.0):

```yaml
eventHandlers:
  - event: Swap(indexed address,indexed address,int256,int256,uint160,uint128,int24)
    handler: handleSwap
    calls:
      global0X128: Pool[event.address].feeGrowthGlobal0X128()
      global1X128: Pool[event.address].feeGrowthGlobal1X128()
```

**4. ID construction patterns:**

```typescript
// Per-event entity (multiple events per transaction)
let id = event.transaction.hash.concatI32(event.logIndex.toI32())

// Per-transaction entity (one entity per transaction)
let id = event.transaction.hash

// Daily aggregation bucket
let dayID = event.block.timestamp.toI32() / 86400
let id = Bytes.fromI32(dayID)

// Constant address as Bytes
let id = Bytes.fromHexString("0xdead...beef")

// ❌ NEVER use string concatenation for IDs
let id = event.transaction.hash.toHex() + "-" + event.logIndex.toString()
```

**5. Use `indexerHints.prune: auto`** — already included in all manifest templates above. Only use `prune: never` if you need time-travel queries.

**6. Mark entities immutable whenever possible** — event logs, transfers, and any entity that is written once and never updated should use `@entity(immutable: true)`. This is already enforced in Step 6a.

---

## Step 7: Build Error Reference

| Error | Fix |
|---|---|
| `Type 'i32' is not assignable to type 'BigInt'` | Use `BigInt.fromI32(n)` |
| `Cannot find name 'X'` | Add import from generated files |
| `Object is possibly null` | Add null check: `if (entity == null) { entity = new Entity(id) }` |
| `Property 'X' does not exist on type 'Y'` | Run `ormi-cli codegen` after schema changes |
| `Missing ABI for data source` | Verify ABI path in `subgraph.yaml` matches file in `abis/` |
| `No handler found for event/function` | Handler function name must match `subgraph.yaml` manifest exactly |
| `Unknown data source template` | Template name in `Template.create()` must match `templates[].name` exactly |
| `Cannot use ethereum.Block as event` | Block handler signature is `(block: ethereum.Block)`, not an event type |
| `duplicate dataSources name` | Each data source in multi-source must have a unique `name:` field |

---

## Step 8: Explain Results

Summarize what was created:

1. **Use case type**: Block handler / Custom contract / Factory / Multi-source / Call handler / Analytics
2. **Entities**: List each entity, its purpose, and immutability (`immutable: true/false`)
3. **Handlers**: Which handlers were created and what on-chain data they index
4. **Schema relationships**: How entities connect to each other
5. **Start block**: What block indexing begins from and why
6. **Known limitations**: Anything skipped, network restrictions, or needing attention

---

## Step 9: Next Steps

- **To deploy**: Use the `subgraph-deploy` skill (authenticates via MCP and fetches deploy key automatically)
- **To test**: `ormi-cli test` (requires Matchstick test files in `tests/`)
- **To add more contracts**: `ormi-cli add <address>` to extend an existing project
- **To monitor after deploy**: Use the `subgraph-monitor` skill

---

## MCP Tools Used (Optional, Non-Blocking)

- `list-chains` — validate network name is supported on ORMI
- `search-project-subgraphs` — discover if a similar subgraph already exists
- `get-schema` — learn from existing subgraph schemas for reference
