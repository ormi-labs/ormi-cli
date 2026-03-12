import CleanCommand from '@graphprotocol/graph-cli/dist/commands/clean.js'

export default class Clean extends CleanCommand {
  static override flags: typeof CleanCommand.flags = {
    ...CleanCommand.flags,
    'build-dir': {
      ...CleanCommand.flags['build-dir'],
      summary: 'Directory where the "ormi build" code is stored.',
    },
    'codegen-dir': {
      ...CleanCommand.flags['codegen-dir'],
      summary: 'Directory where the "ormi codegen" code is stored.',
    },
  }
}
