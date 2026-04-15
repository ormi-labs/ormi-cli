import { prompt } from '../ui/prompt.js'
import { ORMI_IPFS_URL } from './constants.js'
import {
  type Environment,
  getEnvironment,
  getIpfsUrl,
  getNodeUrl,
  listEnvironments,
} from './environments.js'

const DEFAULT_ENVIRONMENT_SLUG = 'ormi-k8s'

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
    return {
      ipfs: options.ipfsFlag ?? ORMI_IPFS_URL,
      node: options.nodeFlag,
    }
  }

  // 2. ORMI_NODE_URL env var overrides env selection
  if (process.env.ORMI_NODE_URL) {
    return {
      ipfs: options.ipfsFlag ?? ORMI_IPFS_URL,
      node: process.env.ORMI_NODE_URL,
    }
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
  const defaultEnvironment = getEnvironment(DEFAULT_ENVIRONMENT_SLUG)
  if (!defaultEnvironment) {
    throw new Error(
      `Default environment '${DEFAULT_ENVIRONMENT_SLUG}' not found`,
    )
  }
  const environment = canPrompt ? await promptEnvironment() : defaultEnvironment

  return {
    env: environment,
    ipfs: options.ipfsFlag ?? getIpfsUrl(environment),
    node: getNodeUrl(environment),
  }
}

async function promptEnvironment(): Promise<Environment> {
  const environments = listEnvironments()

  const selected = await prompt.select({
    initialValue: DEFAULT_ENVIRONMENT_SLUG,
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
