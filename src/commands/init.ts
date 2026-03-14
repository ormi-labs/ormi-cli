import { Args, Command, Flags } from '@oclif/core'

import { ContractService } from '@graphprotocol/graph-cli/dist/command-helpers/contracts.js'
import { initNetworksConfig } from '@graphprotocol/graph-cli/dist/command-helpers/network.js'
import { loadRegistry } from '@graphprotocol/graph-cli/dist/command-helpers/registry.js'
import {
  generateScaffold,
  writeScaffold,
} from '@graphprotocol/graph-cli/dist/command-helpers/scaffold.js'
import {
  type Spinner,
  withSpinner,
} from '@graphprotocol/graph-cli/dist/command-helpers/spinner.js'
import {
  formatContractName,
  formatSubgraphName,
} from '@graphprotocol/graph-cli/dist/command-helpers/subgraph.js'
import EthereumABI from '@graphprotocol/graph-cli/dist/protocols/ethereum/abi.js'
import Protocol from '@graphprotocol/graph-cli/dist/protocols/index.js'
import { abiEvents } from '@graphprotocol/graph-cli/dist/scaffold/schema.js'
// src/commands/init.ts
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { ORMI_IPFS_URL, ORMI_NODE_URL } from '../lib/constants.js'
import { type PackageJson, rebrandPackageJson } from '../lib/package-json.js'

export default class InitCommand extends Command {
  // Order matches graph-cli: init <SUBGRAPH_NAME> <DIRECTORY>
  /* eslint-disable perfectionist/sort-objects */
  static args = {
    subgraphName: Args.string({ description: 'Name of the subgraph' }),
    directory: Args.string({
      description: 'Directory to create the subgraph in',
    }),
  }
  /* eslint-enable perfectionist/sort-objects */

  static description = 'Creates a new subgraph with basic scaffolding.'

  static flags = {
    abi: Flags.string({
      summary: 'Path to the contract ABI',
    }),
    'contract-name': Flags.string({
      description: 'Name of the contract.',
    }),
    'from-contract': Flags.string({
      description: 'Creates a scaffold based on an existing contract.',
    }),
    help: Flags.help({ char: 'h' }),
    'index-events': Flags.boolean({
      description: 'Index contract events as entities.',
    }),
    ipfs: Flags.string({
      char: 'i',
      default: ORMI_IPFS_URL,
      summary: 'IPFS node to use for fetching subgraph data.',
    }),
    network: Flags.string({
      description: 'Network the contract is deployed to.',
    }),
    node: Flags.string({
      char: 'g',
      default: ORMI_NODE_URL,
      summary: 'Subgraph node for which to initialize.',
    }),
    protocol: Flags.string({
      default: 'ethereum',
      options: [
        'arweave',
        'cosmos',
        'ethereum',
        'near',
        'subgraph',
        'substreams',
      ],
    }),
    'skip-git': Flags.boolean({
      default: false,
      summary: 'Skip initializing a Git repository.',
    }),
    'skip-install': Flags.boolean({
      default: false,
      summary: 'Skip installing dependencies.',
    }),
    'start-block': Flags.string({
      description: 'Block number to start indexing from.',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(InitCommand)

    // 1. Resolve inputs
    const subgraphName = formatSubgraphName(args.subgraphName ?? '')
    const directory = args.directory
      ? path.resolve(args.directory)
      : process.cwd()
    const {
      abi: abiPath,
      'contract-name': contractName,
      'from-contract': fromContract,
      'index-events': indexEvents,
      network,
      node,
      protocol: protocolName,
      'skip-git': skipGit,
      'skip-install': skipInstall,
      'start-block': startBlock,
    } = flags

    // 2. Validate
    if (!fromContract) {
      this.error('--from-contract is required')
    }
    if (!network) {
      this.error('--network is required when using --from-contract')
    }
    if (!subgraphName) {
      this.error('Subgraph name is required (first positional argument)')
    }

    // 3. Create protocol instance
    const protocolInstance = new Protocol(protocolName)
    if (
      protocolInstance.isComposedSubgraph() ||
      protocolInstance.isSubstreams()
    ) {
      this.error(
        '--protocol cannot be subgraph or substreams when using --from-contract',
      )
    }

    // 4. Fetch ABI
    // getABI() returns the ABI constructor (typed as any in graph-cli internals)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const ABICtor: typeof EthereumABI = protocolInstance.getABI()
    let abi: EthereumABI | undefined

    // Create contractService for ABI and start block fetching
    const registry = await loadRegistry()
    const contractService = new ContractService(registry)

    if (protocolInstance.hasABIs()) {
      if (abiPath) {
        // Load from local file
        abi = ABICtor.load('Contract', abiPath)
      } else {
        // Fetch from block explorer
        try {
          const sourcifyInfo = await contractService.getFromSourcify(
            ABICtor,
            network,
            fromContract,
          )
          abi = sourcifyInfo
            ? sourcifyInfo.abi
            : await contractService.getABI(ABICtor, network, fromContract)
        } catch (error: unknown) {
          this.error(`Failed to get ABI: ${(error as Error).message}`, {
            exit: 1,
          })
        }
      }
    }

    // 4b. Fetch start block if not provided
    let resolvedStartBlock = startBlock
    if (!resolvedStartBlock) {
      try {
        resolvedStartBlock = await contractService.getStartBlock(
          network,
          fromContract,
        )
        this.log(`Detected start block: ${resolvedStartBlock}`)
      } catch (error: unknown) {
        this.warn(`Could not detect start block: ${(error as Error).message}`)
        this.warn(
          'Defaulting to block 0 — consider setting --start-block manually',
        )
        resolvedStartBlock = '0'
      }
    }

    // 5. Validate ABI has events
    if (protocolInstance.hasABIs() && abi && protocolInstance.hasEvents()) {
      const events = abiEvents(abi)
      if (events.size === 0) {
        this.error('ABI does not contain any events', { exit: 1 })
      }
    }

    // 6. Generate and write scaffold (NO directory-exists prompt!)
    const scaffoldResult: unknown = await withSpinner(
      'Create subgraph scaffold',
      'Failed to create subgraph scaffold',
      'Warnings while creating subgraph scaffold',
      async (spinner: Spinner) => {
        const scaffold = await generateScaffold(
          {
            abi: abi as unknown as EthereumABI,
            contractName: formatContractName(contractName ?? 'Contract'),
            entities: undefined,
            indexEvents,
            network,
            node,
            protocolInstance,
            source: fromContract,
            spkgPath: undefined,
            startBlock: resolvedStartBlock,
            subgraphName,
          },
          spinner,
        )
        await writeScaffold(scaffold, directory, spinner)
        return true
      },
    )
    if (scaffoldResult !== true) {
      this.exit(1)
    }

    // 7. Initialize networks config
    const contract = protocolInstance.getContract()
    if (contract) {
      const networkConfig: unknown = await initNetworksConfig(
        directory,
        contract.identifierName(),
      )
      if (networkConfig !== true) {
        this.exit(1)
      }
    }

    // 8. Rebrand package.json (kept from existing ormi init.ts)
    this.rebrandGeneratedFiles(directory)

    // 9. Optionally install dependencies
    if (!skipInstall) {
      const yarn = whichBin('yarn')
      const installCmd = yarn ? 'yarn' : 'npm install'
      await withSpinner(
        'Install dependencies',
        'Failed to install dependencies',
        'Warnings while installing dependencies',
        () => {
          executeInDirectory(installCmd, directory)
          return Promise.resolve(true)
        },
      )
    }

    // 10. Run codegen (unless substreams or skip-install)
    if (!skipInstall && !protocolInstance.isSubstreams()) {
      const yarn = whichBin('yarn')
      const codegenCmd = yarn ? 'yarn codegen' : 'npm run codegen'
      await withSpinner(
        'Generate ABI and schema types',
        'Failed to generate code from ABI and GraphQL schema',
        'Warnings while generating code',
        () => {
          executeInDirectory(codegenCmd, directory)
          return Promise.resolve(true)
        },
      )
    }

    // 11. Optionally initialize git
    if (!skipGit) {
      const git = whichBin('git')
      if (git) {
        await withSpinner(
          'Initialize Git repository',
          'Failed to initialize Git repository',
          'Warnings while initializing Git',
          () => {
            executeInDirectory('git init', directory)
            return Promise.resolve(true)
          },
        )
      }
    }

    this.log('\nSubgraph scaffolded successfully!')
  }

  /**
   * Read, rebrand, and write back the generated package.json.
   */
  private rebrandGeneratedFiles(outputDirectory: string): void {
    const packagePath = path.join(outputDirectory, 'package.json')
    if (!fs.existsSync(packagePath)) {
      return
    }

    try {
      const raw = fs.readFileSync(packagePath, 'utf8')
      const package_ = JSON.parse(raw) as PackageJson
      const rebranded = rebrandPackageJson(package_, this.config.version)
      fs.writeFileSync(
        packagePath,
        JSON.stringify(rebranded, undefined, 2) + '\n',
        'utf8',
      )
    } catch {
      // Non-fatal: subgraph is still functional with graph commands
      this.warn('Could not rebrand package.json to use ormi-cli commands')
    }
  }
}

function executeInDirectory(cmd: string, cwd: string): void {
  execSync(cmd, { cwd, stdio: 'pipe' })
}

function whichBin(cmd: string): string | undefined {
  try {
    return (
      execSync(`command -v ${cmd}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim() || undefined
    )
  } catch {
    return undefined
  }
}
