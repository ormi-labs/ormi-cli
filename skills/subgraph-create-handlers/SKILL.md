---
name: subgraph-create-handlers
description: Block handlers and call handlers for indexing non-event data. Use when data is not available via events, such as account balances, reserve sizes, or periodic snapshots. Covers block-level indexing and function call indexing.
---

# Subgraph Create: Block & Call Handlers

Index data that isn't available through events alone. Two patterns:

| Pattern | Description | When to Use |
|---|---|---|
| **Block Handler** | Index block-level data (hash, timestamp, gas, miner) | No contract events needed, index chain-level data |
| **Call Handler** | Index function calls, not just events | Need to capture contract function invocations |

> **Prerequisite:** Complete Steps 1–5 of the `subgraph-create` skill (determine use case, gather inputs, scaffold, fetch ABI, analyze and design) before proceeding.

---

## Network Limitations

> **Call handlers require the Parity tracing API.** They are NOT supported on:
> - BNB Chain (BSC)
> - Arbitrum (arbitrum-one, arbitrum-sepolia)
> - Some other L2 networks
>
> Supported networks include Ethereum mainnet, Gnosis, Polygon (matic), Optimism, Base.
>
> The block handler `call` filter also requires Parity tracing — same unsupported networks apply.

Always confirm the target network supports these patterns before proceeding.

---

## Step 6: Add Data Source

### Block Handler (Use Case 2)

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

### Call Handler (Use Case 5)

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

### Schema Examples

**Block entity:**
```graphql
type Block @entity(immutable: true) {
  id: Bytes!
  hash: Bytes!
  number: BigInt!
  timestamp: BigInt!
  parentHash: Bytes!
  gasLimit: BigInt!
  gasUsed: BigInt!
  miner: Bytes!
}
```

**Call entity:**
```graphql
type Call @entity(immutable: true) {
  id: Bytes!
  caller: Bytes!
  contract: Bytes!
  functionSignature: String!
  blockNumber: BigInt!
  timestamp: BigInt!
  transaction: Bytes!
}
```

### Mapping Files

**Block handler:**
```typescript
import { ethereum } from '@graphprotocol/graph-ts'
import { Block } from '../generated/schema'

export function handleBlock(block: ethereum.Block): void {
  let entity = new Block(block.hash)
  entity.hash = block.hash
  entity.number = block.number
  entity.timestamp = block.timestamp
  entity.parentHash = block.parentHash
  entity.gasLimit = block.gasLimit
  entity.gasUsed = block.gasUsed
  entity.miner = block.miner
  entity.save()
}
```

**Call handler:**
```typescript
import { MintCall } from '../generated/<ContractName>/<ContractName>'
import { Call } from '../generated/schema'

export function handleMintCall(event: MintCall): void {
  let entity = new Call(event.transaction.hash)
  entity.caller = event.from
  entity.contract = event.to
  entity.functionSignature = 'mint(address,uint256)'
  entity.blockNumber = event.block.number
  entity.timestamp = event.block.timestamp
  entity.transaction = event.transaction.hash
  entity.save()
}
```

---

## Guardrails

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

### Entity Immutability

Every entity MUST have `@entity(immutable: true)` or `@entity(immutable: false)`.

- **Immutable entities** (`immutable: true`): Event/call data that never changes. Use `id: Bytes!`.
- **Mutable entities** (`immutable: false`): State that updates. Use `id: ID!` with string IDs.

### BigInt Arithmetic

Operators `+`, `-`, `*`, `/` do NOT work on BigInt. Use methods instead:

```typescript
// CORRECT: Use methods
let sum = a.plus(b)
let diff = a.minus(b)
```

### Common AssemblyScript Pitfalls

| Pitfall | Wrong | Correct |
|---------|-------|---------|
| Null check | `if (!entity)` | `if (entity == null)` |
| Int to BigInt | `let x: BigInt = 0` | `let x = BigInt.fromI32(0)` |
| String to BigDecimal | `BigDecimal.fromI32(1)` | `BigDecimal.fromString("1")` |
| Missing `.save()` | Entity created but not saved | Always call `entity.save()` |
| Missing imports | Use type without import | Import from `@graphprotocol/graph-ts` |

### Build Error Reference

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot use operator '+' with BigInt` | Using `+` on BigInt | Use `.plus()` method |
| `Type 'Bytes' is not assignable to 'Address'` | Passing Bytes to bind() | Use `Address.fromBytes()` |
| `Entity 'X' has no field 'Y'` | Schema mismatch | Update schema, run codegen |
| `Cannot find name 'BigInt'` | Missing import | Add `import { BigInt } from '@graphprotocol/graph-ts'` |
