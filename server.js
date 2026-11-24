require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'ganti-rahasia-ini';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const CATS = ['Makanan & Minuman', 'Tagihan Kos & Listrik', 'Kebutuhan Harian', 'Hiburan', 'Menabung'];
const clean = v => String(v || '').replace(/[<>&"'`]/g, '').trim().slice(0, 60);

const toValidDate = (val) => {
  if (!val) return null;
  const normalized = typeof val === 'string' ? val.replace(' ', 'T') : val;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
};

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const auth = (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesi berakhir, silakan masuk lagi.' });
  }
};
const today = () => new Date().toLocaleDateString('sv-SE');

// ---------- Auth ----------
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, room } = req.body;
    if (!name || !email || !password || password.length < 8)
      return res.status(400).json({ error: 'Lengkapi data. Password minimal 8 karakter.' });

    const { data: ex } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (ex) return res.status(409).json({ error: 'Email sudah terdaftar.' });

    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const role = count === 0 ? 'admin' : 'user';

    const { error } = await supabase.from('users').insert({
      name: clean(name), email, password: bcrypt.hashSync(password, 10), role, room: clean(room)
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { data: u, error } = await supabase.from('users').select('*').eq('email', req.body.email || '').maybeSingle();
    if (error) throw error;
    if (!u || !bcrypt.compareSync(req.body.password || '', u.password))
      return res.status(401).json({ error: 'Email atau password salah.' });

    const user = { id: u.id, name: u.name, role: u.role };
    res.json({ token: jwt.sign(user, SECRET, { expiresIn: '7d' }), user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users', auth, async (_, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id,name,email,role,room,phone,avatar').order('id');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Profil ----------
app.get('/api/me', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id,name,email,role,room,phone,avatar').eq('id', req.user.id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/me', auth, async (req, res) => {
  try {
    const { data: u, error: fErr } = await supabase.from('users').select('*').eq('id', req.user.id).single();
    if (fErr) throw fErr;

    const b = req.body, name = clean(b.name);
    if (!name) return res.status(400).json({ error: 'Nama tidak boleh kosong.' });

    let pass = u.password, avatar = u.avatar;
    if (b.new_password) {
      if (b.new_password.length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter.' });
      if (!bcrypt.compareSync(b.old_password || '', u.password)) return res.status(400).json({ error: 'Password lama salah.' });
      pass = bcrypt.hashSync(b.new_password, 10);
    }
    if (b.avatar !== undefined) {
      if (b.avatar.length > 400000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.avatar))
        return res.status(400).json({ error: 'Foto tidak valid atau terlalu besar.' });
      avatar = b.avatar;
    }

    const { error } = await supabase.from('users').update({ name, room: clean(b.room), phone: clean(b.phone), password: pass, avatar }).eq('id', u.id);
    if (error) throw error;

    const user = { id: u.id, name, role: u.role };
    res.json({ token: jwt.sign(user, SECRET, { expiresIn: '7d' }), user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Keuangan ----------
app.get('/api/finance', auth, async (req, res) => {
  try {
    const [{ data: setting }, { data: allTx, error }] = await Promise.all([
      supabase
        .from('settings')
        .select('value')
        .eq('key', 'monthly_budget')
        .eq('user_id', req.user.id)
        .maybeSingle(),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
    ]);
    if (error) throw error;

    const budget = +(setting?.value || 1250000);
    const txs = allTx || [];
    const month = new Date().toLocaleDateString('sv-SE').slice(0, 7);
    const monthTxs = txs.filter(t => {
      const d = toValidDate(t.created_at);
      return d && d.toLocaleDateString('sv-SE').startsWith(month);
    });
    const spent = monthTxs.reduce((s, t) => s + Number(t.amount || 0), 0);

    const catMap = {};
    monthTxs.forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount || 0); });
    const byCategory = Object.entries(catMap).map(([category, total]) => ({ category, total }));

    const rows = txs.map(r => {
      const dt = toValidDate(r.created_at);
      return {
        item: r.item,
        category: r.category,
        amount: Number(r.amount || 0),
        t: dt ? dt.toTimeString().slice(0, 8) : '-',
        d: dt ? dt.toLocaleDateString('sv-SE') : '-'
      };
    });

    const NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'], days = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 864e5), key = dt.toLocaleDateString('sv-SE'), items = rows.filter(r => r.d === key);
      days.push({ date: key, label: `${NAMES[dt.getDay()]}, ${dt.getDate()}/${dt.getMonth() + 1}`, short: NAMES[dt.getDay()], day: dt.getDate(), total: items.reduce((a, r) => a + r.amount, 0), items });
    }
    res.json({ budget, spent, remaining: budget - spent, byCategory, days, transactions: txs.slice(0, 50) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/transactions', auth, async (req, res) => {
  try {
    const { item, category, amount } = req.body;
    if (!item || !(Number(amount) > 0)) {
      return res.status(400).json({ error: 'Item dan nominal wajib diisi.' });
    }
    if (category && !CATS.includes(category)) {
      return res.status(400).json({ error: 'Kategori tidak valid.' });
    }

    const { error } = await supabase.from('transactions').insert({
      user_id: req.user.id,
      item: String(item).slice(0, 80),
      category: category || 'Kebutuhan Harian',
      amount: Number(amount),
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/transactions/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/budget', auth, async (req, res) => {
  try {
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'monthly_budget')
      .eq('user_id', req.user.id)
      .maybeSingle();
    const cur = +(setting?.value || 1250000);
    const v = req.body.add !== undefined ? cur + Number(req.body.add) : Number(req.body.budget);
    if (!Number.isFinite(v) || v < 0 || v > 1e12) return res.status(400).json({ error: 'Nominal budget tidak valid.' });

    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .eq('key', 'monthly_budget')
      .eq('user_id', req.user.id)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from('settings').update({ value: String(Math.round(v)) }).eq('id', existing.id)
      : await supabase.from('settings').insert({ user_id: req.user.id, key: 'monthly_budget', value: String(Math.round(v)) });
    if (error) throw error;
    res.json({ ok: true, budget: Math.round(v) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Split Bill ----------
app.get('/api/bills', auth, async (_, res) => {
  try {
    const [{ data: bills, error: bErr }, { data: shares, error: sErr }, { data: users, error: uErr }] = await Promise.all([
      supabase.from('bills').select('*').order('id', { ascending: false }),
      supabase.from('bill_shares').select('*'),
      supabase.from('users').select('id,name')
    ]);
    if (bErr || sErr || uErr) throw bErr || sErr || uErr;
    const uMap = Object.fromEntries((users || []).map(u => [u.id, u.name]));
    res.json((bills || []).map(b => ({
      ...b,
      owner_name: uMap[b.owner_id] || null,
      shares: (shares || []).filter(s => s.bill_id === b.id).map(s => ({ id: s.id, user_id: s.user_id, status: s.status, name: uMap[s.user_id] || 'User' }))
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bills', auth, async (req, res) => {
  try {
    const { amount } = req.body, title = clean(req.body.title);
    const { data: users } = await supabase.from('users').select('id');
    const valid = new Set((users || []).map(u => u.id));
    const ids = [...new Set((req.body.user_ids || []).map(Number))].filter(u => valid.has(u) && u !== req.user.id);
    if (!title || !(amount > 0) || !ids.length) return res.status(400).json({ error: 'Judul, nominal, dan minimal satu teman wajib diisi.' });

    const { data: bill, error: bErr } = await supabase.from('bills').insert({ title, amount, owner_id: req.user.id }).select().single();
    if (bErr) throw bErr;
    const { error: sErr } = await supabase.from('bill_shares').insert(ids.map(u => ({ bill_id: bill.id, user_id: u })));
    if (sErr) throw sErr;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/shares/:id', auth, async (req, res) => {
  try {
    const { data: s } = await supabase.from('bill_shares').select('*').eq('id', req.params.id).maybeSingle();
    if (!s) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' });
    const { data: b } = await supabase.from('bills').select('*').eq('id', s.bill_id).single();
    const { status } = req.body;
    if (status === 'pending') {
      if (s.user_id !== req.user.id) return res.status(403).json({ error: 'Hanya pemilik bagian yang bisa menandai sudah bayar.' });
    } else if (status === 'paid') {
      if (!(b.owner_id === req.user.id || (!b.owner_id && req.user.role === 'admin')))
        return res.status(403).json({ error: 'Hanya yang menalangi tagihan yang bisa mengonfirmasi pembayaran.' });
    } else return res.status(400).json({ error: 'Status tidak valid.' });

    const { error } = await supabase.from('bill_shares').update({ status }).eq('id', s.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bills/:id/remind', auth, (_, res) => res.json({ ok: true, message: 'Reminder terkirim.' }));

// ---------- Stok Harian ----------
app.get('/api/stock', auth, async (_, res) => {
  try {
    const { data, error } = await supabase.from('stock').select('*').order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stock/status', auth, async (_, res) => {
  try {
    const yesterday = new Date(Date.now() - 864e5).toISOString();
    const [{ data: outData }, { data: stockData }] = await Promise.all([
      supabase.from('stock_out').select('name').gte('at', yesterday),
      supabase.from('stock').select('name,qty,min_qty')
    ]);
    const out = (outData || []).map(o => o.name);
    const low = (stockData || []).filter(s => s.qty <= s.min_qty).map(s => s.name);
    const names = [...new Set([...out, ...low])];
    res.json(out.length ? { level: 'bad', label: 'Habis', names } : low.length ? { level: 'low', label: 'Menipis', names } : { level: 'ok', label: 'Aman', names: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock', auth, async (req, res) => {
  try {
    const { name, category, qty, unit, min_qty } = req.body;
    if (!clean(name) || !(qty > 0)) return res.status(400).json({ error: 'Nama dan jumlah (lebih dari 0) wajib diisi.' });
    const { error } = await supabase.from('stock').insert({ name: clean(name), category: clean(category), qty, unit: clean(unit), min_qty: min_qty ?? 2 });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/stock/:id', auth, async (req, res) => {
  try {
    const { data: it } = await supabase.from('stock').select('*').eq('id', req.params.id).maybeSingle();
    if (!it) return res.status(404).json({ error: 'Barang tidak ditemukan.' });
    const q = Math.max(0, it.qty + (Number(req.body.delta) || 0));
    if (q === 0) {
      await supabase.from('stock').delete().eq('id', it.id);
      await supabase.from('stock_out').insert({ name: it.name, unit: it.unit });
      return res.json({ ok: true, removed: true, name: it.name });
    }
    const { error } = await supabase.from('stock').update({ qty: q, updated_at: new Date().toISOString() }).eq('id', it.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/stock/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('stock').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Laundry ----------
app.get('/api/laundry', auth, async (_, res) => {
  try {
    const [{ data: jobs, error: jErr }, { data: users, error: uErr }] = await Promise.all([
      supabase.from('laundry_jobs').select('*').order('done').order('pickup_at'),
      supabase.from('users').select('id,name')
    ]);
    if (jErr || uErr) throw jErr || uErr;
    const uMap = Object.fromEntries((users || []).map(u => [u.id, u.name]));
    res.json((jobs || []).map(j => ({ ...j, user_name: uMap[j.user_id] || 'User' })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/laundry', auth, async (req, res) => {
  try {
    const { item, drop_at, pickup_at } = req.body;
    if (isNaN(new Date(drop_at)) || isNaN(new Date(pickup_at))) return res.status(400).json({ error: 'Waktu tidak valid.' });
    if (new Date(pickup_at) <= new Date(drop_at)) return res.status(400).json({ error: 'Waktu pengambilan harus setelah waktu dititipkan.' });
    const { error } = await supabase.from('laundry_jobs').insert({ user_id: req.user.id, item: clean(item), drop_at, pickup_at });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const ownJob = async (req, res) => {
  const { data: j } = await supabase.from('laundry_jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (!j) { res.status(404).json({ error: 'Tidak ditemukan.' }); return null; }
  if (j.user_id !== req.user.id && req.user.role !== 'admin') { res.status(403).json({ error: 'Itu bukan laundry kamu.' }); return null; }
  return j;
};

app.patch('/api/laundry/:id', auth, async (req, res) => {
  const j = await ownJob(req, res); if (!j) return;
  const { error } = await supabase.from('laundry_jobs').update({ done: 1 }).eq('id', j.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.delete('/api/laundry/:id', auth, async (req, res) => {
  const j = await ownJob(req, res); if (!j) return;
  const { error } = await supabase.from('laundry_jobs').delete().eq('id', j.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ---------- Piket & Roommate ----------
app.get('/api/chores', auth, async (_, res) => {
  try {
    const [{ data: chores, error: cErr }, { data: users, error: uErr }] = await Promise.all([
      supabase.from('chores').select('*').eq('date', today()).order('id'),
      supabase.from('users').select('id,name,room')
    ]);
    if (cErr || uErr) throw cErr || uErr;
    const uMap = Object.fromEntries((users || []).map(u => [u.id, u]));
    res.json((chores || []).map(c => ({ ...c, user_name: uMap[c.user_id]?.name || null, room: uMap[c.user_id]?.room || null })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/chores', auth, async (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ error: 'Nama tugas wajib diisi.' });
    const { error } = await supabase.from('chores').insert({ title: req.body.title, user_id: req.body.user_id || null, date: today() });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/chores/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('chores').update({ done: req.body.done ? 1 : 0 }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/rules', auth, async (_, res) => {
  try {
    const { data, error } = await supabase.from('rules').select('*').order('id');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rules', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('rules').insert({ text: req.body.text });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Notifikasi ----------
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const n = [], rp = v => 'Rp ' + Number(v).toLocaleString('id-ID'), yesterday = new Date(Date.now() - 864e5).toISOString();
    const [{ data: stocks }, { data: stockOuts }, { data: laundries }, { data: bills }, { data: shares }, { data: users }, { data: chores }, { data: readRows }] = await Promise.all([
      supabase.from('stock').select('*').order('qty'),
      supabase.from('stock_out').select('*').gte('at', yesterday).order('id', { ascending: false }),
      supabase.from('laundry_jobs').select('*').eq('user_id', req.user.id).eq('done', 0).order('pickup_at'),
      supabase.from('bills').select('*'),
      supabase.from('bill_shares').select('*'),
      supabase.from('users').select('id,name'),
      supabase.from('chores').select('*').eq('user_id', req.user.id).eq('done', 0).eq('date', today()),
      supabase.from('notif_reads').select('nid').eq('user_id', req.user.id)
    ]);

    (stocks || []).filter(s => s.qty <= s.min_qty).forEach(s => n.push({
      id: `stock-${s.id}-${s.qty}`, type: 'stock', level: s.qty === 0 ? 'bad' : 'low', page: 'stok',
      title: s.qty === 0 ? `${s.name} habis!` : `${s.name} hampir habis`, text: `Tersisa ${s.qty} ${s.unit}. Segera tambahkan ke daftar belanja.`
    }));
    (stockOuts || []).forEach(o => n.push({
      id: `out-${o.id}`, type: 'stock', level: 'bad', final: true, page: 'stok', title: `${o.name} habis!`, text: 'Stok sudah habis. Segera belanja.'
    }));
    (laundries || []).forEach(l => {
      const diff = new Date(l.pickup_at) - Date.now(), name = l.item || 'Laundry', hrs = Math.ceil(diff / 3600e3);
      if (diff <= 0) n.push({ id: `laundry-${l.id}-ready`, type: 'laundry', level: 'ok', final: true, page: 'laundry', title: `${name} sudah bisa diambil!`, text: 'Waktunya mengambil laundry kamu.' });
      else if (hrs <= 3) n.push({ id: `laundry-${l.id}-soon`, type: 'laundry', level: 'info', page: 'laundry', title: `${name} siap diambil ${hrs <= 1 ? 'kurang dari 1 jam' : hrs + ' jam'} lagi`, text: 'Siapkan waktu untuk mengambilnya.' });
    });

    const bMap = Object.fromEntries((bills || []).map(b => [b.id, b])), uMap = Object.fromEntries((users || []).map(u => [u.id, u.name]));
    (shares || []).filter(s => s.user_id === req.user.id && s.status === 'unpaid').forEach(s => {
      const b = bMap[s.bill_id]; if (!b) return;
      const cnt = (shares || []).filter(x => x.bill_id === b.id).length + (b.owner_id != null ? 1 : 0);
      n.push({ id: `bill-${s.id}`, type: 'bill', level: 'warn', page: 'split', title: `Tagihan ${b.title} belum dibayar`, text: `Bagianmu ${rp(b.amount / cnt)}` });
    });
    (shares || []).filter(s => s.status === 'pending' && bMap[s.bill_id]?.owner_id === req.user.id).forEach(s => {
      const b = bMap[s.bill_id];
      n.push({ id: `confirm-${s.id}`, type: 'bill', level: 'warn', page: 'split', title: `${uMap[s.user_id] || 'Teman'} sudah bayar ${b.title}`, text: 'Konfirmasi pembayarannya di halaman Split Bill.' });
    });
    (chores || []).forEach(c => n.push({ id: `chore-${c.id}`, type: 'chore', level: 'info', page: 'roommate', title: `Piket: ${c.title}`, text: 'Jadwalmu hari ini belum dikerjakan.' }));

    const reads = new Set((readRows || []).map(r => r.nid));
    res.json(n.map(x => ({ ...x, read: reads.has(x.id) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notifications/read', auth, async (req, res) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).slice(0, 200);
    if (ids.length) {
      const { error } = await supabase.from('notif_reads').upsert(ids.map(id => ({ user_id: req.user.id, nid: String(id).slice(0, 80) })), { onConflict: 'user_id,nid', ignoreDuplicates: true });
      if (error) throw error;
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

if (!process.env.VERCEL) {
  app.listen(process.env.PORT || 3000, () => console.log('KosMate jalan di http://localhost:3000'));
}

module.exports = app;