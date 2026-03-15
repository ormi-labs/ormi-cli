import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Get the directory of this module (dist/lib/ in production, src/lib/ in dev)
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

// In production: dist/lib/../../skills = skills/
// In dev: src/lib/../../skills = skills/
const BUNDLED_SKILLS_DIR = path.join(currentDirectory, '..', '..', 'skills')

export const BUNDLED_SKILLS = [
  'subgraph-create-from-contract',
  'subgraph-create-custom',
  'subgraph-deploy',
  'subgraph-query',
  'subgraph-monitor',
  'subgraph-manage',
] as const

export type BundledSkill = (typeof BUNDLED_SKILLS)[number]

export interface SkillInstallResult {
  installed: boolean
  message: string
  skill: string
  success: boolean
  updated: boolean
}

export interface SkillRemoveResult {
  message: string
  removed: boolean
  skill: string
  success: boolean
}

/**
 * Get the path to a bundled skill's SKILL.md file
 */
export function getBundledSkillPath(skillName: BundledSkill): string {
  return path.join(BUNDLED_SKILLS_DIR, skillName, 'SKILL.md')
}

/**
 * Get list of all bundled skills
 */
export function getBundledSkills(): BundledSkill[] {
  if (!existsSync(BUNDLED_SKILLS_DIR)) {
    return []
  }

  const entries = readdirSync(BUNDLED_SKILLS_DIR, { withFileTypes: true })
  return entries
    .filter((entry) => {
      if (!entry.isDirectory()) {
        return false
      }
      const skillPath = path.join(BUNDLED_SKILLS_DIR, entry.name, 'SKILL.md')
      return existsSync(skillPath)
    })
    .map((entry) => entry.name) as BundledSkill[]
}

/**
 * Get list of installed skills in a directory
 */
export function getInstalledSkills(targetSkillsDirectory: string): string[] {
  if (!existsSync(targetSkillsDirectory)) {
    return []
  }

  const entries = readdirSync(targetSkillsDirectory, { withFileTypes: true })
  return entries
    .filter((entry) => {
      if (!entry.isDirectory()) {
        return false
      }
      const skillPath = path.join(targetSkillsDirectory, entry.name, 'SKILL.md')
      return existsSync(skillPath)
    })
    .map((entry) => entry.name)
}

/**
 * Install all bundled skills to a target directory
 */
export function installAllSkills(
  targetSkillsDirectory: string,
): SkillInstallResult[] {
  const results: SkillInstallResult[] = []

  for (const skillName of BUNDLED_SKILLS) {
    results.push(installSkill(skillName, targetSkillsDirectory))
  }

  return results
}

/**
 * Install a single skill to a target directory
 * Always overwrites existing skill if present.
 */
export function installSkill(
  skillName: BundledSkill,
  targetSkillsDirectory: string,
): SkillInstallResult {
  const skillContent = readBundledSkill(skillName)
  if (!skillContent) {
    return {
      installed: false,
      message: `Bundled skill '${skillName}' not found`,
      skill: skillName,
      success: false,
      updated: false,
    }
  }

  const targetDirectory = path.join(targetSkillsDirectory, skillName)
  const targetFile = path.join(targetDirectory, 'SKILL.md')
  const sourcePath = getBundledSkillPath(skillName)

  // Create target directory if it doesn't exist
  if (!existsSync(targetSkillsDirectory)) {
    mkdirSync(targetSkillsDirectory, { recursive: true })
  }

  // Remove existing skill directory if present
  if (existsSync(targetDirectory)) {
    rmSync(targetDirectory, { force: true, recursive: true })
  }

  // Try symlink first (for development and easy updates)
  try {
    symlinkSync(sourcePath, targetFile)
    return {
      installed: true,
      message: `Skill '${skillName}' installed via symlink`,
      skill: skillName,
      success: true,
      updated: true,
    }
  } catch {
    // Symlink failed, fall back to copy
  }

  // Fallback: copy the file
  try {
    mkdirSync(targetDirectory, { recursive: true })
    writeFileSync(targetFile, skillContent)
    return {
      installed: true,
      message: `Skill '${skillName}' installed`,
      skill: skillName,
      success: true,
      updated: true,
    }
  } catch (error) {
    return {
      installed: false,
      message: `Failed to install skill: ${error instanceof Error ? error.message : 'Unknown error'}`,
      skill: skillName,
      success: false,
      updated: false,
    }
  }
}

/**
 * Check if a skill is installed in a target directory
 */
export function isSkillInstalled(
  skillName: BundledSkill,
  targetSkillsDirectory: string,
): boolean {
  const targetFile = path.join(targetSkillsDirectory, skillName, 'SKILL.md')
  return existsSync(targetFile)
}

/**
 * Check if an installed skill matches the bundled version
 */
export function isSkillUpToDate(
  skillName: BundledSkill,
  targetSkillsDirectory: string,
): boolean {
  const targetFile = path.join(targetSkillsDirectory, skillName, 'SKILL.md')
  if (!existsSync(targetFile)) {
    return false
  }

  const bundledContent = readBundledSkill(skillName)
  if (!bundledContent) {
    return false
  }

  const installedContent = readFileSync(targetFile, 'utf8')
  return installedContent === bundledContent
}

/**
 * Read the content of a bundled skill
 */
export function readBundledSkill(skillName: BundledSkill): string | undefined {
  const skillPath = getBundledSkillPath(skillName)
  if (!existsSync(skillPath)) {
    return undefined
  }
  return readFileSync(skillPath, 'utf8')
}

/**
 * Remove all bundled skills from a target directory
 */
export function removeAllSkills(
  targetSkillsDirectory: string,
): SkillRemoveResult[] {
  return BUNDLED_SKILLS.map((skillName) =>
    removeSkill(skillName, targetSkillsDirectory),
  )
}

/**
 * Remove a skill directory from a target directory
 */
export function removeSkill(
  skillName: BundledSkill,
  targetSkillsDirectory: string,
): SkillRemoveResult {
  const targetDirectory = path.join(targetSkillsDirectory, skillName)

  if (!existsSync(targetDirectory)) {
    return {
      message: `Skill '${skillName}' was not installed`,
      removed: false,
      skill: skillName,
      success: true,
    }
  }

  try {
    rmSync(targetDirectory, { force: true, recursive: true })
    return {
      message: `Skill '${skillName}' removed`,
      removed: true,
      skill: skillName,
      success: true,
    }
  } catch (error) {
    return {
      message: `Failed to remove skill '${skillName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
      removed: false,
      skill: skillName,
      success: false,
    }
  }
}
