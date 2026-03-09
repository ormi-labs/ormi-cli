import { Command } from '@oclif/core'

export default class PublishCommand extends Command {
  static description = 'Publish a subgraph to ORMI (coming soon).'

  run(): Promise<void> {
    this.error('The publish command is not yet available. Check back soon!', {
      exit: 1,
    })
  }
}
