import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const homedir = os.homedir()
const CONFIG_PATH = path.join(homedir, '.ormi-cli.json')

export type OrmiConfig = Record<string, string>

/**
 * Read the ORMI CLI config file
 */
export function getConfig(): OrmiConfig {
  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8')
    return JSON.parse(content) as OrmiConfig
  } catch {
    return {}
  }
}

/**
 * Get deploy key for a specific node URL
 * Priority: flag > stored config > undefined
 */
export function getDeployKey(
  nodeUrl: string,
  deployKeyFlag?: string,
): string | undefined {
  if (deployKeyFlag) {
    return deployKeyFlag
  }

  // Check env var first
  if (process.env.ORMI_DEPLOY_KEY) {
    return process.env.ORMI_DEPLOY_KEY
  }

  // Check stored config
  const config = getConfig()
  const normalizedUrl = normalizeNodeUrl(nodeUrl)
  return config[normalizedUrl]
}

/**
 * Normalize node URL by removing trailing slash
 */
export function normalizeNodeUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Save deploy key for a specific node URL
 */
export function saveDeployKey(nodeUrl: string, deployKey: string): void {
  const config = getConfig()
  const normalizedUrl = normalizeNodeUrl(nodeUrl)
  config[normalizedUrl] = deployKey
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, undefined, 2))
}
