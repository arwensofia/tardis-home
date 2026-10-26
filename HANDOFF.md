# TARDIS Home: handoff / rebuild from scratch

Everything needed to set this up again on a fresh Mac. Last working state: **v1.1.0 installed and running on the TV (October 2026).**

## What this is, and its limits

An Apple TV-style launcher web app for the Samsung TV **"TARDIS"**, sideloaded through Developer Mode. Samsung does **not** allow a sideloaded app to:

- replace the Samsung home screen,
- start automatically at power-on,
- remove preinstalled apps.

Open it from the Samsung Apps bar. Tip: move it to the first slot of the app bar.

## The TV

| | |
|---|---|
| Model | UE50TU7005KXXC (2020), Tizen **5.5**, web engine **Chromium 69**, 1920×1080, devicePixelRatio 1 |
| LAN IP | 192.168.100.21 (check the router if it changes; update `TV=` in `work/install.sh`) |
| SDB port | 26101 |
| DUID for certificates | **`7XCEYX5AYLXWE`**: from `sdb shell 0 getduid`. Do **not** use the `uuid:7f42b06a-…` value the TV's :8001 API reports; certs made with that fail. |
| Fonts | Only `SamsungOneUI`. That's why tile logos are pre-rendered images. |

## Rebuild from scratch

### 1. Tools on the Mac

- **Tizen Studio**, CLI edition is enough (`web-cli_Tizen_Studio_*_macos-64.bin` from developer.tizen.org). `work/install.sh` expects it unpacked at `work/tizen-studio-base/` (`tools/ide/bin/tizen` and `tools/sdb`). Install it there or edit the paths at the top of the script. It's about 3 GB and is git-ignored.
- **Python 3 + Pillow** and **Google Chrome**: only needed to re-render tile art (`work/tile-art/build_tiles.py`).
- **Node 22+**: only needed for remote debugging (see below).

### 2. TV Developer Mode

On the TV: **Apps** → type `1 2 3 4 5` → Developer Mode **On** → Host PC IP = the Mac's IP (`ipconfig getifaddr en0`) → **restart the TV** (hold power until the Samsung logo). Wait about a minute after boot before connecting.

```bash
SDB=work/tizen-studio-base/tools/sdb
$SDB connect 192.168.100.21:26101
$SDB devices                  # should list UE50TU7005KXXC
$SDB -s 192.168.100.21:26101 shell 0 getduid
```

### 3. Certificates (Samsung author + distributor)

The current ones live **outside the repo** in `~/SamsungCertificate/TARDIS-TV-Samsung-2/` (keys plus password files, mode 600) and expire **21 Oct 2027**. To make new ones (you sign in to your Samsung account in the browser; the script never sees your password):

```bash
python3 work/samsung-cert/request_certs.py ~/SamsungCertificate/TARDIS-TV-Samsung-2 7XCEYX5AYLXWE work/samsung-cert
```

It replicates Tizen Certificate Manager's Samsung flow: OAuth callback on `localhost:4794`, then POSTs the CSRs to `svdca.samsungqbe.com/apis/v3/{authors,distributors}` with `platform=VD`, privilege `Public`. Then register the signing profile:

```bash
C=~/SamsungCertificate/TARDIS-TV-Samsung-2
work/tizen-studio-base/tools/ide/bin/tizen security-profiles add -A -n TARDIS-TV-Samsung-2 \
  -a $C/author.p12 -p "$(cat $C/author.password)" -d $C/distributor.p12 -dp "$(cat $C/distributor.password)"
```

**If you make a new author certificate, uninstall the old app from the TV first.** Tizen refuses updates signed by a different author.

### 4. Install

```bash
work/install.sh          # build → sign → install → launch
work/install.sh debug    # same, but launches with the remote inspector (prints a port)
```

## Gotchas that cost hours last time

- **`install failed[118, -12] … Invalid format of certificate in signature`** means the distributor cert's DUID doesn't match the TV. Use the `getduid` value.
- **"No DUID for selected device" from `tizen install-permit`**: ignore it. The permit step is only for Tizen ≤ 4.0.
- **Never package a folder that contains old `.wgt` files.** They get nested inside the new package. `install.sh` always builds from a clean copy.
- **SDB hangs or "failed to connect to remote target"** even though the TV's port is open: Tizen Studio and Certificate Manager GUI apps respawn a broken SDB server. Quit them, run `sdb kill-server`, then `sdb connect` again. Right after a TV reboot, give it about a minute.
- **SDB shell is restricted** to `0 <cmd>` commands: `0 getduid`, `0 vd_applist` (the real Smart Hub app list), `0 debug <appId>`, `0 was_kill <appId>`. `sdb pull` from `/opt/share` is blocked.
- **Performance:** this TV takes **1–2 s** to paint a full-screen CSS gradient. The top-shelf colour wash is therefore a 128×72 canvas image shown in an `<img>` that the GPU stretches. Animate only `transform`/`opacity`, and give blurred shadows their own layer (`will-change: opacity`). Measured result: about 55 fps navigation.
- **App list:** `tizen.application.getAppsInfo` returns about 289 apps, about 161 of them "visible", nearly all system junk (hotel/factory modes, dummy "Apple TV"/"YouTube" stubs, services). The launcher keeps store apps (10-character package IDs) plus known partner IDs, and hides services, e-Manual, Device Care and TV Plus privacy settings.
- **The TV's own app icons are unreliable.** YouTube's is the generic Tizen pinwheel, Netflix's and Prime Video's won't load, and the others are 117–170 px. Hence the bundled tile art.
- **Permanence:** apps installed this way survive reboots in normal use, but Samsung's FAQ says developer installs can be removed when the TV is switched off. Check after a full power cycle. Reinstalling takes seconds.

## Remote debugging (no screenshots on this TV)

```bash
work/install.sh debug                                    # note "port: NNNNN"
$SDB -s 192.168.100.21:26101 forward tcp:NNNNN tcp:NNNNN
curl http://127.0.0.1:NNNNN/json                          # webSocketDebuggerUrl
```

Connect to that WebSocket with any Chrome DevTools Protocol client (Node's built-in `WebSocket` is enough). `Runtime.evaluate` and `Input.dispatchKeyEvent` work. `Page.captureScreenshot` never returns on this TV. Measure smoothness with a `requestAnimationFrame` loop around a simulated key press.

## Installed app IDs (for `KNOWN` in app.js)

| App | Tizen app ID | Package |
|---|---|---|
| Netflix | `org.tizen.netflix-app` | partner |
| YouTube | `9Ur5IzDKqV.TizenYouTube` | store |
| Disney+ | `MCmYXNxgcu.DisneyPlus` | store |
| Prime Video | `org.tizen.primevideo` | partner |
| Apple TV | `com.samsung.tv.aria-video` | partner |
| HBO Max | `5b8c3eb16b.BeamCTVDev` | store |
| SkyShowtime | `skysh0WTIM.SkyShowtime` | store |
| Spotify | `rJeHak5zRg.Spotify` | store |
| Samsung Apps store | `org.volt.apps` | system |

New apps from Samsung's store use 10-character package IDs, so they show up automatically. The launcher re-reads the list on install, update or uninstall events (`package.info` privilege) and whenever it returns to the foreground. To give a new app proper tile art, add a tile to `work/tile-art/tiles.html` and `VECTOR` in `build_tiles.py`, run it, and add an entry to `KNOWN`.

## Not in this repo

- The Tizen SDK and installers (download again).
- Signing keys and passwords (`~/SamsungCertificate/`; regenerate with step 3 if lost).
- The TV's original Disney+ and SkyShowtime icon files used to crop those two tiles. The rendered `disney.webp` and `skyshowtime.webp` are committed, and `build_tiles.py` keeps them when run without an icon folder.
