---
name: subgraph-create-factory
description: Factory/template pattern for indexing dynamically deployed contracts. Use when a factory contract creates new child contracts at runtime, such as DEX pair factories or registry patterns. Covers single factory + template and cascading multi-level instantiation.
---

# Subgraph Create: Factory/Template Pattern

Index contracts dynamically deployed by a factory. The factory emits events when new child contracts are created, and each child gets its own template-based indexing.

> **Prerequisite:** Complete Steps 1–5 of the `subgraph-create` skill (determine use case, gather inputs, scaffold, fetch ABI, analyze and design) before proceeding.

---

## How It Works

1. A **factory contract** emits events when it creates child contracts
2. The **data source** watches the factory for those creation events
3. A **template** defines how to index each child contract
4. The factory mapping calls `Template.create(address)` to start indexing each new child

---

## Step 6: Add Data Source

### 6a: Save ABIs

Save both the factory ABI and the child contract ABI:

```bash
# Factory ABI (saved from Step 4 of subgraph-create)
# abis/Factory.json

# Child contract ABI
# abis/Pair.json (or Pool.json, Token.json, etc.)
```

### 6b: Update subgraph.yaml

**Basic Factory + Template:**

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
      address: '<FACTORY_ADDRESS>'
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

### 6c: Factory Mapping

In the factory mapping, instantiate templates when child contracts are created:

```typescript
import { PairCreated } from '../generated/Factory/Factory'
import { Pair as PairTemplate } from '../generated/templates'

export function handlePairCreated(event: PairCreated): void {
  // Create template instance for the new pair
  PairTemplate.create(event.params.pair)
}
```

### 6d: Child Template Mapping

Create a separate mapping file for the child contract:

```typescript
// src/pair.ts
import { Swap as SwapEvent } from '../generated/templates/Pair/Pair'
import { Swap, Pair } from '../generated/schema'

export function handleSwap(event: SwapEvent): void {
  let pair = Pair.load(event.address.toHexString())
  // Handle swap events for this pair instance
  let swap = new Swap(event.transaction.hash.concatI32(event.logIndex.toI32()))
  swap.pair = event.address.toHexString()
  swap.save()
}
```

---

## Cascading Templates

When a factory creates child contracts that in turn emit events to discover further contracts, you chain multiple templates. Each template handler can instantiate the next.

**Example: Registry -> Provider -> Pool**

```yaml
# Append to an existing manifest
dataSources:
  - kind: ethereum/contract
    name: Registry
    network: <NETWORK>
    source:
      address: '<REGISTRY_ADDRESS>'
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

---

## Guardrails

### Entity Immutability

Every entity MUST have `@entity(immutable: true)` or `@entity(immutable: false)`.

- **Immutable entities** (`immutable: true`): Event-based data that never changes. Use `id: Bytes!` with `event.transaction.hash.concatI32(event.logIndex.toI32())`.
- **Mutable entities** (`immutable: false`): State that updates (Pairs, Pools, Tokens). Use `id: ID!` with string IDs.

### BigInt Arithmetic

Operators `+`, `-`, `*`, `/` do NOT work on BigInt. Use methods instead:

```typescript
// CORRECT: Use methods
let sum = a.plus(b)
let diff = a.minus(b)
let product = a.times(b)
let quotient = a.div(b)
```

### Bytes to Address Conversion

`Contract.bind()` requires `Address` type, not `Bytes`:

```typescript
import { Address } from '@graphprotocol/graph-ts'

// CORRECT: Convert Bytes to Address
let contract = Contract.bind(Address.fromBytes(event.address))
```

### Factory/Template Guardrails

1. **Template name is case-sensitive** — must match `templates:` entry exactly:

   ```yaml
   templates:
     - name: Pair # This name...
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

### Build Error Reference

| Error                                         | Cause                   | Fix                                                    |
| --------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| `Template 'X' not found`                      | Name mismatch           | Check case-sensitive template name                     |
| `Cannot use operator '+' with BigInt`         | Using `+` on BigInt     | Use `.plus()` method                                   |
| `Type 'Bytes' is not assignable to 'Address'` | Passing Bytes to bind() | Use `Address.fromBytes()`                              |
| `Entity 'X' has no field 'Y'`                 | Schema mismatch         | Update schema, run codegen                             |
| `Cannot find name 'BigInt'`                   | Missing import          | Add `import { BigInt } from '@graphprotocol/graph-ts'` |
