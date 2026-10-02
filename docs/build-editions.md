# Build editions

[Back to Locality](../README.md) · [Developer guide](developer-guide.md) · [User guide](user-guide.md) · [Tools reference](tools.md)

Locality ships four editions with the same chat interface and local/LAN model
connection. All include workspace file reading and editing, saved chats,
project instructions, context management, and optional workspace memory. Each
edition adds a different set of command and web capabilities.

| Edition | Command execution | Built-in web tools |
| --- | --- | --- |
| **No commands** | None | None |
| **Safe list** | Only commands matching your configured rules | None |
| **Commands** | General program and shell execution | None |
| **Advanced** | Same as Commands | Brave Search, SearXNG, and public webpage reading |

## No commands

Use this edition when you want the assistant to work through workspace file
tools. It can explore code, plan changes, and edit files in Act mode, but cannot
start programs or run builds and tests. It includes no command executor or
built-in web tools.

## Safe list

Use this edition when you want to limit command execution to a configured set of
rules. Commands must match your regular expressions and run as one program with
literal arguments. Built-in command checks also restrict workspace paths and
unsupported options. Shell pipelines and command chaining are unavailable.

Safe list is a command policy, not OS sandboxing. Custom programs can access the
network or run further code, and filesystem checks do not isolate execution from
other local processes. See [safe-list configuration](tools.md#safe-list-configuration)
for rules, supported commands, platforms, and repository layouts.

## Commands

Use this edition when the assistant needs general command execution for builds,
tests, or other programs. Both native and legacy tool calls accept command
strings interpreted by a shell, including pipelines, redirects, and multiline
scripts. The assistant can wait for output from a running job or stop it.

Commands run with the permissions of the VS Code extension host and may access
files or the network beyond the workspace. They require approval by default.
See [command tools](tools.md#command-tools) for execution and approval behavior.

## Advanced

Use this edition when you also want web research. It includes the same command
capabilities as Commands, plus search through Brave Search or SearXNG and
reading public webpages. The model connection remains local/LAN; web requests
go to the configured search provider and public websites.

Web tools become available after configuring and verifying a search connection
with **Set** in Settings. They require approval by default. See
[Advanced web search](tools.md#advanced-web-search) for setup.

## Shared behavior and switching editions

Chat modes apply in every edition: Plan and Review are read-only and cannot
edit files or run commands. File edits and commands are available only in Act
mode. See [chat modes](user-guide.md#chat-modes) for details.

All editions can draft commit messages through VS Code's built-in Git
integration, including No commands. See
[commit message generation](user-guide.md#commit-message-generation).

The packages share the extension ID `local.locality`. Installing another edition
replaces the installed edition while retaining chats and common preferences.
The installed edition appears in Locality's Settings tab. Choose a download
from the [README comparison](../README.md#four-levels-of-locality) and follow the
[installation instructions](../README.md#install).
