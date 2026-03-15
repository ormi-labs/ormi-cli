import { Args, Command, Flags } from '@oclif/core'

import * as p from '@clack/prompts'

import { ORMI_NODE_URL } from '../lib/constants.js'
import {
  createAuthenticatedJsonRpcClient,
  type JsonRpcError,
} from '../lib/rpc-client.js'

export default class RemoveCommand extends Command {
  static args = {
    'subgraph-name': Args.string({ required: true }),
  }

  static description = 'Unregister a subgraph name from ORMI.'

  static examples = [
    '<%= config.bin %> <%= command.id %> my-subgraph',
    '<%= config.bin %> <%= command.id %> my-org/my-subgraph --node https://custom-node',
  ]

  static flags = {
    'deploy-key': Flags.string({
      summary:
        'ORMI deploy key (or set ORMI_DEPLOY_KEY env var).',
    }),
    help: Flags.help({ char: 'h' }),
    node: Flags.string({
      char: 'g',
      default: ORMI_NODE_URL,
      summary: 'ORMI deploy node URL.',
    }),
  }

  async run(): Promise<void> {
    const {
      args: { 'subgraph-name': subgraphName },
      flags: { 'deploy-key': deployKeyFlag, node },
    } = await this.parse(RemoveCommand)

    const client = createAuthenticatedJsonRpcClient(node, deployKeyFlag)
    if (!client) {
      this.exit(1)
    }

    const spinner = p.spinner()
    spinner.start(`Removing subgraph: ${subgraphName}`)

    await new Promise<void>((resolve) => {
      client.request(
        'subgraph_remove',
        { name: subgraphName },
        // @ts-expect-error jayson callback args are untyped in its TS declarations
        (requestError: Error | null, jsonRpcError: JsonRpcError | null) => {
          if (jsonRpcError) {
            spinner.stop(`Error removing subgraph: ${jsonRpcError.message}`, 1)
            this.exit(1)
          } else if (requestError) {
            const code =
              (requestError as NodeJS.ErrnoException).code ??
              requestError.message
            spinner.stop(`HTTP error removing subgraph: ${code}`, 1)
            this.exit(1)
          } else {
            spinner.stop(`Removed: ${subgraphName}`)
          }
          resolve()
        },
      )
    })
  }
}
