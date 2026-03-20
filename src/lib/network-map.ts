/**
 * Maps chains.json network values to @pinax/graph-networks-registry IDs.
 * Only entries where the chains.json value differs from the registry ID are listed.
 * All other values are passed through unchanged.
 */
const CHAIN_TO_REGISTRY_ID: Record<string, string> = {
  andromeda: 'metis',
}

export function toRegistryNetworkId(chainValue: string): string {
  return CHAIN_TO_REGISTRY_ID[chainValue] ?? chainValue
}
