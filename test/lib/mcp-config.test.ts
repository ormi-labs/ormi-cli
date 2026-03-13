import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect } from 'chai'

import {
  backupConfig,
  configureMcpServer,
  getMcpServerUrl,
  hasMcpServer,
  readMcpConfig,
  unconfigureMcpServer,
} from '../../src/lib/mcp-config.js'

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `ormi-cli-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('mcp-config', () => {
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
