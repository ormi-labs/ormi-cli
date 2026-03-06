import path from 'node:path'

import { expect } from 'chai'

import type { AgentConfig } from '../../src/lib/types.js'

import { getSkillsDirectory } from '../../src/lib/agents.js'

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    detectInstalled: () => Promise.resolve(true),
    displayName: 'Test Agent',
    globalSkillsDir: '/home/user/.test-agent/skills',
    name: 'test-agent',
    skillsDir: '.test-agent/skills',
    ...overrides,
  }
}

describe('getSkillsDirectory', () => {
  it('returns globalSkillsDir when global=true', () => {
    const config = makeConfig()
    expect(getSkillsDirectory(config, true)).to.equal('/home/user/.test-agent/skills')
  })

  it('returns cwd + skillsDir when global=false', () => {
    const config = makeConfig()
    const result = getSkillsDirectory(config, false, '/my/project')
    expect(result).to.equal(path.join('/my/project', '.test-agent/skills'))
  })

  it('returns empty string when skillsDir is empty and global=false', () => {
    const config = makeConfig({ skillsDir: '' })
    expect(getSkillsDirectory(config, false, '/my/project')).to.equal('')
  })

  it('returns empty globalSkillsDir when global=true and globalSkillsDir is empty', () => {
    const config = makeConfig({ globalSkillsDir: '' })
    expect(getSkillsDirectory(config, true)).to.equal('')
  })

  it('uses custom cwd parameter', () => {
    const config = makeConfig()
    const result = getSkillsDirectory(config, false, '/custom/cwd')
    expect(result).to.equal(path.join('/custom/cwd', '.test-agent/skills'))
  })

  it('uses process.cwd() when no cwd provided and global=false', () => {
    const config = makeConfig()
    const result = getSkillsDirectory(config, false)
    expect(result).to.equal(path.join(process.cwd(), '.test-agent/skills'))
  })
})
