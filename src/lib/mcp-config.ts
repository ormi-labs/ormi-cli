import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import type { AgentConfig } from './types.ts'

const SERVER_NAME = 'ormi'

// ============================================================================
// JSON utilities
// ============================================================================

/**
 * Append or replace a TOML server block in a file.
 */
export function appendTomlServer(
  filePath: string,
  serverName: string,
  entry: Record<string, unknown>,
): { alreadyExists: boolean } {
  const block = buildTomlServerBlock(serverName, entry)
  let existing = ''
  try {
    existing = readFileSync(filePath, 'utf8')
  } catch {
    // File doesn't exist yet
  }

  const sectionHeader = `[mcp_servers.${serverName}]`
  const alreadyExists = existing.includes(sectionHeader)

  if (alreadyExists) {
    const subPrefix = `[mcp_servers.${serverName}.`
    const startOffset = existing.indexOf(sectionHeader)
    const remainder = existing.slice(startOffset + sectionHeader.length)

    let endOffset = remainder.length
    const headerPattern = /^\[/gm
    let match
    while ((match = headerPattern.exec(remainder)) !== null) {
      const lineEnd = remainder.indexOf('\n', match.index)
      const headerLine = remainder.slice(
        match.index,
        lineEnd === -1 ? undefined : lineEnd,
      )
      if (!headerLine.startsWith(subPrefix)) {
        endOffset = match.index
        break
      }
    }

    const rawBefore = existing.slice(0, startOffset).replace(/\n+$/, '')
    const rawAfter = existing
      .slice(startOffset + sectionHeader.length + endOffset)
      .replace(/^\n+/, '')

    const before = rawBefore.length > 0 ? rawBefore + '\n\n' : ''
    const after = rawAfter.length > 0 ? '\n' + rawAfter : ''
    const content = before + block + after

    const directory = path.dirname(filePath)
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
    }
    writeFileSync(filePath, content)
  } else {
    const separator =
      existing.length > 0 && !existing.endsWith('\n')
        ? '\n\n'
        : existing.length > 0
          ? '\n'
          : ''

    const directory = path.dirname(filePath)
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
    }
    writeFileSync(filePath, existing + separator + block)
  }

  return { alreadyExists }
}

export function backupConfig(configPath: string): void {
  if (existsSync(configPath)) {
    copyFileSync(configPath, configPath + '.ormi-cli-backup')
  }
}

/**
 * Build a TOML `[mcp_servers.<name>]` block string.
 */
export function buildTomlServerBlock(
  serverName: string,
  entry: Record<string, unknown>,
): string {
  const lines: string[] = [`[mcp_servers.${serverName}]`]
  for (const [key, value] of Object.entries(entry)) {
    lines.push(`${key} = ${JSON.stringify(value)}`)
  }
  return lines.join('\n') + '\n'
}

/**
 * Configure MCP server for an agent using agent-specific config format.
 * Handles both JSON and TOML configs automatically.
 */
export function configureAgentMcp(
  agent: AgentConfig,
  scope: 'global' | 'project',
  url: string,
  serverName = SERVER_NAME,
  cwd?: string,
): { added: boolean; message: string; success: boolean; updated: boolean } {
  try {
    const candidates =
      scope === 'global' ? agent.mcp.globalPaths : agent.mcp.projectPaths
    const resolvedCandidates =
      scope === 'project'
        ? candidates.map((c) => path.join(cwd || process.cwd(), c))
        : candidates

    const configPath = resolveMcpPath(resolvedCandidates)
    const entry = agent.mcp.buildEntry(url)

    if (configPath.endsWith('.toml')) {
      const { alreadyExists } = appendTomlServer(configPath, serverName, entry)
      if (alreadyExists) {
        return {
          added: false,
          message: `Updated ${serverName} in ${configPath}`,
          success: true,
          updated: true,
        }
      }
      return {
        added: true,
        message: `Added ${serverName} to ${configPath}`,
        success: true,
        updated: false,
      }
    }

    // JSON config
    const existing = readJsonConfig(configPath)
    const { alreadyExists, config } = mergeServerEntry(
      existing,
      agent.mcp.configKey,
      serverName,
      entry,
    )
    backupConfig(configPath)
    writeJsonConfig(configPath, config)

    if (alreadyExists) {
      return {
        added: false,
        message: `Updated ${serverName} in ${configPath}`,
        success: true,
        updated: true,
      }
    }

    return {
      added: true,
      message: `Added ${serverName} to ${configPath}`,
      success: true,
      updated: false,
    }
  } catch (error) {
    return {
      added: false,
      message: `Failed to configure ${serverName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      success: false,
      updated: false,
    }
  }
}

// ============================================================================
// JSON config operations
// ============================================================================

/**
 * Merge a server entry into a config object under the given configKey.
 */
export function mergeServerEntry(
  existing: Record<string, unknown>,
  configKey: string,
  serverName: string,
  entry: Record<string, unknown>,
): { alreadyExists: boolean; config: Record<string, unknown> } {
  const section =
    (existing[configKey] as Record<string, unknown> | undefined) ?? {}
  const alreadyExists = serverName in section
  return {
    alreadyExists,
    config: {
      ...existing,
      [configKey]: { ...section, [serverName]: entry },
    },
  }
}

/**
 * Read and parse a JSON config file, stripping comments first.
 * Returns `{}` if the file does not exist or is empty.
 * Throws `SyntaxError` if the content is not valid JSON after comment stripping.
 */
export function readJsonConfig(filePath: string): Record<string, unknown> {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch {
    return {}
  }
  raw = raw.trim()
  if (!raw) {
    return {}
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return JSON.parse(stripJsonComments(raw))
}

// ============================================================================
// TOML support (Codex)
// ============================================================================

/**
 * Remove a server entry from a config object under the given configKey.
 */
export function removeServerEntry(
  existing: Record<string, unknown>,
  configKey: string,
  serverName: string,
): Record<string, unknown> {
  const section = existing[configKey] as Record<string, unknown> | undefined
  if (!section || !(serverName in section)) {
    return existing
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [serverName]: _, ...rest } = section
  return { ...existing, [configKey]: rest }
}

/**
 * Remove a TOML `[mcp_servers.<name>]` block from a file.
 */
export function removeTomlServer(
  filePath: string,
  serverName: string,
): { removed: boolean } {
  let existing: string
  try {
    existing = readFileSync(filePath, 'utf8')
  } catch {
    return { removed: false }
  }

  const sectionHeader = `[mcp_servers.${serverName}]`
  if (!existing.includes(sectionHeader)) {
    return { removed: false }
  }

  const subPrefix = `[mcp_servers.${serverName}.`
  const startOffset = existing.indexOf(sectionHeader)
  const remainder = existing.slice(startOffset + sectionHeader.length)

  let endOffset = remainder.length
  const headerPattern = /^\[/gm
  let match
  while ((match = headerPattern.exec(remainder)) !== null) {
    const lineEnd = remainder.indexOf('\n', match.index)
    const headerLine = remainder.slice(
      match.index,
      lineEnd === -1 ? undefined : lineEnd,
    )
    if (!headerLine.startsWith(subPrefix)) {
      endOffset = match.index
      break
    }
  }

  const rawBefore = existing.slice(0, startOffset).replace(/\n+$/, '')
  const rawAfter = existing
    .slice(startOffset + sectionHeader.length + endOffset)
    .replace(/^\n+/, '')

  let content = rawBefore
  if (rawBefore.length > 0 && rawAfter.length > 0) {
    content = rawBefore + '\n' + rawAfter
  } else if (rawAfter.length > 0) {
    content = rawAfter
  }

  const directory = path.dirname(filePath)
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }
  writeFileSync(filePath, content)

  return { removed: true }
}

/**
 * Return the first candidate path that exists on disk, or the first candidate
 * if none exist (so it will be created).
 */
export function resolveMcpPath(candidates: string[]): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return candidates[0]
}

// ============================================================================
// Backup
// ============================================================================

/**
 * Strip `//` and block comments from JSON text, preserving string literals.
 */
export function stripJsonComments(text: string): string {
  let result = ''
  let index = 0
  while (index < text.length) {
    if (text[index] === '"') {
      const start = index++
      while (index < text.length && text[index] !== '"') {
        if (text[index] === '\\') {
          index++
        }
        index++
      }
      result += text.slice(start, ++index)
    } else if (text[index] === '/' && text[index + 1] === '/') {
      index += 2
      while (index < text.length && text[index] !== '\n') {
        index++
      }
    } else if (text[index] === '/' && text[index + 1] === '*') {
      index += 2
      while (
        index < text.length &&
        !(text[index] === '*' && text[index + 1] === '/')
      ) {
        index++
      }
      index += 2
    } else {
      result += text[index++]
    }
  }
  return result
}

// ============================================================================
// Agent-aware high-level functions
// ============================================================================

/**
 * Remove MCP server configuration for an agent.
 * Handles both JSON and TOML configs automatically.
 */
export function unconfigureAgentMcp(
  agent: AgentConfig,
  scope: 'global' | 'project',
  serverName = SERVER_NAME,
  cwd?: string,
): { message: string; removed: boolean; success: boolean } {
  try {
    const candidates =
      scope === 'global' ? agent.mcp.globalPaths : agent.mcp.projectPaths
    const resolvedCandidates =
      scope === 'project'
        ? candidates.map((c) => path.join(cwd || process.cwd(), c))
        : candidates

    const configPath = resolveMcpPath(resolvedCandidates)

    if (!existsSync(configPath)) {
      return {
        message: `Config file not found: ${configPath}`,
        removed: false,
        success: true,
      }
    }

    if (configPath.endsWith('.toml')) {
      const { removed } = removeTomlServer(configPath, serverName)
      return {
        message: removed
          ? `Removed ${serverName} from ${configPath}`
          : `${serverName} was not configured in ${configPath}`,
        removed,
        success: true,
      }
    }

    // JSON config
    const existing = readJsonConfig(configPath)
    const section = existing[agent.mcp.configKey] as
      | Record<string, unknown>
      | undefined
    const hadServer = section !== undefined && serverName in section

    const newConfig = removeServerEntry(
      existing,
      agent.mcp.configKey,
      serverName,
    )
    backupConfig(configPath)
    writeJsonConfig(configPath, newConfig)

    return {
      message: hadServer
        ? `Removed ${serverName} from ${configPath}`
        : `${serverName} was not configured in ${configPath}`,
      removed: hadServer,
      success: true,
    }
  } catch (error) {
    return {
      message: `Failed to unconfigure MCP: ${error instanceof Error ? error.message : 'Unknown error'}`,
      removed: false,
      success: false,
    }
  }
}

/**
 * Write JSON config to file with trailing newline, creating parent directories.
 */
export function writeJsonConfig(
  filePath: string,
  config: Record<string, unknown>,
): void {
  const directory = path.dirname(filePath)
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }
  writeFileSync(filePath, JSON.stringify(config, undefined, 2) + '\n')
}
