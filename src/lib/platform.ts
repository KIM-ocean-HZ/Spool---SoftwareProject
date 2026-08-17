// Which desktop this window is running on, and the one thing that changes everywhere
// because of it: how a keyboard shortcut is spelled.
//
// The user-agent test is not new — `lib/capture/shortcut.ts` has picked the default search
// accelerator this way since §19.1. It is centralised here because the Windows port made
// the same question appear in a dozen files at once, and a dozen copies of a platform test
// is how one of them ends up inverted.
//
// ⚠️ Two flags, not one boolean. "Not a Mac" is not the same claim as "Windows": the Linux
// build is not something Spool ships, but a `!IS_MAC` that silently means "Windows" would
// start telling a Linux user about Windows things the day anyone tried. Copy that only
// makes sense on one platform asks for that platform by name.

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;

export const IS_MAC = ua.includes('Mac');
export const IS_WINDOWS = ua.includes('Windows');

// The primary modifier this platform uses for app commands (new, search, settings, undo).
// The key handlers themselves already accept `metaKey || ctrlKey` everywhere, so this is
// purely what the label says — and a label that names a key the user does not have is the
// same as no label at all.
export const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';

// Mac key symbols → the words Windows keyboards actually print. Applied to UI copy that
// mentions a shortcut inline, so one Chinese source string keeps serving both platforms
// instead of every such sentence being written twice.
//
// ⚠️ Each symbol expands to "Name+" so that a run of them chains: `⇧⌘G` → `Shift+Ctrl+G`.
// When no key follows (`双击 ⌥`, or a symbol before a closing bracket) that leaves a
// dangling `+`, which is trimmed. The trim set deliberately excludes the ASCII comma:
// `设置 (⌘,)` names the comma KEY, and eating that plus would turn a real shortcut into
// the word "Ctrl".
const KEY_WORDS: Record<string, string> = {
  '⌘': 'Ctrl+',
  '⌃': 'Ctrl+',
  '⌥': 'Alt+',
  '⇧': 'Shift+',
};

export const localizeKeyCaps = (s: string): string => {
  if (IS_MAC) return s;
  return s
    .replace(/[⌘⌃⌥⇧]/g, (m) => KEY_WORDS[m] ?? m)
    .replace(/\+(?=[\s)）】」』，。、？！]|$)/g, '');
};
