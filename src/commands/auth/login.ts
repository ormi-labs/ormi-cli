import { Args, Command } from '@oclif/core'

import * as p from '@clack/prompts'

import { setDeployKey } from '../../lib/config.js'

export default class Login extends Command {
  static args = {
    key: Args.string({
      description: 'Deploy key to store',
      required: false,
    }),
  }

  static description = 'Store your ORMI deploy key.'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> <deploy-key>',
  ]

  async run(): Promise<void> {
    const { args } = await this.parse(Login)
    let key = args.key

    if (!key) {
      const result = await p.text({
        message: 'Enter your ORMI deploy key:',
        validate: (v) => (v.trim() ? undefined : 'Deploy key cannot be empty'),
      })

      if (p.isCancel(result)) {
        this.exit(0)
      }

      key = result
    }

    setDeployKey(key.trim())
    this.log('Deploy key stored in ~/.ormi-cli/config.json')
  }
}
