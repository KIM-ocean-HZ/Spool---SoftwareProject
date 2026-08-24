Spool is a context hub for long-running projects: capture fragments the moment they appear, keep them threaded under one project, and pack any thread into a paste-ready briefing when you need to re-enter the project — or re-brief an AI.

**v0.6.2 is the release where a project can get shorter without losing what it said.** A long project's pack eventually outgrows the window you want to paste it into, and until now the only cure was deleting your own writing. This build can hand a project to an AI, get a shorter version back, and show you exactly what changed before a single word is written to your library.

It also changes something you were told about this app, so read the network section below even if you never turn the new feature on.

## Download

**macOS** — `Spool_0.6.2_aarch64.dmg` · Apple Silicon (M1 or later), macOS 11 or newer

The macOS build is signed and notarized with a Developer ID, so it opens without the "unidentified developer" warning. `Spool-macOS-arm64.dmg` is the same file under a fixed name, for direct-download links — either name works.

**Upgrading runs one small migration.** The schema goes from v23 to v24, which adds two empty columns to the blocks table so a compressed block can carry its own original text. Nothing existing is rewritten, and Spool snapshots your database before it touches anything.

## New: compressing a project's context

Open a project and there is now a **Compress** tab. It sends that project's pack to an AI, gets a shorter version back, and puts the two side by side for you to check.

**It is off until you turn it on, and it spends your money, not ours.** Settings → *Let Spool call an AI to compress context* asks for a base URL, a model and your own API key. It defaults to DeepSeek but talks to any OpenAI-compatible endpoint. If you already have Claude Code, Codex CLI or Gemini CLI on this machine, the existing **AI engine** section still does its own jobs for free and needs no key — this is a second route for people who do not want to install a command-line tool.

**Nothing is written to your library until you press "Use this one".**

- **The check is character by character.** Numbers and dates the draft dropped are pointed at the sentence they came from, and **one click puts them back**.
- **A draft that lost a number or a date cannot be written to your library.** That gate does not open, and turning anything on elsewhere does not relax it.
- **The original text stays on the block.** Every compressed block keeps the words it had before, in the same database — the block's toolbar opens them, and one click puts them back. It costs disk, and you can turn it off in Settings, in which case the interface says so at the moment you press the button, not only in Settings.
- **Compressed blocks are marked in packs** (`🗜`), and an MCP client can ask for a specific block's original wording with the new `get_block_original` tool. The original is never inlined into a pack — the AI has to ask.
- **A block is only compressed once.** The next run packs the new blocks only, so you do not pay twice for the same paragraph.
- **Your annotations are never sent.** Not "the prompt asks the model to leave them alone" — they are not in what goes out.
- **You can stop a run**, and a run that comes back structurally broken is retried once automatically, with both attempts' usage added up and reported.
- **Before you spend anything**, a local pass counts how much of the project is repeated text, so you can see whether there is anything to win.

## ⚠️ What this changes about "Spool never goes online"

Earlier versions said Spool has no network code, no API key field, and no way to reach the internet on its own. **The first is still true. The other two are not, once you turn the API engine on.**

**Spool's main process still makes no network requests** — that is structural, not a promise, and you can check it yourself:

```bash
cd src-tauri && cargo tree -e normal | grep -iE "ureq|rustls|reqwest|hyper|openssl"   # empty
```

When you switch the API engine on, the requests come from a **separate local subprocess** (`spool-ai`) that Spool starts, using your key and your quota, and the content reaches the model vendor you chose. The endpoint must be `https` — a plain `http` URL is refused rather than sending your key in the clear.

**Your key is now in the system keychain**, alongside your other passwords, instead of a file in Spool's data folder. Existing keys are moved on first read and the old file is deleted. It does not go into the settings file and it does not travel with an exported library.

The README, the privacy policy and the website have all been rewritten for this. The privacy page's table of "when does data leave your computer" now lists four routes instead of three, and the architecture diagram draws the third network path.

## New: an out-of-date check

A second tab, **Out-of-date check**, asks an AI which blocks in a project have been overtaken by later ones — a date that moved, a decision that was reversed.

It never offers to "void" anything. For each finding you get three choices: mark the new block as correcting the old one (**the old block stays, word for word**), retire the old one, or do nothing. That wording is deliberate: in testing, most findings were "same subject, and the old block still holds most of its content" — agreeing to a blanket "void this" would have dropped blocks that were still true out of every future pack.

Every quotation the AI attributes to a block is checked against that block word for word before you are shown anything.

## New: compress overnight, automatically

Tick a project into tonight's run — on the Compress tab, or on several projects at once from the row menu in **Projects** — and give it a start time. When that time comes round, the queued projects are compressed one at a time, and each draft waits on its own project's Compress tab for you to check in the morning. If Spool was closed at that hour, it runs the next time you open it.

**Nights cost less.** DeepSeek charges half price between 00:30 and 08:30 Beijing time; on another provider, check that provider's price list. And you are not sitting there watching a progress bar.

The start time is picked from two dropdowns on a **24-hour clock**. That is deliberate: a `<input type="time">` shows 12- or 24-hour depending on your system region, so picking what looked like `01:55` could store `13:55` — a run at 1:55 in the afternoon, at full price, when you meant 1:55 at night.

The queue lists what is in it and how many characters each project holds. **It does not show a price estimate**, because most of the bill is the output, and how long the output will be is not knowable before it is sent.

## Fixed: the main window did not fit on a default-scaled Mac

On a 13" or 14" MacBook at its default resolution, Spool's window opened larger than the usable screen and the right rail sat about halfway off it. The window now opens to the screen's actual work area.

## Also in this release

- **The break reminder now floats above whatever you are working in**, and the "are you actually working" test no longer requires Spool to be the front window — which it never is, since the whole point is that you are somewhere else.
- **The capture gesture can be paused in one click**, from Settings or from the menu bar, for when another app wants the same double-tap.
- **A sample project is there the first time you open Spool**, so the first ⌘⇧P has somewhere to go, and it is reseeded in the language you switch to.
- **Spool says it does not go online before the keyboard permission prompt appears**, not after.
- **Packs changed**: the header now asks the reader whether the context still applies, packs carry explicit start and end boundaries, and a `💭` marker is printed on the line it belongs to.
- **Fixed**: the out-of-date check borrowed the compression run's state and four places on screen reported the wrong thing at once; a finished check that found nothing showed a blank panel.
- **Fixed**: pressing Stop during a compression run reported a broken installation and told you to reinstall Spool.

---

**Spool's main process still makes no network connections.** Content leaves this machine on exactly three routes, all of them yours to switch on: an MCP client you connected, a CLI engine subprocess (Claude Code, Codex CLI, Gemini CLI), and — new in this release — the `spool-ai` subprocess, if you gave it a key.
