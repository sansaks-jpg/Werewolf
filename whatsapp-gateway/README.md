# Werewolf WhatsApp Gateway Bridge

Gateway ini berfungsi sebagai perantara antara game Werewolf .NET C# (yang menggunakan SDK `Telegram.Bot`) dengan jaringan WhatsApp menggunakan library `@whiskeysockets/baileys`. 

## Cara Kerja
1. Gateway bertindak sebagai emulator API Telegram lokal di `http://localhost:5000`.
2. Program C# (`Werewolf Control` & `Werewolf Node`) dikonfigurasi untuk mengirim pesan ke `http://localhost:5000` (menggunakan parameter `BaseUrl` di Registry).
3. Tombol-tombol inline pilihan game dari Telegram (seperti Join Game, menu vote target) diterjemahkan secara otomatis oleh Gateway menjadi daftar angka (contoh: `1. Opsi A`, `2. Opsi B`). Pemain WhatsApp dapat membalas dengan mengetikkan angka pilihan tersebut.
4. Gateway menangkap pesan WhatsApp, mengemasnya menjadi skema objek JSON `Update` Telegram, lalu menyediakannya untuk dibaca oleh proses long-polling C# di endpoint `/getUpdates`.

## Cara Menggunakan

### 1. Instalasi Node.js Dependencies
Buka terminal cmd/powershell di dalam folder `whatsapp-gateway`, lalu jalankan:
```bash
npm install
```

### 2. Jalankan Gateway
Jalankan perintah berikut di folder `whatsapp-gateway`:
```bash
npm start
```
Terminal akan menampilkan **QR Code**. 
Buka aplikasi WhatsApp di HP Anda, masuk ke **Linked Devices / Perangkat Tertaut**, lalu scan QR Code tersebut untuk menghubungkan nomor WhatsApp bot Anda.

### 3. Konfigurasi Registry Windows untuk Proyek C#
Agar proyek C# Werewolf terhubung ke Gateway ini alih-alih Telegram API asli, buka `regedit` (Registry Editor) lalu tambahkan nilai String (`REG_SZ`) baru ke dalam key `HKLM\SOFTWARE\Werewolf`:
*   **Nama:** `BaseUrl`
*   **Value:** `http://localhost:5000`

Setelah Registry diset, jalankan bot `Werewolf Control` dan `Werewolf Node` Anda!
- Untuk bermain di WhatsApp, buatlah grup WhatsApp baru.
- Tambahkan nomor WhatsApp bot Anda ke dalam grup tersebut.
- Kirim pesan `/startgame` di dalam grup tersebut untuk memulai permainan.
