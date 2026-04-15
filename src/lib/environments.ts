import environments from './environments.json' with { type: 'json' }

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
