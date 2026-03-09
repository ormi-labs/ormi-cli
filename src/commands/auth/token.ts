import { Command } from '@oclif/core'

import { getDeployKey } from '../../lib/config.js'

export default class Token extends Command {
  static description = 'Print stored ORMI deploy key.'

  static examples = ['<%= config.bin %> <%= command.id %>']

  run(): Promise<void> {
    const key = getDeployKey()

    if (!key) {
      this.error('No deploy key stored. Run `ormi auth login` to set one.', {
        exit: 1,
      })
    }

    this.log(key)
    return Promise.resolve()
  }
}
