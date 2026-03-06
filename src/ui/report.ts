import kleur from 'kleur'

import { style, symbol } from './symbols.js'

export function blank(): void {
  console.log()
}

export function command(cmd: string): void {
  console.log('\nRun:')
  console.log(`  ${style.command(cmd)}`)
}

export function error(message: string, detail?: string): void {
  console.log(`  ${symbol.error} ${message}`)
  if (detail) {
    console.log(`    ${style.path(detail)}`)
  }
}

export function header(title: string): void {
  console.log(style.header(title))
  console.log(style.dim('─'.repeat(40)))
}

export function info(message: string, detail?: string): void {
  console.log(`  ${symbol.info} ${message}`)
  if (detail) {
    console.log(`    ${style.path(detail)}`)
  }
}

export function ok(message: string, detail?: string): void {
  console.log(`  ${symbol.ok} ${message}`)
  if (detail) {
    console.log(`    ${style.path(detail)}`)
  }
}

export function plain(message: string): void {
  console.log(message)
}

export function section(name: string): void {
  console.log(`\n${style.section(name)}`)
}

export function summary(agents: number, issues: number): void {
  section('Summary')
  const issueText = issues > 0 ? kleur.red(String(issues)) : kleur.green('no')
  console.log(
    `${style.number(agents)} agents checked, ${issueText} issues found`,
  )
}

export function warn(message: string, detail?: string): void {
  console.log(`  ${symbol.warn} ${message}`)
  if (detail) {
    console.log(`    ${style.path(detail)}`)
  }
}
