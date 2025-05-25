require('dotenv').config();
const { Telegraf } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const axios = require('axios');

const studentNames = require('./data/student_id.json');
const certificateLinks = require('./data/certificates_students.json');

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// ✅ Use local session middleware
bot.use(new LocalSession({ database: 'session_db.json' }).middleware());


const SHEET_URL = process.env.SHEET_URL;
const CHATBASE_ID = process.env.CHATBASE_BOT_ID;
const CHATBASE_API = process.env.CHATBASE_API_KEY;

const authorizedUsers = new Set();
const userEmails = new Map();
const userMessageTimestamps = new Map();
const mutedUsers = new Map();
const userLanguages = new Map();

const validStudentIDs = new Set(Object.keys(studentNames));
const RATE_LIMIT = 5;
const RATE_WINDOW = 30 * 1000;

const restrictedKeywords = [
  'ritual', 'dream', 'spiritual', 'kabbalah', 'initiation',
  'symbol', 'meditation', 'vision', 'energy'
];

function detectLanguage(text) {
  const lower = text.toLowerCase();
  const frWords = ['bonjour', 'merci', 'examens', 'classe', 'paiement'];
  const htWords = ['bonjou', 'mèsi', 'egzamen', 'klas', 'peyman'];
  if (htWords.some(w => lower.includes(w))) return 'ht';
  if (frWords.some(w => lower.includes(w))) return 'fr';
  return 'en';
}

const messages = {
  welcome: {
    fr: '🔐 Veuillez entrer votre identifiant étudiant pour continuer.',
    ht: '🔐 Tanpri antre ID elèv ou pou kontinye.',
    en: '🔐 Please enter your student ID to continue.'
  },
  authSuccess: {
    fr: '✅ Accès accordé. Comment puis-je vous aider ?',
    ht: '✅ Aksè akòde. Kijan mwen ka ede w ?',
    en: '✅ Access granted. How can I assist you?'
  },
  authFail: {
    fr: '⛔ Identifiant invalide. Veuillez réessayer.',
    ht: '⛔ ID pa valab. Tanpri eseye ankò.',
    en: '⛔ Invalid ID. Please try again.'
  },
  restricted: {
    fr: '⚠️ Sujets spirituels interdits ici.',
    ht: '⚠️ Sijè espirityèl pa pèmèt isit.',
    en: '⚠️ Spiritual topics are not allowed here.'
  },
  fallback: {
    fr: '❓ Aucune réponse disponible. Essayez autre chose.',
    ht: '❓ Pa gen repons. Tanpri eseye ankò.',
    en: '❓ No response found. Try something else.'
  },
  error: {
    fr: '❌ Erreur technique. Veuillez réessayer plus tard.',
    ht: '❌ Erè teknik. Tanpri eseye pita.',
    en: '❌ Technical error. Please try again later.'
  }
};

bot.start((ctx) => {
  ctx.session = {}; // ✅ clean reset

  let lang = userLanguages.get(ctx.from.id);
  if (!lang) {
    lang = detectLanguage(ctx.message.text || '');
    userLanguages.set(ctx.from.id, lang);
  }
  ctx.session.lang = lang;

  ctx.reply(messages.welcome[lang]);
});


bot.command('help', (ctx) => {
  let lang = userLanguages.get(ctx.from.id);
  if (!lang) {
    lang = detectLanguage(ctx.message.text || '');
    userLanguages.set(ctx.from.id, lang);
  }

  console.log("Language in /help:", lang); // ✅ Step 1 debug log

  const helpMessages = {
    fr: `📚 *Commandes disponibles :*

- /start – Redémarrer la session
- /help – Afficher ce menu d'aide
- *certificat / diplôme / attestation* – Obtenez votre certificat
- *transcript / schedule* – Demander des documents

Si vous ne savez pas quoi écrire, posez simplement votre question.`,

    ht: `📚 *Kòmand disponib :*

- /start – Rekòmanse sesyon an
- /help – Montre meni èd la
- *sètifika / diplòm / atestasyon* – Jwenn sètifika ou
- *transcript / schedule* – Mande dokiman

Si ou pa sèten, jis poze kesyon ou.`,

    en: `📚 *Available Commands:*

- /start – Restart the session
- /help – Show this help menu
- *certificate / certificat / sètifika* – Get your certificate
- *transcript / schedule* – Request documents

If you're unsure, just type your question.`
  };

  ctx.reply(helpMessages[lang] || helpMessages.en, { parse_mode: 'Markdown' });
});

bot.command('language', (ctx) => {
  ctx.reply('🌍 Choose your language / Chwazi lang ou / Choisissez votre langue:', {
    reply_markup: {
      keyboard: [['Français', 'Kreyòl', 'English']],
      one_time_keyboard: true,
      resize_keyboard: true
    }
  });
});
bot.hears(['Français', 'Kreyòl', 'English'], (ctx) => {
  const lang = ctx.message.text === 'Français' ? 'fr'
             : ctx.message.text === 'Kreyòl' ? 'ht'
             : 'en';

  userLanguages.set(ctx.from.id, lang);
  ctx.session ??= {};
  ctx.session.lang = lang; // optional backup
  ctx.reply(`✅ Langue définie sur ${ctx.message.text}.`);
});


bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const input = ctx.message.text.trim();
  const now = Date.now();

  if (!userLanguages.has(userId)) {
    userLanguages.set(userId, detectLanguage(input));
  }
  const lang = userLanguages.get(userId);

  if (mutedUsers.has(userId)) {
    const until = mutedUsers.get(userId);
    if (now < until) return ctx.reply("⏳ Please wait a moment.");
    mutedUsers.delete(userId);
  }

  const timestamps = userMessageTimestamps.get(userId) || [];
  const recent = timestamps.filter(ts => now - ts < RATE_WINDOW);
  recent.push(now);
  userMessageTimestamps.set(userId, recent);
  if (recent.length > RATE_LIMIT) {
    mutedUsers.set(userId, now + RATE_WINDOW);
    return ctx.reply("⛔ You're sending messages too quickly.");
  }

  if (!authorizedUsers.has(userId)) {
    const studentID = input.toUpperCase();
    if (validStudentIDs.has(studentID)) {
      authorizedUsers.add(userId);
      const studentName = studentNames[studentID] || "Unknown";

      bot.telegram.sendMessage(process.env.ADMIN_TELEGRAM_ID,
        `🟢 *Login approved*\n👤 ${studentName}\n🆔 ${studentID}`,
        { parse_mode: 'Markdown' });

      ctx.session ??= {};
      ctx.session.studentName = studentName;
      ctx.session.studentID = studentID;

      ctx.reply(`✅ Hello ${studentName}. How can I help you today?`);
      return ctx.reply("📧 Please enter your email to receive notifications:");
    } else {
      delete ctx.session;
      return ctx.reply(messages.authFail[lang]);
    }
  }

  if (!userEmails.has(userId) && input.includes('@')) {
    userEmails.set(userId, input);
    ctx.reply("✅ Your email has been saved.");
    bot.telegram.sendMessage(process.env.ADMIN_TELEGRAM_ID,
      `📩 *New Email*\nID: ${userId}\n📧 ${input}`,
      { parse_mode: 'Markdown' });
    axios.post(SHEET_URL, { telegramId: userId, email: input })
      .catch(err => console.error("Sheet error:", err.message));
    return;
  }

  if (restrictedKeywords.some(word => input.toLowerCase().includes(word))) {
    return ctx.reply(messages.restricted[lang]);
  }

  // ✅ Certificate logic
  const certificateKeywords = [
    'certificate', 'certificat', 'sètifika',
    'attestation', 'attestasyon',
    'diploma', 'diplom', 'diplôme'
  ];

  if (certificateKeywords.some(k => input.toLowerCase().includes(k))) {
  const studentID = ctx.session?.studentID?.toUpperCase();
  console.log("Student ID in session:", studentID);
  const link = certificateLinks[studentID];

  if (link) {
    return ctx.reply(`📎 Here is your certificate: ${link}`);
  }

  // ✅ Ensure language is correctly detected
  let lang = userLanguages.get(userId);
  if (!lang) {
    lang = detectLanguage(input);
    userLanguages.set(userId, lang);
  }

  const fallback = {
    fr: `❗ *Aucun certificat trouvé pour votre identifiant.*\n\n**Demande de Certificat**\n\n1. **Vérifiez votre éligibilité**\n2. **Soumettez une demande à** info@academiesapienceuniverselle.org\n3. **Délai :** 7 jours ouvrables`,
    ht: `❗ *Pa gen sètifika jwenn pou ID ou a.*\n\n**Demann pou Sètifika**\n\n1. **Verifye kalifikasyon ou**\n2. **Voye demann nan** info@academiesapienceuniverselle.org\n3. **Tretman :** 7 jou travay`,
    en: `❗ *No certificate found for your ID.*\n\n**Requesting Your Certificate**\n\n1. **Check eligibility**\n2. **Send request to** info@academiesapienceuniverselle.org\n3. **Processing:** 7 business days`
  };

  return ctx.reply(fallback[lang] || fallback.en, { parse_mode: 'Markdown' });
}


  const resourceKeywords = {
    transcript: 'https://drive.google.com/file/d/TRANSCRIPT_ID/view?usp=sharing',
    schedule: 'https://drive.google.com/file/d/SCHEDULE_ID/view?usp=sharing'
  };

  const keyword = Object.keys(resourceKeywords).find(k => input.toLowerCase().includes(k));
  if (keyword) {
    return ctx.reply(`📎 Here is your ${keyword}: ${resourceKeywords[keyword]}`);
  }

  try {
    await ctx.sendChatAction('typing'); // ✅ show typing before Chatbase reply
    const response = await axios.post('https://www.chatbase.co/api/v1/chat', {
      messages: [{ role: 'user', content: input }],
      chatbotId: CHATBASE_ID,
      stream: false
    }, {
      headers: {
        Authorization: `Bearer ${CHATBASE_API}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = response.data?.messages?.[0]?.content || response.data?.text || null;
    ctx.reply(reply || messages.fallback[lang]);

    axios.post(process.env.LOG_SHEET_URL, {
      studentID: ctx.session?.studentID || 'Unknown',
      studentName: ctx.session?.studentName || 'Unknown',
      userMessage: input,
      botReply: reply,
      timestamp: new Date().toLocaleString()
    }).catch(err => console.error("Log error:", err.message));
  } catch (err) {
    console.error("Chatbase error:", err.response?.data || err.message);
    ctx.reply(messages.error[lang]);
  }
});
bot.on('document', async (ctx) => {
  const file = ctx.message.document;

  try {
    const fileInfo = await ctx.telegram.getFile(file.file_id);
    const fullUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;

    await ctx.telegram.sendMessage(
      process.env.ADMIN_TELEGRAM_ID,
      `📄 *New file from ${ctx.from.first_name || 'Unknown'}*\nID: ${ctx.from.id}\n📎 ${fullUrl}`,
      { parse_mode: 'Markdown' }
    );

    ctx.reply('✅ File received. We’ll review it shortly.');
  } catch (error) {
    console.error("File link error:", error);
    ctx.reply('❌ Sorry, we could not process the file link.');
  }
});


bot.launch().then(() => console.log("✅ Bot is running"));
