import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import path from 'node:path'

import type { AgentConfig, AgentType, McpConfigFormat } from './types.ts'

const home = homedir()
const isMac = platform() === 'darwin'
const isWindows = platform() === 'win32'
const isLinux = platform() === 'linux'

// Platform-specific application support paths
const appSupport = isMac
  ? path.join(home, 'Library', 'Application Support')
  : ''
const appData = isWindows
  ? process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
  : ''
const configHome = isLinux
  ? process.env.XDG_CONFIG_HOME || path.join(home, '.config')
  : ''

// Claude Code config dir (respects CLAUDE_CONFIG_DIR env var)
const claudeHome =
  process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(home, '.claude')

// Codex config dir (respects CODEX_HOME env var)
const codexHome = process.env.CODEX_HOME?.trim() || path.join(home, '.codex')

/**
 * Get the Claude Desktop config path based on platform
 */
function getClaudeDesktopConfigPath(): string {
  if (isMac) {
    return path.join(appSupport, 'Claude', 'claude_desktop_config.json')
  }
  if (isWindows) {
    return path.join(appData, 'Claude', 'claude_desktop_config.json')
  }
  // Linux
  return path.join(configHome, 'Claude', 'claude_desktop_config.json')
}

/**
 * Get the VS Code user settings path based on platform
 */
function getVscodeConfigPath(): string {
  if (isMac) {
    return path.join(appSupport, 'Code', 'User', 'mcp.json')
  }
  if (isWindows) {
    return path.join(appData, 'Code', 'User', 'mcp.json')
  }
  // Linux
  return path.join(configHome, 'Code', 'User', 'mcp.json')
}

/**
 * Get the Windsurf mcp_config.json path
 */
function getWindsurfConfigPath(): string {
  if (isWindows) {
    return path.join(home, '.codeium', 'windsurf', 'mcp_config.json')
  }
  return path.join(home, '.codeium', 'windsurf', 'mcp_config.json')
}

/**
 * MCP config formats
 */
const mcpConfigs = {
  antigravity: {
    configFormat: 'windsurf' as McpConfigFormat,
    configPath: path.join(home, '.gemini', 'antigravity', 'mcp_config.json'),
  },
  'claude-code': {
    configFormat: 'claude' as McpConfigFormat,
    configPath: path.join(claudeHome, 'settings.json'), // Claude Code uses settings.json for MCP
  },
  'claude-desktop': {
    configFormat: 'claude' as McpConfigFormat,
    configPath: getClaudeDesktopConfigPath(),
  },
  cursor: {
    configFormat: 'claude' as McpConfigFormat,
    configPath: path.join(home, '.cursor', 'mcp.json'),
  },
  'gemini-cli': {
    configFormat: 'claude' as McpConfigFormat,
    configPath: path.join(home, '.gemini', 'settings.json'),
  },
  kiro: {
    configFormat: 'claude' as McpConfigFormat,
    configPath: path.join(home, '.kiro', 'settings', 'mcp.json'),
  },
  'vscode-copilot': {
    configFormat: 'vscode' as McpConfigFormat,
    configPath: getVscodeConfigPath(),
  },
  windsurf: {
    configFormat: 'windsurf' as McpConfigFormat,
    configPath: getWindsurfConfigPath(),
  },
}

export const agents: Record<AgentType, AgentConfig> = {
  antigravity: {
    detectInstalled: () =>
      Promise.resolve(existsSync(path.join(home, '.gemini', 'antigravity'))),
    displayName: 'Antigravity',
    globalSkillsDir: path.join(home, '.gemini', 'antigravity', 'skills'),
    mcp: mcpConfigs.antigravity,
    name: 'antigravity',
    skillsDir: '.gemini/antigravity/skills',
  },
  'claude-code': {
    detectInstalled: () => Promise.resolve(existsSync(claudeHome)),
    displayName: 'Claude Code',
    globalSkillsDir: path.join(claudeHome, 'skills'),
    mcp: mcpConfigs['claude-code'],
    name: 'claude-code',
    skillsDir: '.claude/skills',
  },
  'claude-desktop': {
    detectInstalled: () => {
      if (isMac) {
        return Promise.resolve(existsSync(path.join(appSupport, 'Claude')))
      }
      if (isWindows) {
        return Promise.resolve(existsSync(path.join(appData, 'Claude')))
      }
      return Promise.resolve(existsSync(path.join(configHome, 'Claude')))
    },
    displayName: 'Claude Desktop',
    globalSkillsDir: '', // No global skills dir
    mcp: mcpConfigs['claude-desktop'],
    name: 'claude-desktop',
    skillsDir: '', // Claude Desktop doesn't support skills
  },
  cline: {
    // Cline doesn't have standard MCP config path
    detectInstalled: () =>
      Promise.resolve(existsSync(path.join(home, '.cline'))),
    displayName: 'Cline',
    globalSkillsDir: path.join(home, '.cline', 'skills'),
    name: 'cline',
    skillsDir: '.cline/skills',
  },
  codex: {
    // Codex doesn't have MCP support yet
    detectInstalled: () => Promise.resolve(existsSync(codexHome)),
    displayName: 'Codex',
    globalSkillsDir: path.join(codexHome, 'skills'),
    name: 'codex',
    skillsDir: '.codex/skills',
  },
  continue: {
    // Continue doesn't have standard MCP config path
    detectInstalled: () =>
      Promise.resolve(existsSync(path.join(home, '.continue'))),
    displayName: 'Continue',
    globalSkillsDir: path.join(home, '.continue', 'skills'),
    name: 'continue',
    skillsDir: '.continue/skills',
  },
  cursor: {
    detectInstalled: () =>
      Promise.resolve(existsSync(path.join(home, '.cursor'))),
    displayName: 'Cursor',
    globalSkillsDir: path.join(home, '.cursor', 'skills'),
    mcp: mcpConfigs.cursor,
    name: 'cursor',
    skillsDir: '.cursor/skills',
  },
  'gemini-cli': {
    detectInstalled: () =>
      Promise.resolve(existsSync(path.join(home, '.gemini'))),
    displayName: 'Gemini CLI',
    globalSkillsDir: path.join(home, '.gemini', 'skills'),
    mcp: mcpConfigs['gemini-cli'],
    name: 'gemini-cli',
    skillsDir: '.gemini/skills',
  },
  kilo: {
    // Kilo doesn't have standard MCP config path
    detectInstalled: () =>
      Promise.resolve(existsSync(path.join(home, '.kilocode'))),
    displayName: 'Kilo Code',
    globalSkillsDir: path.join(home, '.kilocode', 'skills'),
    name: 'kilo',
    skillsDir: '.kilocode/skills',
  },
  kiro: {
    detectInstalled: () =>
      Promise.resolve(existsSync(path.join(home, '.kiro'))),
    displayName: 'Kiro',
    globalSkillsDir: '',
    mcp: mcpConfigs.kiro,
    name: 'kiro',
    skillsDir: '', // Kiro doesn't support skills
  },
  opencode: {
    // OpenCode doesn't have standard MCP config path
    detectInstalled: () =>
      Promise.resolve(
        existsSync(
          path.join(configHome || path.join(home, '.config'), 'opencode'),
        ),
      ),
    displayName: 'OpenCode',
    globalSkillsDir: path.join(
      configHome || path.join(home, '.config'),
      'opencode',
      'skills',
    ),
    name: 'opencode',
    skillsDir: '.opencode/skills',
  },
  roo: {
    // Roo doesn't have standard MCP config path
    detectInstalled: () => Promise.resolve(existsSync(path.join(home, '.roo'))),
    displayName: 'Roo Code',
    globalSkillsDir: path.join(home, '.roo', 'skills'),
    name: 'roo',
    skillsDir: '.roo/skills',
  },
  'vscode-copilot': {
    detectInstalled: () =>
      Promise.resolve(existsSync(path.join(home, '.vscode'))),
    displayName: 'VS Code / Copilot',
    globalSkillsDir: path.join(home, '.copilot', 'skills'),
    mcp: mcpConfigs['vscode-copilot'],
    name: 'vscode-copilot',
    skillsDir: '.copilot/skills',
  },
  windsurf: {
    detectInstalled: () =>
      Promise.resolve(existsSync(path.join(home, '.codeium', 'windsurf'))),
    displayName: 'Windsurf',
    globalSkillsDir: path.join(home, '.codeium', 'windsurf', 'skills'),
    mcp: mcpConfigs.windsurf,
    name: 'windsurf',
    skillsDir: '.windsurf/skills',
  },
}

/**
 * Detect which agents are installed on the system
 */
export async function detectInstalledAgents(): Promise<AgentType[]> {
  const results = await Promise.all(
    Object.entries(agents).map(async ([type, config]) => ({
      installed: await config.detectInstalled(),
      type: type as AgentType,
    })),
  )
  return results.filter((r) => r.installed).map((r) => r.type)
}

/**
 * Get config for a specific agent
 */
export function getAgentConfig(type: AgentType): AgentConfig {
  return agents[type]
}

/**
 * Get all agent types
 */
export function getAllAgentTypes(): AgentType[] {
  return Object.keys(agents) as AgentType[]
}

/**
 * Get agents that support MCP configuration
 */
export function getMcpCapableAgents(): AgentType[] {
  return (Object.entries(agents) as [AgentType, AgentConfig][])
    .filter(([, config]) => config.mcp !== undefined)
    .map(([type]) => type)
}

/**
 * Get agents that support skills installation
 */
export function getSkillsCapableAgents(): AgentType[] {
  return (Object.entries(agents) as [AgentType, AgentConfig][])
    .filter(([, config]) => config.globalSkillsDir !== '')
    .map(([type]) => type)
}

/**
 * Get the skills directory for an agent, based on global vs local scope.
 * Returns '' for agents without skills support (e.g. claude-desktop, kiro).
 */
export function getSkillsDirectory(
  config: AgentConfig,
  global: boolean,
  cwd?: string,
): string {
  if (global) {
    return config.globalSkillsDir
  }
  if (!config.skillsDir) {
    return ''
  }
  return path.join(cwd || process.cwd(), config.skillsDir)
}
