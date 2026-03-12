// test/lib/package-json.test.ts
import { expect } from 'chai'

import { rebrandPackageJson } from '../../src/lib/package-json.js'

describe('rebrandPackageJson', () => {
  describe('script rebranding', () => {
    it('replaces graph commands with ormi in all scripts', () => {
      const input = {
        name: 'my-subgraph',
        scripts: {
          codegen: 'graph codegen',
          build: 'graph build',
          deploy: 'graph deploy --node https://api.subgraph.ormilabs.com/deploy my-subgraph',
          'create-local': 'graph create --node http://localhost:8020/ my-subgraph',
          'remove-local': 'graph remove --node http://localhost:8020/ my-subgraph',
          'deploy-local':
            'graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 my-subgraph',
          test: 'graph test',
        },
        dependencies: {
          '@graphprotocol/graph-cli': '0.98.1',
          '@graphprotocol/graph-ts': '0.37.0',
        },
      }

      const result = rebrandPackageJson(input, '1.0.0')

      expect(result.scripts!.codegen).to.equal('ormi codegen')
      expect(result.scripts!.build).to.equal('ormi build')
      expect(result.scripts!.deploy).to.equal(
        'ormi deploy --node https://api.subgraph.ormilabs.com/deploy my-subgraph',
      )
      expect(result.scripts!['create-local']).to.equal(
        'ormi create --node http://localhost:8020/ my-subgraph',
      )
      expect(result.scripts!['remove-local']).to.equal(
        'ormi remove --node http://localhost:8020/ my-subgraph',
      )
      expect(result.scripts!['deploy-local']).to.equal(
        'ormi deploy --node http://localhost:8020/ --ipfs http://localhost:5001 my-subgraph',
      )
      expect(result.scripts!.test).to.equal('ormi test')
    })
  })

  describe('dependency rebranding', () => {
    it('replaces @graphprotocol/graph-cli with ormi-cli in dependencies', () => {
      const input = {
        dependencies: {
          '@graphprotocol/graph-cli': '0.98.1',
          '@graphprotocol/graph-ts': '0.37.0',
        },
      }

      const result = rebrandPackageJson(input, '1.2.3')

      expect(result.dependencies!['ormi-cli']).to.equal('1.2.3')
      expect(result.dependencies!['@graphprotocol/graph-cli']).to.be.undefined
    })

    it('preserves @graphprotocol/graph-ts unchanged', () => {
      const input = {
        dependencies: {
          '@graphprotocol/graph-cli': '0.98.1',
          '@graphprotocol/graph-ts': '0.37.0',
        },
      }

      const result = rebrandPackageJson(input, '1.0.0')

      expect(result.dependencies!['@graphprotocol/graph-ts']).to.equal('0.37.0')
    })

    it('handles @graphprotocol/graph-cli in devDependencies', () => {
      const input = {
        devDependencies: {
          '@graphprotocol/graph-cli': '0.98.1',
        },
      }

      const result = rebrandPackageJson(input, '2.0.0')

      expect(result.devDependencies!['ormi-cli']).to.equal('2.0.0')
      expect(result.devDependencies!['@graphprotocol/graph-cli']).to.be.undefined
    })
  })

  describe('immutability', () => {
    it('does not mutate the input object', () => {
      const input = {
        scripts: { build: 'graph build' },
        dependencies: { '@graphprotocol/graph-cli': '0.98.1' },
      }

      rebrandPackageJson(input, '1.0.0')

      expect(input.scripts.build).to.equal('graph build')
      expect(input.dependencies['@graphprotocol/graph-cli']).to.equal('0.98.1')
    })
  })

  describe('edge cases', () => {
    it('handles missing scripts', () => {
      const input = { name: 'test' }
      const result = rebrandPackageJson(input, '1.0.0')
      expect(result.scripts).to.be.undefined
    })

    it('handles missing dependencies', () => {
      const input = { name: 'test', scripts: { build: 'graph build' } }
      const result = rebrandPackageJson(input, '1.0.0')
      expect(result.scripts!.build).to.equal('ormi build')
      expect(result.dependencies).to.be.undefined
    })

    it('handles substreams package.json (no codegen script, no graph-ts)', () => {
      const input = {
        scripts: {
          build: 'graph build',
          deploy: 'graph deploy --node https://api.example.com/deploy my-sub',
          test: 'graph test',
        },
        dependencies: {
          '@graphprotocol/graph-cli': '0.98.1',
        },
      }

      const result = rebrandPackageJson(input, '1.0.0')

      expect(result.scripts!.build).to.equal('ormi build')
      expect(result.scripts!.deploy).to.equal(
        'ormi deploy --node https://api.example.com/deploy my-sub',
      )
      expect(result.dependencies!['ormi-cli']).to.equal('1.0.0')
      expect(result.dependencies!['@graphprotocol/graph-cli']).to.be.undefined
    })

    it('handles package.json with no graph references', () => {
      const input = {
        name: 'unrelated',
        scripts: { start: 'node index.js' },
        dependencies: { express: '^4.0.0' },
      }

      const result = rebrandPackageJson(input, '1.0.0')

      expect(result.scripts!.start).to.equal('node index.js')
      expect(result.dependencies!.express).to.equal('^4.0.0')
    })
  })
})
