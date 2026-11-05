# Aspen brand bed — provenance

- File: `aspen-bed-7.wav` (21.9s, 32kHz mono) -> shipped as `composition/assets/music/aspen-bed.wav`
- Generator: **Meta MusicGen (`facebook/musicgen-small`)**, HuggingFace `pipeline("text-to-audio")`
- Runtime: ComfyUI embedded Python (torch 2.10 CUDA fp16) on RTX 3090, seed `7` (torch.manual_seed), `temperature 0.9`, `max_new_tokens 1100` (~22s)
- Prompt: "upbeat minimal electronic instrumental, warm and bright, 108 bpm, plucky
  clean electric guitar arpeggios, soft marimba pulses, finger snaps, gentle
  four-on-the-floor kick drum, airy synth pad, optimistic modern product-demo
  groove, clean mix, no vocals"
- Beat analysis: `../composition/assets/music/aspen-bed.music-cues.json`
  (tempo 107.67 BPM; beat grid 0.52 + n*0.557)
- Beat locks: hook gold node 1.64; desk rows 3.85/4.40/4.96/5.51/6.07; Generate
  click 8.85; typing 9.585-10.581; commit click 13.85; punchline 17.74; glow
  breathe 18.30/18.85/19.40.
- Replaces the Ende "Happy Beats" library beds used by every other project's
  brag (vols 1/9/10/11/12) — this track is original, MIT repo-compatible audio
  (MusicGen-small weights: MIT; generation carries no third-party license).

Alternates kept out of git (regenerable from the prompt/seed): aspen-bed-raw.wav
(seed 424242), aspen-bed-13337.wav.
