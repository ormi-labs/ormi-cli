import { Args, Command, Flags } from '@oclif/core'

import { initNetworksConfig } from '@graphprotocol/graph-cli/dist/command-helpers/network.js'
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

import { fetchAbi } from '../lib/abi-fetch.js'
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
    if (!subgraphName) {
      this.error('Subgraph name is required (first positional argument)')
    }

    // 2b. If no contract, create empty scaffold
    if (!fromContract) {
      this.createEmptyScaffold(directory, subgraphName)
      return
    }

    // network is required for contract-based scaffold
    if (!network) {
      this.error('--network is required when using --from-contract')
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

    // 4. Fetch ABI with proxy detection
    // getABI() returns the ABI constructor (typed as any in graph-cli internals)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const ABICtor: typeof EthereumABI = protocolInstance.getABI()
    let abi: EthereumABI | undefined
    let fetchedContractName = contractName
    let resolvedStartBlock = startBlock

    if (protocolInstance.hasABIs()) {
      if (abiPath) {
        // Load from local file
        abi = ABICtor.load('Contract', abiPath)
      } else {
        // Fetch from block explorer with proxy detection
        try {
          const result = await fetchAbi(network, fromContract, {
            onProxyDetected: (implementation) => {
              this.log(
                `Detected proxy contract. Using implementation ABI from ${implementation}`,
              )
            },
          })
          abi = result.abi
          fetchedContractName = contractName ?? result.contractName
          resolvedStartBlock = startBlock ?? result.startBlock

          if (result.startBlock) {
            this.log(`Detected start block: ${result.startBlock}`)
          }
        } catch (error: unknown) {
          this.error(`Failed to get ABI: ${(error as Error).message}`, {
            exit: 1,
          })
        }
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
            contractName: formatContractName(fetchedContractName ?? 'Contract'),
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
   * Create an empty subgraph scaffold (no data sources).
   * Used when --from-contract is not provided.
   */
  private createEmptyScaffold(directory: string, subgraphName: string): void {
    // Warn if files that will be overwritten already exist
    const filesToCreate = [
      'package.json',
      'tsconfig.json',
      'subgraph.yaml',
      'schema.graphql',
    ]
    const existingFiles = filesToCreate.filter((file) =>
      fs.existsSync(path.join(directory, file)),
    )
    if (existingFiles.length > 0) {
      this.warn(
        `The following files will be overwritten: ${existingFiles.join(', ')}`,
      )
    }

    // Create directories
    fs.mkdirSync(path.join(directory, 'abis'), { recursive: true })
    fs.mkdirSync(path.join(directory, 'src'), { recursive: true })

    // Create package.json with ormi-cli commands
    const packageJson = {
      dependencies: {
        '@graphprotocol/graph-cli': '^0.90.0',
        '@graphprotocol/graph-ts': '^0.35.0',
      },
      license: 'UNLICENSED',
      name: subgraphName,
      scripts: {
        build: 'ormi-cli build',
        codegen: 'ormi-cli codegen',
        'create-local': 'ormi-cli create-local',
        deploy: 'ormi-cli deploy',
        'remove-local': 'ormi-cli remove-local',
      },
    }
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify(packageJson, undefined, 2) + '\n',
      'utf8',
    )

    // Create tsconfig.json
    const tsConfig = {
      extends: '@graphprotocol/graph-ts/tsconfig.json',
      include: ['src'],
    }
    fs.writeFileSync(
      path.join(directory, 'tsconfig.json'),
      JSON.stringify(tsConfig, undefined, 2) + '\n',
      'utf8',
    )

    // Create minimal subgraph.yaml
    const subgraphYaml = `specVersion: 1.3.0
schema:
  file: ./schema.graphql
`
    fs.writeFileSync(
      path.join(directory, 'subgraph.yaml'),
      subgraphYaml,
      'utf8',
    )

    // Create empty schema.graphql
    fs.writeFileSync(
      path.join(directory, 'schema.graphql'),
      '# Add your entities here\n',
      'utf8',
    )

    // Create empty networks.json (will be populated when data sources are added)
    fs.writeFileSync(path.join(directory, 'networks.json'), '{}\n', 'utf8')

    this.log(`Empty subgraph scaffolded at ${directory}`)
    this.log('')
    this.log('Next steps:')
    this.log('  1. Add entities to schema.graphql')
    this.log(
      '  2. Run `ormi-cli add <ADDRESS> --network <NETWORK>` to add a data source',
    )
    this.log('  3. Run `ormi-cli codegen && ormi-cli build`')
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
