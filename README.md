# Speech Quality Listening Test

Static GitHub Pages listening test for the quality-preserving pilot.

## Current pilot

The current manifest contains 80 items: 10 LibriSpeech samples x 8 systems.

Systems:

- Original speech
- Waveform, lambda = 1e07
- Waveform, lambda = 1e06
- melspec, lambda = 1e05
- melspec, lambda = 1e04
- latent, lambda = 1e06
- latent, lambda = 1e05
- noisy baseline on waveform space, amp = 0.01

The listener sees only item progress, audio playback, and a 1-5 quality rating. System IDs and labels are included in exported CSV rows and Google Sheets submissions.

## Google Sheets setup

1. Create a Google Sheet.
2. Open Extensions -> Apps Script.
3. Paste `google-apps-script.gs` into the script editor.
4. Deploy as a Web App.
5. Set access to allow the listeners you expect to submit. For public anonymous links, choose access that allows anyone with the link.
6. Copy the Web App URL into `config.js` as `googleAppsScriptUrl`.

The receiver appends raw rows to a `responses` sheet and refreshes a `summary` sheet with `n` and mean score by system.

## Local resume, elapsed time, and CSV fallback

The page saves progress to `localStorage` after each rating. Resume works on the same browser and device. The test page shows elapsed time since the listener started or resumed the session; this elapsed display is not included in CSV or Google Sheets submissions. On finish, the page downloads a CSV backup even when Google submission is configured.
