ormi-cli
=================

Ormi CLI


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/ormi-cli.svg)](https://npmjs.org/package/ormi-cli)
[![Downloads/week](https://img.shields.io/npm/dw/ormi-cli.svg)](https://npmjs.org/package/ormi-cli)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g ormi-cli
$ ormi COMMAND
running command...
$ ormi (--version)
ormi-cli/0.1.0 linux-x64 node-v24.14.0
$ ormi --help [COMMAND]
USAGE
  $ ormi COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`ormi help [COMMAND]`](#ormi-help-command)
* [`ormi plugins`](#ormi-plugins)
* [`ormi plugins add PLUGIN`](#ormi-plugins-add-plugin)
* [`ormi plugins:inspect PLUGIN...`](#ormi-pluginsinspect-plugin)
* [`ormi plugins install PLUGIN`](#ormi-plugins-install-plugin)
* [`ormi plugins link PATH`](#ormi-plugins-link-path)
* [`ormi plugins remove [PLUGIN]`](#ormi-plugins-remove-plugin)
* [`ormi plugins reset`](#ormi-plugins-reset)
* [`ormi plugins uninstall [PLUGIN]`](#ormi-plugins-uninstall-plugin)
* [`ormi plugins unlink [PLUGIN]`](#ormi-plugins-unlink-plugin)
* [`ormi plugins update`](#ormi-plugins-update)

## `ormi help [COMMAND]`

Display help for ormi.

```
USAGE
  $ ormi help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for ormi.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.37/src/commands/help.ts)_

## `ormi plugins`

List installed plugins.

```
USAGE
  $ ormi plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ ormi plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/index.ts)_

## `ormi plugins add PLUGIN`

Installs a plugin into ormi.

```
USAGE
  $ ormi plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into ormi.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the ORMI_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the ORMI_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ ormi plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ ormi plugins add myplugin

  Install a plugin from a github url.

    $ ormi plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ ormi plugins add someuser/someplugin
```

## `ormi plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ ormi plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ ormi plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/inspect.ts)_

## `ormi plugins install PLUGIN`

Installs a plugin into ormi.

```
USAGE
  $ ormi plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into ormi.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the ORMI_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the ORMI_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ ormi plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ ormi plugins install myplugin

  Install a plugin from a github url.

    $ ormi plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ ormi plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/install.ts)_

## `ormi plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ ormi plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ ormi plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/link.ts)_

## `ormi plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ ormi plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ ormi plugins unlink
  $ ormi plugins remove

EXAMPLES
  $ ormi plugins remove myplugin
```

## `ormi plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ ormi plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/reset.ts)_

## `ormi plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ ormi plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ ormi plugins unlink
  $ ormi plugins remove

EXAMPLES
  $ ormi plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/uninstall.ts)_

## `ormi plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ ormi plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ ormi plugins unlink
  $ ormi plugins remove

EXAMPLES
  $ ormi plugins unlink myplugin
```

## `ormi plugins update`

Update installed plugins.

```
USAGE
  $ ormi plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.56/src/commands/plugins/update.ts)_
<!-- commandsstop -->
