import { Args, Command, Flags } from '@oclif/core'

import { getDefaultNodeUrl, saveDeployKey } from '../lib/config.js'
import { prompt } from '../ui/prompt.js'

export default class AuthCommand extends Command {
  static args = {
    'deploy-key': Args.string({
      description: 'ORMI deploy key (32-character hex string)',
    }),
  }

  static description = 'Set the deploy key to use when deploying to ORMI.'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> abc123def456...',
  ]

  static flags = {
    help: Flags.help({ char: 'h' }),
    node: Flags.string({
      default: getDefaultNodeUrl(),
      summary: 'ORMI deploy node URL.',
    }),
  }

  async run(): Promise<void> {
    const {
      args: { 'deploy-key': initialDeployKey },
      flags: { node },
    } = await this.parse(AuthCommand)

    // Validate initial key if provided
    if (initialDeployKey && !this.validateDeployKey(initialDeployKey)) {
      this.error(`Invalid deploy key format. Expected 32-character hex string.`)
    }

    // Prompt for deploy key if not provided or invalid
    let deployKey = initialDeployKey
    if (!deployKey) {
      const result = await prompt.text({
        message: 'What is your ORMI deploy key?',
        placeholder: '32-character hex string',
        validate: (value) => {
          if (!value.trim()) {
            return 'Deploy key is required'
          }
          if (!this.validateDeployKey(value)) {
            return 'Invalid deploy key. Expected 32-character hex string.'
          }
          return
        },
      })

      if (prompt.isCancel(result)) {
        this.exit(0)
      }
      deployKey = result
    }

    try {
      saveDeployKey(node, deployKey)
      this.log(`Deploy key saved for ${node}`)
      this.log(`Config stored at: ~/.ormi-cli.json`)
    } catch (error) {
      this.error(`Failed to save deploy key: ${(error as Error).message}`, {
        exit: 1,
      })
    }
  }

  private validateDeployKey(value: string | undefined): boolean {
    if (!value) {
      return false
    }
    return /^[0-9a-fA-F]{32}$/.test(value)
  }
}
