import { Args, Command, Flags } from '@oclif/core'

import type { AgentType } from '../../lib/types.js'

import {
  detectInstalledAgents,
  getAgentConfig,
  getAllAgentTypes,
  getMcpConfigPath,
  getSkillsDirectory,
} from '../../lib/agents.js'
import { unconfigureMcpServer } from '../../lib/mcp-config.js'
import {
  getProjectInstructionFilesForAgent,
  removeProjectInstruction,
} from '../../lib/project-instructions.js'
import { BUNDLED_SKILLS, removeSkill } from '../../lib/skills.js'
import { progress, prompt } from '../../ui/index.js'

export default class Uninstall extends Command {
  static args = {
    agents: Args.string({
      description: 'Agent(s) to unconfigure (comma-separated)',
      required: false,
    }),
  }

  static description =
    'Remove Ormi subgraph MCP server and skills from AI coding agents'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --agent claude-code,cursor',
    '<%= config.bin %> <%= command.id %> -a claude-code -y',
    '<%= config.bin %> <%= command.id %> --mcp-only',
    '<%= config.bin %> <%= command.id %> --skills-only',
    '<%= config.bin %> <%= command.id %> --skills-only --global',
  ]

  static flags = {
    agent: Flags.string({
      char: 'a',
      description: 'Agent(s) to unconfigure (comma-separated)',
      multiple: false,
    }),
    global: Flags.boolean({
      char: 'g',
      default: false,
      description: 'Remove skills from global installation',
    }),
    'mcp-only': Flags.boolean({
      default: false,
      description: 'Only remove MCP configuration, keep skills',
    }),
    'skills-only': Flags.boolean({
      default: false,
      description: 'Only remove skills, keep MCP configuration',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip confirmation prompts',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Uninstall)

    if (flags['mcp-only'] && flags['skills-only']) {
      this.error('Cannot use both --mcp-only and --skills-only flags')
    }

    // Determine which agents to unconfigure
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
      const allAgents = getAllAgentTypes()

      const selections = await prompt.multiselect({
        initialValues: installedAgents,
        message: 'Select agents to unconfigure',
        options: allAgents.map((agent) => ({
          label: `${getAgentConfig(agent).displayName}${installedAgents.includes(agent) ? ' (detected)' : ''}`,
          value: agent,
        })),
        required: true,
      })

      if (prompt.isCancel(selections)) {
        prompt.cancel('Uninstall cancelled')
        this.exit(0)
      }

      selectedAgents = selections
    }

    if (selectedAgents.length === 0) {
      this.log('No agents selected')
      this.exit(0)
    }

    // Confirm
    if (!flags.yes) {
      const confirm = await prompt.confirm({
        message:
          'Proceed with uninstall? This will remove Ormi configuration from the selected agents.',
      })

      if (prompt.isCancel(confirm) || !confirm) {
        prompt.cancel('Uninstall cancelled')
        this.exit(0)
      }
    }

    // Execute uninstall
    const removeMcp = !flags['skills-only']
    const removeSkills = !flags['mcp-only']

    this.log('\nRemoving Ormi AI integration...')

    for (const agentType of selectedAgents) {
      const config = getAgentConfig(agentType)
      progress.agent(config.displayName)

      // Remove MCP configuration
      if (removeMcp && config.mcp) {
        const mcpConfigPath = getMcpConfigPath(config, flags.global)
        if (mcpConfigPath) {
          const result = unconfigureMcpServer(
            mcpConfigPath,
            config.mcp.configFormat,
          )
          if (result.success) {
            progress.ok('MCP configuration removed')
            progress.info(mcpConfigPath)
          } else {
            progress.fail('MCP removal failed')
            progress.info(result.message)
          }
        }
      }

      // Remove skills
      const skillsDirectory = getSkillsDirectory(config, flags.global)
      if (removeSkills && skillsDirectory) {
        for (const skillName of BUNDLED_SKILLS) {
          const result = removeSkill(skillName, skillsDirectory)
          if (result.success) {
            progress.ok(`Skill removed: ${skillName}`)
          } else {
            progress.fail(`Skill removal failed: ${skillName}`)
            progress.info(result.message)
          }
        }
      }

      if (removeSkills && !flags.global) {
        for (const fileName of getProjectInstructionFilesForAgent(agentType)) {
          const result = removeProjectInstruction(fileName)
          if (result.success) {
            progress.ok(`Project instruction handled: ${fileName}`)
          } else {
            progress.fail(`Project instruction removal failed: ${fileName}`)
          }
          progress.info(result.message)
        }
      }
    }

    progress.success('Uninstall complete')

    this.log('\nTo reinstall, run:')
    this.log('  ormi ai install')
  }
}
