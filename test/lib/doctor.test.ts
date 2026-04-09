import { expect } from 'chai'

import {
  parseTomlSection,
  validateMcpEntryFormat,
} from '../../src/commands/ai/doctor.js'

const URL = 'https://mcp.subgraph.ormilabs.com'

describe('validateMcpEntryFormat', () => {
  describe('claude-code', () => {
    it('accepts correct format: { type: "http", url }', () => {
      const errors = validateMcpEntryFormat('claude-code', { type: 'http', url: URL }, URL)
      expect(errors).to.deep.equal([])
    })

    it('rejects missing type', () => {
      const errors = validateMcpEntryFormat('claude-code', { url: URL }, URL)
      expect(errors.length).to.be.greaterThan(0)
    })

    it('rejects wrong url', () => {
      const errors = validateMcpEntryFormat('claude-code', { type: 'http', url: 'https://wrong.example.com' }, URL)
      expect(errors.length).to.be.greaterThan(0)
    })
  })

  describe('codex', () => {
    it('accepts correct format: { type: "http", url }', () => {
      const errors = validateMcpEntryFormat('codex', { type: 'http', url: URL }, URL)
      expect(errors).to.deep.equal([])
    })

    it('rejects missing type', () => {
      const errors = validateMcpEntryFormat('codex', { url: URL }, URL)
      expect(errors.length).to.be.greaterThan(0)
    })
  })

  describe('cursor', () => {
    it('accepts correct format: { url } — no type field', () => {
      const errors = validateMcpEntryFormat('cursor', { url: URL }, URL)
      expect(errors).to.deep.equal([])
    })

    it('rejects presence of type field (legacy format)', () => {
      const errors = validateMcpEntryFormat('cursor', { type: 'http', url: URL }, URL)
      expect(errors.length).to.be.greaterThan(0)
      expect(errors[0]).to.include('must not have "type"')
    })

    it('rejects wrong url', () => {
      const errors = validateMcpEntryFormat('cursor', { url: 'https://wrong.example.com' }, URL)
      expect(errors.length).to.be.greaterThan(0)
    })
  })

  describe('gemini-cli', () => {
    it('accepts correct format: { httpUrl }', () => {
      const errors = validateMcpEntryFormat('gemini-cli', { httpUrl: URL }, URL)
      expect(errors).to.deep.equal([])
    })

    it('rejects legacy format using url instead of httpUrl', () => {
      const errors = validateMcpEntryFormat('gemini-cli', { url: URL }, URL)
      expect(errors.length).to.be.greaterThan(0)
      expect(errors.some(e => e.includes('httpUrl'))).to.be.true
    })

    it('rejects wrong httpUrl value', () => {
      const errors = validateMcpEntryFormat('gemini-cli', { httpUrl: 'https://wrong.example.com' }, URL)
      expect(errors.length).to.be.greaterThan(0)
    })
  })

  describe('opencode', () => {
    it('accepts correct format: { type: "remote", url, enabled: true }', () => {
      const errors = validateMcpEntryFormat('opencode', { type: 'remote', url: URL, enabled: true }, URL)
      expect(errors).to.deep.equal([])
    })

    it('rejects missing enabled field', () => {
      const errors = validateMcpEntryFormat('opencode', { type: 'remote', url: URL }, URL)
      expect(errors.length).to.be.greaterThan(0)
    })

    it('rejects wrong type', () => {
      const errors = validateMcpEntryFormat('opencode', { type: 'http', url: URL, enabled: true }, URL)
      expect(errors.length).to.be.greaterThan(0)
    })
  })
})

describe('parseTomlSection', () => {
  it('parses string values', () => {
    const result = parseTomlSection('type = "http"\nurl = "https://example.com"\n')
    expect(result).to.deep.equal({ type: 'http', url: 'https://example.com' })
  })

  it('parses boolean values', () => {
    const result = parseTomlSection('enabled = true\n')
    expect(result).to.deep.equal({ enabled: true })
  })

  it('stops at next section header', () => {
    const result = parseTomlSection('url = "https://example.com"\n[other-section]\ntype = "stdio"\n')
    expect(result).to.deep.equal({ url: 'https://example.com' })
  })

  it('handles leading newlines (as produced by appendTomlServer)', () => {
    const result = parseTomlSection('\ntype = "http"\nurl = "https://example.com"\n')
    expect(result).to.deep.equal({ type: 'http', url: 'https://example.com' })
  })
})

describe('Codex TOML format validation via validateMcpEntryFormat', () => {
  const URL = 'https://mcp.subgraph.ormilabs.com'

  it('accepts correct Codex TOML entry: { type: "http", url }', () => {
    const entry = parseTomlSection('type = "http"\nurl = "https://mcp.subgraph.ormilabs.com"\n')
    const errors = validateMcpEntryFormat('codex', entry, URL)
    expect(errors).to.deep.equal([])
  })

  it('rejects Codex TOML with wrong type', () => {
    const entry = parseTomlSection('type = "stdio"\nurl = "https://mcp.subgraph.ormilabs.com"\n')
    const errors = validateMcpEntryFormat('codex', entry, URL)
    expect(errors.length).to.be.greaterThan(0)
  })

  it('rejects Codex TOML with wrong url', () => {
    const entry = parseTomlSection('type = "http"\nurl = "https://wrong.example.com"\n')
    const errors = validateMcpEntryFormat('codex', entry, URL)
    expect(errors.length).to.be.greaterThan(0)
  })
})
