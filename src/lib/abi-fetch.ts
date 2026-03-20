/**
 * Shared ABI fetching utilities with proxy detection.
 * Used by both `init` and `abi` commands.
 */
import { ContractService } from '@graphprotocol/graph-cli/dist/command-helpers/contracts.js'
import { loadRegistry } from '@graphprotocol/graph-cli/dist/command-helpers/registry.js'
import EthereumABI from '@graphprotocol/graph-cli/dist/protocols/ethereum/abi.js'

import fetch from './fetch.js'
import { toRegistryNetworkId } from './network-map.js'

export interface AbiFetchResult {
  abi: EthereumABI
  contractName: string
  proxyInfo: ProxyInfo
  startBlock?: string
}

export interface ProxyInfo {
  implementation?: string
  isProxy: boolean
}

type Registry = Awaited<ReturnType<typeof loadRegistry>>

/**
 * Detect if a contract is a proxy and get its implementation address.
 */
export async function detectProxy(
  networkId: string,
  address: string,
  registry?: Registry,
): Promise<ProxyInfo> {
  const reg = registry ?? (await loadRegistry())
  const urls = reg.getNetworkByGraphId(toRegistryNetworkId(networkId))?.apiUrls
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
      const url = `${baseUrl}?module=contract&action=getsourcecode&address=${encodeURIComponent(address)}`
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

/**
 * Fetch ABI with proxy detection and implementation following.
 *
 * @param network - Network identifier (e.g., 'mainnet', 'arbitrum-one')
 * @param address - Contract address
 * @param options - Optional settings
 * @param options.followProxy - Whether to follow proxy to implementation (default: true)
 * @param options.onProxyDetected - Callback when proxy is detected (for logging)
 */
export async function fetchAbi(
  network: string,
  address: string,
  options?: {
    followProxy?: boolean
    onProxyDetected?: (implementation: string) => void
  },
): Promise<AbiFetchResult> {
  const { followProxy = true, onProxyDetected } = options ?? {}

  const registry = await loadRegistry()
  const contractService = new ContractService(registry)
  const registryNetwork = toRegistryNetworkId(network)

  // Detect proxy
  let proxyInfo: ProxyInfo = { isProxy: false }
  try {
    proxyInfo = await detectProxy(network, address, registry)
  } catch {
    // Proxy detection is best-effort, don't fail
  }

  // Determine which address to fetch ABI from
  let fetchAddress = address
  if (proxyInfo.isProxy && proxyInfo.implementation && followProxy) {
    onProxyDetected?.(proxyInfo.implementation)
    fetchAddress = proxyInfo.implementation
  }

  // Fetch ABI (Sourcify first, then Etherscan)
  let abi: EthereumABI | undefined
  let contractName = 'Contract'
  let startBlock: string | undefined

  // Try Sourcify first
  const sourcifyInfo = await contractService.getFromSourcify(
    EthereumABI,
    registryNetwork,
    fetchAddress,
  )
  if (sourcifyInfo) {
    abi = sourcifyInfo.abi
    contractName = sourcifyInfo.name
    startBlock = sourcifyInfo.startBlock
  } else {
    // Fall back to Etherscan
    try {
      abi = await contractService.getABI(
        EthereumABI,
        registryNetwork,
        fetchAddress,
      )
    } catch (error) {
      throw new Error(
        `Could not fetch ABI for ${fetchAddress} on ${network}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    // Try to get contract name
    try {
      contractName = await contractService.getContractName(
        registryNetwork,
        fetchAddress,
      )
    } catch {
      // Keep default name
    }
  }

  // Get start block if not from Sourcify (use original address for block detection)
  if (!startBlock) {
    try {
      startBlock = await contractService.getStartBlock(registryNetwork, address)
    } catch {
      // Start block is optional
    }
  }

  return {
    abi,
    contractName,
    proxyInfo,
    startBlock,
  }
}
