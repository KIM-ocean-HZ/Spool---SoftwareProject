Spool is a context hub for long-running projects: capture fragments the moment they appear, keep them threaded under one project, and pack any thread into a paste-ready briefing when you need to re-enter the project — or re-brief an AI.

**v0.6.1 makes one checkbox tell the truth, and changes how corrections look.** The headline is a fix to a promise the interface had been breaking: a file you had marked as off-limits to AI was still being read. Read the first section before you upgrade — it is the one change here that can alter what an AI can see in your library.

## Download

**macOS** — `Spool_0.6.1_aarch64.dmg` · 9.0 MB · Apple Silicon (M1 or later), macOS 11 or newer

**Windows** — `Spool_0.6.1_x64-setup.exe` · 6.7 MB · x64, Windows 10 or 11

The macOS build is signed and notarized with a Developer ID, so it opens without the "unidentified developer" warning. **The Windows build is still not code-signed** — SmartScreen will show "Windows protected your PC"; open *More info → Run anyway* if you want to install it.

`Spool-macOS-arm64.dmg` and `Spool-windows-x64-setup.exe` are the same two files under fixed names, for direct-download links — either name works.

```
sha256  0e41d6c3ae5278efcb6c5924fbf578c0d5e0ab481f1eb3260ecdf1459ab52708  Spool_0.6.1_aarch64.dmg
sha256  8814690c8894ef8a7f9cded5b5e3ca86923ed5b9646b798c56b71c6077db350a  Spool_0.6.1_x64-setup.exe
```

**Upgrading is safe and does nothing to your library.** The database schema is unchanged from 0.5.0 (v23), so this build runs no migration at all: it opens the library you already have, exactly as it is.

## ⚠️ Behaviour change: "AI can't read this file" now means it

If you attach a file to a project, Spool gives you two separate checkboxes: one puts the file's text into the pack **you** copy to your clipboard, the other decides whether **an AI** connected over MCP may read it.

Until this release, either checkbox was enough to unlock the file. So if you left the pack checkbox on and switched the AI one off, the interface said *"AI can't read this file"* while the AI could still search its text, and `get_pack` still inlined the whole thing. The interface was making a promise the code did not keep.

**Now the AI checkbox is the only lock.** Turn it off and the file is closed to AI: it is not searched, not summarised, and not inlined into the pack an AI receives. The other checkbox goes back to meaning exactly what it says — include this text in the pack **I** copy.

**What to expect after upgrading:** a file you had opened up only through the pack checkbox is now locked. The AI can still see that the file exists and that it has extracted text — it just cannot read it, and it now knows how to ask. Expect access requests for files that used to answer silently. If you want one of them readable, tick the AI checkbox for it.

## Corrections are now annotations, not separate cards

A correction used to get its own card in the timeline, plus a pair of lines pointing you at a block number somewhere else. Following one meant jumping around and reading the same fact three times.

Now a correction is pinned underneath the thing it corrects. The sentence that was corrected is highlighted — a warm underline, deliberately a different colour from a `==highlight==` you made yourself — and **clicking that sentence opens the correction below it, joined by a dashed line**, the way a margin note attaches to a line of text. If two sentences in one block were corrected by two different blocks, clicking the first opens only the first.

- **You can write corrections yourself now.** Select the wrong text and the toolbar offers *Correct this?* next to *Highlight?* — same gesture, same selection. Corrections written here are labelled as yours; corrections written by an AI carry the name of the client that sent them. Nothing marks a hand-written correction as AI-authored.
- **Nothing about your data changed.** A correction is still an ordinary block with the same reference it always had. Packs, block numbers and the append-only history are byte-for-byte what they were — only the drawing changed.
- A correction is only folded under its target when the reader can actually get to it: the quoted sentence still has to be findable in the target block, and the target cannot be a merged block. Otherwise the correction keeps its own card and the old pointer lines, because a correction folded into something unclickable would be a block that exists in your library, goes into packs, and cannot be seen anywhere on screen.

**Removed: "which block does this correct?"** The picker that let you attach a correction to another block by hand is gone — it was the confusing route this release replaces. Corrections you already have are untouched and still display; the *supersedes* relationship is still read everywhere it was read before. Only the way to create one by hand is gone.

## Fixed: highlighting only ever worked on a single line

Selecting across a line break and marking it as a highlight appeared to work and then came back wrong — either the highlight was not drawn, or bare `==` showed up in the text. Selecting across bold text or a heading failed the same way.

There were two independent causes and fixing one alone still left it broken: the pattern that finds a highlight did not match across newlines, and the code located your selection by searching for the selected words in the source text — words the renderer had already stripped `**` and `##` out of, so any selection crossing a mark could not be found. Both are fixed, and two older limitations went with them: you can now highlight the second occurrence of a word rather than always the first, and a selection containing `==` is no longer refused.

## Also in this release

- **The work/capture panel in the left rail now has a 10-minute backstop.** The two faces still swap when Spool is not the front window; if that has not happened for ten minutes, the panel swaps anyway. It can therefore change while you are looking at it — a deliberate trade for a panel that no longer sits on one face all session.
- **Fixed:** cancelling a correction relationship used to clear the reference but leave the quoted sentence behind, producing a row that Spool's own validation would reject. Cancelling now clears both.
- The break-reminder study quoted in Settings is now cited on the website with its DOI.

---

**Spool itself still makes no network connections, and your data never leaves your machine.** The optional maintenance jobs run in your own CLI subprocess (Claude Code, Codex CLI or Gemini CLI) — that process is the one that goes online, not Spool.
