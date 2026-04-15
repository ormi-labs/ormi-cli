---
name: subgraph-create-events
description: Index events from one or more contracts using eventHandlers. Use when indexing ERC-20 transfers, DEX swaps, NFT mints, or any Solidity events. Covers Simple Contract (single data source) and Multi-Source (multiple contracts) use cases.
---

# Subgraph Create: Event Indexing

Index events from one or more smart contracts using `eventHandlers`. This covers two patterns:

| Pattern             | Description                                | When to Use                                                 |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| **Simple Contract** | One data source, one contract              | Indexing events from a single contract                      |
| **Multi-Source**    | Multiple data sources, different contracts | Indexing events from multiple contracts with different ABIs |

> **Prerequisite:** Complete Steps 1–5 of the `subgraph-create` skill (determine use case, gather inputs, scaffold, fetch ABI, analyze and design) before proceeding.

---

## Step 6: Add Data Source

### 6a: Save ABI

```bash
# ABI should already be saved from Step 4 of subgraph-create
# If manual ABI, save to:
# abis/<ContractName>.json
```

### 6b: Update subgraph.yaml

**Simple Contract (single data source):**

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
      address: '<CONTRACT_ADDRESS>'
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

**Multi-Source (multiple data sources):**

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
      address: '<TOKEN_A_ADDRESS>'
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
      address: '<TOKEN_B_ADDRESS>'
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

> Each data source can share ABIs (e.g., both use `ERC20.json`) but must have unique handler function names and separate mapping files.

### 6c: Create schema.graphql

**Immutable entity (for event data that never changes):**

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

### 6d: Create Mapping Files

Create the TypeScript mapping files in `src/`:

```typescript
import { Transfer as TransferEvent } from '../generated/<ContractName>/<ContractName>'
import { Transfer } from '../generated/schema'
import { Bytes, BigInt } from '@graphprotocol/graph-ts'

export function handleTransfer(event: TransferEvent): void {
  let entity = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
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

## Common Patterns

### Track Running Totals

> For full OHLC snapshots and per-entity day/hour windows, use the `subgraph-create-analytics` skill.

```typescript
// Simple protocol-wide daily total (minimal pattern)
let dayID = event.block.timestamp.toI32() / 86400
let dailyVolume = DailyVolume.load(dayID.toString())

if (dailyVolume == null) {
  dailyVolume = new DailyVolume(dayID.toString())
  dailyVolume.volume = BigDecimal.fromString('0')
  dailyVolume.txCount = 0
}

dailyVolume.volume = dailyVolume.volume.plus(event.params.value.toBigDecimal())
dailyVolume.txCount += 1
dailyVolume.save()
```

### Load Contract Instances

```typescript
import { Contract } from '../generated/<ContractName>/<ContractName>'
import { Address } from '@graphprotocol/graph-ts'

// Read contract state
let contract = Contract.bind(Address.fromBytes(event.address))
let result = contract.someViewFunction()
```

### IPFS Content

```typescript
import { ipfs } from '@graphprotocol/graph-ts'

// Load IPFS content (for NFT metadata, etc.)
let hash = event.params.tokenURI.split('/').pop()
let data = ipfs.cat(hash)
if (data) {
  // Parse JSON, extract attributes
}
```

### Helper Library Structure (multi-file mappings)

For subgraphs with more than a few event handlers, organize mapping code across multiple files with shared helpers.

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

> **Manifest wiring:** Each data source in `subgraph.yaml` points its `file:` path directly at the handler file (e.g., `file: ./src/handlers/pool.ts`), not at a central `mapping.ts`. Each handler file contains the exported functions referenced by `eventHandlers`.

**constants.ts — protocol addresses and configuration:**

```typescript
import { BigInt, BigDecimal } from '@graphprotocol/graph-ts'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const FACTORY_ADDRESS = '0x...' // Your factory address

export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)
export const ZERO_BD = BigDecimal.fromString('0')
export const ONE_BD = BigDecimal.fromString('1')

export const SECONDS_PER_DAY = 86400
export const SECONDS_PER_HOUR = 3600
```

**utils.ts — shared helper functions:**

```typescript
import { Address } from '@graphprotocol/graph-ts'
import { SECONDS_PER_DAY, SECONDS_PER_HOUR } from './constants'

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

---

## Guardrails

### Entity Immutability

Every entity MUST have `@entity(immutable: true)` or `@entity(immutable: false)`.

- **Immutable entities** (`immutable: true`): Event-based data that never changes (Transfers, Swaps). Use `id: Bytes!` with `event.transaction.hash.concatI32(event.logIndex.toI32())`.
- **Mutable entities** (`immutable: false`): State that updates (Accounts, Pools). Use `id: ID!` with string IDs.

```graphql
# CORRECT: Immutable event entity
type Transfer @entity(immutable: true) {
  id: Bytes!
  from: Bytes!
  to: Bytes!
  value: BigInt!
}

# CORRECT: Mutable state entity
type Account @entity(immutable: false) {
  id: ID!
  balance: BigInt!
}

# WRONG: Missing immutability annotation
type Transfer @entity {
  id: Bytes!
}
```

### BigInt Arithmetic

Operators `+`, `-`, `*`, `/` do NOT work on BigInt. Use methods instead:

```typescript
// WRONG: Operators don't compile
let sum = a + b

// CORRECT: Use methods
let sum = a.plus(b)
let diff = a.minus(b)
let product = a.times(b)
let quotient = a.div(b)
```

### Bytes to Address Conversion

`Contract.bind()` requires `Address` type, not `Bytes`. Always convert:

```typescript
import { Address } from '@graphprotocol/graph-ts'

// WRONG: event.address is Bytes, not Address
let contract = Contract.bind(event.address)

// CORRECT: Convert Bytes to Address
let contract = Contract.bind(Address.fromBytes(event.address))
```

### Common AssemblyScript Pitfalls

| Pitfall              | Wrong                        | Correct                               |
| -------------------- | ---------------------------- | ------------------------------------- |
| Null check           | `if (!entity)`               | `if (entity == null)`                 |
| Int to BigInt        | `let x: BigInt = 0`          | `let x = BigInt.fromI32(0)`           |
| String to BigDecimal | `BigDecimal.fromI32(1)`      | `BigDecimal.fromString("1")`          |
| Missing `.save()`    | Entity created but not saved | Always call `entity.save()`           |
| Missing imports      | Use type without import      | Import from `@graphprotocol/graph-ts` |

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
// Create from string
let zero = BigDecimal.fromString('0')
let one = BigDecimal.fromString('1')

// WRONG: fromI32 doesn't exist on BigDecimal
let wrong = BigDecimal.fromI32(0) // Compile error!

// Convert BigInt to BigDecimal
let bdValue = bigIntValue.toBigDecimal()
```

### Build Error Reference

| Error                                         | Cause                   | Fix                                                    |
| --------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| `Cannot use operator '+' with BigInt`         | Using `+` on BigInt     | Use `.plus()` method                                   |
| `Type 'Bytes' is not assignable to 'Address'` | Passing Bytes to bind() | Use `Address.fromBytes()`                              |
| `Entity 'X' has no field 'Y'`                 | Schema mismatch         | Update schema, run codegen                             |
| `Cannot find name 'BigInt'`                   | Missing import          | Add `import { BigInt } from '@graphprotocol/graph-ts'` |
| `Argument of type 'null' is not assignable`   | Missing null check      | Check `== null` before access                          |
