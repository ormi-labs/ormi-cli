---
name: subgraph-build-test
description: Build, test, and debug subgraphs locally before deployment
---

# Subgraph Build & Test Skill

Compile and verify subgraph code before deploying to ORMI.

## When to Use

User has written subgraph code and wants to verify it compiles and behaves correctly.

## Step 1: Codegen (always first)

Run after any schema or ABI change:
```bash
ormi codegen
```

This generates `generated/schema.ts` (entity classes) and `generated/Contract/Contract.ts` (event types). If this fails, fix the errors before attempting to build.

**Common codegen errors:**
- Invalid GraphQL in `schema.graphql` — check `@entity`, `@derivedFrom` syntax
- ABI file not found — check path in `subgraph.yaml`
- Missing ABI entry — ensure the ABI includes all events referenced in the manifest

## Step 2: Build

```bash
ormi build
```

Compiles AssemblyScript to WASM. Reports type errors and missing imports.

**Common build errors and fixes:**

| Error | Fix |
|---|---|
| `Type 'i32' is not assignable to type 'BigInt'` | Use `BigInt.fromI32(n)` instead of plain integers |
| `Cannot find name 'X'` | Add import from `../generated/Contract/Contract` or `../generated/schema` |
| `Object is possibly null` | Add null check: `if (entity == null) { entity = new Entity(id) }` |
| `Property 'X' does not exist on type 'Y'` | Run `ormi codegen` after schema changes |
| `Left side of operator '=' is not a store access` | Don't use destructuring; access fields directly |

If the build fails repeatedly, check `subgraph.yaml` — mismatched entity names or event signatures are common root causes.

## Step 3: Test with Matchstick

Write tests in `tests/*.test.ts`:

```typescript
import { describe, test, beforeEach, assert, createMockedFunction, newMockEvent } from 'matchstick-as'
import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
import { handleTransfer } from '../src/mappings'
import { Transfer as TransferEvent } from '../generated/Contract/Contract'

function createTransferEvent(from: Address, to: Address, value: BigInt): TransferEvent {
  const event = changetype<TransferEvent>(newMockEvent())
  event.parameters = [
    new ethereum.EventParam('from', ethereum.Value.fromAddress(from)),
    new ethereum.EventParam('to', ethereum.Value.fromAddress(to)),
    new ethereum.EventParam('value', ethereum.Value.fromUnsignedBigInt(value)),
  ]
  return event
}

describe('Transfer handler', () => {
  test('creates Transfer entity', () => {
    const from = Address.fromString('0x0000000000000000000000000000000000000001')
    const to = Address.fromString('0x0000000000000000000000000000000000000002')
    const value = BigInt.fromI32(1000)

    handleTransfer(createTransferEvent(from, to, value))

    assert.entityCount('Transfer', 1)
    assert.fieldEquals('Account', to.toHexString(), 'balance', '1000')
  })
})
```

Run tests:
```bash
ormi test
```

**Testing patterns:**
- `assert.entityCount('EntityName', n)` — verify correct number of entities created
- `assert.fieldEquals('EntityName', 'id', 'field', 'expected')` — check field values
- `newMockEvent()` — creates a mock event; set `event.parameters` manually
- `createMockedFunction(address, 'fn', 'fn()(type)')` — mock contract calls

## Step 4: Local Node (Optional)

For full integration testing:
```bash
ormi local start       # start local graph-node via Docker
ormi create my-subgraph --node http://localhost:8020
ormi deploy my-subgraph --node http://localhost:8020 --ipfs http://localhost:5001
```

Query locally at `http://localhost:8000/subgraphs/name/my-subgraph`.

Stop when done:
```bash
ormi local stop
```

## Step 5: Debug Indexing Issues

If the local deployment indexes but produces wrong data:

1. Add `log.info('value: {}', [entity.field.toString()])` calls to handlers
2. Check logs in the graph-node output
3. Verify event parameter names match ABI exactly
4. Confirm `startBlock` is at or before the first relevant event

Once build passes and tests are green, proceed to `subgraph-deploy`.
