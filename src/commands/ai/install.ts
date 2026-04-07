import { Args, Command, Flags } from '@oclif/core'

import type { AgentConfig, AgentType } from '../../lib/types.js'

import {
  detectInstalledAgents,
  getAgentConfig,
  getAllAgentTypes,
  getMcpConfigPath,
  getSkillsDirectory,
  hasExistingInstallation,
} from '../../lib/agents.js'
import { ADMIN_MCP_URL, DEFAULT_MCP_URL } from '../../lib/constants.js'
import {
  configureAdminMcpServer,
  configureMcpServer,
} from '../../lib/mcp-config.js'
import {
  getProjectInstructionFilesForAgent,
  installProjectInstruction,
} from '../../lib/project-instructions.js'
import { BUNDLED_SKILLS, installSkill } from '../../lib/skills.js'
import { verifyMcpSetup } from '../../lib/verify.js'
import { progress, prompt } from '../../ui/index.js'

export default class Install extends Command {
  static args = {
    agents: Args.string({
      description: 'Agent(s) to configure (comma-separated)',
      required: false,
    }),
  }

  static description =
    'Install and configure AI coding agents with Ormi subgraph MCP server and skills'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --agent claude-code,cursor',
    '<%= config.bin %> <%= command.id %> -a claude-code -y',
    '<%= config.bin %> <%= command.id %> --url http://localhost:8081',
    '<%= config.bin %> <%= command.id %> --skills-only',
  ]

  static flags = {
    admin: Flags.boolean({
      default: false,
      description: 'Install admin MCP server only (hidden)',
      hidden: true,
    }),
    agent: Flags.string({
      char: 'a',
      description: 'Agent(s) to configure (comma-separated)',
      multiple: false,
    }),
    global: Flags.boolean({
      allowNo: true,
      char: 'g',
      description: 'Install skills globally (vs local to current project)',
    }),
    'mcp-only': Flags.boolean({
      default: false,
      description: 'Only configure MCP, skip skills installation',
    }),
    'skills-only': Flags.boolean({
      default: false,
      description: 'Only install skills, skip MCP configuration',
    }),
    url: Flags.string({
      char: 'u',
      default: DEFAULT_MCP_URL,
      description: 'MCP server URL',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip confirmation prompts',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Install)

    if (flags['mcp-only'] && flags['skills-only']) {
      this.error('Cannot use both --mcp-only and --skills-only flags')
    }

    // Admin mode: install only admin MCP server, no skills
    if (flags.admin) {
      return this.runAdminInstall(flags)
    }

    const selectedAgents = await this.selectAgents(
      flags.agent ?? args.agents,
      flags.yes,
    )

    // Determine global vs local installation
    const global = await this.selectInstallScope(flags.global, flags.yes)

    // Check for existing installation and prompt to overwrite
    const existingInstallation = hasExistingInstallation(selectedAgents, global)
    if (existingInstallation) {
      if (flags.yes) {
        this.log('Overwriting existing AI installation')
      } else {
        const overwrite = await prompt.confirm({
          message: 'AI integration already installed. Overwrite?',
        })

        if (prompt.isCancel(overwrite) || !overwrite) {
          prompt.cancel('Installation cancelled')
          this.exit(0)
        }
      }
    }

    // Confirm
    if (!flags.yes && !existingInstallation) {
      const confirm = await prompt.confirm({
        message: 'Proceed with installation?',
      })

      if (prompt.isCancel(confirm) || !confirm) {
        prompt.cancel('Installation cancelled')
        this.exit(0)
      }
    }

    // Execute installation
    const configureMcp = !flags['skills-only']
    const installSkills = !flags['mcp-only']

    this.log('\nInstalling Ormi AI integration...')

    for (const agentType of selectedAgents) {
      const config = getAgentConfig(agentType)
      progress.agent(config.displayName)

      // Configure MCP
      if (configureMcp) {
        this.configureMcpForAgent(
          config,
          global,
          configureMcpServer,
          flags.url,
          'MCP configured',
          'MCP configuration failed',
        )
      }

      // Install skills
      const skillsDirectory = getSkillsDirectory(config, global)
      if (installSkills && skillsDirectory) {
        for (const skillName of BUNDLED_SKILLS) {
          const result = installSkill(skillName, skillsDirectory)
          if (result.success) {
            progress.ok(`Skill installed: ${skillName}`)
          } else {
            progress.fail(`Skill failed: ${skillName}`)
            progress.info(result.message)
          }
        }
      }

      // Install project instruction files for agents that use them
      if (installSkills && !global) {
        for (const fileName of getProjectInstructionFilesForAgent(agentType)) {
          const result = installProjectInstruction(fileName)
          if (result.success) {
            progress.ok(`Project instruction ready: ${fileName}`)
          } else {
            progress.fail(`Project instruction failed: ${fileName}`)
          }
          progress.info(result.message)
        }
      }

      // Verify with CLI if available (only for global installs)
      if (configureMcp && global) {
        const verify = verifyMcpSetup(agentType)
        if (verify.message !== 'No CLI verification available') {
          if (verify.verified) {
            progress.ok(verify.message)
          } else if (verify.available) {
            progress.warn(verify.message)
          }
        }
      }
    }

    progress.success('Installation complete')

    this.log('\nNext steps')
    this.log('  1. Restart your AI coding agent if it was running')
    this.log(
      "  2. The subgraph-mcp server will appear in your agent's MCP panel",
    )
    this.log(
      '  3. Skills are ready to use - your agent will load them automatically',
    )
    this.log(
      '  4. Project instruction files were added where the selected agent uses them',
    )
  }

  private configureMcpForAgent(
    config: AgentConfig,
    global: boolean,
    configureFunction: (
      configPath: string,
      url: string,
    ) => {
      added: boolean
      message: string
      success: boolean
      updated: boolean
    },
    url: string,
    successMessage: string,
    failMessage: string,
  ): void {
    const mcpConfigPath = getMcpConfigPath(config, global)
    if (mcpConfigPath) {
      const result = configureFunction(mcpConfigPath, url)
      if (result.success) {
        progress.ok(successMessage)
        progress.info(mcpConfigPath)
      } else {
        progress.fail(failMessage)
        progress.info(result.message)
      }
    }
  }

  private async runAdminInstall(flags: {
    agent?: string
    global?: boolean
    yes: boolean
  }): Promise<void> {
    const global = await this.selectInstallScope(flags.global, flags.yes)
    const selectedAgents = await this.selectAgents(flags.agent, flags.yes)

    this.log('\nInstalling admin MCP server...')

    for (const agentType of selectedAgents) {
      const config = getAgentConfig(agentType)
      progress.agent(config.displayName)

      this.configureMcpForAgent(
        config,
        global,
        configureAdminMcpServer,
        ADMIN_MCP_URL,
        'Admin MCP configured',
        'Admin MCP configuration failed',
      )
    }

    progress.success('Admin installation complete')
  }

  private async selectAgents(
    agentInput: string | undefined,
    skipPrompts: boolean,
  ): Promise<AgentType[]> {
    let selectedAgents: AgentType[] = []

    if (agentInput) {
      const agents = agentInput.split(',').map((a) => a.trim().toLowerCase())
      const allAgents = getAllAgentTypes()

      for (const agent of agents) {
        const normalized = agent.replaceAll(/\s+/g, '-')
        if (allAgents.includes(normalized as AgentType)) {
          selectedAgents.push(normalized as AgentType)
        } else {
          this.warn(`Unknown agent: ${agent}`)
        }
      }
    } else if (skipPrompts) {
      selectedAgents = await detectInstalledAgents()
      if (selectedAgents.length === 0) {
        this.log('No installed agents detected')
        this.exit(0)
      }
    } else {
      const installedAgents = await detectInstalledAgents()

      if (installedAgents.length === 0) {
        const selections = await prompt.multiselect({
          message: 'Select agents to configure',
          options: getAllAgentTypes().map((agent) => {
            const config = getAgentConfig(agent)
            return {
              label: config.displayName,
              value: agent,
            }
          }),
          required: true,
        })

        if (prompt.isCancel(selections)) {
          prompt.cancel('Installation cancelled')
          this.exit(0)
        }

        selectedAgents = selections
      } else {
        const selections = await prompt.multiselect({
          initialValues: [],
          message: 'Select agents to configure',
          options: installedAgents.map((agent) => {
            const config = getAgentConfig(agent)
            return {
              label: config.displayName,
              value: agent,
            }
          }),
          required: true,
        })

        if (prompt.isCancel(selections)) {
          prompt.cancel('Installation cancelled')
          this.exit(0)
        }

        selectedAgents = selections
      }
    }

    if (selectedAgents.length === 0) {
      this.log('No agents selected')
      this.exit(0)
    }

    return selectedAgents
  }

  private async selectInstallScope(
    globalFlag: boolean | undefined,
    skipPrompts: boolean,
  ): Promise<boolean> {
    if (globalFlag !== undefined) {
      return globalFlag
    }

    if (skipPrompts) {
      return false
    }

    const scope = await prompt.select({
      message: 'Install location',
      options: [
        { label: 'Local (current project only)', value: false },
        { label: 'Global (available everywhere)', value: true },
      ],
    })

    if (prompt.isCancel(scope)) {
      prompt.cancel('Installation cancelled')
      this.exit(0)
    }

    return scope
  }
}
