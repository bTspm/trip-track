// TripDNA — vanilla JS app
(() => {
  const STORAGE_KEY = 'tripdna.trip.v1';

  // ---------- State ----------
  const loadTrip = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn('Corrupt saved trip, re-seeding', e); }
    const t = JSON.parse(JSON.stringify(window.SEED_TRIP));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    return t;
  };
  const saveTrip = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trip));
  const state = { trip: loadTrip(), hideCompleted: false };

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const h = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const currentMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const parseHM = (hm) => { const [h_, m] = hm.split(':').map(Number); return h_ * 60 + m; };
  const fmtTime12 = (hm) => {
    const [h_, m] = hm.split(':').map(Number);
    const suf = h_ >= 12 ? 'PM' : 'AM';
    const hr = ((h_ + 11) % 12) + 1;
    return `${hr}:${String(m).padStart(2, '0')} ${suf}`;
  };
  const fmtDuration = (min) => {
    if (!min) return '';
    if (min < 60) return `${min} MIN`;
    const h_ = Math.floor(min / 60), m = min % 60;
    return m ? `${h_}H ${m}M` : `${h_} HR${h_ > 1 ? 'S' : ''}`;
  };
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };
  const fmtDateShort = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const ICONS = {
    drive: 'directions_car',
    food: 'restaurant',
    lodging: 'hotel',
    hike: 'hiking',
    activity: 'local_activity',
    experience: 'auto_awesome',
    sightseeing: 'photo_camera',
    rest: 'bedtime',
    home: 'home'
  };
  const iconFor = (t) => ICONS[t] || 'place';

  const allActivities = () => state.trip.days.flatMap(d => d.activities.map(a => ({ ...a, _day: d })));
  const findActivity = (id) => {
    for (const d of state.trip.days) for (const a of d.activities) if (a.id === id) return { day: d, activity: a };
    return null;
  };
  const tripStats = () => {
    const acts = allActivities();
    const doneActs = acts.filter(a => a.status === 'done');
    const done = doneActs.length;
    const miles = doneActs
      .filter(a => a.distance)
      .reduce((s, a) => s + (parseFloat(String(a.distance).replace(/[^\d.]/g, '')) || 0), 0);
    const elevation = doneActs
      .filter(a => a.elevationGain)
      .reduce((s, a) => s + (a.elevationGain || 0), 0);
    const hikesCompleted = doneActs.filter(a => a.type === 'hike').length;
    const driveMinutes = doneActs
      .filter(a => a.type === 'drive' && a.duration)
      .reduce((s, a) => s + (a.duration || 0), 0);
    const bestRated = doneActs.filter(a => a.rating).sort((a, b) => b.rating - a.rating)[0] || null;
    return { total: acts.length, done, pct: acts.length ? Math.round(done / acts.length * 100) : 0, miles: Math.round(miles), elevation, hikesCompleted, driveHours: Math.round(driveMinutes / 60 * 10) / 10, bestRated };
  };

  const currentDayIdx = () => {
    const t = todayStr();
    const idx = state.trip.days.findIndex(d => d.date === t);
    if (idx !== -1) return idx;
    if (t < state.trip.startDate) return 0;
    return state.trip.days.length - 1;
  };

  const todayAlerts = () => {
    const dayIdx = currentDayIdx();
    const day = state.trip.days[dayIdx];
    const alerts = [];
    for (const a of day.activities) {
      if (a.status === 'done' || a.status === 'skipped') continue;
      if (a.alerts?.length) {
        for (const al of a.alerts) alerts.push({ text: al, time: a.time, title: a.title, id: a.id });
      }
    }
    return alerts;
  };

  const getJournal = () => {
    if (!state.trip.journal) state.trip.journal = [];
    return state.trip.journal;
  };

  const addJournalEntry = async (text) => {
    if (!text.trim()) return;
    const geo = await getLocation();
    getJournal().push({ id: `j-${Date.now()}`, text: text.trim(), createdAt: new Date().toISOString(), dayNumber: state.trip.days[currentDayIdx()]?.dayNumber || null, geo });
    saveTrip();
  };

  const deleteJournalEntry = (id) => {
    const j = getJournal();
    const idx = j.findIndex(e => e.id === id);
    if (idx !== -1) { j.splice(idx, 1); saveTrip(); }
  };

  const activityToText = (a, day) => {
    const parts = [`${a.title}`, `${fmtTime12(a.time)}${a.duration ? ` (${fmtDuration(a.duration)})` : ''}`];
    if (a.description) parts.push(a.description);
    if (a.distance) parts.push(`Distance: ${a.distance}${a.difficulty ? ` • ${a.difficulty}` : ''}${a.elevationGain ? ` • +${a.elevationGain} ft` : ''}`);
    if (a.bookingRef) {
      const b = state.trip.bookings.find(b => b.id === a.bookingRef);
      if (b) {
        if (b.confirmationNumber) parts.push(`Confirmation: ${b.confirmationNumber}`);
        if (b.address) parts.push(`Address: ${b.address}`);
        if (b.phone) parts.push(`Phone: ${b.phone}`);
      }
    }
    if (a.alerts?.length) parts.push(`\u26a0\ufe0f ${a.alerts.join(' | ')}`);
    if (day) parts.unshift(`Day ${day.dayNumber} \u2022 ${fmtDate(day.date)}`);
    return parts.join('\n');
  };

  // ---------- Gas tracker ----------
  const getGasLog = () => {
    if (!state.trip.gasLog) state.trip.gasLog = [];
    return state.trip.gasLog;
  };
  const addGasEntry = (entry) => {
    getGasLog().push({ id: `g-${Date.now()}`, ...entry, createdAt: new Date().toISOString(), dayNumber: state.trip.days[currentDayIdx()]?.dayNumber || null });
    saveTrip();
  };
  const deleteGasEntry = (id) => {
    const g = getGasLog();
    const idx = g.findIndex(e => e.id === id);
    if (idx !== -1) { g.splice(idx, 1); saveTrip(); }
  };
  const gasStats = () => {
    const log = getGasLog();
    const totalGal = log.reduce((s, e) => s + (e.gallons || 0), 0);
    const totalCost = log.reduce((s, e) => s + (e.total || 0), 0);
    return { count: log.length, gallons: Math.round(totalGal * 10) / 10, cost: Math.round(totalCost * 100) / 100 };
  };

  // ---------- Cell service zones ----------
  const NO_SIGNAL_ZONES = [
    { pattern: /chisos/i, note: 'No cell service in Chisos Basin' },
    { pattern: /ten bits/i, note: 'Very limited signal at Ten Bits Ranch' },
    { pattern: /big bend/i, note: 'Spotty to no signal in Big Bend NP' },
    { pattern: /santa elena/i, note: 'No signal at Santa Elena Canyon' },
    { pattern: /boquillas/i, note: 'No signal at Boquillas Canyon' },
    { pattern: /hot springs/i, note: 'No signal at Hot Springs' },
    { pattern: /ross maxwell/i, note: 'No signal on Ross Maxwell drive' },
    { pattern: /lost mine/i, note: 'No signal on Lost Mine Trail' },
    { pattern: /window trail/i, note: 'No signal on Window Trail' },
  ];
  const getCellWarning = (a) => {
    const hay = [a.title, a.description, a.location?.name].filter(Boolean).join(' ');
    for (const z of NO_SIGNAL_ZONES) { if (z.pattern.test(hay)) return z.note; }
    return null;
  };

  // ---------- Today's essentials ----------
  const ESSENTIALS_MAP = {
    hike: ['Water (1qt/hr)', 'Hiking shoes', 'Sunscreen', 'Hat', 'Sunglasses'],
    experience: [],
    drive: [],
    food: [],
    lodging: [],
    sightseeing: ['Sunscreen', 'Hat', 'Sunglasses'],
    activity: ['Sunscreen'],
    rest: [],
  };
  const SPECIAL_ESSENTIALS = [
    { pattern: /star\s*party|stargazing/i, items: ['Warm jacket', 'Blanket for benches', 'Red flashlight', 'NO white lights'] },
    { pattern: /hot springs|soak/i, items: ['Towel', 'Headlamp', 'Water shoes'] },
    { pattern: /swim|balmorhea|pool/i, items: ['Swim gear', 'Snorkel', 'Floats', 'Towel'] },
    { pattern: /float|canoe|kayak/i, items: ['Sunscreen', 'Water', 'Dry bag'] },
    { pattern: /observatory/i, items: ['Warm layers (high elevation)'] },
  ];
  const todayEssentials = (day) => {
    const items = new Set();
    day.activities.filter(a => a.status === 'pending').forEach(a => {
      (ESSENTIALS_MAP[a.type] || []).forEach(i => items.add(i));
      const hay = [a.title, a.description].filter(Boolean).join(' ');
      SPECIAL_ESSENTIALS.forEach(s => { if (s.pattern.test(hay)) s.items.forEach(i => items.add(i)); });
    });
    return [...items];
  };

  // ---------- Drive time estimator ----------
  const nextDriveLeaveBy = (day) => {
    const isToday = day.date === todayStr();
    if (!isToday) return null;
    const nowMin = currentMinutes();
    const nextDrive = day.activities.find(a => a.type === 'drive' && a.status === 'pending' && a.duration && parseHM(a.time) > nowMin);
    if (!nextDrive) return null;
    const arriveByMin = parseHM(nextDrive.time);
    const leaveByMin = arriveByMin - (nextDrive.duration || 0);
    if (leaveByMin <= nowMin) return { activity: nextDrive, label: 'Leave now!', urgent: true };
    const delta = leaveByMin - nowMin;
    const leaveTime = `${String(Math.floor(leaveByMin / 60)).padStart(2, '0')}:${String(leaveByMin % 60).padStart(2, '0')}`;
    return { activity: nextDrive, label: `Leave by ${fmtTime12(leaveTime)}`, delta, urgent: delta < 30 };
  };

  // ---------- Per-day expenses ----------
  const dayExpenses = (dayNumber) => {
    const expenses = getExpenses().filter(e => e.dayNumber === dayNumber);
    const gas = getGasLog().filter(g => g.dayNumber === dayNumber);
    const expTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const gasTotal = gas.reduce((s, g) => s + (g.total || 0), 0);
    return { expenses, gas, expTotal, gasTotal, total: expTotal + gasTotal, count: expenses.length + gas.length };
  };

  // ---------- Bookmarks ----------
  const toggleBookmark = (actId) => {
    const found = findActivity(actId);
    if (!found) return;
    found.activity.bookmarked = !found.activity.bookmarked;
    saveTrip();
  };

  // ---------- Quick recap ----------
  const generateDayRecap = (day) => {
    const done = day.activities.filter(a => a.status === 'done');
    const skipped = day.activities.filter(a => a.status === 'skipped');
    if (!done.length && !skipped.length) return null;
    const lines = [`Day ${day.dayNumber}: ${day.title} (${fmtDate(day.date)})\n`];
    if (done.length) {
      lines.push(`Completed (${done.length}):`);
      done.forEach(a => {
        lines.push(`  ${a.rating ? '★'.repeat(a.rating) + ' ' : ''}${a.title} @ ${fmtTime12(a.time)}${a.notes ? ` — ${a.notes}` : ''}`);
      });
    }
    if (skipped.length) {
      lines.push(`\nSkipped (${skipped.length}):`);
      skipped.forEach(a => lines.push(`  ${a.title}`));
    }
    const s = daySummary(day);
    lines.push(`\n${s.miles} mi driven${s.avgRating ? ` | Avg rating: ${s.avgRating}★` : ''}${s.topRated ? ` | Best: ${s.topRated.title}` : ''}`);
    return lines.join('\n');
  };

  // ---------- Expense log ----------
  const getExpenses = () => {
    if (!state.trip.expenses) state.trip.expenses = [];
    return state.trip.expenses;
  };
  const addExpenseEntry = (entry) => {
    getExpenses().push({ id: `e-${Date.now()}`, ...entry, createdAt: new Date().toISOString(), dayNumber: state.trip.days[currentDayIdx()]?.dayNumber || null });
    saveTrip();
  };
  const deleteExpenseEntry = (id) => {
    const e = getExpenses();
    const idx = e.findIndex(x => x.id === id);
    if (idx !== -1) { e.splice(idx, 1); saveTrip(); }
  };
  const expenseStats = () => {
    const log = getExpenses();
    const total = log.reduce((s, e) => s + (e.amount || 0), 0);
    const byCategory = {};
    log.forEach(e => { byCategory[e.category || 'other'] = (byCategory[e.category || 'other'] || 0) + (e.amount || 0); });
    return { count: log.length, total: Math.round(total * 100) / 100, byCategory };
  };
  const EXPENSE_CATEGORIES = ['food', 'park fee', 'souvenir', 'gas', 'tip', 'other'];

  // ---------- Sunrise/Sunset ----------
  const SUN_DATA = {
    '2026-04-17': { rise: '7:14 AM', set: '8:11 PM' },
    '2026-04-18': { rise: '7:13 AM', set: '8:12 PM' },
    '2026-04-19': { rise: '7:12 AM', set: '8:12 PM' },
    '2026-04-20': { rise: '7:11 AM', set: '8:13 PM' },
    '2026-04-21': { rise: '7:10 AM', set: '8:14 PM' },
    '2026-04-22': { rise: '7:09 AM', set: '8:14 PM' },
    '2026-04-23': { rise: '7:08 AM', set: '8:15 PM' },
    '2026-04-24': { rise: '7:07 AM', set: '8:16 PM' },
    '2026-04-25': { rise: '7:06 AM', set: '8:16 PM' },
    '2026-04-26': { rise: '7:05 AM', set: '8:17 PM' },
  };

  // ---------- Emergency info ----------
  const EMERGENCY = {
    vehicle: { plate: 'SPL 0139', make: '2023 Hyundai Santa Fe Calligraphy' },
    contacts: [
      { label: 'Big Bend NP Rangers', phone: '+14324772251', display: '(432) 477-2251' },
      { label: 'Brewster County Sheriff', phone: '+14328372424', display: '(432) 837-2424' },
      { label: 'Big Bend Regional Medical', phone: '+14328372286', display: '(432) 837-2286', note: 'Alpine, TX — nearest hospital' },
      { label: 'Roadside Assistance (Hyundai)', phone: '+18005654052', display: '(800) 565-4052' },
      { label: 'Far Flung Adventures', phone: '+14323712633', display: '(432) 371-2633' },
      { label: 'Poison Control', phone: '+18002221222', display: '(800) 222-1222' },
    ]
  };

  // ---------- Day summary ----------
  const daySummary = (day) => {
    const acts = day.activities;
    const done = acts.filter(a => a.status === 'done');
    const skipped = acts.filter(a => a.status === 'skipped');
    const pending = acts.filter(a => a.status === 'pending');
    const miles = done.reduce((s, a) => s + (parseFloat(String(a.distance || '').replace(/[^\d.]/g, '')) || 0), 0);
    const topRated = done.filter(a => a.rating).sort((a, b) => b.rating - a.rating)[0];
    const totalRatings = done.filter(a => a.rating);
    const avgRating = totalRatings.length ? (totalRatings.reduce((s, a) => s + a.rating, 0) / totalRatings.length).toFixed(1) : null;
    return { done: done.length, skipped: skipped.length, pending: pending.length, total: acts.length, miles: Math.round(miles), topRated, avgRating };
  };

  // ---------- Live countdown ----------
  let countdownInterval;
  const startCountdown = () => {
    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      const el = $('#countdown-live');
      if (!el) return;
      const route = parseRoute();
      if (route.name !== 'home') return;
      const dayIdx = currentDayIdx();
      const day = state.trip.days[dayIdx];
      const isToday = day.date === todayStr();
      if (!isToday) return;
      const nowMin = currentMinutes();
      const next = day.activities.find(a => a.status === 'pending' && parseHM(a.time) >= nowMin);
      if (!next) { el.textContent = ''; return; }
      const delta = parseHM(next.time) - nowMin;
      if (delta <= 0) el.textContent = 'Now';
      else if (delta < 60) el.textContent = `${delta}m`;
      else el.textContent = `${Math.floor(delta / 60)}h ${delta % 60}m`;
    }, 30000);
  };

  // ---------- Geolocation ----------
  const getLocation = () => new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: Math.round(pos.coords.latitude * 100000) / 100000, lng: Math.round(pos.coords.longitude * 100000) / 100000 }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  });

  // ---------- Weather refresh ----------
  const WMO_CODES = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Depositing rime fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
    80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
  };

  const refreshWeather = async (dayNumber) => {
    const day = state.trip.days.find(d => d.dayNumber === dayNumber);
    if (!day) return;
    toast('Fetching weather…');
    try {
      const lat = 29.25, lng = -103.25;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&temperature_unit=fahrenheit&timezone=America/Chicago&start_date=${day.date}&end_date=${day.date}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      const d = data.daily;
      if (d && d.temperature_2m_max?.length) {
        day.weather.high = Math.round(d.temperature_2m_max[0]);
        day.weather.low = Math.round(d.temperature_2m_min[0]);
        day.weather.rainChance = d.precipitation_probability_max?.[0] || 0;
        day.weather.condition = WMO_CODES[d.weather_code?.[0]] || day.weather.condition;
        day.weather.updatedAt = new Date().toISOString();
        saveTrip();
        toast('Weather updated');
        render();
      }
    } catch (e) {
      toast('No signal — using cached weather');
    }
  };

  // ---------- Photo prompt ----------
  const promptPhoto = (actTitle) => {
    setTimeout(() => {
      openModal(`
        <div class="space-y-4 text-center">
          <span class="material-symbols-outlined text-5xl text-primary">photo_camera</span>
          <h3 class="font-headline font-bold text-lg">Capture the moment?</h3>
          <p class="text-sm text-on-surface-variant">Take a photo of <span class="font-semibold text-on-surface">${h(actTitle)}</span> while you're here</p>
          <div class="grid grid-cols-2 gap-3 pt-2">
            <button id="photo-skip" class="py-3 rounded-xl bg-surface-container-low text-on-surface-variant font-semibold text-xs uppercase tracking-widest active:scale-95 transition-transform">Later</button>
            <button id="photo-open" class="py-3 rounded-xl terracotta-glow text-on-primary-container font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform">Open Camera</button>
          </div>
        </div>
      `);
      $('#photo-skip').onclick = closeModal;
      $('#photo-open').onclick = () => {
        closeModal();
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.capture = 'environment';
        inp.click();
      };
    }, 400);
  };

  // ---------- Toast ----------
  let toastTimer;
  const toast = (msg) => {
    const el = $('#toast');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.style.opacity = '0'), 1800);
  };

  // ---------- Modal ----------
  const openModal = (html) => {
    const m = $('#modal');
    $('#modal-body').innerHTML = html;
    m.style.display = 'flex';
    m.classList.remove('hidden');
    $('#modal-backdrop').onclick = closeModal;
  };
  const closeModal = () => {
    const m = $('#modal');
    m.classList.add('hidden');
    m.style.display = 'none';
    $('#modal-body').innerHTML = '';
  };

  // ---------- Check-off flow ----------
  const promptCheckoff = (actId) => {
    const { activity } = findActivity(actId);
    const rating = activity.rating || 0;
    const note = activity.notes || '';
    const isDone = activity.status === 'done';
    const isSkipped = activity.status === 'skipped';
    const isMarked = isDone || isSkipped;

    if (isMarked) {
      openModal(`
        <div class="space-y-5">
          <div>
            <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">${isDone ? 'Completed' : 'Skipped'}</p>
            <h3 class="font-headline font-bold text-xl mt-1">${h(activity.title)}</h3>
            <p class="text-sm text-on-surface-variant mt-1">${fmtTime12(activity.time)}${activity.duration ? ` • ${fmtDuration(activity.duration)}` : ''}</p>
            ${isDone && activity.rating ? `<p class="text-sm text-tertiary mt-2">${'★'.repeat(activity.rating)}${'☆'.repeat(5 - activity.rating)}${activity.notes ? ` — ${h(activity.notes)}` : ''}</p>` : ''}
          </div>
          <div class="grid gap-3">
            <button id="btn-reset" class="py-3 rounded-xl bg-surface-container-low text-on-surface font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-sm">undo</span> Reset to Pending
            </button>
            ${isDone ? `
            <button id="btn-edit-memory" class="py-3 rounded-xl bg-surface-container-high text-on-surface-variant font-semibold text-xs uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-sm">edit</span> Edit Rating & Notes
            </button>` : `
            <button id="btn-mark-done" class="py-3 rounded-xl terracotta-glow text-on-primary-container font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-sm">check</span> Mark Done Instead
            </button>`}
            <button id="btn-cancel" class="py-3 text-on-surface-variant font-semibold text-xs uppercase tracking-widest active:scale-95 transition-transform">Cancel</button>
          </div>
        </div>
      `);

      $('#btn-reset').onclick = () => {
        activity.status = 'pending';
        activity.checkedAt = null;
        activity.rating = null;
        activity.notes = '';
        saveTrip(); closeModal();
        toast('Reset to pending');
        render();
      };
      $('#btn-cancel').onclick = closeModal;
      if (isDone && $('#btn-edit-memory')) {
        $('#btn-edit-memory').onclick = () => { closeModal(); showRatingModal(actId); };
      }
      if (isSkipped && $('#btn-mark-done')) {
        $('#btn-mark-done').onclick = () => { closeModal(); showRatingModal(actId); };
      }
      return;
    }

    showRatingModal(actId);
  };

  const showRatingModal = (actId) => {
    const { activity } = findActivity(actId);
    const rating = activity.rating || 0;
    const note = activity.notes || '';
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    openModal(`
      <div class="space-y-5">
        <div>
          <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">Completing</p>
          <h3 class="font-headline font-bold text-xl mt-1">${h(activity.title)}</h3>
          <p class="text-sm text-on-surface-variant mt-1">Planned ${fmtTime12(activity.time)}${activity.duration ? ` • ${fmtDuration(activity.duration)}` : ''}</p>
        </div>
        <div>
          <p class="text-xs uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Actual time (adjust if needed)</p>
          <input id="done-time" type="time" value="${nowTime}" class="w-full bg-surface-container-low text-on-surface px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/60" />
        </div>
        <div>
          <p class="text-xs uppercase tracking-widest text-on-surface-variant font-semibold mb-2">How was it?</p>
          <div id="rating-row" class="flex gap-2">
            ${[1, 2, 3, 4, 5].map(n => `
              <button data-rate="${n}" class="flex-1 h-12 rounded-xl bg-surface-container-highest text-on-surface-variant active:scale-95 transition-transform ${n <= rating ? 'terracotta-glow text-on-primary-container' : ''}">
                <span class="material-symbols-outlined ${n <= rating ? 'fill-icon' : ''}">star</span>
              </button>`).join('')}
          </div>
        </div>
        <div>
          <p class="text-xs uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Notes (optional)</p>
          <textarea id="note-field" rows="3" placeholder="Quick thought, tip, or photo reminder…" class="w-full bg-surface-container-low text-on-surface p-3 rounded-xl resize-none outline-none focus:ring-2 focus:ring-primary/60">${h(note)}</textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button id="btn-skip" class="py-3 rounded-xl bg-surface-container-low text-on-surface-variant font-semibold text-xs uppercase tracking-widest active:scale-95 transition-transform">Skip</button>
          <button id="btn-save" class="py-3 rounded-xl terracotta-glow text-on-primary-container font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform">Mark Done</button>
        </div>
      </div>
    `);

    let pickedRating = rating;
    $('#rating-row').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rate]');
      if (!btn) return;
      pickedRating = Number(btn.dataset.rate);
      $$('#rating-row [data-rate]').forEach(b => {
        const n = Number(b.dataset.rate);
        b.className = `flex-1 h-12 rounded-xl active:scale-95 transition-transform ${n <= pickedRating ? 'terracotta-glow text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'}`;
        const icon = b.querySelector('.material-symbols-outlined');
        icon.classList.toggle('fill-icon', n <= pickedRating);
      });
    });

    $('#btn-save').onclick = async () => {
      const timeVal = $('#done-time').value;
      const [dh, dm] = timeVal.split(':').map(Number);
      const checkedDate = new Date();
      checkedDate.setHours(dh, dm, 0, 0);
      activity.status = 'done';
      activity.checkedAt = checkedDate.toISOString();
      activity.rating = pickedRating || null;
      activity.notes = $('#note-field').value.trim();
      const loc = await getLocation();
      if (loc) activity.actualLocation = loc;
      saveTrip(); closeModal();
      toast('Checked off');
      render();
      promptPhoto(activity.title);
    };
    $('#btn-skip').onclick = async () => {
      activity.status = 'skipped';
      activity.checkedAt = new Date().toISOString();
      const loc = await getLocation();
      if (loc) activity.actualLocation = loc;
      saveTrip(); closeModal();
      toast('Skipped');
      render();
    };
  };

  // ---------- Activity Detail Modal ----------
  const showActivityDetail = (actId) => {
    const found = findActivity(actId);
    if (!found) return;
    const { day, activity: a } = found;
    const done = a.status === 'done';
    const skipped = a.status === 'skipped';
    const booking = a.bookingRef ? state.trip.bookings.find(b => b.id === a.bookingRef) : null;
    const addr = booking?.address || a.location?.address || a.location?.name;
    const loc = a.location;
    const gq = loc?.lat && loc?.lng ? `${loc.lat},${loc.lng}` : addr;

    openModal(`
      <div class="space-y-5 max-h-[75vh] overflow-y-auto">
        <!-- Header -->
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="material-symbols-outlined ${done ? 'text-tertiary' : skipped ? 'text-on-surface-variant/60' : 'text-primary'} text-2xl">${iconFor(a.type)}</span>
            <div class="flex-1">
              <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">Day ${day.dayNumber} • ${fmtDateShort(day.date)}</p>
              <h3 class="font-headline font-bold text-xl leading-tight">${h(a.title)}</h3>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 mt-2">
            ${done ? `<span class="text-[10px] font-bold uppercase tracking-widest text-tertiary bg-tertiary/10 px-2 py-1 rounded-full flex items-center gap-1"><span class="material-symbols-outlined text-[12px] fill-icon">check</span> Done</span>` : ''}
            ${skipped ? `<span class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container-highest px-2 py-1 rounded-full">Skipped</span>` : ''}
            ${a.highlight ? `<span class="text-[10px] font-bold uppercase tracking-widest text-tertiary bg-tertiary/10 px-2 py-1 rounded-full">Highlight</span>` : ''}
          </div>
        </div>

        <!-- Timing -->
        <div class="bg-surface-container-low rounded-xl p-4 space-y-2">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Planned</p>
              <p class="text-sm font-semibold">${fmtTime12(a.time)}</p>
            </div>
            ${a.duration ? `<div>
              <p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Duration</p>
              <p class="text-sm font-semibold">${fmtDuration(a.duration)}</p>
            </div>` : ''}
            ${done && a.checkedAt ? `<div>
              <p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Actual</p>
              <p class="text-sm font-semibold text-tertiary">${fmtCheckedAt(a.checkedAt)}</p>
            </div>` : ''}
            ${skipped && a.checkedAt ? `<div>
              <p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Skipped at</p>
              <p class="text-sm font-semibold">${fmtCheckedAt(a.checkedAt)}</p>
            </div>` : ''}
          </div>
        </div>

        <!-- Description -->
        ${a.description ? `
        <div>
          <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-1">Details</p>
          <p class="text-sm text-on-surface-variant leading-relaxed">${h(a.description)}</p>
        </div>` : ''}

        <!-- Hike stats -->
        ${a.distance || a.difficulty || a.elevationGain ? `
        <div class="flex flex-wrap gap-3">
          ${a.distance ? `<div class="bg-surface-container-low rounded-xl px-3 py-2"><p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Distance</p><p class="text-sm font-bold">${h(a.distance)}</p></div>` : ''}
          ${a.difficulty ? `<div class="bg-surface-container-low rounded-xl px-3 py-2"><p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Difficulty</p><p class="text-sm font-bold">${h(a.difficulty)}</p></div>` : ''}
          ${a.elevationGain ? `<div class="bg-surface-container-low rounded-xl px-3 py-2"><p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Elevation</p><p class="text-sm font-bold">+${a.elevationGain} ft</p></div>` : ''}
        </div>` : ''}

        <!-- Alerts -->
        ${a.alerts?.length ? `
        <div>
          <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Alerts</p>
          <div class="space-y-2">
            ${a.alerts.map(al => `
              <div class="flex gap-2 items-start bg-surface-container-low rounded-xl p-3">
                <span class="material-symbols-outlined text-primary text-sm mt-0.5">priority_high</span>
                <p class="text-sm text-on-surface-variant leading-snug">${h(al)}</p>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <!-- Rating & Notes -->
        ${done && a.rating ? `
        <div class="bg-surface-container-low rounded-xl p-4">
          <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold mb-2">Your Rating</p>
          <p class="text-lg">${'★'.repeat(a.rating)}${'☆'.repeat(5 - a.rating)}</p>
          ${a.notes ? `<p class="text-sm text-on-surface-variant mt-2">${h(a.notes)}</p>` : ''}
        </div>` : ''}

        <!-- Booking -->
        ${booking ? `
        <div class="bg-surface-container-low rounded-xl p-4 space-y-3">
          <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">Booking</p>
          <p class="font-headline font-bold text-sm">${h(booking.name)}</p>
          ${booking.confirmationNumber ? `
            <div class="flex items-center justify-between">
              <div><p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Confirmation</p></div>
              <button data-copy="${h(booking.confirmationNumber)}" class="flex items-center gap-2 active:scale-95 transition-transform">
                <span class="font-mono text-sm text-primary">${h(booking.confirmationNumber)}</span>
                <span class="material-symbols-outlined text-sm">content_copy</span>
              </button>
            </div>` : ''}
          ${booking.pinCode ? `
            <div class="flex items-center justify-between">
              <div><p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Pin Code</p></div>
              <button data-copy="${h(booking.pinCode)}" class="flex items-center gap-2 active:scale-95 transition-transform">
                <span class="font-mono text-sm text-primary">${h(booking.pinCode)}</span>
                <span class="material-symbols-outlined text-sm">content_copy</span>
              </button>
            </div>` : ''}
          ${booking.cost ? `<p class="text-sm text-on-surface-variant">Cost: <span class="font-semibold text-on-surface">$${booking.cost.toFixed(2)}</span></p>` : ''}
          ${booking.notes ? `<p class="text-xs text-on-surface-variant leading-relaxed">${h(booking.notes)}</p>` : ''}
        </div>` : ''}

        <!-- Location -->
        ${a.actualLocation ? `
        <div class="bg-surface-container-low rounded-xl p-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-primary text-sm">pin_drop</span>
          <a href="https://www.google.com/maps/search/?api=1&query=${a.actualLocation.lat},${a.actualLocation.lng}" target="_blank" rel="noopener" class="text-xs text-on-surface-variant">Checked in at ${a.actualLocation.lat.toFixed(4)}, ${a.actualLocation.lng.toFixed(4)}</a>
        </div>` : ''}

        <!-- Actions -->
        <div class="flex flex-wrap gap-2 pt-1">
          ${addr || gq ? `
            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gq || addr)}" target="_blank" rel="noopener"
               class="flex-1 py-2.5 bg-secondary-container text-on-secondary-container text-xs font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-1.5">
               <span class="material-symbols-outlined text-sm">map</span> Google
            </a>
            <a href="https://maps.apple.com/?q=${encodeURIComponent(addr || gq)}" target="_blank" rel="noopener"
               class="flex-1 py-2.5 bg-secondary-container text-on-secondary-container text-xs font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-1.5">
               <span class="material-symbols-outlined text-sm">map</span> Apple
            </a>` : ''}
          ${booking?.phone ? `
            <a href="tel:${booking.phone.replace(/\s/g, '')}"
               class="py-2.5 px-4 bg-surface-container-highest text-on-surface text-xs font-bold uppercase tracking-widest rounded-xl flex items-center gap-1.5">
               <span class="material-symbols-outlined text-sm">call</span> Call
            </a>` : ''}
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button data-detail-share="${a.id}" class="py-3 rounded-xl bg-surface-container-low text-on-surface-variant font-semibold text-xs uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-sm">share</span> Share
          </button>
          <button data-detail-check="${a.id}" class="py-3 rounded-xl terracotta-glow text-on-primary-container font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-sm">${done || skipped ? 'undo' : 'check'}</span> ${done || skipped ? 'Reset' : 'Check Off'}
          </button>
        </div>
      </div>
    `);

    const detailShare = $('[data-detail-share]');
    if (detailShare) {
      detailShare.onclick = () => {
        const txt = activityToText(a, day);
        if (navigator.share) navigator.share({ title: a.title, text: txt }).catch(() => {});
        else copyText(txt);
      };
    }
    const detailCheck = $('[data-detail-check]');
    if (detailCheck) {
      detailCheck.onclick = () => { closeModal(); promptCheckoff(a.id); };
    }
  };

  // ---------- Views ----------
  const viewHome = () => {
    const trip = state.trip;
    const stats = tripStats();
    const dayIdx = currentDayIdx();
    const day = trip.days[dayIdx];
    const preTrip = todayStr() < trip.startDate;
    const postTrip = todayStr() > trip.endDate;

    const todayActs = day.activities.map((a, i) => ({ ...a, i }));
    const nowMin = currentMinutes();
    const isToday = day.date === todayStr();
    let nextIdx = todayActs.findIndex(a => a.status === 'pending' && (!isToday || parseHM(a.time) >= nowMin));
    if (nextIdx === -1) nextIdx = todayActs.findIndex(a => a.status === 'pending');
    const prevAct = nextIdx > 0 ? todayActs[nextIdx - 1] : todayActs.find(a => a.status === 'done');
    const nextAct = nextIdx !== -1 ? todayActs[nextIdx] : null;
    const afterAct = nextIdx !== -1 && nextIdx < todayActs.length - 1 ? todayActs[nextIdx + 1] : null;

    let whenLabel = '';
    if (preTrip) {
      const ms = new Date(trip.startDate) - new Date(todayStr());
      const days = Math.round(ms / 86400000);
      whenLabel = days === 1 ? 'Tomorrow' : `In ${days} days`;
    } else if (postTrip) {
      whenLabel = 'Trip complete';
    } else if (nextAct && isToday) {
      const delta = parseHM(nextAct.time) - nowMin;
      if (delta <= 0) whenLabel = 'Now';
      else if (delta < 60) whenLabel = `In ${delta} min`;
      else whenLabel = `In ${Math.floor(delta / 60)}h ${delta % 60}m`;
    }

    const alerts = todayAlerts();
    startCountdown();

    return `
      <div class="fade-in space-y-8">
        <section class="space-y-1 pt-2">
          <p class="text-primary tracking-widest uppercase text-[10px] font-bold">Current Expedition</p>
          <h2 class="font-headline text-4xl font-extrabold tracking-tight leading-none">${h(trip.title)}</h2>
          <p class="text-on-surface-variant text-xs mt-2">${h(trip.subtitle)}</p>
        </section>

        <!-- Quick actions bar -->
        <div class="flex gap-2">
          <button id="home-search" class="flex-1 flex items-center gap-2 bg-surface-container rounded-2xl px-4 py-3 active:scale-[0.99] transition-transform">
            <span class="material-symbols-outlined text-on-surface-variant text-[20px]">search</span>
            <span class="text-sm text-on-surface-variant/60">Search…</span>
          </button>
          <button id="btn-gas-add-dash" class="px-4 py-3 bg-surface-container rounded-2xl active:scale-95 transition-transform flex items-center gap-1.5">
            <span class="material-symbols-outlined text-primary text-[20px]">local_gas_station</span>
          </button>
          <button id="btn-expense-add-dash" class="px-4 py-3 bg-surface-container rounded-2xl active:scale-95 transition-transform flex items-center gap-1.5">
            <span class="material-symbols-outlined text-primary text-[20px]">receipt</span>
          </button>
        </div>

        ${alerts.length ? `
        <!-- Alerts banner -->
        <section class="bg-surface-container-lowest rounded-2xl overflow-hidden">
          <div class="flex items-center gap-2 px-5 pt-4 pb-2">
            <span class="material-symbols-outlined text-primary text-lg fill-icon">warning</span>
            <p class="text-xs font-bold uppercase tracking-widest text-primary">Today's Alerts (${alerts.length})</p>
          </div>
          <div class="px-5 pb-4 space-y-2">
            ${alerts.map(al => `
              <button data-alert-act="${al.id}" class="w-full text-left flex gap-3 p-3 rounded-xl bg-surface-container-low active:scale-[0.99] transition-transform">
                <span class="material-symbols-outlined text-primary text-sm mt-0.5">priority_high</span>
                <div class="min-w-0 flex-1">
                  <p class="text-[11px] text-on-surface-variant leading-snug">${h(al.text)}</p>
                  <p class="text-[10px] text-on-surface-variant/60 mt-1">${h(al.title)} • ${fmtTime12(al.time)}</p>
                </div>
              </button>
            `).join('')}
          </div>
        </section>` : ''}

        ${(() => {
          const essentials = todayEssentials(day);
          if (!essentials.length || !isToday) return '';
          return `
          <section class="bg-surface-container rounded-2xl p-4 space-y-2">
            <p class="text-xs font-bold uppercase tracking-widest text-on-surface flex items-center gap-2"><span class="material-symbols-outlined text-sm text-primary">backpack</span> Today's Essentials</p>
            <div class="flex flex-wrap gap-1.5">${essentials.map(i => `<span class="text-[11px] bg-surface-container-low rounded-full px-2.5 py-1 text-on-surface-variant">${h(i)}</span>`).join('')}</div>
          </section>`;
        })()}

        ${(() => {
          const drive = nextDriveLeaveBy(day);
          if (!drive) return '';
          return `
          <section class="bg-surface-container${drive.urgent ? '-lowest' : ''} rounded-2xl p-4 flex items-center gap-3">
            <span class="material-symbols-outlined text-2xl ${drive.urgent ? 'text-error' : 'text-primary'}">directions_car</span>
            <div class="flex-1">
              <p class="text-xs font-bold uppercase tracking-widest ${drive.urgent ? 'text-error' : 'text-on-surface'}">${h(drive.label)}</p>
              <p class="text-[11px] text-on-surface-variant mt-0.5">${h(drive.activity.title)}${drive.activity.distance ? ` — ${h(drive.activity.distance)}` : ''}</p>
            </div>
          </section>`;
        })()}

        ${(() => {
          if (!nextAct) return '';
          const addr = (() => {
            if (nextAct.bookingRef) {
              const b = trip.bookings.find(b => b.id === nextAct.bookingRef);
              if (b?.address) return b.address;
            }
            return nextAct.location?.address || nextAct.location?.name || null;
          })();
          if (!addr) return '';
          return `
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}" target="_blank" rel="noopener"
             class="block bg-secondary-container rounded-2xl p-4 flex items-center gap-3 active:scale-[0.99] transition-transform">
            <span class="material-symbols-outlined text-xl text-on-secondary-container">navigation</span>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-bold uppercase tracking-widest text-on-secondary-container">Navigate to Next</p>
              <p class="text-[11px] text-on-secondary-container/70 truncate mt-0.5">${h(addr)}</p>
            </div>
            <span class="material-symbols-outlined text-on-secondary-container/60">arrow_forward</span>
          </a>`;
        })()}

        <!-- Calendar View -->
        <section class="bg-surface-container rounded-2xl p-4 space-y-3">
          <p class="text-xs font-bold uppercase tracking-widest text-on-surface">Trip Calendar</p>
          <div class="grid grid-cols-5 gap-2">
            ${trip.days.map(d => {
              const s = daySummary(d);
              const isCurrent = d.date === todayStr();
              const isPast = d.date < todayStr();
              const allDone = s.total > 0 && s.done === s.total;
              const hasProgress = s.done > 0;
              return `
              <a href="#/day/${d.dayNumber}" class="rounded-xl p-2 text-center ${isCurrent ? 'terracotta-glow text-on-primary-container' : 'bg-surface-container-low'} active:scale-95 transition-transform">
                <p class="text-[10px] font-bold ${isCurrent ? '' : 'text-on-surface-variant'}">${fmtDateShort(d.date).split(' ')[1]}</p>
                <p class="font-headline font-bold text-sm ${isCurrent ? '' : isPast ? 'text-on-surface-variant' : 'text-on-surface'}">${d.dayNumber}</p>
                <div class="flex justify-center gap-0.5 mt-1">
                  ${allDone ? `<span class="material-symbols-outlined text-[10px] ${isCurrent ? '' : 'text-tertiary'} fill-icon">check_circle</span>` :
                    hasProgress ? `<div class="w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-on-primary-container' : 'bg-tertiary'}"></div>` :
                    `<div class="w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-on-primary-container/40' : 'bg-surface-container-highest'}"></div>`}
                </div>
              </a>`;
            }).join('')}
          </div>
        </section>

        <section class="relative aspect-[5/4] rounded-2xl overflow-hidden ambient-shadow bg-surface-container-high">
          <div class="absolute inset-0 terracotta-glow opacity-80"></div>
          <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/60 to-transparent"></div>
          <div class="absolute bottom-0 p-6 w-full flex justify-between items-end">
            <div>
              <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">${preTrip ? 'Starting' : postTrip ? 'Ended' : `Day ${day.dayNumber} of ${trip.days.length}`}</p>
              <h3 class="font-headline text-3xl font-extrabold tracking-tight">${fmtDate(day.date)}</h3>
              <p class="text-on-surface-variant text-xs uppercase tracking-widest mt-1">${h(day.title)}</p>
            </div>
            <div class="text-right">
              <div class="flex items-center justify-end gap-1.5 text-primary">
                <span class="material-symbols-outlined fill-icon">wb_sunny</span>
                <span class="font-headline text-2xl font-bold">${day.weather?.high ?? '--'}°</span>
              </div>
              <p class="text-[10px] text-on-surface-variant uppercase tracking-widest">${h(day.weather?.condition || '')}</p>
            </div>
          </div>
        </section>

        <section class="bg-surface-container rounded-2xl p-5 space-y-4">
          <div class="flex justify-between items-center">
            <span class="text-xs font-bold uppercase tracking-widest text-on-surface">Journey Progress</span>
            <span class="font-headline text-sm font-extrabold text-tertiary">${stats.pct}%</span>
          </div>
          <div class="h-3 w-full bg-surface-container-highest rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r from-primary-container to-tertiary rounded-full" style="width:${stats.pct}%"></div>
          </div>
          <div class="grid grid-cols-3 gap-4 pt-1">
            <div><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Day</p><p class="font-headline text-lg font-bold">${day.dayNumber}<span class="text-xs font-normal text-on-surface-variant"> / ${trip.days.length}</span></p></div>
            <div><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Done</p><p class="font-headline text-lg font-bold">${stats.done}<span class="text-xs font-normal text-on-surface-variant"> / ${stats.total}</span></p></div>
            <div class="text-right"><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Driven</p><p class="font-headline text-lg font-bold">${stats.miles}<span class="text-xs font-normal text-on-surface-variant"> mi</span></p></div>
          </div>
          ${stats.done > 0 ? `
          <div class="grid grid-cols-3 gap-4 pt-1 border-t border-outline-variant/10">
            <div class="pt-2"><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Hikes</p><p class="font-headline text-lg font-bold">${stats.hikesCompleted}</p></div>
            <div class="pt-2"><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Elevation</p><p class="font-headline text-lg font-bold">${stats.elevation}<span class="text-xs font-normal text-on-surface-variant"> ft</span></p></div>
            <div class="pt-2 text-right"><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Drive</p><p class="font-headline text-lg font-bold">${stats.driveHours}<span class="text-xs font-normal text-on-surface-variant"> hrs</span></p></div>
          </div>
          ${stats.bestRated ? `<div class="bg-surface-container-low rounded-xl p-3 flex items-center gap-2"><span class="material-symbols-outlined text-tertiary fill-icon text-sm">star</span><span class="text-xs text-on-surface-variant">Best: <span class="text-on-surface font-semibold">${h(stats.bestRated.title)}</span> (${stats.bestRated.rating}★)</span></div>` : ''}` : ''}
        </section>

        <!-- Trip Spending -->
        ${(() => {
          const bookingTotal = trip.bookings.reduce((s, b) => s + (b.cost || 0), 0);
          const gs = gasStats();
          const es = expenseStats();
          const grandTotal = bookingTotal + gs.cost + es.total;
          return `
          <section class="bg-surface-container rounded-2xl p-5 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold uppercase tracking-widest text-on-surface">Trip Spending</span>
              <span class="font-headline text-sm font-extrabold text-primary">$${grandTotal.toFixed(0)}</span>
            </div>
            ${grandTotal ? `<div class="space-y-2">
              <div class="flex justify-between items-center">
                <span class="text-sm text-on-surface-variant flex items-center gap-2"><span class="material-symbols-outlined text-sm">hotel</span> Bookings</span>
                <span class="text-sm font-semibold">$${bookingTotal.toFixed(0)}</span>
              </div>
              ${gs.cost ? `<div class="flex justify-between items-center">
                <span class="text-sm text-on-surface-variant flex items-center gap-2"><span class="material-symbols-outlined text-sm">local_gas_station</span> Gas (${gs.count} stops)</span>
                <span class="text-sm font-semibold">$${gs.cost.toFixed(0)}</span>
              </div>` : ''}
              ${es.total ? `<div class="flex justify-between items-center">
                <span class="text-sm text-on-surface-variant flex items-center gap-2"><span class="material-symbols-outlined text-sm">receipt</span> Expenses (${es.count})</span>
                <span class="text-sm font-semibold">$${es.total.toFixed(0)}</span>
              </div>` : ''}
              ${es.total && Object.keys(es.byCategory).length ? `
              <div class="flex flex-wrap gap-1.5 pt-1">
                ${Object.entries(es.byCategory).map(([k, v]) => `<span class="text-[10px] bg-surface-container-low rounded-full px-2 py-0.5 text-on-surface-variant">${h(k)} $${v.toFixed(0)}</span>`).join('')}
              </div>` : ''}
            </div>` : ''}
          </section>`;
        })()}

        ${isToday && nextAct ? `
        <!-- Running Late -->
        <section class="flex gap-2">
          <button data-late="15" class="flex-1 py-3 rounded-xl bg-surface-container text-on-surface font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-sm text-primary">schedule</span> +15 min
          </button>
          <button data-late="30" class="flex-1 py-3 rounded-xl bg-surface-container text-on-surface font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-sm text-primary">schedule</span> +30 min
          </button>
          <button data-late="60" class="flex-1 py-3 rounded-xl bg-primary-container text-on-primary-container font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-sm">alarm</span> +1 hr
          </button>
        </section>` : ''}

        ${(() => {
          const hasHike = day.activities.some(a => a.type === 'hike' && a.status === 'pending');
          if (!hasHike || !isToday) return '';
          return `
          <section class="bg-surface-container-lowest rounded-2xl p-4 flex items-center gap-3">
            <span class="material-symbols-outlined text-2xl text-tertiary">water_drop</span>
            <div class="flex-1">
              <p class="text-xs font-bold uppercase tracking-widest text-tertiary">Hydration Reminder</p>
              <p class="text-[11px] text-on-surface-variant mt-0.5">Hiking today — drink 1 quart per hour on the trail. Fill up before you leave.</p>
            </div>
          </section>`;
        })()}

        <section class="space-y-5">
          <div class="flex items-center justify-between">
            <h3 class="font-headline text-xl font-bold tracking-tight">${isToday ? "Today's Timeline" : `Day ${day.dayNumber}`}</h3>
            <a href="#/day/${day.dayNumber}" class="text-primary text-xs font-bold uppercase tracking-widest flex items-center gap-1">View Day <span class="material-symbols-outlined text-sm">arrow_forward</span></a>
          </div>

          ${nextAct ? `
          <!-- Live countdown -->
          <div class="flex items-center gap-3 px-1">
            <div class="min-w-[72px] h-14 px-3 rounded-2xl terracotta-glow flex items-center justify-center ambient-shadow">
              <span id="countdown-live" class="font-headline font-extrabold text-on-primary-container text-xs text-center whitespace-nowrap">${h(whenLabel)}</span>
            </div>
            <div class="min-w-0">
              <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Next up</p>
              <p class="font-headline font-bold text-sm truncate">${h(nextAct.title)}</p>
              <p class="text-xs text-on-surface-variant">${fmtTime12(nextAct.time)}</p>
            </div>
          </div>` : ''}

          ${prevAct ? homeMiniCard(prevAct, 'done') : ''}
          ${nextAct ? homeNextCard(nextAct, whenLabel) : `<div class="bg-surface-container rounded-2xl p-5 text-center text-on-surface-variant text-sm">${postTrip ? 'Trip complete — open More to export your memories.' : 'All activities checked off for today'}</div>`}
          ${afterAct ? homeMiniCard(afterAct, 'later') : ''}
        </section>

        ${(() => {
          const today = todayStr();
          const skipped = allActivities().filter(a => a.status === 'skipped');
          const missed = allActivities().filter(a => a.status === 'pending' && a._day.date < today);
          const items = [
            ...skipped.map(a => ({ ...a, label: 'Skipped' })),
            ...missed.map(a => ({ ...a, label: 'Missed' }))
          ];
          if (!items.length) return '';
          return `
          <section class="space-y-3">
            <h3 class="font-headline text-lg font-bold tracking-tight">Skipped & Missed (${items.length})</h3>
            <p class="text-xs text-on-surface-variant">Tap the undo button to revisit or mark done</p>
            <div class="space-y-2">
              ${items.map(a => `
                <div class="flex gap-3 items-center bg-surface-container rounded-xl p-3">
                  <button data-check="${a.id}" class="w-10 h-10 rounded-full bg-surface-container-high text-on-surface-variant/60 flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                    <span class="material-symbols-outlined text-lg">undo</span>
                  </button>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold">${h(a.title)}</p>
                    <p class="text-[10px] text-on-surface-variant">
                      <span class="${a.label === 'Missed' ? 'text-primary' : 'text-on-surface-variant'}">${a.label}</span>
                      • Day ${a._day.dayNumber} • ${fmtTime12(a.time)}
                    </p>
                  </div>
                  <span class="material-symbols-outlined text-on-surface-variant/40">${iconFor(a.type)}</span>
                </div>
              `).join('')}
            </div>
          </section>`;
        })()}
      </div>
    `;
  };

  const homeMiniCard = (a, variant) => `
    <button data-home-act="${a.id}" class="w-full text-left bg-surface-container-low rounded-xl p-4 flex justify-between items-center ${variant === 'done' ? 'opacity-60' : ''} active:scale-[0.99] transition-transform">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-on-surface-variant">${iconFor(a.type)}</span>
        <div class="min-w-0">
          <p class="font-headline font-bold text-sm truncate ${a.status === 'done' ? 'line-through decoration-primary/40' : ''}">${h(a.title)}</p>
          <p class="text-xs text-on-surface-variant truncate">${variant === 'done' ? 'Previous' : 'Later'} • ${fmtTime12(a.time)}</p>
        </div>
      </div>
      <span class="material-symbols-outlined text-on-surface-variant/60">chevron_right</span>
    </button>
  `;

  const homeNextCard = (a, whenLabel) => `
    <div class="terracotta-glow rounded-2xl p-[1px] ambient-shadow">
      <button data-home-act="${a.id}" class="block w-full text-left bg-surface-container-lowest rounded-[15px] p-5 space-y-3 active:scale-[0.99] transition-transform">
        <div class="flex justify-between items-start gap-3">
          <div class="min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-primary">What's Next${whenLabel ? ` — ${h(whenLabel)}` : ''}</p>
            <h4 class="font-headline text-xl font-extrabold leading-tight mt-1">${h(a.title)}</h4>
            ${a.description ? `<p class="text-sm text-on-surface-variant mt-1 line-clamp-2">${h(a.description)}</p>` : ''}
          </div>
          <span class="material-symbols-outlined text-3xl text-primary shrink-0">${iconFor(a.type)}</span>
        </div>
        <div class="flex items-center gap-4 text-sm text-on-surface-variant">
          <span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">schedule</span>${fmtTime12(a.time)}</span>
          ${a.duration ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">timer</span>${fmtDuration(a.duration)}</span>` : ''}
          ${a.distance ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">straighten</span>${h(a.distance)}</span>` : ''}
        </div>
      </button>
    </div>
  `;

  const viewDay = (dayNumber) => {
    const trip = state.trip;
    const dayIdx = dayNumber ? trip.days.findIndex(d => d.dayNumber === dayNumber) : currentDayIdx();
    if (dayIdx === -1) return `<p class="pt-10 text-center text-on-surface-variant">Day not found.</p>`;
    const day = trip.days[dayIdx];
    const isToday = day.date === todayStr();
    const nowMin = currentMinutes();
    const firstPendingIdx = day.activities.findIndex(a => a.status === 'pending' && (!isToday || parseHM(a.time) >= nowMin));

    return `
      <div class="fade-in space-y-6">
        <section class="pt-2">
          <p class="text-primary uppercase tracking-[0.2em] text-[10px] font-bold">Day ${day.dayNumber} • ${fmtDate(day.date)}</p>
          <h1 class="font-headline font-extrabold text-4xl leading-none tracking-tight mt-1">${h(day.title)}</h1>
          ${day.subtitle ? `<p class="text-on-surface-variant mt-2 text-sm">${h(day.subtitle)}</p>` : ''}
        </section>

        <!-- Day picker -->
        <div class="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
          ${trip.days.map(d => `
            <a href="#/day/${d.dayNumber}" class="shrink-0 px-3 py-2 rounded-full text-[11px] uppercase tracking-widest font-bold ${d.dayNumber === day.dayNumber ? 'terracotta-glow text-on-primary-container' : 'bg-surface-container text-on-surface-variant'}">
              Day ${d.dayNumber} · ${fmtDateShort(d.date)}
            </a>`).join('')}
        </div>

        <!-- Weather + Sun -->
        ${day.weather ? `
          <div class="bg-surface-container rounded-2xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 flex items-center justify-center bg-secondary-container rounded-full text-on-secondary-container">
                  <span class="material-symbols-outlined fill-icon">wb_sunny</span>
                </div>
                <div>
                  <p class="font-headline font-bold text-lg leading-tight">${day.weather.high}° / ${day.weather.low}°</p>
                  <p class="text-on-surface-variant text-xs uppercase tracking-widest">${h(day.weather.condition || '')}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                ${day.weather.rainChance ? `
                  <div class="flex items-center gap-1 text-on-surface-variant">
                    <span class="material-symbols-outlined text-sm">water_drop</span>
                    <span class="text-sm font-semibold">${day.weather.rainChance}%</span>
                  </div>` : ''}
                <button data-refresh-weather="${day.dayNumber}" class="w-9 h-9 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center active:scale-90 transition-transform" title="Refresh weather">
                  <span class="material-symbols-outlined text-[18px]">refresh</span>
                </button>
              </div>
            </div>
            ${SUN_DATA[day.date] ? `
              <div class="flex gap-4 pt-1">
                <div class="flex items-center gap-1.5 text-on-surface-variant text-xs">
                  <span class="material-symbols-outlined text-sm text-primary">wb_twilight</span>
                  <span>${SUN_DATA[day.date].rise}</span>
                </div>
                <div class="flex items-center gap-1.5 text-on-surface-variant text-xs">
                  <span class="material-symbols-outlined text-sm text-primary-container">wb_twilight</span>
                  <span>${SUN_DATA[day.date].set}</span>
                </div>
              </div>` : ''}
            ${day.weather.updatedAt ? `<p class="text-[10px] text-on-surface-variant/50 pt-1">Updated ${fmtCheckedAt(day.weather.updatedAt)}</p>` : ''}
          </div>` : ''}

        ${(() => {
          const hikes = day.activities.filter(a => a.type === 'hike' && a.status === 'pending');
          if (!hikes.length) return '';
          const totalMi = hikes.reduce((s, a) => s + (parseFloat(String(a.distance || '').replace(/[^\d.]/g, '')) || 0), 0);
          const quarts = Math.ceil(totalMi * 0.5);
          return `
          <div class="bg-surface-container-lowest rounded-2xl p-4 flex items-center gap-3">
            <span class="material-symbols-outlined text-2xl text-tertiary">water_drop</span>
            <div class="flex-1">
              <p class="text-xs font-bold uppercase tracking-widest text-tertiary">Hydration</p>
              <p class="text-[11px] text-on-surface-variant mt-0.5">${hikes.length} hike${hikes.length > 1 ? 's' : ''} today (~${totalMi.toFixed(1)} mi). Carry at least ${quarts} quart${quarts > 1 ? 's' : ''} of water.</p>
            </div>
          </div>`;
        })()}

        <!-- Collapse toggle -->
        ${day.activities.some(a => a.status === 'done' || a.status === 'skipped') ? `
        <button id="btn-collapse" class="flex items-center gap-2 text-xs text-on-surface-variant uppercase tracking-widest font-bold active:scale-95 transition-transform">
          <span class="material-symbols-outlined text-sm">${state.hideCompleted ? 'visibility' : 'visibility_off'}</span>
          ${state.hideCompleted ? 'Show completed' : 'Hide completed'}
        </button>` : ''}

        <!-- Timeline -->
        <div id="day-timeline" class="relative" data-day="${day.dayNumber}">
          <div class="absolute left-[27px] top-4 bottom-4 w-[2px] bg-surface-container-highest"></div>
          ${day.activities
            .filter(a => state.hideCompleted ? (a.status !== 'done' && a.status !== 'skipped') : true)
            .map((a) => activityCard(a, day.activities.indexOf(a) === firstPendingIdx, day)).join('')}
        </div>

        <!-- Day Summary -->
        ${(() => {
          const s = daySummary(day);
          if (!s.done && !s.skipped) return '';
          return `
          <div class="bg-surface-container rounded-2xl p-5 space-y-3">
            <h3 class="font-headline font-bold text-sm uppercase tracking-widest text-on-surface-variant">Day ${day.dayNumber} Summary</h3>
            <div class="grid grid-cols-4 gap-3">
              <div><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Done</p><p class="font-headline font-bold text-lg text-tertiary">${s.done}</p></div>
              <div><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Skipped</p><p class="font-headline font-bold text-lg">${s.skipped}</p></div>
              <div><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Miles</p><p class="font-headline font-bold text-lg">${s.miles}</p></div>
              <div><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Avg</p><p class="font-headline font-bold text-lg">${s.avgRating ? s.avgRating + '★' : '—'}</p></div>
            </div>
            ${s.topRated ? `
              <div class="bg-surface-container-low rounded-xl p-3 flex items-center gap-2">
                <span class="material-symbols-outlined text-tertiary fill-icon text-sm">star</span>
                <span class="text-xs text-on-surface-variant">Top rated: <span class="text-on-surface font-semibold">${h(s.topRated.title)}</span> (${s.topRated.rating}★)</span>
              </div>` : ''}
          </div>`;
        })()}

        <!-- Per-day spending -->
        ${(() => {
          const de = dayExpenses(day.dayNumber);
          if (!de.count) return '';
          return `
          <div class="bg-surface-container rounded-2xl p-5 space-y-2">
            <div class="flex justify-between items-center">
              <h3 class="font-headline font-bold text-sm uppercase tracking-widest text-on-surface-variant">Day ${day.dayNumber} Spending</h3>
              <span class="font-headline font-bold text-sm text-primary">$${de.total.toFixed(0)}</span>
            </div>
            ${de.expenses.map(e => `
              <div class="flex justify-between text-xs text-on-surface-variant"><span>${h(e.description || e.category)}</span><span class="font-semibold text-on-surface">$${(e.amount || 0).toFixed(2)}</span></div>
            `).join('')}
            ${de.gas.map(g => `
              <div class="flex justify-between text-xs text-on-surface-variant"><span>Gas — ${h(g.location || 'Fill-up')}</span><span class="font-semibold text-on-surface">$${(g.total || 0).toFixed(2)}</span></div>
            `).join('')}
          </div>`;
        })()}

        <!-- Share recap -->
        ${(() => {
          const recap = generateDayRecap(day);
          if (!recap) return '';
          return `
          <button data-share-recap="${day.dayNumber}" class="w-full py-3 rounded-2xl bg-surface-container text-on-surface-variant font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-sm">share</span> Share Day ${day.dayNumber} Recap
          </button>`;
        })()}
      </div>
    `;
  };

  const fmtCheckedAt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const hr = ((d.getHours() + 11) % 12) + 1;
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${hr}:${min} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
  };

  const shiftTime = (hm, deltaMin) => {
    let total = parseHM(hm) + deltaMin;
    if (total < 0) total = 0;
    if (total >= 1440) total = 1439;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  const promptTimeShift = (actId) => {
    const found = findActivity(actId);
    if (!found) return;
    const { day, activity } = found;
    const actIdx = day.activities.indexOf(activity);
    const remaining = day.activities.slice(actIdx);

    openModal(`
      <div class="space-y-5">
        <div>
          <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">Adjust Time</p>
          <h3 class="font-headline font-bold text-xl mt-1">${h(activity.title)}</h3>
          <p class="text-sm text-on-surface-variant mt-1">Currently ${fmtTime12(activity.time)}</p>
        </div>
        <div>
          <p class="text-xs uppercase tracking-widest text-on-surface-variant font-semibold mb-3">Shift by</p>
          <div class="grid grid-cols-3 gap-2">
            ${[-60, -30, -15, 15, 30, 60].map(d => `
              <button data-shift="${d}" class="py-3 rounded-xl ${d > 0 ? 'bg-surface-container-high' : 'bg-surface-container-low'} text-on-surface font-bold text-sm active:scale-95 transition-transform">
                ${d > 0 ? '+' : ''}${d} min
              </button>
            `).join('')}
          </div>
        </div>
        <div class="flex items-center gap-3 pt-1">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" id="shift-cascade" class="w-5 h-5 rounded bg-surface-container-high border-outline-variant accent-primary" />
            <span class="text-sm text-on-surface-variant">Also shift remaining activities (${remaining.length - 1} more)</span>
          </label>
        </div>
        <button id="btn-shift-cancel" class="w-full py-3 text-on-surface-variant font-semibold text-xs uppercase tracking-widest active:scale-95 transition-transform">Cancel</button>
      </div>
    `);

    $$('[data-shift]').forEach(btn => {
      btn.onclick = () => {
        const delta = Number(btn.dataset.shift);
        const cascade = $('#shift-cascade').checked;
        const toShift = cascade ? remaining : [activity];
        toShift.forEach(act => { act.time = shiftTime(act.time, delta); });
        saveTrip(); closeModal();
        toast(`Shifted ${cascade ? remaining.length + ' activities' : '1 activity'} by ${delta > 0 ? '+' : ''}${delta} min`);
        render();
      };
    });

    $('#btn-shift-cancel').onclick = closeModal;
  };

  const activityCard = (a, isNextUp, day) => {
    const done = a.status === 'done';
    const skipped = a.status === 'skipped';
    const booking = a.bookingRef ? state.trip.bookings.find(b => b.id === a.bookingRef) : null;
    const circle = done
      ? `<div class="w-14 h-14 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center border-4 border-surface shadow-lg"><span class="material-symbols-outlined text-2xl fill-icon">check</span></div>`
      : skipped
      ? `<div class="w-14 h-14 rounded-full bg-surface-container-high text-on-surface-variant/60 flex items-center justify-center border-4 border-surface"><span class="material-symbols-outlined text-xl">close</span></div>`
      : isNextUp
      ? `<div class="w-14 h-14 rounded-full bg-surface-container-high border-2 border-primary text-primary flex items-center justify-center border-4 border-surface shadow-[0_0_20px_rgba(255,182,141,0.25)]"><div class="w-8 h-8 rounded-full border-4 border-primary"></div></div>`
      : `<div class="w-14 h-14 rounded-full bg-surface-container-high border-2 border-outline-variant/60 text-on-surface-variant flex items-center justify-center border-4 border-surface"><div class="w-6 h-6 rounded-full border-2 border-outline-variant/50"></div></div>`;

    const bodyClasses = isNextUp
      ? 'terracotta-glow rounded-2xl p-[1px] ambient-shadow'
      : '';
    const innerClass = isNextUp
      ? 'bg-surface-container-lowest rounded-[15px] p-5'
      : `rounded-2xl p-5 ${done || skipped ? 'bg-surface-container-low' : 'bg-surface-container'}`;

    const doneAtLabel = done && a.checkedAt ? `Done at ${fmtCheckedAt(a.checkedAt)}` : skipped && a.checkedAt ? `Skipped at ${fmtCheckedAt(a.checkedAt)}` : '';

    return `
      <div class="relative flex gap-4 mb-6">
        <button class="relative z-10 active:scale-90 transition-transform" data-check="${a.id}" aria-label="Toggle ${h(a.title)}">${circle}</button>
        <div class="flex-1 min-w-0 ${bodyClasses} cursor-pointer" data-detail="${a.id}">
          <div class="${innerClass}">
            <div class="flex justify-between items-start gap-3 mb-2">
              <div class="flex items-center gap-2">
                <span class="text-primary-fixed-dim text-xs font-bold tracking-tight">${fmtTime12(a.time)}</span>
                ${doneAtLabel ? `<span class="text-[10px] text-tertiary">${doneAtLabel}</span>` : ''}
              </div>
              <div class="flex items-center gap-2">
                ${a.highlight ? `<span class="text-[9px] font-bold uppercase tracking-widest text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-full">Highlight</span>` : ''}
                ${isNextUp ? `<span class="text-[9px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full">Next Up</span>` : ''}
                <button data-bookmark="${a.id}" class="p-1 ${a.bookmarked ? 'text-primary' : 'text-on-surface-variant/60'} active:scale-90 transition-transform" title="Bookmark"><span class="material-symbols-outlined text-[16px] ${a.bookmarked ? 'fill-icon' : ''}">bookmark</span></button>
                <button data-share-act="${a.id}" class="p-1 text-on-surface-variant/60 active:scale-90 transition-transform" title="Share"><span class="material-symbols-outlined text-[16px]">share</span></button>
                ${!done && !skipped ? `<button data-time-shift="${a.id}" class="p-1 text-on-surface-variant/60 active:scale-90 transition-transform" title="Adjust time"><span class="material-symbols-outlined text-[16px]">schedule</span></button>` : ''}
                ${a.duration ? `<span class="text-[10px] uppercase font-medium text-on-surface-variant">${fmtDuration(a.duration)}</span>` : ''}
              </div>
            </div>
            <div class="flex items-start gap-3">
              <span class="material-symbols-outlined ${isNextUp ? 'text-primary text-3xl' : done || skipped ? 'text-on-surface-variant/60' : 'text-on-surface-variant'}">${iconFor(a.type)}</span>
              <div class="min-w-0 flex-1">
                <h3 class="font-headline font-bold ${isNextUp ? 'text-xl' : 'text-base'} ${done ? 'line-through decoration-primary/40 text-on-surface/60' : skipped ? 'text-on-surface-variant/60 line-through' : 'text-on-surface'}">${h(a.title)}</h3>
                ${a.description ? `<p class="text-on-surface-variant text-sm mt-1 ${done || skipped ? 'opacity-70' : ''}">${h(a.description)}</p>` : ''}
                ${a.distance ? `<p class="text-xs text-on-surface-variant mt-2"><span class="material-symbols-outlined text-[14px] align-middle">straighten</span> ${h(a.distance)}${a.difficulty ? ` • ${h(a.difficulty)}` : ''}${a.elevationGain ? ` • +${a.elevationGain} ft` : ''}</p>` : ''}
                ${a.alerts?.length ? `<div class="mt-3 space-y-1">${a.alerts.map(al => `
                  <div class="flex gap-2 items-start bg-surface-container-low rounded-lg p-2">
                    <span class="material-symbols-outlined text-primary text-sm mt-0.5">priority_high</span>
                    <p class="text-[11px] text-on-surface-variant leading-snug">${h(al)}</p>
                  </div>`).join('')}</div>` : ''}
                ${(() => { const cw = getCellWarning(a); return cw ? `<div class="mt-2 flex gap-2 items-center bg-surface-container-low rounded-lg p-2"><span class="material-symbols-outlined text-on-surface-variant/60 text-sm">signal_cellular_off</span><p class="text-[11px] text-on-surface-variant/60">${h(cw)}</p></div>` : ''; })()}
                ${done && a.rating ? `<p class="text-xs text-tertiary mt-2">${'★'.repeat(a.rating)}${'☆'.repeat(5 - a.rating)}${a.notes ? ` — ${h(a.notes)}` : ''}</p>` : ''}
                ${a.actualLocation ? `<a href="https://www.google.com/maps/search/?api=1&query=${a.actualLocation.lat},${a.actualLocation.lng}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-[10px] text-on-surface-variant/50 mt-1"><span class="material-symbols-outlined text-[12px]">pin_drop</span>${a.actualLocation.lat.toFixed(3)}, ${a.actualLocation.lng.toFixed(3)}</a>` : ''}

                ${(() => {
                  const addr = booking?.address || a.location?.address || a.location?.name;
                  const loc = a.location;
                  const hasLoc = addr || (loc?.lat && loc?.lng);
                  if (!hasLoc && !booking?.phone && !booking) return '';
                  const gq = loc?.lat && loc?.lng ? `${loc.lat},${loc.lng}` : addr;
                  const aq = addr || (loc?.lat ? `${loc.lat},${loc.lng}` : '');
                  return `<div class="mt-3 flex flex-wrap gap-2">
                    ${hasLoc ? `
                      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gq)}" target="_blank" rel="noopener"
                         class="py-2 px-3 bg-secondary-container text-on-secondary-container text-[11px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-1.5">
                         <span class="material-symbols-outlined text-sm">map</span> Google
                      </a>
                      <a href="https://maps.apple.com/?q=${encodeURIComponent(aq)}" target="_blank" rel="noopener"
                         class="py-2 px-3 bg-secondary-container text-on-secondary-container text-[11px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-1.5">
                         <span class="material-symbols-outlined text-sm">map</span> Apple
                      </a>` : ''}
                    ${booking?.phone ? `
                      <a href="tel:${booking.phone.replace(/\s/g, '')}"
                         class="py-2 px-3 bg-surface-container-high text-on-surface text-[11px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-1.5">
                         <span class="material-symbols-outlined text-sm">call</span> Call
                      </a>` : ''}
                    ${booking ? `
                      <a href="#/bookings" data-focus-booking="${booking.id}"
                         class="py-2 px-3 bg-surface-container-high text-on-surface text-[11px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-1.5">
                         <span class="material-symbols-outlined text-sm">confirmation_number</span> Booking
                      </a>` : ''}
                  </div>`;
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  const viewBookings = () => {
    const trip = state.trip;
    const today = todayStr();
    const bookings = [...trip.bookings].sort((a, b) => (a.checkIn || a.dateTime || '').localeCompare(b.checkIn || b.dateTime || ''));
    return `
      <div class="fade-in space-y-8 pt-2">
        <section>
          <p class="text-primary uppercase tracking-[0.2em] text-xs font-semibold mb-2">Adventure Ledger</p>
          <h2 class="font-headline font-extrabold text-4xl tracking-tight">Your Bookings</h2>
          <p class="text-on-surface-variant text-sm mt-2">${bookings.length} total • tap a confirmation number to copy</p>
        </section>

        <div class="space-y-8">
          ${bookings.map(b => bookingCard(b, today)).join('')}
        </div>
      </div>
    `;
  };

  const bookingCard = (b, today) => {
    const checkIn = b.checkIn || b.dateTime || '';
    const checkOut = b.checkOut || '';
    const dateOnly = (s) => (s || '').slice(0, 10);
    const isPast = checkOut ? dateOnly(checkOut) < today : dateOnly(checkIn) < today;
    const isActive = (() => {
      const ci = dateOnly(checkIn), co = dateOnly(checkOut || checkIn);
      return today >= ci && today <= co;
    })();
    const statusLabel = isActive ? 'Active Today' : isPast ? 'Past' : 'Upcoming';
    const statusColor = isActive ? 'text-primary' : isPast ? 'text-on-surface-variant' : 'text-tertiary';

    const icon = b.type === 'lodging' ? 'hotel' : iconFor('activity');
    const dateLabel = checkOut
      ? `${fmtDateShort(dateOnly(checkIn))} – ${fmtDateShort(dateOnly(checkOut))}`
      : fmtDateShort(dateOnly(checkIn));

    return `
      <article id="booking-${b.id}" class="relative ${isPast ? 'opacity-60' : ''}">
        <div class="absolute -left-3 top-0 bottom-0 w-[2px] ${isActive ? 'bg-primary/60' : 'bg-surface-container-highest/50'}"></div>
        <div class="flex items-center gap-3 mb-3">
          <span class="flex-none w-3 h-3 rounded-full ${isActive ? 'bg-primary ring-4 ring-primary/20' : 'bg-surface-container-highest'}"></span>
          <span class="text-[10px] font-bold uppercase tracking-widest ${statusColor}">${statusLabel} • ${h(dateLabel)}</span>
        </div>
        <div class="bg-surface-container rounded-2xl p-5 space-y-4">
          <div class="flex justify-between items-start gap-3">
            <div class="min-w-0">
              <h3 class="font-headline font-bold text-lg leading-tight">${h(b.name)}</h3>
              ${b.address ? `<div class="flex items-center gap-1.5 text-on-surface-variant text-xs mt-1"><span class="material-symbols-outlined text-sm">location_on</span><span class="truncate">${h(b.address)}</span></div>` : ''}
            </div>
            <div class="w-11 h-11 bg-secondary-container rounded-xl flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-primary">${icon}</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 pt-1">
            ${b.confirmationNumber ? `
              <div>
                <p class="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Confirmation</p>
                <button data-copy="${h(b.confirmationNumber)}" class="flex items-center gap-2 active:scale-95 transition-transform">
                  <span class="font-mono text-sm text-on-surface">${h(b.confirmationNumber)}</span>
                  <span class="material-symbols-outlined text-base text-primary">content_copy</span>
                </button>
              </div>` : ''}
            ${b.pinCode ? `
              <div>
                <p class="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Pin Code</p>
                <button data-copy="${h(b.pinCode)}" class="flex items-center gap-2 active:scale-95 transition-transform">
                  <span class="font-mono text-sm text-on-surface">${h(b.pinCode)}</span>
                  <span class="material-symbols-outlined text-base text-primary">content_copy</span>
                </button>
              </div>` : ''}
            ${b.cost ? `
              <div>
                <p class="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Cost</p>
                <p class="text-sm font-semibold">$${b.cost.toFixed(2)}</p>
              </div>` : ''}
            ${b.phone ? `
              <div>
                <p class="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Phone</p>
                <a href="tel:${b.phone.replace(/\s/g, '')}" class="text-sm font-semibold text-primary">${h(b.phone)}</a>
              </div>` : ''}
          </div>

          ${b.notes ? `
            <div class="bg-surface-container-low rounded-lg p-3 flex items-start gap-2">
              <span class="material-symbols-outlined text-primary text-sm mt-0.5">info</span>
              <p class="text-xs text-on-surface-variant leading-relaxed">${h(b.notes)}</p>
            </div>` : ''}

          <div class="flex gap-2">
            ${b.address ? `
              <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}" target="_blank" rel="noopener"
                 class="flex-1 py-2.5 bg-secondary-container text-on-secondary-container text-xs font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5">
                 <span class="material-symbols-outlined text-sm">map</span> Google
              </a>
              <a href="https://maps.apple.com/?q=${encodeURIComponent(b.address)}" target="_blank" rel="noopener"
                 class="flex-1 py-2.5 bg-secondary-container text-on-secondary-container text-xs font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5">
                 <span class="material-symbols-outlined text-sm">map</span> Apple
              </a>` : ''}
            ${b.phone ? `
              <a href="tel:${b.phone.replace(/\s/g, '')}"
                 class="py-2.5 px-3 bg-surface-container-high text-on-surface text-xs font-bold uppercase tracking-widest rounded-lg flex items-center justify-center">
                 <span class="material-symbols-outlined text-sm">call</span>
              </a>` : ''}
          </div>
        </div>
      </article>
    `;
  };

  const viewMore = () => {
    const trip = state.trip;
    const categories = [...new Set(trip.packingList.map(p => p.category))];
    const packed = trip.packingList.filter(p => p.packed).length;
    const totalCost = trip.bookings.reduce((s, b) => s + (b.cost || 0), 0);
    const journal = getJournal();
    const gas = getGasLog();
    const gs = gasStats();

    return `
      <div class="fade-in space-y-8 pt-2">
        <section>
          <p class="text-primary uppercase tracking-[0.2em] text-xs font-semibold mb-2">Trip Control</p>
          <h2 class="font-headline font-extrabold text-4xl tracking-tight">More</h2>
        </section>

        <!-- Emergency Info -->
        <section class="bg-surface-container-lowest rounded-2xl overflow-hidden">
          <div class="flex items-center gap-2 px-5 pt-4 pb-2">
            <span class="material-symbols-outlined text-error fill-icon text-lg">emergency</span>
            <h3 class="font-headline font-bold text-sm uppercase tracking-widest text-error">Emergency & Vehicle</h3>
          </div>
          <div class="px-5 pb-4 space-y-3">
            <div class="bg-surface-container-low rounded-xl p-3 flex items-center justify-between">
              <div>
                <p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Vehicle</p>
                <p class="text-sm font-semibold">${h(EMERGENCY.vehicle.make)}</p>
              </div>
              <button data-copy="${h(EMERGENCY.vehicle.plate)}" class="flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded-lg active:scale-95 transition-transform">
                <span class="font-mono text-sm font-bold text-primary">${h(EMERGENCY.vehicle.plate)}</span>
                <span class="material-symbols-outlined text-sm text-on-surface-variant">content_copy</span>
              </button>
            </div>
            ${EMERGENCY.contacts.map(c => `
              <a href="tel:${c.phone}" class="flex items-center gap-3 bg-surface-container-low rounded-xl p-3 active:scale-[0.99] transition-transform">
                <span class="material-symbols-outlined text-error text-lg">call</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold">${h(c.label)}</p>
                  <p class="text-xs text-on-surface-variant">${h(c.display)}${c.note ? ` — ${h(c.note)}` : ''}</p>
                </div>
              </a>
            `).join('')}
          </div>
        </section>

        <!-- Journal -->
        <section class="bg-surface-container rounded-2xl p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-headline font-bold text-lg">Trip Journal</h3>
            <span class="text-xs text-on-surface-variant uppercase tracking-widest">${journal.length} notes</span>
          </div>
          <div class="flex gap-2">
            <input id="journal-input" type="text" placeholder="Quick note, tip, or memory…" class="flex-1 bg-surface-container-low text-on-surface px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/60 placeholder:text-on-surface-variant/50" />
            <button id="btn-journal-add" class="px-4 py-2.5 rounded-xl terracotta-glow text-on-primary-container font-bold text-xs uppercase active:scale-95 transition-transform">
              <span class="material-symbols-outlined text-sm">add</span>
            </button>
          </div>
          ${journal.length ? `
            <div class="space-y-2 pt-1">
              ${[...journal].reverse().map(e => `
                <div class="flex gap-2 items-start bg-surface-container-low rounded-xl p-3">
                  <span class="material-symbols-outlined text-primary text-sm mt-0.5">edit_note</span>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm">${h(e.text)}</p>
                    <p class="text-[10px] text-on-surface-variant mt-1">Day ${e.dayNumber || '?'} • ${fmtCheckedAt(e.createdAt)}${e.geo ? ` • <a href="https://www.google.com/maps/search/?api=1&query=${e.geo.lat},${e.geo.lng}" target="_blank" rel="noopener" class="text-primary/60">📍</a>` : ''}</p>
                  </div>
                  <button data-del-journal="${e.id}" class="p-1 text-on-surface-variant/40 active:scale-90 transition-transform">
                    <span class="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              `).join('')}
            </div>` : `<p class="text-xs text-on-surface-variant">No notes yet. Jot down tips, memories, or things to remember for next time.</p>`}
        </section>

        <!-- Gas Tracker -->
        <section class="bg-surface-container rounded-2xl p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-headline font-bold text-lg">Gas Log</h3>
            <button id="btn-gas-add" class="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform flex items-center gap-1">
              <span class="material-symbols-outlined text-sm">add</span> Fill-up
            </button>
          </div>
          ${gs.count ? `
            <div class="grid grid-cols-3 gap-3">
              <div><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Stops</p><p class="font-headline font-bold text-lg">${gs.count}</p></div>
              <div><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Gallons</p><p class="font-headline font-bold text-lg">${gs.gallons}</p></div>
              <div><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Spent</p><p class="font-headline font-bold text-lg">$${gs.cost.toFixed(0)}</p></div>
            </div>
            <div class="space-y-2 pt-1">
              ${[...gas].reverse().map(e => `
                <div class="flex gap-3 items-center bg-surface-container-low rounded-xl p-3">
                  <span class="material-symbols-outlined text-on-surface-variant">local_gas_station</span>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold">${h(e.location || 'Fill-up')}</p>
                    <p class="text-[10px] text-on-surface-variant">${e.gallons ? e.gallons + ' gal' : ''}${e.pricePerGal ? ` @ $${e.pricePerGal}/gal` : ''} • Day ${e.dayNumber || '?'}${e.geo ? ` • <a href="https://www.google.com/maps/search/?api=1&query=${e.geo.lat},${e.geo.lng}" target="_blank" rel="noopener" class="text-primary/60">📍</a>` : ''}</p>
                  </div>
                  <span class="text-sm font-bold text-on-surface">$${(e.total || 0).toFixed(2)}</span>
                  <button data-del-gas="${e.id}" class="p-1 text-on-surface-variant/40 active:scale-90 transition-transform">
                    <span class="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              `).join('')}
            </div>` : `<p class="text-xs text-on-surface-variant">Log fill-ups to track fuel spend across the trip.</p>`}
        </section>

        <!-- Expenses -->
        <section class="bg-surface-container rounded-2xl p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-headline font-bold text-lg">Expenses</h3>
            <button id="btn-expense-add" class="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform flex items-center gap-1">
              <span class="material-symbols-outlined text-sm">add</span> Add
            </button>
          </div>
          ${(() => {
            const es = expenseStats();
            const expenses = getExpenses();
            if (!es.count) return `<p class="text-xs text-on-surface-variant">Track food, souvenirs, park fees, tips.</p>`;
            return `
              <div class="grid grid-cols-2 gap-3">
                <div><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Total</p><p class="font-headline font-bold text-lg">$${es.total.toFixed(0)}</p></div>
                <div><p class="text-[10px] text-on-surface-variant uppercase tracking-widest">Items</p><p class="font-headline font-bold text-lg">${es.count}</p></div>
              </div>
              ${Object.keys(es.byCategory).length ? `<div class="flex flex-wrap gap-2">${Object.entries(es.byCategory).map(([k, v]) => `<span class="text-[10px] bg-surface-container-low rounded-full px-2 py-1 text-on-surface-variant">${h(k)}: $${v.toFixed(0)}</span>`).join('')}</div>` : ''}
              <div class="space-y-2 pt-1">
                ${[...expenses].reverse().map(e => `
                  <div class="flex gap-3 items-center bg-surface-container-low rounded-xl p-3">
                    <span class="material-symbols-outlined text-on-surface-variant">receipt</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold">${h(e.description || e.category)}</p>
                      <p class="text-[10px] text-on-surface-variant">${h(e.category)} • Day ${e.dayNumber || '?'}${e.geo ? ` • <a href="https://www.google.com/maps/search/?api=1&query=${e.geo.lat},${e.geo.lng}" target="_blank" rel="noopener" class="text-primary/60">📍</a>` : ''}</p>
                    </div>
                    <span class="text-sm font-bold text-on-surface">$${(e.amount || 0).toFixed(2)}</span>
                    <button data-del-expense="${e.id}" class="p-1 text-on-surface-variant/40 active:scale-90 transition-transform">
                      <span class="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                `).join('')}
              </div>`;
          })()}
        </section>

        <!-- Packing -->
        <section class="bg-surface-container rounded-2xl p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-headline font-bold text-lg">Packing</h3>
            <span class="text-xs text-on-surface-variant uppercase tracking-widest">${packed}/${trip.packingList.length}</span>
          </div>
          <div class="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
            <div class="h-full bg-tertiary rounded-full" style="width:${Math.round(packed / trip.packingList.length * 100)}%"></div>
          </div>
          <div class="space-y-4 pt-2">
            ${categories.map(cat => `
              <div>
                <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-2">${h(cat)}</p>
                <div class="space-y-2">
                  ${trip.packingList.filter(p => p.category === cat).map(p => `
                    <button data-pack="${p.id}" class="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-surface-container-low active:scale-[0.99] transition-transform">
                      <span class="material-symbols-outlined ${p.packed ? 'text-tertiary fill-icon' : 'text-on-surface-variant'}">${p.packed ? 'check_circle' : 'radio_button_unchecked'}</span>
                      <span class="flex-1 text-sm ${p.packed ? 'line-through text-on-surface-variant/60' : ''}">${h(p.item)}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </section>

        <section class="bg-surface-container rounded-2xl p-5 space-y-3">
          <h3 class="font-headline font-bold text-lg">Trip at a glance</h3>
          <div class="grid grid-cols-2 gap-4">
            <div><p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Travelers</p><p class="font-headline font-bold text-lg">${trip.travelers}</p></div>
            <div><p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Days</p><p class="font-headline font-bold text-lg">${trip.days.length}</p></div>
            <div><p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Bookings</p><p class="font-headline font-bold text-lg">${trip.bookings.length}</p></div>
            <div><p class="text-[10px] uppercase tracking-widest text-on-surface-variant">Booked Spend</p><p class="font-headline font-bold text-lg">$${totalCost.toFixed(0)}</p></div>
          </div>
          <p class="text-xs text-on-surface-variant pt-1">${h(trip.vehicle || '')}</p>
        </section>

        <section class="bg-surface-container rounded-2xl p-5 space-y-3">
          <h3 class="font-headline font-bold text-lg">Travel DNA</h3>
          <ul class="space-y-2">
            ${trip.travelPreferences.existingPreferences.map(p => `
              <li class="flex gap-2 text-sm text-on-surface-variant"><span class="text-primary">&bull;</span><span>${h(p)}</span></li>
            `).join('')}
          </ul>
        </section>

        <section class="bg-surface-container rounded-2xl p-5 space-y-3">
          <h3 class="font-headline font-bold text-lg">Data</h3>
          <p class="text-xs text-on-surface-variant">All progress is saved on this device. Export before deleting browser data.</p>
          <div class="grid grid-cols-2 gap-3 pt-1">
            <button id="btn-export" class="py-3 rounded-xl terracotta-glow text-on-primary-container font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform">
              <span class="material-symbols-outlined align-middle text-sm">download</span> Export JSON
            </button>
            <button id="btn-import" class="py-3 rounded-xl bg-surface-container-high text-on-surface font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform">
              <span class="material-symbols-outlined align-middle text-sm">upload</span> Import JSON
            </button>
          </div>
          <button id="btn-reset" class="w-full py-3 mt-1 rounded-xl bg-surface-container-low text-error font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform">
            Reset to seed trip
          </button>
          <input id="file-import" type="file" accept="application/json" class="hidden" />
        </section>

        <p class="text-center text-[10px] text-on-surface-variant/60 pt-2 pb-6">TripDNA v0.2 • offline-first</p>
      </div>
    `;
  };

  // ---------- Actions ----------
  const copyText = async (txt) => {
    try {
      await navigator.clipboard.writeText(txt);
      toast('Copied ✓');
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied ✓'); } catch { toast('Copy failed'); }
      document.body.removeChild(ta);
    }
  };

  const exportTrip = () => {
    const blob = new Blob([JSON.stringify(state.trip, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.trip.tripId || 'trip'}-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Exported');
  };

  const importTrip = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.days || !Array.isArray(parsed.days)) throw new Error('not a trip');
        state.trip = parsed;
        saveTrip();
        toast('Imported');
        location.hash = '#/';
        render();
      } catch (e) {
        toast('Invalid trip JSON');
      }
    };
    reader.readAsText(file);
  };

  const promptGasEntry = () => {
    openModal(`
      <div class="space-y-4">
        <div>
          <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">Log Fill-Up</p>
          <h3 class="font-headline font-bold text-xl mt-1">Gas Stop</h3>
        </div>
        <input id="gas-location" type="text" placeholder="Location (e.g. Alpine Chevron)" class="w-full bg-surface-container-low text-on-surface px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/60" />
        <div class="grid grid-cols-2 gap-3">
          <input id="gas-gallons" type="number" step="0.1" placeholder="Gallons" class="bg-surface-container-low text-on-surface px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/60" />
          <input id="gas-ppg" type="number" step="0.01" placeholder="$/gallon" class="bg-surface-container-low text-on-surface px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/60" />
        </div>
        <input id="gas-total" type="number" step="0.01" placeholder="Total $ (auto-calculated or override)" class="w-full bg-surface-container-low text-on-surface px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/60" />
        <div class="grid grid-cols-2 gap-3">
          <button id="gas-cancel" class="py-3 rounded-xl bg-surface-container-low text-on-surface-variant font-semibold text-xs uppercase tracking-widest active:scale-95 transition-transform">Cancel</button>
          <button id="gas-save" class="py-3 rounded-xl terracotta-glow text-on-primary-container font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform">Save</button>
        </div>
      </div>
    `);

    const galInp = $('#gas-gallons'), ppgInp = $('#gas-ppg'), totInp = $('#gas-total');
    const autoCalc = () => {
      const g = parseFloat(galInp.value), p = parseFloat(ppgInp.value);
      if (g && p && !totInp.value) totInp.value = (g * p).toFixed(2);
    };
    galInp.addEventListener('input', autoCalc);
    ppgInp.addEventListener('input', autoCalc);

    $('#gas-cancel').onclick = closeModal;
    $('#gas-save').onclick = async () => {
      const gallons = parseFloat(galInp.value) || 0;
      const pricePerGal = parseFloat(ppgInp.value) || 0;
      const total = parseFloat(totInp.value) || (gallons * pricePerGal);
      const location = $('#gas-location').value.trim();
      if (!total && !gallons) { toast('Enter gallons or total'); return; }
      const geo = await getLocation();
      addGasEntry({ location, gallons, pricePerGal, total, geo });
      closeModal();
      toast('Fill-up logged');
      render();
    };
  };

  const promptExpenseEntry = () => {
    openModal(`
      <div class="space-y-4">
        <div>
          <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">Log Expense</p>
          <h3 class="font-headline font-bold text-xl mt-1">Quick Expense</h3>
        </div>
        <input id="exp-desc" type="text" placeholder="What was it? (e.g. Lunch at Reata)" class="w-full bg-surface-container-low text-on-surface px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/60" />
        <input id="exp-amount" type="number" step="0.01" placeholder="Amount ($)" class="w-full bg-surface-container-low text-on-surface px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/60" />
        <div class="flex flex-wrap gap-2">
          ${EXPENSE_CATEGORIES.map((c, i) => `
            <button data-exp-cat="${c}" class="px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest font-bold ${i === 0 ? 'terracotta-glow text-on-primary-container' : 'bg-surface-container text-on-surface-variant'} active:scale-95 transition-transform">${c}</button>
          `).join('')}
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button id="exp-cancel" class="py-3 rounded-xl bg-surface-container-low text-on-surface-variant font-semibold text-xs uppercase tracking-widest active:scale-95 transition-transform">Cancel</button>
          <button id="exp-save" class="py-3 rounded-xl terracotta-glow text-on-primary-container font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform">Save</button>
        </div>
      </div>
    `);

    let selectedCat = EXPENSE_CATEGORIES[0];
    $$('[data-exp-cat]').forEach(btn => {
      btn.onclick = () => {
        selectedCat = btn.dataset.expCat;
        $$('[data-exp-cat]').forEach(b => {
          b.className = `px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest font-bold active:scale-95 transition-transform ${b.dataset.expCat === selectedCat ? 'terracotta-glow text-on-primary-container' : 'bg-surface-container text-on-surface-variant'}`;
        });
      };
    });

    $('#exp-cancel').onclick = closeModal;
    $('#exp-save').onclick = async () => {
      const desc = $('#exp-desc').value.trim();
      const amount = parseFloat($('#exp-amount').value) || 0;
      if (!amount) { toast('Enter an amount'); return; }
      const geo = await getLocation();
      addExpenseEntry({ description: desc || selectedCat, amount, category: selectedCat, geo });
      closeModal();
      toast('Expense logged');
      render();
    };
  };

  const resetTrip = () => {
    if (!confirm('Reset all progress and restore the seed trip?')) return;
    state.trip = JSON.parse(JSON.stringify(window.SEED_TRIP));
    saveTrip();
    toast('Reset');
    render();
  };

  // ---------- Router ----------
  const parseRoute = () => {
    const hash = (location.hash || '#/').slice(1);
    if (hash.startsWith('/day')) {
      const parts = hash.split('/').filter(Boolean);
      const n = Number(parts[1]);
      return { name: 'day', day: Number.isFinite(n) ? n : null };
    }
    if (hash.startsWith('/bookings')) return { name: 'bookings' };
    if (hash.startsWith('/more')) return { name: 'more' };
    return { name: 'home' };
  };

  const render = () => {
    const route = parseRoute();
    $$('[data-view]').forEach(v => v.classList.remove('active'));
    const view = $(`[data-view="${route.name}"]`);
    view.classList.add('active');

    if (route.name === 'home') view.innerHTML = viewHome();
    else if (route.name === 'day') view.innerHTML = viewDay(route.day);
    else if (route.name === 'bookings') view.innerHTML = viewBookings();
    else if (route.name === 'more') view.innerHTML = viewMore();

    // Nav highlight
    $$('.nav-item').forEach(n => {
      const active = n.dataset.nav === route.name;
      n.classList.toggle('text-primary', active);
      n.classList.toggle('text-on-surface-variant', !active);
      const icon = n.querySelector('.material-symbols-outlined');
      icon.classList.toggle('fill-icon', active);
    });

    // Scroll top on view change
    window.scrollTo({ top: 0 });

    // Focus booking if hash intent
    const focusId = sessionStorage.getItem('focus-booking');
    if (focusId && route.name === 'bookings') {
      sessionStorage.removeItem('focus-booking');
      const el = document.getElementById(`booking-${focusId}`);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  };

  // ---------- Search ----------
  const CATEGORY_KEYWORDS = {
    'hike':       ['hike', 'trail', 'trek', 'trekking', 'hiking', 'elevation', 'lost mine', 'window trail', 'canyon trail', 'skyline'],
    'drive':      ['drive', 'driving', 'road', 'depart', 'arrive', 'gas', 'fuel', 'miles'],
    'food':       ['food', 'eat', 'lunch', 'dinner', 'breakfast', 'coffee', 'restaurant', 'cafe', 'burrito'],
    'lodging':    ['lodge', 'lodging', 'hotel', 'check in', 'check out', 'ranch', 'room', 'inn'],
    'experience': ['experience', 'stargazing', 'star party', 'hot springs', 'soak', 'mystery lights', 'float'],
    'sightseeing':['sightseeing', 'ghost town', 'museum', 'gallery', 'prada', 'chinati', 'scenic', 'overlook', 'fossil'],
    'activity':   ['activity', 'kayak', 'canoe', 'swim', 'pool', 'observatory', 'solar', 'telescope', 'balmorhea'],
    'rest':       ['rest', 'nap', 'sleep', 'relax', 'recovery', 'decompress'],
  };

  const expandQuery = (q) => {
    const low = q.toLowerCase();
    const extra = [];
    for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
      if (kws.some(k => low.includes(k) || k.includes(low))) extra.push(cat);
    }
    return extra;
  };

  const searchTrip = (q, activeFilter) => {
    const low = q.toLowerCase().trim();
    if (!low && !activeFilter) return { activities: [], bookings: [], packing: [] };
    const cats = expandQuery(low);

    const matchAct = (a) => {
      if (activeFilter && a.type !== activeFilter && !cats.includes(activeFilter)) return false;
      if (activeFilter && a.type === activeFilter && !low) return true;
      const hay = [a.title, a.description, a.type, ...(a.alerts || []), a.distance, a.difficulty].filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(low)) return true;
      if (cats.includes(a.type)) return true;
      return false;
    };

    const matchBooking = (b) => {
      if (activeFilter && activeFilter !== 'booking') return false;
      const hay = [b.name, b.address, b.notes, b.type, b.confirmationNumber].filter(Boolean).join(' ').toLowerCase();
      return !low || hay.includes(low);
    };

    const matchPacking = (p) => {
      if (activeFilter && activeFilter !== 'packing') return false;
      const hay = [p.item, p.category].join(' ').toLowerCase();
      return !low || hay.includes(low);
    };

    const activities = [];
    for (const d of state.trip.days) {
      for (const a of d.activities) {
        if (matchAct(a)) activities.push({ ...a, _dayNumber: d.dayNumber, _dayDate: d.date });
      }
    }
    const bookings = state.trip.bookings.filter(matchBooking);
    const packing = state.trip.packingList.filter(matchPacking);
    return { activities, bookings, packing };
  };

  let searchFilter = null;

  const openSearch = () => {
    searchFilter = null;
    const el = $('#search-overlay');
    el.classList.remove('hidden');
    const inp = $('#search-input');
    inp.value = '';
    inp.focus();
    renderSearchChips();
    renderSearchResults();
  };

  const closeSearch = () => {
    $('#search-overlay').classList.add('hidden');
    searchFilter = null;
  };

  const renderSearchChips = () => {
    const types = ['hike', 'drive', 'food', 'lodging', 'experience', 'sightseeing', 'activity', 'rest', 'booking', 'packing'];
    $('#search-chips').innerHTML = types.map(t => `
      <button data-search-chip="${t}" class="shrink-0 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest font-bold whitespace-nowrap ${searchFilter === t ? 'terracotta-glow text-on-primary-container' : 'bg-surface-container text-on-surface-variant'} active:scale-95 transition-transform">
        <span class="material-symbols-outlined text-[14px] align-middle mr-0.5">${t === 'booking' ? 'confirmation_number' : t === 'packing' ? 'inventory_2' : iconFor(t)}</span>
        ${t}
      </button>
    `).join('');
  };

  const renderSearchResults = () => {
    const q = ($('#search-input')?.value || '');
    const { activities, bookings, packing } = searchTrip(q, searchFilter);
    const container = $('#search-results');

    if (!q && !searchFilter) {
      container.innerHTML = `<p class="text-center text-on-surface-variant text-sm pt-16">Type to search or tap a category above</p>`;
      return;
    }

    const total = activities.length + bookings.length + packing.length;
    if (!total) {
      container.innerHTML = `<p class="text-center text-on-surface-variant text-sm pt-16">No results for "${h(q)}"</p>`;
      return;
    }

    let html = '';

    if (activities.length) {
      html += `<p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mt-4 mb-2">Activities (${activities.length})</p>`;
      html += `<div class="space-y-2">`;
      for (const a of activities) {
        const done = a.status === 'done';
        html += `
          <button data-search-act="${a.id}" data-search-day="${a._dayNumber}" class="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-surface-container active:scale-[0.99] transition-transform">
            <span class="material-symbols-outlined ${done ? 'text-tertiary' : 'text-on-surface-variant'}">${iconFor(a.type)}</span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold truncate ${done ? 'line-through text-on-surface-variant/60' : ''}">${h(a.title)}</p>
              <p class="text-[11px] text-on-surface-variant truncate">Day ${a._dayNumber} • ${fmtTime12(a.time)}${a.description ? ` • ${h(a.description).slice(0, 50)}` : ''}</p>
            </div>
            ${a.highlight ? `<span class="material-symbols-outlined text-sm text-tertiary fill-icon">star</span>` : ''}
          </button>`;
      }
      html += `</div>`;
    }

    if (bookings.length) {
      html += `<p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mt-6 mb-2">Bookings (${bookings.length})</p>`;
      html += `<div class="space-y-2">`;
      for (const b of bookings) {
        html += `
          <button data-search-booking="${b.id}" class="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-surface-container active:scale-[0.99] transition-transform">
            <span class="material-symbols-outlined text-on-surface-variant">${b.type === 'lodging' ? 'hotel' : 'local_activity'}</span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold truncate">${h(b.name)}</p>
              <p class="text-[11px] text-on-surface-variant truncate">${b.confirmationNumber ? `#${h(b.confirmationNumber)}` : ''} ${b.address ? `• ${h(b.address).slice(0, 40)}` : ''}</p>
            </div>
          </button>`;
      }
      html += `</div>`;
    }

    if (packing.length) {
      html += `<p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mt-6 mb-2">Packing (${packing.length})</p>`;
      html += `<div class="space-y-2">`;
      for (const p of packing) {
        html += `
          <button data-search-pack="${p.id}" class="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-surface-container active:scale-[0.99] transition-transform">
            <span class="material-symbols-outlined ${p.packed ? 'text-tertiary fill-icon' : 'text-on-surface-variant'}">${p.packed ? 'check_circle' : 'radio_button_unchecked'}</span>
            <div class="min-w-0 flex-1">
              <p class="text-sm ${p.packed ? 'line-through text-on-surface-variant/60' : ''}">${h(p.item)}</p>
              <p class="text-[11px] text-on-surface-variant">${h(p.category)}</p>
            </div>
          </button>`;
      }
      html += `</div>`;
    }

    container.innerHTML = html;
  };

  // ---------- Event delegation ----------
  document.addEventListener('click', async (e) => {
    if (e.target.closest('#fab-journal')) {
      openModal(`
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-2xl">edit_note</span>
            <h3 class="font-headline font-bold text-lg">Quick Note</h3>
          </div>
          <textarea id="fab-note" rows="4" placeholder="Tip, memory, something to remember for next trip…" class="w-full bg-surface-container-low text-on-surface p-3 rounded-xl resize-none outline-none focus:ring-2 focus:ring-primary/60 text-sm" autofocus></textarea>
          <div class="grid grid-cols-2 gap-3">
            <button id="fab-cancel" class="py-3 rounded-xl bg-surface-container-low text-on-surface-variant font-semibold text-xs uppercase tracking-widest active:scale-95 transition-transform">Cancel</button>
            <button id="fab-save" class="py-3 rounded-xl terracotta-glow text-on-primary-container font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform">Save</button>
          </div>
        </div>
      `);
      $('#fab-cancel').onclick = closeModal;
      $('#fab-save').onclick = async () => {
        const t = $('#fab-note').value;
        if (t.trim()) { await addJournalEntry(t); closeModal(); toast('Note saved'); render(); }
      };
      return;
    }

    if (e.target.closest('#btn-theme')) {
      const next = getTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      const icon = e.target.closest('#btn-theme').querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = next === 'dark' ? 'light_mode' : 'dark_mode';
      return;
    }

    if (e.target.closest('#btn-collapse')) {
      state.hideCompleted = !state.hideCompleted;
      render();
      return;
    }

    if (e.target.closest('#btn-expense-add')) { promptExpenseEntry(); return; }

    const delExpense = e.target.closest('[data-del-expense]');
    if (delExpense) { deleteExpenseEntry(delExpense.dataset.delExpense); render(); return; }

    const weatherBtn = e.target.closest('[data-refresh-weather]');
    if (weatherBtn) { refreshWeather(Number(weatherBtn.dataset.refreshWeather)); return; }

    const lateBtn = e.target.closest('[data-late]');
    if (lateBtn) {
      const delta = Number(lateBtn.dataset.late);
      const dayIdx = currentDayIdx();
      const day = state.trip.days[dayIdx];
      const pending = day.activities.filter(a => a.status === 'pending');
      pending.forEach(a => { a.time = shiftTime(a.time, delta); });
      saveTrip();
      toast(`Shifted ${pending.length} activities +${delta} min`);
      render();
      return;
    }

    if (e.target.closest('#btn-search') || e.target.closest('#home-search')) { openSearch(); return; }
    if (e.target.closest('#search-close')) { closeSearch(); return; }

    const alertAct = e.target.closest('[data-alert-act]');
    if (alertAct) {
      const { day } = findActivity(alertAct.dataset.alertAct);
      location.hash = `#/day/${day.dayNumber}`;
      return;
    }

    const chip = e.target.closest('[data-search-chip]');
    if (chip) {
      const v = chip.dataset.searchChip;
      searchFilter = searchFilter === v ? null : v;
      renderSearchChips();
      renderSearchResults();
      return;
    }

    const searchAct = e.target.closest('[data-search-act]');
    if (searchAct) {
      closeSearch();
      location.hash = `#/day/${searchAct.dataset.searchDay}`;
      return;
    }

    const searchBooking = e.target.closest('[data-search-booking]');
    if (searchBooking) {
      closeSearch();
      sessionStorage.setItem('focus-booking', searchBooking.dataset.searchBooking);
      location.hash = '#/bookings';
      return;
    }

    const searchPack = e.target.closest('[data-search-pack]');
    if (searchPack) {
      const it = state.trip.packingList.find(p => p.id === searchPack.dataset.searchPack);
      if (it) { it.packed = !it.packed; saveTrip(); renderSearchResults(); }
      return;
    }

    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) { copyText(copyBtn.dataset.copy); return; }

    const timeShift = e.target.closest('[data-time-shift]');
    if (timeShift) { promptTimeShift(timeShift.dataset.timeShift); return; }

    const bookmarkBtn = e.target.closest('[data-bookmark]');
    if (bookmarkBtn) {
      toggleBookmark(bookmarkBtn.dataset.bookmark);
      render();
      return;
    }

    const recapBtn = e.target.closest('[data-share-recap]');
    if (recapBtn) {
      const dayNum = Number(recapBtn.dataset.shareRecap);
      const day = state.trip.days.find(d => d.dayNumber === dayNum);
      if (day) {
        const txt = generateDayRecap(day);
        if (txt) {
          if (navigator.share) navigator.share({ title: `Day ${dayNum} Recap`, text: txt }).catch(() => {});
          else copyText(txt);
        }
      }
      return;
    }

    const shareAct2 = e.target.closest('[data-share-act]');
    if (shareAct2) {
      const found = findActivity(shareAct2.dataset.shareAct);
      if (found) {
        const txt = activityToText(found.activity, found.day);
        if (navigator.share) navigator.share({ title: found.activity.title, text: txt }).catch(() => {});
        else copyText(txt);
      }
      return;
    }

    const detailCard = e.target.closest('[data-detail]');
    if (detailCard && !e.target.closest('button') && !e.target.closest('a')) {
      showActivityDetail(detailCard.dataset.detail);
      return;
    }

    const checkBtn = e.target.closest('[data-check]');
    if (checkBtn) { promptCheckoff(checkBtn.dataset.check); return; }

    const homeAct = e.target.closest('[data-home-act]');
    if (homeAct && !e.target.closest('button[data-check]')) {
      const { day } = findActivity(homeAct.dataset.homeAct);
      location.hash = `#/day/${day.dayNumber}`;
      return;
    }

    const pack = e.target.closest('[data-pack]');
    if (pack) {
      const it = state.trip.packingList.find(p => p.id === pack.dataset.pack);
      if (it) { it.packed = !it.packed; saveTrip(); render(); }
      return;
    }

    if (false) { /* share handled above */ return;
    }

    const focusBooking = e.target.closest('[data-focus-booking]');
    if (focusBooking) { sessionStorage.setItem('focus-booking', focusBooking.dataset.focusBooking); return; }

    if (e.target.closest('#btn-journal-add')) {
      const inp = $('#journal-input');
      if (inp && inp.value.trim()) { await addJournalEntry(inp.value); render(); }
      return;
    }

    const delJournal = e.target.closest('[data-del-journal]');
    if (delJournal) { deleteJournalEntry(delJournal.dataset.delJournal); render(); return; }

    const delGas = e.target.closest('[data-del-gas]');
    if (delGas) { deleteGasEntry(delGas.dataset.delGas); render(); return; }

    if (e.target.closest('#btn-gas-add') || e.target.closest('#btn-gas-add-dash')) { promptGasEntry(); return; }
    if (e.target.closest('#btn-expense-add-dash')) { promptExpenseEntry(); return; }

    if (e.target.closest('#btn-export')) { exportTrip(); return; }
    if (e.target.closest('#btn-import')) { $('#file-import').click(); return; }
    if (e.target.closest('#btn-reset')) { resetTrip(); return; }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'search-input') renderSearchResults();
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'file-import' && e.target.files[0]) {
      importTrip(e.target.files[0]);
      e.target.value = '';
    }
  });

  document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape' && !$('#search-overlay').classList.contains('hidden')) closeSearch();
    if (e.key === 'Enter' && e.target.id === 'journal-input') {
      if (e.target.value.trim()) { await addJournalEntry(e.target.value); render(); }
    }
  });

  // ---------- Dark/light mode ----------
  const getTheme = () => localStorage.getItem('tripdna.theme') || 'dark';
  const applyTheme = (theme) => {
    localStorage.setItem('tripdna.theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.body.style.background = theme === 'dark' ? '#131313' : '#f5f0eb';
    document.body.style.color = theme === 'dark' ? '#e5e2e1' : '#1c1b1b';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#131313' : '#f5f0eb';
  };
  applyTheme(getTheme());
  window.addEventListener('load', () => {
    const btn = $('#btn-theme');
    if (btn) {
      const icon = btn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = getTheme() === 'dark' ? 'light_mode' : 'dark_mode';
    }
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('load', render);
})();
