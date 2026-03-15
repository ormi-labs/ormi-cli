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
| 6 | **Analytics** | Timeseries entities, daily/hourly aggregations | Aggregation logic in handlers |

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
| Start block | Yes | — | Contract deployment block, or a recent block |
| Contract address | Conditional | — | Required for use cases 2, 3, 4, 5; NOT for block-only |
| ABI file/content | Conditional | — | Required for use cases 2, 3, 4, 5; dummy `[]` for block-only |

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

---

**Use Case 2 — Custom Contract:**

```yaml
specVersion: 1.3.0
schema:
  file: ./schema.graphql
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

**Use Case 6 — Analytics (timeseries):**

```graphql
type Protocol @entity(immutable: false) {
  id: Bytes!
  totalVolumeUSD: BigDecimal!
  totalTxCount: BigInt!
}

type DailySnapshot @entity(immutable: true) {
  id: Bytes!
  protocol: Protocol!
  dailyVolumeUSD: BigDecimal!
  dailyTxCount: BigInt!
  date: Int!
}

type HourlySnapshot @entity(immutable: true) {
  id: Bytes!
  protocol: Protocol!
  hourlyVolumeUSD: BigDecimal!
  hourlyTxCount: BigInt!
  hour: Int!
}
```

After creating `schema.graphql`, always run codegen before writing mappings:

```bash
ormi-cli codegen
```

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

---

## Step 4: Install Dependencies (REQUIRED)

After creating all files:

```bash
npm install
```

> ⚠️ If `ormi-cli` is not published to npm, this will fail with a 404.
> Update `package.json` to use a local `file:` path first (see Step 3b).

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

### 5e: Run Build

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
