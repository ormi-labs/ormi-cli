import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AgentType } from './types.ts'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const BUNDLED_PROJECT_INSTRUCTIONS_DIR = path.join(
  currentDirectory,
  '..',
  '..',
  'templates',
  'ai',
)

const MANAGED_MARKER = '<!-- Managed by ormi-cli ai install. -->'

export const PROJECT_INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'] as const

export type BundledProjectInstruction =
  (typeof PROJECT_INSTRUCTION_FILES)[number]

export interface ProjectInstructionInstallResult {
  installed: boolean
  message: string
  success: boolean
  updated: boolean
}

export interface ProjectInstructionRemoveResult {
  message: string
  removed: boolean
  success: boolean
}

const AGENT_PROJECT_FILES: Partial<
  Record<AgentType, BundledProjectInstruction[]>
> = {
  'claude-code': ['CLAUDE.md'],
  codex: ['AGENTS.md'],
}

export function getBundledProjectInstructionPath(
  fileName: BundledProjectInstruction,
): string {
  return path.join(BUNDLED_PROJECT_INSTRUCTIONS_DIR, fileName)
}

export function getProjectInstructionFilesForAgent(
  agentType: AgentType,
): BundledProjectInstruction[] {
  return AGENT_PROJECT_FILES[agentType] ?? []
}

export function installProjectInstruction(
  fileName: BundledProjectInstruction,
  cwd = process.cwd(),
): ProjectInstructionInstallResult {
  const content = readBundledProjectInstruction(fileName)
  if (!content) {
    return {
      installed: false,
      message: `Bundled project instruction '${fileName}' not found`,
      success: false,
      updated: false,
    }
  }

  const targetPath = path.join(cwd, fileName)
  const targetDirectory = path.dirname(targetPath)

  if (!existsSync(targetDirectory)) {
    mkdirSync(targetDirectory, { recursive: true })
  }

  if (existsSync(targetPath)) {
    const existingContent = readFileSync(targetPath, 'utf8')
    if (existingContent === content) {
      return {
        installed: true,
        message: `Project instruction '${fileName}' already installed`,
        success: true,
        updated: false,
      }
    }

    if (!existingContent.startsWith(MANAGED_MARKER)) {
      return {
        installed: false,
        message: `Project instruction '${fileName}' already exists and was left unchanged`,
        success: true,
        updated: false,
      }
    }
  }

  try {
    writeFileSync(targetPath, content)
    return {
      installed: true,
      message: `Project instruction '${fileName}' installed`,
      success: true,
      updated: true,
    }
  } catch (error) {
    return {
      installed: false,
      message: `Failed to install project instruction '${fileName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
      success: false,
      updated: false,
    }
  }
}

export function isManagedProjectInstruction(
  fileName: BundledProjectInstruction,
  cwd = process.cwd(),
): boolean {
  const targetPath = path.join(cwd, fileName)
  if (!existsSync(targetPath)) {
    return false
  }

  return readFileSync(targetPath, 'utf8').startsWith(MANAGED_MARKER)
}

export function isProjectInstructionInstalled(
  fileName: BundledProjectInstruction,
  cwd = process.cwd(),
): boolean {
  return existsSync(path.join(cwd, fileName))
}

export function isProjectInstructionUpToDate(
  fileName: BundledProjectInstruction,
  cwd = process.cwd(),
): boolean {
  const bundledContent = readBundledProjectInstruction(fileName)
  const targetPath = path.join(cwd, fileName)
  if (!bundledContent || !existsSync(targetPath)) {
    return false
  }

  return readFileSync(targetPath, 'utf8') === bundledContent
}

export function readBundledProjectInstruction(
  fileName: BundledProjectInstruction,
): string | undefined {
  const filePath = getBundledProjectInstructionPath(fileName)
  if (!existsSync(filePath)) {
    return undefined
  }

  return readFileSync(filePath, 'utf8')
}

export function removeProjectInstruction(
  fileName: BundledProjectInstruction,
  cwd = process.cwd(),
): ProjectInstructionRemoveResult {
  const targetPath = path.join(cwd, fileName)

  if (!existsSync(targetPath)) {
    return {
      message: `Project instruction '${fileName}' was not installed`,
      removed: false,
      success: true,
    }
  }

  if (!isManagedProjectInstruction(fileName, cwd)) {
    return {
      message: `Project instruction '${fileName}' exists but is not managed by ormi-cli`,
      removed: false,
      success: true,
    }
  }

  try {
    rmSync(targetPath, { force: true })
    return {
      message: `Project instruction '${fileName}' removed`,
      removed: true,
      success: true,
    }
  } catch (error) {
    return {
      message: `Failed to remove project instruction '${fileName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
      removed: false,
      success: false,
    }
  }
}
