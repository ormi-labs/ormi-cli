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
    // Always check global paths; for project scope also check local paths
    const paths =
      scope === 'global'
        ? agent.detect.globalPaths
        : [...agent.detect.globalPaths, ...agent.detect.projectPaths]
    for (const p of paths) {
      const isAbsolute = path.isAbsolute(p)
      const fullPath = isAbsolute ? p : path.join(process.cwd(), p)
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
