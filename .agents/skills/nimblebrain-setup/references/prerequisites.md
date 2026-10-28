# Prerequisites

Offer each command and say what it changes. Run it only after the person says yes. Prefer the
package manager they already use. After any install, open a new shell or run `hash -r`, then rerun
`scripts/doctor.sh`.

## git

- macOS: `xcode-select --install` (Command Line Tools), or `brew install git`.
- Debian or Ubuntu: `sudo apt-get install git`. Fedora: `sudo dnf install git`.

## Bun

NimbleBrain pins Bun in `package.json` (`"packageManager": "bun@1.4.4"` at the time of writing;
read the file for the current pin). CI and the container image use the same version, so match it.
A newer patch release usually works. An older minor release does not.

- Homebrew: `brew install oven-sh/bun/bun`, then check `bun --version`.
- npm: `npm install -g bun@1.4.4`.
- Official installer, pinned: `curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4"`. Show the
  person the script (`curl -fsSL https://bun.sh/install | less`) before running it, and let them
  choose this route.
- Already installed at another version: `bun upgrade` moves to the latest release, which may not
  match the pin. To match the pin exactly, use the pinned installer line above.

## Node.js 22+

The web dev server (Vite) runs on Node.js. Bun does not replace it here.

- Homebrew: `brew install node@22` (or `brew install node`).
- A version manager the person already uses (`nvm install 22`, `fnm install 22`, `mise use node@22`).
- Linux packages: the distribution's Node.js 22 package or NodeSource.

## curl

Present on macOS and most Linux installs. Otherwise `sudo apt-get install curl` or the equivalent.

## Ports

NimbleBrain needs two free TCP ports: the API (default 27271 here) and the web page (27270). If
those are taken, pick any other free pair. `scripts/doctor.sh --api <port> --web <port>` checks
them. The showcase and GlassEngine examples use 27280 and 27281 by default.

## Coding agent sign-in

Before connecting the agent (SKILL.md step 10), check the agent itself works in a terminal:

- `claude` opens without a "Not logged in" notice. If it shows one, run `/login`.
- `codex login status` reports a login.
