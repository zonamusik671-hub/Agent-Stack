// File: /Lab/Agent-Stack/airdrop.js
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const TARGET_PUBKEY = new PublicKey("GA1U3UUkLai6UwUh3ZpLrmXpgoQoQ8BUszuhTFT5BnRV");
const TARGET_BALANCE = 2.5 * LAMPORTS_PER_SOL;

const RPCS = [
  "https://solana-devnet.g.alchemy.com/v2/demo",
  "https://api.devnet.solana.com"
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function claim() {
  for (const rpc of RPCS) {
    console.log(`[+] Menghubungkan ke RPC: ${rpc}`);
    try {
      const conn = new Connection(rpc, "confirmed");
      let balance = await conn.getBalance(TARGET_PUBKEY);
      console.log(`[+] Saldo saat ini: ${balance / LAMPORTS_PER_SOL} SOL`);

      while (balance < TARGET_BALANCE) {
        console.log("[+] Meminta 1 SOL airdrop...");
        try {
          const sig = await conn.requestAirdrop(TARGET_PUBKEY, 1 * LAMPORTS_PER_SOL);
          const latestBlockhash = await conn.getLatestBlockhash();
          await conn.confirmTransaction({
            signature: sig,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          });
          balance = await conn.getBalance(TARGET_PUBKEY);
          console.log(`[✓] Saldo terbarui: ${balance / LAMPORTS_PER_SOL} SOL`);
        } catch (err) {
          console.log(`[-] Rate limit terdeteksi. Menunggu jeda 10 detik...`);
          await sleep(10000);
        }
      }
      if (balance >= TARGET_BALANCE) {
        console.log("[✓] Target 2.5 SOL tercapai.");
        process.exit(0);
      }
    } catch (err) {
      console.error(`[-] Error RPC (${rpc}): ${err.message}`);
    }
  }
}

claim();