import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect } from 'chai'

import {
  getProjectInstructionFilesForAgent,
  installProjectInstruction,
  isManagedProjectInstruction,
  isProjectInstructionInstalled,
  isProjectInstructionUpToDate,
  removeProjectInstruction,
} from '../../src/lib/project-instructions.js'

function tmpDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `ormi-cli-project-instructions-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('project instructions', () => {
  describe('getProjectInstructionFilesForAgent', () => {
    it('maps claude-code to CLAUDE.md', () => {
      expect(getProjectInstructionFilesForAgent('claude-code')).to.deep.equal([
        'CLAUDE.md',
      ])
    })

    it('maps codex to AGENTS.md', () => {
      expect(getProjectInstructionFilesForAgent('codex')).to.deep.equal([
        'AGENTS.md',
      ])
    })

    it('maps opencode to AGENTS.md', () => {
      expect(getProjectInstructionFilesForAgent('opencode')).to.deep.equal([
        'AGENTS.md',
      ])
    })

    it('maps gemini-cli to GEMINI.md', () => {
      expect(getProjectInstructionFilesForAgent('gemini-cli')).to.deep.equal([
        'GEMINI.md',
      ])
    })

    it('returns no project files for cursor', () => {
      expect(getProjectInstructionFilesForAgent('cursor')).to.deep.equal([])
    })
  })

  describe('dedicated files (CLAUDE.md, GEMINI.md)', () => {
    it('installs a managed CLAUDE.md', () => {
      const dir = tmpDir()

      const result = installProjectInstruction('CLAUDE.md', 'claude-code', dir)

      expect(result.success).to.be.true
      expect(result.installed).to.be.true
      expect(existsSync(path.join(dir, 'CLAUDE.md'))).to.be.true
      expect(isManagedProjectInstruction('CLAUDE.md', 'claude-code', dir)).to.be.true
      expect(isProjectInstructionInstalled('CLAUDE.md', dir)).to.be.true

      rmSync(dir, { force: true, recursive: true })
    })

    it('does not overwrite unmanaged dedicated files', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'CLAUDE.md')
      writeFileSync(filePath, '# custom instructions\n')

      const result = installProjectInstruction('CLAUDE.md', 'claude-code', dir)

      expect(result.success).to.be.true
      expect(result.installed).to.be.false
      expect(readFileSync(filePath, 'utf8')).to.equal('# custom instructions\n')

      rmSync(dir, { force: true, recursive: true })
    })

    it('overwrites managed dedicated files on re-install', () => {
      const dir = tmpDir()

      installProjectInstruction('CLAUDE.md', 'claude-code', dir)
      const result = installProjectInstruction('CLAUDE.md', 'claude-code', dir)

      expect(result.success).to.be.true
      expect(result.updated).to.be.true
      expect(isProjectInstructionUpToDate('CLAUDE.md', 'claude-code', dir)).to.be.true

      rmSync(dir, { force: true, recursive: true })
    })

    it('removes managed dedicated files', () => {
      const dir = tmpDir()
      installProjectInstruction('CLAUDE.md', 'claude-code', dir)

      const result = removeProjectInstruction('CLAUDE.md', 'claude-code', dir)

      expect(result.success).to.be.true
      expect(result.removed).to.be.true
      expect(existsSync(path.join(dir, 'CLAUDE.md'))).to.be.false

      rmSync(dir, { force: true, recursive: true })
    })

    it('does not remove unmanaged dedicated files', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'CLAUDE.md')
      writeFileSync(filePath, '# custom claude instructions\n')

      const result = removeProjectInstruction('CLAUDE.md', 'claude-code', dir)

      expect(result.success).to.be.true
      expect(result.removed).to.be.false
      expect(readFileSync(filePath, 'utf8')).to.equal(
        '# custom claude instructions\n',
      )

      rmSync(dir, { force: true, recursive: true })
    })
  })

  describe('shared files (AGENTS.md)', () => {
    it('installs a section for codex', () => {
      const dir = tmpDir()

      const result = installProjectInstruction('AGENTS.md', 'codex', dir)

      expect(result.success).to.be.true
      expect(result.installed).to.be.true
      expect(existsSync(path.join(dir, 'AGENTS.md'))).to.be.true
      expect(isManagedProjectInstruction('AGENTS.md', 'codex', dir)).to.be.true
      expect(isProjectInstructionUpToDate('AGENTS.md', 'codex', dir)).to.be.true

      rmSync(dir, { force: true, recursive: true })
    })

    it('installs separate sections for codex and opencode in the same file', () => {
      const dir = tmpDir()

      installProjectInstruction('AGENTS.md', 'codex', dir)
      installProjectInstruction('AGENTS.md', 'opencode', dir)

      const content = readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')

      // Both agents' sections should be present
      expect(content).to.include('<!-- ormi-cli-agent:codex -->')
      expect(content).to.include('<!-- ormi-cli-agent:opencode -->')

      // Both should be managed and up-to-date
      expect(isManagedProjectInstruction('AGENTS.md', 'codex', dir)).to.be.true
      expect(isManagedProjectInstruction('AGENTS.md', 'opencode', dir)).to.be.true
      expect(isProjectInstructionUpToDate('AGENTS.md', 'codex', dir)).to.be.true
      expect(isProjectInstructionUpToDate('AGENTS.md', 'opencode', dir)).to.be.true

      rmSync(dir, { force: true, recursive: true })
    })

    it('removes only one agent section from shared file', () => {
      const dir = tmpDir()

      installProjectInstruction('AGENTS.md', 'codex', dir)
      installProjectInstruction('AGENTS.md', 'opencode', dir)

      // Remove only codex
      const result = removeProjectInstruction('AGENTS.md', 'codex', dir)
      expect(result.success).to.be.true
      expect(result.removed).to.be.true

      const content = readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')
      expect(content).to.not.include('<!-- ormi-cli-agent:codex -->')
      expect(content).to.include('<!-- ormi-cli-agent:opencode -->')

      rmSync(dir, { force: true, recursive: true })
    })

    it('deletes shared file when last section is removed', () => {
      const dir = tmpDir()

      installProjectInstruction('AGENTS.md', 'codex', dir)
      removeProjectInstruction('AGENTS.md', 'codex', dir)

      expect(existsSync(path.join(dir, 'AGENTS.md'))).to.be.false

      rmSync(dir, { force: true, recursive: true })
    })

    it('appends section to existing user content', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'AGENTS.md')
      writeFileSync(filePath, '# My custom instructions\n')

      const result = installProjectInstruction('AGENTS.md', 'codex', dir)

      expect(result.success).to.be.true
      expect(result.installed).to.be.true

      const content = readFileSync(filePath, 'utf8')
      expect(content).to.include('# My custom instructions')
      expect(content).to.include('<!-- ormi-cli-agent:codex -->')

      // User content is preserved
      expect(isManagedProjectInstruction('AGENTS.md', 'codex', dir)).to.be.true

      rmSync(dir, { force: true, recursive: true })
    })

    it('updates existing section on re-install', () => {
      const dir = tmpDir()

      installProjectInstruction('AGENTS.md', 'codex', dir)
      const content1 = readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')

      // Re-install should update
      const result = installProjectInstruction('AGENTS.md', 'codex', dir)
      expect(result.success).to.be.true
      expect(result.updated).to.be.true

      const content2 = readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')

      // Should still contain the markers (exact content may differ if template changed)
      expect(content2).to.include('<!-- ormi-cli-agent:codex -->')
      // Content should be the same since template hasn't changed
      expect(content1).to.equal(content2)

      rmSync(dir, { force: true, recursive: true })
    })

    it('migrates legacy whole-file managed marker', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'AGENTS.md')
      writeFileSync(filePath, '<!-- Managed by ormi-cli ai install. -->\nold content\n')

      const result = installProjectInstruction('AGENTS.md', 'codex', dir)

      expect(result.success).to.be.true
      expect(result.installed).to.be.true

      const content = readFileSync(filePath, 'utf8')
      expect(content).to.include('<!-- ormi-cli-agent:codex -->')
      // Legacy content should be gone
      expect(content).to.not.include('old content')

      rmSync(dir, { force: true, recursive: true })
    })

    it('reports not up-to-date when section content differs', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'AGENTS.md')
      writeFileSync(
        filePath,
        '<!-- ormi-cli-agent:codex -->\nmodified content\n<!-- ormi-cli-agent:codex -->\n',
      )

      expect(isProjectInstructionUpToDate('AGENTS.md', 'codex', dir)).to.be.false

      rmSync(dir, { force: true, recursive: true })
    })

    it('reports not managed when section marker is absent', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'AGENTS.md')
      writeFileSync(filePath, '# Some other content\n')

      expect(isManagedProjectInstruction('AGENTS.md', 'codex', dir)).to.be.false
      expect(isManagedProjectInstruction('AGENTS.md', 'opencode', dir)).to.be.false

      rmSync(dir, { force: true, recursive: true })
    })
  })
})
