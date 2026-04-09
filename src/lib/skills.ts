import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
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
  'subgraph-create', // was: 'subgraph-create-from-contract' + 'subgraph-create-custom'
  'subgraph-deploy',
  'subgraph-query',
  'subgraph-monitor',
  'subgraph-manage',
  'subgraph-review',
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

  try {
    // Remove any legacy symlink left by old installs so we don't follow it
    // into the bundled source. Use lstatSync (not existsSync) so dangling
    // symlinks are also detected — existsSync returns false for broken links.
    try {
      const stat = lstatSync(targetFile)
      if (stat.isSymbolicLink()) {
        unlinkSync(targetFile)
      }
    } catch (error) {
      // Only suppress ENOENT (file doesn't exist at all).
      // If lstat succeeds but unlink fails, let it propagate to the
      // outer catch so we don't follow a symlink into the source.
      if (
        !(error instanceof Error) ||
        !('code' in error && error.code === 'ENOENT')
      ) {
        throw error
      }
    }

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
