---
name: subgraph-query
description: Query and explore indexed subgraph data through GraphQL. Use when user says "query my subgraph", "run a GraphQL query", "get schema", "explore subgraph data", or "what data is indexed".
---

# Subgraph Query Skill

This skill teaches you how to query and explore subgraph data using the Ormi subgraph MCP tools.

## CLI-First Rule

For querying, prefer the simplest Ormi-supported path available:

- Use MCP query tools for hosted subgraphs and schema-aware exploration
- Use direct GraphQL endpoint queries only when an endpoint is already known or the user explicitly wants raw GraphQL
- If the question is really about deployment health or project setup, hand off to `subgraph-monitor` or a CLI workflow instead of inventing a custom query workflow

## MCP Authentication

Querying hosted subgraphs requires MCP authentication — there is no CLI-only query command. Follow this sequence:

1. **Call MCP `whoami` tool** to check authentication (MCP tool only — do NOT run `ormi-cli whoami`)
2. **If authenticated** → proceed with query workflow
3. **If not authenticated** → tell the user:
   > MCP is not authenticated. Run `/mcp` to authenticate with `ormi`, then try again.
   > **STOP.** Do not continue with MCP query tools.
4. **If MCP is completely unavailable** but the user has a direct GraphQL endpoint URL, they can query without MCP:
   ```bash
   curl -X POST <ENDPOINT_URL> \
     -H "Content-Type: application/json" \
     -d '{"query": "{ _meta { block { number } } }"}'
   ```

## Overview

The ormi server provides tools for querying indexed blockchain data through GraphQL. This skill covers the workflow for discovering, understanding, and querying subgraphs effectively.

## Tools Used

- `search-project-subgraphs` - Discover subgraphs within your projects
- `get-schema` - Understand the data structure before querying
- `execute-query` - Run GraphQL queries against subgraphs
- `list-chains` - Discover supported blockchain networks
- `list-projects` - Get project IDs for subgraph discovery

## Workflow

### Step 1: Discover Available Subgraphs

Before querying, you need to find available subgraphs:

```
1. Call list-projects to get your project IDs
2. If multiple projects exist, ask which project to use
3. If only one project, use it automatically
4. Call search-project-subgraphs with the project_id
```

**Example:**

```json
// First, get projects
{ "tool": "list-projects" }

// Then search for subgraphs
{
  "tool": "search-project-subgraphs",
  "parameters": {
    "project_id": "your-project-id",
    "status": "live"
  }
}
```

### Step 2: Always Get Schema First

**CRITICAL:** Always call `get-schema` before writing queries. This ensures you understand:

- Available entity types
- Field names and types
- Relationships between entities
- Required vs optional fields

**Example:**

```json
{
  "tool": "get-schema",
  "parameters": {
    "id": "project-id",
    "name": "subgraph-name",
    "tag": "v1.0.0"
  }
}
```

### Step 3: Construct GraphQL Queries

Based on the schema, construct your queries:

**Basic Entity Query:**

```graphql
query GetEntities($first: Int!) {
  entities(first: $first) {
    id
    field1
    field2
  }
}
```

**Filtered Query:**

```graphql
query GetFilteredEntities($where: Entity_filter!) {
  entities(where: $where) {
    id
    field1
  }
}
```

**Pagination:**

```graphql
query GetEntitiesWithPagination($first: Int!, $skip: Int!) {
  entities(first: $first, skip: $skip) {
    id
  }
}
```

**Nested Relationships:**

```graphql
query GetEntitiesWithRelations($first: Int!) {
  entities(first: $first) {
    id
    relatedEntity {
      id
      name
    }
  }
}
```

### Step 4: Execute Queries

Use `execute-query` to run your GraphQL queries:

```json
{
  "tool": "execute-query",
  "parameters": {
    "id": "project-id",
    "name": "subgraph-name",
    "tag": "v1.0.0",
    "query": "query GetPools($first: Int!) { pools(first: $first) { id token0 { symbol } token1 { symbol } } }",
    "variables": { "first": 5 }
  }
}
```

## Addressing Subgraphs

Two methods to address subgraphs:

### Method 1: Direct URL

```json
{
  "tool": "execute-query",
  "parameters": {
    "url": "https://api.example.com/subgraphs/name/protocol",
    "query": "{ ... }"
  }
}
```

### Method 2: ID, Name, Tag

```json
{
  "tool": "execute-query",
  "parameters": {
    "id": "project-id",
    "name": "subgraph-name",
    "tag": "v1.0.0",
    "query": "{ ... }"
  }
}
```

**Note:** URL takes precedence if both are provided.

## Private Subgraphs

For private subgraphs, set `is_private: true`:

```json
{
  "tool": "execute-query",
  "parameters": {
    "id": "project-id",
    "name": "private-subgraph",
    "tag": "v1.0.0",
    "is_private": true,
    "query": "{ ... }"
  }
}
```

## Common Query Patterns

### Time-Range Queries

```graphql
query GetEntitiesByTime($startTime: Int!, $endTime: Int!) {
  entities(
    where: { timestamp_gte: $startTime, timestamp_lte: $endTime }
    orderBy: timestamp
    orderDirection: desc
  ) {
    id
    timestamp
  }
}
```

### Ordering Results

```graphql
query GetTopEntities($first: Int!) {
  entities(first: $first, orderBy: value, orderDirection: desc) {
    id
    value
  }
}
```

### Complex Filters

```graphql
query GetFiltered($where: Entity_filter!) {
  entities(where: $where) {
    id
  }
}

// Variables:
{
  "where": {
    "and": [
      { "value_gte": 100 },
      { "status": "active" }
    ]
  }
}
```

## Examples

### Example 1: Explore token transfer data

- **User says:** "Show me recent transfers from my subgraph"
- **Actions:**
  1. Call `list-projects` to find the project
  2. Call `search-project-subgraphs` with the project ID
  3. Call `get-schema` to discover the Transfer entity
  4. Execute query: `{ transfers(first: 10, orderBy: timestamp, orderDirection: desc) { id from { id } to { id } value } }`
- **Result:** Returns the 10 most recent transfers with sender, receiver, and amount

### Example 2: Query aggregated daily volumes

- **User says:** "What's the daily trading volume?"
- **Actions:**
  1. Get schema to find DailyVolume or similar aggregation entity
  2. Execute query with time filter: `{ dailyVolumes(first: 7, orderBy: date, orderDirection: desc) { id date totalVolume } }`
- **Result:** Returns last 7 days of aggregated volume data

### Example 3: Direct endpoint query (no MCP)

- **User says:** "Query this endpoint: https://api.ormilabs.com/subgraphs/name/my-subgraph"
- **Actions:**
  1. Use `execute-query` with the URL parameter
  2. Or suggest `curl -X POST <URL> -H "Content-Type: application/json" -d '{"query": "..."}'`
- **Result:** Query results from the specified endpoint

## Best Practices

1. **Always get schema first** - Understand the data structure before querying
2. **Use variables** - Parameterize queries for better performance and reusability
3. **Limit results** - Use `first` parameter to avoid overwhelming responses
4. **Handle errors** - Check for `errors` field in responses
5. **Request only needed fields** - Optimize performance by selecting specific fields
6. **Use pagination** - For large datasets, use `first` and `skip` together

## Supported Chains

Use `list-chains` to discover all supported blockchain networks:

```json
{
  "tool": "list-chains"
}
```

This returns chain groups organized by ecosystem (Ethereum, Polygon, etc.) with chain IDs and network types.
