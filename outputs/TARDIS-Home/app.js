(function () {
  'use strict';

  var SELF_ID = 'TARDISHome.Home';
  var SERVICE_CATEGORY = 'http://tizen.org/category/service';
  var COLUMNS = 5;
  // Grid geometry in rem, mirrored from style.css: first row top, row-to-row
  // distance, tile height, and where the focused row sits once the dock scrolls away.
  var ROW_TOP = 76;
  var ROW_PITCH = 27.2;
  var TILE_HEIGHT = 18;
  var GRID_FOCUS_TOP = 40;

  // Apps with bundled tile art (icons/<key>.webp), in launcher order.
  // Netflix, YouTube and Disney+ lead; other apps follow alphabetically; the store is last.
  var KNOWN = [
    { key: 'netflix', id: 'org.tizen.netflix-app', name: /^netflix$/i, label: 'Netflix', glow: '#e50914', deep: '#3d0004' },
    { key: 'youtube', id: '9Ur5IzDKqV.TizenYouTube', name: /^youtube$/i, label: 'YouTube', glow: '#ff0033', deep: '#330008' },
    { key: 'disney', id: 'MCmYXNxgcu.DisneyPlus', name: /^disney\s*\+$/i, label: 'Disney+', glow: '#13a7c7', deep: '#0a2558' },
    { key: 'prime', id: 'org.tizen.primevideo', name: /^prime video$/i, label: 'Prime Video', glow: '#1a98ff', deep: '#062b57' },
    { key: 'appletv', id: 'com.samsung.tv.aria-video', name: /^apple tv$/i, label: 'Apple TV', glow: '#8e8e96', deep: '#232326' },
    { key: 'hbomax', id: '5b8c3eb16b.BeamCTVDev', name: /^(hbo ?)?max$/i, label: 'HBO Max', glow: '#3350ff', deep: '#14093f' },
    { key: 'skyshowtime', id: 'skysh0WTIM.SkyShowtime', name: /^skyshowtime$/i, label: 'SkyShowtime', glow: '#e3127b', deep: '#3d1a8f' },
    { key: 'spotify', id: 'rJeHak5zRg.Spotify', name: /^spotify\b/i, label: 'Spotify', glow: '#1ed760', deep: '#0b3a1e' }
  ];
  var STORE = { key: 'store', id: 'org.volt.apps', label: 'Apps', glow: '#2fb4ff', deep: '#1043b8' };
  var OTHER_ORDER = 100;
  var STORE_ORDER = 1000;

  // Samsung's own utilities that look like store apps: e-Manual, Device Care, TV Plus privacy settings.
  var HIDDEN_PACKAGES = { NaL06xBRLm: true, qtMHjALHus: true, w2VwCK465D: true };
  var HIDDEN_NAMES = /e-?manual|device ?care|privacy settings/i;

  var body = document.body;
  var grid = document.getElementById('grid');
  var rail = document.getElementById('rail');
  var title = document.getElementById('title');
  var empty = document.getElementById('empty');
  var toastEl = document.getElementById('toast');
  var layers = document.querySelectorAll('.hero-layer');

  var apps = [];
  var tiles = grid.children;
  var focus = 0;
  var signature = '';
  var heroShown = '';
  var heroLayer = 0;
  var heroTimer = 0;
  var refreshTimer = 0;
  var toastTimer = 0;

  // --- App list ---------------------------------------------------------------

  // Store apps have 10-character package IDs; Samsung's system apps do not.
  function isStoreApp(info) {
    return /^[A-Za-z0-9]{10}$/.test(info.packageId) && !!info.iconPath && !!info.name &&
      (info.categories || []).indexOf(SERVICE_CATEGORY) < 0 &&
      !HIDDEN_PACKAGES[info.packageId] && !HIDDEN_NAMES.test(info.name);
  }

  function fromDef(def, info, order) {
    return { id: info.id, key: def.key, label: def.label, glow: def.glow, deep: def.deep, order: order };
  }

  function classify(info) {
    var i;
    if (!info.show || info.id === SELF_ID) return null;
    if (info.id === STORE.id) return fromDef(STORE, info, STORE_ORDER);
    for (i = 0; i < KNOWN.length; i += 1) {
      if (KNOWN[i].id === info.id) return fromDef(KNOWN[i], info, i);
    }
    if (!isStoreApp(info)) return null;
    for (i = 0; i < KNOWN.length; i += 1) {
      if (KNOWN[i].name.test(info.name)) return fromDef(KNOWN[i], info, i);
    }
    return {
      id: info.id, label: info.name.split(' - ')[0].trim(), order: OTHER_ORDER,
      icon: /^[a-z]+:/i.test(info.iconPath) ? info.iconPath : 'file://' + info.iconPath,
      glow: '#4a4a55', deep: '#1c1c21'
    };
  }

  function useList(infos) {
    var list = [];
    var seen = {};
    infos.forEach(function (info) {
      var app = classify(info);
      var slot = app && (app.key || app.id);
      if (app && !seen[slot]) {
        seen[slot] = true;
        list.push(app);
      }
    });
    list.sort(function (a, b) { return a.order - b.order || a.label.localeCompare(b.label); });

    var sig = list.map(function (app) { return app.id; }).join(',');
    if (sig === signature) return;
    var focusedId = apps[focus] && apps[focus].id;
    signature = sig;
    apps = list;
    render();
    var keep = 0;
    apps.forEach(function (app, i) { if (app.id === focusedId) keep = i; });
    focus = keep;
    setFocus(keep, true);
  }

  function refresh() {
    if (!window.tizen || !tizen.application) {
      useList(PREVIEW_APPS);
      return;
    }
    try {
      tizen.application.getAppsInfo(useList, function () { toast('Couldn’t read the app list'); });
    } catch (error) {
      toast('Couldn’t read the app list');
    }
  }

  // Installs often fire several events in a row; refresh once they settle.
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 400);
  }

  // --- Tiles --------------------------------------------------------------------

  function render() {
    grid.textContent = '';
    apps.forEach(function (app, i) {
      var tile = document.createElement('div');
      tile.className = 'tile';
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', app.label);

      var art = document.createElement('div');
      art.className = 'art';
      if (app.key) {
        var img = document.createElement('img');
        img.alt = '';
        img.src = 'icons/' + app.key + '.webp';
        art.appendChild(img);
      } else {
        genericArt(app, art);
      }

      var name = document.createElement('div');
      name.className = 'name';
      name.textContent = app.label;

      tile.appendChild(art);
      tile.appendChild(name);
      tile.addEventListener('click', function () { setFocus(i); open(i); });
      grid.appendChild(tile);
    });
    empty.hidden = apps.length > 0;
    if (!apps.length) title.textContent = 'TARDIS';
  }

  // New downloads: show the TV's own icon, tinted to match; fall back to the name.
  function genericArt(app, art) {
    art.className = 'art generic';
    var img = document.createElement('img');
    img.alt = '';
    img.onload = function () { tint(app, art, img); };
    img.onerror = function () {
      art.removeChild(img);
      art.className = 'art generic text';
      var label = document.createElement('span');
      label.textContent = app.label;
      art.appendChild(label);
    };
    img.src = app.icon;
    art.appendChild(img);
  }

  function hex(r, g, b) {
    return '#' + [r, g, b].map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join('');
  }

  function tint(app, art, img) {
    try {
      var size = 16;
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      var d = ctx.getImageData(0, 0, size, size).data;
      var r = 0, g = 0, b = 0, n = 0;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n += 1; }
      }
      if (n) {
        app.glow = hex(r / n, g / n, b / n);
        app.deep = hex(r / n / 4, g / n / 4, b / n / 4);
      }
      // Opaque corners mean a full-bleed icon: extend its edge colour across the tile.
      var last = (size * size - 1) * 4;
      if (d[3] > 200 && d[last + 3] > 200) {
        art.style.background = hex(d[0], d[1], d[2]);
        art.className += ' full';
      }
      if (apps[focus] === app) showHero(app, true);
    } catch (error) {
      // Icon pixels unreadable; keep the neutral tile.
    }
  }

  // --- Focus and top shelf ---------------------------------------------------

  function setFocus(i, instant) {
    if (!tiles.length) return;
    i = Math.max(0, Math.min(tiles.length - 1, i));
    if (tiles[focus]) tiles[focus].classList.remove('is-focused');
    focus = i;
    tiles[i].classList.add('is-focused');
    var row = Math.floor(i / COLUMNS);
    body.classList.toggle('is-grid', row > 0);
    rail.style.transform = row > 0 ? 'translateY(-' + gridShift(row) + 'rem)' : '';
    showHero(apps[i], instant);
  }

  // Once the dock scrolls away: centre all rows if they fit, else keep the focused row near the top.
  function gridShift(row) {
    var screen = window.innerHeight / (window.innerWidth / 192);
    var rows = Math.ceil(tiles.length / COLUMNS);
    var height = (rows - 1) * ROW_PITCH + TILE_HEIGHT;
    if (height <= screen - 2 * 14) return ROW_TOP - (screen - height) / 2;
    return ROW_TOP + row * ROW_PITCH - GRID_FOCUS_TOP;
  }

  // The TV paints full-screen CSS gradients very slowly (up to ~2s per change),
  // so each colour wash is drawn into a tiny canvas and shown as a stretched <img>,
  // which the GPU scales without repainting.
  var washCanvas = document.createElement('canvas');
  var washCache = {};
  washCanvas.width = 128;
  washCanvas.height = 72;

  function rgba(color, alpha) {
    var n = parseInt(color.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function glow(ctx, x, y, rx, ry, color, alpha) {
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx);
    ctx.restore();
  }

  function shade(ctx, x1, y1, stops) {
    var g = ctx.createLinearGradient(0, 0, x1, y1);
    stops.forEach(function (s) { g.addColorStop(s[0], 'rgba(0,0,0,' + s[1] + ')'); });
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, washCanvas.width, washCanvas.height);
  }

  function wash(app) {
    var cacheKey = app.glow + app.deep;
    if (washCache[cacheKey]) return washCache[cacheKey];
    var w = washCanvas.width;
    var h = washCanvas.height;
    var ctx = washCanvas.getContext('2d');
    var base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#0c0d12');
    base.addColorStop(1, '#040406');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    glow(ctx, w * .8, h * .1, w * .525, h * .595, app.glow, .85);
    glow(ctx, w * .12, h * .95, w * .468, h * .576, app.deep, 1);
    shade(ctx, 0, h, [[0, .3], [.24, 0], [.52, 0], [1, .6]]); // behind the clock and the dock
    shade(ctx, w, 0, [[0, .35], [.55, 0]]);                  // behind the title
    washCache[cacheKey] = washCanvas.toDataURL('image/png');
    return washCache[cacheKey];
  }

  // Waits briefly so holding an arrow key doesn't repaint the whole screen per tile.
  function showHero(app, instant) {
    clearTimeout(heroTimer);
    heroTimer = setTimeout(function () {
      var state = app.id + app.glow;
      if (state === heroShown) return;
      heroShown = state;
      var next = layers[1 - heroLayer];
      next.src = wash(app);
      next.classList.add('is-visible');
      layers[heroLayer].classList.remove('is-visible');
      heroLayer = 1 - heroLayer;
      title.textContent = app.label;
    }, instant ? 0 : 110);
  }

  // --- Actions ----------------------------------------------------------------

  function open(i) {
    var app = apps[i];
    if (!app) return;
    var tile = tiles[i];
    tile.classList.add('is-pressed');
    setTimeout(function () { tile.classList.remove('is-pressed'); }, 140);
    if (!window.tizen || !tizen.application) {
      toast(app.label + ' opens on the TV');
      return;
    }
    try {
      tizen.application.launch(app.id, null, function () { toast('Couldn’t open ' + app.label); });
    } catch (error) {
      toast('Couldn’t open ' + app.label);
    }
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 2500);
  }

  document.addEventListener('keydown', function (event) {
    var count = tiles.length;
    var col = focus % COLUMNS;
    switch (event.keyCode) {
      case 37: if (col > 0) setFocus(focus - 1); break;
      case 39: if (col < COLUMNS - 1 && focus + 1 < count) setFocus(focus + 1); break;
      case 38: if (focus >= COLUMNS) setFocus(focus - COLUMNS); break;
      case 40:
        if (Math.floor(focus / COLUMNS) < Math.floor((count - 1) / COLUMNS)) {
          setFocus(Math.min(count - 1, focus + COLUMNS));
        }
        break;
      case 13: open(focus); break;
      case 10009: // Back
        try { tizen.application.getCurrentApplication().exit(); } catch (error) {}
        break;
      default: return;
    }
    event.preventDefault();
  });

  // --- Clock --------------------------------------------------------------------

  function tick() {
    var now = new Date();
    document.getElementById('clock').textContent =
      ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    setTimeout(tick, 60000 - (now.getTime() % 60000) + 50);
  }

  // --- Start ------------------------------------------------------------------

  // Browser preview only: a sample of what this TV reports, junk included,
  // so the filtering and fallbacks can be checked off the TV.
  var PREVIEW_APPS = [
    ['org.tizen.netflix-app', 'Netflix', 'org.tizen.netflix-app'],
    ['org.tizen.primevideo', 'Prime Video', 'org.tizen.primevideo'],
    ['org.tizen.primevideo-dummy', 'Prime Video', 'org.tizen.primevideo', ''],
    ['MCmYXNxgcu.DisneyPlus', 'Disney+', 'MCmYXNxgcu'],
    ['MCmYXNxgcu.DisneyPlusService', 'DisneyPlusPreviewService', 'MCmYXNxgcu', 'x.png', SERVICE_CATEGORY],
    ['com.samsung.tv.aria-video', 'Apple TV', 'com.samsung.tv.aria-video'],
    ['9Ur5IzDKqV.TizenYouTube', 'YouTube', '9Ur5IzDKqV'],
    ['com.samsung.tv.cobalt-yt', 'Youtube', 'com.samsung.tv.cobalt', ''],
    ['skysh0WTIM.SkyShowtime', 'SkyShowtime', 'skysh0WTIM'],
    ['rJeHak5zRg.Spotify', 'Spotify - Music and Podcasts', 'rJeHak5zRg'],
    ['NaL06xBRLm.emanual', 'e-Manual', 'NaL06xBRLm'],
    ['5b8c3eb16b.BeamCTVDev', 'HBO Max', '5b8c3eb16b'],
    ['kIciSQlYEM.plex', 'Plex', 'kIciSQlYEM', 'missing-icon.png'],
    ['org.volt.apps', 'Apps', 'com.samsung.tv.store'],
    ['org.tizen.factory', 'factory', 'org.tizen.factory']
  ].map(function (a) {
    return { id: a[0], name: a[1], packageId: a[2], iconPath: a[3] === undefined ? 'icon.png' : a[3],
      categories: a[4] ? [a[4]] : [], show: true };
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) scheduleRefresh();
  });
  try {
    tizen.package.setPackageInfoEventListener({
      oninstalled: scheduleRefresh,
      onupdated: scheduleRefresh,
      onuninstalled: scheduleRefresh
    });
  } catch (error) {
    // No package events (browser preview, or privilege missing); visibility refresh still applies.
  }

  tick();
  refresh();
}());
