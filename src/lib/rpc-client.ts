import { createJsonRpcClient } from '@graphprotocol/graph-cli/dist/command-helpers/jsonrpc.js'
import { validateNodeUrl } from '@graphprotocol/graph-cli/dist/command-helpers/node.js'
import { GRAPH_CLI_SHARED_HEADERS } from '@graphprotocol/graph-cli/dist/constants.js'
import { URL } from 'node:url'

import { getDeployKey } from './config.js'

import type http from 'node:http'

export interface JsonRpcError {
  message: string
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
