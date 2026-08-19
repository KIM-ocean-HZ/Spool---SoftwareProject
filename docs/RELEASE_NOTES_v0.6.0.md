Spool is a context hub for long-running projects: capture fragments the moment they appear, keep them threaded under one project, and pack any thread into a paste-ready briefing when you need to re-enter the project — or re-brief an AI.

**v0.6.0 adds two things you can see and one you can feel.** A second appearance you can switch on and off, a break reminder that actually stops you working, and a fix for a rendering defect that had been quietly flattening translucent surfaces all over the app.

## Download

**macOS** — `Spool_0.6.0_aarch64.dmg` · 9.0 MB · Apple Silicon (M1 or later), macOS 11 or newer

**Windows** — `Spool_0.6.0_x64-setup.exe` · 6.7 MB · x64, Windows 10 or 11

The macOS build is signed and notarized with a Developer ID, so it opens without the "unidentified developer" warning. **The Windows build is still not code-signed** — SmartScreen will show "Windows protected your PC"; open *More info → Run anyway* if you want to install it.

`Spool-macOS-arm64.dmg` and `Spool-windows-x64-setup.exe` are the same two files under fixed names, for direct-download links — either name works.

```
sha256  490fe92012bdea9e0db6c8d9f812c339afc98ce42f56c2b39d9648dd5a3302b6  Spool_0.6.0_aarch64.dmg
sha256  0029978b8cc8a6ad2383a8a3963e2ceadd5e40cb767198b07acb13392fdcb130  Spool_0.6.0_x64-setup.exe
```

**Upgrading is safe and does nothing to your library.** The database schema is unchanged from 0.5.0 (v23), so this build runs no migration at all: it opens the library you already have, exactly as it is.

## New in 0.6.0

### A break reminder that actually interrupts

Work long enough without a break and Spool locks its own window for five minutes: a countdown in the middle, the app dimmed behind it. You can end the break early with one click, or leave it alone and it lifts itself.

- **Settings → General → Break reminder** turns it off, and sets how long a stretch of work is: **30, 60 or 120 minutes**. Those are not round numbers picked by eye — they are the three schedules tested in the study quoted on that same settings page, which is also where the 60-minute default comes from.
- The break is always five minutes, and is not adjustable. In the study, five minutes was the constant across all three schedules; it is the dose, not the timetable.
- What counts as *working* is deliberately narrow: Spool has to be the front window **and** you have to have touched it in the last five minutes. Reading a long block without moving the mouse still counts. Stepping into another app for a couple of minutes pauses the streak instead of resetting it — copying something elsewhere and coming back is the whole point of this app — but the time you were away is not counted toward the hour.
- Closing the laptop cannot hand you a fake streak. Time is credited a tick at a time, so a machine that slept for six hours contributes thirty seconds and then gets caught by the idle rule.
- The five minutes you spend on a break do not count as work. When the lock lifts, the clock starts again from zero.

### The capture panel now has a clock

The panel in the left rail that counts what you have captured takes turns with a small clock face showing the current stretch of work and how long is left before a break. The two faces only ever swap **while Spool is not the front window**, so you never watch one turn into the other. With the break reminder switched off, the panel just shows the counts, as before.

### A second appearance

**Settings → General → Appearance** switches between **Classic** and **Valentine's**. Classic is not a theme — it is the same code path the shipped app has always used, and it is the default, so installing this build changes nothing until you go and switch. Valentine's is a full palette, a display serif, a watercolour background, and a heart in place of the spool meter; the capture card gets it too.

### Fixed: translucent surfaces were not translucent

Around 119 class names across the app asked for a colour at partial opacity and were compiling to no rule at all, so those surfaces silently fell back to whatever was underneath. Dialog scrims, hover states and soft fills are now the weights they were designed to be. This is a visual fix only — nothing about behaviour or data changed.

### Fixed: the capture card ignored your appearance

The capture overlay is a separate process and was never told which appearance you had chosen, so it stayed Classic inside a Valentine's build. It now follows the setting without a restart.

---

**Spool itself still makes no network connections, and your data never leaves your machine.** The optional maintenance jobs run in your own CLI subprocess (Claude Code, Codex CLI or Gemini CLI) — that process is the one that goes online, not Spool.
