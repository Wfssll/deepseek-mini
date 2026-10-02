# Changelog

## 0.03 — 2026-10-03

- Paste screenshots and images into the mini composer with Command-V, or use the explicit paste-image button.
- Upload pasted images through the official file input, show thumbnails, preserve question text, and avoid intercepting plain-text paste.
- Use Electron’s current asynchronous ClipboardItem API for native clipboard images and text copying.
- Guard uploads while submitting or generating; clean temporary pasted-image files on app exit.
- Add an always-visible new-chat action to clear current attachments.
- Add an in-app start / hide / paste / quit guide with optional terminal commands, plus explicit quit buttons in settings and the guide.
- Show a visible DS menu-bar label and open the composer on a normal launch; keep login-item launches in the background.
- Preserve existing sign-in sessions, shortcuts, window geometry, and font settings.

Validation: 20 automated tests and Electron desktop regressions, including actual system clipboard image reads, PNG upload bytes, image previews, draft preservation, normal text paste, help, and quit. The installed app was also tested on the development Mac with the existing official account: Command-V image upload, official screenshot text recognition and answer synchronization, in-app quit, and relaunch.


## 0.02 — 2026-10-02

Renamed the project and app to **deepseek-mini**, retaining existing local sign-in sessions and shortcut preferences.

- Fixed background submission by clicking the official composer’s send button instead of sending Enter to an unfocused window.
- Wait for asynchronous acknowledgement for up to eight seconds, preserve unsent drafts, report disabled send buttons, and avoid automatic duplicate clicks.
- Added a visible drag grip and resizable edges/corners. The answer area fills the chosen window size and scrolls inside it.
- Remember window position, width, and expanded answer height. Website polling no longer overrides the selected size.
- Added a 12–24 px font slider with immediate preview and persistent settings for questions, answers, and code.
- Keep remembered windows reachable when a display is disconnected.
- Added legacy settings migration checks and desktop regressions for delayed sends, resize stability, position, and font persistence.

Validation: 17 automated tests and the Electron offline desktop suite. Live account regression was not completed for this release. Apple Silicon build; Apple Developer signing and notarization remain unavailable.

## 0.01 — 2026-10-02

First public release of **deepseek-fast**, a keyboard-first macOS mini window for the official DeepSeek website.

- A compact composer with an expandable answer card.
- Global show/hide shortcut, first-run shortcut setup, and conflict reporting.
- Official website sign-in with a persistent local session; no API key needed.
- DeepThink and web search controls synchronized with the website.
- File attachment entry point using the native file picker.
- Menu-bar access, Esc to hide, answer copying, and a full website window.
- Optional launch at login.
- Isolated website renderer, sanitized answer markup, and local-only settings.
- Offline demo, automated checks, macOS app packaging, and ZIP checksum generation.

The first prebuilt download targets Apple Silicon Macs. Apple Developer signing and notarization are not included. Website layout changes may require adapter updates; file handling and extended background use need further community testing.
