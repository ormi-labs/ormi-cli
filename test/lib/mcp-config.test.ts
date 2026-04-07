import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect } from 'chai'

import type { AgentConfig } from '../../src/lib/types.js'

import {
  appendTomlServer,
  backupConfig,
  buildTomlServerBlock,
  configureAgentMcp,
  configureMcpServer,
  getMcpServerUrl,
  hasMcpServer,
  mergeServerEntry,
  readJsonConfig,
  readMcpConfig,
  removeServerEntry,
  removeTomlServer,
  resolveMcpPath,
  stripJsonComments,
  unconfigureAgentMcp,
  unconfigureMcpServer,
  writeJsonConfig,
} from '../../src/lib/mcp-config.js'

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `ormi-cli-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('mcp-config', () => {
  // =========================================================================
  // New core function tests (Phase 2)
  // =========================================================================

  describe('stripJsonComments', () => {
    it('removes single-line comments', () => {
      const input = '{\n  "key": "value" // comment\n}'
      expect(stripJsonComments(input)).to.equal('{\n  "key": "value" \n}')
    })

    it('removes multi-line comments', () => {
      const input = '{\n  /* comment */\n  "key": "value"\n}'
      expect(stripJsonComments(input)).to.equal('{\n  \n  "key": "value"\n}')
    })

    it('preserves comments inside strings', () => {
      const input = '{"key": "value // not a comment"}'
      expect(stripJsonComments(input)).to.equal(input)
    })

    it('handles escaped quotes in strings', () => {
      const input = '{"key": "value \\" // not comment"}'
      expect(stripJsonComments(input)).to.equal(input)
    })

    it('handles empty string', () => {
      expect(stripJsonComments('')).to.equal('')
    })
  })

  describe('readJsonConfig', () => {
    it('strips comments before parsing', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      writeFileSync(configPath, '{\n  // comment\n  "key": "value"\n}')

      const config = readJsonConfig(configPath)
      expect(config.key).to.equal('value')

      rmSync(dir, { recursive: true })
    })

    it('strips multi-line comments', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      writeFileSync(configPath, '{\n  /* block\n  comment */\n  "key": "value"\n}')

      const config = readJsonConfig(configPath)
      expect(config.key).to.equal('value')

      rmSync(dir, { recursive: true })
    })

    it('returns empty object for nonexistent file', () => {
      expect(readJsonConfig('/nonexistent/path')).to.deep.equal({})
    })

    it('returns empty object for empty file', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'empty.json')
      writeFileSync(configPath, '')

      expect(readJsonConfig(configPath)).to.deep.equal({})

      rmSync(dir, { recursive: true })
    })

    it('throws SyntaxError on invalid JSON', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'bad.json')
      writeFileSync(configPath, '{ not valid json }')

      expect(() => readJsonConfig(configPath)).to.throw(SyntaxError)

      rmSync(dir, { recursive: true })
    })
  })

  describe('writeJsonConfig', () => {
    it('writes JSON with trailing newline', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      writeJsonConfig(configPath, { key: 'value' })

      const content = readFileSync(configPath, 'utf8')
      expect(content.endsWith('\n')).to.be.true
      expect(JSON.parse(content)).to.deep.equal({ key: 'value' })

      rmSync(dir, { recursive: true })
    })

    it('creates parent directories', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'sub', 'dir', 'config.json')
      writeJsonConfig(configPath, { key: 'value' })

      expect(existsSync(configPath)).to.be.true

      rmSync(dir, { recursive: true })
    })
  })

  describe('resolveMcpPath', () => {
    it('returns first existing path', () => {
      const dir = tmpDir()
      const existing = path.join(dir, 'exists.json')
      writeFileSync(existing, '{}')

      expect(resolveMcpPath(['/nonexistent', existing])).to.equal(existing)

      rmSync(dir, { recursive: true })
    })

    it('returns first candidate when none exist', () => {
      expect(resolveMcpPath(['/first', '/second'])).to.equal('/first')
    })
  })

  describe('mergeServerEntry', () => {
    it('merges under mcpServers config key', () => {
      const result = mergeServerEntry({}, 'mcpServers', 'test', {
        url: 'https://example.com',
      })
      expect(
        (result.config.mcpServers as Record<string, unknown>).test,
      ).to.deep.equal({ url: 'https://example.com' })
      expect(result.alreadyExists).to.be.false
    })

    it('merges under mcp config key', () => {
      const result = mergeServerEntry({}, 'mcp', 'test', {
        url: 'https://example.com',
      })
      expect(
        (result.config.mcp as Record<string, unknown>).test,
      ).to.deep.equal({ url: 'https://example.com' })
      expect(result.alreadyExists).to.be.false
    })

    it('merges under mcp_servers config key', () => {
      const result = mergeServerEntry({}, 'mcp_servers', 'test', {
        url: 'https://example.com',
      })
      expect(
        (result.config.mcp_servers as Record<string, unknown>).test,
      ).to.deep.equal({ url: 'https://example.com' })
      expect(result.alreadyExists).to.be.false
    })

    it('detects already existing entry', () => {
      const existing = { mcpServers: { test: { url: 'old' } } }
      const result = mergeServerEntry(existing, 'mcpServers', 'test', {
        url: 'new',
      })
      expect(result.alreadyExists).to.be.true
      expect(
        (result.config.mcpServers as Record<string, unknown>).test,
      ).to.deep.equal({ url: 'new' })
    })

    it('preserves other entries in the same section', () => {
      const existing = {
        mcpServers: { other: { url: 'other' } },
      }
      const result = mergeServerEntry(existing, 'mcpServers', 'test', {
        url: 'new',
      })
      expect(
        (result.config.mcpServers as Record<string, unknown>).other,
      ).to.deep.equal({ url: 'other' })
    })
  })

  describe('removeServerEntry', () => {
    it('removes entry from mcpServers', () => {
      const config = {
        mcpServers: {
          'subgraph-mcp': { url: 'test' },
          other: { url: 'other' },
        },
      }
      const result = removeServerEntry(config, 'mcpServers', 'subgraph-mcp')
      expect(
        (result.mcpServers as Record<string, unknown>).other,
      ).to.exist
      expect(
        (result.mcpServers as Record<string, unknown>)['subgraph-mcp'],
      ).to.be.undefined
    })

    it('removes entry from mcp', () => {
      const config = { mcp: { 'subgraph-mcp': { url: 'test' } } }
      const result = removeServerEntry(config, 'mcp', 'subgraph-mcp')
      expect(result.mcp).to.deep.equal({})
    })

    it('returns unchanged config when server not found', () => {
      const config = { mcpServers: { other: { url: 'test' } } }
      const result = removeServerEntry(config, 'mcpServers', 'subgraph-mcp')
      expect(result).to.deep.equal(config)
    })
  })

  describe('buildTomlServerBlock', () => {
    it('builds correct TOML block', () => {
      const block = buildTomlServerBlock('subgraph-mcp', {
        type: 'http',
        url: 'https://mcp.example.com',
      })
      expect(block).to.equal(
        '[mcp_servers.subgraph-mcp]\ntype = "http"\nurl = "https://mcp.example.com"\n',
      )
    })
  })

  describe('appendTomlServer', () => {
    it('appends TOML block to new file', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'config.toml')

      const result = appendTomlServer(filePath, 'subgraph-mcp', {
        type: 'http',
        url: 'https://mcp.example.com',
      })
      expect(result.alreadyExists).to.be.false

      const content = readFileSync(filePath, 'utf8')
      expect(content).to.include('[mcp_servers.subgraph-mcp]')
      expect(content).to.include('type = "http"')
      expect(content).to.include('url = "https://mcp.example.com"')

      rmSync(dir, { recursive: true })
    })

    it('replaces existing TOML block', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'config.toml')
      writeFileSync(
        filePath,
        '[mcp_servers.subgraph-mcp]\ntype = "http"\nurl = "https://old.com"\n',
      )

      const result = appendTomlServer(filePath, 'subgraph-mcp', {
        type: 'http',
        url: 'https://new.com',
      })
      expect(result.alreadyExists).to.be.true

      const content = readFileSync(filePath, 'utf8')
      expect(content).to.include('url = "https://new.com"')
      expect(content).not.to.include('https://old.com')

      rmSync(dir, { recursive: true })
    })

    it('preserves other TOML sections', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'config.toml')
      writeFileSync(filePath, '[other]\nkey = "value"\n')

      appendTomlServer(filePath, 'subgraph-mcp', {
        type: 'http',
        url: 'https://mcp.example.com',
      })

      const content = readFileSync(filePath, 'utf8')
      expect(content).to.include('[other]')
      expect(content).to.include('[mcp_servers.subgraph-mcp]')

      rmSync(dir, { recursive: true })
    })
  })

  describe('removeTomlServer', () => {
    it('removes TOML block from file', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'config.toml')
      writeFileSync(
        filePath,
        '[mcp_servers.subgraph-mcp]\ntype = "http"\nurl = "https://mcp.example.com"\n',
      )

      const result = removeTomlServer(filePath, 'subgraph-mcp')
      expect(result.removed).to.be.true

      const content = readFileSync(filePath, 'utf8')
      expect(content).not.to.include('[mcp_servers.subgraph-mcp]')

      rmSync(dir, { recursive: true })
    })

    it('preserves other sections when removing', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'config.toml')
      writeFileSync(
        filePath,
        '[other]\nkey = "value"\n\n[mcp_servers.subgraph-mcp]\ntype = "http"\nurl = "https://mcp.example.com"\n',
      )

      const result = removeTomlServer(filePath, 'subgraph-mcp')
      expect(result.removed).to.be.true

      const content = readFileSync(filePath, 'utf8')
      expect(content).to.include('[other]')
      expect(content).not.to.include('[mcp_servers.subgraph-mcp]')

      rmSync(dir, { recursive: true })
    })

    it('returns removed:false when block not found', () => {
      const dir = tmpDir()
      const filePath = path.join(dir, 'config.toml')
      writeFileSync(filePath, '[other]\nkey = "value"\n')

      const result = removeTomlServer(filePath, 'subgraph-mcp')
      expect(result.removed).to.be.false

      rmSync(dir, { recursive: true })
    })

    it('returns removed:false when file does not exist', () => {
      const result = removeTomlServer('/nonexistent/path', 'subgraph-mcp')
      expect(result.removed).to.be.false
    })
  })

  describe('configureAgentMcp', () => {
    const mockAgent: AgentConfig = {
      name: 'claude-code',
      displayName: 'Claude Code',
      mcp: {
        buildEntry: (url: string) => ({ type: 'http', url }),
        configKey: 'mcpServers',
        globalPaths: [],
        projectPaths: [],
      },
      skill: { dir: () => '' },
      detect: { globalPaths: [], projectPaths: [] },
    }

    it('writes JSON config with agent-specific entry format', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, '.mcp.json')
      const agent: AgentConfig = {
        ...mockAgent,
        mcp: {
          ...mockAgent.mcp,
          globalPaths: [configPath],
        },
      }

      const result = configureAgentMcp(
        agent,
        'global',
        'https://mcp.example.com',
      )
      expect(result.success).to.be.true
      expect(result.added).to.be.true

      const config = readJsonConfig(configPath)
      const servers = config.mcpServers as Record<string, unknown>
      const entry = servers['subgraph-mcp'] as Record<string, unknown>
      expect(entry.type).to.equal('http')
      expect(entry.url).to.equal('https://mcp.example.com')

      rmSync(dir, { recursive: true })
    })

    it('writes TOML config for .toml paths', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'config.toml')
      const agent: AgentConfig = {
        ...mockAgent,
        mcp: {
          ...mockAgent.mcp,
          configKey: 'mcp_servers',
          globalPaths: [configPath],
        },
      }

      const result = configureAgentMcp(
        agent,
        'global',
        'https://mcp.example.com',
      )
      expect(result.success).to.be.true

      const content = readFileSync(configPath, 'utf8')
      expect(content).to.include('[mcp_servers.subgraph-mcp]')

      rmSync(dir, { recursive: true })
    })

    it('uses custom server name for admin', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, '.mcp.json')
      const agent: AgentConfig = {
        ...mockAgent,
        mcp: {
          ...mockAgent.mcp,
          globalPaths: [configPath],
        },
      }

      configureAgentMcp(
        agent,
        'global',
        'https://admin.example.com',
        'admin-mcp',
      )

      const config = readJsonConfig(configPath)
      const servers = config.mcpServers as Record<string, unknown>
      expect(servers['admin-mcp']).to.exist
      expect(servers['subgraph-mcp']).to.be.undefined

      rmSync(dir, { recursive: true })
    })

    it('detects already existing entry', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, '.mcp.json')
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            'subgraph-mcp': { type: 'http', url: 'https://old.com' },
          },
        }),
      )

      const agent: AgentConfig = {
        ...mockAgent,
        mcp: {
          ...mockAgent.mcp,
          globalPaths: [configPath],
        },
      }

      const result = configureAgentMcp(
        agent,
        'global',
        'https://mcp.example.com',
      )
      expect(result.success).to.be.true
      expect(result.added).to.be.false
      expect(result.updated).to.be.true

      rmSync(dir, { recursive: true })
    })

    it('uses Cursor-specific entry format (no type field)', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'mcp.json')
      const agent: AgentConfig = {
        ...mockAgent,
        mcp: {
          buildEntry: (url: string) => ({ url }),
          configKey: 'mcpServers',
          globalPaths: [configPath],
          projectPaths: [configPath],
        },
      }

      configureAgentMcp(agent, 'global', 'https://mcp.example.com')

      const config = readJsonConfig(configPath)
      const servers = config.mcpServers as Record<string, unknown>
      const entry = servers['subgraph-mcp'] as Record<string, unknown>
      expect(entry.url).to.equal('https://mcp.example.com')
      expect(entry.type).to.be.undefined

      rmSync(dir, { recursive: true })
    })

    it('uses Gemini-specific entry format (httpUrl)', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      const agent: AgentConfig = {
        ...mockAgent,
        mcp: {
          buildEntry: (url: string) => ({ httpUrl: url }),
          configKey: 'mcpServers',
          globalPaths: [configPath],
          projectPaths: [configPath],
        },
      }

      configureAgentMcp(agent, 'global', 'https://mcp.example.com')

      const config = readJsonConfig(configPath)
      const servers = config.mcpServers as Record<string, unknown>
      const entry = servers['subgraph-mcp'] as Record<string, unknown>
      expect(entry.httpUrl).to.equal('https://mcp.example.com')

      rmSync(dir, { recursive: true })
    })

    it('uses OpenCode-specific config key and entry format', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'opencode.json')
      const agent: AgentConfig = {
        ...mockAgent,
        mcp: {
          buildEntry: (url: string) => ({
            enabled: true,
            type: 'remote',
            url,
          }),
          configKey: 'mcp',
          globalPaths: [configPath],
          projectPaths: [configPath],
        },
      }

      configureAgentMcp(agent, 'global', 'https://mcp.example.com')

      const config = readJsonConfig(configPath)
      const servers = config.mcp as Record<string, unknown>
      const entry = servers['subgraph-mcp'] as Record<string, unknown>
      expect(entry.type).to.equal('remote')
      expect(entry.enabled).to.equal(true)
      expect(entry.url).to.equal('https://mcp.example.com')

      rmSync(dir, { recursive: true })
    })
  })

  describe('unconfigureAgentMcp', () => {
    const mockAgent: AgentConfig = {
      name: 'claude-code',
      displayName: 'Claude Code',
      mcp: {
        buildEntry: (url: string) => ({ type: 'http', url }),
        configKey: 'mcpServers',
        globalPaths: [],
        projectPaths: [],
      },
      skill: { dir: () => '' },
      detect: { globalPaths: [], projectPaths: [] },
    }

    it('removes JSON config entry', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, '.mcp.json')
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            'subgraph-mcp': { type: 'http', url: 'https://mcp.example.com' },
          },
        }),
      )

      const agent: AgentConfig = {
        ...mockAgent,
        mcp: {
          ...mockAgent.mcp,
          globalPaths: [configPath],
        },
      }

      const result = unconfigureAgentMcp(agent, 'global')
      expect(result.success).to.be.true
      expect(result.removed).to.be.true

      const config = readJsonConfig(configPath)
      const servers = config.mcpServers as Record<string, unknown>
      expect(servers['subgraph-mcp']).to.be.undefined

      rmSync(dir, { recursive: true })
    })

    it('removes TOML config entry', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'config.toml')
      writeFileSync(
        configPath,
        '[mcp_servers.subgraph-mcp]\ntype = "http"\nurl = "https://mcp.example.com"\n',
      )

      const agent: AgentConfig = {
        ...mockAgent,
        mcp: {
          ...mockAgent.mcp,
          configKey: 'mcp_servers',
          globalPaths: [configPath],
        },
      }

      const result = unconfigureAgentMcp(agent, 'global')
      expect(result.success).to.be.true
      expect(result.removed).to.be.true

      const content = readFileSync(configPath, 'utf8')
      expect(content).not.to.include('[mcp_servers.subgraph-mcp]')

      rmSync(dir, { recursive: true })
    })

    it('returns success when config not found', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'nonexistent.json')
      const agent: AgentConfig = {
        ...mockAgent,
        mcp: {
          ...mockAgent.mcp,
          globalPaths: [configPath],
        },
      }

      const result = unconfigureAgentMcp(agent, 'global')
      expect(result.success).to.be.true
      expect(result.removed).to.be.false

      rmSync(dir, { recursive: true })
    })
  })

  // =========================================================================
  // Backward-compatible wrapper tests (original Phase 1 tests)
  // =========================================================================

  describe('backupConfig', () => {
    it('creates a .ormi-cli-backup copy of an existing file', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      writeFileSync(configPath, '{"mcpServers":{}}')

      backupConfig(configPath)

      expect(existsSync(configPath + '.ormi-cli-backup')).to.be.true
      expect(readFileSync(configPath + '.ormi-cli-backup', 'utf8')).to.equal('{"mcpServers":{}}')

      rmSync(dir, { recursive: true })
    })

    it('does nothing when file does not exist', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'nonexistent.json')

      // Should not throw
      backupConfig(configPath)
      expect(existsSync(configPath + '.ormi-cli-backup')).to.be.false

      rmSync(dir, { recursive: true })
    })
  })

  describe('getMcpServerUrl', () => {
    it('returns url for configured server', () => {
      const config = { mcpServers: { 'subgraph-mcp': { type: 'http', url: 'https://example.com' } } }
      expect(getMcpServerUrl(config)).to.equal('https://example.com')
    })

    it('returns undefined when server not configured', () => {
      expect(getMcpServerUrl({})).to.be.undefined
    })
  })

  describe('readMcpConfig', () => {
    it('returns empty object when file does not exist', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'nonexistent.json')

      expect(readMcpConfig(configPath)).to.deep.equal({})

      rmSync(dir, { recursive: true })
    })

    it('throws SyntaxError on invalid JSON', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      writeFileSync(configPath, '{ not valid json }')

      expect(() => readMcpConfig(configPath)).to.throw(SyntaxError)

      rmSync(dir, { recursive: true })
    })
  })

  describe('configureMcpServer', () => {
    it('creates .mcp.json with correct format when file does not exist', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, '.mcp.json')

      const result = configureMcpServer(configPath, 'https://mcp.example.com')

      expect(result.success).to.be.true
      expect(result.added).to.be.true

      const config = readMcpConfig(configPath)
      expect(config.mcpServers?.['subgraph-mcp']?.type).to.equal('http')
      expect(config.mcpServers?.['subgraph-mcp']?.url).to.equal('https://mcp.example.com')

      rmSync(dir, { recursive: true })
    })

    it('merges into existing config without overwriting other servers', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, '.mcp.json')
      writeFileSync(configPath, JSON.stringify({
        mcpServers: { 'other-server': { type: 'http', url: 'https://other.com' } },
      }))

      const result = configureMcpServer(configPath, 'https://mcp.example.com')

      expect(result.success).to.be.true
      expect(result.added).to.be.true

      const config = readMcpConfig(configPath)
      expect(config.mcpServers?.['subgraph-mcp']?.url).to.equal('https://mcp.example.com')
      expect(config.mcpServers?.['other-server']?.url).to.equal('https://other.com')

      rmSync(dir, { recursive: true })
    })

    it('returns success:false and does not write when JSON is invalid', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      const corrupt = '{ not valid json }'
      writeFileSync(configPath, corrupt)

      const result = configureMcpServer(configPath, 'https://mcp.example.com')

      expect(result.success).to.be.false
      // File must be untouched — corrupt content preserved
      expect(readFileSync(configPath, 'utf8')).to.equal(corrupt)

      rmSync(dir, { recursive: true })
    })
  })

  describe('unconfigureMcpServer', () => {
    it('removes subgraph-mcp from config', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      writeFileSync(configPath, JSON.stringify({
        mcpServers: {
          'subgraph-mcp': { type: 'http', url: 'https://mcp.example.com' },
          'other-server': { type: 'http', url: 'https://other.com' },
        },
      }))

      const result = unconfigureMcpServer(configPath)

      expect(result.success).to.be.true
      expect(result.removed).to.be.true

      const config = readMcpConfig(configPath)
      expect(hasMcpServer(config)).to.be.false
      expect(config.mcpServers?.['other-server']).to.exist

      rmSync(dir, { recursive: true })
    })

    it('returns success when server was not configured', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      writeFileSync(configPath, JSON.stringify({ mcpServers: {} }))

      const result = unconfigureMcpServer(configPath)

      expect(result.success).to.be.true
      expect(result.removed).to.be.false

      rmSync(dir, { recursive: true })
    })

    it('returns success when config file does not exist', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'nonexistent.json')

      const result = unconfigureMcpServer(configPath)

      expect(result.success).to.be.true
      expect(result.removed).to.be.false

      rmSync(dir, { recursive: true })
    })

    it('creates a backup before removing', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      const original = JSON.stringify({ mcpServers: { 'subgraph-mcp': { type: 'http', url: 'https://mcp.example.com' } } })
      writeFileSync(configPath, original)

      unconfigureMcpServer(configPath)

      expect(existsSync(configPath + '.ormi-cli-backup')).to.be.true
      expect(readFileSync(configPath + '.ormi-cli-backup', 'utf8')).to.equal(original)

      rmSync(dir, { recursive: true })
    })
  })
})
