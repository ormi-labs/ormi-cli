import { Args, Command, Flags } from '@oclif/core'

import type { AgentType } from '../../lib/types.js'

import {
  detectInstalledAgents,
  getAgentConfig,
  getAllAgentTypes,
  getMcpConfigPath,
  getSkillsDirectory,
} from '../../lib/agents.js'
import { DEFAULT_MCP_URL } from '../../lib/constants.js'
import { configureMcpServer } from '../../lib/mcp-config.js'
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
    agent: Flags.string({
      char: 'a',
      description: 'Agent(s) to configure (comma-separated)',
      multiple: false,
    }),
    global: Flags.boolean({
      char: 'g',
      default: false,
      description: 'Install skills globally',
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

    // Determine which agents to configure
    let selectedAgents: AgentType[] = []

    if (flags.agent || args.agents) {
      const agentInput =
        (flags.agent ?? args.agents)
          ?.split(',')
          .map((a) => a.trim().toLowerCase()) ?? []
      const allAgents = getAllAgentTypes()

      for (const agent of agentInput) {
        const normalized = agent.replaceAll(/\s+/g, '-')
        if (allAgents.includes(normalized as AgentType)) {
          selectedAgents.push(normalized as AgentType)
        } else {
          this.warn(`Unknown agent: ${agent}`)
        }
      }
    } else if (flags.yes) {
      selectedAgents = await detectInstalledAgents()
      if (selectedAgents.length === 0) {
        this.log('No installed agents detected')
        this.exit(0)
      }
    } else {
      const installedAgents = await detectInstalledAgents()

      if (installedAgents.length === 0) {
        const allAgents = getAllAgentTypes()
        const selections = await prompt.multiselect({
          message: 'Select agents to configure',
          options: allAgents.map((agent) => ({
            label: getAgentConfig(agent).displayName,
            value: agent,
          })),
          required: true,
        })

        if (prompt.isCancel(selections)) {
          prompt.cancel('Installation cancelled')
          this.exit(0)
        }

        selectedAgents = selections
      } else {
        const selections = await prompt.multiselect({
          initialValues: installedAgents,
          message: 'Select agents to configure (detected agents pre-selected)',
          options: getAllAgentTypes().map((agent) => ({
            label: `${getAgentConfig(agent).displayName}${installedAgents.includes(agent) ? ' (detected)' : ''}`,
            value: agent,
          })),
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

    // Confirm
    if (!flags.yes) {
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
      if (configureMcp && config.mcp) {
        const mcpConfigPath = getMcpConfigPath(config, flags.global)
        if (mcpConfigPath) {
          const result = configureMcpServer(
            mcpConfigPath,
            flags.url,
          )
          if (result.success) {
            progress.ok('MCP configured')
            progress.info(mcpConfigPath)
          } else {
            progress.fail('MCP configuration failed')
            progress.info(result.message)
          }
        }
      }

      // Install skills
      const skillsDirectory = getSkillsDirectory(config, flags.global)
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
      if (installSkills && !flags.global) {
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
      if (configureMcp && flags.global) {
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
}
