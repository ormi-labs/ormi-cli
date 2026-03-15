import { Args, Command, Flags } from '@oclif/core'

import * as p from '@clack/prompts'
import {
  appendApiVersionForGraph,
  createCompiler,
} from '@graphprotocol/graph-cli/dist/command-helpers/compiler.js'
import * as DataSourcesExtractor from '@graphprotocol/graph-cli/dist/command-helpers/data-sources.js'
import { updateSubgraphNetwork } from '@graphprotocol/graph-cli/dist/command-helpers/network.js'
import {
  assertGraphTsVersion,
  assertManifestApiVersion,
} from '@graphprotocol/graph-cli/dist/command-helpers/version.js'
import { GRAPH_CLI_SHARED_HEADERS } from '@graphprotocol/graph-cli/dist/constants.js'
import Protocol from '@graphprotocol/graph-cli/dist/protocols/index.js'
import { createIpfsClient } from '@graphprotocol/graph-cli/dist/utils.js'
import path from 'node:path'
import { URL } from 'node:url'

import {
  AUTH_FAILURE_PATTERN,
  ORMI_IPFS_URL,
  ORMI_NODE_URL,
} from '../lib/constants.js'
import {
  createAuthenticatedJsonRpcClient,
  type JsonRpcError,
} from '../lib/rpc-client.js'

interface DeployResult {
  playground: string
  queries: string
}

type JsonRpcDeployCallback = (
  requestError?: Error | null,
  jsonRpcError?: JsonRpcError | null,
  result?: DeployResult,
) => void

const headersFlag = Flags.custom<Record<string, string>>({
  aliases: ['hdr'],
  default: {},
  parse: (value) =>
    Promise.resolve(JSON.parse(value) as Record<string, string>),
  summary: 'Add custom headers that will be used by the IPFS HTTP client.',
})

export default class DeployCommand extends Command {
  // Order matches graph-cli: deploy <SUBGRAPH_NAME> [SUBGRAPH_MANIFEST]
  /* eslint-disable perfectionist/sort-objects */
  static args = {
    'subgraph-name': Args.string({ description: 'Name of the subgraph' }),
    'subgraph-manifest': Args.string({
      default: 'subgraph.yaml',
      description: 'Path to subgraph manifest',
    }),
  }
  /* eslint-enable perfectionist/sort-objects */

  static description = 'Deploy a subgraph to ORMI.'

  static examples = [
    '<%= config.bin %> <%= command.id %> my-subgraph',
    '<%= config.bin %> <%= command.id %> my-subgraph --version-label v0.0.2',
  ]

  static flags = {
    'debug-fork': Flags.string({
      summary: 'ID of a remote subgraph whose store will be GraphQL queried.',
    }),
    'deploy-key': Flags.string({
      summary:
        'ORMI deploy key (defaults to stored key or ORMI_DEPLOY_KEY env).',
    }),
    headers: headersFlag(),
    help: Flags.help({ char: 'h' }),
    ipfs: Flags.string({
      char: 'i',
      default: ORMI_IPFS_URL,
      summary: 'ORMI IPFS node to upload build results to.',
    }),
    'ipfs-hash': Flags.string({
      required: false,
      summary: 'IPFS hash of the subgraph manifest to deploy.',
    }),
    network: Flags.string({
      summary: 'Network configuration to use from the networks config file.',
    }),
    'network-file': Flags.file({
      default: 'networks.json',
      summary: 'Networks config file path.',
    }),
    node: Flags.string({
      char: 'g',
      default: ORMI_NODE_URL,
      summary: 'ORMI deploy node URL.',
    }),
    'output-dir': Flags.directory({
      char: 'o',
      default: 'build/',
      summary: 'Output directory for build results.',
    }),
    'skip-migrations': Flags.boolean({
      summary: 'Skip subgraph migrations.',
    }),
    'version-label': Flags.string({
      char: 'l',
      summary: 'Version label used for the deployment.',
    }),
    watch: Flags.boolean({
      char: 'w',
      summary: 'Regenerate types when subgraph files change.',
    }),
  }

  async run(): Promise<void> {
    const {
      args: {
        'subgraph-manifest': manifest,
        'subgraph-name': subgraphNameArgument,
      },
      flags: {
        'debug-fork': debugFork,
        'deploy-key': deployKeyFlag,
        headers,
        ipfs,
        'ipfs-hash': ipfsHash,
        network,
        'network-file': networkFile,
        node,
        'output-dir': outputDirectory,
        'skip-migrations': skipMigrations,
        'version-label': versionLabelFlag,
        watch,
      },
    } = await this.parse(DeployCommand)

    // Prompt for subgraph name if not provided
    let subgraphName = subgraphNameArgument
    if (!subgraphName) {
      const result = await p.text({
        message: 'What is the subgraph name?',
        validate: (v) => (v.trim() ? undefined : 'Subgraph name is required'),
      })
      if (p.isCancel(result)) {
        this.exit(0)
      }
      subgraphName = result
    }

    const requestUrl = new URL(node)
    const client = createAuthenticatedJsonRpcClient(node, deployKeyFlag)
    if (!client) {
      this.exit(1)
    }

    // Prompt for version label if not provided
    let versionLabel = versionLabelFlag
    if (!versionLabel) {
      const result = await p.text({
        message: 'Which version label to use? (e.g. "v0.0.1")',
        validate: (v) => (v.trim() ? undefined : 'Version label is required'),
      })
      if (p.isCancel(result)) {
        this.exit(0)
      }
      versionLabel = result
    }

    const deploySubgraph = (hash: string): Promise<void> => {
      const spinner = p.spinner()
      spinner.start(`Deploying to ORMI: ${requestUrl.toString()}`)

      return new Promise<void>((resolve) => {
        const callback: JsonRpcDeployCallback = (
          requestError,
          jsonRpcError,
          result,
        ) => {
          if (jsonRpcError) {
            let errorMessage = `Failed to deploy: ${jsonRpcError.message}`
            if (AUTH_FAILURE_PATTERN.test(jsonRpcError.message)) {
              errorMessage +=
                '\nProvide --deploy-key or set ORMI_DEPLOY_KEY env var.'
            }
            spinner.stop(errorMessage, 1)
            this.exit(1)
          } else if (requestError) {
            const code =
              (requestError as NodeJS.ErrnoException).code ??
              requestError.message
            spinner.stop(`HTTP error deploying the subgraph: ${code}`, 1)
            this.exit(1)
          } else {
            spinner.stop('Deployed successfully')
            if (result) {
              const base = `${requestUrl.protocol}//${requestUrl.hostname}`
              let { playground, queries } = result
              if (playground.startsWith(':')) {
                playground = base + playground
              }
              if (queries.startsWith(':')) {
                queries = base + queries
              }
              this.log(`\nPlayground: ${playground}`)
              this.log(`Queries:    ${queries}`)
            }
          }
          resolve()
        }

        client.request(
          'subgraph_deploy',
          {
            debug_fork: debugFork,
            ipfs_hash: hash,
            name: subgraphName,
            version_label: versionLabel,
          },
          callback,
        )
      })
    }

    // Deploy directly from an IPFS hash if provided
    if (ipfsHash) {
      const ipfsClient = createIpfsClient({
        headers: { ...headers, ...GRAPH_CLI_SHARED_HEADERS },
        url: appendApiVersionForGraph(ipfs),
      })

      const manifestBuffer = ipfsClient.cat(ipfsHash)
      let manifestFile = ''
      for await (const chunk of manifestBuffer) {
        manifestFile += chunk.toString()
      }
      if (!manifestFile) {
        this.error(
          `Could not find subgraph manifest at IPFS hash ${ipfsHash}`,
          { exit: 1 },
        )
      }

      await ipfsClient.pin.add(ipfsHash)
      await deploySubgraph(ipfsHash)
      return
    }

    // Compile from source
    let protocol: Protocol
    try {
      await assertManifestApiVersion(manifest, '0.0.5')
      await assertGraphTsVersion(path.dirname(manifest), '0.25.0')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const dataSourcesAndTemplates =
        await DataSourcesExtractor.fromFilePath(manifest)
      protocol = Protocol.fromDataSources(dataSourcesAndTemplates)
    } catch (error) {
      this.error(error as Error, { exit: 1 })
    }

    if (network) {
      const contract = protocol.getContract()
      if (!contract) {
        this.error(
          'Protocol has no contract — cannot determine network identifier',
          { exit: 1 },
        )
      }
      await updateSubgraphNetwork(
        manifest,
        network,
        networkFile,
        contract.identifierName(),
      )
    }

    const compiler = createCompiler(manifest, {
      blockIpfsMethods: undefined,
      headers,
      ipfs,
      outputDir: outputDirectory,
      outputFormat: 'wasm',
      protocol,
      skipMigrations,
    })
    if (!compiler) {
      this.exit(1)
    }

    if (watch) {
      // watchAndCompile callback must be void (non-async) — use void operator to suppress
      await compiler.watchAndCompile((hash) => {
        void deploySubgraph(hash)
      })
    } else {
      // compile() returns Promise<any> — narrow it to what graph-node actually returns
      const result = (await compiler.compile({ validate: true })) as
        | false
        | string
        | undefined
      if (!result) {
        process.exitCode = 1
        return
      }
      await deploySubgraph(result)
    }
  }
}
