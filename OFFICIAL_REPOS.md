# 📂 REPOSITORY REFERENCE & DEPENDENCIES CONTEXT

## 📌 OVERVIEW
Dokumen ini berisi daftar pustaka resmi, SDK, dan contoh kode (*boilerplate*) terverifikasi untuk ekosistem Solana, Meteora, Clawpump, Pyth, dan pola RWA. Gunakan file ini sebagai panduan referensi sintaksis dan dependensi proyek Stocklana Hackathon.

---

## 💰 SPONSOR BOUNTY OFFICIAL RESOURCES (REQUIRED)

### 1. Meteora (Dynamic Bonding Curve / DBC)
*   **TypeScript SDK:** `MeteoraAg/dynamic-bonding-curve-sdk`
    *   *Usecase:* Interaksi sisi klien untuk inisialisasi, pemantauan, dan manajemen swap pada kurva peluncuran token.
*   **Rust Program (Smart Contract):** `MeteoraAg/dynamic-bonding-curve`
    *   *Usecase:* Referensi program Anchor untuk kustomisasi aturan kelulusan (*graduation rules*) dan struktur biaya pool berbasis tokenisasi saham.
*   **Tooling Boilerplate:** `MeteoraAg/meteora-invent`
    *   *Usecase:* Kerangka otomatisasi tindakan *on-chain* untuk pembuatan pool likuiditas terkonfigurasi.

### 2. Clawpump (AI Agentic Finance)
*   **AI Framework Modules:** `solana-foundation/awesome-solana-ai` (Cari modul `clawpump-skill`)
    *   *Usecase:* Struktur integrasi agen AI otonom untuk peluncuran token secara *gasless* dan interaksi dompet agen.
*   **GitHub Organization:** `Clawpump` (Gunakan organisasi utama untuk pembaruan SDK berkala).

### 3. Pyth Network (Market Data Oracle)
*   **Verified Oracle Integration:** `solana-foundation/program-examples` (Navigasi ke folder `oracles/pyth`)
    *   *Usecase:* Contoh resmi implementasi pemanggilan data harga Hermes API langsung ke dalam instruksi program Rust Anchor.

### 4. PreStocks & Tessera (Private Equity / Pre-IPO API)
*   **Tessera Documentation:** `docs.tessera.pe` (Integrasi T-Tokens menggunakan stablecoin tanpa KYC).
*   **PreStocks REST API:** `https://prestocks.com` (Fetch data produk pre-IPO resmi).

---

## 💡 CORE SYSTEM BLUEPRINTS & SCAFFOLDS

### 1. Kategori Ide: Trading & Investing (Order Books & Swaps)
*   **Reference Repository:** `WangWilly/solana-trading-bot`
    *   *Pattern:* Contoh arsitektur TypeScript untuk integrasi swap dengan Jupiter API secara terotomatisasi.

### 2. Kategori Ide: Credit & Yield (Borrowing & Dividend Extensions)
*   **Reference Repository:** `solana-foundation/program-examples` (Navigasi ke folder `tokens`)
    *   *Pattern:* Implementasi standar **Solana Token Extensions (Token-2022)** seperti *Interest-bearing tokens* untuk yield otomatis dan *Transfer hooks* untuk kepatuhan regulasi.

### 3. Kategori Ide: Infrastructure & Consumer (Compliant RWA Architecture)
*   **Reference Repository:** `RWATokens/public`
    *   *Pattern:* Cetak biru infrastruktur tokenisasi ekuitas global dan aset dunia nyata (*Real-World Assets*) yang patuh hukum di Solana.

---

## 🛠️ PROJECT INITIATION COMMANDS

### A. Core DApp Scaffold
Untuk menginisialisasi lingkungan kerja front-end dan smart contract yang sudah saling terhubung, jalankan:
```bash
npx create-solana-dapp
```
*Konfigurasi yang disarankan:* Next.js (Front-End), TailwindCSS (Styling), dan Anchor Framework (Rust Smart Contract).

### B. Kumpulan Open-Source Aset Tambahan
*   **Awesome List:** `StockpileLabs/awesome-solana-oss`
    *   *Usecase:* Referensi library sumber terbuka tambahan untuk pengelolaan data, grafik analitik, dan manajemen *state* dompet.

---

## 🚨 CO-PILOT CODING DIRECTIVE
Saat menulis kode yang berinteraksi dengan komponen di atas, pastikan untuk mengikuti standar penulisan kode Solana terbaru (Anchor >= 0.30 dan Token-2022). Jika membuat fungsi transaksi TypeScript, utamakan penggunaan pustaka `@solana/web3.js` versi terbaru untuk integrasi RPC yang stabil.
