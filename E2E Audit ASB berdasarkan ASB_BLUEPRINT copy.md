Localnet tervalidasi, UI sudah diperbaiki, tetapi Devnet E2E belum proven.

Prioritas 0 — Tentukan target submission
Ada dua kemungkinan:

Opsi A — Submission jujur dan aman
Jika belum memiliki:

program keypair Devnet;
deploy wallet berisi SOL Devnet;
Pyth Devnet price account;
Token-2022 mint yang valid;
Meteora DBC pool yang benar-benar aktif;
integrasi resmi Clawpump;
maka submit sebagai:

Working Localnet E2E + Devnet-ready architecture

Jangan mengklaim sebagai live Devnet E2E. Ini lebih baik daripada mengisi PROOF.md dengan signature simulasi atau data yang tidak dapat diverifikasi.

Opsi B — Live Devnet E2E
Pilih ini hanya jika semua akun dan keypair nyata tersedia. Fokuskan demo pada alur minimum:
Connect wallet
→ Initialize Vault
→ Token-2022 deposit
→ Read Pyth
→ Validate PreStocks LIVE asset
→ Simulate Meteora swap
→ Broadcast only with explicit approval
→ Verify signature via getTransaction

Clawpump dan borrowing/liquidation sebaiknya ditampilkan sebagai tahap terpisah jika belum benar-benar tersedia.

Rencana pengerjaan yang saya rekomendasikan
Fase 1 — Stabilkan repository dan dokumentasi
1. Sinkronkan status audit
Perbarui E2E Audit ASB berdasarkan ASB_BLUEPRINT.md agar statusnya jelas:

Area	Status aktual
Anchor program	Localnet validated
SBPF v3	Validated
UI initialize vault	Implemented
Vault token PDA	Implemented
Pyth error handling	Fail-closed
Pyth browser access	Proxy tersedia, upstream saat ini HTTP 401
Devnet deployment	Blocked: environment belum tersedia
Meteora live swap	Not proven
Clawpump official launch	Blocked: SDK/CLI resmi belum terverifikasi
Borrow/liquidation Devnet	Not proven
Submission proof	Pending
Jangan gunakan istilah “completed” untuk fitur yang baru berhasil offline atau localnet.

2. Pisahkan bukti berdasarkan cluster
Gunakan tiga kategori eksplisit:
LOCALNET_VALIDATED
OFFLINE_TESTED
DEVNET_CONFIRMED

Ini perlu berlaku untuk:

deployment;
initialize vault;
deposit;
rebalance;
Meteora swap;
borrowing;
liquidation;
Clawpump.
PROOF.md sebaiknya hanya berisi DEVNET_CONFIRMED. Bukti localnet dapat dimasukkan ke bagian terpisah, bukan ke ledger Devnet.

Fase 2 — Perkuat correctness sebelum broadcast
1. Tambahkan validasi on-chain sebelum deposit
Di VaultDashboard.tsx, sebelum deposit sebaiknya validasi:

vault account ada;
vault token PDA ada;
owner vault token account sesuai Token-2022;
mint sesuai TOKEN_2022_MINT;
user token account menggunakan Token-2022;
user memiliki saldo cukup;
vault token account bukan ATA biasa.
Saat ini derivation PDA sudah diperbaiki, tetapi validasi account owner/mint akan membuat error lebih jelas sebelum wallet diminta sign.

2. Tambahkan cluster indicator
UI harus menampilkan secara jelas:
Cluster: Devnet
RPC: https://api.devnet.solana.com
Program ID: ...

Jangan biarkan user mengira UI sedang memakai localnet. Tambahkan juga warning jika NEXT_PUBLIC_RPC_URL bukan Devnet atau localnet yang dikenal.

3. Pyth harus memiliki mode fail-closed yang konsisten
Pyth saat ini memiliki dua masalah berbeda:

Browser request sebelumnya terkena CORS.
Proxy server-side mendapat HTTP 401 dari Hermes.
Solusi teknis:

gunakan API proxy server-side seperti yang sudah dibuat;
jika Hermes membutuhkan autentikasi, simpan credential hanya di server environment;
jangan memasukkan token Pyth ke NEXT_PUBLIC_*;
tampilkan Unavailable jika HTTP 401/5xx;
jangan mengizinkan rebalance jika price feed invalid, stale, atau tidak tersedia.
Tambahkan validasi:
price > 0
confidence valid
publish time tidak terlalu lama
feed ID sesuai konfigurasi
cluster sesuai

Fase 3 — Lengkapi environment Devnet dengan prosedur aman
Jangan membuat nilai environment secara otomatis dari placeholder. Isi hanya nilai publik yang benar dan path keypair lokal.

Contoh:
export ASB_PROGRAM_ID="..."
export PROGRAM_KEYPAIR="$PWD/target/deploy/agent_stock_basket-keypair.json"
export DEPLOY_WALLET="$HOME/.config/solana/id.json"

export PYTH_DEVNET_PROGRAM_ID="..."
export PYTH_DEVNET_FEED_ID="..."
export PYTH_DEVNET_PRICE_ACCOUNT="..."

export TOKEN_2022_MINT="..."
export METEORA_DBC_POOL="..."

Sebelum dry-run, verifikasi tanpa mengekspos private key:
solana config set --url devnet
solana address -k "$DEPLOY_WALLET"
solana balance -k "$DEPLOY_WALLET" --url devnet
solana address -k "$PROGRAM_KEYPAIR"

Pastikan:
solana address -k PROGRAM_KEYPAIR == ASB_PROGRAM_ID

Lalu jalankan:
DRY_RUN=1 ./scripts/deploy-devnet.sh

Dry-run harus memvalidasi:

semua environment tersedia;
semua public key valid;
keypair program cocok;
network adalah Devnet;
artifact SBPF v3 berhasil dibangun;
deploy wallet memiliki saldo;
mint dan pool dapat dibaca;
Pyth program dan price account valid.
Baru setelah itu:
DEPLOY_DEVNET_CONFIRM=1 ./scripts/deploy-devnet.sh

Broadcast harus tetap memerlukan persetujuan eksplisit. Jangan menyimpan private key ke .env, Git, PROOF.md, atau screenshot.

Fase 4 — Validasi Meteora secara nyata
Berdasarkan METEORA_DBC_CONFIG.md, validasi pool harus mencakup:

Account pool ada di Devnet.
Owner account sesuai program Meteora DBC.
Base mint sesuai Token-2022 asset.
Quote mint sesuai Token-2022 quote/USDC.
Token program sesuai Token-2022.
Pool tidak paused atau graduated secara tidak sesuai.
Quote memiliki minimumAmountOut.
Transaksi disimulasikan sebelum sign.
Slippage memiliki batas maksimum eksplisit.
Alur yang benar:
Fetch PreStocks asset
→ status harus LIVE
→ validasi mint
→ baca Meteora pool
→ cocokkan mint base/quote
→ ambil quote
→ hitung minimumAmountOut
→ simulate
→ tampilkan ringkasan transaksi
→ minta approval wallet
→ send
→ getTransaction
→ catat signature

Jika satu validasi gagal, jangan lanjut ke broadcast.

Fase 5 — Clawpump: jangan mengklaim integrasi sebelum SDK resmi jelas
OFFICIAL_REPOS.md hanya memberikan referensi umum dan belum memberikan interface SDK/CLI yang dapat langsung diverifikasi di repository.

Karena itu pendekatan yang benar adalah:

cari package/CLI resmi yang memiliki dokumentasi dan program ID;
pin versi dependency;
buat adapter terisolasi, misalnya:
app/src/utils/clawpumpOfficialAdapter.ts

validasi instruction builder, account list, discriminator, dan network;
simulasikan transaksi;
baru broadcast setelah user menyetujui.
Jika SDK/CLI resmi tidak dapat diverifikasi, status harus tetap:
Clawpump: integration blocked, no official live proof

Keputusan sebelumnya untuk menolak Buffer.alloc(...) sudah benar. Jangan menggantinya dengan discriminator buatan sendiri.

Fase 6 — Borrowing dan liquidation
Jangan menjalankan scripts/borrowing-e2e.sh dengan oracle placeholder. Sebelum dijalankan, validasi:

PYTH_DEVNET_PRICE_ACCOUNT benar-benar ada;
owner account sesuai Pyth;
price account cocok dengan feed;
vault sudah initialized;
collateral Token-2022 tersedia;
borrow limit dan liquidation threshold dapat dihitung;
akun liquidation signer memiliki otorisasi;
setiap fase memiliki signature berbeda.
Ledger minimal:
Borrow signature
Price update / oracle condition signature
Liquidation signature
getTransaction confirmation

Jika price drop tidak dapat dilakukan secara sah pada Devnet, jangan mengubah data lokal lalu menyebutnya sebagai liquidation Devnet. Tandai sebagai NOT_PROVEN.

Fase 7 — Tambahkan test yang masih bisa dilakukan tanpa Devnet
Sebelum credential tersedia, masih ada pekerjaan bernilai tinggi:

Test UI
Tambahkan test untuk:

deposit disabled sebelum vault initialized;
initialize button muncul saat vault belum ada;
vault token account memakai PDA;
Pyth error menampilkan Unavailable;
harga invalid ditolak;
signature ditampilkan setelah confirmation.
Test client
Tambahkan test untuk:

derivation [vault_token, vault];
Token-2022 program ID;
mint mismatch;
invalid Pyth feed;
stale price;
slippage minimumAmountOut;
Clawpump live tanpa transaction resmi harus throw.
Test script
Tambahkan mode preflight khusus yang menghasilkan laporan tabel:
PASS  ASB_PROGRAM_ID format
PASS  PROGRAM_KEYPAIR exists
FAIL  DEPLOY_WALLET balance
PASS  Pyth account format
FAIL  Meteora pool unavailable

Ini akan jauh lebih berguna daripada hanya berhenti pada:
Missing required environment variable: ...

Urutan eksekusi terbaik
Saya menyarankan urutan berikut:
1. Tambahkan cluster indicator dan preflight report
2. Tambahkan on-chain account validation pada UI
3. Tambahkan test UI/client
4. Sediakan seluruh credential/public address Devnet
5. Jalankan dry-run
6. Deploy program ke Devnet
7. Verifikasi program account dengan getAccountInfo
8. Initialize Vault
9. Deposit Token-2022
10. Verifikasi deposit dengan getTransaction
11. Validasi PreStocks LIVE + Meteora pool
12. Simulate Meteora swap
13. Broadcast swap hanya dengan approval
14. Jalankan borrow/liquidation jika oracle benar-benar mendukung
15. Integrasikan Clawpump hanya jika SDK resmi sudah jelas
16. Isi PROOF.md dari signature confirmed
17. Rekam video 2–3 menit
18. Update SUBMISSION_CHECKLIST.md

Hal yang sebaiknya tidak dilakukan
Jangan mengarang ASB_PROGRAM_ID.
Jangan memakai program ID localnet sebagai Devnet.
Jangan memakai keypair program sebagai fee payer tanpa alasan jelas.
Jangan mencatat simulation ID sebagai transaction signature.
Jangan mencatat signature sandbox/localnet ke PROOF.md.
Jangan broadcast placeholder instruction Clawpump.
Jangan menganggap HTTP 200 UI sebagai bukti E2E blockchain.
Jangan menganggap data PreStocks LIVE otomatis berarti mint tersebut valid di Devnet.
Jangan mengklaim Meteora pool tanpa verifikasi owner, mint, dan token program.
Kesimpulan
Langkah berikutnya yang paling bernilai bukan langsung menjalankan deployment, tetapi:

mendapatkan konfigurasi Devnet nyata dari pemilik wallet;
memperbaiki preflight agar memvalidasi account on-chain, bukan hanya environment;
menyelesaikan satu alur Devnet minimum sampai getTransaction confirmed;
mendokumentasikan hanya bukti yang benar-benar ada;
menandai Clawpump dan liquidation sebagai blocker terpisah jika dependency eksternal belum tersedia.
Dengan pendekatan ini, proyek akan lebih sempurna secara teknis dan lebih kuat secara submission karena setiap klaim dapat diverifikasi.