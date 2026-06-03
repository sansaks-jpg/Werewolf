const fs = require('fs');
const sql = require('mssql');

const sqlConfigMaster = {
    user: 'sa',
    password: 'PasswordBotWerewolf123!',
    server: 'localhost',
    port: 1433,
    database: 'master',
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    connectionTimeout: 60000,
    requestTimeout: 60000
};

const sqlConfigWerewolf = {
    ...sqlConfigMaster,
    database: 'werewolf'
};

async function importSql() {
    try {
        console.log("Membaca file SQL...");
        const sqlScript = fs.readFileSync('/home/azureuser/werewolf-bot/werewolf.sql', 'utf8');
        
        // Membagi script SQL berdasarkan baris "GO" (case insensitive)
        const batches = sqlScript.split(/\r?\n[Gg][Oo]\r?\n/);
        console.log(`Ditemukan ${batches.length} batch SQL.`);

        console.log("1. Menghubungkan ke database 'master' untuk membuat database 'werewolf'...");
        let pool = await sql.connect(sqlConfigMaster);
        
        try {
            console.log("Membuat database 'werewolf'...");
            await pool.request().query("CREATE DATABASE [werewolf]");
            console.log("Database 'werewolf' berhasil dibuat!");
        } catch (err) {
            if (err.message.includes("already exists")) {
                console.log("Database 'werewolf' sudah ada, melewati pembuatan.");
            } else {
                throw err;
            }
        }
        await pool.close();

        console.log("2. Menghubungkan ke database 'werewolf' untuk mengimpor skema...");
        pool = await sql.connect(sqlConfigWerewolf);
        console.log("Koneksi ke 'werewolf' berhasil!");

        // Eksekusi batch demi batch mulai dari batch ke-3 (indeks 2)
        // karena batch 1 dan 2 adalah USE master dan CREATE DATABASE (yang menggunakan path Windows)
        for (let i = 2; i < batches.length; i++) {
            let batch = batches[i].trim();
            if (!batch) continue;

            // Abaikan query administratif database yang spesifik Windows atau file path
            if (batch.toLowerCase().startsWith('alter database') && batch.toLowerCase().includes('set')) {
                // Di SQL Server Linux, beberapa opsi ALTER DATABASE mungkin tidak didukung atau tidak relevan,
                // kita bisa mengeksekusinya tetapi jika gagal kita abaikan saja.
            }

            try {
                process.stdout.write(`Mengeksekusi batch ${i + 1}/${batches.length}... `);
                
                // Bersihkan perintah 'USE [werewolf]' atau 'USE werewolf' di awal batch jika ada
                // agar tidak membingungkan driver, karena pool kita sudah terhubung ke 'werewolf'
                if (batch.toLowerCase().startsWith('use ')) {
                    batch = batch.replace(/^use\s+\[?\w+\]?;?/i, '').trim();
                }
                
                if (!batch) {
                    console.log("Kosong (dilewati).");
                    continue;
                }

                await pool.request().query(batch);
                console.log("Sukses.");
            } catch (err) {
                console.log("Error!");
                console.error(`Gagal mengeksekusi batch ke-${i + 1}:`, err.message);
                
                // Abaikan error tertentu yang tidak fatal (seperti konfigurasi DB yang tidak didukung di Linux)
                if (err.message.includes("is not supported") || err.message.includes("does not support") || err.message.includes("Compatibility level")) {
                    console.log("Melanjutkan karena error tidak fatal (tidak didukung di Linux)...");
                } else {
                    console.error("Script batch yang gagal:");
                    console.error(batch.substring(0, 300) + "...\n");
                    console.log("Menghentikan proses.");
                    break;
                }
            }
        }

        await pool.close();
        console.log("Proses import selesai!");
    } catch (err) {
        console.error("Proses utama gagal:", err.message);
    }
}

importSql();
