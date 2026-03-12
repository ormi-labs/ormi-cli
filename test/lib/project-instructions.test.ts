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

    it('returns no project files for unsupported agents', () => {
      expect(getProjectInstructionFilesForAgent('cursor')).to.deep.equal([])
    })
  })

  describe('installProjectInstruction', () => {
    it('installs a managed project instruction', () => {
      const dir = tmpDir()

      const result = installProjectInstruction('AGENTS.md', dir)

      expect(result.success).to.be.true
      expect(result.installed).to.be.true
      expect(existsSync(path.join(dir, 'AGENTS.md'))).to.be.true
      expect(isManagedProjectInstruction('AGENTS.md', dir)).to.be.true
      expect(isProjectInstructionInstalled('AGENTS.md', dir)).to.be.true

      rmSync(dir, { force: true, recursive: true })
    })

    it('does not overwrite unmanaged files', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'AGENTS.md')
      writeFileSync(filePath, '# custom instructions\n')

      const result = installProjectInstruction('AGENTS.md', dir)

      expect(result.success).to.be.true
      expect(result.installed).to.be.false
      expect(readFileSync(filePath, 'utf8')).to.equal('# custom instructions\n')

      rmSync(dir, { force: true, recursive: true })
    })

    it('is idempotent for up-to-date managed files', () => {
      const dir = tmpDir()

      installProjectInstruction('CLAUDE.md', dir)
      const result = installProjectInstruction('CLAUDE.md', dir)

      expect(result.success).to.be.true
      expect(result.updated).to.be.false
      expect(isProjectInstructionUpToDate('CLAUDE.md', dir)).to.be.true

      rmSync(dir, { force: true, recursive: true })
    })
  })

  describe('removeProjectInstruction', () => {
    it('removes managed files', () => {
      const dir = tmpDir()
      installProjectInstruction('AGENTS.md', dir)

      const result = removeProjectInstruction('AGENTS.md', dir)

      expect(result.success).to.be.true
      expect(result.removed).to.be.true
      expect(existsSync(path.join(dir, 'AGENTS.md'))).to.be.false

      rmSync(dir, { force: true, recursive: true })
    })

    it('does not remove unmanaged files', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'CLAUDE.md')
      writeFileSync(filePath, '# custom claude instructions\n')

      const result = removeProjectInstruction('CLAUDE.md', dir)

      expect(result.success).to.be.true
      expect(result.removed).to.be.false
      expect(readFileSync(filePath, 'utf8')).to.equal(
        '# custom claude instructions\n',
      )

      rmSync(dir, { force: true, recursive: true })
    })
  })
})
