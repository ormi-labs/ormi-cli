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

// Legacy whole-file marker (pre-section-marker installs)
const MANAGED_MARKER = '<!-- Managed by ormi-cli ai install. -->'

// Per-agent section markers for shared files (Context7 append pattern)
function sectionMarker(agentType: AgentType): string {
  return `<!-- ormi-cli-agent:${agentType} -->`
}

// Files that are shared between multiple agents need section markers
const SHARED_FILES = new Set<string>(['AGENTS.md'])

export const PROJECT_INSTRUCTION_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
] as const

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
  'gemini-cli': ['GEMINI.md'],
  opencode: ['AGENTS.md'],
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
  agentType: AgentType,
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

  const isShared = SHARED_FILES.has(fileName)

  if (isShared) {
    return installSharedInstruction(fileName, agentType, content, targetPath)
  }

  return installDedicatedInstruction(fileName, content, targetPath)
}

export function isManagedProjectInstruction(
  fileName: BundledProjectInstruction,
  agentType: AgentType,
  cwd = process.cwd(),
): boolean {
  const targetPath = path.join(cwd, fileName)
  if (!existsSync(targetPath)) {
    return false
  }

  const content = readFileSync(targetPath, 'utf8')

  if (SHARED_FILES.has(fileName)) {
    // Shared file: check for this agent's section marker
    return content.includes(sectionMarker(agentType))
  }

  // Dedicated file: check for legacy whole-file marker
  return content.startsWith(MANAGED_MARKER)
}

export function isProjectInstructionInstalled(
  fileName: BundledProjectInstruction,
  cwd = process.cwd(),
): boolean {
  return existsSync(path.join(cwd, fileName))
}

export function isProjectInstructionUpToDate(
  fileName: BundledProjectInstruction,
  agentType: AgentType,
  cwd = process.cwd(),
): boolean {
  const bundledContent = readBundledProjectInstruction(fileName)
  const targetPath = path.join(cwd, fileName)
  if (!bundledContent || !existsSync(targetPath)) {
    return false
  }

  const content = readFileSync(targetPath, 'utf8')

  if (SHARED_FILES.has(fileName)) {
    // Shared file: extract this agent's section and compare
    const marker = sectionMarker(agentType)
    const escapedMarker = marker.replaceAll(
      /[.*+?^${}()|[\]\\]/g,
      String.raw`\$&`,
    )
    const regex = new RegExp(
      String.raw`${escapedMarker}\n([\s\S]*?)\n${escapedMarker}`,
    )
    const match = regex.exec(content)
    if (!match) {
      return false
    }
    return match[1] === bundledContent.trimEnd()
  }

  // Dedicated file: compare entire content
  return content === bundledContent
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
  agentType: AgentType,
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

  if (SHARED_FILES.has(fileName)) {
    return removeSharedInstruction(fileName, agentType, targetPath)
  }

  return removeDedicatedInstruction(fileName, targetPath)
}

function installDedicatedInstruction(
  fileName: string,
  content: string,
  targetPath: string,
): ProjectInstructionInstallResult {
  // Check if file exists and is not managed by us
  if (existsSync(targetPath)) {
    const existingContent = readFileSync(targetPath, 'utf8')
    if (!existingContent.startsWith(MANAGED_MARKER)) {
      return {
        installed: false,
        message: `Project instruction '${fileName}' already exists and was left unchanged`,
        success: true,
        updated: false,
      }
    }
  }

  // Write the file (overwrites if managed by us)
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

function installSharedInstruction(
  fileName: string,
  agentType: AgentType,
  content: string,
  targetPath: string,
): ProjectInstructionInstallResult {
  const marker = sectionMarker(agentType)

  // Build the section: marker\ncontent\nmarker
  const section = `${marker}\n${content.trimEnd()}\n${marker}`

  try {
    if (existsSync(targetPath)) {
      let existing = readFileSync(targetPath, 'utf8')

      // Migrate legacy whole-file managed content
      if (existing.startsWith(MANAGED_MARKER)) {
        existing = ''
      }

      // Replace existing section for this agent (Context7 pattern)
      if (existing.includes(marker)) {
        const escapedMarker = marker.replaceAll(
          /[.*+?^${}()|[\]\\]/g,
          String.raw`\$&`,
        )
        const regex = new RegExp(
          String.raw`${escapedMarker}\n[\s\S]*?${escapedMarker}`,
        )
        const updated = existing.replace(regex, section)
        writeFileSync(targetPath, updated)
        return {
          installed: true,
          message: `Project instruction '${fileName}' section for ${agentType} updated`,
          success: true,
          updated: true,
        }
      }

      // Append new section (Context7 pattern)
      const separator =
        existing.length > 0 && !existing.endsWith('\n')
          ? '\n\n'
          : existing.length > 0
            ? '\n'
            : ''
      writeFileSync(targetPath, existing + separator + section + '\n')
      return {
        installed: true,
        message: `Project instruction '${fileName}' section for ${agentType} installed`,
        success: true,
        updated: true,
      }
    }

    // File doesn't exist yet — create with section
    writeFileSync(targetPath, section + '\n')
    return {
      installed: true,
      message: `Project instruction '${fileName}' section for ${agentType} installed`,
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

function removeDedicatedInstruction(
  fileName: string,
  targetPath: string,
): ProjectInstructionRemoveResult {
  const content = readFileSync(targetPath, 'utf8')
  if (!content.startsWith(MANAGED_MARKER)) {
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

function removeSharedInstruction(
  fileName: string,
  agentType: AgentType,
  targetPath: string,
): ProjectInstructionRemoveResult {
  const marker = sectionMarker(agentType)
  let content = readFileSync(targetPath, 'utf8')

  if (!content.includes(marker)) {
    return {
      message: `Project instruction '${fileName}' has no section for ${agentType}`,
      removed: false,
      success: true,
    }
  }

  try {
    // Remove this agent's section (Context7 pattern)
    const escapedMarker = marker.replaceAll(
      /[.*+?^${}()|[\]\\]/g,
      String.raw`\$&`,
    )
    const regex = new RegExp(
      String.raw`\n*${escapedMarker}\n[\s\S]*?${escapedMarker}\n*`,
    )
    content = content.replace(regex, '\n')

    // Clean up leading/trailing whitespace
    content = content.trim()

    if (content.length === 0) {
      // File is empty after removal — delete it
      rmSync(targetPath, { force: true })
    } else {
      writeFileSync(targetPath, content + '\n')
    }

    return {
      message: `Project instruction '${fileName}' section for ${agentType} removed`,
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
