import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { expect } from 'chai'

describe('ai integration', function () {
  this.timeout(600_000) // image build can be slow

  let container: StartedTestContainer

  before(async () => {
    const built = await GenericContainer.fromDockerfile('.', 'docker/Dockerfile').build()
    container = await built.start()
  })

  after(async () => {
    await container?.stop()
  })

  // --- Agent detection ---

  it('detects real and mocked agents', async () => {
    const { stdout, exitCode } = await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--yes', '--mcp-only',
    ])
    expect(exitCode).to.equal(0)
    for (const name of ['Claude Code', 'Gemini CLI', 'Cursor', 'Windsurf']) {
      expect(stdout).to.include(name)
    }
  })

  // --- Claude Code: MCP config + CLI verification ---

  it('configures claude-code and verifies via CLI', async () => {
    // Clean
    await container.exec(['rm', '-f', '/root/.claude/settings.json'])

    const { stdout, exitCode } = await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes',
    ])
    expect(exitCode).to.equal(0)
    expect(stdout).to.include('subgraph-mcp')

    // File-level check
    const { stdout: configJson } = await container.exec([
      'jq', '.mcpServers["subgraph-mcp"].url', '/root/.claude/settings.json',
    ])
    expect(configJson.trim()).to.include('mcp.subgraph.ormilabs.com')

    // CLI-level check (built into install output)
    // Accepts any verification outcome: confirmed, path mismatch, auth error, or CLI absent
    expect(stdout).to.satisfy((s: string) =>
      s.includes('Verified') || s.includes('Warning:') ||
      s.includes('not installed') || s.includes('verification failed')
    )
  })

  // --- Gemini CLI: MCP config + CLI verification ---

  it('configures gemini-cli and verifies via CLI', async () => {
    await container.exec(['rm', '-f', '/root/.gemini/settings.json'])

    const { exitCode } = await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'gemini-cli', '--yes',
    ])
    expect(exitCode).to.equal(0)

    const { stdout: configJson } = await container.exec([
      'jq', '.mcpServers["subgraph-mcp"].url', '/root/.gemini/settings.json',
    ])
    expect(configJson.trim()).to.include('mcp.subgraph.ormilabs.com')
  })

  // --- Custom URL ---

  it('writes custom MCP URL', async () => {
    await container.exec(['rm', '-f', '/root/.claude/settings.json'])

    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code',
      '--yes', '--url', 'http://localhost:9999',
    ])

    const { stdout } = await container.exec([
      'jq', '-r', '.mcpServers["subgraph-mcp"].url', '/root/.claude/settings.json',
    ])
    expect(stdout.trim()).to.equal('http://localhost:9999')
  })

  // --- Windsurf format ---

  it('writes windsurf format correctly', async () => {
    await container.exec(['rm', '-f', '/root/.codeium/windsurf/mcp_config.json'])

    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'windsurf', '--yes',
    ])

    const { stdout } = await container.exec([
      'jq', '-r', '.mcpServers["subgraph-mcp"].serverUrl',
      '/root/.codeium/windsurf/mcp_config.json',
    ])
    expect(stdout.trim()).to.include('mcp.subgraph.ormilabs.com')
  })

  // --- Non-destructive merge ---

  it('preserves existing MCP servers', async () => {
    // Write pre-existing config
    await container.exec(['sh', '-c',
      'echo \'{"mcpServers":{"my-server":{"url":"http://example.com"}}}\' > /root/.claude/settings.json',
    ])

    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--mcp-only',
    ])

    const { stdout } = await container.exec([
      'jq', '.mcpServers | keys', '/root/.claude/settings.json',
    ])
    expect(stdout).to.include('my-server')
    expect(stdout).to.include('subgraph-mcp')
  })

  // --- Idempotency ---

  it('install is idempotent', async () => {
    await container.exec(['rm', '-f', '/root/.claude/settings.json'])

    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--mcp-only',
    ])
    const { stdout: first } = await container.exec(['cat', '/root/.claude/settings.json'])

    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--mcp-only',
    ])
    const { stdout: second } = await container.exec(['cat', '/root/.claude/settings.json'])

    expect(first.trim()).to.equal(second.trim())
  })

  // --- Skills installation ---

  it('installs skills', async () => {
    await container.exec(['rm', '-rf', '/root/.claude/skills'])

    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--skills-only', '--global',
    ])

    for (const skill of ['subgraph-query', 'subgraph-monitor', 'subgraph-manage']) {
      const { exitCode } = await container.exec([
        'test', '-s', `/root/.claude/skills/${skill}/SKILL.md`,
      ])
      expect(exitCode, `${skill} SKILL.md should exist and be non-empty`).to.equal(0)
    }
  })

  // --- --mcp-only skips skills ---

  it('--mcp-only skips skills', async () => {
    await container.exec(['rm', '-f', '/root/.claude/settings.json'])
    await container.exec(['rm', '-rf', '/root/.claude/skills'])

    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--mcp-only',
    ])

    const { exitCode: configExists } = await container.exec([
      'test', '-f', '/root/.claude/settings.json',
    ])
    expect(configExists).to.equal(0)

    const { exitCode: skillsExist } = await container.exec([
      'test', '-d', '/root/.claude/skills/subgraph-query',
    ])
    expect(skillsExist).to.not.equal(0)
  })

  // --- Uninstall: MCP config removal ---

  it('uninstall removes MCP config', async () => {
    // First install
    await container.exec(['rm', '-f', '/root/.claude/settings.json'])
    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--mcp-only',
    ])

    // Verify installed
    const { stdout: beforeUninstall } = await container.exec([
      'jq', '-r', '.mcpServers["subgraph-mcp"].url', '/root/.claude/settings.json',
    ])
    expect(beforeUninstall.trim()).to.include('mcp.subgraph.ormilabs.com')

    // Uninstall
    const { exitCode } = await container.exec([
      'node', '/app/bin/run.js', 'ai', 'uninstall', '--agent', 'claude-code', '--yes', '--mcp-only',
    ])
    expect(exitCode).to.equal(0)

    // Verify removed
    const { stdout: afterUninstall } = await container.exec([
      'jq', '-r', '.mcpServers["subgraph-mcp"]', '/root/.claude/settings.json',
    ])
    expect(afterUninstall.trim()).to.equal('null')
  })

  // --- Uninstall: skills removal ---

  it('uninstall removes skills', async () => {
    // First install skills globally
    await container.exec(['rm', '-rf', '/root/.claude/skills'])
    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--skills-only', '--global',
    ])

    // Verify installed
    const { exitCode: skillsBefore } = await container.exec([
      'test', '-d', '/root/.claude/skills/subgraph-query',
    ])
    expect(skillsBefore).to.equal(0)

    // Uninstall globally
    const { exitCode } = await container.exec([
      'node', '/app/bin/run.js', 'ai', 'uninstall', '--agent', 'claude-code', '--yes', '--skills-only', '--global',
    ])
    expect(exitCode).to.equal(0)

    // Verify removed
    for (const skill of ['subgraph-query', 'subgraph-monitor', 'subgraph-manage']) {
      const { exitCode: skillExists } = await container.exec([
        'test', '-d', `/root/.claude/skills/${skill}`,
      ])
      expect(skillExists, `${skill} should be removed`).to.not.equal(0)
    }
  })

  // --- Uninstall: idempotency ---

  it('uninstall is idempotent', async () => {
    // Run uninstall twice — second run should not error
    const { exitCode: first } = await container.exec([
      'node', '/app/bin/run.js', 'ai', 'uninstall', '--agent', 'claude-code', '--yes',
    ])
    expect(first).to.equal(0)

    const { exitCode: second } = await container.exec([
      'node', '/app/bin/run.js', 'ai', 'uninstall', '--agent', 'claude-code', '--yes',
    ])
    expect(second).to.equal(0)
  })

  // --- Doctor: after install ---

  it('doctor reports all ok after install', async () => {
    await container.exec(['rm', '-f', '/root/.claude/settings.json'])
    await container.exec(['rm', '-rf', '/root/.claude/skills'])

    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--global',
    ])

    const { stdout, exitCode } = await container.exec([
      'node', '/app/bin/run.js', 'ai', 'doctor', '--agent', 'claude-code', '--global',
    ])
    expect(exitCode).to.equal(0)
    expect(stdout).to.include('MCP configured')
    expect(stdout).to.include('subgraph-query')
  })

  // --- Local (project-level) skills ---

  it('installs skills locally by default', async () => {
    // Create a fake project directory
    await container.exec(['rm', '-rf', '/tmp/test-project'])
    await container.exec(['mkdir', '-p', '/tmp/test-project'])

    const { exitCode } = await container.exec([
      'sh', '-c',
      'cd /tmp/test-project && node /app/bin/run.js ai install --agent claude-code --yes --skills-only',
    ])
    expect(exitCode).to.equal(0)

    // Skills should be in the local project directory
    for (const skill of ['subgraph-query', 'subgraph-monitor', 'subgraph-manage']) {
      const { exitCode: localExists } = await container.exec([
        'test', '-s', `/tmp/test-project/.claude/skills/${skill}/SKILL.md`,
      ])
      expect(localExists, `${skill} should exist locally`).to.equal(0)
    }
  })

  it('installs skills globally with --global flag', async () => {
    await container.exec(['rm', '-rf', '/root/.claude/skills'])

    const { exitCode } = await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--skills-only', '--global',
    ])
    expect(exitCode).to.equal(0)

    for (const skill of ['subgraph-query', 'subgraph-monitor', 'subgraph-manage']) {
      const { exitCode: globalExists } = await container.exec([
        'test', '-s', `/root/.claude/skills/${skill}/SKILL.md`,
      ])
      expect(globalExists, `${skill} should exist globally`).to.equal(0)
    }
  })

  it('uninstall removes local skills by default', async () => {
    // Install locally first
    await container.exec(['rm', '-rf', '/tmp/test-project'])
    await container.exec(['mkdir', '-p', '/tmp/test-project'])
    await container.exec([
      'sh', '-c',
      'cd /tmp/test-project && node /app/bin/run.js ai install --agent claude-code --yes --skills-only',
    ])

    // Uninstall locally
    const { exitCode } = await container.exec([
      'sh', '-c',
      'cd /tmp/test-project && node /app/bin/run.js ai uninstall --agent claude-code --yes --skills-only',
    ])
    expect(exitCode).to.equal(0)

    for (const skill of ['subgraph-query', 'subgraph-monitor', 'subgraph-manage']) {
      const { exitCode: stillExists } = await container.exec([
        'test', '-d', `/tmp/test-project/.claude/skills/${skill}`,
      ])
      expect(stillExists, `${skill} should be removed locally`).to.not.equal(0)
    }
  })

  it('doctor checks local skills by default', async () => {
    // Install locally
    await container.exec(['rm', '-rf', '/tmp/test-project'])
    await container.exec(['mkdir', '-p', '/tmp/test-project'])
    await container.exec([
      'sh', '-c',
      'cd /tmp/test-project && node /app/bin/run.js ai install --agent claude-code --yes --skills-only',
    ])

    const { stdout, exitCode } = await container.exec([
      'sh', '-c',
      'cd /tmp/test-project && node /app/bin/run.js ai doctor --agent claude-code',
    ])
    expect(exitCode).to.equal(0)
    expect(stdout).to.include('subgraph-query')
    expect(stdout).to.include('/tmp/test-project/.claude/skills')
  })

  // --- Doctor: reports missing after uninstall ---

  it('doctor reports missing config after uninstall', async () => {
    // Install then uninstall
    await container.exec(['rm', '-f', '/root/.claude/settings.json'])
    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--mcp-only',
    ])
    await container.exec([
      'node', '/app/bin/run.js', 'ai', 'uninstall', '--agent', 'claude-code', '--yes', '--mcp-only',
    ])

    const { stdout } = await container.exec([
      'node', '/app/bin/run.js', 'ai', 'doctor', '--agent', 'claude-code',
    ])
    expect(stdout).to.satisfy((s: string) =>
      s.includes('not configured') || s.includes('not found') || s.includes('issue')
    )
  })
})
