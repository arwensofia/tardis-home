# TARDIS Home

An Apple TV-style launcher for the Samsung UE50TU7005 ("TARDIS"). No ads, analytics, web fonts or network requests; the whole package is about 80 KB.

## What it shows

Netflix, YouTube and Disney+ first, then every other app installed from Samsung's store (alphabetically), then Samsung's **Apps** store last. Samsung's hidden system services, background services and utilities (e-Manual, Device Care, TV Plus privacy settings) are filtered out: store apps are recognised by their 10-character package IDs, plus the few partner apps listed in `KNOWN` in `app.js`.

The list re-reads itself whenever TARDIS Home comes back to the foreground and whenever an app is installed, updated or removed, so new downloads appear on their own. Apps listed in `KNOWN` use bundled artwork from `icons/`; anything else uses the TV's own icon for that app, or its name if the TV has none.

## Files

- `index.html`, `style.css`, `app.js`, `config.xml`: the app.
- `icons/*.webp`: 400x240 tile art, rendered by `work/tile-art/build_tiles.py` from `work/tile-art/tiles.html` (Disney+ and SkyShowtime are cropped from the TV's own icons).

## Install

`work/install.sh` builds, signs (profile `TARDIS-TV-Samsung-2`) and installs to the TV at 192.168.100.21, then launches it. The TV needs Developer Mode on with this Mac's IP (Apps → `12345`).

## Limits

Samsung does not let a sideloaded app replace the built-in home screen, start at power-on, or remove preinstalled apps. The signing certificates expire on 21 October 2027; re-sign and reinstall before then. Samsung's testing FAQ says developer installs can be removed when the TV is switched off, so check after a full power cycle; reinstalling takes seconds.

Performance note: this TV paints full-screen CSS gradients very slowly, so the top-shelf colour wash is a tiny canvas image stretched by the GPU. Keep animations to `transform` and `opacity`.
