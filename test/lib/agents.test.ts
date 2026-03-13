import path from 'node:path'

import { expect } from 'chai'

import type { AgentConfig } from '../../src/lib/types.js'

import { getMcpConfigPath, getSkillsDirectory } from '../../src/lib/agents.js'

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

function makeConfigWithMcp(localPath: string, globalPath = '/home/user/.test-agent/mcp.json'): AgentConfig {
  return makeConfig({
    mcp: {
      configPath: {
        global: globalPath,
        local: localPath,
      },
    },
  })
}

describe('getMcpConfigPath', () => {
  it('returns global path when global=true', () => {
    const config = makeConfigWithMcp('.mcp.json', '/home/user/.agent/mcp.json')
    expect(getMcpConfigPath(config, true)).to.equal('/home/user/.agent/mcp.json')
  })

  it('returns cwd + .mcp.json when global=false', () => {
    const config = makeConfigWithMcp('.mcp.json')
    expect(getMcpConfigPath(config, false, '/my/project')).to.equal(
      path.join('/my/project', '.mcp.json'),
    )
  })

  it('falls back to global path when local is empty', () => {
    const config = makeConfigWithMcp('', '/home/user/.agent/mcp.json')
    expect(getMcpConfigPath(config, false, '/my/project')).to.equal('/home/user/.agent/mcp.json')
  })

  it('returns undefined for agents without MCP support', () => {
    const config = makeConfig() // no mcp field
    expect(getMcpConfigPath(config, false, '/my/project')).to.be.undefined
  })
})

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
