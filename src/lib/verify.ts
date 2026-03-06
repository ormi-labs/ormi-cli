import { execFileSync } from 'node:child_process'

import type { AgentType } from './types.ts'

const SERVER_NAME = 'subgraph-mcp'

export interface VerifyResult {
  available: boolean // CLI binary exists
  message: string
  verified: boolean // Server confirmed visible
}

// Map agent types to their CLI verification commands
const verifyCommands: Partial<
  Record<AgentType, { args: string[]; bin: string }>
> = {
  'claude-code': { args: ['mcp', 'get', SERVER_NAME], bin: 'claude' },
  codex: { args: ['mcp', 'list', '--json'], bin: 'codex' },
  'gemini-cli': { args: ['mcp', 'list'], bin: 'gemini' },
}

export function verifyMcpSetup(agentType: AgentType): VerifyResult {
  const cmd = verifyCommands[agentType]
  if (!cmd) {
    return {
      available: false,
      message: 'No CLI verification available',
      verified: false,
    }
  }

  try {
    const output = execFileSync(cmd.bin, cmd.args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15_000,
    })

    const found = output.includes(SERVER_NAME)
    return {
      available: true,
      message: found
        ? `Verified: ${cmd.bin} sees ${SERVER_NAME}`
        : `Warning: ${cmd.bin} did not find ${SERVER_NAME} — config may be at wrong path`,
      verified: found,
    }
  } catch (error: unknown) {
    // CLI binary not found or errored
    const isNotFound =
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    return {
      available: !isNotFound,
      message: isNotFound
        ? `${cmd.bin} not installed, skipping verification`
        : `${cmd.bin} verification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      verified: false,
    }
  }
}
