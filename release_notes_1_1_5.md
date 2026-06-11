# Bodhi Sync Browser v1.1.5 Release Notes

*These notes are formatted to be easily copied and pasted onto your website or GitHub releases page.*

---

## 🚀 What's New in v1.1.5

We've completely overhauled the multitasking experience and supercharged the browser's backend for an incredibly fast, secure, and lightweight browsing session.

### 🪟 Native Split-Screen & Grid Multitasking
Stop managing messy overlapping windows. With version 1.1.5, Bodhi Sync introduces **Native Split-Screen**, allowing you to seamlessly divide a single tab into multiple resizable panes. 
- **Fluid Resizing:** We built a custom Pointer Capture engine so dragging the pane dividers feels incredibly responsive and perfectly native—no stuck cursors.
- **Sidebar Integration:** Your split panes now show up as organized sub-items in your Sidebar. You can easily drag-and-drop to reposition them, or close individual panes with a single click.

### ⚡ Blazing Fast Performance
- **V8 Bytecode Caching:** We’ve enabled aggressive caching rules in the Chromium engine. The browser now caches JavaScript bytecode on your very first visit to a site, making subsequent loads near-instant.
- **GPU Acceleration:** We forced hardware GPU rasterization and zero-copy rendering, offloading complex visual tasks to your graphics card. Scrolling through heavy, media-rich websites is now buttery smooth.
- **Seamless Launch:** We completely eliminated the jarring "white flash" that occurs when opening the browser. The UI now boots silently in the background and only presents itself when fully ready.

### 🛡️ Enterprise-Grade Security
Your privacy is our priority. We've locked down the browser shell to mitigate zero-day exploits.
- **Strict Sandboxing:** All web content now runs within a strict, OS-level sandbox. Even if a site contains malicious code, it is physically impossible for it to reach your local files or system.
- **Privacy Prompts:** We implemented a native permission handler. Whenever a site requests access to your **Camera**, **Microphone**, **Location**, or **Notifications**, you will be prompted with a secure, native popup asking for your explicit consent.
- **Anti-Hijack Protection:** The main browser interface is now locked against navigation hijacking (e.g., accidentally dragging and dropping a malicious file onto the URL bar).

### 🗜️ Dramatically Reduced Download Size
We heard your feedback about the installer size! 
- By dropping legacy 32-bit (`ia32`) support, removing redundant backend files from the packaged build, and applying maximum build compression, we have **reduced the installer size by over 60%** (bringing it below 200MB, down from ~560MB).
