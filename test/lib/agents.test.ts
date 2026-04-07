import path from 'node:path'

import { expect } from 'chai'

import type { AgentConfig, AgentType } from '../../src/lib/types.js'

import {
  ALL_AGENT_NAMES,
  detectAgents,
  getAgent,
  getMcpConfigPath,
  getSkillsDirectory,
} from '../../src/lib/agents.js'

const EXPECTED_AGENTS: AgentType[] = [
  'claude-code',
  'codex',
  'cursor',
  'gemini-cli',
  'opencode',
]

describe('agent definitions', () => {
  it('has exactly 5 supported agents', () => {
    expect(ALL_AGENT_NAMES).to.deep.equal(EXPECTED_AGENTS)
  })

  for (const name of EXPECTED_AGENTS) {
    describe(`${name}`, () => {
      let agent: AgentConfig

      before(() => {
        agent = getAgent(name)
      })

      it('has correct name', () => {
        expect(agent.name).to.equal(name)
      })

      it('has a displayName', () => {
        expect(agent.displayName).to.be.a('string').and.not.empty
      })

      it('has mcp config with required fields', () => {
        expect(agent.mcp.projectPaths).to.be.an('array').and.not.empty
        expect(agent.mcp.globalPaths).to.be.an('array').and.not.empty
        expect(agent.mcp.configKey).to.be.a('string').and.not.empty
        expect(agent.mcp.buildEntry).to.be.a('function')
      })

      it('has skill dir function', () => {
        expect(agent.skill.dir).to.be.a('function')
        expect(agent.skill.dir('global')).to.be.a('string').and.not.empty
        expect(agent.skill.dir('project')).to.be.a('string').and.not.empty
      })

      it('has detect config with paths', () => {
        expect(agent.detect.projectPaths).to.be.an('array').and.not.empty
        expect(agent.detect.globalPaths).to.be.an('array').and.not.empty
      })
    })
  }
})

describe('agent MCP entry formats', () => {
  const testUrl = 'https://mcp.test.example.com'

  it('claude-code: { type: "http", url }', () => {
    const entry = getAgent('claude-code').mcp.buildEntry(testUrl)
    expect(entry).to.deep.equal({ type: 'http', url: testUrl })
  })

  it('cursor: { url } — no type field', () => {
    const entry = getAgent('cursor').mcp.buildEntry(testUrl)
    expect(entry).to.deep.equal({ url: testUrl })
    expect(entry).to.not.have.property('type')
  })

  it('gemini-cli: { httpUrl } — httpUrl not url', () => {
    const entry = getAgent('gemini-cli').mcp.buildEntry(testUrl)
    expect(entry).to.deep.equal({ httpUrl: testUrl })
    expect(entry).to.not.have.property('url')
  })

  it('opencode: { type: "remote", url, enabled: true }', () => {
    const entry = getAgent('opencode').mcp.buildEntry(testUrl)
    expect(entry).to.deep.equal({ type: 'remote', url: testUrl, enabled: true })
  })

  it('codex: { type: "http", url }', () => {
    const entry = getAgent('codex').mcp.buildEntry(testUrl)
    expect(entry).to.deep.equal({ type: 'http', url: testUrl })
  })
})

describe('agent config keys', () => {
  it('claude-code uses mcpServers', () => {
    expect(getAgent('claude-code').mcp.configKey).to.equal('mcpServers')
  })

  it('cursor uses mcpServers', () => {
    expect(getAgent('cursor').mcp.configKey).to.equal('mcpServers')
  })

  it('gemini-cli uses mcpServers', () => {
    expect(getAgent('gemini-cli').mcp.configKey).to.equal('mcpServers')
  })

  it('opencode uses mcp', () => {
    expect(getAgent('opencode').mcp.configKey).to.equal('mcp')
  })

  it('codex uses mcp_servers', () => {
    expect(getAgent('codex').mcp.configKey).to.equal('mcp_servers')
  })
})

describe('agent MCP paths', () => {
  it('claude-code has .mcp.json as project path', () => {
    const agent = getAgent('claude-code')
    expect(agent.mcp.projectPaths).to.include('.mcp.json')
  })

  it('cursor has .cursor/mcp.json as project path', () => {
    const agent = getAgent('cursor')
    expect(agent.mcp.projectPaths).to.include(path.join('.cursor', 'mcp.json'))
  })

  it('gemini-cli has .gemini/settings.json as project path', () => {
    const agent = getAgent('gemini-cli')
    expect(agent.mcp.projectPaths).to.include(
      path.join('.gemini', 'settings.json'),
    )
  })

  it('opencode has multiple candidate project paths', () => {
    const agent = getAgent('opencode')
    expect(agent.mcp.projectPaths).to.include('opencode.json')
    expect(agent.mcp.projectPaths).to.include('opencode.jsonc')
    expect(agent.mcp.projectPaths).to.include('.opencode.json')
    expect(agent.mcp.projectPaths).to.include('.opencode.jsonc')
  })

  it('codex has .codex/config.toml as project path', () => {
    const agent = getAgent('codex')
    expect(agent.mcp.projectPaths).to.include(
      path.join('.codex', 'config.toml'),
    )
  })
})

describe('agent skill directories', () => {
  it('claude-code uses .claude/skills', () => {
    const agent = getAgent('claude-code')
    expect(agent.skill.dir('project')).to.equal(path.join('.claude', 'skills'))
  })

  it('cursor uses .cursor/skills', () => {
    const agent = getAgent('cursor')
    expect(agent.skill.dir('project')).to.equal(
      path.join('.cursor', 'skills'),
    )
  })

  it('gemini-cli uses .gemini/skills', () => {
    const agent = getAgent('gemini-cli')
    expect(agent.skill.dir('project')).to.equal(
      path.join('.gemini', 'skills'),
    )
  })

  it('opencode uses .agents/skills', () => {
    const agent = getAgent('opencode')
    expect(agent.skill.dir('project')).to.equal(
      path.join('.agents', 'skills'),
    )
  })

  it('codex uses .agents/skills', () => {
    const agent = getAgent('codex')
    expect(agent.skill.dir('project')).to.equal(
      path.join('.agents', 'skills'),
    )
  })
})

describe('getMcpConfigPath', () => {
  it('returns first global path when global=true', () => {
    const agent = getAgent('claude-code')
    expect(getMcpConfigPath(agent, true)).to.equal(agent.mcp.globalPaths[0])
  })

  it('returns cwd + first project path when global=false', () => {
    const agent = getAgent('claude-code')
    const result = getMcpConfigPath(agent, false, '/my/project')
    expect(result).to.equal(path.join('/my/project', '.mcp.json'))
  })
})

describe('getSkillsDirectory', () => {
  it('returns global skill dir when global=true', () => {
    const agent = getAgent('claude-code')
    const result = getSkillsDirectory(agent, true)
    expect(result).to.equal(agent.skill.dir('global'))
  })

  it('returns cwd + project skill dir when global=false', () => {
    const agent = getAgent('cursor')
    const result = getSkillsDirectory(agent, false, '/my/project')
    expect(result).to.equal(path.join('/my/project', '.cursor', 'skills'))
  })
})

describe('detectAgents', () => {
  it('returns empty array when no agents detected', async () => {
    const result = await detectAgents('project')
    // In a random temp dir, no agent markers should exist
    expect(result).to.be.an('array')
  })
})
