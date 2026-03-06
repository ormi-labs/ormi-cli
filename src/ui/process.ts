import kleur from 'kleur'

export function agent(name: string): void {
  console.log('\n' + kleur.bold(name))
}

export function fail(message: string, detail?: string): void {
  console.log(`  ${kleur.red('✗')} ${message}`)
  if (detail) {
    console.log(`    ${kleur.dim(detail)}`)
  }
}

export function info(message: string): void {
  console.log(`    ${kleur.dim(message)}`)
}

export function ok(message: string, detail?: string): void {
  console.log(`  ${kleur.green('✓')} ${message}`)
  if (detail) {
    console.log(`    ${kleur.dim(detail)}`)
  }
}

export function success(message: string): void {
  console.log('\n' + kleur.green(`✓ ${message}`))
}

export function warn(message: string, detail?: string): void {
  console.log(`  ${kleur.yellow('⚠')} ${message}`)
  if (detail) {
    console.log(`    ${kleur.dim(detail)}`)
  }
}
