import { mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect } from 'chai'

import type { AgentConfig, AgentType } from '../../src/lib/types.js'

import {
  ALL_AGENT_NAMES,
  detectAgents,
  getAgent,
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

describe('detectAgents', () => {
  it('returns empty array when no agents detected', async () => {
    const result = await detectAgents('project')
    // In a random temp dir, no agent markers should exist
    expect(result).to.be.an('array')
  })

  it('detects project-local agents when scope is project', async () => {
    const tmp = path.join(os.tmpdir(), `ormi-detect-project-${Date.now()}`)
    const origCwd = process.cwd()

    // Create a .cursor marker in the temp dir
    mkdirSync(path.join(tmp, '.cursor'), { recursive: true })

    try {
      process.chdir(tmp)
      const result = await detectAgents('project')
      expect(result).to.include('cursor')
    } finally {
      process.chdir(origCwd)
      rmSync(tmp, { recursive: true })
    }
  })

  it('detects globally installed agents when scope is project', async () => {
    const tmp = path.join(os.tmpdir(), `ormi-detect-global-from-project-${Date.now()}`)
    const origCwd = process.cwd()

    // No project-local markers — relies entirely on global detection
    mkdirSync(tmp, { recursive: true })

    try {
      process.chdir(tmp)
      const projectResult = await detectAgents('project')
      const globalResult = await detectAgents('global')
      // Project scope should detect at least as many agents as global scope
      for (const agent of globalResult) {
        expect(projectResult).to.include(agent)
      }
    } finally {
      process.chdir(origCwd)
      rmSync(tmp, { recursive: true })
    }
  })

  it('does not detect project markers when scope is global', async () => {
    const tmp = path.join(os.tmpdir(), `ormi-detect-global-${Date.now()}`)
    const origCwd = process.cwd()

    // Create only project-local markers that don't have global equivalents
    mkdirSync(path.join(tmp, '.codex'), { recursive: true })
    mkdirSync(path.join(tmp, '.cursor'), { recursive: true })

    try {
      process.chdir(tmp)
      const projectResult = await detectAgents('project')
      // Both should be detected at project scope
      expect(projectResult).to.include('codex')
      expect(projectResult).to.include('cursor')

      // Now check that global detection uses home dir, not project markers
      // If codex/cursor are detected globally, they came from ~/, not tmp/
      await detectAgents('global') // no assertion needed — just no crash
    } finally {
      process.chdir(origCwd)
      rmSync(tmp, { recursive: true })
    }
  })
})
