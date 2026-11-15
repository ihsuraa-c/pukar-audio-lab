# PUKAR — Audio Analysis Dashboard

A static, browser-based prototype for acoustic exploration. Built with HTML, CSS, vanilla JavaScript, the Web Audio API and Canvas. No backend or build step is required.

## Run locally

1. Download and unzip this project.
2. Open `index.html` in a modern browser, or use a local static server:
   ```bash
   python -m http.server 8000
   ```
3. Visit `http://localhost:8000`.

Microphone permission is not needed. Audio files are decoded and analysed locally in the browser.

## Deploy with GitHub Pages

1. Create a new GitHub repository, for example `pukar-audio-lab`.
2. Upload `index.html`, `styles.css`, and `app.js` to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then Save.
6. Wait for GitHub Pages to publish the site. Your prototype URL will look like:
   `https://YOUR-USERNAME.github.io/pukar-audio-lab/`

You can also push the files using Git:

```bash
git init
git add .
git commit -m "Build PUKAR audio analysis prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/pukar-audio-lab.git
git push -u origin main
```

## Features

- WAV and MP3 upload, click-to-browse and drag-and-drop.
- Real decoding through `AudioContext.decodeAudioData()`.
- Waveform rendered from decoded audio samples.
- Playback, pause and seek using the HTML audio element.
- STFT spectrogram using a 2048-point radix-2 FFT, Hann window and 512-sample hop.
- Linear/log frequency display and configurable maximum frequency.
- Averaged one-sided magnitude spectrum and prominent local peaks.
- Spectral centroid, spectral bandwidth, duration, sample rate, peak amplitude and RMS.
- Responsive layout; no external JS libraries.

## Prototype limits

- File size limit: 100 MB.
- Processing happens on the user's device. Large recordings may take time and use significant memory.
- The current FFT is a straightforward prototype implementation, not a real-time streaming engine.
- Spectral peak detection is a simple local-maximum method; it is not pitch tracking or source separation.
- The Google Fonts import is optional. If offline, the browser falls back to system fonts.
- No files are uploaded or stored by this site.

## Project structure

```text
pukar-audio-dashboard/
├── index.html
├── styles.css
├── app.js
└── README.md
```
