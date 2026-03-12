import CleanCommand from '@graphprotocol/graph-cli/dist/commands/clean.js'

export default class Clean extends CleanCommand {
  static override flags: typeof CleanCommand.flags = {
    ...CleanCommand.flags,
    'build-dir': {
      ...CleanCommand.flags['build-dir'],
      summary: 'Directory where the "ormi-cli build" code is stored.',
    },
    'codegen-dir': {
      ...CleanCommand.flags['codegen-dir'],
      summary: 'Directory where the "ormi-cli codegen" code is stored.',
    },
  }
}
