const $ = s => document.querySelector(s);
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const state = {
  token: localStorage.token,
  user: JSON.parse(localStorage.user || 'null'),
  page: 'dashboard',
  slideDir: 'next',
  heroIdx: 0,
  heroSlides: [],
  reg: false,
  days: [],
  budget: 0,
  newAvatar: null
};

async function api(path, method = 'GET', body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.token }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opts);
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && state.token) return logout();
  if (!r.ok) {
    toast(d.error || 'Terjadi kesalahan.', 'bad');
    throw new Error(d.error || 'Error');
  }
  return d;
}

function toast(m, t = 'info') {
  const d = document.createElement('div');
  d.className = 'toast ' + t;
  d.textContent = m;
  $('#toasts').append(d);
  setTimeout(() => {
    d.classList.add('out');
    setTimeout(() => d.remove(), 300);
  }, 3500);
}

function logout() {
  localStorage.clear();
  location.reload();
}

function ask(title, fields) {
  return new Promise(res => {
    const d = document.createElement('dialog');
    const buildInput = f => {
      if (f.checks) {
        const items = f.checks.map(c =>
          '<label class="chk"><input type="checkbox" name="' + f.name + '" value="' + c[0] + '"> ' + esc(c[1]) + '</label>'
        ).join('');
        return '<div class="checks">' + items + '</div>';
      }
      if (f.options) {
        const opts = f.options.map(o =>
          '<option value="' + o[0] + '">' + o[1] + '</option>'
        ).join('');
        return '<select name="' + f.name + '">' + opts + '</select>';
      }
      const typ = f.type || 'text';
      const val = f.value != null ? f.value : '';
      return '<input name="' + f.name + '" type="' + typ + '" value="' + val + '">';
    };
    const fieldsHtml = fields.map(f => '<label>' + f.label + '</label>' + buildInput(f)).join('');
    d.innerHTML = '<h2>' + title + '</h2>' + fieldsHtml +
      '<div class="row" style="margin-top:22px;justify-content:flex-end">' +
      '<button class="btn" value="x">Batal</button>' +
      '<button class="btn primary" value="ok">Simpan</button>' +
      '</div>';
    document.body.append(d);
    d.showModal();
    d.onclick = e => {
      if (e.target.tagName !== 'BUTTON') return;
      const o = {};
      d.querySelectorAll('input:not([type=checkbox]),select').forEach(i => { o[i.name] = i.value; });
      fields.filter(f => f.checks).forEach(f => {
        o[f.name] = [...d.querySelectorAll('input[name="' + f.name + '"]:checked')].map(i => i.value);
      });
      d.remove();
      res(e.target.value === 'ok' ? o : null);
    };
  });
}

const head = (t, btn) => '<div class="pagehead"><h2>' + t + '</h2>' + (btn || '') + '</div>';

// ---------- Auth ----------
function showAuth() {
  $('#regFields').classList.toggle('hidden', !state.reg);
  $('#authTitle').textContent = state.reg ? 'Buat akun baru' : 'Masuk ke akunmu';
  $('#authBtn').textContent = state.reg ? 'Daftar ke Kostly' : 'Masuk ke Kostly';
  $('#authSwitchText').textContent = state.reg ? 'Sudah punya akun?' : 'Belum memiliki akun?';
  $('#authSwitch').textContent = state.reg ? 'Masuk' : 'Daftar sekarang';
}
$('#authSwitch').onclick = e => { e.preventDefault(); state.reg = !state.reg; showAuth(); };
$('#authBtn').onclick = async () => {
  const body = {
    email: $('#aEmail').value,
    password: $('#aPass').value,
    name: $('#aName').value,
    room: $('#aRoom').value
  };
  const r = await fetch('/api/' + (state.reg ? 'register' : 'login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (!r.ok) return ($('#authErr').textContent = d.error);
  if (state.reg) {
    state.reg = false;
    showAuth();
    $('#authErr').textContent = '';
    return toast('Akun berhasil dibuat. Silakan masuk.', 'ok');
  }
  localStorage.token = state.token = d.token;
  localStorage.user = JSON.stringify(state.user = d.user);
  boot();
};
$('#logout').onclick = e => { e.preventDefault(); confirmLogout(); };

// ---------- Hero Banner Slider ----------
let heroTimer;
window.setHeroSlide = idx => {
  if (!state.heroSlides.length) return;
  state.heroIdx = (idx + state.heroSlides.length) % state.heroSlides.length;
  const s = state.heroSlides[state.heroIdx];
  const box = $('#heroSlideBox');
  if (!box) return;
  box.innerHTML =
    '<div class="hero-slide-content">' +
      '<div><span class="hero-slide-tag">' + s.tag + '</span><h3>' + s.title + '</h3><p>' + s.desc + '</p>' +
      '<button class="btn white-pill" onclick="goto(\'' + s.page + '\')">' + s.cta + '</button></div>' +
      '<div class="hero-slide-visual">' + s.icon + '</div>' +
    '</div>';
  document.querySelectorAll('.slider-dot').forEach((d, i) => d.classList.toggle('active', i === state.heroIdx));
};
function startHeroSlider() {
  clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    if (state.page === 'dashboard' && $('#heroSlideBox')) setHeroSlide(state.heroIdx + 1);
  }, 5000);
}

// ---------- Halaman ----------
const pages = {
  async dashboard() {
    const [f, bills, st, lau, ch] = await Promise.all(
      ['/finance', '/bills', '/stock/status', '/laundry', '/chores'].map(p => api(p))
    );
    const owed = bills.flatMap(b => b.shares).filter(s => s.status !== 'paid').length;
    const act = lau.find(l => !l.done && l.user_id === state.user.id);
    const actItem = esc(act ? (act.item || 'Laundry') : '');
    const pendingChores = ch.filter(c => !c.done).length;

    state.heroSlides = [
      { tag: 'Ringkasan Keuangan', title: 'Sisa Budget ' + rp(f.remaining), desc: 'Terpakai ' + rp(f.spent) + ' dari budget bulanan ' + rp(f.budget) + '.', cta: 'Kelola Keuangan →', page: 'keuangan', icon: '🌿' },
      { tag: 'Status Laundry', title: act ? 'Ambil ' + fmtDT(act.pickup_at) : 'Tidak Ada Cucian Aktif', desc: act ? 'Cucian "' + actItem + '" sedang diproses.' : 'Catat jadwal laundry kamu agar tidak lupa diambil.', cta: 'Buka Laundry →', page: 'laundry', icon: '🧺' },
      { tag: 'Patungan & Piket Kos', title: owed + ' Patungan · ' + pendingChores + ' Piket Hari Ini', desc: st.names.length ? 'Perhatian stok: ' + esc(st.names.join(', ')) + '.' : 'Semua persediaan harian kos dalam kondisi aman.', cta: 'Cek Split Bill →', page: 'split', icon: '🏡' }
    ];
    state.heroIdx = 0;
    const s0 = state.heroSlides[0];
    const pct = Math.min(100, f.budget ? f.spent / f.budget * 100 : 0);
    const stockSub = st.names.length ? esc(st.names.join(', ')) : 'Semua persediaan cukup';
    const dotsHtml = state.heroSlides.map((_, i) =>
      '<button class="slider-dot ' + (i === 0 ? 'active' : '') + '" onclick="setHeroSlide(' + i + ')"></button>'
    ).join('');
    const choreRows = ch.map(c =>
      '<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span>' +
      (c.done ? '✅' : '⬜') + ' <b>' + esc(c.title) + '</b></span><span class="tag ' +
      (c.done ? 'ok' : 'warn') + '">' + esc(c.user_name || '-') + '</span></div>'
    ).join('');

    return [
      '<div class="pagehead">',
        '<div><h2>Halo, ' + esc(state.user.name) + '! 👋</h2><p class="muted">Semua aktivitas dan kebutuhan kos kamu dalam satu tampilan bersih</p></div>',
        '<button class="btn primary" onclick="addTx()">+ Catat Pengeluaran</button>',
      '</div>',
      '<div class="hero-banner">',
        '<div id="heroSlideBox"><div class="hero-slide-content">',
          '<div><span class="hero-slide-tag">' + s0.tag + '</span><h3>' + s0.title + '</h3><p>' + s0.desc + '</p><button class="btn white-pill" onclick="goto(\'' + s0.page + '\')">' + s0.cta + '</button></div>',
          '<div class="hero-slide-visual">' + s0.icon + '</div>',
        '</div></div>',
        '<div class="slider-dots">' + dotsHtml + '</div>',
      '</div>',
      '<div class="grid g4">',
        '<div class="card stat clickable" onclick="goto(\'keuangan\')"><div class="l">Sisa Budget Bulan Ini</div><div class="v" data-n="' + f.remaining + '" data-rp>' + rp(f.remaining) + '</div><div class="bar"><i style="width:' + pct + '%"></i></div></div>',
        '<div class="card stat clickable" onclick="goto(\'split\')"><div class="l">Tagihan Belum Lunas</div><div class="v" data-n="' + owed + '">' + owed + '</div><div class="l">patungan aktif</div></div>',
        '<div class="card stat clickable" onclick="goto(\'laundry\')"><div class="l">Laundry Kamu</div><div class="v" style="font-size:19px">' + (act ? 'Ambil ' + fmtDT(act.pickup_at) : 'Tidak ada cucian') + '</div><div class="l">' + (act ? actItem : 'Klik untuk catat baru') + '</div></div>',
        '<div class="card stat clickable" onclick="goto(\'stok\')"><div class="l">Status Stok Kos</div><div class="v c-' + st.level + '">' + st.label + '</div><div class="l">' + stockSub + '</div></div>',
      '</div>',
      '<div class="card">',
        '<div class="row"><p class="title">JADWAL PIKET HARI INI</p><button class="btn sm" onclick="goto(\'roommate\')">Lihat Semua</button></div>',
        (choreRows || '<p class="muted">Belum ada jadwal piket hari ini.</p>'),
      '</div>'
    ].join('');
  },

  async keuangan() {
    const f = await api('/finance');
    state.days = f.days;
    const max = Math.max(...f.days.map(d => d.total), 1);
    const k = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'jt' : n >= 1000 ? Math.round(n / 1000) + 'rb' : n;
    state.budget = f.budget;
    const barsHtml = f.days.map((d, i) =>
      '<div class="col" onclick="pickDay(' + i + ')"><span class="amt">' + (d.total ? k(d.total) : '') +
      '</span><i style="height:' + (d.total / max * 115) + 'px"></i><span class="small muted">' + d.short + '<br>' + d.day + '</span></div>'
    ).join('');
    const catRows = f.byCategory.map(c =>
      '<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span>' + esc(c.category) +
      '</span><span class="tag info">' + (f.spent ? Math.round(c.total / f.spent * 100) : 0) + '%</span></div>'
    ).join('');
    const txRows = f.transactions.map(t =>
      '<tr><td><b>' + esc(t.item) + '</b></td><td>' + utcDT(t.created_at) +
      '</td><td><span class="tag ' + catClass(t.category) + '">' + esc(t.category) +
      '</span></td><td><b>-' + rp(t.amount) + '</b></td><td><button class="btn sm" onclick="delTx(' + t.id + ')">Hapus</button></td></tr>'
    ).join('');

    return head('Keuangan & Budget', '<div class="row"><button class="btn" onclick="addIncome()">+ Pemasukan</button><button class="btn" onclick="editBudget()">Edit Budget</button><button class="btn primary" onclick="addTx()">+ Pengeluaran</button></div>') + [
      '<div class="grid g3">',
        '<div class="card stat"><div class="l">Sisa Budget Bulan Ini</div><div class="v" data-n="' + f.remaining + '" data-rp>' + rp(f.remaining) + '</div></div>',
        '<div class="card stat"><div class="l">Total Pengeluaran</div><div class="v" data-n="' + f.spent + '" data-rp>' + rp(f.spent) + '</div><div class="l">Dari budget ' + rp(f.budget) + '</div></div>',
        '<div class="card stat"><div class="l">Persentase Terpakai</div><div class="v">' + (f.budget ? Math.round(f.spent / f.budget * 100) : 0) + '%</div></div>',
      '</div>',
      '<div class="grid g2">',
        '<div class="card"><p class="title">PENGELUARAN 7 HARI TERAKHIR <span class="muted">· klik batang grafik</span></p>',
          '<div class="chart">' + barsHtml + '</div>',
          '<div id="dayDetail" class="daydetail"></div></div>',
        '<div class="card"><p class="title">ALOKASI KATEGORI</p>' + (catRows || '<p class="muted">Belum ada data.</p>') + '</div>',
      '</div>',
      '<div class="card"><p class="title">RIWAYAT TRANSAKSI TERAKHIR</p><table><tr><th>Item</th><th>Waktu</th><th>Kategori</th><th>Nominal</th><th></th></tr>',
        (txRows || '<tr><td colspan="5" class="muted">Belum ada transaksi.</td></tr>') + '</table></div>'
    ].join('');
  },

  async split() {
    const bills = await api('/bills');
    const me = state.user.id;
    const mineOf = b => b.owner_id === me;
    const per = b => b.amount / (b.owner_id ? b.shares.length + 1 : b.shares.length);
    const piutang = bills.filter(mineOf).reduce((t, b) => t + b.shares.filter(s => s.status !== 'paid').length * per(b), 0);
    const utang = bills.reduce((t, b) => t + b.shares.filter(s => s.user_id === me && s.status !== 'paid').length * per(b), 0);
    const waiting = bills.filter(mineOf).reduce((t, b) => t + b.shares.filter(s => s.status === 'pending').length, 0);
    const lbl = { unpaid: 'Belum bayar', pending: 'Menunggu konfirmasi', paid: 'Lunas' };

    const billCards = bills.map(b => {
      const mine = mineOf(b);
      const canConfirm = mine ? true : (!b.owner_id && state.user.role === 'admin');
      const ownerTxt = b.owner_name ? ' · ditalangi ' + (mine ? 'kamu' : esc(b.owner_name)) : '';
      const shareRows = b.shares.map(s => {
        const payBtn = (s.user_id === me && s.status === 'unpaid')
          ? '<button class="btn sm" onclick="setShare(' + s.id + ',\'pending\')">Sudah bayar</button>' : '';
        const confBtn = (canConfirm && s.status !== 'paid')
          ? '<button class="btn sm primary" onclick="setShare(' + s.id + ',\'paid\')">Konfirmasi</button>' : '';
        return '<div class="row" style="gap:10px;margin:4px 0;justify-content:flex-end"><span class="tag ' + s.status + '">' +
          esc(s.name) + ' · ' + rp(per(b)) + ' · ' + lbl[s.status] + '</span>' + payBtn + confBtn + '</div>';
      }).join('');
      const remBtn = mine ? '<button class="btn sm primary" onclick="remind(' + b.id + ')">Kirim Reminder</button>' : '';
      return '<div class="card row" style="margin-bottom:14px;flex-wrap:wrap">' +
        '<div><b style="font-size:16px">' + esc(b.title) + '</b><p class="muted" style="margin:4px 0 0">Total ' + rp(b.amount) + ' · <b>' + rp(per(b)) + ' / orang</b>' + ownerTxt + '</p></div>' +
        '<div>' + shareRows + '</div>' + remBtn + '</div>';
    }).join('');

    return head('Split Bill & Patungan', '<button class="btn primary" onclick="addBill()">+ Buat Split Bill</button>') + [
      '<div class="grid g3">',
        '<div class="card stat"><div class="l">Piutang Kamu</div><div class="v" data-n="' + piutang + '" data-rp>' + rp(piutang) + '</div><div class="l">Belum dibayar teman</div></div>',
        '<div class="card stat"><div class="l">Utang Kamu</div><div class="v" data-n="' + utang + '" data-rp>' + rp(utang) + '</div><div class="l">Ke teman yang menalangi</div></div>',
        '<div class="card stat"><div class="l">Perlu Konfirmasi</div><div class="v c-low" data-n="' + waiting + '">' + waiting + '</div><div class="l">Pembayaran masuk</div></div>',
      '</div>',
      (billCards || '<div class="card"><p class="muted">Belum ada tagihan patungan.</p></div>')
    ].join('');
  },

  async stok() {
    const st = await api('/stock');
    const low = st.filter(s => s.qty <= s.min_qty);
    const alertHtml = low.length
      ? '<div class="alert">⚠ ' + low.map(s => s.name + ' (' + s.qty + ' ' + s.unit + ')').join(', ') + ' hampir habis. Segera belanja!</div>'
      : '';
    const stockRows = st.map(s =>
      '<tr id="stk-' + s.id + '"><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.category) +
      '</td><td><button class="btn sm" onclick="qty(' + s.id + ',-1)">-</button> <b style="margin:0 8px">' + s.qty + ' ' + esc(s.unit) +
      '</b> <button class="btn sm" onclick="qty(' + s.id + ',1)">+</button></td><td><span class="tag ' +
      (s.qty <= s.min_qty ? 'low' : 'ok') + '">' + (s.qty <= s.min_qty ? 'Menipis' : 'Aman') +
      '</span></td><td><button class="btn sm" onclick="delStock(' + s.id + ')">Hapus</button></td></tr>'
    ).join('');

    return head('Stok Harian Kos', '<button class="btn primary" onclick="addStock()">+ Tambah Stok</button>') + alertHtml + [
      '<div class="grid g3"><div class="card stat"><div class="l">Total Jenis Barang</div><div class="v">' + st.length + '</div></div>',
        '<div class="card stat"><div class="l">Stok Menipis</div><div class="v c-low">' + low.length + '</div></div>',
        '<div class="card stat"><div class="l">Stok Aman</div><div class="v c-ok">' + (st.length - low.length) + '</div></div></div>',
      '<div class="card"><p class="title">DAFTAR PERSEDIAAN</p><table><tr><th>Barang</th><th>Kategori</th><th>Jumlah</th><th>Status</th><th></th></tr>',
        (stockRows || '<tr><td colspan="5" class="muted">Belum ada data stok.</td></tr>') + '</table></div>'
    ].join('');
  },

  async laundry() {
    const l = await api('/laundry');
    const now = Date.now();
    const mine = l.filter(x => x.user_id === state.user.id && !x.done);
    const ready = mine.filter(x => new Date(x.pickup_at) <= now).length;
    const laundryRows = l.map(x => {
      const rd = new Date(x.pickup_at) <= now;
      const itemName = esc(x.item || 'Laundry');
      const canEdit = x.user_id === state.user.id ? true : state.user.role === 'admin';
      const doneBtn = !x.done ? '<button class="btn sm primary" onclick="doneLaundry(' + x.id + ')">Sudah diambil</button> ' : '';
      const delBtn = '<button class="btn sm" onclick="delLaundry(' + x.id + ')">Hapus</button>';
      const actions = canEdit ? (doneBtn + delBtn) : '';
      const tagCls = x.done ? 'ok' : (rd ? 'warn' : 'info');
      const tagTxt = x.done ? 'Sudah diambil' : (rd ? 'Siap diambil' : 'Diproses');
      return '<tr><td><b>' + esc(x.user_name) + '</b></td><td>' + itemName + '</td><td>' +
        fmtDT(x.drop_at) + '</td><td>' + fmtDT(x.pickup_at) + '</td><td><span class="tag ' +
        tagCls + '">' + tagTxt + '</span></td><td>' + actions + '</td></tr>';
    }).join('');

    return head('Jadwal Laundry', '<button class="btn primary" onclick="addLaundry()">+ Catat Laundry</button>') + [
      '<div class="grid g3"><div class="card stat"><div class="l">Laundry Aktif Kamu</div><div class="v" data-n="' + mine.length + '">' + mine.length + '</div></div>',
        '<div class="card stat"><div class="l">Pengambilan Terdekat</div><div class="v" style="font-size:19px">' + (mine[0] ? fmtDT(mine[0].pickup_at) : '-') + '</div></div>',
        '<div class="card stat"><div class="l">Siap Diambil</div><div class="v c-ok" data-n="' + ready + '">' + ready + '</div></div></div>',
      '<div class="card"><p class="title">DAFTAR LAUNDRY KOS</p><table><tr><th>Pemilik</th><th>Cucian</th><th>Dititipkan</th><th>Bisa Diambil</th><th>Status</th><th></th></tr>',
        (laundryRows || '<tr><td colspan="6" class="muted">Belum ada catatan laundry.</td></tr>') + '</table></div>'
    ].join('');
  },

  async profil() {
    const me = await api('/me');
    return [
      '<div class="pagehead"><h2>Profil Saya</h2></div>',
      '<div class="card profile"><div class="avatar-wrap"><img id="pAvatar" class="avatar lg" src="' + avatarOf(me.name, me.avatar) + '" alt=""><label class="btn sm clickable">Ganti Foto<input type="file" id="pFile" accept="image/*" hidden></label></div>',
        '<div class="pform"><label>Nama Lengkap</label><input id="pName" value="' + esc(me.name) + '"><label>Email</label><input value="' + esc(me.email) + '" disabled><label>Kamar</label><input id="pRoom" value="' + esc(me.room) + '"><label>No. WhatsApp</label><input id="pPhone" value="' + esc(me.phone) + '">',
          '<p class="title" style="margin-top:24px">GANTI PASSWORD (OPSIONAL)</p><label>Password Lama</label><input id="pOld" type="password"><label>Password Baru</label><input id="pNew" type="password" placeholder="Minimal 8 karakter">',
          '<div class="row" style="margin-top:22px"><button class="btn primary" onclick="saveProfile()">Simpan Perubahan</button><button class="btn" onclick="confirmLogout()">Keluar</button></div></div></div>'
    ].join('');
  },

  async roommate() {
    const [ch, rules, users] = await Promise.all(['/chores', '/rules', '/users'].map(p => api(p)));
    const choreRows = ch.map(c =>
      '<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)"><label style="margin:0;color:var(--text);font-size:14px;cursor:pointer"><input type="checkbox" style="width:auto;margin-right:8px" ' +
      (c.done ? 'checked' : '') + ' onchange="toggleChore(' + c.id + ',this.checked)"> ' + esc(c.title) +
      ' <span class="muted">· ' + esc(c.user_name || '-') + ' ' + esc(c.room || '') + '</span></label><span class="tag ' +
      (c.done ? 'ok' : 'warn') + '">' + (c.done ? 'Selesai' : 'Belum') + '</span></div>'
    ).join('');
    const ruleRows = rules.map((r, i) => '<p style="margin:8px 0"><b>' + (i + 1) + '.</b> ' + esc(r.text) + '</p>').join('');
    const userRows = users.map(u =>
      '<tr><td><img class="avatar sm" src="' + avatarOf(u.name, u.avatar) + '"> <b>' + esc(u.name) +
      '</b> <span class="muted">' + esc(u.room || '') + '</span></td><td><span class="tag info">' + esc(u.role) + '</span></td></tr>'
    ).join('');

    return head('Roommate & Jadwal Piket', '<button class="btn primary" onclick="addChore()">+ Atur Piket Baru</button>') + [
      '<div class="card" style="margin-bottom:18px"><p class="title">JADWAL PIKET HARIAN</p>' + (choreRows || '<p class="muted">Belum ada jadwal piket hari ini.</p>') + '</div>',
      '<div class="card" style="margin-bottom:18px"><div class="row"><p class="title">ATURAN & CATATAN BERSAMA KOS</p><button class="btn sm" onclick="addRule()">+ Tambah Catatan</button></div>' + (ruleRows || '<p class="muted">Belum ada catatan aturan.</p>') + '</div>',
      '<div class="card"><p class="title">DAFTAR PENGHUNI KOS</p><table><tr><th>Nama & Kamar</th><th>Peran</th></tr>' + userRows + '</table></div>'
    ].join('');
  }
};

// ---------- Aksi ----------
const rerender = () => { render(); loadNotifs(); };
window.addTx = async () => { const v = await ask('Catat pengeluaran', [{ name: 'item', label: 'Item Pengeluaran' }, { name: 'amount', label: 'Nominal (Rp)', type: 'number' }, { name: 'category', label: 'Kategori', options: ['Makanan & Minuman', 'Tagihan Kos & Listrik', 'Kebutuhan Harian', 'Hiburan', 'Menabung'].map(x => [x, x]) }]); if (v) { v.amount = +v.amount; await api('/transactions', 'POST', v); toast('Pengeluaran dicatat ✔', 'ok'); rerender(); } };
window.delTx = async id => { await api('/transactions/' + id, 'DELETE'); rerender(); };
window.addBill = async () => {
  const us = (await api('/users')).filter(u => u.id !== state.user.id);
  if (!us.length) return toast('Belum ada teman lain yang terdaftar.', 'warn');
  const v = await ask('Split bill baru', [{ name: 'title', label: 'Judul Tagihan' }, { name: 'amount', label: 'Total nominal yang kamu talangi (Rp)', type: 'number' }, { name: 'friends', label: 'Dibagi dengan teman', checks: us.map(u => [u.id, u.name]) }]);
  if (!v) return;
  if (!v.friends.length) return toast('Pilih minimal satu teman.', 'warn');
  await api('/bills', 'POST', { title: v.title, amount: +v.amount, user_ids: v.friends.map(Number) });
  toast('Setiap orang membayar ' + rp(v.amount / (v.friends.length + 1)), 'ok'); rerender();
};
window.setShare = async (id, status) => { await api('/shares/' + id, 'PATCH', { status }); rerender(); };
window.remind = async id => toast((await api('/bills/' + id + '/remind', 'POST')).message, 'ok');
window.addStock = async () => { const v = await ask('Tambah stok barang', [{ name: 'name', label: 'Nama Barang' }, { name: 'category', label: 'Kategori' }, { name: 'qty', label: 'Jumlah', type: 'number' }, { name: 'unit', label: 'Satuan' }]); if (v) { v.qty = +v.qty; await api('/stock', 'POST', v); rerender(); } };
window.qty = async (id, delta) => { const r = await api('/stock/' + id, 'PATCH', { delta }); if (!r.removed) return rerender(); $('#stk-' + id)?.classList.add('vanish'); toast(r.name + ' habis', 'bad'); setTimeout(rerender, 600); };
window.delStock = async id => { await api('/stock/' + id, 'DELETE'); rerender(); };
window.addChore = async () => { const us = await api('/users'); const v = await ask('Atur piket baru', [{ name: 'title', label: 'Nama Tugas Piket' }, { name: 'user_id', label: 'Penanggung Jawab', options: us.map(u => [u.id, u.name]) }]); if (v) { await api('/chores', 'POST', { title: v.title, user_id: +v.user_id }); rerender(); } };
window.toggleChore = async (id, done) => { await api('/chores/' + id, 'PATCH', { done }).catch(() => {}); rerender(); };
window.addRule = async () => { const v = await ask('Tambah catatan / aturan kos', [{ name: 'text', label: 'Isi Aturan / Catatan' }]); if (v) { await api('/rules', 'POST', v); rerender(); } };

// ---------- Shell & Slide Navigasi ----------
const menu = [['dashboard', 'Dashboard', '⌂'], ['keuangan', 'Keuangan', '💳'], ['split', 'Split Bill', '🧾'], ['stok', 'Stok Harian', '📦'], ['laundry', 'Laundry', '🧺'], ['roommate', 'Roommate', '👥'], ['profil', 'Profil Saya', '👤']];
function navigateTo(nextPage) {
  const curIdx = menu.findIndex(m => m[0] === state.page), nextIdx = menu.findIndex(m => m[0] === nextPage);
  state.slideDir = nextIdx >= curIdx ? 'next' : 'prev';
  state.page = nextPage;
  render();
}
async function render() {
  $('#nav').innerHTML = menu.map(([k, l, ico]) =>
    '<a class="navlink ' + (k === state.page ? 'active' : '') + '" data-k="' + k + '"><span class="nav-ico">' + ico + '</span>' + l + '</a>'
  ).join('');
  $('#nav').querySelectorAll('a').forEach(a => { a.onclick = () => navigateTo(a.dataset.k); });
  const view = $('#view');
  view.classList.remove('dir-next', 'dir-prev');
  view.innerHTML = await pages[state.page]();
  void view.offsetWidth;
  view.classList.add('dir-' + state.slideDir);
  animate();
  if (state.page === 'keuangan' && state.days && state.days.length) pickDay(state.days.length - 1);
  if (state.page === 'dashboard') startHeroSlider();
}
function boot() {
  const logged = !!state.token;
  $('#auth').classList.toggle('hidden', logged);
  $('#app').classList.toggle('hidden', !logged);
  const tp = $('#todayPill');
  if (tp) tp.textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (logged) { $('#userName').textContent = state.user.name; $('#roleBadge').textContent = state.user.role; render(); startNotifs(); updateHeader(); } else showAuth();
}

// ---------- Animasi Angka & Notifikasi ----------
const ICON = { stock: '📦', laundry: '🧺', bill: '💸', chore: '🧹' };
let notifs = [], seen = null, pollId, justRead = new Set();
function animate() {
  document.querySelectorAll('#view .pagehead, #view .hero-banner, #view .card').forEach((e, i) => e.style.setProperty('--d', Math.min(i, 10) * 55 + 'ms'));
  document.querySelectorAll('#view [data-n]').forEach(el => {
    const to = +el.dataset.n, isRp = 'rp' in el.dataset, t0 = performance.now();
    (function tick(t) { const p = Math.min(1, (t - t0) / 800), v = Math.round(to * (1 - Math.pow(1 - p, 3))); el.textContent = isRp ? rp(v) : v; if (p < 1) requestAnimationFrame(tick); })(t0);
  });
}
async function loadNotifs() {
  if (!state.token) return;
  try { notifs = await api('/notifications'); } catch { return; }
  const unread = notifs.filter(x => !x.read), open = !$('#notifPanel').classList.contains('hidden');
  const b = $('#badge'); b.textContent = unread.length; b.classList.toggle('hidden', !unread.length || open);
  seen = new Set(notifs.map(x => x.id));
  if (open) { markRead(); drawNotifs(); }
}
function markRead() {
  const ids = notifs.filter(x => !x.read).map(x => x.id); if (!ids.length) return;
  ids.forEach(id => justRead.add(id)); notifs.forEach(x => x.read = true); $('#badge').classList.add('hidden');
  api('/notifications/read', 'POST', { ids }).catch(() => {});
}
function openNotif() { justRead = new Set(); $('#notifPanel').classList.remove('hidden'); markRead(); drawNotifs(); }
function closeNotif() { const p = $('#notifPanel'); if (p.classList.contains('hidden')) return; p.classList.add('hidden'); justRead = new Set(); loadNotifs(); }
function drawNotifs() {
  const rows = notifs.map(x => {
    const clickAttr = x.page ? ' onclick="goto(\'' + x.page + '\')"' : '';
    return '<div class="nitem ' + x.level + '"' + clickAttr + '><span>' + (ICON[x.type] || '🔔') + '</span><div><b>' + esc(x.title) + '</b><p class="muted">' + esc(x.text) + '</p></div></div>';
  }).join('');
  $('#notifPanel').innerHTML = '<div class="row ph"><b>Notifikasi</b></div>' + (rows || '<p class="muted" style="padding:16px">Tidak ada notifikasi 🎉</p>');
}
window.toggleNotif = () => $('#notifPanel').classList.contains('hidden') ? openNotif() : closeNotif();
window.goto = page => { closeNotif(); navigateTo(page); };
$('#bell').onclick = toggleNotif;
document.addEventListener('click', e => { if (!e.target.closest('#notifPanel,#bell,.clickable,dialog')) closeNotif(); });
function startNotifs() { seen = null; loadNotifs(); clearInterval(pollId); pollId = setInterval(loadNotifs, 30000); }

// ---------- Helper, Laundry, Profil ----------
const escMap = { '&': '\x26amp;', '<': '\x26lt;', '>': '\x26gt;', '"': '\x26quot;', "'": '\x26#39;' };
const esc = s => String(s == null ? '' : s).replace(/[\x26\x3c\x3e\x22\x27]/g, c => escMap[c]);
const avatarOf = (name, img) => {
  if (img) return img;
  const ch = esc((name || '?')[0].toUpperCase());
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#153b56"/><text x="32" y="42" font-size="28" font-weight="bold" text-anchor="middle" fill="#5ceee3" font-family="sans-serif">' + ch + '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
};
const fmtDT = s => new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
window.confirmLogout = () => { if (confirm('Yakin ingin keluar dari Kostly?')) logout(); };
async function updateHeader() { try { const me = await api('/me'); $('#userName').textContent = me.name; $('#hdrAvatar').src = avatarOf(me.name, me.avatar); } catch {} }
window.addLaundry = async () => {
  const v = await ask('Catat laundry', [{ name: 'item', label: 'Nama Cucian (opsional)' }, { name: 'drop_at', label: 'Waktu Dititipkan', type: 'datetime-local', value: localNow() }, { name: 'pickup_at', label: 'Bisa Diambil Pada', type: 'datetime-local' }]);
  if (!v) return;
  if (!v.drop_at || !v.pickup_at) return toast('Isi kedua waktu terlebih dahulu.', 'warn');
  await api('/laundry', 'POST', { item: v.item, drop_at: new Date(v.drop_at).toISOString(), pickup_at: new Date(v.pickup_at).toISOString() });
  toast('Laundry dicatat ✔', 'ok'); rerender();
};
window.doneLaundry = async id => { await api('/laundry/' + id, 'PATCH', {}); rerender(); };
window.delLaundry = async id => { await api('/laundry/' + id, 'DELETE'); rerender(); };
document.addEventListener('change', e => {
  if (e.target.id !== 'pFile' || !e.target.files[0]) return;
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'), s = Math.min(img.width, img.height); c.width = c.height = 256; c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256); state.newAvatar = c.toDataURL('image/jpeg', 0.85); $('#pAvatar').src = state.newAvatar; };
  img.src = URL.createObjectURL(e.target.files[0]);
});
window.saveProfile = async () => {
  const body = { name: $('#pName').value, room: $('#pRoom').value, phone: $('#pPhone').value, old_password: $('#pOld').value, new_password: $('#pNew').value };
  if (state.newAvatar) body.avatar = state.newAvatar;
  const d = await api('/me', 'PUT', body);
  localStorage.token = state.token = d.token; localStorage.user = JSON.stringify(state.user = d.user); state.newAvatar = null;
  toast('Profil berhasil diperbarui ✔', 'ok'); updateHeader(); render();
};
const catClass = c => c === 'Menabung' ? 'save' : String(c).startsWith('Investasi') ? 'invest' : 'ok';
const utcDT = s => {
  if (!s) return '-';
  let norm = String(s).trim().replace(' ', 'T');
  if (!/(Z|[+-]\d{2}(:?\d{2})?)$/i.test(norm)) norm += 'Z';
  const d = new Date(norm);
  return isNaN(d.getTime()) ? '-' : fmtDT(d);
};
window.pickDay = i => {
  const d = state.days && state.days[i];
  const box = $('#dayDetail');
  if (!d || !box) return;
  document.querySelectorAll('.chart .col').forEach((e, j) => e.classList.toggle('sel', j === i));
  const items = d.items.map(x =>
    '<div class="row small"><span>' + x.t.slice(0, 5) + ' · ' + esc(x.item) +
    ' <span class="tag ' + catClass(x.category) + '">' + esc(x.category) +
    '</span></span><span>-' + rp(x.amount) + '</span></div>'
  ).join('');
  box.innerHTML = '<div class="row"><span>Total pengeluaran <b>' + d.label + '</b></span><b class="big">' + rp(d.total) + '</b></div>' +
    (items || '<p class="muted small">Tidak ada pengeluaran di hari ini.</p>');
};
window.editBudget = async () => { const v = await ask('Edit budget bulanan', [{ name: 'budget', label: 'Total budget bulan ini (Rp)', type: 'number', value: state.budget }]); if (v) { await api('/budget', 'PUT', { budget: +v.budget }); toast('Budget diperbarui ✔', 'ok'); rerender(); } };
window.addIncome = async () => { const v = await ask('Tambah pemasukan', [{ name: 'add', label: 'Nominal pemasukan tambahan (Rp)', type: 'number' }]); if (v) { await api('/budget', 'PUT', { add: +v.add }); toast('Pemasukan ditambahkan ✔', 'ok'); rerender(); } };
boot();