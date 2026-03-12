# ormi-cli

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/ormi-cli.svg)](https://npmjs.org/package/ormi-cli)
[![Downloads/week](https://img.shields.io/npm/dw/ormi-cli.svg)](https://npmjs.org/package/ormi-cli)

The ORMI CLI is a powerful command-line interface for developing, deploying, and managing subgraphs on the ORMI network. Whether you're building from scratch or integrating AI assistance into your workflow, ormi-cli streamlines subgraph development.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
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

For AI-assisted development with Claude Code, Cursor, or other agents:

```bash
# Install and configure AI agent integration
ormi ai install

# Verify installation
ormi ai doctor
```

**AI-Assisted:** After installing, configure your AI coding agent with the Ormi MCP server and skills for intelligent subgraph development assistance.

## Quick Start

### For New Subgraph Developers

```bash
# Authenticate with ORMI
ormi auth login

# Create a new subgraph project
ormi init my-subgraph

# Register your subgraph name
ormi create my-subgraph

# Build and deploy
ormi build
ormi deploy my-subgraph
```

### For AI-Assisted Developers

```bash
# Install AI agent integration
ormi ai install

# Use AI to scaffold your subgraph
# AI can help configure manifest, schema, and mappings

# Build and deploy with AI guidance
ormi build
ormi deploy my-subgraph
```

**Next Steps:** See [Workflow 1](#1-creating-a-new-subgraph-from-scratch) for complete setup instructions.

## Workflows

### 1. Creating a New Subgraph from Scratch

Initialize a complete subgraph project from the ground up.

**Manual Approach:**

```bash
# 1. Create project scaffolding
ormi init my-subgraph --protocol ethereum --from-contract 0x...

# 2. Navigate to project
cd my-subgraph

# 3. Install dependencies
yarn install

# 4. Generate types
ormi codegen

# 5. Build subgraph
ormi build

# 6. Register on ORMI
ormi create my-subgraph

# 7. Deploy
ormi deploy my-subgraph
```

**AI-Assisted Approach:**

Ask your AI agent to:
- Scaffold the subgraph structure with optimal configuration
- Generate schema based on contract ABI analysis
- Create mapping templates with event handling patterns
- Configure network settings and start blocks

```bash
# AI can execute the entire workflow
ormi ai install  # First-time setup
# Then ask AI to "Create a new subgraph for contract at 0x..."
```

**Next Steps:** [Workflow 2](#2-adding-data-sources-to-an-existing-subgraph) | [Workflow 3](#3-building-and-testing-locally)

---

### 2. Adding Data Sources to an Existing Subgraph

Add new contracts and data sources to your existing subgraph.

**Manual Approach:**

```bash
# Add a new contract to your subgraph
ormi add 0x1234... --contract-name MyToken --start-block 12345678

# Add with custom ABI
ormi add 0x5678... --abi ./path/to/abi.json

# Add and merge entities with existing schema
ormi add 0x9abc... --merge-entities

# Regenerate types after adding
ormi codegen

# Rebuild
ormi build
```

**AI-Assisted Approach:**

Ask your AI agent to:
- Analyze contract ABI and suggest schema entities
- Identify events to index and relationship patterns
- Handle entity merging conflicts intelligently
- Generate efficient mapping templates

```bash
# AI can analyze contracts and add them
# Ask AI to "Add Uniswap V3 pool contract to my subgraph"
```

**Next Steps:** [Workflow 3](#3-building-and-testing-locally) | [Workflow 5](#5-updating-an-existing-subgraph)

---

### 3. Building and Testing Locally

Build your subgraph and test it locally before deployment.

**Manual Approach:**

```bash
# Generate types from schema
ormi codegen

# Build the subgraph
ormi build

# Run local tests
ormi test

# Run with coverage
ormi test --coverage

# Watch mode for development
ormi codegen -w
ormi build -w
```

**AI-Assisted Approach:**

Ask your AI agent to:
- Identify compilation errors and suggest fixes
- Optimize mapping performance
- Generate test cases for your entities
- Debug gas and indexing issues

```bash
# AI can help debug build failures
# Ask AI to "Fix the type errors in my mappings"
```

**Local Testing:**

```bash
# Start local Graph Node
ormi local up

# Deploy locally
ormi deploy --node http://localhost:8020

# Query local endpoint
curl http://localhost:8000/subgraphs/name/my-subgraph/graphql
```

**Next Steps:** [Workflow 4](#4-deploying-to-production) | [Workflow 7](#7-debugging-failed-deployments)

---

### 4. Deploying to Production

Deploy your subgraph to the ORMI network.

**Manual Approach:**

```bash
# Ensure you're authenticated
ormi auth login

# Build for production
ormi build

# Deploy to ORMI
ormi deploy my-subgraph

# Deploy with version label
ormi deploy my-subgraph --version-label v1.0.0

# Deploy to custom node
ormi deploy my-subgraph --node https://custom-node.com
```

**AI-Assisted Approach:**

Ask your AI agent to:
- Pre-flight check configuration and dependencies
- Optimize build for production deployment
- Generate deployment documentation
- Monitor deployment health

```bash
# AI can validate before deployment
# Ask AI to "Check if my subgraph is ready for production"
```

**Next Steps:** [Workflow 6](#6-monitoring-deployment-status) | [Workflow 5](#5-updating-an-existing-subgraph)

---

### 5. Updating an Existing Subgraph

Update and redeploy your subgraph with changes.

**Manual Approach:**

```bash
# Make changes to schema, mappings, or subgraph.yaml

# Clean previous builds
ormi clean

# Regenerate types
ormi codegen

# Build changes
ormi build

# Deploy updated version
ormi deploy my-subgraph --version-label v1.1.0
```

**AI-Assisted Approach:**

Ask your AI agent to:
- Review changes for potential breaking issues
- Optimize query performance with schema changes
- Generate migration scripts if needed
- Test changes in staging before production

```bash
# AI can review changes before deployment
# Ask AI to "Review my schema changes for performance impact"
```

**Version Management:**

```bash
# List current deployments
ormi status my-subgraph

# Rollback to previous version
ormi deploy my-subgraph --ipfs-hash <previous-hash>
```

**Next Steps:** [Workflow 6](#6-monitoring-deployment-status) | [Workflow 7](#7-debugging-failed-deployments)

---

### 6. Monitoring Deployment Status

Monitor the health and performance of your deployed subgraphs.

**Manual Approach:**

```bash
# Check deployment status
ormi status my-subgraph

# View current version
ormi info my-subgraph

# Monitor indexing progress
ormi logs my-subgraph
```

**AI-Assisted Approach:**

Ask your AI agent to:
- Analyze indexing performance metrics
- Identify slow queries or bottlenecks
- Suggest schema optimizations
- Set up monitoring alerts

```bash
# AI can analyze subgraph health
# Ask AI to "Analyze my subgraph performance and suggest optimizations"
```

**Health Checks:**

```bash
# Check if subgraph is syncing
ormi status my-subgraph

# Query the subgraph
curl https://api.subgraph.ormilabs.com/subgraphs/name/my-subgraph/graphql \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ _meta { block { number } } }"}'
```

**Next Steps:** [Workflow 7](#7-debugging-failed-deployments) | [Workflow 3](#3-building-and-testing-locally)

---

### 7. Debugging Failed Deployments

Diagnose and fix deployment failures.

**Manual Approach:**

```bash
# Check deployment logs
ormi logs my-subgraph

# Verify subgraph manifest
ormi build --debug

# Test specific data source
ormi test MyDataSource

# Validate configuration
ormi doctor
```

**AI-Assisted Approach:**

Ask your AI agent to:
- Parse error messages and suggest root causes
- Identify schema or mapping issues
- Generate fix suggestions
- Validate configuration files

```bash
# AI can debug deployment issues
# Ask AI to "Debug why my deployment failed"
```

**Common Issues:**

```bash
# ABI mismatch
ormi add 0x... --abi ./correct-abi.json

# Start block issues
ormi add 0x... --start-block <correct-block>

# Schema validation
ormi codegen
# Review generated/types for errors
```

**Next Steps:** [Workflow 3](#3-building-and-testing-locally) | [Workflow 5](#5-updating-an-existing-subgraph)

---

### 8. Removing/Cleaning Up Deployments

Clean up deployments and local files.

**Manual Approach:**

```bash
# Remove subgraph from ORMI
ormi remove my-subgraph

# Clean local build artifacts
ormi clean

# Clean specific directories
ormi clean --build-dir ./build
ormi clean --codegen-dir ./generated

# Remove all generated files
rm -rf build/ generated/
```

**AI-Assisted Approach:**

Ask your AI agent to:
- Identify dependencies before removal
- Generate cleanup scripts
- Verify safe removal
- Document changes

```bash
# AI can help with cleanup
# Ask AI to "Clean up my subgraph project safely"
```

**Full Cleanup:**

```bash
# Unregister from ORMI
ormi remove my-subgraph

# Clean local files
ormi clean

# Remove project directory (if desired)
cd ..
rm -rf my-subgraph
```

**Next Steps:** [Workflow 1](#1-creating-a-new-subgraph-from-scratch) | [Additional Resources](#additional-resources)

---

## Additional Resources

- **Full Command Reference**: See [USAGE.md](USAGE.md) for complete command documentation
- **ORMI Documentation**: Visit [docs.ormilabs.com](https://docs.ormilabs.com) for detailed guides
- **Community**: Join our Discord for support and discussions
- **AI Integration**: Run `ormi ai doctor` to verify your AI agent setup

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see LICENSE file for details
