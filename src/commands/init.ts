import GraphInitCommand from '@graphprotocol/graph-cli/dist/commands/init.js'
// src/commands/init.ts
import fs from 'node:fs'
import path from 'node:path'

import { ORMI_IPFS_URL, ORMI_NODE_URL } from '../lib/constants.js'
import { type PackageJson, rebrandPackageJson } from '../lib/package-json.js'

export default class InitCommand extends GraphInitCommand {
  static override description = 'Creates a new subgraph with basic scaffolding.'

  static override flags: typeof GraphInitCommand.flags = {
    ...GraphInitCommand.flags,
    ipfs: {
      ...GraphInitCommand.flags.ipfs,
      default: ORMI_IPFS_URL,
    },
    network: {
      ...GraphInitCommand.flags.network,
      description: 'Network the contract is deployed to.',
    },
    node: {
      ...GraphInitCommand.flags.node,
      summary: 'Subgraph node for which to initialize.',
    },
  }

  async run(): Promise<never> {
    // 1. Snapshot CWD directory listing before init runs.
    //    Used as fallback to detect output directory in interactive mode
    //    (where directory is prompted, not in argv).
    const cwdBefore = new Set(
      fs
        .readdirSync(process.cwd(), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name),
    )

    // 2. Inject --node ORMI_NODE_URL if not explicitly provided.
    //    This ensures the deploy script in generated package.json
    //    targets ORMI infrastructure instead of thegraph.com.
    //    Graph-cli's init parses from this.argv, so injecting here works.
    const hasNodeFlag = this.argv.some(
      (a) => a === '--node' || a.startsWith('--node=') || a === '-g',
    )
    if (!hasNodeFlag) {
      this.argv.push('--node', ORMI_NODE_URL)
    }

    // 3. Run graph-cli's init command.
    //    graph-cli always calls this.exit(0) on success, which throws
    //    an oclif ExitError. We catch it to run post-processing.
    try {
      await super.run()
    } catch (error: unknown) {
      // Let non-exit errors and failure exits propagate unchanged
      if (!isSuccessfulExit(error)) {
        throw error
      }
    }

    // 4. Find the output directory and rebrand its package.json
    const outputDirectory = this.detectOutputDirectory(cwdBefore)
    if (outputDirectory) {
      this.rebrandGeneratedFiles(outputDirectory)
    }

    // 5. Re-throw exit(0) to maintain oclif's expected command lifecycle
    this.exit(0)
  }

  /**
   * Determine where graph-cli wrote the scaffolded subgraph.
   *
   * Strategy 1 (non-interactive): The second positional arg is the directory.
   * Strategy 2 (interactive fallback): Diff CWD listing to find new directory.
   */
  private detectOutputDirectory(cwdBefore: Set<string>): string | undefined {
    // Strategy 1: Check positional args (flags start with -)
    const positionalArguments = this.argv.filter((a) => !a.startsWith('-'))
    // graph-cli argv: [subgraphName, directory, ...otherPositionals]
    if (positionalArguments.length >= 2) {
      const directory = positionalArguments[1]
      if (fs.existsSync(path.resolve(directory))) {
        return path.resolve(directory)
      }
    }

    // Strategy 1b: If only subgraph name given, graph-cli uses it as directory
    if (positionalArguments.length > 0) {
      const directory = positionalArguments[0]
      if (fs.existsSync(path.resolve(directory))) {
        return path.resolve(directory)
      }
    }

    // Strategy 2: Find newly created directory in CWD
    try {
      const cwdAfter = fs
        .readdirSync(process.cwd(), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
      const newDirectories = cwdAfter.filter((d) => !cwdBefore.has(d))
      if (newDirectories.length === 1) {
        return path.resolve(newDirectories[0])
      }
    } catch {
      // If CWD listing fails, skip rebranding silently
    }

    return undefined
  }

  /**
   * Read, rebrand, and write back the generated package.json.
   */
  private rebrandGeneratedFiles(outputDirectory: string): void {
    const packagePath = path.join(outputDirectory, 'package.json')
    if (!fs.existsSync(packagePath)) {
      return
    }

    try {
      const raw = fs.readFileSync(packagePath, 'utf8')
      const package_ = JSON.parse(raw) as PackageJson
      const rebranded = rebrandPackageJson(package_, this.config.version)
      fs.writeFileSync(
        packagePath,
        JSON.stringify(rebranded, undefined, 2) + '\n',
        'utf8',
      )
    } catch {
      // Non-fatal: subgraph is still functional with graph commands
      this.warn('Could not rebrand package.json to use ormi-cli commands')
    }
  }
}

/**
 * Check if an error is oclif's ExitError with code 0 (successful exit).
 * oclif's Command.exit(0) always throws ExitError — it never returns.
 */
function isSuccessfulExit(error: unknown): boolean {
  if (
    error instanceof Error &&
    'oclif' in error &&
    typeof (error as Record<string, unknown>).oclif === 'object'
  ) {
    const oclif = (error as { oclif: { exit?: number } }).oclif
    return oclif.exit === 0
  }
  return false
}
