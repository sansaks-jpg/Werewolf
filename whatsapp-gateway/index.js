const express = require('express');
const fs = require('fs');
const path = require('path');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    delay,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

const PORT = process.env.PORT || 5000;
const app = express();
app.use(express.json());

// Path file pemetaan JID dan data persistent
const JID_MAP_FILE = path.join(__dirname, 'jid_map.json');

// Memuat data pemetaan JID
let jidMap = {
    jidToId: {},
    idToJid: {},
    lastGroupCounter: 100000,
    lastUserCounter: 100000
};

if (fs.existsSync(JID_MAP_FILE)) {
    try {
        jidMap = JSON.parse(fs.readFileSync(JID_MAP_FILE, 'utf-8'));
    } catch (e) {
        console.error("Gagal membaca jid_map.json:", e.message);
    }
}

function saveJidMap() {
    fs.writeFileSync(JID_MAP_FILE, JSON.stringify(jidMap, null, 2), 'utf-8');
}

// Fungsi pemetaan JID <-> ID Numerik C# (long)
function getIdFromJid(jid, isGroup) {
    if (jidMap.jidToId[jid]) {
        return jidMap.jidToId[jid];
    }

    let id;
    if (isGroup) {
        // ID Grup Telegram biasanya negatif (misal -100123456789)
        jidMap.lastGroupCounter++;
        id = -(1000000000000 + jidMap.lastGroupCounter);
    } else {
        // ID User positif
        jidMap.lastUserCounter++;
        id = 1000000000000 + jidMap.lastUserCounter;
    }

    jidMap.jidToId[jid] = id;
    jidMap.idToJid[id] = jid;
    saveJidMap();
    return id;
}

function getJidFromId(id) {
    const numericId = parseInt(id);
    return jidMap.idToJid[numericId] || null;
}

// Antrean update untuk polling C#
let updatesQueue = [];
let updateIdCounter = 1;

// Menyimpan menu tombol per chat agar bisa merespons ketika pengguna memilih dengan angka
let activeMessageMenus = {}; // Format: { chatId: { messageId, text, buttons: [ { text, callback_data } ] } }

// WhatsApp Socket Client
let sock;

async function connectToWhatsApp() {
    console.log("Menghubungkan ke WhatsApp...");
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    let version = [2, 3000, 1015901307]; // Fallback version
    try {
        const { version: latestVersion, isLatest } = await fetchLatestBaileysVersion();
        version = latestVersion;
        console.log(`Menggunakan WA Web v${version.join('.')}, isLatest: ${isLatest}`);
    } catch (e) {
        console.warn("Gagal mengambil versi WA terbaru, menggunakan versi cadangan:", e.message);
    }

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        version: version,
        defaultQueryTimeoutMs: undefined
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("\n--- SILAKAN SCAN QR CODE BERIKUT DENGAN WHATSAPP ANDA ---");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus karena ', lastDisconnect.error, ', mencoba menghubungkan kembali: ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('--- KONEKSI WHATSAPP BERHASIL TERBUKA! ---');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Menerima pesan masuk dari WhatsApp
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = msg.key.participant || from;
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     "";

        console.log(`[Pesan Masuk] Dari: ${from} (User: ${sender}) -> ${text}`);

        const chatId = getIdFromJid(from, isGroup);
        const userId = getIdFromJid(sender, false);
        const senderName = msg.pushName || "WhatsApp User";

        // Periksa apakah pesan berupa pilihan menu berangka (input pilihan tombol)
        let handledAsButton = false;
        if (activeMessageMenus[chatId]) {
            const menu = activeMessageMenus[chatId];
            const choice = parseInt(text.trim());
            
            // Periksa jika input berupa angka pilihan yang valid
            if (!isNaN(choice) && choice > 0 && choice <= menu.buttons.length) {
                const selectedButton = menu.buttons[choice - 1];
                console.log(`[Menu Klik] User ${senderName} memilih: ${selectedButton.text} (Callback: ${selectedButton.callback_data})`);
                
                // Tambahkan CallbackQuery update ke antrean
                updatesQueue.push({
                    update_id: updateIdCounter++,
                    callback_query: {
                        id: String(Math.floor(Math.random() * 100000000)),
                        from: {
                            id: userId,
                            is_bot: false,
                            first_name: senderName,
                            username: sender.split('@')[0]
                        },
                        message: {
                            message_id: menu.messageId,
                            chat: {
                                id: chatId,
                                type: isGroup ? 'supergroup' : 'private',
                                title: isGroup ? 'WhatsApp Group' : senderName
                            },
                            text: menu.text
                        },
                        data: selectedButton.callback_data
                    }
                });
                handledAsButton = true;
            }
        }

        // Jika tidak ditangani sebagai input tombol, proses sebagai pesan teks biasa
        if (!handledAsButton) {
            // Bersihkan teks command agar kompatibel dengan C# (misal memotong username bot di Telegram)
            let formattedText = text;
            if (text.startsWith('/')) {
                // Di Telegram, bot sering menerima command seperti /startgame@botname. Di WA kita hilangkan suffix bot.
                formattedText = text.replace(/@[a-zA-Z0-9_]+/g, '');
            }

            updatesQueue.push({
                update_id: updateIdCounter++,
                message: {
                    message_id: Math.floor(Math.random() * 100000000),
                    from: {
                        id: userId,
                        is_bot: false,
                        first_name: senderName,
                        username: sender.split('@')[0]
                    },
                    chat: {
                        id: chatId,
                        type: isGroup ? 'supergroup' : 'private',
                        title: isGroup ? 'WhatsApp Group' : senderName
                    },
                    text: formattedText,
                    date: Math.floor(Date.now() / 1000)
                }
            });
        }
    });
}

// === TELEGRAM API EMULATION ENDPOINTS ===

// 1. getMe
app.post('/bot:token/getMe', (req, res) => {
    res.json({
        ok: true,
        result: {
            id: 88888888,
            is_bot: true,
            first_name: "Werewolf WA Bot",
            username: "werewolf_wa_bot"
        }
    });
});

// 2. getUpdates (Polling)
app.get('/bot:token/getUpdates', (req, res) => {
    const offset = parseInt(req.query.offset) || 0;
    
    // Filter update berdasarkan offset
    const filteredUpdates = updatesQueue.filter(u => u.update_id >= offset);
    
    // Jika offset bertambah besar, bersihkan antrean lama untuk hemat memori
    if (offset > 0) {
        updatesQueue = updatesQueue.filter(u => u.update_id >= offset);
    }

    res.json({
        ok: true,
        result: filteredUpdates
    });
});

// Helper untuk membersihkan tag HTML karena WA tidak mendukung HTML tag secara penuh
function cleanHtmlTags(text) {
    return text
        .replace(/<b>(.*?)<\/b>/g, '*$1*') // Bold
        .replace(/<strong>(.*?)<\/strong>/g, '*$1*')
        .replace(/<i>(.*?)<\/i>/g, '_$1_') // Italic
        .replace(/<em>(.*?)<\/em>/g, '_$1_')
        .replace(/<code>(.*?)<\/code>/g, '`$1`') // Monospace
        .replace(/<pre>(.*?)<\/pre>/g, '```$1```')
        .replace(/<a href='.*?'>.*?<\/a>/g, '') // Hilangkan link tersembunyi
        .replace(/<a href=".*?">.*?<\/a>/g, '')
        .replace(/<br\s*\/?>/g, '\n') // Line break
        .replace(/<[^>]*>/g, ''); // Hilangkan tag lainnya
}

// 3. sendMessage
app.post('/bot:token/sendMessage', async (req, res) => {
    const { chat_id, text, reply_markup, parse_mode } = req.body;
    
    const jid = getJidFromId(chat_id);
    if (!jid) {
        return res.status(400).json({ ok: false, description: "WhatsApp JID tidak ditemukan untuk ID: " + chat_id });
    }

    let finalMessage = cleanHtmlTags(text);
    let buttonsList = [];

    // Mengubah inline keyboard Telegram ke opsi teks bernomor untuk WhatsApp
    if (reply_markup && reply_markup.inline_keyboard) {
        let optionsText = "\n\n*Pilih opsi dengan membalas nomor:*";
        let optionCounter = 1;
        
        reply_markup.inline_keyboard.forEach(row => {
            row.forEach(btn => {
                optionsText += `\n*${optionCounter}*. ${btn.text}`;
                buttonsList.push({
                    text: btn.text,
                    callback_data: btn.callback_data
                });
                optionCounter++;
            });
        });
        
        finalMessage += optionsText;
    }

    const messageId = "MSG_" + Math.floor(Math.random() * 100000000);

    try {
        console.log(`[Kirim Pesan] Menuju: ${jid} -> ${finalMessage.substring(0, 80)}...`);
        await sock.sendMessage(jid, { text: finalMessage });

        // Simpan menu aktif agar ketika user mengetik angka pilihan, kita tahu menu mana yang dimaksud
        if (buttonsList.length > 0) {
            activeMessageMenus[chat_id] = {
                messageId: Math.floor(Math.random() * 100000000),
                text: text,
                buttons: buttonsList
            };
        }

        res.json({
            ok: true,
            result: {
                message_id: Math.floor(Math.random() * 100000000),
                chat: { id: chat_id }
            }
        });
    } catch (err) {
        console.error("Gagal mengirim pesan WhatsApp:", err.message);
        res.status(500).json({ ok: false, description: err.message });
    }
});

// 4. sendDocument / sendPhoto (Mengirim GIF/Gambar)
app.post('/bot:token/sendDocument', async (req, res) => {
    const { chat_id, document, caption } = req.body;
    const jid = getJidFromId(chat_id);
    if (!jid) return res.status(400).json({ ok: false, description: "JID tidak ditemukan" });

    let cleanCaption = caption ? cleanHtmlTags(caption) : "";

    try {
        console.log(`[Kirim Dokumen/Media] Menuju: ${jid}`);
        // Di Telegram, werewolf mengirimkan ID File GIF. Kita bisa abaikan atau kirim file default.
        // Untuk saat ini, kita kirimkan caption teks saja, atau jika 'document' berupa URL, kita kirimkan URL gambarnya.
        let msgPayload = { text: `${cleanCaption}\n\n[Media: ${document}]` };
        
        if (typeof document === 'string' && document.startsWith('http')) {
            msgPayload = { image: { url: document }, caption: cleanCaption };
        }

        await sock.sendMessage(jid, msgPayload);
        res.json({ ok: true, result: { message_id: Math.floor(Math.random() * 100000000) } });
    } catch (err) {
        res.status(500).json({ ok: false, description: err.message });
    }
});

app.post('/bot:token/sendPhoto', async (req, res) => {
    const { chat_id, photo, caption } = req.body;
    const jid = getJidFromId(chat_id);
    if (!jid) return res.status(400).json({ ok: false, description: "JID tidak ditemukan" });

    let cleanCaption = caption ? cleanHtmlTags(caption) : "";

    try {
        console.log(`[Kirim Foto] Menuju: ${jid}`);
        let msgPayload = { text: `${cleanCaption}\n\n[Foto: ${photo}]` };
        if (typeof photo === 'string' && photo.startsWith('http')) {
            msgPayload = { image: { url: photo }, caption: cleanCaption };
        }
        await sock.sendMessage(jid, msgPayload);
        res.json({ ok: true, result: { message_id: Math.floor(Math.random() * 100000000) } });
    } catch (err) {
        res.status(500).json({ ok: false, description: err.message });
    }
});

// Menjalankan express server
app.listen(PORT, () => {
    console.log(`WhatsApp Emulator API berjalan di port ${PORT}`);
});

// Hubungkan ke WhatsApp
connectToWhatsApp();
