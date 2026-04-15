import environments from './environments.json' with { type: 'json' }
import { prompt } from '../ui/prompt.js'

export interface Environment {
  appUrl: string
  baseUrl: string
  name: string
  slug: string
}

const DEFAULT_SLUG = 'ormi-k8s'
const environmentMap = new Map(
  environments.map((environment) => [environment.slug, environment]),
)

export function getDefaultEnvironment(): Environment {
  const environment = environmentMap.get(DEFAULT_SLUG)
  if (!environment) {
    throw new Error(`Default environment '${DEFAULT_SLUG}' not found`)
  }
  return environment
}

export function getEnvironment(slug: string): Environment | undefined {
  return environmentMap.get(slug)
}

export function getIpfsUrl(environment: Environment): string {
  return `${environment.baseUrl}/ipfs`
}

export function getNodeUrl(environment: Environment): string {
  return `${environment.baseUrl}/deploy`
}

export function listEnvironments(): Environment[] {
  return environments as Environment[]
}

/**
 * Resolve node and IPFS URLs from flags, env var, --env flag, or interactive prompt.
 *
 * Priority for node URL:
 *   1. Explicit --node flag            → use it, skip env resolution
 *   2. ORMI_NODE_URL env var           → use it, skip env resolution
 *   3. --env flag                      → derive from environment registry
 *   4. Interactive prompt (TTY only)   → derive from selected environment
 *   5. Default environment (ormi-k8s)  → derive from default
 */
export async function resolveNodeAndIpfs(options: {
  envFlag?: string
  interactive?: boolean
  ipfsFlag?: string
  nodeFlag?: string
}): Promise<{ env?: Environment; ipfs: string; node: string }> {
  const canPrompt = options.interactive ?? process.stdout.isTTY

  // 1. Explicit --node overrides everything
  if (options.nodeFlag) {
    // Derive IPFS from the node URL's base when --ipfs is not provided
    const ipfs = options.ipfsFlag ?? deriveIpfsFromNodeUrl(options.nodeFlag)
    return { ipfs, node: options.nodeFlag }
  }

  // 2. ORMI_NODE_URL env var overrides env selection
  if (process.env.ORMI_NODE_URL) {
    const ipfs =
      options.ipfsFlag ?? deriveIpfsFromNodeUrl(process.env.ORMI_NODE_URL)
    return { ipfs, node: process.env.ORMI_NODE_URL }
  }

  // 3. Resolve environment from --env flag
  if (options.envFlag) {
    const environment = getEnvironment(options.envFlag)
    if (!environment) {
      const slugs = listEnvironments()
        .map((environment_) => environment_.slug)
        .join(', ')
      throw new Error(
        `Unknown environment: ${options.envFlag}. Available: ${slugs}`,
      )
    }
    return {
      env: environment,
      ipfs: options.ipfsFlag ?? getIpfsUrl(environment),
      node: getNodeUrl(environment),
    }
  }

  // 4. Interactive prompt (only in TTY) or fall back to default
  const environment = canPrompt
    ? await promptEnvironment()
    : getDefaultEnvironment()

  return {
    env: environment,
    ipfs: options.ipfsFlag ?? getIpfsUrl(environment),
    node: getNodeUrl(environment),
  }
}

/**
 * Derive an IPFS URL from a node URL by replacing the trailing path segment.
 * e.g. https://api.subgraph.ormilabs.com/deploy → https://api.subgraph.ormilabs.com/ipfs
 */
function deriveIpfsFromNodeUrl(nodeUrl: string): string {
  try {
    const url = new URL(nodeUrl)
    url.pathname = '/ipfs'
    return url.toString()
  } catch {
    // If URL parsing fails, fall back to replacing /deploy with /ipfs
    return nodeUrl.replace(/\/deploy\/?$/, '/ipfs')
  }
}

async function promptEnvironment(): Promise<Environment> {
  const environments = listEnvironments()

  const selected = await prompt.select({
    initialValue: DEFAULT_SLUG,
    message: 'Select environment',
    options: environments.map((environment) => ({
      label: environment.name,
      value: environment.slug,
    })),
  })

  if (prompt.isCancel(selected)) {
    // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
    process.exit(0)
  }

  const environment = getEnvironment(selected)
  if (!environment) {
    throw new Error(`Invalid environment selected: ${selected}`)
  }

  return environment
}
