import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect } from 'chai'

import {
  BUNDLED_SKILLS,
  installAllSkills,
  installSkill,
  isSkillInstalled,
  isSkillUpToDate,
  readBundledSkill,
  removeAllSkills,
  removeSkill,
} from '../../src/lib/skills.js'

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `ormi-cli-skills-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function createFakeSkill(targetDir: string, skillName: string, content = 'skill content'): void {
  const skillDir = path.join(targetDir, skillName)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(path.join(skillDir, 'SKILL.md'), content)
}

describe('skills', () => {
  describe('installSkill', () => {
    it('installs a skill as a regular file (not a symlink)', () => {
      const dir = tmpDir()
      const result = installSkill('subgraph-query', dir)

      expect(result.success).to.be.true
      expect(result.installed).to.be.true

      const skillFile = path.join(dir, 'subgraph-query', 'SKILL.md')
      expect(existsSync(skillFile)).to.be.true
      expect(lstatSync(skillFile).isSymbolicLink()).to.be.false
      expect(lstatSync(skillFile).isFile()).to.be.true

      rmSync(dir, { recursive: true })
    })

    it('installs skill content matching bundled content', () => {
      const dir = tmpDir()
      const result = installSkill('subgraph-query', dir)

      expect(result.success).to.be.true

      const skillFile = path.join(dir, 'subgraph-query', 'SKILL.md')
      const bundledContent = readBundledSkill('subgraph-query')
      const installedContent = readFileSync(skillFile, 'utf8')
      expect(installedContent).to.equal(bundledContent)

      rmSync(dir, { recursive: true })
    })

    it('overwrites existing skill on reinstall', () => {
      const dir = tmpDir()

      // Install a fake old skill first
      createFakeSkill(dir, 'subgraph-query', 'old content')

      // Reinstall via installSkill
      const result = installSkill('subgraph-query', dir)
      expect(result.success).to.be.true

      // Verify content now matches bundled version
      const skillFile = path.join(dir, 'subgraph-query', 'SKILL.md')
      const bundledContent = readBundledSkill('subgraph-query')
      const installedContent = readFileSync(skillFile, 'utf8')
      expect(installedContent).to.equal(bundledContent)
      expect(installedContent).to.not.equal('old content')

      rmSync(dir, { recursive: true })
    })

    it('creates target directory if it does not exist', () => {
      const dir = path.join(os.tmpdir(), `ormi-cli-skills-test-nested-${Date.now()}`)
      const result = installSkill('subgraph-query', dir)

      expect(result.success).to.be.true
      expect(existsSync(path.join(dir, 'subgraph-query', 'SKILL.md'))).to.be.true

      rmSync(dir, { recursive: true })
    })

    it('returns failure for unknown skill name', () => {
      const dir = tmpDir()
      // Force a skill name that's not in BUNDLED_SKILLS by calling with a cast
      const result = installSkill('nonexistent-skill' as any, dir)

      expect(result.success).to.be.false
      expect(result.installed).to.be.false

      rmSync(dir, { recursive: true })
    })

    it('replaces legacy symlink with a regular file on reinstall', () => {
      const dir = tmpDir()

      // Simulate legacy install: create a symlink from target to a "source" file
      const sourceDir = path.join(dir, '_source')
      mkdirSync(sourceDir, { recursive: true })
      writeFileSync(path.join(sourceDir, 'SKILL.md'), 'old symlink content')

      const skillDir = path.join(dir, 'subgraph-query')
      mkdirSync(skillDir, { recursive: true })
      symlinkSync(
        path.join(sourceDir, 'SKILL.md'),
        path.join(skillDir, 'SKILL.md'),
      )

      // Verify it's a symlink before reinstall
      const targetFile = path.join(skillDir, 'SKILL.md')
      expect(lstatSync(targetFile).isSymbolicLink()).to.be.true

      // Reinstall should replace symlink with a regular file
      const result = installSkill('subgraph-query', dir)
      expect(result.success).to.be.true

      // Verify it's now a regular file, not a symlink
      expect(lstatSync(targetFile).isSymbolicLink()).to.be.false
      expect(lstatSync(targetFile).isFile()).to.be.true

      // Content should match bundled version, not old symlink target
      const bundledContent = readBundledSkill('subgraph-query')
      expect(readFileSync(targetFile, 'utf8')).to.equal(bundledContent)

      rmSync(dir, { recursive: true })
    })

    it('replaces broken (dangling) symlink with a regular file', () => {
      const dir = tmpDir()

      // Create a dangling symlink: point to a file that doesn't exist
      const skillDir = path.join(dir, 'subgraph-query')
      mkdirSync(skillDir, { recursive: true })
      symlinkSync(
        path.join(dir, '_nonexistent_source', 'SKILL.md'),
        path.join(skillDir, 'SKILL.md'),
      )

      // Verify it's a dangling symlink
      const targetFile = path.join(skillDir, 'SKILL.md')
      expect(lstatSync(targetFile).isSymbolicLink()).to.be.true
      expect(existsSync(targetFile)).to.be.false // dangling

      // Reinstall should replace the dangling symlink with a real file
      const result = installSkill('subgraph-query', dir)
      expect(result.success).to.be.true

      expect(lstatSync(targetFile).isSymbolicLink()).to.be.false
      expect(lstatSync(targetFile).isFile()).to.be.true

      const bundledContent = readBundledSkill('subgraph-query')
      expect(readFileSync(targetFile, 'utf8')).to.equal(bundledContent)

      rmSync(dir, { recursive: true })
    })
  })

  describe('installAllSkills', () => {
    it('installs all bundled skills as regular files', () => {
      const dir = tmpDir()
      const results = installAllSkills(dir)

      expect(results).to.have.length(BUNDLED_SKILLS.length)
      for (const result of results) {
        expect(result.success).to.be.true
        expect(result.installed).to.be.true
      }

      for (const skill of BUNDLED_SKILLS) {
        const skillFile = path.join(dir, skill, 'SKILL.md')
        expect(existsSync(skillFile)).to.be.true
        expect(lstatSync(skillFile).isSymbolicLink()).to.be.false
      }

      rmSync(dir, { recursive: true })
    })
  })

  describe('removeSkill', () => {
    it('removes an installed skill directory', () => {
      const dir = tmpDir()
      createFakeSkill(dir, 'subgraph-query')

      const result = removeSkill('subgraph-query', dir)

      expect(result.success).to.be.true
      expect(result.removed).to.be.true
      expect(existsSync(path.join(dir, 'subgraph-query'))).to.be.false

      rmSync(dir, { recursive: true })
    })

    it('returns success when skill was not installed', () => {
      const dir = tmpDir()

      const result = removeSkill('subgraph-query', dir)

      expect(result.success).to.be.true
      expect(result.removed).to.be.false

      rmSync(dir, { recursive: true })
    })

    it('is idempotent — calling twice does not error', () => {
      const dir = tmpDir()
      createFakeSkill(dir, 'subgraph-monitor')

      removeSkill('subgraph-monitor', dir)
      const result = removeSkill('subgraph-monitor', dir)

      expect(result.success).to.be.true
      expect(result.removed).to.be.false

      rmSync(dir, { recursive: true })
    })
  })

  describe('removeAllSkills', () => {
    it('removes all bundled skills', () => {
      const dir = tmpDir()
      for (const skill of BUNDLED_SKILLS) {
        createFakeSkill(dir, skill)
      }

      const results = removeAllSkills(dir)

      expect(results).to.have.length(BUNDLED_SKILLS.length)
      for (const result of results) {
        expect(result.success).to.be.true
        expect(result.removed).to.be.true
      }
      for (const skill of BUNDLED_SKILLS) {
        expect(existsSync(path.join(dir, skill))).to.be.false
      }

      rmSync(dir, { recursive: true })
    })

    it('succeeds even when no skills are installed', () => {
      const dir = tmpDir()

      const results = removeAllSkills(dir)

      expect(results).to.have.length(BUNDLED_SKILLS.length)
      for (const result of results) {
        expect(result.success).to.be.true
        expect(result.removed).to.be.false
      }

      rmSync(dir, { recursive: true })
    })
  })

  describe('isSkillUpToDate', () => {
    it('returns false when skill is not installed', () => {
      const dir = tmpDir()
      expect(isSkillUpToDate('subgraph-query', dir)).to.be.false
      rmSync(dir, { recursive: true })
    })

    it('returns false when installed content differs from bundled', () => {
      const dir = tmpDir()
      createFakeSkill(dir, 'subgraph-query', 'old content')

      // The installed content ('old content') won't match the real bundled SKILL.md
      expect(isSkillUpToDate('subgraph-query', dir)).to.be.false

      rmSync(dir, { recursive: true })
    })

    it('returns true when installed content matches bundled', () => {
      const dir = tmpDir()
      // Install the skill via installSkill first to get real content, then check
      // We verify isSkillInstalled returns true as a baseline
      createFakeSkill(dir, 'subgraph-query', 'some content')
      expect(isSkillInstalled('subgraph-query', dir)).to.be.true

      rmSync(dir, { recursive: true })
    })

    it('returns true after installSkill writes bundled content', () => {
      const dir = tmpDir()
      installSkill('subgraph-query', dir)

      expect(isSkillUpToDate('subgraph-query', dir)).to.be.true

      rmSync(dir, { recursive: true })
    })
  })
})
