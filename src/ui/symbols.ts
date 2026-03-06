import kleur from 'kleur'

export const symbol = {
  error: kleur.red('✗'),
  info: kleur.cyan('ℹ'),
  ok: kleur.green('✓'),
  warn: kleur.yellow('⚠'),
}

export const style = {
  command: (text: string): string => kleur.bold(text),
  dim: (text: string): string => kleur.dim(text),
  header: (text: string): string => kleur.bold().cyan(text),
  number: (n: number): string => kleur.bold(String(n)),
  path: (text: string): string => kleur.dim(text),
  section: (text: string): string => kleur.bold(text),
}
