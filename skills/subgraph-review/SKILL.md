---
name: subgraph-review
description: Review subgraph projects for correctness, performance, and best practices before deployment. Use when user says "review my subgraph", "audit my subgraph", "review subgraph code for issues", or "is my subgraph ready to deploy". Do NOT use for creating subgraphs (use subgraph-create) or deploying (use subgraph-deploy).
---

# Subgraph Review Skill

Review an existing subgraph project for correctness, performance issues, and adherence to best practices. Produces actionable findings with severity levels.

## When to Use

- Before deploying a subgraph to production
- After making significant changes to schema, manifest, or mappings
- When troubleshooting slow indexing or query performance
- When a build succeeds but runtime behavior is wrong or suboptimal
- User says "review my subgraph", "audit", "check for issues"

## When NOT to Use

- User wants to create a new subgraph → use `subgraph-create`
- User wants to deploy → use `subgraph-deploy`
- User wants to debug a deployed subgraph → use `subgraph-monitor`

## CLI-First Rule

- Read project files directly (manifest, schema, mappings, ABIs)
- Run `ormi-cli codegen` and `ormi-cli build` to verify compilation
- MCP tools are optional enrichment — never block on them

---

## Step 1: Load Project Files

Read the following files from the project directory:

1. `subgraph.yaml` — the manifest
2. `schema.graphql` — the GraphQL schema
3. All `src/*.ts` files — the mapping code
4. `package.json` — dependency versions
5. All `abis/*.json` files — contract ABIs

If any of these are missing, flag immediately as a critical issue.

---

## Step 2: Review Manifest (`subgraph.yaml`)

### 2a: Spec and API Versions

| Check | Severity | Rule |
|---|---|---|
| `specVersion` is `1.3.0` | Warning | Older versions miss features (timeseries, topic filters, declared eth_calls) |
| `apiVersion` is `0.0.9` | Warning | Should be latest stable |
| `mapping.language` is `wasm/assemblyscript` | Error | Required value |
| `mapping.kind` is `ethereum/events` | Error | Required value |

### 2b: Indexer Hints

| Check | Severity | Rule |
|---|---|---|
| `indexerHints.prune` exists | Warning | Missing prune = retaining all history = slower queries |
| `prune: auto` set (unless time-travel queries needed) | Recommendation | Best practice for query performance |

### 2c: Data Sources

| Check | Severity | Rule |
|---|---|---|
| `startBlock` is set and > 0 | Warning | Missing/zero startBlock indexes from genesis = extremely slow |
| `startBlock` matches contract deployment block | Recommendation | Verify on block explorer if possible |
| Each dataSource has a unique `name` | Error | Duplicate names cause build failure |
| `source.address` is valid hex with `0x` prefix | Error | Must be checksummed Ethereum address in quotes |
| `source.abi` matches an entry in `mapping.abis` | Error | ABI name mismatch causes build failure |
| ABI file path in `mapping.abis` exists on disk | Error | Missing ABI file causes build failure |
| `network` uses correct identifier | Error | Common mistake: `ethereum` instead of `mainnet` |
| Event signatures in `eventHandlers` match ABI | Error | Type mismatch or missing `indexed` keyword causes silent skip |
| Handler function names match exported functions in mapping file | Error | Mismatch causes build failure |

### 2d: Call Handlers (if present)

| Check | Severity | Rule |
|---|---|---|
| Target network supports Parity tracing | Error | Call handlers do NOT work on BSC, Arbitrum. Will not start syncing |
| Function signature matches ABI | Error | Must be normalized: `functionName(type,type)` with no spaces or param names |
| Function is not `view` or `pure` | Warning | View/pure functions are typically not called in transactions |

### 2e: Block Handlers (if present)

| Check | Severity | Rule |
|---|---|---|
| Unfiltered block handler (no `filter:`) | Warning | Runs on EVERY block — very high load. Should have filter unless intentional |
| `call` filter used on unsupported network | Error | Call filter requires Parity tracing — not on BSC, Arbitrum, Polygon, Optimism |
| Block handler source missing `abi` field | Error | Required even for block-only handlers (use dummy ABI) |
| Block handler source has unnecessary `address` | Recommendation | Block-only handlers typically omit `address` to index all blocks |

### 2f: Templates (if present)

| Check | Severity | Rule |
|---|---|---|
| Template `source` has `abi` but no `address` | Error | Templates must NOT have a pre-defined address |
| Template `name` matches usage in mapping code | Error | Case-sensitive match required for `Template.create()` |
| Template omits `address` in `source` but has `abi` | Error | Templates must NOT have a pre-defined address; `abi` is required |

### 2g: Declared eth_calls (specVersion >= 1.2.0)

| Check | Severity | Rule |
|---|---|---|
| Any `Contract.bind()` calls in handlers without declared counterpart | Recommendation | Declare eth_calls in manifest for parallel execution |
| Declared eth_call format: `Contract[address].function(params)` | Error | Must match this exact format |

---

## Step 3: Review Schema (`schema.graphql`)

### 3a: Entity Directives

| Check | Severity | Rule |
|---|---|---|
| Every entity has `@entity(immutable: true)` or `@entity(immutable: false)` | Error | ORMI requires explicit immutability. Bare `@entity` causes build error |
| Event-log entities (Transfer, Swap, etc.) are `immutable: true` | Warning | Historical records should be immutable for performance |
| State entities (Account, Pool, Token) are `immutable: false` | Error | If an entity's fields are updated by mappings, it must be mutable |
| Immutable entity is never `.load()`-ed and modified in mappings | Error | Immutable entities cannot be updated after creation |

### 3b: ID Types

| Check | Severity | Rule |
|---|---|---|
| Entity IDs use `Bytes!` | Recommendation | 28% faster queries, 48% faster indexing vs String |
| No entities use deprecated `ID!` type | Warning | `ID!` is a synonym for `String!` — use `Bytes!` instead |
| `String!` IDs only used for human-readable IDs | Recommendation | Acceptable for display names, token symbols |
| Timeseries entities use `id: Int8!` | Error | Required for `@entity(timeseries: true)` |

### 3c: Interface Types

| Check | Severity | Rule |
|---|---|---|
| Implementing types include all interface fields | Error | Missing interface field causes build failure |
| Types implementing an interface use `implements` keyword | Error | Must declare `type X implements InterfaceName` |
| Interface field types match between interface and implementation | Error | Type mismatch causes build failure |

### 3d: Enum Types

| Check | Severity | Rule |
|---|---|---|
| Enum values are valid GraphQL identifiers | Error | Must be valid identifiers (e.g. `Deposit`, `REPAY`, `withdraw`) |
| Entity fields referencing enum use the enum type (not String) | Warning | Using String for categorical data misses type safety |

### 3e: Relationships

| Check | Severity | Rule |
|---|---|---|
| One-to-many uses `@derivedFrom` (not stored array) | Warning | Stored arrays grow unbounded and slow indexing significantly |
| `@derivedFrom(field: "...")` references a real field | Error | The `field` value must exist on the related entity |
| Many-to-many uses mapping table pattern | Recommendation | More performant than storing arrays on both sides |
| No entity has a large array field without `@derivedFrom` | Warning | Arrays stored on entities cause quadratic write performance |

### 3f: Field Types

| Check | Severity | Rule |
|---|---|---|
| Ethereum addresses use `Bytes!` not `String!` | Recommendation | Bytes is more efficient for addresses |
| Large numbers use `BigInt!` not `Int!` | Error | `Int` is 32-bit. Ethereum uint256 values overflow `Int` |
| Monetary/price values use `BigDecimal!` | Recommendation | BigDecimal avoids precision loss for financial calculations |
| Required fields (with `!`) are always set in mappings | Error | Null value for required field causes runtime error |
| Timestamp field on timeseries entity is `Timestamp!` | Error | Required type for timeseries |

### 3g: Timeseries & Aggregation (if used)

| Check | Severity | Rule |
|---|---|---|
| Timeseries entity has `id: Int8!` and `timestamp: Timestamp!` | Error | Both are mandatory, auto-managed fields |
| `@aggregation` source references a timeseries entity | Error | Source must be the name of a `@entity(timeseries: true)` entity |
| `@aggregate(fn: "...", arg: "...")` uses valid function | Error | Must be: sum, count, min, max, first, last |
| `@aggregate` arg references valid field or expression | Error | Must reference field in source timeseries entity |
| Dimension fields are non-aggregated fields | Info | Non-aggregated fields become grouping dimensions |

---

## Step 4: Review Mappings (`src/*.ts`)

### 4a: BigInt Arithmetic (Most Common Error)

| Check | Severity | Rule |
|---|---|---|
| No `+`, `-`, `*`, `/` operators on BigInt | Error | AssemblyScript does not support operators on BigInt |
| Uses `.plus()`, `.minus()`, `.times()`, `.div()` | Required | Method calls are the only way |
| Integer constants use `BigInt.fromI32(n)` | Error | Cannot assign plain `i32` to BigInt field |

**Pattern to search for:**
```
// Search all .ts files for these anti-patterns:
count + 1, count - 1, amount * price, total / 100
balance = 0, count = 1
```

### 4b: Entity Lifecycle

| Check | Severity | Rule |
|---|---|---|
| Every entity mutation is followed by `.save()` | Error | Missing `.save()` means changes are silently lost |
| `Entity.load(id)` has null check before access | Error | Accessing fields on null entity causes runtime error |
| Null checks use `== null` not `!entity` | Error | AssemblyScript does not support `!` for null checking |
| New entity for mutable type checks `.load()` first | Warning | Creating without checking may overwrite existing data |
| Immutable entities are never `.load()`-ed for update | Error | Cannot modify immutable entity after creation block |

### 4c: Imports

| Check | Severity | Rule |
|---|---|---|
| Event types from `../generated/<ContractName>/<ContractName>` | Error | Not from schema |
| Schema entities from `../generated/schema` | Error | Not from contract directory |
| Templates from `../generated/templates` | Error | Not from schema or contract directory |
| `ethereum`, `BigInt`, `Bytes`, `Address` from `@graphprotocol/graph-ts` | Error | Core types |
| Call types from `../generated/<ContractName>/<ContractName>` | Error | Same path as events |

### 4d: Type Conversions

| Check | Severity | Rule |
|---|---|---|
| `Contract.bind()` uses `Address`, not `Bytes` | Error | Convert with `Address.fromBytes(event.address)` |
| `Template.create()` uses `Address`, not `Bytes` | Error | Template instantiation requires Address type |
| `BigDecimal` created with `.fromString()` not `.fromI32()` | Error | BigDecimal has no `fromI32` method |
| `.toHexString()` not used for Bytes IDs | Warning | Use Bytes directly, string conversion is slow |

### 4e: eth_calls

| Check | Severity | Rule |
|---|---|---|
| `Contract.bind()` calls exist | Warning | Each eth_call slows indexing. Can it be eliminated? |
| `try_` variant used for fallible eth_calls | Recommendation | `contract.try_method()` prevents indexing failure |
| Declared in manifest for parallel execution | Recommendation | specVersion >= 1.2.0 enables declared eth_calls |
| Return value null-checked with `reverted` | Error | `let result = contract.try_method(); if (result.reverted) { ... }` |

### 4f: Event Parameter Access

| Check | Severity | Rule |
|---|---|---|
| Parameter names match ABI exactly (case-sensitive) | Error | `event.params.from` not `event.params.From` |
| Indexed parameters accessed correctly | Error | Indexed params are logged as topics, accessed same way |
| Non-indexed params not assumed to be indexed | Warning | Only indexed params can be used in topic filters |

---

## Step 5: Review ABI Files

| Check | Severity | Rule |
|---|---|---|
| ABI files are valid JSON arrays | Error | Invalid JSON causes codegen failure |
| ABI contains events referenced in manifest | Error | Missing event in ABI causes codegen to skip it |
| ABI contains functions referenced in callHandlers | Error | Missing function in ABI causes codegen failure |
| No duplicate event/function signatures in ABI | Warning | Can cause ambiguous codegen |
| ABI file path matches `file:` in manifest | Error | Path mismatch causes build failure |

---

## Step 6: Run Build Verification

```bash
ormi-cli codegen && ormi-cli build
```

| Check | Severity | Rule |
|---|---|---|
| Codegen succeeds without errors | Error | Fix schema or ABI issues first |
| Build succeeds without errors | Error | Fix mapping code issues |
| No warnings during build | Recommendation | Warnings may indicate future issues |

---

## Step 7: Present Findings

Organize findings by severity:

### Severity Levels

| Level | Icon | Meaning | Action |
|---|---|---|---|
| Error | `[ERROR]` | Will cause build failure or runtime crash | Must fix before deployment |
| Warning | `[WARN]` | Will cause performance issues or subtle bugs | Strongly recommended to fix |
| Recommendation | `[REC]` | Improvement opportunity | Nice to have |
| Info | `[INFO]` | Informational note | No action needed |

### Output Format

Present findings as a table:

```
| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| 1 | [ERROR]  | schema.graphql | 5 | Entity `Transfer` missing immutability directive | Add `@entity(immutable: true)` |
| 2 | [WARN]   | src/mapping.ts | 23 | BigInt arithmetic uses `+` operator | Use `.plus()` method |
| 3 | [REC]    | schema.graphql | 8 | Entity ID uses `String!` | Use `Bytes!` for 28% faster queries |
```

After the table, provide:

1. **Summary**: X errors, Y warnings, Z recommendations
2. **Top priority fixes**: List the 3 most impactful changes
3. **Performance estimate**: If all recommendations are applied, expected improvement (e.g., "Switching to Bytes IDs + @derivedFrom typically improves indexing speed by 40-50%")

---

## Step 8: Quick-Fix Assistance

Offer to auto-fix common issues:

- Add missing `@entity(immutable: true/false)` directives
- Replace BigInt arithmetic operators with method calls
- Add missing `.save()` calls
- Add `indexerHints.prune: auto` to manifest
- Convert `String!` IDs to `Bytes!`
- Add `@derivedFrom` to array fields

> Only offer fixes for issues you can confidently fix without changing semantics.
> Always confirm with the user before making changes.

---

## Common Anti-Patterns Reference

### Schema Anti-Patterns

| Anti-Pattern | Why It's Bad | Fix |
|---|---|---|
| Mapping events 1:1 to entities | Creates redundant entity types for similar events | Model entities around data objects |
| Storing arrays on entities | Quadratic write cost, unbounded growth | Use `@derivedFrom` reverse lookups |
| Using `String!` for all IDs | 2x storage, slower comparisons | Use `Bytes!` |
| Missing immutability directive | Build error on ORMI, missed optimization | Always specify `(immutable: true/false)` |
| Using `ID!` type | Deprecated synonym for `String!` | Use `Bytes!` |
| Manual daily/hourly snapshot entities | Complex handler code, error-prone | Use `@entity(timeseries: true)` + `@aggregation` |

### Mapping Anti-Patterns

| Anti-Pattern | Why It's Bad | Fix |
|---|---|---|
| `count = count + 1` | Compile error (BigInt operators) | `count = count.plus(BigInt.fromI32(1))` |
| `if (!entity)` | Wrong in AssemblyScript | `if (entity == null)` |
| Missing `.save()` | Silent data loss | Always call `.save()` after mutations |
| `entity.count = 0` | Type mismatch | `entity.count = BigInt.fromI32(0)` |
| `Contract.bind(event.address)` | Type error (Bytes vs Address) | `Contract.bind(Address.fromBytes(event.address))` |
| String concatenation for IDs | Slow, uses String type | `hash.concatI32(logIndex.toI32())` |
| Unnecessary eth_calls | 10-100x slower indexing | Use event data directly |
| `BigDecimal.fromI32(0)` | Method doesn't exist | `BigDecimal.fromString("0")` |

### Manifest Anti-Patterns

| Anti-Pattern | Why It's Bad | Fix |
|---|---|---|
| `startBlock: 0` or missing | Indexes from genesis, extremely slow | Set to contract deployment block |
| Missing `indexerHints.prune` | Retains all history, slow queries | Add `prune: auto` |
| `network: ethereum` | Invalid network identifier | Use `mainnet` |
| Duplicate `dataSources[].name` | Build failure | Each data source needs unique name |
| Call handler on BSC/Arbitrum | Subgraph won't sync | Use event handlers instead |
| Unfiltered block handler | Runs every block, very high load | Add `polling` or `call` filter |

---

## MCP Tools Used (Optional, Non-Blocking)

- `get-subgraph-status` — check if a deployed version has indexing errors
- `get-subgraph-logs` — retrieve error logs from deployed subgraph
- `get-schema` — compare against reference subgraph schemas
- `search-project-subgraphs` — find related subgraphs for comparison
