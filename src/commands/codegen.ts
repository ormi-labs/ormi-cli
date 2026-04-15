import { Flags } from '@oclif/core'

import * as DataSourcesExtractor from '@graphprotocol/graph-cli/dist/command-helpers/data-sources.js'
import {
  assertGraphTsVersion,
  assertManifestApiVersion,
} from '@graphprotocol/graph-cli/dist/command-helpers/version.js'
import CodegenCommand from '@graphprotocol/graph-cli/dist/commands/codegen.js'
import Protocol from '@graphprotocol/graph-cli/dist/protocols/index.js'
import TypeGenerator from '@graphprotocol/graph-cli/dist/type-generator.js'
import path from 'node:path'

import { listEnvironments, resolveNodeAndIpfs } from '../lib/environments.js'

// Extends graph-cli's codegen with --env support.
// NOTE: run() mirrors graph-cli's CodegenCommand.run() and must be updated on upstream changes.
export default class Codegen extends CodegenCommand {
  // Type assertion: we extend the parent flags with an additional --env flag.
  // A strict type annotation is impossible because graph-cli bundles a different @oclif/core version.
  // At runtime oclif reads flags as a plain object, so the extra flag works correctly.
  static override flags = {
    ...CodegenCommand.flags,
    env: Flags.string({
      description:
        'ORMI environment (e.g., mantle, ormi-k8s). Prompts interactively if not provided.',
      options: listEnvironments().map((environment) => environment.slug),
    }),
  } as typeof CodegenCommand.flags

  override async run(): Promise<void> {
    const parsed: {
      args: { 'subgraph-manifest': string }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      flags: Record<string, any>
    } = await this.parse(Codegen)

    const manifest = parsed.args['subgraph-manifest']
    // eslint-disable-next-line unicorn/prevent-abbreviations
    const outputDir = parsed.flags['output-dir'] as string
    const skipMigrations = parsed.flags['skip-migrations'] as boolean
    const watch = parsed.flags.watch as boolean
    const ipfsFlag = parsed.flags.ipfs as string | undefined
    const uncrashable = parsed.flags.uncrashable as boolean
    const uncrashableConfig = parsed.flags['uncrashable-config'] as
      | string
      | undefined
    const environmentFlag = parsed.flags.env as string | undefined

    const { ipfs } = await resolveNodeAndIpfs({
      envFlag: environmentFlag,
      ipfsFlag,
    })

    let protocol: Protocol
    let subgraphSources: string[]
    try {
      await assertManifestApiVersion(manifest, '0.0.5')
      await assertGraphTsVersion(path.dirname(manifest), '0.25.0')
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- graph-cli DataSourcesExtractor returns untyped any */
      const dataSourcesAndTemplates =
        await DataSourcesExtractor.fromFilePath(manifest)
      protocol = Protocol.fromDataSources(dataSourcesAndTemplates)
      subgraphSources = dataSourcesAndTemplates
        .filter((ds: { kind: string }) => ds.kind == 'subgraph')
        .map((ds: { source: { address: string } }) => ds.source.address)
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    } catch (error: unknown) {
      this.error(error as Error, { exit: 1 })
    }

    const generator = new TypeGenerator({
      ipfsUrl: ipfs,

      outputDir,
      protocol,
      skipMigrations,
      subgraphManifest: manifest,
      subgraphSources,
      uncrashable,
      uncrashableConfig: uncrashableConfig || 'uncrashable-config.yaml',
    })

    if (watch) {
      await generator.watchAndGenerateTypes()
    } else if (!(await generator.generateTypes())) {
      process.exitCode = 1
    }
  }
}
