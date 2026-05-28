const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(session({
    secret: 'magdhalena-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// ── MongoDB ──
mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/kasir_magdhalena')
    .then(async () => {
        console.log('✅ MongoDB terhubung!');
        await seedAdmin();
    })
    .catch(err => console.error('❌ Gagal konek MongoDB:', err));

// ── Upload folder ──
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'prod-' + Date.now() + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp/;
        const ok = allowed.test(path.extname(file.originalname).toLowerCase());
        cb(null, ok);
    }
});

// ── Schema ──
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'kasir'], default: 'kasir' },
    createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

const transactionSchema = new mongoose.Schema({
    noStruk: String,
    items: Array,
    total: Number,
    kasir: String,
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// ── Seed admin default ──
async function seedAdmin() {
    const existing = await User.findOne({ username: 'admin' });
    if (!existing) {
        await User.create({ username: 'admin', password: 'magdhalena123', role: 'admin' });
        console.log('👤 Admin default dibuat: admin / magdhalena123');
    }
}

// ── Middleware ──
function requireLogin(req, res, next) {
    if (req.session && req.session.loggedIn) return next();
    res.status(401).json({ message: 'Silakan login terlebih dahulu' });
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.role === 'admin') return next();
    res.status(403).json({ message: 'Akses ditolak, hanya admin' });
}

app.use(express.static(path.join(__dirname, 'public')));

// ── Auth ──
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) {
        req.session.loggedIn = true;
        req.session.username = user.username;
        req.session.role = user.role;
        res.json({ success: true, role: user.role });
    } else {
        res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/check-auth', (req, res) => {
    if (req.session && req.session.loggedIn) {
        res.json({ loggedIn: true, username: req.session.username, role: req.session.role });
    } else {
        res.json({ loggedIn: false });
    }
});

// ── Users (admin only) ──
app.get('/users', requireLogin, requireAdmin, async (req, res) => {
    const users = await User.find({}, '-password').sort({ createdAt: 1 });
    res.json(users);
});

app.post('/users', requireLogin, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username dan password wajib diisi' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ message: 'Username sudah dipakai' });
    const user = await User.create({ username, password, role: role || 'kasir' });
    res.json({ message: 'User berhasil ditambahkan', user });
});

app.delete('/users/:id', requireLogin, requireAdmin, async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user && user.username === 'admin') return res.status(400).json({ message: 'Admin utama tidak bisa dihapus' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User berhasil dihapus' });
});

// ── Products ──
app.get('/products', requireLogin, async (req, res) => {
    const products = await Product.find().sort({ createdAt: 1 });
    res.json(products);
});

app.post('/products', requireLogin, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, price } = req.body;
        if (!name || !price) return res.status(400).json({ message: 'Nama dan harga wajib diisi' });
        const image = req.file ? '/uploads/' + req.file.filename : null;
        const product = await Product.create({ name, price: Number(price), image });
        res.json({ message: 'Produk berhasil ditambahkan', product });
    } catch (err) {
        res.status(500).json({ message: 'Gagal menambah produk' });
    }
});

app.delete('/products/:id', requireLogin, requireAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product && product.image) {
            const imgPath = path.join(__dirname, 'public', product.image);
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Produk berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: 'Gagal menghapus produk' });
    }
});

// ── Transactions ──
app.post('/transactions', requireLogin, async (req, res) => {
    try {
        const { items, total, noStruk } = req.body;
        if (!items || !total) return res.status(400).json({ message: 'Data transaksi tidak lengkap' });
        const trx = await Transaction.create({ noStruk, items, total: Number(total), kasir: req.session.username });
        res.json({ message: 'Transaksi berhasil disimpan', transaction: trx });
    } catch (err) {
        res.status(500).json({ message: 'Gagal menyimpan transaksi' });
    }
});

app.get('/transactions', requireLogin, async (req, res) => {
    const transactions = await Transaction.find().sort({ timestamp: -1 });
    res.json(transactions);
});

// ── Dashboard ──
// ── Reset Transactions ──
app.delete('/transactions/reset', requireLogin, requireAdmin, async (req, res) => {
    try {
        await Transaction.deleteMany({});
        res.json({ message: 'Semua transaksi berhasil direset' });
    } catch (err) {
        res.status(500).json({ message: 'Gagal mereset transaksi' });
    }
});

app.get('/dashboard', requireLogin, requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

        const totalProduk = await Product.countDocuments();
        const totalTransaksi = await Transaction.countDocuments();
        const totalUser = await User.countDocuments();
        const allTrx = await Transaction.find();
        const totalPendapatan = allTrx.reduce((sum, t) => sum + t.total, 0);
        const todayTrx = await Transaction.find({ timestamp: { $gte: todayStart, $lt: todayEnd } });
        const pendapatanHariIni = todayTrx.reduce((sum, t) => sum + t.total, 0);

        const grafik = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
            const label = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
            const dateStr = d.toISOString().slice(0, 10);
            const dayTrx = await Transaction.find({ timestamp: { $gte: start, $lt: end } });
            const total = dayTrx.reduce((sum, t) => sum + t.total, 0);
            grafik.push({ label, total, date: dateStr });
        }

        const transaksiTerakhir = await Transaction.find().sort({ timestamp: -1 }).limit(5);
        res.json({ totalProduk, totalTransaksi, totalPendapatan, transaksiHariIni: todayTrx.length, pendapatanHariIni, grafik, transaksiTerakhir, totalUser });
    } catch (err) {
        res.status(500).json({ message: 'Gagal mengambil data dashboard' });
    }
});

app.listen(3000, () => console.log('🚀 Server berjalan di http://localhost:3000'));