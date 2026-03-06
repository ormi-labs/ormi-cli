import * as p from '@clack/prompts'

/**
 * Interactive prompt utilities.
 * Wraps @clack/prompts to keep commands from importing it directly.
 */
export const prompt = {
  cancel: p.cancel,
  confirm: p.confirm,
  intro: p.intro,
  isCancel: p.isCancel,
  log: p.log,
  multiselect: p.multiselect,
  outro: p.outro,
  select: p.select,
  spinner: p.spinner,
  tasks: p.tasks,
  text: p.text,
}
