import { Command, Flags } from '@oclif/core'

import { existsSync, readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

import type { AgentType } from '../../lib/types.js'

import { ALL_AGENT_NAMES, detectAgents, getAgent } from '../../lib/agents.js'
import { DEFAULT_MCP_URL } from '../../lib/constants.js'
import { readJsonConfig, resolveMcpPath } from '../../lib/mcp-config.js'
import {
  getProjectInstructionFilesForAgent,
  isManagedProjectInstruction,
  isProjectInstructionInstalled,
  isProjectInstructionUpToDate,
} from '../../lib/project-instructions.js'
import {
  BUNDLED_SKILLS,
  isSkillInstalled,
  isSkillUpToDate,
} from '../../lib/skills.js'
import { verifyMcpSetup } from '../../lib/verify.js'
import { prompt, report } from '../../ui/index.js'

const SERVER_NAME = 'subgraph-mcp'

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
    const scope = flags.global ? ('global' as const) : ('project' as const)
    let agentsToCheck: AgentType[]

    if (flags.agent) {
      const agentInput = flags.agent
        .split(',')
        .map((a) => a.trim().toLowerCase())
      agentsToCheck = []
      for (const agent of agentInput) {
        const normalized = agent.replaceAll(/\s+/g, '-')
        if (ALL_AGENT_NAMES.includes(normalized as AgentType)) {
          agentsToCheck.push(normalized as AgentType)
        } else {
          report.warn(`Unknown agent: ${agent}`)
        }
      }
    } else {
      agentsToCheck = await detectAgents(scope)
    }

    if (agentsToCheck.length === 0) {
      report.warn('No agents detected. Install an AI coding agent first.')
      prompt.outro('Run "ormi-cli ai install" after installing an agent.')
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
      const agent = getAgent(agentType)
      report.section(agent.displayName)

      // --- MCP config check ---
      const candidates =
        agent.mcp[scope === 'global' ? 'globalPaths' : 'projectPaths']
      const resolvedCandidates =
        scope === 'project'
          ? candidates.map((c) => path.join(process.cwd(), c))
          : candidates
      const mcpConfigPath = resolveMcpPath(resolvedCandidates)
      const configExists = existsSync(mcpConfigPath)

      if (configExists) {
        if (mcpConfigPath.endsWith('.toml')) {
          // TOML config (Codex)
          const content = readFileSync(mcpConfigPath, 'utf8')
          const sectionHeader = `[mcp_servers.${SERVER_NAME}]`
          const isConfigured = content.includes(sectionHeader)

          if (isConfigured) {
            const afterHeader = content.slice(
              content.indexOf(sectionHeader) + sectionHeader.length,
            )
            // Parse key=value pairs from the TOML section
            const tomlEntry = parseTomlSection(afterHeader)
            const formatErrors = validateMcpEntryFormat(
              agentType,
              tomlEntry,
              flags.url,
            )
            if (formatErrors.length > 0) {
              for (const error of formatErrors) {
                report.warn('MCP format issue', error)
                issueCount++
              }
            } else {
              report.ok('MCP configured with correct URL and format')
            }
          } else {
            report.error(`${SERVER_NAME} not configured`, mcpConfigPath)
            issueCount++
          }
        } else {
          // JSON config
          const config = readJsonConfig(mcpConfigPath)
          const section = config[agent.mcp.configKey] as
            | Record<string, unknown>
            | undefined
          const serverEntry = section?.[SERVER_NAME] as
            | Record<string, unknown>
            | undefined

          if (serverEntry) {
            // Validate the entry is a plain object before format checks.
            // Cast through unknown because JSON.parse can return any shape
            // even though the type says Record<string, unknown>.
            const raw = serverEntry as unknown
            if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
              report.warn(
                'MCP entry is malformed',
                `expected an object, got ${Array.isArray(raw) ? 'array' : typeof raw}`,
              )
              issueCount++
            } else {
              // Validate per-agent MCP entry format
              const formatErrors = validateMcpEntryFormat(
                agentType,
                serverEntry,
                flags.url,
              )
              if (formatErrors.length > 0) {
                for (const error of formatErrors) {
                  report.warn('MCP format issue', error)
                  issueCount++
                }
              } else {
                report.ok('MCP configured with correct URL and format')
              }
            }
          } else {
            report.error(`${SERVER_NAME} not configured`, mcpConfigPath)
            issueCount++
          }
        }

        // Check for backup file
        if (existsSync(mcpConfigPath + '.ormi-cli-backup')) {
          report.ok('backup exists', `${mcpConfigPath}.ormi-cli-backup`)
        }
      } else {
        report.error('config file not found', mcpConfigPath)
        issueCount++
      }

      // --- Skills check ---
      const rawSkillsDirectory = agent.skill.dir(scope)
      const skillsDirectory =
        scope === 'project'
          ? path.resolve(rawSkillsDirectory)
          : rawSkillsDirectory
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

      if (!flags.global) {
        for (const fileName of getProjectInstructionFilesForAgent(agentType)) {
          const installed = isProjectInstructionInstalled(fileName)
          const managed = installed
            ? isManagedProjectInstruction(fileName, agentType)
            : false
          const upToDate = installed
            ? isProjectInstructionUpToDate(fileName, agentType)
            : false

          if (!installed) {
            report.error('missing project instruction', fileName)
            issueCount++
          } else if (!managed) {
            report.warn('project instruction exists but is unmanaged', fileName)
          } else if (upToDate) {
            report.ok('project instruction up to date', fileName)
          } else {
            report.warn('project instruction outdated', fileName)
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
      report.command('ormi-cli ai install')
    }
  }
}

/**
 * Parse key=value pairs from a TOML section string into a simple object.
 * Handles string values ("..."), booleans, and numbers.
 * Exported for testing.
 */
export function parseTomlSection(sectionText: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = sectionText.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue // skip blank lines within section
    }
    if (trimmed.startsWith('[')) {
      break // stop at next section header
    }
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) {
      continue
    }
    const key = trimmed.slice(0, eqIndex).trim()
    const rawValue = trimmed.slice(eqIndex + 1).trim()
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      result[key] = rawValue.slice(1, -1)
    } else if (rawValue === 'true') {
      result[key] = true
    } else if (rawValue === 'false') {
      result[key] = false
    } else {
      const number_ = Number(rawValue)
      result[key] = Number.isNaN(number_) ? rawValue : number_
    }
  }
  return result
}

/**
 * Validate that the MCP entry matches the exact format expected by each agent.
 * Returns an array of error messages (empty if valid).
 * Exported for testing.
 */
export function validateMcpEntryFormat(
  agentType: AgentType,
  entry: Record<string, unknown>,
  expectedUrl: string,
): string[] {
  const errors: string[] = []

  switch (agentType) {
    case 'claude-code': {
      if (entry.type !== 'http') {
        errors.push(`expected type "http", got ${JSON.stringify(entry.type)}`)
      }
      if (entry.url !== expectedUrl) {
        errors.push(
          `expected url "${expectedUrl}", got ${JSON.stringify(entry.url)}`,
        )
      }
      break
    }
    case 'codex': {
      if (entry.type !== 'http') {
        errors.push(`expected type "http", got ${JSON.stringify(entry.type)}`)
      }
      if (entry.url !== expectedUrl) {
        errors.push(
          `expected url "${expectedUrl}", got ${JSON.stringify(entry.url)}`,
        )
      }
      break
    }
    case 'cursor': {
      if ('type' in entry) {
        errors.push(
          `cursor entries must not have "type" field, found ${JSON.stringify(entry.type)}`,
        )
      }
      if (entry.url !== expectedUrl) {
        errors.push(
          `expected url "${expectedUrl}", got ${JSON.stringify(entry.url)}`,
        )
      }
      break
    }
    case 'gemini-cli': {
      if ('url' in entry) {
        errors.push(`gemini-cli entries must use "httpUrl" not "url"`)
      }
      if (entry.httpUrl !== expectedUrl) {
        errors.push(
          `expected httpUrl "${expectedUrl}", got ${JSON.stringify(entry.httpUrl)}`,
        )
      }
      break
    }
    case 'opencode': {
      if (entry.type !== 'remote') {
        errors.push(`expected type "remote", got ${JSON.stringify(entry.type)}`)
      }
      if (entry.enabled !== true) {
        errors.push(
          `expected enabled true, got ${JSON.stringify(entry.enabled)}`,
        )
      }
      if (entry.url !== expectedUrl) {
        errors.push(
          `expected url "${expectedUrl}", got ${JSON.stringify(entry.url)}`,
        )
      }
      break
    }
  }

  return errors
}
