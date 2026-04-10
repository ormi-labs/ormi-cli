# ormi-cli

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/ormi-cli.svg)](https://npmjs.org/package/ormi-cli)
[![Downloads/week](https://img.shields.io/npm/dw/ormi-cli.svg)](https://npmjs.org/package/ormi-cli)

The ORMI CLI is a command-line interface for developing, deploying, and managing subgraphs on the ORMI network. You can use it directly from the terminal, or install its AI integration so supported coding agents can drive the same workflows through Ormi MCP and bundled subgraph skills.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [AI Integration](#ai-integration)
- [Workflows](#workflows)
  - [1. Create a Subgraph](#1-create-a-subgraph)
  - [2. Deploy a Subgraph](#2-deploy-a-subgraph)
  - [3. Query Subgraph Data](#3-query-subgraph-data)
  - [4. Monitor & Manage](#4-monitor--manage)
- [Additional Resources](#additional-resources)

## Installation

### Standard Installation

```bash
npm install -g ormi-cli
```

### Install from Source

If you want to install from source:

```bash
# Clone the repository
git clone https://github.com/ormilabs/ormi-cli.git
cd ormi-cli

# Install dependencies
corepack enable
yarn install

# Build the project
yarn build

# Link globally for local development
npm install -g .
```

After linking, `ormi-cli` will be available globally on your system.

### AI Agent Setup

For AI-assisted development, `ormi-cli` can:

- configure the `ormi` server in supported agents
- install bundled subgraph skills into the agent's skills directory

Typical setup:

```bash
# Install and configure AI integration
ormi-cli ai install

# Verify MCP + skills setup
ormi-cli ai doctor
```

This is optional. The core subgraph workflows below work the same with or without an AI agent.

## Quick Start

### AI-Assisted Quick Start

```bash
# Install AI integration for your coding agent
ormi-cli ai install

# Verify the MCP server and bundled skills are installed
ormi-cli ai doctor
```

Then work inside your project with prompts like:

1. "Initialize a new ORMI subgraph project for this contract: `0x...`"
2. "Explain the generated schema, mappings, and manifest before building"
3. "Run codegen and build, then fix any issues"
4. "Prepare this subgraph for deploy and tell me anything still missing"

**Next Steps:** See [AI Integration](#ai-integration) and [Workflow 1](#1-creating-a-new-subgraph-from-scratch).

## AI Integration

`ormi-cli ai install` is not a separate product surface. It wires AI agents into the same subgraph workflows already exposed by the CLI.

What it installs:

- MCP configuration for `ormi` in agents that support MCP
- bundled Ormi skills for subgraph planning, development, build/test, deploy, query, monitor, and management

What that means in practice:

- you still build with `ormi-cli build`, deploy with `ormi-cli deploy`, add sources with `ormi-cli add`, and so on
- the agent gets Ormi-specific context and tools so it can guide or execute those workflows more reliably

How agents discover this integration:

- agents with skills support discover the bundled `subgraph-*` skills from their skills directory after `ormi-cli ai install`
- agents with MCP support see the `ormi` server after `ormi-cli ai install`
- agents that rely on project instruction files get installer-managed files like `AGENTS.md` or `CLAUDE.md` written into the current project when relevant

No separate plugin is required for the supported clients below. The integration point is skills, MCP, or both.

### Agent Support

| Agent | Skills | MCP | Config format | Notes |
|---|---|---|---|---|
| Claude Code | Yes | Yes | `{ "type": "http", "url": "..." }` | Best-supported path for full skill + MCP workflow |
| Cursor | Yes | Yes | `{ "url": "..." }` | No `type` field in MCP entry |
| Gemini CLI | Yes | Yes | `{ "httpUrl": "..." }` | Uses `httpUrl` (not `url`) |
| Codex | Yes | Yes | TOML: `[mcp_servers.ormi]` | TOML config at `~/.codex/config.toml` |
| OpenCode | Yes | Yes | `{ "type": "remote", "url": "...", "enabled": true }` | JSONC config, multiple candidate paths |

### Project Instruction Files

For agents that rely on project instruction files, `ormi-cli ai install` writes managed files into the current project, for example:

- `CLAUDE.md` for Claude Code
- `AGENTS.md` for Codex and OpenCode
- `GEMINI.md` for Gemini CLI

These files reinforce the same rule as the bundled skills: use `ormi-cli` commands first, then refine generated files only where needed.

Useful commands:

```bash
# Interactive install for detected agents
ormi-cli ai install

# Install for specific agents
ormi-cli ai install --agent claude-code,cursor

# Check MCP URL, config files, and bundled skills
ormi-cli ai doctor

# Remove Ormi MCP + skills from an agent
ormi-cli ai uninstall
```

Notes:

- by default, install uses project-local config where the agent supports it
- use `--global` to install into the agent's global config and skills directory
- use `--mcp-only` or `--skills-only` if you only want one part of the integration
- after install, restart the coding agent so it reloads MCP config and skills

## Workflows

The bundled skills provide detailed guidance for each workflow. Use these prompts to get started:

### 1. Create a Subgraph

Use the `subgraph-create` skill to scaffold a new subgraph from a contract address.

```
Create a subgraph for contract 0x... on mainnet
```

- Scaffolds project with `ormi-cli init`
- Analyzes ABI and detects contract patterns (ERC-20, AMM, etc.)
- Refines schema and mappings
- Builds and verifies the project

### 2. Deploy a Subgraph

Use the `subgraph-deploy` skill to build and deploy to ORMI.

```
Deploy this subgraph
```

- Authenticates via MCP (or accepts deploy key)
- Runs codegen and build
- Deploys with version label
- Verifies indexing has started

### 3. Query Subgraph Data

Use the `subgraph-query` skill to explore indexed data.

```
Query the transfers entity, show the last 10
```

- Discovers available subgraphs via MCP
- Gets schema to understand entity structure
- Executes GraphQL queries with filters and pagination

### 4. Monitor & Manage

Use `subgraph-monitor` and `subgraph-manage` skills for health checks and project management.

```
Check my subgraph's sync status and recent errors
```

- Checks sync progress and block heights
- Reviews API stats and latency
- Inspects logs for errors
- Manages projects and API tokens

---

**Quick Reference:**

| Task | Skill | CLI Commands |
|------|-------|--------------|
| Scaffold project | `subgraph-create` | `ormi-cli init`, `ormi-cli add` |
| Build locally | `subgraph-create` | `ormi-cli codegen`, `ormi-cli build`, `ormi-cli test` |
| Deploy | `subgraph-deploy` | `ormi-cli deploy` |
| Query data | `subgraph-query` | (MCP tools) |
| Monitor health | `subgraph-monitor` | (MCP tools) |
| Manage projects | `subgraph-manage` | `ormi-cli create`, `ormi-cli remove` |

---

## Additional Resources

- **Full Command Reference**: See [USAGE.md](USAGE.md) for complete command documentation
- **ORMI Documentation**: Visit [docs.ormilabs.com](https://docs.ormilabs.com) for detailed guides
- **Community**: Join our Discord for support and discussions
- **AI Integration**: Run `ormi-cli ai doctor` to verify MCP configuration and bundled skills

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see LICENSE file for details
