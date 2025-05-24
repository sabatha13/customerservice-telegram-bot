require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
const SHEET_URL = process.env.SHEET_URL;
const PASSCODE = process.env.PASSCODE || 'SAP101';
const CHATBASE_ID = process.env.CHATBASE_BOT_ID;
const CHATBASE_API = process.env.CHATBASE_API_KEY;

const authorizedUsers = new Set();
const userEmails = new Map();
const userMessageTimestamps = new Map();
const mutedUsers = new Map();
const userLanguages = new Map();

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
    fr: '🔐 Bienvenue au service étudiant de l’Académie Sapience Universelle.\nVeuillez entrer votre code d’accès pour continuer.',
    ht: '🔐 Byenveni nan sèvis elèv Akademi Sapience Universelle.\nTanpri antre kòd aksè ou pou kontinye.',
    en: '🔐 Welcome to the Académie Sapience Universelle Student Services.\nPlease enter your student access code to continue.'
  },
  passcodeSuccess: {
    fr: '✅ Accès accordé. Comment puis-je vous aider ?',
    ht: '✅ Aksè akòde. Kijan mwen ka ede w ?',
    en: '✅ Access granted. How can I assist you with your student services today?'
  },
  passcodeFail: {
    fr: '⛔ Code invalide. Veuillez réessayer.',
    ht: '⛔ Kòd aksè pa valab. Tanpri eseye ankò.',
    en: '⛔ Invalid passcode. Please enter your correct student access code.'
  },
  restricted: {
    fr: '⚠️ Je suis ici pour les questions administratives et techniques uniquement. Pour les sujets spirituels, veuillez contacter le Professeur THOTH.',
    ht: '⚠️ Mwen la pou kesyon administratif ak teknik sèlman. Pou sijè espirityèl, kontakte Pwofesè THOTH.',
    en: '⚠️ I’m here to help with administrative and technical questions only. For spiritual topics, please contact Professeur THOTH.'
  },
  fallback: {
    fr: '❓ Je n’ai pas trouvé de réponse à cette question. Veuillez reformuler ou contacter l’assistance.',
    ht: '❓ Mwen pa jwenn repons pou kesyon sa. Tanpri eseye mete l lòt jan oswa kontakte sipò.',
    en: '❓ I couldn’t find a response for that. Try rephrasing or contact support.'
  },
  error: {
    fr: '❌ Une erreur est survenue. Veuillez réessayer plus tard.',
    ht: '❌ Gen yon erè ki fèt. Tanpri eseye ankò pita.',
    en: '❌ There was an error contacting the support system. Please try again later.'
  }
};

bot.start((ctx) => {
  const lang = detectLanguage(ctx.message.text || '');
  userLanguages.set(ctx.from.id, lang);
  ctx.reply(messages.welcome[lang]);
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const input = ctx.message.text.trim();
  const now = Date.now();

  if (!userLanguages.has(userId)) {
    userLanguages.set(userId, detectLanguage(input));
  }
  const lang = userLanguages.get(userId);

  // 🚫 If muted
  if (mutedUsers.has(userId)) {
    const until = mutedUsers.get(userId);
    if (now < until) {
      return ctx.reply({
        fr: "⚠️ Vous envoyez trop de messages. Veuillez patienter quelques instants.",
        ht: "⚠️ Ou ap voye twòp mesaj. Tanpri tann kèk segond.",
        en: "⚠️ You’re sending too many messages. Please wait a moment."
      }[lang]);
    } else {
      mutedUsers.delete(userId);
    }
  }

  // ⏱️ Spam detection
  const timestamps = userMessageTimestamps.get(userId) || [];
  const recent = timestamps.filter(ts => now - ts < RATE_WINDOW);
  recent.push(now);
  userMessageTimestamps.set(userId, recent);

  if (recent.length > RATE_LIMIT) {
    mutedUsers.set(userId, now + RATE_WINDOW);
    return ctx.reply({
      fr: "⚠️ Trop de messages envoyés. Veuillez attendre 1 minute.",
      ht: "⚠️ Ou voye twòp mesaj. Tanpri tann 1 minit.",
      en: "⚠️ You’re sending too many messages. Please wait 1 minute."
    }[lang]);
  }

  // 🔐 Passcode check
  if (!authorizedUsers.has(userId)) {
    if (input === PASSCODE) {
      authorizedUsers.add(userId);
      ctx.reply(messages.passcodeSuccess[lang]);
      return ctx.reply("📧 Pour recevoir des rappels ou documents, veuillez entrer votre adresse e-mail:");
    } else {
      return ctx.reply(messages.passcodeFail[lang]);
    }
  }

  // 📧 Email capture
  if (!userEmails.has(userId) && input.includes('@')) {
  userEmails.set(userId, input);
  ctx.reply("✅ Merci, votre adresse a été enregistrée.");

  // ✅ Notify admin
  bot.telegram.sendMessage(
    process.env.ADMIN_TELEGRAM_ID,
    `📩 *New Email Captured*\n👤 ID: ${userId}\n📧 ${input}`,
    { parse_mode: 'Markdown' }
  );

  // ✅ Send to Google Sheet
  axios.post(SHEET_URL, {
    telegramId: userId,
    email: input
  }).catch(err => {
    console.error("Google Sheet error:", err.message);
  });

  return;
}


  // 🚫 Filter restricted topics
  if (restrictedKeywords.some(word => input.toLowerCase().includes(word))) {
    return ctx.reply(messages.restricted[lang]);
  }

  // 🤖 Chatbase integration
  try {
    console.log("User input:", input);

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
    // 📝 Log interaction to Google Sheet
    console.log("➡️ Sending to Google Sheet:", {
  url: process.env.LOG_SHEET_URL,
  payload: {
    telegramId: userId,
    userMessage: input,
    botReply: reply
  }
});

axios.post(process.env.LOG_SHEET_URL, {
  telegramId: userId,
  userMessage: input,
  botReply: reply
}).catch(err => {
  console.error("Logging error:", err.message);
});


  } catch (err) {
    console.error("Chatbase error:", err.response?.data || err.message);
    ctx.reply(messages.error[lang]);
  }
});

bot.launch();
