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
    it('returns url for claude format', () => {
      const config = { mcpServers: { 'subgraph-mcp': { url: 'https://example.com' } } }
      expect(getMcpServerUrl(config, 'claude')).to.equal('https://example.com')
    })

    it('returns url for vscode format', () => {
      const config = { mcp: { servers: { 'subgraph-mcp': { type: 'http', url: 'https://example.com' } } } }
      expect(getMcpServerUrl(config, 'vscode')).to.equal('https://example.com')
    })

    it('returns serverUrl for windsurf format', () => {
      const config = { mcpServers: { 'subgraph-mcp': { serverUrl: 'https://example.com' } } }
      expect(getMcpServerUrl(config, 'windsurf')).to.equal('https://example.com')
    })

    it('returns undefined when server not configured', () => {
      expect(getMcpServerUrl({}, 'claude')).to.be.undefined
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
    it('returns success:false and does not write when JSON is invalid', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      const corrupt = '{ not valid json }'
      writeFileSync(configPath, corrupt)

      const result = configureMcpServer(configPath, 'claude', 'https://mcp.example.com')

      expect(result.success).to.be.false
      // File must be untouched — corrupt content preserved
      expect(readFileSync(configPath, 'utf8')).to.equal(corrupt)

      rmSync(dir, { recursive: true })
    })
  })

  describe('unconfigureMcpServer', () => {
    it('removes subgraph-mcp from claude format', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      writeFileSync(configPath, JSON.stringify({
        mcpServers: {
          'subgraph-mcp': { url: 'https://mcp.example.com' },
          'other-server': { url: 'https://other.com' },
        },
      }))

      const result = unconfigureMcpServer(configPath, 'claude')

      expect(result.success).to.be.true
      expect(result.removed).to.be.true

      const config = readMcpConfig(configPath)
      expect(hasMcpServer(config, 'claude')).to.be.false
      expect(config.mcpServers?.['other-server']).to.exist

      rmSync(dir, { recursive: true })
    })

    it('returns success when server was not configured', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      writeFileSync(configPath, JSON.stringify({ mcpServers: {} }))

      const result = unconfigureMcpServer(configPath, 'claude')

      expect(result.success).to.be.true
      expect(result.removed).to.be.false

      rmSync(dir, { recursive: true })
    })

    it('returns success when config file does not exist', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'nonexistent.json')

      const result = unconfigureMcpServer(configPath, 'claude')

      expect(result.success).to.be.true
      expect(result.removed).to.be.false

      rmSync(dir, { recursive: true })
    })

    it('creates a backup before removing', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'settings.json')
      const original = JSON.stringify({ mcpServers: { 'subgraph-mcp': { url: 'https://mcp.example.com' } } })
      writeFileSync(configPath, original)

      unconfigureMcpServer(configPath, 'claude')

      expect(existsSync(configPath + '.ormi-cli-backup')).to.be.true
      expect(readFileSync(configPath + '.ormi-cli-backup', 'utf8')).to.equal(original)

      rmSync(dir, { recursive: true })
    })

    it('removes subgraph-mcp from vscode format', () => {
      const dir = tmpDir()
      const configPath = path.join(dir, 'mcp.json')
      writeFileSync(configPath, JSON.stringify({
        mcp: { servers: { 'subgraph-mcp': { type: 'http', url: 'https://mcp.example.com' } } },
      }))

      const result = unconfigureMcpServer(configPath, 'vscode')

      expect(result.success).to.be.true
      expect(result.removed).to.be.true

      const config = readMcpConfig(configPath)
      expect(hasMcpServer(config, 'vscode')).to.be.false

      rmSync(dir, { recursive: true })
    })
  })
})
