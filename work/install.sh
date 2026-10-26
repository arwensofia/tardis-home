#!/bin/bash
# Build, sign and install TARDIS Home on the TV, then launch it (in debug mode with "debug").
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/outputs/TARDIS-Home"
B="$ROOT/work/clean-build/TARDIS-Home"
T="$ROOT/work/tizen-studio-base/tools/ide/bin/tizen"
S="$ROOT/work/tizen-studio-base/tools/sdb"
TV=192.168.100.21:26101

rm -rf "$B" && mkdir -p "$B"
cp -R "$SRC/config.xml" "$SRC/index.html" "$SRC/style.css" "$SRC/app.js" "$SRC/icons" "$B/"
"$T" build-web -- "$B" | grep BUILD
"$T" package -t wgt -s TARDIS-TV-Samsung-2 -- "$B/.buildResult" | grep "Package File"
cp "$B/.buildResult/TARDIS Home.wgt" "$B/.buildResult/TARDISHome.wgt"

"$S" devices | grep -q "${TV%:*}" || { "$S" connect "$TV"; sleep 2; }
"$T" install -n TARDISHome.wgt -s "$TV" -- "$B/.buildResult" | tail -2
if [ "$1" = debug ]; then
  "$S" -s "$TV" shell 0 debug TARDISHome.Home
else
  "$T" run -p TARDISHome.Home -s "$TV" | tail -1
fi
