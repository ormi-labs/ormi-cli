import { Args, Command, Flags } from '@oclif/core'

import { AUTH_FAILURE_PATTERN } from '../lib/constants.js'
import { listEnvironments } from '../lib/environments.js'
import { resolveNodeAndIpfs } from '../lib/resolve-environment.js'
import {
  createAuthenticatedJsonRpcClient,
  type JsonRpcError,
} from '../lib/rpc-client.js'
import { prompt } from '../ui/prompt.js'

export default class RemoveCommand extends Command {
  static args = {
    'subgraph-name': Args.string(),
  }

  static description = 'Unregister a subgraph name from ORMI.'

  static examples = [
    '<%= config.bin %> <%= command.id %> my-subgraph',
    '<%= config.bin %> <%= command.id %> my-subgraph --env mantle',
  ]

  static flags = {
    'deploy-key': Flags.string({
      summary: 'ORMI deploy key (or set ORMI_DEPLOY_KEY env var).',
    }),
    env: Flags.string({
      description:
        'ORMI environment (e.g., mantle, ormi-k8s). Prompts interactively if not provided.',
      exclusive: ['node'],
      options: listEnvironments().map((environment) => environment.slug),
    }),
    help: Flags.help({ char: 'h' }),
    node: Flags.string({
      char: 'g',
      summary: 'ORMI deploy node URL.',
    }),
  }

  async run(): Promise<void> {
    const {
      args: { 'subgraph-name': subgraphNameArgument },
      flags: {
        'deploy-key': deployKeyFlag,
        env: environmentFlag,
        node: nodeFlag,
      },
    } = await this.parse(RemoveCommand)

    const { env: resolvedEnvironment, node } = await resolveNodeAndIpfs({
      envFlag: environmentFlag,
      nodeFlag,
    })

    let subgraphName = subgraphNameArgument
    if (!subgraphName) {
      const result = await prompt.text({
        message: 'What is the subgraph name?',
        validate: (v) => (v.trim() ? undefined : 'Subgraph name is required'),
      })
      if (prompt.isCancel(result)) {
        this.exit(0)
      }
      subgraphName = result
    }

    const client = createAuthenticatedJsonRpcClient(node, deployKeyFlag)
    if (!client) {
      if (resolvedEnvironment) {
        this.error(
          `No deploy key found for ${resolvedEnvironment.name}.\n  Get your API key at: ${resolvedEnvironment.appUrl}/dashboard/api\n  Then run: ormi-cli auth --env ${resolvedEnvironment.slug} <your-key>`,
        )
      }
      this.exit(1)
    }

    const spinner = prompt.spinner()
    spinner.start(`Removing subgraph: ${subgraphName}`)

    await new Promise<void>((resolve) => {
      client.request(
        'subgraph_remove',
        { name: subgraphName },
        // @ts-expect-error jayson callback args are untyped in its TS declarations
        (requestError: Error | null, jsonRpcError: JsonRpcError | null) => {
          if (jsonRpcError) {
            let errorMessage = `Error removing subgraph: ${jsonRpcError.message}`
            if (AUTH_FAILURE_PATTERN.test(jsonRpcError.message)) {
              errorMessage += resolvedEnvironment
                ? `\nNo deploy key found for ${resolvedEnvironment.name}.\n  Get your API key at: ${resolvedEnvironment.appUrl}/dashboard/api\n  Then run: ormi-cli auth --env ${resolvedEnvironment.slug} <your-key>`
                : '\nRun `ormi-cli auth --node <url> <key>` to save your deploy key, or pass --deploy-key.'
            }
            spinner.stop(errorMessage, 1)
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
