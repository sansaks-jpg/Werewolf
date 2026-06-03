# Design MD: Werewolf for Telegram & WhatsApp

## Frontmatter (YAML)
```yaml
title: Werewolf for Telegram & WhatsApp
status: proposed
author: Antigravity
date: 2026-06-03
```

## 1. Overview
Proyek ini adalah sebuah platform bot game **Werewolf** multipemain yang dirancang untuk Telegram dan WhatsApp. Game ini dimainkan secara real-time di dalam grup chat. Sistem ini didevelop menggunakan bahasa C#, .NET Framework, SQL Server, dan dibagi menjadi arsitektur multi-proses untuk mendukung skalabilitas. 

Untuk mendukung platform **WhatsApp**, proyek ini menggunakan metode **WhatsApp Gateway Bridge**. Sebuah server perantara (Bridge) berbasis Node.js akan mengemulasikan API Telegram lokal dan menerjemahkan pesan bolak-balik antara logika game C# dan jaringan WhatsApp.

## 2. Goals & Non-Goals
### Goals
- Menyediakan platform game Werewolf yang stabil dan cepat untuk ribuan pemain secara bersamaan di Telegram dan WhatsApp.
- Memisahkan penanganan API (Control) dengan penanganan logika game (Node) agar bot tidak kelebihan beban (*rate limiting*).
- Mendukung pembaruan *hot-reload* untuk node game (menggunakan command `/replacenodes` tanpa mematikan bot utama).
- Mengintegrasikan nomor WhatsApp (via WhatsApp Web / QR scan) ke dalam bot game dengan meminimalkan perubahan pada kode C# utama.

### Non-Goals
- Tidak menulis ulang mesin logika game C# ke Node.js; seluruh logika game tetap berjalan di C# .NET.
- Tidak menggunakan API WhatsApp Business Resmi yang berbayar dan membatasi interaksi template; integrasi menggunakan pustaka emulasi WhatsApp Web (seperti Baileys atau whatsapp-web.js) untuk fleksibilitas penuh di lingkungan lokal.

## 3. User Stories
- **Sebagai Pemain WhatsApp:**
  - Saya ingin masuk ke game werewolf di grup dengan mengirim pesan `/join` atau mengetik angka pilihan yang disediakan bot.
  - Saya ingin menerima pesan pribadi (japri) dari bot yang berisi kartu peran rahasia saya (Werewolf, Seer, dll.).
  - Saya ingin melakukan vote dengan mengetik angka indeks opsi pemain (karena keterbatasan tombol WhatsApp) agar suara saya dihitung di dalam game.
- **Sebagai Administrator (Dev/Staff):**
  - Saya ingin menghubungkan bot dengan nomor WhatsApp apa pun secara dinamis dengan melakukan scan QR Code pada modul Bridge.

## 4. Architecture (WhatsApp Gateway Bridge)
Sistem terbagi menjadi beberapa komponen utama:
1. **WhatsApp Web Protocol (Meta):** Jalur komunikasi pesan untuk pengguna WhatsApp.
2. **WhatsApp Gateway Bridge (Node.js):**
   - Bertindak sebagai **Telegram API Emulator** lokal.
   - Menerima request HTTP POST dari `Werewolf Control` (seperti `/sendMessage`, `/sendDocument`) lalu memparsing isinya.
   - Menerjemahkan komponen *Inline Keyboard* Telegram menjadi teks berangka di WhatsApp (misal: "Balas dengan nomor pilihan: \n1. Player A\n2. Player B").
   - Mengirimkan pesan/media hasil terjemahan tersebut ke WhatsApp Client.
   - Menerima pesan masuk dari WhatsApp grup/pribadi, memformatnya menjadi skema JSON `Update` Telegram, dan meneruskannya ke `Werewolf Control` via webhook lokal.
3. **Werewolf Control (C#):** Diarahkan untuk menggunakan HTTP Base URL lokal (mengarah ke Node.js Bridge) alih-alih `https://api.telegram.org`.
4. **Werewolf Node (C#):** Worker game yang mengirimkan status room game ke grup/pemain melalui base URL lokal Bridge.

```mermaid
graph TD
    WhatsApp[WhatsApp App / Meta] <-->|WhatsApp Web Protocol| Bridge[WhatsApp Gateway Bridge (Node.js)]
    Bridge <-->|HTTP Emulated Telegram API| Control[Werewolf Control (C#)]
    Control <-->|Simple TCP Protocol| Node1[Werewolf Node 1 (C#)]
    Control <-->|Simple TCP Protocol| Node2[Werewolf Node 2 (C#)]
    Node1 <-->|Entity Framework| DB[(SQL Server)]
    Node2 <-->|Entity Framework| DB
    Control <-->|Entity Framework| DB
```

## 5. Detailed Design
### Configuration System (JSON vs Windows Registry)
Untuk mempermudah porting program ke lingkungan VPS/Linux (SSH), sistem pemuatan konfigurasi dirombak:
- **`config.json`**: File konfigurasi utama diletakkan di root direktori program. Modul C# (`Database`, `Werewolf Control`, dan `Werewolf Node`) akan membaca berkas JSON ini saat diinisialisasi untuk mengambil API Token, database Connection String, dan Base URL.
- **Windows Registry Fallback**: Jika dijalankan di lingkungan Windows Server, dan parameter di `config.json` kosong, program akan secara otomatis mengalihkan pemuatan konfigurasi ke Registry Windows (`HKLM\SOFTWARE\Werewolf`) agar kompatibilitas legacy tetap terjaga.

### Data Models (SQL Server)
- **dbo.Player:** Menyimpan data pengguna (ID WhatsApp berupa string/nomor telepon, Username, FirstName, dll.).
- **dbo.Group:** Menyimpan konfigurasi grup chat WhatsApp/Telegram tempat bot diundang.
- **dbo.Admin:** Daftar ID Pengguna yang memiliki hak akses administratif.

### Communication Protocol & Emulator API
Aplikasi Node.js Bridge mengimplementasikan endpoint berikut untuk mengemulasikan API Telegram:
- `POST /bot:token/sendMessage`: Mengirim teks ke WhatsApp. Jika payload berisi `reply_markup` (inline keyboard), Bridge mengubahnya menjadi format daftar bernomor di akhir pesan teks WhatsApp.
- `POST /bot:token/sendDocument` & `POST /bot:token/sendPhoto`: Mengirim media (gambar/GIF) dengan memanfaatkan buffer media WhatsApp.
- `POST /bot:token/getMe`: Mengembalikan profil bot tiruan.

## 6. Alternatives Considered
- **Refactoring Arsitektur C# secara Penuh:** Mengganti pustaka `Telegram.Bot` dengan SDK WhatsApp C# kustom. Hal ini sangat sulit karena kode game C# sangat padat dan menyatu erat dengan tipe data SDK Telegram. Opsi Gateway Bridge jauh lebih hemat waktu, aman, dan modular.

