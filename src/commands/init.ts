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
import Schema from '@graphprotocol/graph-cli/dist/schema.js'
import {
  createIpfsClient,
  getMinStartBlock,
  loadManifestYaml,
  loadSubgraphSchemaFromIPFS,
  validateSubgraphNetworkMatch,
} from '@graphprotocol/graph-cli/dist/utils.js'
// src/commands/init.ts
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { fetchAbi } from '../lib/abi-fetch.js'
import chains from '../lib/chains.json'
import { ORMI_IPFS_URL, ORMI_NODE_URL } from '../lib/constants.js'
import { type PackageJson, rebrandPackageJson } from '../lib/package-json.js'
import { prompt } from '../ui/prompt.js'
import AddCommand from './add.js'

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
      exclusive: ['from-example', 'from-subgraph'],
    }),
    'from-example': Flags.string({
      description: 'Creates a scaffold based on an example subgraph.',
      exclusive: ['from-contract', 'from-subgraph'],
    }),
    'from-subgraph': Flags.string({
      description: 'Creates a scaffold based on an existing subgraph.',
      exclusive: ['from-contract', 'from-example'],
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

    const {
      abi: abiPath,
      'contract-name': contractName,
      'from-contract': fromContract,
      'from-example': fromExample,
      'from-subgraph': fromSubgraph,
      'index-events': indexEvents,
      ipfs,
      network,
      node,
      protocol: protocolName,
      'skip-git': skipGit,
      'skip-install': skipInstall,
      'start-block': startBlock,
    } = flags

    // 1. Handle --from-example
    if (fromExample) {
      const subgraphName = formatSubgraphName(args.subgraphName ?? '')
      const directory = args.directory
        ? path.resolve(args.directory)
        : process.cwd()

      await this.initSubgraphFromExample({
        directory,
        fromExample,
        skipGit,
        skipInstall,
        subgraphName,
      })
      return
    }

    // 2. Handle --from-subgraph
    if (fromSubgraph) {
      const subgraphName = formatSubgraphName(args.subgraphName ?? '')
      const directory = args.directory
        ? path.resolve(args.directory)
        : process.cwd()

      // network is required for from-subgraph
      if (!network) {
        this.error('--network is required when using --from-subgraph')
      }

      await this.initSubgraphFromSubgraph({
        directory,
        fromSubgraph,
        ipfs: ipfs,
        network,
        node,
        skipGit,
        skipInstall,
        startBlock,
        subgraphName,
      })
      return
    }

    // 2. Interactive prompts for missing required values
    const interactive = await this.gatherInteractiveInputs(args, flags)

    // 3. Resolve inputs from interactive results or flags/args
    const subgraphName = formatSubgraphName(
      interactive.subgraphName ?? args.subgraphName ?? '',
    )
    const directory = interactive.directory
      ? path.resolve(interactive.directory)
      : args.directory
        ? path.resolve(args.directory)
        : process.cwd()

    // 3. Validate
    if (!subgraphName) {
      this.error('Subgraph name is required (first positional argument)')
    }

    // Use interactively gathered network if provided
    const resolvedNetwork = interactive.network ?? network
    const resolvedFromContract = interactive.fromContract ?? fromContract
    const resolvedProtocol = interactive.protocol ?? protocolName

    // 4. If no contract, create empty scaffold
    if (!resolvedFromContract) {
      this.createEmptyScaffold(
        directory,
        subgraphName,
        resolvedNetwork ?? network,
      )
      return
    }

    // network is required for contract-based scaffold
    if (!resolvedNetwork) {
      this.error('--network is required when using --from-contract')
    }

    // 3. Create protocol instance
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const protocolInstance = new Protocol(resolvedProtocol ?? 'ethereum')
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
    let finalStartBlock = startBlock

    if (protocolInstance.hasABIs()) {
      if (abiPath) {
        // Load from local file
        abi = ABICtor.load('Contract', abiPath)
      } else {
        // Fetch from block explorer with proxy detection
        try {
          const result = await fetchAbi(
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            resolvedNetwork ?? '',
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            resolvedFromContract ?? '',
            {
              onProxyDetected: (implementation) => {
                this.log(
                  `Detected proxy contract. Using implementation ABI from ${implementation}`,
                )
              },
            },
          )

          abi = result.abi
          fetchedContractName = contractName ?? result.contractName

          finalStartBlock = startBlock ?? result.startBlock

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
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            network: resolvedNetwork ?? network,
            node,
            protocolInstance,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            source: resolvedFromContract ?? fromContract,
            spkgPath: undefined,
            startBlock: finalStartBlock,
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

    // 12. Add another contract loop (only for contract-based init, not composed subgraph)
    let addAnother = true
    while (
      addAnother &&
      !protocolInstance.isComposedSubgraph() &&
      !protocolInstance.isSubstreams()
    ) {
      const shouldAddAnother = await prompt.confirm({
        message: 'Add another contract?',
      })
      if (prompt.isCancel(shouldAddAnother) || !shouldAddAnother) {
        addAnother = false
        continue
      }

      // Prompt for contract address
      const contractAddress = await prompt.text({
        message: `Contract address`,
        placeholder: '0x...',
        validate: (value) => {
          if (!value.trim()) {
            return 'Contract address is required'
          }
          if (!/^0x[a-fA-F0-9]{40}$/.test(value.trim())) {
            return 'Invalid contract address format'
          }
          return
        },
      })
      if (prompt.isCancel(contractAddress)) {
        addAnother = false
        continue
      }

      // Change to subgraph directory and run add command
      const originalCwd = process.cwd()
      process.chdir(directory)

      try {
        // Build args for add command: [address, --network, --protocol]
        const addArguments = [contractAddress.trim()]
        if (network) {
          addArguments.push('--network', network)
        }
        if (protocolName) {
          addArguments.push('--protocol', protocolName)
        }

        await AddCommand.run(addArguments)
      } catch {
        this.warn(`Failed to add contract ${contractAddress}`)
      } finally {
        process.chdir(originalCwd)
      }
    }

    this.log('\nSubgraph scaffolded successfully!')
  }

  /**
   * Copy directory recursively.
   */
  private copyDirectoryRecursive(source: string, target: string): void {
    if (!fs.existsSync(source)) {
      return
    }

    const stat = fs.statSync(source)

    if (stat.isDirectory()) {
      if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true })
      }
      const files = fs.readdirSync(source)
      for (const file of files) {
        const sourcePath = path.join(source, file)
        const tgtPath = path.join(target, file)
        this.copyDirectoryRecursive(sourcePath, tgtPath)
      }
    } else {
      fs.copyFileSync(source, target)
    }
  }

  /**
   * Create an empty subgraph scaffold (no data sources).
   * Used when --from-contract is not provided.
   */
  private createEmptyScaffold(
    directory: string,
    subgraphName: string,
    network?: string,
  ): void {
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

    // Create networks.json with the selected network
    const networksJson = network ? { [network]: {} } : {}
    fs.writeFileSync(
      path.join(directory, 'networks.json'),
      JSON.stringify(networksJson, undefined, 2) + '\n',
      'utf8',
    )

    this.log(`Empty subgraph scaffolded at ${directory}`)
    this.log('')
    this.log('Next steps:')
    this.log('  1. Add entities to schema.graphql')
    if (network) {
      this.log(
        `  2. Run \`ormi-cli add <ADDRESS> --network ${network}\` to add a data source`,
      )
    } else {
      this.log(
        '  2. Run `ormi-cli add <ADDRESS> --network <NETWORK>` to add a data source',
      )
    }
    this.log('  3. Run `ormi-cli codegen && ormi-cli build`')
  }

  /**
   * Gather missing inputs interactively using prompts.
   */
  private async gatherInteractiveInputs(
    arguments_: { directory?: string; subgraphName?: string },
    flags: {
      'contract-name'?: string
      'from-contract'?: string
      network?: string
      protocol?: string
      'start-block'?: string
    },
  ): Promise<{
    contractName?: string
    directory?: string
    fromContract?: string
    network?: string
    protocol?: string
    startBlock?: string
    subgraphName?: string
  }> {
    const result: {
      contractName?: string
      directory?: string
      fromContract?: string
      network?: string
      protocol?: string
      startBlock?: string
      subgraphName?: string
    } = {}

    // Prompt for subgraph name if not provided
    if (!arguments_.subgraphName) {
      const name = await prompt.text({
        message: 'Subgraph name',
        placeholder: 'my-subgraph',
        validate: (value) => {
          if (!value.trim()) {
            return 'Subgraph name is required'
          }
          const formatted = formatSubgraphName(value)
          if (formatted.length === 0) {
            return 'Invalid subgraph name'
          }
          return
        },
      })
      if (prompt.isCancel(name)) {
        this.exit(0)
      }
      result.subgraphName = name.trim()
    }

    // Prompt for directory if not provided
    if (!arguments_.directory && !result.subgraphName) {
      const directory = await prompt.text({
        message: 'Directory',
        placeholder: result.subgraphName
          ? path.join('.', result.subgraphName)
          : './my-subgraph',
        validate: (value) => {
          if (!value.trim()) {
            return 'Directory is required'
          }
          return
        },
      })
      if (prompt.isCancel(directory)) {
        this.exit(0)
      }
      result.directory = directory.trim()
    }

    // Prompt for from-contract if not provided
    const shouldPromptForContract = !flags['from-contract']
    if (shouldPromptForContract) {
      const contract = await prompt.text({
        message: 'Contract address (leave empty to skip)',
        placeholder: '0x...',
      })
      if (prompt.isCancel(contract)) {
        this.exit(0)
      }
      const trimmed = contract.trim()
      if (trimmed) {
        result.fromContract = trimmed
      }
    }

    // Always prompt for network if not provided
    if (!flags.network) {
      // Prioritize mainnets, then testnets
      const sortedChains = [
        ...chains.filter((c) => c.type === 'Mainnet'),
        ...chains.filter((c) => c.type === 'Testnet'),
      ]

      const network = await prompt.select({
        message: 'Select network',
        options: sortedChains.map((chain) => ({
          hint: chain.type,
          label: chain.label,
          value: chain.value,
        })),
      })
      if (prompt.isCancel(network)) {
        this.exit(0)
      }
      result.network = network
    }

    // Prompt for protocol if using from-contract (always ethereum for now)
    const needsProtocol = result.fromContract || flags['from-contract']
    if (needsProtocol && !flags.protocol) {
      // Default to ethereum, could prompt in future
      result.protocol = 'ethereum'
    }

    return result
  }

  /**
   * Initialize a subgraph from an example.
   */
  private async initSubgraphFromExample({
    directory,
    fromExample,
    skipGit,
    skipInstall,
    subgraphName,
  }: {
    directory: string
    fromExample: string
    skipGit: boolean
    skipInstall: boolean
    subgraphName: string
  }): Promise<void> {
    const DEFAULT_EXAMPLE_SUBGRAPH = 'ethereum-gravatar'
    const EXAMPLE_REPO_URL = 'https://github.com/graphprotocol/graph-tooling'

    // If example is not specified, use the default
    const exampleName = fromExample || DEFAULT_EXAMPLE_SUBGRAPH

    // 1. Check if directory exists and prompt for overwrite
    if (fs.existsSync(directory)) {
      const shouldOverwrite = await prompt.confirm({
        message: `Directory already exists. Do you want to initialize the subgraph here (files will be overwritten)?`,
      })
      if (prompt.isCancel(shouldOverwrite) || !shouldOverwrite) {
        this.exit(1)
      }
    }

    // 2. Clone the example subgraph repository
    const cloned = (await withSpinner(
      'Cloning example subgraph',
      'Failed to clone example subgraph',
      'Warnings while cloning example subgraph',
      () => {
        // Create a temporary directory
        const temporaryDirectory = fs.mkdtempSync(
          path.join(process.env.TMPDIR || '/tmp', 'example-subgraph-'),
        )

        try {
          execSync(`git clone ${EXAMPLE_REPO_URL} ${temporaryDirectory}`, {
            stdio: 'pipe',
          })

          const exampleSubgraphPath = path.join(
            temporaryDirectory,
            'examples',
            exampleName,
          )
          if (!fs.existsSync(exampleSubgraphPath)) {
            return { error: `Example not found: ${exampleName}`, result: false }
          }

          // Create target directory if it doesn't exist
          fs.mkdirSync(directory, { recursive: true })

          // Copy all files from example to target directory
          this.copyDirectoryRecursive(exampleSubgraphPath, directory)
          return true
        } finally {
          // Clean up temp directory
          fs.rmSync(temporaryDirectory, { force: true, recursive: true })
        }
      },
    )) as unknown as boolean | { error: string; result: false }

    if (cloned !== true) {
      this.error(
        typeof cloned === 'object'
          ? cloned.error
          : 'Failed to clone example subgraph',
        {
          exit: 1,
        },
      )
    }

    // 3. Initialize networks config
    const networkConfig = (await initNetworksConfig(
      directory,
      'address',
    )) as unknown as boolean
    if (!networkConfig) {
      this.exit(1)
    }

    // 4. Update package.json with the subgraph name
    this.updatePackageJsonFromExample(directory, subgraphName)

    // 5. Optionally initialize git
    if (!skipGit) {
      const git = whichBin('git')
      if (git) {
        await withSpinner(
          'Initialize Git repository',
          'Failed to initialize Git repository',
          'Warnings while initializing Git',
          () => {
            // Remove .git dir if it exists from the clone
            const gitDirectory = path.join(directory, '.git')
            if (fs.existsSync(gitDirectory)) {
              fs.rmSync(gitDirectory, { force: true, recursive: true })
            }
            executeInDirectory('git init', directory)
            executeInDirectory('git add --all', directory)
            executeInDirectory(
              'git commit -m "Initialize subgraph from example"',
              directory,
            )
            return Promise.resolve(true)
          },
        )
      }
    }

    // 6. Optionally install dependencies
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

      // 7. Run codegen (only if dependencies were installed)
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

    const yarn = whichBin('yarn')
    const relativeDirectory = path.relative(process.cwd(), directory)
    this.log('')
    this.log(`Subgraph ${subgraphName} created in ${relativeDirectory}`)
    this.log('')
    this.log('Next steps:')
    this.log(
      `  1. Type \`cd ${relativeDirectory}\` to enter the subgraph directory`,
    )
    this.log(
      `  2. Run \`${yarn ? 'yarn deploy' : 'npm run deploy'}\` to deploy the subgraph`,
    )
  }

  /**
   * Initialize a subgraph from an existing subgraph (composed subgraph).
   */
  private async initSubgraphFromSubgraph({
    directory,
    fromSubgraph,
    ipfs,
    network,
    node,
    skipGit,
    skipInstall,
    startBlock,
    subgraphName,
  }: {
    directory: string
    fromSubgraph: string
    ipfs: string
    network: string
    node: string
    skipGit: boolean
    skipInstall: boolean
    startBlock?: string
    subgraphName: string
  }): Promise<void> {
    let immutableEntities: string[] | undefined
    let finalStartBlock = startBlock

    // 1. Check if directory exists and prompt for overwrite
    if (fs.existsSync(directory)) {
      const shouldOverwrite = await prompt.confirm({
        message: `Directory already exists. Do you want to initialize the subgraph here (files will be overwritten)?`,
      })
      if (prompt.isCancel(shouldOverwrite) || !shouldOverwrite) {
        this.exit(1)
      }
    }

    // 2. Create IPFS client and validate the source subgraph
    try {
      const ipfsClient = createIpfsClient({
        url: ipfs,
      })

      // Validate network match
      const manifestYaml = (await loadManifestYaml(
        ipfsClient,
        fromSubgraph,
      )) as unknown
      const { error, valid } = validateSubgraphNetworkMatch(
        manifestYaml,
        network,
      )
      if (!valid) {
        this.error(error || 'Invalid subgraph network match', { exit: 1 })
      }

      // Get start block from manifest if not provided
      if (!finalStartBlock) {
        const minStartBlock = getMinStartBlock(manifestYaml)
        if (minStartBlock) {
          finalStartBlock = String(minStartBlock)
          this.log(`Detected start block: ${finalStartBlock}`)
        }
      }

      // Load schema and extract immutable entities
      const schemaString = await loadSubgraphSchemaFromIPFS(
        ipfsClient,
        fromSubgraph,
      )
      const schema = await Schema.loadFromString(schemaString)
      immutableEntities = schema.getImmutableEntityNames()

      if (immutableEntities.length === 0) {
        this.error(
          'Source subgraph must have at least one immutable entity. This subgraph cannot be used as a source subgraph since it has no immutable entities.',
          { exit: 1 },
        )
      }
    } catch (error: unknown) {
      this.error(
        `Failed to load and parse subgraph schema: ${(error as Error).message}`,
        { exit: 1 },
      )
    }

    // 3. Generate scaffold with immutable entities
    const protocolInstance = new Protocol('subgraph')
    const scaffoldResult = (await withSpinner(
      'Create subgraph scaffold',
      'Failed to create subgraph scaffold',
      'Warnings while creating subgraph scaffold',
      async (spinner: Spinner) => {
        const scaffold = await generateScaffold(
          {
            // For composed subgraphs, abi is not used but required by type
            abi: undefined as unknown as EthereumABI,
            contractName: undefined,
            entities: immutableEntities,
            // For composed subgraphs, indexEvents is not used but required by type
            indexEvents: false,
            network,
            node,
            protocolInstance,
            source: fromSubgraph,
            spkgPath: undefined,
            startBlock: finalStartBlock,
            subgraphName,
          },
          spinner,
        )
        await writeScaffold(scaffold, directory, spinner)
        return true
      },
    )) as unknown as boolean
    if (!scaffoldResult) {
      this.exit(1)
    }

    // 4. Initialize networks config
    const networkConfig = (await initNetworksConfig(
      directory,
      'address',
    )) as unknown as boolean
    if (!networkConfig) {
      this.exit(1)
    }

    // 5. Rebrand package.json
    this.rebrandGeneratedFiles(directory)

    // 6. Optionally install dependencies
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

      // 7. Run codegen
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

    // 8. Optionally initialize git
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

    const yarn = whichBin('yarn')
    const relativeDirectory = path.relative(process.cwd(), directory)
    this.log('')
    this.log(`Subgraph ${subgraphName} created in ${relativeDirectory}`)
    this.log('')
    this.log('Next steps:')
    this.log(
      `  1. Type \`cd ${relativeDirectory}\` to enter the subgraph directory`,
    )
    this.log(
      `  2. Run \`${yarn ? 'yarn deploy' : 'npm run deploy'}\` to deploy the subgraph`,
    )
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

  /**
   * Update package.json from example with the new subgraph name.
   */
  private updatePackageJsonFromExample(
    directory: string,
    subgraphName: string,
  ): void {
    const packagePath = path.join(directory, 'package.json')
    if (!fs.existsSync(packagePath)) {
      return
    }

    try {
      const raw = fs.readFileSync(packagePath, 'utf8')
      const package_ = JSON.parse(raw) as PackageJson

      // Update the package name
      package_.name = subgraphName

      // Update scripts to use ormi-cli
      if (package_.scripts) {
        for (const key of Object.keys(package_.scripts)) {
          package_.scripts[key] = package_.scripts[key].replace(
            'graph',
            'ormi-cli',
          )
        }
      }

      // Remove example-specific fields
      delete package_.license
      delete package_.repository

      fs.writeFileSync(
        packagePath,
        JSON.stringify(package_, undefined, 2) + '\n',
        'utf8',
      )
    } catch {
      this.warn('Could not update package.json from example')
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
