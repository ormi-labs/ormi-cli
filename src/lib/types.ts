export interface AgentConfig {
  detect: {
    globalPaths: string[]
    projectPaths: string[]
  }
  displayName: string

  mcp: {
    buildEntry: (url: string) => Record<string, unknown>
    configKey: string
    globalPaths: string[]
    projectPaths: string[]
  }

  name: AgentType

  skill: {
    dir: (scope: 'global' | 'project') => string
  }
}

export type AgentType =
  | 'claude-code'
  | 'codex'
  | 'cursor'
  | 'gemini-cli'
  | 'opencode'
