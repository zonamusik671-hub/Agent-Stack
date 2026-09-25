# 🎯 PROJECT CONTEXT: STOCKLANA HACKATHON SOLANA (SEPTEMBER 2026)

## 📌 CORE OBJECTIVE
Membangun dApp "Agent-Stock Basket (ASB)" secara end-to-end di jaringan Solana. Aplikasi ini berupa Vault Investasi berbasis AI yang mengelola portofolio keranjang saham Pre-IPO (Real-World Assets / RWA) secara otomatis menggunakan taktik "Multi-Bounty Stack".

---

/
├── programs/
│   └── stocklana-rwa-vault/
│       └── src/lib.rs          ← Vault + access control ketat
├── app/                        ← Next.js
│   ├── src/
│   │   ├── utils/
│   │   │   ├── pythConnection.ts
│   │   │   ├── prestocksApi.ts
│   │   │   ├── meteoraDbc.ts
│   │   │   └── clawpumpAgent.ts
│   │   ├── components/
│   │   │   ├── WalletConnect.tsx
│   │   │   ├── VaultDashboard.tsx
│   │   │   └── RebalanceStatus.tsx
│   │   └── app/page.tsx
├── scripts/                    ← Agent loop (TypeScript)
│   └── agent-rebalancer.ts
├── README.md                   ← WAJIB sebut 4 sponsor
└── docs/
    └── demo-script.md
    
## 🛠️ ARCHITECTURE & TECH STACK SUBMISSION
Proyek ini dirancang untuk memenangkan 4 Bounty Tracks sekaligus dengan integrasi berikut:
1. **Solana Foundation (Main Track):** Program pintar berbasis Anchor Rust untuk mengunci dana USDC pengguna dalam Vault investasi 24/7.
2. **Clawpump Track (\$5.000):** Tokenisasi Agen AI yang bertindak sebagai Manajer Portofolio. Agen ini memiliki hak akses `Signer` ke Vault Solana.
3. **Meteora Track (\$5.000):** Mengonfigurasi Dynamic Bonding Curve (DBC) milik Meteora SDK sebagai quote token untuk meluncurkan aset pasangan saham (Token-2022 RWA), bukan memecoin.
4. **PreStocks Track (\$10.000):** Alokasi dana internal Vault WAJIB hanya membeli Token Pre-IPO resmi (OpenAI, Anthropic, Anduril, SpaceX) via PreStocks API. Proyek TIDAK BOLEH mencampur token dari luar ekosistem PreStocks.
5. **Pyth Network Track (Pyth Pro):** Menggunakan Pyth Price Feeds (Hermes API) untuk memantau harga pasar tradisional (e.g., Equity.US.AAPL/USD vs Crypto.AAPLX/USD) sebagai trigger algoritma penyeimbangan otomatis (Auto-Rebalancing).

---

## 💾 DIRECTORY & CRITICAL FILES STRUCTURE
Gunakan struktur di bawah ini untuk menulis kode:
- `/programs/stocklana-rwa-vault/src/lib.rs` -> Kontrak Pintar Utama (Anchor/Rust) untuk fungsi `initialize_vault` dan `execute_rebalance`.
- `/app/src/utils/pythConnection.ts` -> Integrasi Client TypeScript untuk menarik feed harga live dari Pyth Hermes Server.
- `/app/src/utils/prestocksApi.ts` -> Handler endpoint untuk fetch produk dari `https://prestocks.com`.
- `/app/src/components/WalletConnect.tsx` -> Interface front-end untuk koneksi Dompet Solana (Phantom/Solflare) menggunakan Next.js.

---

## 🔒 SECURITY & VALIDATION RULES FOR AI
Setiap kali Anda menulis atau memodifikasi kode untuk proyek ini, Anda WAJIB mematuhi aturan berikut:
- **Rust / Anchor:** Fungsi `execute_rebalance` harus selalu memvalidasi bahwa `signer_agent == vault.ai_agent` untuk mencegah eksploitasi dana oleh dompet pihak ketiga.
- **Token Standard:** Gunakan standar Token-2022 Solana untuk kompatibilitas penuh dengan infrastruktur RWA Meteora DBC terbaru (Update September 2026).
- **TypeScript:** Pastikan konversi nilai matematika BigInt dari Pyth Oracle (`price` dan `expo`) dikonversi secara akurat menjadi desimal reguler sebelum memicu logika transaksi.

---

## ⏳ TIMELINE COUNTDOWN & SUBMISSION REQUIREMENTS
- **Batas Akhir Pengumpulan:** Jumat, 25 September 2026 pukul 16.00 ET.
- **Kriteria Penilaian Juri:** End-to-end working demo, alasan logis proyek berada di Solana, dan kesiapan aplikasi digunakan oleh pengguna ritel secara nyata.
