<!-- Managed by ormi ai install. -->
# ORMI Agent Instructions

Use these rules when working in this repository.

## Purpose

This project uses `ormi` for subgraph development on ORMI.

## Preferred Workflow

When the task is about creating, updating, testing, deploying, querying, or monitoring subgraphs:

1. Prefer the bundled `subgraph-*` skills if they are available in the client.
2. Prefer `ormi` CLI commands over manual file creation.
3. Use MCP tools for discovery, inspection, and verification, not as a replacement for the CLI workflow.

## CLI-First Rules

Prefer this order:

1. `ormi init` to scaffold a new subgraph project
2. `ormi add` to add new contracts or data sources
3. `ormi codegen` after schema or ABI changes
4. `ormi build` to validate compilation
5. `ormi test` for local test validation
6. `ormi create` and `ormi deploy` for release flow
7. `ormi local` for local node workflows

Only edit `subgraph.yaml`, `schema.graphql`, mappings, or generated code directly after the CLI scaffold exists and only where the CLI output needs refinement.

## Skills

If the client supports installed skills, prefer these when relevant:

- `subgraph-plan`
- `subgraph-develop`
- `subgraph-build-test`
- `subgraph-deploy`
- `subgraph-query`
- `subgraph-monitor`
- `subgraph-manage`

## Behavior

- Keep workflows anchored to real `ormi` commands.
- Summarize what the CLI generated before making manual refinements.
- When debugging, rerun the relevant `ormi` command first and use its output to drive the fix.
- For destructive actions like cleanup or removal, explain the impact before executing them.
