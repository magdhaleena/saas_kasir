async function checkAuth() {
    try {
        const res = await fetch('/check-auth');
        const data = await res.json();
        if (!data.loggedIn) { window.location.href = '/login.html'; return; }

        document.getElementById('adminName').textContent = data.username;
        const roleEl = document.getElementById('adminRole');
        if (roleEl) {
            roleEl.textContent = data.role;
            roleEl.className = 'role-badge role-' + data.role;
        }

        if (data.role === 'admin') {
            const formCard = document.getElementById('formCard');
            if (formCard) formCard.style.display = 'flex';
            const navUsers = document.getElementById('navUsers');
            if (navUsers) navUsers.style.display = 'flex';
        }
    } catch (err) {
        window.location.href = '/login.html';
    }
}

async function doLogout() {
    await fetch('/logout', { method: 'POST' });
    window.location.href = '/login.html';
}

function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

function previewImage(input) {
    const preview = document.getElementById('imgPreview');
    const label = document.getElementById('fileLabelText');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
        reader.readAsDataURL(input.files[0]);
        if (label) label.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> ${input.files[0].name}`;
    }
}

let currentProducts = [];

async function loadProducts() {
    try {
        const response = await fetch('/products');
        if (response.status === 401) { window.location.href = '/login.html'; return; }

        const products = await response.json();
        currentProducts = products;

        const productList = document.getElementById('productList');
        const totalHarga = document.getElementById('totalHarga');
        const totalCount = document.getElementById('totalCount');
        const productBadge = document.getElementById('productBadge');
        const cetakBtn = document.getElementById('cetakBtn');
        const qrisBtn = document.getElementById('qrisBtn');

        productList.innerHTML = '';

        if (products.length === 0) {
            productList.innerHTML = `
                <li class="empty-state">
                    <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                        <line x1="3" y1="6" x2="21" y2="6"/>
                        <path d="M16 10a4 4 0 01-8 0"/>
                    </svg>
                    Belum ada produk ditambahkan
                </li>`;
            totalHarga.textContent = 'Rp 0';
            totalCount.textContent = '0 produk';
            productBadge.textContent = '0 item';
            if (cetakBtn) cetakBtn.disabled = true;
            if (qrisBtn) qrisBtn.disabled = true;
            return;
        }

        let total = 0;
        products.forEach((product, index) => {
            total += Number(product.price);
            const li = document.createElement('li');
            const imgHtml = product.image
                ? `<img src="${product.image}" class="prod-img" alt="${product.name}">`
                : `<div class="prod-img-placeholder">🛍️</div>`;
            li.innerHTML = `
                <div class="item-info">
                    ${imgHtml}
                    <div><div class="item-name">${product.name}</div></div>
                </div>
                <div class="item-price">Rp ${Number(product.price).toLocaleString('id-ID')}</div>
                <button class="delete-btn" onclick="deleteProduct('${product._id}')">Hapus</button>
            `;
            productList.appendChild(li);
        });

        totalHarga.textContent = 'Rp ' + total.toLocaleString('id-ID');
        totalCount.textContent = products.length + ' produk';
        productBadge.textContent = products.length + ' item';
        if (cetakBtn) cetakBtn.disabled = false;
        if (qrisBtn) qrisBtn.disabled = false;

    } catch (err) {
        console.error('Gagal memuat produk:', err);
    }
}

async function addProduct() {
    const productName = document.getElementById('productName');
    const productPrice = document.getElementById('productPrice');
    const productImage = document.getElementById('productImage');
    const name = productName.value.trim();
    const price = productPrice.value.trim();

    if (!name || !price) { showToast('⚠ Nama produk dan harga harus diisi!'); return; }
    if (isNaN(price) || Number(price) <= 0) { showToast('⚠ Harga harus berupa angka yang valid!'); return; }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('price', Number(price));
    if (productImage.files[0]) formData.append('image', productImage.files[0]);

    try {
        await fetch('/products', { method: 'POST', body: formData });
        showToast('✓ ' + name + ' berhasil ditambahkan');
        productName.value = '';
        productPrice.value = '';
        productImage.value = '';
        document.getElementById('imgPreview').style.display = 'none';
        const label = document.getElementById('fileLabelText');
        if (label) label.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Pilih foto produk`;
        productName.focus();
        loadProducts();
    } catch (err) {
        console.error('Gagal menambah produk:', err);
    }
}

async function deleteProduct(id) {
    try {
        await fetch(`/products/${id}`, { method: 'DELETE' });
        showToast('Produk berhasil dihapus');
        loadProducts();
    } catch (err) {
        console.error('Gagal menghapus produk:', err);
    }
}

async function cetakStruk() {
    if (currentProducts.length === 0) { showToast('⚠ Belum ada produk!'); return; }
    const noStruk = 'MGD-' + Date.now().toString().slice(-6);
    const total = currentProducts.reduce((sum, p) => sum + Number(p.price), 0);

    await fetch('/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: currentProducts, total, noStruk })
    });

    localStorage.setItem('strukData', JSON.stringify({
        products: currentProducts,
        timestamp: new Date().toISOString(),
        noStruk
    }));

    window.open('/struk.html', '_blank');
}

async function bayarQRIS() {
    if (currentProducts.length === 0) { showToast('⚠ Belum ada produk!'); return; }

    const noStruk = 'MGD-' + Date.now().toString().slice(-6);
    const total = currentProducts.reduce((sum, p) => sum + Number(p.price), 0);

    // Simpan data untuk struk setelah bayar
    localStorage.setItem('strukData', JSON.stringify({
        products: currentProducts,
        timestamp: new Date().toISOString(),
        noStruk
    }));

    localStorage.setItem('qrisData', JSON.stringify({ total, noStruk }));

    // Simpan transaksi
    await fetch('/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: currentProducts, total, noStruk, metodeBayar: 'QRIS' })
    });

    window.location.href = '/qris.html';
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadProducts();
    document.getElementById('productPrice')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addProduct();
    });
    document.getElementById('productName')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('productPrice').focus();
    });
});