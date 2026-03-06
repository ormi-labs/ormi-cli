export interface AgentConfig {
  detectInstalled: () => Promise<boolean>
  displayName: string
  globalSkillsDir: string
  mcp?: McpConfig
  name: string
  skillsDir: string
}

export type AgentType =
  | 'antigravity'
  | 'claude-code'
  | 'claude-desktop'
  | 'cline'
  | 'codex'
  | 'continue'
  | 'cursor'
  | 'gemini-cli'
  | 'kilo'
  | 'kiro'
  | 'opencode'
  | 'roo'
  | 'vscode-copilot'
  | 'windsurf'

export interface McpConfig {
  configFormat: McpConfigFormat
  configPath: {
    global: string
    local: string
  }
}

export type McpConfigFormat = 'claude' | 'vscode' | 'windsurf'

export interface SetupOptions {
  agent: string[]
  global: boolean
  mcpOnly: boolean
  skillsOnly: boolean
  url: string
  yes: boolean
}
