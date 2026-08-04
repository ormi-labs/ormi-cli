import { createJsonRpcClient } from '@graphprotocol/graph-cli/dist/command-helpers/jsonrpc.js'
import { validateNodeUrl } from '@graphprotocol/graph-cli/dist/command-helpers/node.js'
import { GRAPH_CLI_SHARED_HEADERS } from '@graphprotocol/graph-cli/dist/constants.js'
import { URL } from 'node:url'

import { getDeployKey } from './config.js'

import type http from 'node:http'

export interface JsonRpcError {
  error?: unknown
  message?: unknown
}

export function createAuthenticatedJsonRpcClient(
  nodeUrl: string,
  deployKeyFlag?: string,
): ReturnType<typeof createJsonRpcClient> {
  validateNodeUrl(nodeUrl)

  const client = createJsonRpcClient(new URL(nodeUrl))
  if (!client) {
    // eslint-disable-next-line unicorn/no-null
    return null
  }

  // Get deploy key from: flag > env var > stored config
  const deployKey = getDeployKey(nodeUrl, deployKeyFlag)
  if (deployKey) {
    // jayson stores http options internally but doesn't expose them in its TS types
    const options = (client as unknown as { options: http.RequestOptions })
      .options
    options.headers = {
      ...GRAPH_CLI_SHARED_HEADERS,
      Authorization: `Bearer ${deployKey}`,
    }
  }

  return client
}

export function isJsonRpcError(response: unknown): response is JsonRpcError {
  if (typeof response !== 'object' || response === null) {
    return false
  }
  return (
    ('error' in response &&
      response.error !== null &&
      response.error !== undefined) ||
    ('message' in response &&
      response.message !== null &&
      response.message !== undefined)
  )
}

export function jsonRpcErrorToString(error: JsonRpcError): string {
  return 'error' in error && error.error !== null && error.error !== undefined
    ? whateverToErrorMessage(error.error)
    : whateverToErrorMessage(error)
}

function whateverToErrorMessage(whatever: unknown): string {
  if (whatever === null || whatever === undefined) {
    return 'Null error'
  } else if (typeof whatever === 'string') {
    return whatever
  } else if (
    typeof whatever === 'object' &&
    'message' in whatever &&
    typeof whatever.message === 'string'
  ) {
    return whatever.message
  } else {
    return `Unknown error: ${JSON.stringify(whatever)}`
  }
}
