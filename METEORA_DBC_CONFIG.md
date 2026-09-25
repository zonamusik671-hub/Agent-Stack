# 📈 METEORA DYNAMIC BONDING CURVE (DBC) SPECIFICATION

## 🎯 Target Konfigurasi (RWA / Equity Meta)
Proyek ini mengonfigurasi DBC Meteora untuk aset saham yang ditokenisasi, membutuhkan kurva harga yang stabil dengan batas parameter berikut:

*   **Quote Token Standard:** Menggunakan SPL Token-2022 (Aset RWA/Saham terikat).
*   **Curve Shape:** Linear / Flat Curve (Menghindari volatilitas tinggi khas memecoin).
*   **Graduation Threshold:** Likuiditas otomatis bermigrasi ke Meteora DAMM v2 setelah mencapai batas pendanaan tertentu.

## 💻 Aturan Penulisan Kode (TypeScript SDK)
Saat menginisialisasi pool menggunakan `dynamic-bonding-curve-sdk`, pastikan parameter `feeSchedule` dan `curveParameters` diatur untuk merefleksikan perdagangan ekuitas yang stabil, bukan spekulatif.
