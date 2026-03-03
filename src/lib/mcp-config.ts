import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { McpConfigFormat } from './types.ts'

const SERVER_NAME = 'subgraph-mcp'

export interface McpConfig {
  mcp?: {
    servers?: Record<string, McpServerEntry>
  }
  mcpServers?: Record<string, McpServerEntry>
}

export interface McpServerEntry {
  serverUrl?: string
  type?: string
  url?: string
}

/**
 * Add subgraph-mcp server to config (non-destructive merge)
 */
export function addMcpServer(
  config: McpConfig,
  format: McpConfigFormat,
  url: string,
): { added: boolean; config: McpConfig; updated: boolean } {
  const newEntry = generateServerEntry(format, url)
  let added = false
  let updated = false

  const result = { ...config }

  switch (format) {
    case 'claude':
    case 'windsurf': {
      const existing = result.mcpServers?.[SERVER_NAME]
      if (!existing) {
        added = true
      } else if (JSON.stringify(existing) !== JSON.stringify(newEntry)) {
        updated = true
      }

      result.mcpServers = {
        ...result.mcpServers,
        [SERVER_NAME]: newEntry,
      }
      break
    }

    case 'vscode': {
      const existing = result.mcp?.servers?.[SERVER_NAME]
      if (!existing) {
        added = true
      } else if (JSON.stringify(existing) !== JSON.stringify(newEntry)) {
        updated = true
      }

      result.mcp = {
        ...result.mcp,
        servers: {
          ...result.mcp?.servers,
          [SERVER_NAME]: newEntry,
        },
      }
      break
    }
  }

  return { added, config: result, updated }
}

/**
 * Configure MCP server for an agent
 */
export function configureMcpServer(
  configPath: string,
  format: McpConfigFormat,
  url: string,
): { added: boolean; message: string; success: boolean; updated: boolean } {
  try {
    const existingConfig = readMcpConfig(configPath)
    const {
      added,
      config: newConfig,
      updated,
    } = addMcpServer(existingConfig, format, url)
    writeMcpConfig(configPath, newConfig)

    if (added) {
      return {
        added: true,
        message: `Added ${SERVER_NAME} to ${configPath}`,
        success: true,
        updated: false,
      }
    }

    if (updated) {
      return {
        added: false,
        message: `Updated ${SERVER_NAME} in ${configPath}`,
        success: true,
        updated: true,
      }
    }

    return {
      added: false,
      message: `${SERVER_NAME} already configured in ${configPath}`,
      success: true,
      updated: false,
    }
  } catch (error) {
    return {
      added: false,
      message: `Failed to configure MCP: ${error instanceof Error ? error.message : 'Unknown error'}`,
      success: false,
      updated: false,
    }
  }
}

/**
 * Check if subgraph-mcp is already configured
 */
export function hasMcpServer(
  config: McpConfig,
  format: McpConfigFormat,
): boolean {
  switch (format) {
    case 'claude':
    case 'windsurf': {
      return Boolean(config.mcpServers?.[SERVER_NAME])
    }
    case 'vscode': {
      return Boolean(config.mcp?.servers?.[SERVER_NAME])
    }
    default: {
      return false
    }
  }
}

/**
 * Read existing MCP config file
 */
export function readMcpConfig(configPath: string): McpConfig {
  if (!existsSync(configPath)) {
    return {}
  }

  try {
    const content = readFileSync(configPath, 'utf8')
    return JSON.parse(content) as McpConfig
  } catch {
    return {}
  }
}

/**
 * Remove subgraph-mcp server from config
 */
export function removeMcpServer(
  config: McpConfig,
  format: McpConfigFormat,
): McpConfig {
  const result = { ...config }

  switch (format) {
    case 'claude':
    case 'windsurf': {
      if (result.mcpServers?.[SERVER_NAME]) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [SERVER_NAME]: _, ...rest } = result.mcpServers
        result.mcpServers = rest
      }
      break
    }

    case 'vscode': {
      if (result.mcp?.servers?.[SERVER_NAME]) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [SERVER_NAME]: _, ...rest } = result.mcp.servers
        result.mcp = {
          ...result.mcp,
          servers: rest,
        }
      }
      break
    }
  }

  return result
}

/**
 * Write MCP config file (creates parent directories if needed)
 */
export function writeMcpConfig(configPath: string, config: McpConfig): void {
  const directory = path.dirname(configPath)
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }

  writeFileSync(configPath, JSON.stringify(config, undefined, 2))
}

/**
 * Generate the MCP server entry based on config format
 */
function generateServerEntry(
  format: McpConfigFormat,
  url: string,
): McpServerEntry {
  switch (format) {
    case 'claude': {
      return { url }
    }
    case 'vscode': {
      return { type: 'http', url }
    }
    case 'windsurf': {
      return { serverUrl: url }
    }
    default: {
      return { url }
    }
  }
}
