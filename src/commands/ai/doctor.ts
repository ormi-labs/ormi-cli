import { Command, Flags } from '@oclif/core'

import { existsSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'

import type { AgentType } from '../../lib/types.js'

import {
  detectInstalledAgents,
  getAgentConfig,
  getAllAgentTypes,
  getMcpConfigPath,
  getSkillsDirectory,
} from '../../lib/agents.js'
import { DEFAULT_MCP_URL } from '../../lib/constants.js'
import {
  getMcpServerUrl,
  hasMcpServer,
  readMcpConfig,
} from '../../lib/mcp-config.js'
import {
  BUNDLED_SKILLS,
  isSkillInstalled,
  isSkillUpToDate,
} from '../../lib/skills.js'
import { verifyMcpSetup } from '../../lib/verify.js'
import { prompt, report } from '../../ui/index.js'

export default class Doctor extends Command {
  static description = 'Run diagnostics on AI coding agent configuration'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --agent claude-code',
    '<%= config.bin %> <%= command.id %> --agent claude-code --global',
    '<%= config.bin %> <%= command.id %> --url http://localhost:8081',
  ]

  static flags = {
    agent: Flags.string({
      char: 'a',
      description:
        'Agent to diagnose (comma-separated, defaults to all detected)',
      multiple: false,
    }),
    global: Flags.boolean({
      char: 'g',
      default: false,
      description: 'Check skills in global installation',
    }),
    url: Flags.string({
      char: 'u',
      default: DEFAULT_MCP_URL,
      description: 'Expected MCP server URL',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Doctor)

    // 1. Determine which agents to check
    let agentsToCheck: AgentType[]

    if (flags.agent) {
      const agentInput = flags.agent
        .split(',')
        .map((a) => a.trim().toLowerCase())
      const allAgents = getAllAgentTypes()
      agentsToCheck = []
      for (const agent of agentInput) {
        const normalized = agent.replaceAll(/\s+/g, '-')
        if (allAgents.includes(normalized as AgentType)) {
          agentsToCheck.push(normalized as AgentType)
        } else {
          report.warn(`Unknown agent: ${agent}`)
        }
      }
    } else {
      agentsToCheck = await detectInstalledAgents()
    }

    if (agentsToCheck.length === 0) {
      report.warn('No agents detected. Install an AI coding agent first.')
      prompt.outro('Run "ormi ai install" after installing an agent.')
      return
    }

    // Header
    report.header('Ormi AI Doctor — Diagnostic Report')
    report.plain(`Checking ${String(agentsToCheck.length)} agent(s)...`)

    let issueCount = 0

    // 2. Check MCP connectivity once
    const mcpReachable = await new Promise<boolean>((resolve) => {
      try {
        const parsedUrl = new URL(flags.url)
        const requester = parsedUrl.protocol === 'https:' ? https : http
        const request = requester.get(
          flags.url,
          { timeout: 5000 },
          (response) => {
            resolve(
              response.statusCode !== undefined && response.statusCode < 500,
            )
            response.resume()
          },
        )
        request.on('error', () => {
          resolve(false)
        })
        request.on('timeout', () => {
          request.destroy()
          resolve(false)
        })
      } catch {
        resolve(false)
      }
    })

    report.section('MCP server')
    if (mcpReachable) {
      report.ok('reachable', flags.url)
    } else {
      report.warn('unreachable', flags.url)
      issueCount++
    }

    // 3. Per-agent checks
    for (const agentType of agentsToCheck) {
      const config = getAgentConfig(agentType)
      report.section(config.displayName)

      // --- MCP config check ---
      if (config.mcp) {
        const mcpConfigPath = getMcpConfigPath(config, flags.global)
        if (mcpConfigPath) {
          const configExists = existsSync(mcpConfigPath)

          if (configExists) {
            const mcpConfig = readMcpConfig(mcpConfigPath)
            const isConfigured = hasMcpServer(
              mcpConfig,
              config.mcp.configFormat,
            )

            if (isConfigured) {
              const configuredUrl = getMcpServerUrl(
                mcpConfig,
                config.mcp.configFormat,
              )
              if (configuredUrl === flags.url) {
                report.ok('MCP configured with correct URL')
              } else {
                report.warn(
                  'MCP configured but URL mismatch',
                  `got ${configuredUrl ?? 'unknown'}, expected ${flags.url}`,
                )
                issueCount++
              }
            } else {
              report.error('subgraph-mcp not configured', mcpConfigPath)
              issueCount++
            }

            // Check for backup file
            if (existsSync(mcpConfigPath + '.ormi-backup')) {
              report.ok('backup exists', `${mcpConfigPath}.ormi-backup`)
            }
          } else {
            report.error('config file not found', mcpConfigPath)
            issueCount++
          }
        }
      }

      // --- Skills check ---
      const skillsDirectory = getSkillsDirectory(config, flags.global)
      if (skillsDirectory) {
        report.plain(`  Skills directory: ${skillsDirectory}`)
        for (const skill of BUNDLED_SKILLS) {
          const installed = isSkillInstalled(skill, skillsDirectory)
          const upToDate = installed
            ? isSkillUpToDate(skill, skillsDirectory)
            : false

          if (!installed) {
            report.error('missing skill', skill)
            issueCount++
          } else if (upToDate) {
            report.ok('skill up to date', skill)
          } else {
            report.warn('skill outdated', skill)
            issueCount++
          }
        }
      }

      // --- CLI verification ---
      const verifyResult = verifyMcpSetup(agentType)
      if (verifyResult.message !== 'No CLI verification available') {
        if (verifyResult.verified) {
          report.ok(verifyResult.message)
        } else if (verifyResult.available) {
          report.warn(verifyResult.message)
          issueCount++
        } else {
          report.info(verifyResult.message)
        }
      }
    }

    // 4. Summary
    report.summary(agentsToCheck.length, issueCount)

    if (issueCount > 0) {
      report.command('ormi ai install')
    }
  }
}
