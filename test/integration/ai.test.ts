import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { expect } from 'chai'

import { BUNDLED_SKILLS } from '../../src/lib/skills.js'

describe('ai integration', function () {
  this.timeout(600_000) // image build can be slow

  let container: StartedTestContainer
  const testProjectPath = '/tmp/test-project'

  async function exec(
    argv: string[],
  ): Promise<{ exitCode: number; stderr: string; stdout: string }> {
    return container.exec(argv)
  }

  async function execInProject(
    projectPath: string,
    command: string,
  ): Promise<{ exitCode: number; stderr: string; stdout: string }> {
    return exec(['sh', '-c', `cd ${projectPath} && ${command}`])
  }

  async function resetProject(projectPath: string): Promise<void> {
    await exec(['rm', '-rf', projectPath])
    await exec(['mkdir', '-p', projectPath])
  }

  async function expectPathExists(path_: string): Promise<void> {
    const { exitCode } = await exec(['test', '-e', path_])
    expect(exitCode).to.equal(0)
  }

  async function expectPathMissing(path_: string): Promise<void> {
    const { exitCode } = await exec(['test', '-e', path_])
    expect(exitCode).to.not.equal(0)
  }

  before(async () => {
    const built = await GenericContainer.fromDockerfile('.', 'docker/Dockerfile.test').build()
    container = await built.start()
  })

  after(async () => {
    await container?.stop()
  })

  // --- Agent detection ---

  it('detects real and mocked agents', async () => {
    const { stdout, exitCode } = await exec([
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
    await exec(['rm', '-f', '/root/.claude/settings.json'])

    const { stdout, exitCode } = await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--global',
    ])
    expect(exitCode).to.equal(0)
    expect(stdout).to.include('ormi')

    // File-level check
    const { stdout: configJson } = await exec([
      'jq', '.mcpServers["ormi"].url', '/root/.claude/settings.json',
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
    await exec(['rm', '-f', '/root/.gemini/settings.json'])

    const { exitCode } = await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'gemini-cli', '--yes', '--global',
    ])
    expect(exitCode).to.equal(0)

    const { stdout: configJson } = await exec([
      'jq', '.mcpServers["ormi"].url', '/root/.gemini/settings.json',
    ])
    expect(configJson.trim()).to.include('mcp.subgraph.ormilabs.com')
  })

  // --- Custom URL ---

  it('writes custom MCP URL', async () => {
    await exec(['rm', '-f', '/root/.claude/settings.json'])

    await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code',
      '--yes', '--global', '--url', 'http://localhost:9999',
    ])

    const { stdout } = await exec([
      'jq', '-r', '.mcpServers["ormi"].url', '/root/.claude/settings.json',
    ])
    expect(stdout.trim()).to.equal('http://localhost:9999')
  })

  // --- Windsurf format ---

  it('writes windsurf format correctly', async () => {
    await exec(['rm', '-f', '/root/.codeium/windsurf/mcp_config.json'])

    await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'windsurf', '--yes', '--global',
    ])

    const { stdout } = await exec([
      'jq', '-r', '.mcpServers["ormi"].url',
      '/root/.codeium/windsurf/mcp_config.json',
    ])
    expect(stdout.trim()).to.include('mcp.subgraph.ormilabs.com')
  })

  // --- Non-destructive merge ---

  it('preserves existing MCP servers', async () => {
    // Write pre-existing config
    await exec(['sh', '-c',
      'echo \'{"mcpServers":{"my-server":{"url":"http://example.com"}}}\' > /root/.claude/settings.json',
    ])

    await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--global', '--mcp-only',
    ])

    const { stdout } = await exec([
      'jq', '.mcpServers | keys', '/root/.claude/settings.json',
    ])
    expect(stdout).to.include('my-server')
    expect(stdout).to.include('ormi')
  })

  // --- Idempotency ---

  it('install is idempotent', async () => {
    await exec(['rm', '-f', '/root/.claude/settings.json'])

    await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--global', '--mcp-only',
    ])
    const { stdout: first } = await exec(['cat', '/root/.claude/settings.json'])

    await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--global', '--mcp-only',
    ])
    const { stdout: second } = await exec(['cat', '/root/.claude/settings.json'])

    expect(first.trim()).to.equal(second.trim())
  })

  // --- Skills installation ---

  it('installs skills', async () => {
    await exec(['rm', '-rf', '/root/.claude/skills'])

    await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--skills-only', '--global',
    ])

    for (const skill of BUNDLED_SKILLS) {
      await expectPathExists(`/root/.claude/skills/${skill}/SKILL.md`)
    }
  })

  // --- --mcp-only skips skills ---

  it('--mcp-only skips skills', async () => {
    await exec(['rm', '-f', '/root/.claude/settings.json'])
    await exec(['rm', '-rf', '/root/.claude/skills'])

    await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--global', '--mcp-only',
    ])

    await expectPathExists('/root/.claude/settings.json')
    await expectPathMissing('/root/.claude/skills/subgraph-query')
  })

  // --- Uninstall: MCP config removal ---

  it('uninstall removes MCP config', async () => {
    // First install
    await exec(['rm', '-f', '/root/.claude/settings.json'])
    await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--global', '--mcp-only',
    ])

    // Verify installed
    const { stdout: beforeUninstall } = await exec([
      'jq', '-r', '.mcpServers["ormi"].url', '/root/.claude/settings.json',
    ])
    expect(beforeUninstall.trim()).to.include('mcp.subgraph.ormilabs.com')

    // Uninstall
    const { exitCode } = await exec([
      'node', '/app/bin/run.js', 'ai', 'uninstall', '--agent', 'claude-code', '--yes', '--global', '--mcp-only',
    ])
    expect(exitCode).to.equal(0)

    // Verify removed
    const { stdout: afterUninstall } = await exec([
      'jq', '-r', '.mcpServers["ormi"]', '/root/.claude/settings.json',
    ])
    expect(afterUninstall.trim()).to.equal('null')
  })

  // --- Uninstall: skills removal ---

  it('uninstall removes skills', async () => {
    // First install skills globally
    await exec(['rm', '-rf', '/root/.claude/skills'])
    await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--skills-only', '--global',
    ])

    await expectPathExists('/root/.claude/skills/subgraph-query')

    // Uninstall globally
    const { exitCode } = await exec([
      'node', '/app/bin/run.js', 'ai', 'uninstall', '--agent', 'claude-code', '--yes', '--skills-only', '--global',
    ])
    expect(exitCode).to.equal(0)

    // Verify removed
    for (const skill of BUNDLED_SKILLS) {
      await expectPathMissing(`/root/.claude/skills/${skill}`)
    }
  })

  // --- Uninstall: idempotency ---

  it('uninstall is idempotent', async () => {
    // Run uninstall twice — second run should not error
    const { exitCode: first } = await exec([
      'node', '/app/bin/run.js', 'ai', 'uninstall', '--agent', 'claude-code', '--yes',
    ])
    expect(first).to.equal(0)

    const { exitCode: second } = await exec([
      'node', '/app/bin/run.js', 'ai', 'uninstall', '--agent', 'claude-code', '--yes',
    ])
    expect(second).to.equal(0)
  })

  // --- Doctor: after install ---

  it('doctor reports all ok after install', async () => {
    await exec(['rm', '-f', '/root/.claude/settings.json'])
    await exec(['rm', '-rf', '/root/.claude/skills'])

    await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--global',
    ])

    const { stdout, exitCode } = await exec([
      'node', '/app/bin/run.js', 'ai', 'doctor', '--agent', 'claude-code', '--global',
    ])
    expect(exitCode).to.equal(0)
    expect(stdout).to.include('MCP configured')
    expect(stdout).to.include('subgraph-query')
  })

  // --- Local (project-level) skills ---

  it('installs skills locally by default', async () => {
    await resetProject(testProjectPath)

    const { exitCode } = await execInProject(
      testProjectPath,
      'node /app/bin/run.js ai install --agent claude-code --yes --skills-only',
    )
    expect(exitCode).to.equal(0)

    for (const skill of BUNDLED_SKILLS) {
      await expectPathExists(`${testProjectPath}/.claude/skills/${skill}/SKILL.md`)
    }
  })

  it('configures MCP locally in .mcp.json', async () => {
    await resetProject(testProjectPath)
    const { exitCode } = await execInProject(
      testProjectPath,
      'node /app/bin/run.js ai install --agent claude-code --yes',
    )
    expect(exitCode).to.equal(0)

    const { stdout: configJson } = await exec([
      'cat', `${testProjectPath}/.mcp.json`,
    ])
    const config = JSON.parse(configJson)
    expect(config.mcpServers['ormi'].type).to.equal('http')
    expect(config.mcpServers['ormi'].url).to.include('mcp.subgraph.ormilabs.com')
  })

  it('uninstall removes local MCP from .mcp.json', async () => {
    await resetProject(testProjectPath)
    await execInProject(
      testProjectPath,
      'node /app/bin/run.js ai install --agent claude-code --yes --mcp-only',
    )
    await expectPathExists(`${testProjectPath}/.mcp.json`)

    const { exitCode } = await execInProject(
      testProjectPath,
      'node /app/bin/run.js ai uninstall --agent claude-code --yes --mcp-only',
    )
    expect(exitCode).to.equal(0)

    const { stdout: configJson } = await exec(['cat', `${testProjectPath}/.mcp.json`])
    const config = JSON.parse(configJson)
    expect(config.mcpServers['ormi']).to.be.undefined
  })

  it('installs skills globally with --global flag', async () => {
    await exec(['rm', '-rf', '/root/.claude/skills'])

    const { exitCode } = await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--skills-only', '--global',
    ])
    expect(exitCode).to.equal(0)

    for (const skill of BUNDLED_SKILLS) {
      await expectPathExists(`/root/.claude/skills/${skill}/SKILL.md`)
    }
  })

  it('uninstall removes local skills by default', async () => {
    await resetProject(testProjectPath)
    await execInProject(
      testProjectPath,
      'node /app/bin/run.js ai install --agent claude-code --yes --skills-only',
    )

    const { exitCode } = await execInProject(
      testProjectPath,
      'node /app/bin/run.js ai uninstall --agent claude-code --yes --skills-only',
    )
    expect(exitCode).to.equal(0)

    for (const skill of BUNDLED_SKILLS) {
      await expectPathMissing(`${testProjectPath}/.claude/skills/${skill}`)
    }
  })

  it('doctor checks local skills by default', async () => {
    await resetProject(testProjectPath)
    await execInProject(
      testProjectPath,
      'node /app/bin/run.js ai install --agent claude-code --yes --skills-only',
    )

    const { stdout, exitCode } = await execInProject(
      testProjectPath,
      'node /app/bin/run.js ai doctor --agent claude-code',
    )
    expect(exitCode).to.equal(0)
    expect(stdout).to.include('subgraph-query')
    expect(stdout).to.include(`${testProjectPath}/.claude/skills`)
  })

  // --- Doctor: reports missing after uninstall ---

  it('doctor reports missing config after uninstall', async () => {
    // Install then uninstall
    await exec(['rm', '-f', '/root/.claude/settings.json'])
    await exec([
      'node', '/app/bin/run.js', 'ai', 'install', '--agent', 'claude-code', '--yes', '--global', '--mcp-only',
    ])
    await exec([
      'node', '/app/bin/run.js', 'ai', 'uninstall', '--agent', 'claude-code', '--yes', '--global', '--mcp-only',
    ])

    const { stdout } = await exec([
      'node', '/app/bin/run.js', 'ai', 'doctor', '--agent', 'claude-code',
    ])
    expect(stdout).to.satisfy((s: string) =>
      s.includes('not configured') || s.includes('not found') || s.includes('issue')
    )
  })
})
