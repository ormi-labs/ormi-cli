import { Args, Command, Flags } from '@oclif/core'

import fs from 'node:fs'
import path from 'node:path'

import { fetchAbi } from '../lib/abi-fetch.js'

interface FullOutput {
  abi: unknown[]
  contractName: string
  implementation?: string
  isProxy: boolean
  startBlock?: string
}

export default class AbiCommand extends Command {
  static args = {
    address: Args.string({
      description: 'Contract address',
      required: true,
    }),
  }

  static description =
    'Fetch contract ABI from Etherscan/Sourcify with proxy detection.'

  static examples = [
    '<%= config.bin %> <%= command.id %> 0x1234... --network mainnet',
    '<%= config.bin %> <%= command.id %> 0x1234... --network mainnet -o abi.json',
    '<%= config.bin %> <%= command.id %> 0x1234... --network mainnet --full',
  ]

  static flags = {
    full: Flags.boolean({
      default: false,
      description:
        'Output full metadata (ABI, name, isProxy, implementation, startBlock).',
    }),
    help: Flags.help({ char: 'h' }),
    network: Flags.string({
      description: 'Network identifier (mainnet, arbitrum-one, base, etc.)',
      required: true,
    }),
    'no-follow': Flags.boolean({
      default: false,
      description: "Don't follow proxy to fetch implementation ABI.",
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output file path (default: stdout).',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AbiCommand)
    const { address } = args
    const { full, network, 'no-follow': noFollow, output } = flags

    // Validate address format
    if (!address.startsWith('0x') || address.length !== 42) {
      this.error(
        `Invalid address format: ${address}. Must be 0x-prefixed 42-character hex string.`,
      )
    }

    // Fetch ABI with proxy detection
    const result = await fetchAbi(network, address, {
      followProxy: !noFollow,
      onProxyDetected: (implementation) => {
        this.logToStderr(
          `Detected proxy contract. Fetching implementation ABI from ${implementation}`,
        )
      },
    })

    // Prepare output
    const abiData = result.abi.data.toJS()
    const abiJson = Array.isArray(abiData) ? abiData : []
    const outputData = full
      ? ({
          abi: abiJson,
          contractName: result.contractName,
          implementation: result.proxyInfo.implementation,
          isProxy: result.proxyInfo.isProxy,
          startBlock: result.startBlock,
        } satisfies FullOutput)
      : abiJson

    const outputString = JSON.stringify(outputData, undefined, 2)

    // Write output
    if (output) {
      const outputPath = path.resolve(output)
      fs.writeFileSync(outputPath, outputString + '\n', 'utf8')
      this.log(`ABI written to ${outputPath}`)
    } else {
      this.log(outputString)
    }
  }
}
