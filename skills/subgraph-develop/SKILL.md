---
name: subgraph-develop
description: Scaffold a subgraph project, write schema.graphql, and write AssemblyScript mapping handlers
---

# Subgraph Develop Skill

Scaffold a subgraph project and write the code: manifest, schema, and AssemblyScript mappings.

## When to Use

User has an approved plan (from `subgraph-plan`) and wants to create the subgraph code.

## Step 1: Scaffold the Project

**From a contract address** (fetches ABI automatically):
```bash
ormi init --from-contract <address> --network <network> --abi ./abis/Contract.json
```

**From an example** (for learning):
```bash
ormi init --from-example
```

Project structure created:
```
subgraph.yaml        # manifest
schema.graphql       # entity definitions
src/
  mappings.ts        # AssemblyScript event handlers
abis/
  Contract.json      # contract ABI
```

## Step 2: Write schema.graphql

Follow the entity plan. Key directives:

```graphql
type Account @entity {
  id: Bytes!
  balance: BigInt!
  transfers: [Transfer!]! @derivedFrom(field: "from")
}

type Transfer @entity(immutable: true) {
  id: Bytes!
  from: Account!
  to: Account!
  amount: BigInt!
  timestamp: BigInt!
  blockNumber: BigInt!
  txHash: Bytes!
}
```

After writing the schema, run codegen to generate types:
```bash
ormi codegen
```
Fix any codegen errors before writing mappings.

## Step 3: Update subgraph.yaml

Key fields:
```yaml
specVersion: 1.0.0
schema:
  file: ./schema.graphql
dataSources:
  - kind: ethereum
    name: Contract
    network: mainnet
    source:
      address: "0x..."
      abi: Contract
      startBlock: 12345678   # use deployment block — check Etherscan
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      entities: [Account, Transfer]
      abis:
        - name: Contract
          file: ./abis/Contract.json
      eventHandlers:
        - event: Transfer(indexed address,indexed address,uint256)
          handler: handleTransfer
      file: ./src/mappings.ts
```

**startBlock**: Always use the contract deployment block, not block 0. Reduces sync time dramatically.

## Step 4: Write AssemblyScript Mappings

Handler signature:
```typescript
import { Transfer as TransferEvent } from '../generated/Contract/Contract'
import { Account, Transfer } from '../generated/schema'

export function handleTransfer(event: TransferEvent): void {
  // Load or create the sender Account
  let from = Account.load(event.params.from)
  if (!from) {
    from = new Account(event.params.from)
    from.balance = BigInt.fromI32(0)
  }
  from.balance = from.balance.minus(event.params.value)
  from.save()

  // Load or create the receiver Account
  let to = Account.load(event.params.to)
  if (!to) {
    to = new Account(event.params.to)
    to.balance = BigInt.fromI32(0)
  }
  to.balance = to.balance.plus(event.params.value)
  to.save()

  // Create immutable Transfer record
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
- Access event data: `event.params.field`, `event.block.timestamp`, `event.transaction.hash`
- Null checks: `if (entity == null)` (not `!entity` in AS)
- Byte concatenation: `address.concat(Bytes.fromI32(index))`

**Common pitfalls:**
- Forgetting to call `.save()` — entity changes are lost
- Using `i32` where `BigInt` is needed (overflow on large token amounts)
- Accessing `event.params` field names must match ABI exactly (case-sensitive)

## Step 5: Add More Data Sources

Add a second contract:
```bash
ormi add <address> --abi ./abis/OtherContract.json
```

For factory patterns (e.g. Uniswap pairs), use **templates** in `subgraph.yaml`:
```yaml
templates:
  - kind: ethereum
    name: Pair
    source:
      abi: Pair
    mapping:
      ...
```

Instantiate from a factory event handler:
```typescript
import { PairTemplate } from '../generated/templates'
PairTemplate.create(event.params.pair)
```

## Step 6: Verify Before Building

```bash
ormi codegen   # regenerate if schema or ABI changed
```

Check that all imports in mappings resolve to generated types. Fix any TypeScript/AS errors before building.

Proceed to `subgraph-build-test` once code compiles cleanly.
