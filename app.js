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
  const state = { trip: loadTrip() };

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
    const done = acts.filter(a => a.status === 'done').length;
    const miles = acts
      .filter(a => a.status === 'done' && a.distance)
      .reduce((s, a) => s + (parseFloat(String(a.distance).replace(/[^\d.]/g, '')) || 0), 0);
    return { total: acts.length, done, pct: acts.length ? Math.round(done / acts.length * 100) : 0, miles: Math.round(miles) };
  };

  const currentDayIdx = () => {
    const t = todayStr();
    const idx = state.trip.days.findIndex(d => d.date === t);
    if (idx !== -1) return idx;
    if (t < state.trip.startDate) return 0;
    return state.trip.days.length - 1;
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
    const alreadyDone = activity.status === 'done';
    openModal(`
      <div class="space-y-5">
        <div>
          <p class="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">${alreadyDone ? 'Edit memory' : 'Completing'}</p>
          <h3 class="font-headline font-bold text-xl mt-1">${h(activity.title)}</h3>
          <p class="text-sm text-on-surface-variant mt-1">${fmtTime12(activity.time)}${activity.duration ? ` • ${fmtDuration(activity.duration)}` : ''}</p>
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
          <button id="btn-skip" class="py-3 rounded-xl bg-surface-container-low text-on-surface-variant font-semibold text-xs uppercase tracking-widest active:scale-95 transition-transform">${alreadyDone ? 'Unmark' : 'Skip'}</button>
          <button id="btn-save" class="py-3 rounded-xl terracotta-glow text-on-primary-container font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform">${alreadyDone ? 'Save' : 'Mark Done'}</button>
        </div>
      </div>
    `);

    let pickedRating = rating;
    $('#rating-row').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rate]');
      if (!btn) return;
      pickedRating = Number(btn.dataset.rate);
      // re-render stars only
      $$('#rating-row [data-rate]').forEach(b => {
        const n = Number(b.dataset.rate);
        b.className = `flex-1 h-12 rounded-xl active:scale-95 transition-transform ${n <= pickedRating ? 'terracotta-glow text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'}`;
        const icon = b.querySelector('.material-symbols-outlined');
        icon.classList.toggle('fill-icon', n <= pickedRating);
      });
    });

    $('#btn-save').onclick = () => {
      activity.status = 'done';
      activity.checkedAt = new Date().toISOString();
      activity.rating = pickedRating || null;
      activity.notes = $('#note-field').value.trim();
      saveTrip();
      closeModal();
      toast(alreadyDone ? 'Updated' : 'Checked off ✓');
      render();
    };
    $('#btn-skip').onclick = () => {
      if (alreadyDone) {
        activity.status = 'pending';
        activity.checkedAt = null;
        activity.rating = null;
      } else {
        activity.status = 'skipped';
        activity.checkedAt = new Date().toISOString();
      }
      saveTrip();
      closeModal();
      toast(alreadyDone ? 'Unmarked' : 'Skipped');
      render();
    };
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

    return `
      <div class="fade-in space-y-8">
        <section class="space-y-1 pt-2">
          <p class="text-primary tracking-widest uppercase text-[10px] font-bold">Current Expedition</p>
          <h2 class="font-headline text-4xl font-extrabold tracking-tight leading-none">${h(trip.title)}</h2>
          <p class="text-on-surface-variant text-xs mt-2">${h(trip.subtitle)}</p>
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
        </section>

        <section class="space-y-5">
          <div class="flex items-center justify-between">
            <h3 class="font-headline text-xl font-bold tracking-tight">${isToday ? "Today's Timeline" : `Day ${day.dayNumber}`}</h3>
            <a href="#/day/${day.dayNumber}" class="text-primary text-xs font-bold uppercase tracking-widest flex items-center gap-1">View Day <span class="material-symbols-outlined text-sm">arrow_forward</span></a>
          </div>

          ${prevAct ? homeMiniCard(prevAct, 'done') : ''}
          ${nextAct ? homeNextCard(nextAct, whenLabel) : `<div class="bg-surface-container rounded-2xl p-5 text-center text-on-surface-variant text-sm">${postTrip ? 'Trip complete — open More to export your memories.' : 'All activities checked off for today 🌵'}</div>`}
          ${afterAct ? homeMiniCard(afterAct, 'later') : ''}
        </section>
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

        <!-- Weather -->
        ${day.weather ? `
          <div class="bg-surface-container rounded-2xl p-4 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 flex items-center justify-center bg-secondary-container rounded-full text-on-secondary-container">
                <span class="material-symbols-outlined fill-icon">wb_sunny</span>
              </div>
              <div>
                <p class="font-headline font-bold text-lg leading-tight">${day.weather.high}° / ${day.weather.low}°</p>
                <p class="text-on-surface-variant text-xs uppercase tracking-widest">${h(day.weather.condition || '')}</p>
              </div>
            </div>
            ${day.weather.rainChance ? `
              <div class="flex items-center gap-1 text-on-surface-variant">
                <span class="material-symbols-outlined text-sm">water_drop</span>
                <span class="text-sm font-semibold">${day.weather.rainChance}%</span>
              </div>` : ''}
          </div>` : ''}

        <!-- Timeline -->
        <div class="relative">
          <div class="absolute left-[27px] top-4 bottom-4 w-[2px] bg-surface-container-highest"></div>
          ${day.activities.map((a, i) => activityCard(a, i === firstPendingIdx, day)).join('')}
        </div>
      </div>
    `;
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

    return `
      <div class="relative flex gap-4 mb-6">
        <button class="relative z-10 active:scale-90 transition-transform" data-check="${a.id}" aria-label="Toggle ${h(a.title)}">${circle}</button>
        <div class="flex-1 min-w-0 ${bodyClasses}">
          <div class="${innerClass}">
            <div class="flex justify-between items-start gap-3 mb-2">
              <span class="text-primary-fixed-dim text-xs font-bold tracking-tight">${fmtTime12(a.time)}</span>
              <div class="flex items-center gap-2">
                ${a.highlight ? `<span class="text-[9px] font-bold uppercase tracking-widest text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-full">Highlight</span>` : ''}
                ${isNextUp ? `<span class="text-[9px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full">Next Up</span>` : ''}
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
                ${done && a.rating ? `<p class="text-xs text-tertiary mt-2">${'★'.repeat(a.rating)}${'☆'.repeat(5 - a.rating)}${a.notes ? ` — ${h(a.notes)}` : ''}</p>` : ''}

                ${(booking || a.location || a.description) ? `
                  <div class="mt-3 flex flex-wrap gap-2">
                    ${booking?.address || a.location?.address || a.location?.name ? `
                      <a href="https://maps.apple.com/?q=${encodeURIComponent(booking?.address || a.location?.address || a.location?.name)}" target="_blank" rel="noopener"
                         class="py-2 px-3 bg-secondary-container text-on-secondary-container text-[11px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-1.5">
                         <span class="material-symbols-outlined text-sm">map</span> Directions
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
                  </div>` : ''}
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
              <a href="https://maps.apple.com/?q=${encodeURIComponent(b.address)}" target="_blank" rel="noopener"
                 class="flex-1 py-2.5 bg-secondary-container text-on-secondary-container text-xs font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5">
                 <span class="material-symbols-outlined text-sm">map</span> Directions
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

    return `
      <div class="fade-in space-y-8 pt-2">
        <section>
          <p class="text-primary uppercase tracking-[0.2em] text-xs font-semibold mb-2">Trip Control</p>
          <h2 class="font-headline font-extrabold text-4xl tracking-tight">More</h2>
        </section>

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
              <li class="flex gap-2 text-sm text-on-surface-variant"><span class="text-primary">•</span><span>${h(p)}</span></li>
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

        <p class="text-center text-[10px] text-on-surface-variant/60 pt-2 pb-6">TripDNA v0.1 • offline-first</p>
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

  // ---------- Event delegation ----------
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) { copyText(copyBtn.dataset.copy); return; }

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

    const focusBooking = e.target.closest('[data-focus-booking]');
    if (focusBooking) { sessionStorage.setItem('focus-booking', focusBooking.dataset.focusBooking); return; }

    if (e.target.closest('#btn-export')) { exportTrip(); return; }
    if (e.target.closest('#btn-import')) { $('#file-import').click(); return; }
    if (e.target.closest('#btn-reset')) { resetTrip(); return; }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'file-import' && e.target.files[0]) {
      importTrip(e.target.files[0]);
      e.target.value = '';
    }
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('load', render);
})();
