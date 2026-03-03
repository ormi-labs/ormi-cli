---
name: subgraph-monitor
description: Monitor and debug subgraph deployments
---

# Subgraph Monitor Skill

This skill teaches you how to monitor, diagnose, and debug subgraph deployments using the Ormi subgraph MCP tools.

## Overview

Monitoring subgraphs is critical for ensuring data quality and identifying indexing issues. This skill covers health checks, performance monitoring, and debugging workflows.

## Tools Used

- `search-project-subgraphs` - Primary discovery tool with full operational details
- `get-api-stats` - Monitor API performance (requests, latency, response sizes)
- `get-block-stats` - Track indexing progress and entity growth
- `get-entity-stats` - Understand data models and record counts
- `get-subgraph-logs` - Debug indexing issues with filtered log access
- `get-subgraph-status` - Check pause/resume capability

## Workflow

### Step 1: Discover and Assess Health

Use `search-project-subgraphs` as your primary discovery tool. It provides comprehensive deployment information:

```json
{
  "tool": "search-project-subgraphs",
  "parameters": {
    "project_id": "your-project-id",
    "status": "live"
  }
}
```

**Key health indicators returned:**
- Sync status (syncing, live, error, warning)
- Block heights (start, latest, earliest, chain head)
- Entity counts
- Pause state
- Failure messages (if any)
- `authorized_open` field (public vs private)

### Step 2: Monitor API Performance

Use `get-api-stats` to track request patterns and latency:

```json
{
  "tool": "get-api-stats",
  "parameters": {
    "subgraph_name": "your-subgraph",
    "version": "1.0.0",
    "interval": "daily"
  }
}
```

**Available intervals:**
- `hourly` - Recent hourly breakdown
- `six_hourly` - 6-hour aggregates
- `daily` - Daily aggregates

**Metrics returned:**
- Request counts over time
- Average latency
- Response data sizes

### Step 3: Track Indexing Progress

Use `get-block-stats` to monitor indexing health:

```json
{
  "tool": "get-block-stats",
  "parameters": {
    "subgraph_name": "your-subgraph",
    "deploy_version": "abc123",
    "interval": "hourly"
  }
}
```

**Metrics returned:**
- Block head count progression
- Entity count growth
- Indexing speed

**Diagnostic indicators:**
- Stalled block progression = indexing stuck
- Rapid entity growth = heavy write load
- Slow indexing speed = performance bottleneck

### Step 4: Understand Data Models

Use `get-entity-stats` to inspect the data structure:

```json
{
  "tool": "get-entity-stats",
  "parameters": {
    "deployment_id": "deployment-uuid"
  }
}
```

**Returns:**
- List of indexed entities
- Record count per entity
- Column count per entity

### Step 5: Debug with Logs

Use `get-subgraph-logs` to investigate issues:

```json
{
  "tool": "get-subgraph-logs",
  "parameters": {
    "subgraph_id": "deployment-uuid",
    "log_level": "error",
    "search_keyword": "handler"
  }
}
```

**Filter options:**
- `log_level`: debug, info, warn, error
- `start_time`: Nanosecond timestamp
- `end_time`: Nanosecond timestamp
- `search_keyword`: Text search within messages

**Note:** Timestamps are in nanoseconds (multiply milliseconds by 1,000,000)

### Step 6: Check Pause/Resume Capability

Use `get-subgraph-status` to verify if pause/resume is available:

```json
{
  "tool": "get-subgraph-status",
  "parameters": {
    "project_external_id": "project-id",
    "name": "subgraph-name",
    "version": "1.0.0"
  }
}
```

## Diagnostic Workflow

When a subgraph has issues, follow this diagnostic sequence:

### 1. Check Health Status
```
search-project-subgraphs → Check sync status and failure messages
```

### 2. Review API Stats
```
get-api-stats → Identify traffic spikes or latency issues
```

### 3. Inspect Block Stats
```
get-block-stats → Check if indexing is progressing
```

### 4. Examine Logs
```
get-subgraph-logs → Filter by error level, search for specific errors
```

### 5. Identify Root Cause
```
Correlate findings from all sources to diagnose the issue
```

## Common Issues and Solutions

### Subgraph Not Syncing
1. Check `search-project-subgraphs` for failure messages
2. Review `get-block-stats` for stalled progression
3. Check `get-subgraph-logs` for error-level logs
4. Look for handler failures or data parsing errors

### High Latency
1. Check `get-api-stats` for request patterns
2. Identify if latency correlates with traffic spikes
3. Consider query optimization or caching

### Missing Data
1. Verify entity counts with `get-entity-stats`
2. Check block stats for indexing gaps
3. Review logs for skipped blocks or handler errors

### Public vs Private Access

The `authorized_open` field in `search-project-subgraphs` indicates:
- `true`: Public subgraph, accessible to all
- `false`: Private subgraph, requires authentication

## Best Practices

1. **Regular monitoring** - Set up periodic health checks
2. **Log analysis** - Review error logs proactively, not just when issues occur
3. **Baseline metrics** - Establish normal patterns for API and block stats
4. **Alert on anomalies** - Watch for sudden changes in latency or sync status
5. **Document findings** - Keep records of issues and resolutions

## Response Handling

Normal tool responses include `structuredContent` with:
- `response`: The data from the subgraph service
- `url`: The resolved endpoint URL

GraphQL errors appear in the `response` field. Other errors may appear in `content` as text descriptions.
