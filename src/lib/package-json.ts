// src/lib/package-json.ts

export interface PackageJson {
  [key: string]: unknown
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

/**
 * Rebrand a generated subgraph package.json from graph-cli to ormi-cli.
 *
 * Replaces:
 * - `graph` command references in scripts → `ormi`
 * - `@graphprotocol/graph-cli` dependency → `ormi-cli`
 *
 * Preserves:
 * - `@graphprotocol/graph-ts` (AssemblyScript library, not CLI)
 * - All other fields unchanged
 *
 * Returns a new object — does not mutate input.
 */
export function rebrandPackageJson(
  package_: PackageJson,
  ormiCliVersion: string,
): PackageJson {
  const result = { ...package_ }

  // Replace standalone "graph" command with "ormi" in all script values.
  // Uses \b word boundary to avoid replacing "graph" inside "graph-ts" or URLs.
  if (result.scripts) {
    result.scripts = { ...result.scripts }
    for (const [name, value] of Object.entries(result.scripts)) {
      result.scripts[name] = value.replaceAll(/\bgraph\b/g, 'ormi')
    }
  }

  // Replace @graphprotocol/graph-cli with ormi-cli in both deps and devDeps.
  // The fromExample path may place it in devDependencies.
  for (const depKey of ['dependencies', 'devDependencies'] as const) {
    const deps = result[depKey]
    if (deps && '@graphprotocol/graph-cli' in deps) {
      result[depKey] = { ...deps }
      delete result[depKey]['@graphprotocol/graph-cli']
      result[depKey]['ormi-cli'] = ormiCliVersion
    }
  }

  return result
}
