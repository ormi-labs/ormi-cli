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
  - [1. Creating a New Subgraph from Scratch](#1-creating-a-new-subgraph-from-scratch)
  - [2. Adding Data Sources to an Existing Subgraph](#2-adding-data-sources-to-an-existing-subgraph)
  - [3. Building and Testing Locally](#3-building-and-testing-locally)
  - [4. Deploying to Production](#4-deploying-to-production)
  - [5. Updating an Existing Subgraph](#5-updating-an-existing-subgraph)
  - [6. Monitoring Deployment Status](#6-monitoring-deployment-status)
  - [7. Debugging Failed Deployments](#7-debugging-failed-deployments)
  - [8. Removing/Cleaning Up Deployments](#8-removingcleaning-up-deployments)
- [Additional Resources](#additional-resources)

## Installation

### Standard Installation

```bash
npm install -g ormi-cli
# or
yarn global add ormi-cli
```

### AI Agent Setup

For AI-assisted development, `ormi-cli` can:

- configure the `subgraph-mcp` server in supported agents
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

- MCP configuration for `subgraph-mcp` in agents that support MCP
- bundled Ormi skills for subgraph planning, development, build/test, deploy, query, monitor, and management

What that means in practice:

- you still build with `ormi-cli build`, deploy with `ormi-cli deploy`, add sources with `ormi-cli add`, and so on
- the agent gets Ormi-specific context and tools so it can guide or execute those workflows more reliably

How agents discover this integration:

- agents with skills support discover the bundled `subgraph-*` skills from their skills directory after `ormi-cli ai install`
- agents with MCP support see the `subgraph-mcp` server after `ormi-cli ai install`
- agents that rely on project instruction files get installer-managed files like `AGENTS.md` or `CLAUDE.md` written into the current project when relevant

No separate plugin is required for the supported clients below. The integration point is skills, MCP, or both.

### Agent Support

| Agent | Skills | MCP | Notes |
|---|---|---|---|
| Claude Code | Yes | Yes | Best-supported path for full skill + MCP workflow |
| Cursor | Yes | Yes | Supports both installed skills and MCP config |
| Windsurf | Yes | Yes | Uses Windsurf MCP config format |
| VS Code / Copilot | Yes | Yes | Uses VS Code MCP config |
| Gemini CLI | Yes | Yes | Supports both skills and MCP |
| Antigravity | Yes | Yes | Supports both skills and MCP |
| Claude Desktop | No | Yes | MCP only, no skills directory |
| Kiro | No | Yes | MCP only, no skills directory |
| Codex | Yes | No | Skills plus installer-managed `AGENTS.md` |
| Cline | Yes | No | Skills only |
| Continue | Yes | No | Skills only |
| Kilo Code | Yes | No | Skills only |
| OpenCode | Yes | No | Skills only |
| Roo Code | Yes | No | Skills only |

### Project Instruction Files

For agents that rely on project instruction files, `ormi-cli ai install` writes managed files into the current project, for example:

- `AGENTS.md` for Codex-style repo instructions
- `CLAUDE.md` for Claude Code style repo instructions

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
- if a client does not support MCP, bundled skills and installer-managed project instruction files still provide the intended workflow guidance

## Workflows

### 1. Creating a New Subgraph from Scratch

Initialize a complete subgraph project from the ground up.

**AI-Assisted Approach:**

This is the recommended path. The goal is to let the agent drive the workflow while staying anchored to real `ormi-cli` commands.

1. Install the AI integration once:

   ```bash
   ormi-cli ai install
   ormi-cli ai doctor
   ```

2. Open your coding agent in an empty working directory or the directory where you want the project created.
3. Ask the agent to scaffold the project with concrete inputs:

   ```text
   Create a new ORMI subgraph for contract 0x...
   Use the correct protocol/network settings.
   Generate schema, manifest, and mappings.
   Explain the files you create.
   ```

4. Ask the agent to run the project bootstrap steps:

   ```text
   Install dependencies, run codegen, and run build.
   If anything fails, fix it and explain the cause.
   ```

5. Review the generated schema and mappings with the agent before deploy:

   ```text
   Review the generated entities, event handlers, and start block.
   Call out anything that looks unsafe or incomplete.
   ```

6. Register and deploy:

   ```text
   Authenticate if needed, create the subgraph name, then deploy it.
   Stop and ask before any irreversible step.
   ```

<details>
<summary>Manual approach</summary>

```bash
# 1. Create project scaffolding (non-interactive for AI/CI)
ormi-cli init my-subgraph ./my-subgraph \
  --protocol ethereum \
  --from-contract 0x... \
  --network mainnet \
  --skip-install \
  --skip-git

# 2. Navigate to project
cd my-subgraph

# 3. Install dependencies
yarn install

# 4. Generate types
ormi-cli codegen

# 5. Build subgraph
ormi-cli build

# 6. Register on ORMI
ormi-cli create my-subgraph

# 7. Deploy
ormi-cli deploy my-subgraph
```

**Note:** The `init` command requires all positional arguments (`SUBGRAPH_NAME` and `DIRECTORY`) plus `--from-contract`, `--network`, and `--protocol` to run non-interactively. Without these, it will prompt for missing values.

</details>

**Next Steps:** [Workflow 2](#2-adding-data-sources-to-an-existing-subgraph) | [Workflow 3](#3-building-and-testing-locally)

---

### 2. Adding Data Sources to an Existing Subgraph

Add new contracts and data sources to your existing subgraph.

**AI-Assisted Approach:**

1. Ask the agent to inspect the existing subgraph before changing anything:

   ```text
   Review this subgraph and explain its current entities, data sources, and indexing flow.
   ```

2. Ask it to add the new contract and update all affected files:

   ```text
   Add contract 0x...
   Update subgraph.yaml, schema, mappings, and any generated types needed.
   Use the best start block you can determine and explain the choice.
   ```

3. Ask it to run the relevant CLI steps:

   ```text
   Run ormi-cli add if appropriate, then run codegen and build.
   Fix any merge or type issues.
   ```

4. Ask it to summarize the delta:

   ```text
   Show me the new entities, handlers, and any schema conflicts you resolved.
   ```

<details>
<summary>Manual approach</summary>

```bash
# Add a new contract to your subgraph
ormi-cli add 0x1234... --contract-name MyToken --start-block 12345678

# Add with custom ABI
ormi-cli add 0x5678... --abi ./path/to/abi.json

# Add and merge entities with existing schema
ormi-cli add 0x9abc... --merge-entities

# Regenerate types after adding
ormi-cli codegen

# Rebuild
ormi-cli build
```

</details>

**Next Steps:** [Workflow 3](#3-building-and-testing-locally) | [Workflow 5](#5-updating-an-existing-subgraph)

---

### 3. Building and Testing Locally

Build your subgraph and test it locally before deployment.

**AI-Assisted Approach:**

1. Ask the agent to evaluate the current project state:

   ```text
   Inspect this subgraph and tell me what should be validated before deploy.
   ```

2. Ask it to run the full local validation loop:

   ```text
   Run codegen, build, and tests.
   If something fails, fix it and rerun until the project is clean.
   ```

3. If you want a local node, have it bring up the local environment and deploy there:

   ```text
   Start the local subgraph environment, deploy locally, and verify the GraphQL endpoint responds.
   ```

4. Ask it for a final readiness summary:

   ```text
   Summarize remaining risks, untested paths, and anything I should inspect manually.
   ```

<details>
<summary>Manual approach</summary>

```bash
# Generate types from schema
ormi-cli codegen

# Build the subgraph
ormi-cli build

# Run local tests
ormi-cli test

# Run with coverage
ormi-cli test --coverage

# Watch mode for development
ormi-cli codegen -w
ormi-cli build -w

# Start local subgraph node
ormi-cli local up

# Deploy locally
ormi-cli deploy --node http://localhost:8020

# Query local endpoint
curl http://localhost:8000/subgraphs/name/my-subgraph/graphql
```

</details>

**Next Steps:** [Workflow 4](#4-deploying-to-production) | [Workflow 7](#7-debugging-failed-deployments)

---

### 4. Deploying to Production

Deploy your subgraph to the ORMI network.

**AI-Assisted Approach:**

1. Ask the agent for a pre-deploy review:

   ```text
   Review this subgraph for production deploy readiness.
   Check schema, mappings, manifest, generated artifacts, and config.
   ```

2. Ask it to run a clean production build:

   ```text
   Run the build flow and fix anything that would block deployment.
   ```

3. Ask it to verify authentication and target details:

   ```text
   Confirm whether I am authenticated, what subgraph name will be used, and whether a version label is appropriate.
   ```

4. Ask it to perform the deploy and interpret the result:

   ```text
   Deploy this subgraph and summarize the output, endpoint, and immediate follow-up checks.
   ```

<details>
<summary>Manual approach</summary>

```bash
# Ensure you're authenticated
ormi-cli auth login

# Build for production
ormi-cli build

# Deploy to ORMI
ormi-cli deploy my-subgraph

# Deploy with version label
ormi-cli deploy my-subgraph --version-label v1.0.0

# Deploy to custom node
ormi-cli deploy my-subgraph --node https://custom-node.com
```

</details>

**Next Steps:** [Workflow 6](#6-monitoring-deployment-status) | [Workflow 5](#5-updating-an-existing-subgraph)

---

### 5. Updating an Existing Subgraph

Update and redeploy your subgraph with changes.

**AI-Assisted Approach:**

1. Ask the agent to review the change set:

   ```text
   Review the current changes to this subgraph and identify behavioral risks before redeploy.
   ```

2. Ask it to update generated outputs and validate the project:

   ```text
   Clean generated artifacts if needed, rerun codegen and build, and fix regressions.
   ```

3. Ask it to assess deployment impact:

   ```text
   Tell me whether these changes affect entities, indexing behavior, or query compatibility.
   ```

4. Ask it to redeploy with an appropriate version label:

   ```text
   Deploy the updated subgraph and summarize what changed in this release.
   ```

<details>
<summary>Manual approach</summary>

```bash
# Make changes to schema, mappings, or subgraph.yaml

# Clean previous builds
ormi-cli clean

# Regenerate types
ormi-cli codegen

# Build changes
ormi-cli build

# Deploy updated version
ormi-cli deploy my-subgraph --version-label v1.1.0

# List current deployments
ormi-cli status my-subgraph

# Rollback to previous version
ormi-cli deploy my-subgraph --ipfs-hash <previous-hash>
```

</details>

**Next Steps:** [Workflow 6](#6-monitoring-deployment-status) | [Workflow 7](#7-debugging-failed-deployments)

---

### 6. Monitoring Deployment Status

Monitor the health and performance of your deployed subgraphs.

**AI-Assisted Approach:**

1. Ask the agent to inspect the deployment state:

   ```text
   Check this deployed subgraph's status, version, logs, and sync progress.
   ```

2. Ask it to validate the query surface:

   ```text
   Query the deployed subgraph and confirm the indexed data looks healthy.
   ```

3. Ask it to interpret anything suspicious:

   ```text
   Identify likely causes for slow indexing, missing entities, or query anomalies.
   ```

4. Ask it for concrete next steps:

   ```text
   Summarize whether I should wait, redeploy, or make code changes.
   ```

<details>
<summary>Manual approach</summary>

```bash
# Check deployment status
ormi-cli status my-subgraph

# View current version
ormi-cli info my-subgraph

# Monitor indexing progress
ormi-cli logs my-subgraph

# Check if subgraph is syncing
ormi-cli status my-subgraph

# Query the subgraph
curl https://api.subgraph.ormi-clilabs.com/subgraphs/name/my-subgraph/graphql \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ _meta { block { number } } }"}'
```

</details>

**Next Steps:** [Workflow 7](#7-debugging-failed-deployments) | [Workflow 3](#3-building-and-testing-locally)

---

### 7. Debugging Failed Deployments

Diagnose and fix deployment failures.

**AI-Assisted Approach:**

1. Ask the agent to capture and classify the failure:

   ```text
   Inspect the latest build or deploy failure and explain the likely root cause.
   ```

2. Ask it to trace the problem through the project:

   ```text
   Check logs, manifest, schema, mappings, generated code, and config to isolate the failure.
   ```

3. Ask it to fix and verify:

   ```text
   Make the minimum safe fix, rerun the failing commands, and explain what changed.
   ```

4. Ask it for prevention guidance:

   ```text
   Tell me how to avoid this class of failure in future updates.
   ```

<details>
<summary>Manual approach</summary>

```bash
# Check deployment logs
ormi-cli logs my-subgraph

# Verify subgraph manifest
ormi-cli build --debug

# Test specific data source
ormi-cli test MyDataSource

# Validate configuration
ormi-cli doctor

# ABI mismatch
ormi-cli add 0x... --abi ./correct-abi.json

# Start block issues
ormi-cli add 0x... --start-block <correct-block>

# Schema validation
ormi-cli codegen
# Review generated/types for errors
```

</details>

**Next Steps:** [Workflow 3](#3-building-and-testing-locally) | [Workflow 5](#5-updating-an-existing-subgraph)

---

### 8. Removing/Cleaning Up Deployments

Clean up deployments and local files.

**AI-Assisted Approach:**

1. Ask the agent to inventory what will be removed:

   ```text
   Review this project and deployment and list what can be safely removed.
   ```

2. Ask it to separate remote cleanup from local cleanup:

   ```text
   Tell me which resources are on ORMI and which are only local generated artifacts.
   ```

3. Ask it to execute cleanup carefully:

   ```text
   Remove the deployed subgraph if requested, clean generated files, and explain each step before destructive actions.
   ```

4. Ask it for a final verification:

   ```text
   Confirm what still exists after cleanup and what would need to be recreated later.
   ```

<details>
<summary>Manual approach</summary>

```bash
# Remove subgraph from ORMI
ormi-cli remove my-subgraph

# Clean local build artifacts
ormi-cli clean

# Clean specific directories
ormi-cli clean --build-dir ./build
ormi-cli clean --codegen-dir ./generated

# Remove all generated files
rm -rf build/ generated/

# Remove project directory (if desired)
cd ..
rm -rf my-subgraph
```

</details>

**Next Steps:** [Workflow 1](#1-creating-a-new-subgraph-from-scratch) | [Additional Resources](#additional-resources)

---

## Additional Resources

- **Full Command Reference**: See [USAGE.md](USAGE.md) for complete command documentation
- **ORMI Documentation**: Visit [docs.ormi-clilabs.com](https://docs.ormi-clilabs.com) for detailed guides
- **Community**: Join our Discord for support and discussions
- **AI Integration**: Run `ormi-cli ai doctor` to verify MCP configuration and bundled skills

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see LICENSE file for details
