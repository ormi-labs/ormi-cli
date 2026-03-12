import NodeCommand from '@graphprotocol/graph-cli/dist/commands/node.js'

export default class Node extends NodeCommand {
  static override args: typeof NodeCommand.args = {
    ...NodeCommand.args,
    install: {
      ...NodeCommand.args.install,
      description: 'Install the subgraph node',
    },
  }

  static override description = 'Manage subgraph node related operations'

  static override examples = [
    '<%= config.bin %> node install',
    '<%= config.bin %> node install --tag v1.0.0',
    '<%= config.bin %> node install --bin-dir /usr/local/bin',
  ]

  static override flags: typeof NodeCommand.flags = {
    ...NodeCommand.flags,
    'bin-dir': {
      ...NodeCommand.flags['bin-dir'],
      summary: 'Directory to install the subgraph node binary to.',
    },
    tag: {
      ...NodeCommand.flags.tag,
      summary: 'Tag of the subgraph node release to install.',
    },
  }
}
