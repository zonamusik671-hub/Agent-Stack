# 🤖 ARCHITECTURE BLUEPRINT: AGENT-STOCK BASKET (ASB)

## 🎯 BLUEPRINT OVERVIEW
Dokumen ini mendefinisikan arsitektur teknis untuk dApp "Agent-Stock Basket (ASB)", sebuah platform reksa dana otomatis (*Auto-Rebalancing Vault*) berbasis AI untuk aset saham Pre-IPO (RWA) di Solana. Kode harus dioptimalkan untuk memenangkan multi-bounty (Clawpump, Meteora, PreStocks, Pyth Network) secara terintegrasi.
---

## 🛠️ MULTI-BOUNTY STACKING LOGIC & INTEGRATION POINTS

### 1. Kategori Produk Utama
Juri mencari aplikasi nyata yang memiliki fungsi *end-to-end*, masuk akal dibangun di atas Solana, dan siap digunakan pengguna. Proyek ASB ini wajib menyentuh dan menyelesaikan problem pada 5 area yang disarankan berikut:

*   **Investasi:** Keranjang Indeks / Robo Portfolio (Otomatisasi alokasi dana).
*   **Konsumen:** AI Automated Trading (Akses tanpa kendala bagi pengguna ritel).
*   **1. Perdagangan (Trading):** 
    *   *Implementasi:* Menyediakan tempat perdagangan ekuitas 24/7 tanpa henti menggunakan infrastruktur Solana, sistem *swaps* langsung dari token saham ke *stablecoin* (USDC) secara instan.
*   **2. Investasi (Investing):**
    *   *Implementasi:* Fitur utama berupa **Keranjang Indeks (*Index Baskets*)** dan **Robo Portfolio** yang dikelola otomatis oleh teknologi agen cerdas tanpa perlu intervensi manual dari pengguna ritel.
*   **3. Kredit & Imbal Hasil (Credit and Yield):**
    *   *Implementasi:* Struktur jangka panjang yang memungkinkan pembagian dividen otomatis bagi pemegang token saham atau opsi meminjam dana (*borrowing*) dengan jaminan aset saham yang terkunci dalam Vault.
*   **4. Infrastruktur:**
    *   *Implementasi:* Integrasi penyedia informasi harga (*price feeds*) yang andal untuk memantau aksi korporasi dan menjamin kepatuhan hukum (*compliance*) transaksi RWA secara *on-chain*.
*   **5. Konsumen:**
    *   *Implementasi:* Antarmuka dApp yang bersih, siap adopsi, dan ramah pengguna ritel dengan potensi pengembangan ke arah perdagangan sosial (*social trading*) atau belanja langsung dari portofolio saham.

---

### 2. Alur Integrasi Sponsor (Wajib Diikuti dalam Kode)
*   **Clawpump & Meteora SDK:**
    *   Setiap Basket dikelola oleh Token Agen AI yang diluncurkan via Clawpump (`npx clawpump launch`).
    *   Likuiditas awal agen menggunakan **Meteora Dynamic Bonding Curve (DBC)** yang dipasangkan langsung dengan Token Saham/RWA (Token-2022). Kurva harga dikonfigurasi untuk kestabilan tinggi (bukan kurva memecoin).
*   **PreStocks API:**
    *   Dana internal Vault (USDC) **hanya boleh** dialokasikan ke Token Pre-IPO resmi dari ekosistem PreStocks (e.g., SpaceX, OpenAI, Anduril, Neuralink).
    *   *Constraint:* Dilarang keras mencampur atau mengintegrasikan token pre-IPO di luar API resmi `https://prestocks.com`.
*   **Pyth Network Price Feeds:**
    *   Agen AI secara berkala memanggil data dari Pyth Hermes API (e.g., Feed Harga Apple `Equity.US.AAPL/USD`).
    *   Pergeseran harga pada *feed* pasar tradisional ini bertindak sebagai pemicu (*trigger*) otomatis bagi agen untuk melakukan instruksi *swap* penyeimbangan ulang (*rebalancing*) di dalam Vault Solana.

---

## 💻 TECHNICAL REQUIREMENT SPECIFICATIONS

### A. Smart Contract (Anchor Framework / Rust)
*   **Vault State:** Menyimpan data `owner` (user), `ai_agent` (Clawpump agent pubkey), `id_basket`, dan saldo token.
*   **Access Control:** Fungsi `execute_rebalance` WAJIB memverifikasi bahwa akun penandatangan transaksi (`ctx.accounts.signer_agent`) cocok dengan `vault.ai_agent` yang terdaftar.
*   **Token Standard:** Gunakan Solana Token Extensions (Token-2022) untuk transfer aset RWA.

### B. Agen AI & Otomatisasi (TypeScript / Node.js)
*   Membuat skrip *looping* otomatis yang membaca Pyth Oracle secara real-time.
*   Mengonversi presisi angka (*decimal exponent*) dari Pyth secara akurat sebelum melakukan kalkulasi *threshold*.
*   Menghubungkan logika transaksi agen dengan API PreStocks untuk eksekusi berbasis target alokasi portofolio.

---

## 📋 AGILE DEVELOPMENT PLAN (6-DAY SPRINT)

*   **Fase 1 (Hari 1-2): Smart Contract & Data Oracles**
    *   Implementasi struktur dasar Anchor program untuk Vault.
    *   Integrasi skrip TypeScript penarik harga dari Pyth Network.
*   **Fase 2 (Hari 3-4): Logika Agen AI & Ekosistem PreStocks**
    *   Hubungkan dApp dengan endpoint produk PreStocks.
    *   Buat simulasi bot/agent yang mengeksekusi fungsi `execute_rebalance` berdasarkan data harga.
*   **Fase 3 (Hari 5): Front-End & Wallet Integration**
    *   Bangun UI satu halaman (Next.js & Tailwind).
    *   Sediakan tombol *Connect Wallet* (Phantom/Solflare), visualisasi isi keranjang saham, dan tombol deposit USDC ke Vault.
*   **Fase 4 (Hari 6): Finalization & Submission Packaging**
    *   Penyusunan dokumentasi `README.md` GitHub yang secara eksplisit menyebutkan penggunaan teknologi ke-4 sponsor.
    *   Perekaman video demo produk *end-to-end* (durasi 2-3 menit).

---

## 🚨 CRITICAL CO-PILOT INSTRUCTION
Saat membuat atau memodifikasi kode untuk proyek ini, utamakan fungsionalitas inti (*core loop*) yang berjalan mulus dari hulu ke hilir (Pyth Price -> AI Agent Decision -> Solana Vault Rebalance -> PreStocks Asset Allocation). Pastikan kode aman dari eksploitasi pihak ketiga pada fungsi penyeimbangan dana.

## 🛠️ MULTI-BOUNTY STACKING LOGIC & INTEGRATION POINTS

*   **Clawpump & Meteora SDK (\$10.000 Combined):**
    *   Setiap Basket dikelola oleh Token Agen AI yang diluncurkan via Clawpump (`npx clawpump launch`).
    *   Likuiditas awal agen menggunakan **Meteora Dynamic Bonding Curve (DBC)** yang dipasangkan langsung dengan Token Saham/RWA (Token-2022). Kurva harga dikonfigurasi untuk kestabilan tinggi (bukan kurva memecoin).
*   **PreStocks API (\$10.000):**
    *   Dana internal Vault (USDC) **hanya boleh** dialokasikan ke Token Pre-IPO resmi dari ekosistem PreStocks (e.g., SpaceX, OpenAI, Anduril, Neuralink).
    *   *Constraint:* Dilarang keras mencampur atau mengintegrasikan token pre-IPO di luar API resmi `https://prestocks.com`.
*   **Pyth Network Price Feeds (Pyth Pro Access):**
    *   Agen AI secara berkala memanggil data dari Pyth Hermes API (e.g., Feed Harga Apple `Equity.US.AAPL/USD` atau xStock feed `Crypto.AAPLX/USD`).
    *   Pergeseran harga pada *feed* pasar tradisional ini bertindak sebagai pemicu (*trigger*) otomatis bagi agen untuk melakukan instruksi penyeimbangan ulang (*rebalancing*) di dalam Vault Solana.

---

## 🚨 CRITICAL CO-PILOT INSTRUCTION
Saat membuat atau memodifikasi kode untuk proyek ini, AI wajib memastikan bahwa arsitektur yang dibangun mencakup 5 elemen inti dari juri (Trading, Investing, Yield, Infrastructure, Consumer) yang dibungkus dalam satu kesatuan produk "Agent-Stock Basket". Prioritaskan keamanan Vault dan keakuratan data harga Pyth.