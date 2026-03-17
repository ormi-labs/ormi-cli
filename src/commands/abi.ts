import { Args, Command, Flags } from '@oclif/core'

import { ContractService } from '@graphprotocol/graph-cli/dist/command-helpers/contracts.js'
import { loadRegistry } from '@graphprotocol/graph-cli/dist/command-helpers/registry.js'
import EthereumABI from '@graphprotocol/graph-cli/dist/protocols/ethereum/abi.js'
import fs from 'node:fs'
import path from 'node:path'

import fetch from '../lib/fetch.js'

interface FullOutput {
  abi: unknown[]
  contractName: string
  implementation?: string
  isProxy: boolean
  startBlock?: string
}

interface ProxyInfo {
  implementation?: string
  isProxy: boolean
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

    const registry = await loadRegistry()
    const contractService = new ContractService(registry)

    // Detect proxy
    let proxyInfo: ProxyInfo = { isProxy: false }
    try {
      proxyInfo = await this.detectProxy(network, address)
    } catch (error) {
      // Proxy detection is best-effort, don't fail the whole command
      this.warn(`Could not detect proxy status: ${(error as Error).message}`)
    }

    // Determine which address to fetch ABI from
    let fetchAddress = address
    if (proxyInfo.isProxy && proxyInfo.implementation && !noFollow) {
      this.logToStderr(
        `Detected proxy contract. Fetching implementation ABI from ${proxyInfo.implementation}`,
      )
      fetchAddress = proxyInfo.implementation
    }

    // Fetch ABI
    let abi: EthereumABI
    let contractName = 'Contract'
    let startBlock: string | undefined

    try {
      // Try Sourcify first
      const sourcifyInfo = await contractService.getFromSourcify(
        EthereumABI,
        network,
        fetchAddress,
      )
      if (sourcifyInfo) {
        abi = sourcifyInfo.abi
        contractName = sourcifyInfo.name
        startBlock = sourcifyInfo.startBlock
      } else {
        // Fall back to Etherscan
        abi = await contractService.getABI(EthereumABI, network, fetchAddress)
        // Try to get contract name
        try {
          contractName = await contractService.getContractName(
            network,
            fetchAddress,
          )
        } catch {
          // Keep default name
        }
      }
    } catch (error) {
      this.error(`Failed to fetch ABI: ${(error as Error).message}`)
    }

    // Get start block if not from Sourcify
    if (!startBlock) {
      try {
        startBlock = await contractService.getStartBlock(network, address)
      } catch {
        // Start block is optional
      }
    }

    // Prepare output
    const abiData = abi.data.toJS()
    const abiJson = Array.isArray(abiData) ? abiData : []
    const outputData = full
      ? ({
          abi: abiJson,
          contractName,
          implementation: proxyInfo.implementation,
          isProxy: proxyInfo.isProxy,
          startBlock,
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

  private async detectProxy(
    networkId: string,
    address: string,
  ): Promise<ProxyInfo> {
    const registry = await loadRegistry()
    const urls = registry.getNetworkByGraphId(networkId)?.apiUrls
    if (!urls) {
      return { isProxy: false }
    }

    interface ApiUrl {
      kind: string
      url: string
    }

    const etherscanUrls = (urls as ApiUrl[])
      .filter((item) => ['blockscout', 'etherscan'].includes(item.kind))
      .map((item) => {
        // Replace {apikey} with env var if present
        const match = /\{([^}]+)\}/.exec(item.url)
        if (match?.[1]) {
          const key = match[1]
          return process.env[key]
            ? item.url.replace(`{${key}}`, process.env[key] ?? '')
            : ''
        }
        return item.url
      })
      .filter(Boolean)

    if (etherscanUrls.length === 0) {
      return { isProxy: false }
    }

    // Fetch from first available Etherscan URL
    for (const baseUrl of etherscanUrls) {
      try {
        const url = `${baseUrl}?module=contract&action=getsourcecode&address=${address}`
        const response = await fetch(url)
        if (!response.ok) {
          continue
        }

        const json = (await response.json()) as {
          result?: { Implementation?: string; Proxy?: string }[]
          status: string
        }
        if (json.status === '1' && json.result?.[0]) {
          const contractInfo = json.result[0]
          if (contractInfo.Proxy === '1' && contractInfo.Implementation) {
            return {
              implementation: contractInfo.Implementation,
              isProxy: true,
            }
          }
        }
        return { isProxy: false }
      } catch {
        continue
      }
    }

    return { isProxy: false }
  }
}
