import { Args, Command, Flags } from '@oclif/core'

import type { AgentType } from '../../lib/types.js'

import {
  detectInstalledAgents,
  getAgentConfig,
  getAllAgentTypes,
  getSkillsDirectory,
} from '../../lib/agents.js'
import { unconfigureMcpServer } from '../../lib/mcp-config.js'
import { removeAllSkills } from '../../lib/skills.js'
import { prompt, report } from '../../ui/index.js'

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

    // Validate conflicting flags
    if (flags['mcp-only'] && flags['skills-only']) {
      report.error('Cannot use both --mcp-only and --skills-only flags')
      this.exit(1)
    }

    // Determine which agents to unconfigure
    let selectedAgents: AgentType[] = []

    if (flags.agent || args.agents) {
      // Parse provided agents
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
          report.warn(`Unknown agent: ${agent}`)
        }
      }
    } else if (flags.yes) {
      // Non-interactive mode: detect installed agents
      selectedAgents = await detectInstalledAgents()
      if (selectedAgents.length === 0) {
        report.warn('No installed agents detected')
        this.exit(0)
      }
    } else {
      // Interactive mode: let user select
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
      report.warn('No agents selected')
      this.exit(0)
    }

    // Show summary and confirm
    const removeMcp = !flags['skills-only']
    const removeSkills = !flags['mcp-only']

    report.header('Ormi AI Uninstall')
    report.plain(
      `Agents: ${selectedAgents.map((a) => getAgentConfig(a).displayName).join(', ')}`,
    )

    if (removeMcp) {
      report.plain('Will remove: MCP server configuration')
    }

    if (removeSkills) {
      report.plain(
        `Will remove: subgraph-query, subgraph-monitor, subgraph-manage skills (${flags.global ? 'global' : 'local'})`,
      )
    }

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

    // Unconfigure each agent
    const spinner = prompt.spinner()
    const results: {
      agent: string
      mcp?: { message: string; success: boolean }
      skills?: { message: string; skill: string; success: boolean }[]
    }[] = []

    for (const agentType of selectedAgents) {
      const config = getAgentConfig(agentType)
      const result: (typeof results)[number] = { agent: config.displayName }

      spinner.start(`Removing ${config.displayName} configuration...`)

      // Remove MCP configuration
      if (removeMcp && config.mcp) {
        const mcpResult = unconfigureMcpServer(
          config.mcp.configPath,
          config.mcp.configFormat,
        )
        result.mcp = {
          message: mcpResult.message,
          success: mcpResult.success,
        }
      }

      // Remove skills
      const skillsDirectory = getSkillsDirectory(config, flags.global)
      if (removeSkills && skillsDirectory) {
        const skillsResults = removeAllSkills(skillsDirectory)
        result.skills = skillsResults.map((r) => ({
          message: r.message,
          skill: r.skill,
          success: r.success,
        }))
      }

      results.push(result)
      spinner.stop(`${config.displayName} configuration removed`)
    }

    // Show results summary
    report.section('Uninstall complete')

    for (const result of results) {
      report.section(result.agent)

      if (result.mcp) {
        if (result.mcp.success) {
          report.ok('MCP', result.mcp.message)
        } else {
          report.error('MCP', result.mcp.message)
        }
      }

      if (result.skills) {
        for (const skill of result.skills) {
          if (skill.success) {
            report.ok(skill.message)
          } else {
            report.error(skill.message)
          }
        }
      }
    }

    report.command('ormi ai install')
  }
}
