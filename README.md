# BeatSync Studio 🎬🎵

Open-source, local-first cue editor for synchronizing **lyrics, narration, dialogue and storyboard scenes** to an audio track.

## Features
- Load a local audio file (MP3, WAV, etc.) — it never leaves your browser.
- Paste lyrics or a script, one line per cue.
- Play audio and press **M** to mark each line's start; automatically advances to the next line.
- Edit timings and scene notes, jump between lines, autosave locally.
- Export and import project **JSON**; export **CSV** and **SRT** subtitles.
- No backend, no account, no external dependencies.

## Run in VS Code
1. Unzip or clone this repository and open the folder in VS Code.
2. Open `index.html` in a browser, or use the **Live Server** VS Code extension.
3. Load an audio file and paste your lyrics. Press **M** as each line starts.
4. Export JSON regularly to back up or share your work.

Optional local server:
```bash
python -m http.server 8000
```
Then visit http://localhost:8000.

## Deploy
**GitHub Pages:** Push these files to a public repository. In GitHub → Settings → Pages, select **Deploy from a branch**, `main`, `/ (root)`. The site will appear at `https://YOUR_USERNAME.github.io/YOUR_REPO/`.

**Vercel / Netlify:** Import the GitHub repository as a static site. No build command or environment variables needed; publish the repository root.

## Privacy
Audio is loaded with a browser object URL and is **not uploaded**. Project data (lyrics, timings and notes) is saved to your browser's `localStorage` and can be exported as JSON. The audio file itself is not included in JSON exports; load it again when reopening a project. Avoid including copyrighted music, private photos or confidential material in your public repository.

## Keyboard shortcuts
| Key | Action |
| --- | --- |
| Space | Play / pause |
| M | Mark selected cue and advance |
| ← / → | Previous / next cue |
| J | Jump to selected cue's marked time |

## Limitations / roadmap
Timing is manual, not AI-transcribed. SRT end times are derived from the next cue start or 3 seconds for the last cue. Future improvements could include waveform display, audio scrubbing, automatic transcription, video preview, and drag-and-drop scene assets.

## License
MIT — see `LICENSE`.
