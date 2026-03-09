import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CONFIG_DIR = path.join(os.homedir(), '.ormi')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

interface OrmiConfig {
  deployKey?: string
}

export function getDeployKey(): string | undefined {
  return readConfig().deployKey
}

export function setDeployKey(key: string): void {
  const config = readConfig()
  config.deployKey = key
  writeConfig(config)
}

function readConfig(): OrmiConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as OrmiConfig
  } catch {
    return {}
  }
}

function writeConfig(config: OrmiConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, undefined, 2))
}
