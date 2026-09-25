# 📄 PRESTOCKS API SCHEMA CONTEXT

## 🌐 Endpoint Resmi
*   **Product Fetch:** `https://prestocks.com`

## 📊 Struktur Data JSON (Update September 2026)
Setiap objek produk di dalam array API PreStocks memiliki struktur wajib berikut. AI harus menggunakan skema ini untuk membuat Interface TypeScript:

```json
{
  "address": "TokenMintAddressSolana1111111111111111111",
  "product": "OpenAI",
  "symbol": "OPENAI",
  "tokenPrice": 760.55,
  "impliedVal": 150000000000, 
  "markPrice": 758.00,
  "premiumPercent": 0.33,
  "markVal": 149500000000,
  "status": "LIVE"
}
```

## 🔒 Aturan Validasi untuk AI
*   Hanya izinkan transaksi jika `status == "LIVE"`.
*   Gunakan `address` sebagai Mint Address resmi untuk instruksi swap lewat Jupiter API atau Meteora DBC.
