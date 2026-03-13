import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

const SERVER_NAME = 'subgraph-mcp'

export interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>
}

export interface McpServerEntry {
  type: string
  url: string
}

/**
 * Add subgraph-mcp server to config (non-destructive merge)
 */
export function addMcpServer(
  config: McpConfig,
  url: string,
): { added: boolean; config: McpConfig; updated: boolean } {
  const newEntry: McpServerEntry = { type: 'http', url }
  let added = false
  let updated = false

  const result = { ...config }

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

  return { added, config: result, updated }
}

/**
 * Create a backup of a config file before modifying it
 */
export function backupConfig(configPath: string): void {
  if (existsSync(configPath)) {
    copyFileSync(configPath, configPath + '.ormi-cli-backup')
  }
}

/**
 * Configure MCP server for an agent
 */
export function configureMcpServer(
  configPath: string,
  url: string,
): { added: boolean; message: string; success: boolean; updated: boolean } {
  try {
    const existingConfig = readMcpConfig(configPath)
    const {
      added,
      config: newConfig,
      updated,
    } = addMcpServer(existingConfig, url)
    backupConfig(configPath)
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
 * Extract the configured URL for the subgraph-mcp server from a config object
 */
export function getMcpServerUrl(
  config: McpConfig,
): string | undefined {
  return config.mcpServers?.[SERVER_NAME]?.url
}

/**
 * Check if subgraph-mcp is already configured
 */
export function hasMcpServer(
  config: McpConfig,
): boolean {
  return Boolean(config.mcpServers?.[SERVER_NAME])
}

/**
 * Read existing MCP config file.
 * Throws SyntaxError when the file exists but contains invalid JSON —
 * callers must not write back to disk in that case.
 */
export function readMcpConfig(configPath: string): McpConfig {
  if (!existsSync(configPath)) {
    return {}
  }

  const content = readFileSync(configPath, 'utf8')
  return JSON.parse(content) as McpConfig
}

/**
 * Remove subgraph-mcp server from config
 */
export function removeMcpServer(
  config: McpConfig,
): McpConfig {
  const result = { ...config }
  if (result.mcpServers?.[SERVER_NAME]) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [SERVER_NAME]: _, ...rest } = result.mcpServers
    result.mcpServers = rest
  }
  return result
}

/**
 * Remove subgraph-mcp server from a config file on disk
 */
export function unconfigureMcpServer(
  configPath: string,
): { message: string; removed: boolean; success: boolean } {
  try {
    if (!existsSync(configPath)) {
      return {
        message: `Config file not found: ${configPath}`,
        removed: false,
        success: true,
      }
    }

    const existingConfig = readMcpConfig(configPath)
    const hadServer = hasMcpServer(existingConfig)
    const newConfig = removeMcpServer(existingConfig)
    backupConfig(configPath)
    writeMcpConfig(configPath, newConfig)

    return {
      message: hadServer
        ? `Removed ${SERVER_NAME} from ${configPath}`
        : `${SERVER_NAME} was not configured in ${configPath}`,
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
 * Write MCP config file (creates parent directories if needed)
 */
export function writeMcpConfig(configPath: string, config: McpConfig): void {
  const directory = path.dirname(configPath)
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }

  writeFileSync(configPath, JSON.stringify(config, undefined, 2))
}
