# BeatSync Studio 🎬🎵

Open-source, local-first cue editor for synchronizing **lyrics, narration, dialogue and storyboard scenes** to an audio track.

## Features
- Load a local audio or video file (MP3, WAV, MP4, etc.) — it never leaves your browser.
- **Transcribe from scratch** with Whisper running in the browser (Spanish, English or auto-detect), producing lines with start and end times.
- Paste lyrics or a script manually, one line per cue, and mark timings with **M**.
- Attach an image to each line, or capture the current video frame.
- Edit timings, end times and scene notes, jump between lines, autosave locally.
- Export and import project **JSON**; export **CSV**, **SRT** and **VTT** subtitles.
- No backend, no account, no API keys, no cost per use.

## Run in VS Code
1. Unzip or clone this repository and open the folder in VS Code.
2. Serve the folder over HTTP (opening `index.html` by double-click does not work, because transcription runs in a Web Worker): use the **Live Server** VS Code extension, or the command below.
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
Audio and video are loaded with a browser object URL and are **not uploaded**. Transcription runs locally with Whisper via [transformers.js](https://github.com/huggingface/transformers.js); the model files are downloaded once from Hugging Face and cached by the browser. Project data (lines, timings and notes) is saved to your browser's `localStorage`; images are stored in IndexedDB. Both can be exported as JSON for the project data only. The audio file and images are not included in JSON exports; load them again when reopening a project. Avoid including copyrighted music, private photos or confidential material in your public repository.

## Keyboard shortcuts
| Key | Action |
| --- | --- |
| Space | Play / pause |
| M | Mark selected cue and advance |
| ← / → | Previous / next cue |
| J | Jump to selected cue's marked time |

## Limitations / roadmap
Transcription runs in the browser, so long audio is slow and the Tiny/Base/Small models trade speed for accuracy. Subtitle end times fall back to the next line's start, or +3 seconds. Images are not included in JSON exports.

Roadmap: a Web Worker so the page stays responsive during transcription, n8n workflows, and waveform display. The MCP server for AI clients is available in [`mcp/`](mcp/README.md).

## License
MIT — see `LICENSE`.
