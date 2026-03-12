import LocalCommand from '@graphprotocol/graph-cli/dist/commands/local.js'

export default class Local extends LocalCommand {
  static override description =
    'Runs local tests against a subgraph node environment (using Ganache by default).'

  static override flags: typeof LocalCommand.flags = {
    ...LocalCommand.flags,
    'node-image': {
      ...LocalCommand.flags['node-image'],
      summary: 'Custom subgraph node image to test against.',
    },
    'node-logs': {
      ...LocalCommand.flags['node-logs'],
      summary: 'Print the subgraph node logs.',
    },
    'standalone-node': {
      ...LocalCommand.flags['standalone-node'],
      summary: 'Use a standalone subgraph node outside Docker Compose.',
    },
    'standalone-node-args': {
      ...LocalCommand.flags['standalone-node-args'],
      summary: 'Custom arguments to be passed to the standalone subgraph node.',
    },
  }
}
