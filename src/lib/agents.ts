import { existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import type { AgentConfig, AgentType } from './types.ts'

const home = homedir()

// Claude Code config dir (respects CLAUDE_CONFIG_DIR env var)
const claudeHome =
  process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(home, '.claude')

// Codex config dir (respects CODEX_HOME env var)
const codexHome = process.env.CODEX_HOME?.trim() || path.join(home, '.codex')

// XDG config home for Linux/OpenCode
const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config')

const agents: Record<AgentType, AgentConfig> = {
  'claude-code': {
    detect: {
      globalPaths: [claudeHome],
      projectPaths: ['.mcp.json', '.claude'],
    },
    displayName: 'Claude Code',
    mcp: {
      buildEntry: (url) => ({ type: 'http', url }),
      configKey: 'mcpServers',
      globalPaths: [path.join(home, '.claude.json')],
      projectPaths: ['.mcp.json'],
    },
    name: 'claude-code',
    skill: {
      dir: (scope) =>
        scope === 'global'
          ? path.join(claudeHome, 'skills')
          : path.join('.claude', 'skills'),
    },
  },

  codex: {
    detect: {
      globalPaths: [codexHome],
      projectPaths: ['.codex'],
    },
    displayName: 'Codex',
    mcp: {
      buildEntry: (url) => ({ type: 'http', url }),
      configKey: 'mcp_servers',
      globalPaths: [path.join(codexHome, 'config.toml')],
      projectPaths: [path.join('.codex', 'config.toml')],
    },
    name: 'codex',
    skill: {
      dir: (scope) =>
        scope === 'global'
          ? path.join(home, '.agents', 'skills')
          : path.join('.agents', 'skills'),
    },
  },

  cursor: {
    detect: {
      globalPaths: [path.join(home, '.cursor')],
      projectPaths: ['.cursor'],
    },
    displayName: 'Cursor',
    mcp: {
      buildEntry: (url) => ({ url }),
      configKey: 'mcpServers',
      globalPaths: [path.join(home, '.cursor', 'mcp.json')],
      projectPaths: [path.join('.cursor', 'mcp.json')],
    },
    name: 'cursor',
    skill: {
      dir: (scope) =>
        scope === 'global'
          ? path.join(home, '.cursor', 'skills')
          : path.join('.cursor', 'skills'),
    },
  },

  'gemini-cli': {
    detect: {
      globalPaths: [path.join(home, '.gemini')],
      projectPaths: ['.gemini'],
    },
    displayName: 'Gemini CLI',
    mcp: {
      buildEntry: (url) => ({ httpUrl: url }),
      configKey: 'mcpServers',
      globalPaths: [path.join(home, '.gemini', 'settings.json')],
      projectPaths: [path.join('.gemini', 'settings.json')],
    },
    name: 'gemini-cli',
    skill: {
      dir: (scope) =>
        scope === 'global'
          ? path.join(home, '.gemini', 'skills')
          : path.join('.gemini', 'skills'),
    },
  },

  opencode: {
    detect: {
      globalPaths: [path.join(configHome, 'opencode')],
      projectPaths: [
        'opencode.json',
        'opencode.jsonc',
        '.opencode.json',
        '.opencode.jsonc',
      ],
    },
    displayName: 'OpenCode',
    mcp: {
      buildEntry: (url) => ({ enabled: true, type: 'remote', url }),
      configKey: 'mcp',
      globalPaths: [
        path.join(configHome, 'opencode', 'opencode.json'),
        path.join(configHome, 'opencode', 'opencode.jsonc'),
        path.join(configHome, 'opencode', '.opencode.json'),
        path.join(configHome, 'opencode', '.opencode.jsonc'),
      ],
      projectPaths: [
        'opencode.json',
        'opencode.jsonc',
        '.opencode.json',
        '.opencode.jsonc',
      ],
    },
    name: 'opencode',
    skill: {
      dir: (scope) =>
        scope === 'global'
          ? path.join(home, '.agents', 'skills')
          : path.join('.agents', 'skills'),
    },
  },
}

export function getAgent(name: AgentType): AgentConfig {
  return agents[name]
}

export const ALL_AGENT_NAMES: AgentType[] = Object.keys(agents) as AgentType[]

export async function detectAgents(
  scope: 'global' | 'project',
): Promise<AgentType[]> {
  const detected: AgentType[] = []

  for (const agent of Object.values(agents)) {
    const paths =
      scope === 'global' ? agent.detect.globalPaths : agent.detect.projectPaths
    for (const p of paths) {
      const fullPath = scope === 'global' ? p : path.join(process.cwd(), p)
      try {
        await access(fullPath)
        detected.push(agent.name)
        break
      } catch {
        // Path doesn't exist, try next candidate
      }
    }
  }

  return detected
}

// ---------------------------------------------------------------------------
// Backward-compatible wrappers (used by install.ts, uninstall.ts, doctor.ts)
// These will be removed in Phase 4 when commands are rewritten.
// ---------------------------------------------------------------------------

export async function detectInstalledAgents(): Promise<AgentType[]> {
  return detectAgents('global')
}

export function getAgentConfig(type: AgentType): AgentConfig {
  return getAgent(type)
}

export function getAllAgentTypes(): AgentType[] {
  return ALL_AGENT_NAMES
}

export function getMcpConfigPath(
  config: AgentConfig,
  global: boolean,
  cwd?: string,
): string {
  const candidates = global ? config.mcp.globalPaths : config.mcp.projectPaths

  // Return first candidate (absolute for global, joined with cwd for project)
  if (global) {
    return candidates[0]
  }
  return path.join(cwd || process.cwd(), candidates[0])
}

export function getSkillsDirectory(
  config: AgentConfig,
  global: boolean,
  cwd?: string,
): string {
  const skillDirectory = config.skill.dir(global ? 'global' : 'project')
  if (global || path.isAbsolute(skillDirectory)) {
    return skillDirectory
  }
  return path.join(cwd || process.cwd(), skillDirectory)
}

export function hasExistingInstallation(
  agentTypes: AgentType[],
  global: boolean,
  cwd?: string,
): boolean {
  const workingDirectory = cwd || process.cwd()

  for (const agentType of agentTypes) {
    const config = agents[agentType]

    // Check skills directory
    const skillsDirectory = getSkillsDirectory(config, global, workingDirectory)
    if (skillsDirectory && existsSync(skillsDirectory)) {
      return true
    }

    // For local installs, also check project instruction files
    if (!global) {
      const projectFiles =
        agentType === 'claude-code'
          ? ['CLAUDE.md']
          : agentType === 'codex'
            ? ['AGENTS.md']
            : []
      for (const fileName of projectFiles) {
        if (existsSync(path.join(workingDirectory, fileName))) {
          return true
        }
      }
    }
  }

  return false
}
