import { Args, Command, Flags } from '@oclif/core'

import * as p from '@clack/prompts'

import type { AgentType } from '../lib/types.js'

import {
  detectInstalledAgents,
  getAgentConfig,
  getAllAgentTypes,
} from '../lib/agents.js'
import { configureMcpServer } from '../lib/mcp-config.js'
import { installAllSkills } from '../lib/skills.js'

const DEFAULT_MCP_URL = 'https://mcp.subgraph.ormilabs.com'

export default class Setup extends Command {
  static args = {
    agents: Args.string({
      description: 'Agent(s) to configure (comma-separated)',
      required: false,
    }),
  }

  static description =
    'Configure AI coding agents with Ormi subgraph MCP server and skills'

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
      default: true,
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
    const { args, flags } = await this.parse(Setup)

    p.intro('Welcome to Ormi CLI Setup')

    // Validate conflicting flags
    if (flags['mcp-only'] && flags['skills-only']) {
      p.outro('Error: Cannot use both --mcp-only and --skills-only flags')
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
          p.log.warn(`Unknown agent: ${agent}`)
        }
      }
    } else if (flags.yes) {
      // Non-interactive mode: detect installed agents
      selectedAgents = await detectInstalledAgents()
      if (selectedAgents.length === 0) {
        p.outro('No installed agents detected')
        this.exit(0)
      }
    } else {
      // Interactive mode: let user select
      const installedAgents = await detectInstalledAgents()

      if (installedAgents.length === 0) {
        // No agents detected, show all options
        const allAgents = getAllAgentTypes()
        const selections = await p.multiselect({
          message: 'Select agents to configure',
          options: allAgents.map((agent) => ({
            label: getAgentConfig(agent).displayName,
            value: agent,
          })),
          required: true,
        })

        if (p.isCancel(selections)) {
          p.cancel('Setup cancelled')
          this.exit(0)
        }

        selectedAgents = selections
      } else {
        // Show detected agents as pre-selected
        const selections = await p.multiselect({
          initialValues: installedAgents,
          message: 'Select agents to configure (detected agents pre-selected)',
          options: getAllAgentTypes().map((agent) => ({
            label: `${getAgentConfig(agent).displayName}${installedAgents.includes(agent) ? ' (detected)' : ''}`,
            value: agent,
          })),
          required: true,
        })

        if (p.isCancel(selections)) {
          p.cancel('Setup cancelled')
          this.exit(0)
        }

        selectedAgents = selections
      }
    }

    if (selectedAgents.length === 0) {
      p.outro('No agents selected')
      this.exit(0)
    }

    // Show summary and confirm
    const configureMcp = !flags['skills-only']
    const installSkills = !flags['mcp-only']

    p.log.info(
      `Agents to configure: ${selectedAgents.map((a) => getAgentConfig(a).displayName).join(', ')}`,
    )

    if (configureMcp) {
      p.log.info(`MCP URL: ${flags.url}`)
    }

    if (installSkills) {
      p.log.info(
        'Skills to install: subgraph-query, subgraph-monitor, subgraph-manage',
      )
    }

    if (!flags.yes) {
      const confirm = await p.confirm({
        message: 'Proceed with setup?',
      })

      if (p.isCancel(confirm) || !confirm) {
        p.cancel('Setup cancelled')
        this.exit(0)
      }
    }

    // Configure each agent
    const spinner = p.spinner()
    const results: {
      agent: string
      mcp?: { message: string; success: boolean }
      skills?: { message: string; skill: string; success: boolean }[]
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
      }

      // Install skills
      if (installSkills && config.globalSkillsDir) {
        const skillsResults = installAllSkills(config.globalSkillsDir)
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
    p.log.success('\nSetup complete!\n')

    for (const result of results) {
      p.log.info(`${result.agent}:`)

      if (result.mcp) {
        const icon = result.mcp.success ? '✓' : '✗'
        p.log.info(`  ${icon} MCP: ${result.mcp.message}`)
      }

      if (result.skills) {
        for (const skill of result.skills) {
          const icon = skill.success ? '✓' : '✗'
          p.log.info(`  ${icon} ${skill.message}`)
        }
      }
    }

    // Show next steps
    p.log.info('\nNext steps:')
    p.log.info('1. Restart your AI coding agent if it was running')
    p.log.info(
      "2. The subgraph-mcp server will appear in your agent's MCP panel",
    )
    p.log.info(
      '3. Skills are ready to use - your agent will load them automatically',
    )

    p.outro('Happy coding with Ormi!')
  }
}
