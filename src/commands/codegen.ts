import CodegenCommand from '@graphprotocol/graph-cli/dist/commands/codegen.js'

import { ORMI_IPFS_URL } from '../lib/constants.js'

export default class Codegen extends CodegenCommand {
  static override flags: typeof CodegenCommand.flags = {
    ...CodegenCommand.flags,
    ipfs: {
      ...CodegenCommand.flags.ipfs,
      default: ORMI_IPFS_URL,
    },
  }
}
