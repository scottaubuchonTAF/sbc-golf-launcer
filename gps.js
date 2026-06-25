/* ============================================================================
 * SBC Golf — GPS distance-to-green module (OPTIONAL / self-contained)
 *
 * Removing this feature later = delete this file, the <script src="gps.js">
 * tag, the 📍 button, and the openGPS() function in index.html. Nothing else
 * in the app depends on it.
 *
 * What it does:
 *  - Live distance (yards) from your phone to the MIDDLE of the current hole's
 *    green, using the browser Geolocation API.
 *  - Set a hole's green either by standing on it ("I'm on it") or by tapping
 *    the middle of the green on a satellite map (Leaflet + Esri imagery,
 *    loaded only when you open the map).
 *  - Greens are saved per course in this device's localStorage and reused
 *    every round at that course. (Per-device; nothing is sent to the server.)
 *  - A "mark my shot" tool: tap at the ball, walk to it, see the distance.
 *
 * Public API:  window.SBCGPS.open({ courseName, hole, firstHole, lastHole })
 * ========================================================================== */
(function () {
  'use strict';
  var KEY = 'sbcgps:';
  var S = { ctx: null, watch: null, here: null, mark: null, map: null, gmarker: null, picked: null };

  function greens(name) { try { return JSON.parse(localStorage.getItem(KEY + name) || '{}'); } catch (e) { return {}; } }
  function saveGreen(name, hole, ll) { var g = greens(name); g[hole] = { lat: ll.lat, lng: ll.lng }; try { localStorage.setItem(KEY + name, JSON.stringify(g)); } catch (e) {} }
  function $(id) { return document.getElementById(id); }

  // Great-circle distance in yards.
  function yards(a, b) {
    if (!a || !b) return null;
    var R = 6371000, toR = function (d) { return d * Math.PI / 180; };
    var dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng), la1 = toR(a.lat), la2 = toR(b.lat);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h)) * 1.0936133;
  }

  function open(ctx) {
    S.ctx = ctx;
    S.ctx.hole = ctx.hole || ctx.firstHole || 1;
    S.mark = null; S.picked = null;
    buildOverlay();
    startWatch();
    render();
  }
  function closeAll() {
    stopWatch();
    if (S.map) { try { S.map.remove(); } catch (e) {} S.map = null; }
    var o = $('gpsOverlay'); if (o) o.remove();
  }
  function startWatch() {
    if (!navigator.geolocation) return;
    stopWatch();
    S.watch = navigator.geolocation.watchPosition(
      function (p) { S.here = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; render(); },
      function () { render(); },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  }
  function stopWatch() { if (S.watch != null && navigator.geolocation) { navigator.geolocation.clearWatch(S.watch); S.watch = null; } }

  function btn(bg, color) { return 'style="flex:1;padding:13px;border-radius:10px;border:1px solid #23415e;background:' + (bg || '#173049') + ';color:' + (color || '#fff') + ';font-weight:700;font-size:14px"'; }

  function buildOverlay() {
    if ($('gpsOverlay')) return;
    var o = document.createElement('div');
    o.id = 'gpsOverlay';
    o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:linear-gradient(180deg,#0b1f33,#081726);color:#eaf1f8;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;flex-direction:column';
    o.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #23415e">' +
        '<div><div id="gpsHoleLbl" style="font-weight:800;font-size:18px"></div><div id="gpsAcc" style="font-size:11px;color:#92a6bb"></div></div>' +
        '<button id="gpsClose" style="background:#173049;color:#eaf1f8;border:1px solid #23415e;border-radius:10px;font-size:16px;padding:8px 12px">✕ Close</button>' +
      '</div>' +
      '<div id="gpsBody" style="flex:1;overflow:auto;padding:16px;max-width:520px;margin:0 auto;width:100%"></div>';
    document.body.appendChild(o);
    $('gpsClose').onclick = closeAll;
  }

  function render() {
    if (!$('gpsOverlay')) return;
    var ctx = S.ctx, green = greens(ctx.courseName)[ctx.hole] || null;
    $('gpsHoleLbl').textContent = 'Hole ' + ctx.hole + ' — to green';
    $('gpsAcc').textContent = S.here ? ('GPS ±' + Math.round(S.here.acc) + ' m') : 'Getting your location…';

    var dist;
    if (!green) dist = '<div style="text-align:center;color:#92a6bb;padding:22px 0">No green saved for this hole yet.<br>Set it with a button below.</div>';
    else if (!S.here) dist = '<div style="text-align:center;color:#92a6bb;padding:22px 0">Waiting for GPS…</div>';
    else dist = '<div style="text-align:center;padding:10px 0"><div style="font-size:68px;font-weight:800;line-height:1;color:#f2b134">' + Math.round(yards(S.here, green)) + '</div><div style="color:#92a6bb;font-size:13px;margin-top:2px">yards to middle of green</div></div>';

    var shot = '';
    if (S.mark && S.here) shot = '<div style="background:#12273d;border:1px solid #23415e;border-radius:12px;padding:12px;margin-top:10px;text-align:center"><div style="font-size:12px;color:#92a6bb">your shot so far</div><div style="font-size:30px;font-weight:800">' + Math.round(yards(S.mark, S.here)) + ' yds</div></div>';

    $('gpsBody').innerHTML = dist +
      '<div style="display:flex;gap:8px;margin-top:6px">' +
        '<button id="gpsPrev" ' + btn() + '>‹ Hole</button>' +
        '<button id="gpsNext" ' + btn() + '>Hole ›</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button id="gpsSetHere" ' + btn('#2e87d6') + '>Set green — I’m on it</button>' +
        '<button id="gpsMap" ' + btn() + '>Pick on map</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button id="gpsMark" ' + btn() + '>' + (S.mark ? 'Re-mark shot' : 'Mark my shot') + '</button>' +
        (S.mark ? '<button id="gpsClear" ' + btn() + '>Clear</button>' : '') +
      '</div>' +
      shot +
      '<div id="gpsMapWrap" style="margin-top:12px"></div>';

    var ph = ctx.hole > ctx.firstHole, nh = ctx.hole < ctx.lastHole;
    $('gpsPrev').disabled = !ph; $('gpsPrev').style.opacity = ph ? 1 : 0.4;
    $('gpsNext').disabled = !nh; $('gpsNext').style.opacity = nh ? 1 : 0.4;
    $('gpsPrev').onclick = function () { if (ph) { ctx.hole--; render(); } };
    $('gpsNext').onclick = function () { if (nh) { ctx.hole++; render(); } };
    $('gpsSetHere').onclick = function () { if (!S.here) { alert('No GPS fix yet — wait a moment.'); return; } saveGreen(ctx.courseName, ctx.hole, S.here); render(); };
    $('gpsMark').onclick = function () { if (!S.here) { alert('No GPS fix yet.'); return; } S.mark = S.here; render(); };
    if ($('gpsClear')) $('gpsClear').onclick = function () { S.mark = null; render(); };
    $('gpsMap').onclick = openMap;
  }

  function loadLeaflet(cb) {
    if (window.L) { cb(); return; }
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    var s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = cb;
    s.onerror = function () { alert('Could not load the map (no connection?).'); };
    document.head.appendChild(s);
  }
  function openMap() {
    var ctx = S.ctx, wrap = $('gpsMapWrap');
    wrap.innerHTML =
      '<div style="font-size:12px;color:#92a6bb;margin-bottom:6px">Tap the middle of the green for hole ' + ctx.hole + ', then Save.</div>' +
      '<div id="gpsMap_" style="height:300px;border-radius:12px;overflow:hidden;border:1px solid #23415e"></div>' +
      '<button id="gpsMapSave" style="width:100%;margin-top:8px;padding:13px;border-radius:10px;border:none;background:#3fb950;color:#0b1f33;font-weight:800;font-size:15px">Save green for hole ' + ctx.hole + '</button>';
    loadLeaflet(function () {
      var saved = greens(ctx.courseName)[ctx.hole];
      var center = saved || S.here || { lat: 39.8283, lng: -98.5795 };
      var zoom = (saved || S.here) ? 18 : 4;
      if (S.map) { try { S.map.remove(); } catch (e) {} S.map = null; }
      S.map = L.map('gpsMap_').setView([center.lat, center.lng], zoom);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 20, attribution: 'Imagery © Esri' }).addTo(S.map);
      S.picked = saved ? { lat: saved.lat, lng: saved.lng } : null;
      if (S.picked) S.gmarker = L.marker([S.picked.lat, S.picked.lng]).addTo(S.map);
      S.map.on('click', function (e) {
        S.picked = { lat: e.latlng.lat, lng: e.latlng.lng };
        if (S.gmarker) S.gmarker.setLatLng(e.latlng); else S.gmarker = L.marker(e.latlng).addTo(S.map);
      });
      setTimeout(function () { if (S.map) S.map.invalidateSize(); }, 250);
      $('gpsMapSave').onclick = function () {
        if (!S.picked) { alert('Tap the green on the map first.'); return; }
        saveGreen(ctx.courseName, ctx.hole, S.picked);
        if (S.map) { try { S.map.remove(); } catch (e) {} S.map = null; }
        S.gmarker = null;
        render();
      };
    });
  }

  window.SBCGPS = { open: open };
})();
