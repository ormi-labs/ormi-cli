import { Args, Command, Flags } from '@oclif/core'

import type { AgentType } from '../../lib/types.js'

import {
  detectInstalledAgents,
  getAgentConfig,
  getAllAgentTypes,
  getSkillsDirectory,
} from '../../lib/agents.js'
import { DEFAULT_MCP_URL } from '../../lib/constants.js'
import { configureMcpServer } from '../../lib/mcp-config.js'
import { installAllSkills } from '../../lib/skills.js'
import { verifyMcpSetup } from '../../lib/verify.js'
import { prompt, report } from '../../ui/index.js'

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

    // Validate conflicting flags
    if (flags['mcp-only'] && flags['skills-only']) {
      report.error('Cannot use both --mcp-only and --skills-only flags')
      this.exit(1)
    }

    // Determine which agents to configure
    let selectedAgents: AgentType[] = []

    if (flags.agent || args.agents) {
      // Parse provided agents
      const agentInput =
        (flags.agent ?? args.agents)
          ?.split(',')
          .map((a) => a.trim().toLowerCase()) ?? []
      const allAgents = getAllAgentTypes()

      for (const agent of agentInput) {
        // Normalize agent name (handle both 'claude-code' and 'claude code')
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

      if (installedAgents.length === 0) {
        // No agents detected, show all options
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
        // Show detected agents as pre-selected
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
      report.warn('No agents selected')
      this.exit(0)
    }

    // Show summary and confirm
    const configureMcp = !flags['skills-only']
    const installSkills = !flags['mcp-only']

    report.header('Ormi AI Install')
    report.plain(
      `Agents: ${selectedAgents.map((a) => getAgentConfig(a).displayName).join(', ')}`,
    )

    if (configureMcp) {
      report.plain(`MCP URL: ${flags.url}`)
    }

    if (installSkills) {
      report.plain(
        `Skills: subgraph-query, subgraph-monitor, subgraph-manage (${flags.global ? 'global' : 'local'})`,
      )
    }

    if (!flags.yes) {
      const confirm = await prompt.confirm({
        message: 'Proceed with installation?',
      })

      if (prompt.isCancel(confirm) || !confirm) {
        prompt.cancel('Installation cancelled')
        this.exit(0)
      }
    }

    // Configure each agent
    const spinner = prompt.spinner()
    const results: {
      agent: string
      mcp?: { message: string; success: boolean }
      skills?: { message: string; skill: string; success: boolean }[]
      verify?: { available: boolean; message: string; verified: boolean }
    }[] = []

    for (const agentType of selectedAgents) {
      const config = getAgentConfig(agentType)
      const result: (typeof results)[number] = { agent: config.displayName }

      spinner.start(`Configuring ${config.displayName}...`)

      // Configure MCP
      if (configureMcp && config.mcp) {
        const mcpResult = configureMcpServer(
          config.mcp.configPath,
          config.mcp.configFormat,
          flags.url,
        )
        result.mcp = {
          message: mcpResult.message,
          success: mcpResult.success,
        }

        // Verify with real CLI if available
        result.verify = verifyMcpSetup(agentType)
      }

      // Install skills
      const skillsDirectory = getSkillsDirectory(config, flags.global)
      if (installSkills && skillsDirectory) {
        const skillsResults = installAllSkills(skillsDirectory)
        result.skills = skillsResults.map((r) => ({
          message: r.message,
          skill: r.skill,
          success: r.success,
        }))
      }

      results.push(result)
      spinner.stop(`${config.displayName} configured`)
    }

    // Show results summary
    report.section('Installation complete')

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

      if (
        result.verify &&
        result.verify.message !== 'No CLI verification available'
      ) {
        if (result.verify.verified) {
          report.ok(result.verify.message)
        } else {
          report.warn(result.verify.message)
        }
      }
    }

    // Show next steps
    report.section('Next steps')
    report.plain('1. Restart your AI coding agent if it was running')
    report.plain(
      "2. The subgraph-mcp server will appear in your agent's MCP panel",
    )
    report.plain(
      '3. Skills are ready to use - your agent will load them automatically',
    )

    prompt.outro('Happy coding with Ormi!')
  }
}
