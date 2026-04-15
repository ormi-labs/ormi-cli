---
name: subgraph-create-analytics
description: Timeseries, aggregation, and manual snapshot patterns for analytics. Use when building dashboards, tracking daily volumes, computing hourly OHLC candles, or maintaining running totals. Covers daily volumes, hourly OHLC, and running totals.
---

# Subgraph Create: Analytics & Timeseries

Build analytics into your subgraph — daily volumes, hourly price snapshots, running totals, and OHLC tracking. Two approaches:

| Approach                     | When to Use                                                           | Requirements           |
| ---------------------------- | --------------------------------------------------------------------- | ---------------------- |
| **Manual Snapshots**         | Production DeFi subgraphs, compatibility with all graph-node versions | Any graph-node version |
| **Timeseries + Aggregation** | New projects on graph-node >= 0.35.x, simpler analytics               | `specVersion: 1.1.0+`  |

> **Recommendation:** Most production DeFi subgraphs (Uniswap V3, Aave V3, etc.) use manual snapshots. Prefer manual snapshots when you need OHLC tracking, per-entity snapshots, or compatibility with older deployments.

> **Prerequisite:** Complete Steps 1–5 of the `subgraph-create` skill (determine use case, gather inputs, scaffold, fetch ABI, analyze and design) before proceeding.

---

## Step 6: Add Data Source

### 6a: Manifest

Analytics subgraphs use the same event-driven manifest structure as simple event indexing. The manifest triggers on events that feed your analytics (Swaps, Transfers, etc.).

Refer to the `subgraph-create-events` skill for the standard manifest structure. Analytics logic lives entirely in the schema and mappings.

### 6b: Schema — Timeseries + Aggregation

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

| Function | Description               |
| -------- | ------------------------- |
| `sum`    | Total of all values       |
| `count`  | Number of values          |
| `min`    | Minimum value             |
| `max`    | Maximum value             |
| `first`  | First value in the period |
| `last`   | Last value in the period  |

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
    where: {
      token: "0x1234..."
      timestamp_gte: "1704164640000000"
      timestamp_lt: "1704251040000000"
    }
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

### 6c: Schema — Manual Day/Hour Snapshots (recommended for most analytics)

Define mutable snapshot entities:

```graphql
# Global daily aggregate (e.g., protocol-wide volume)
type ProtocolDayData @entity(immutable: false) {
  id: ID! # dayID as string (e.g., "19637")
  date: Int! # dayStartTimestamp
  dailyVolumeETH: BigDecimal!
  dailyVolumeUSD: BigDecimal!
  totalVolumeETH: BigDecimal!
  totalVolumeUSD: BigDecimal!
  txCount: Int!
}

# Per-entity daily snapshot (e.g., per-pool, per-token)
type PoolDayData @entity(immutable: false) {
  id: ID! # "<poolAddress>-<dayID>" (e.g., "0xabc...-19637")
  date: Int! # dayStartTimestamp
  pool: Pool!
  open: BigDecimal! # OHLC price tracking
  high: BigDecimal!
  low: BigDecimal!
  close: BigDecimal!
  volumeToken0: BigDecimal!
  volumeToken1: BigDecimal!
  txCount: Int!
}

# Per-entity hourly snapshot
type TokenHourData @entity(immutable: false) {
  id: ID! # "<tokenAddress>-<hourID>"
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

| Snapshot Scope      | ID Pattern                                                    | Example             |
| ------------------- | ------------------------------------------------------------- | ------------------- |
| Protocol-wide daily | `dayID.toString()`                                            | `"19637"`           |
| Per-entity daily    | `address.toHexString().concat('-').concat(dayID.toString())`  | `"0xabc...-19637"`  |
| Per-entity hourly   | `address.toHexString().concat('-').concat(hourID.toString())` | `"0xabc...-471288"` |

### 6d: Mapping — Full Snapshot Handler

> **Prerequisite:** This example assumes a mutable `Pool` entity (with `token0Price` field) is already being maintained by other handlers. The snapshot handler reads current state from it.

```typescript
import { Swap as SwapEvent } from '../generated/<DataSourceName>/<ContractName>'
import { PoolDayData, Pool } from '../generated/schema'
import { BigDecimal } from '@graphprotocol/graph-ts'

export function handleSwap(event: SwapEvent): void {
  // --- Day/Hour window calculation ---
  const timestamp = event.block.timestamp.toI32()
  const dayID = timestamp / 86400 // seconds per day
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
    poolDayData.volumeToken0 = BigDecimal.fromString('0')
    poolDayData.volumeToken1 = BigDecimal.fromString('0')
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
    event.params.amount0.toBigDecimal(),
  )
  poolDayData.volumeToken1 = poolDayData.volumeToken1.plus(
    event.params.amount1.toBigDecimal(),
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

---

## Common Patterns

### Track Running Totals (minimal pattern)

```typescript
// Simple protocol-wide daily total
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

### Helper Library Structure

For analytics-heavy subgraphs, organize snapshot logic in dedicated helper files:

```
src/
├── common/
│   ├── constants.ts     # SECONDS_PER_DAY, SECONDS_PER_HOUR, ZERO_BD
│   └── utils.ts         # dayID(), hourID() helpers
├── handlers/
│   └── snapshots.ts     # updatePoolDayData(), updateTokenHourData()
└── helpers/
    └── pricing.ts       # Price calculation logic
```

Each handler file calls snapshot helpers from `handlers/snapshots.ts`:

```typescript
// src/handlers/snapshots.ts
import { PoolDayData, Pool } from '../../generated/schema'
import { BigDecimal } from '@graphprotocol/graph-ts'

export function updatePoolDayData(event: ethereum.Event): PoolDayData {
  const timestamp = event.block.timestamp.toI32()
  const dayID = timestamp / 86400
  const dayPoolID = event.address
    .toHexString()
    .concat('-')
    .concat(dayID.toString())

  let snapshot = PoolDayData.load(dayPoolID)
  if (snapshot == null) {
    snapshot = new PoolDayData(dayPoolID)
    snapshot.date = dayID * 86400
    snapshot.pool = event.address.toHexString()
    snapshot.txCount = 0
    snapshot.volumeToken0 = BigDecimal.fromString('0')
    snapshot.volumeToken1 = BigDecimal.fromString('0')
    snapshot.open = BigDecimal.fromString('0')
    snapshot.high = BigDecimal.fromString('0')
    snapshot.low = BigDecimal.fromString('0')
    snapshot.close = BigDecimal.fromString('0')
  }
  return snapshot
}
```

---

## Guardrails

### Entity Immutability

Every entity MUST have `@entity(immutable: true)` or `@entity(immutable: false)`.

- **Immutable entities** (`immutable: true`): Event data. Use `id: Bytes!`.
- **Mutable entities** (`immutable: false`): Snapshots, running totals. Use `id: ID!` with string IDs.
- **Timeseries entities** (`timeseries: true`): Analytics. Use `id: Int8!` and `timestamp: Timestamp!`.

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

### BigInt Arithmetic

Operators `+`, `-`, `*`, `/` do NOT work on BigInt. Use methods instead:

```typescript
let sum = a.plus(b)
let diff = a.minus(b)
let product = a.times(b)
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

### Common AssemblyScript Pitfalls

| Pitfall              | Wrong                        | Correct                               |
| -------------------- | ---------------------------- | ------------------------------------- |
| Null check           | `if (!entity)`               | `if (entity == null)`                 |
| Int to BigInt        | `let x: BigInt = 0`          | `let x = BigInt.fromI32(0)`           |
| String to BigDecimal | `BigDecimal.fromI32(1)`      | `BigDecimal.fromString("1")`          |
| Missing `.save()`    | Entity created but not saved | Always call `entity.save()`           |
| Missing imports      | Use type without import      | Import from `@graphprotocol/graph-ts` |

### Build Error Reference

| Error                                         | Cause                   | Fix                                                    |
| --------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| `Cannot use operator '+' with BigInt`         | Using `+` on BigInt     | Use `.plus()` method                                   |
| `Type 'Bytes' is not assignable to 'Address'` | Passing Bytes to bind() | Use `Address.fromBytes()`                              |
| `Entity 'X' has no field 'Y'`                 | Schema mismatch         | Update schema, run codegen                             |
| `Cannot find name 'BigInt'`                   | Missing import          | Add `import { BigInt } from '@graphprotocol/graph-ts'` |
