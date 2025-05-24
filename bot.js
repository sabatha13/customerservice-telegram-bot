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

// ✅ List of valid student IDs
const validStudentIDs = new Set([
  "ASU-9087", "ASU-0089", "ASU-5543", "ASU-1123", "ASU-5656",
  "ASU-4321", "ASU-7776", "ASU-8878", "ASU-7657", "ASU-7770",
  "ASU-65T4", "ASU-J87E", "ASU-U76R", "ASU-71Q6", "ASU-7208",
  "ASU-N79Z", "ASU-2041", "ASU-482Q", "ASU-5463", "ASU-1086",
  "ASU-0001", "ASU-9976", "ASU-2455", "ASU-4432", "ASU-97JU",
  "ASU-8754", "ASU-8909", "ASU-90H8", "ASU-767I", "ASU-90J2",
  "ASU-82WK", "ASU-Y65T", "ASU-751Q", "ASU-008G", "ASU-701A",
  "ASU-MN61", "ASU-KA42", "ASU-LK00", "ASU-BV03", "ASU-BY76",
  "ASU-AA03", "ASU-SS73", "ASU-LI81", "ASU-MK00", "ASU-JJ98",
  "ASU-LL94", "ASU-HF70", "ASU-0093"
]);

// 🗂️ ID → Name map
const studentNames = {
  "ASU-9087": "Medjyne Lubin",
  "ASU-0089": "Le Comte de Sabatha",
  "ASU-5543": "Joseph Ardouin",
  "ASU-1123": "Bien-aimé Audisson",
  "ASU-5656": "Fredo Hermisson Alfred",
  "ASU-4321": "Theodore Loucianord",
  "ASU-7776": "Stephenie Beaubrun",
  "ASU-8878": "Pierre Louis Illonny",
  "ASU-7657": "Widlere Boyer",
  "ASU-7770": "Zamor Richardson",
  "ASU-65T4": "Nadege Jeune",
  "ASU-J87E": "Augustin Dargan",
  "ASU-U76R": "Milfort Jean Bernard",
  "ASU-71Q6": "Herline Lochard",
  "ASU-7208": "Jenny Amando Cesar",
  "ASU-N79Z": "Martin Paul Fleurime",
  "ASU-2041": "Antoine Ricardo",
  "ASU-482Q": "Fieffe Sebastien",
  "ASU-5463": "Vanessa Petit Dor",
  "ASU-1086": "Confident Joseph Ernest",
  "ASU-0001": "Guilande Gourdet",
  "ASU-9976": "Confident Joseph Ernest",
  "ASU-2455": "Ramy Anilia",
  "ASU-4432": "Nerette Josemithe",
  "ASU-97JU": "Michel Eddy",
  "ASU-8754": "Elie Laurent Andral",
  "ASU-8909": "Astride Petit Dor",
  "ASU-90H8": "Benoit Ralph Jose",
  "ASU-767I": "Henrice Somoza",
  "ASU-90J2": "St Juste Garichard Gabriel",
  "ASU-82WK": "Patrick Desir",
  "ASU-Y65T": "Cyprien Euponine",
  "ASU-751Q": "Baptiste Pierrot",
  "ASU-008G": "Ginger Isaac",
  "ASU-701A": "Ryana Ternier",
  "ASU-MN61": "Max Gregord Degraff",
  "ASU-KA42": "Marie Rodriguez Dautruche",
  "ASU-LK00": "Jeanbaptiste Jean Wood",
  "ASU-BV03": "Rodly Saint Vil",
  "ASU-BY76": "Winson Hyppolite",
  "ASU-AA03": "Aliuskha Shelda Eliassaint",
  "ASU-SS73": "Eden Jean Albert",
  "ASU-LI81": "Costama Janvier",
  "ASU-MK00": "Cherismard Beauge",
  "ASU-JJ98": "Eddyson Willens ResilliacMax",
  "ASU-LL94": "Kleibenz Caperton Etienne",
  "ASU-HF70": "Jean Mario Dolciné",
  "ASU-0093": "Estinfont Vilender"
};


const RATE_LIMIT = 5;
const RATE_WINDOW = 30 * 1000; // 30 seconds


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

 const studentID = input.toUpperCase();
if (!authorizedUsers.has(userId)) {
  if (validStudentIDs.has(studentID)) {
    authorizedUsers.add(userId);

    const studentName = studentNames[studentID] || "Nom inconnu";

    // ✅ Notify Admin
    bot.telegram.sendMessage(
      process.env.ADMIN_TELEGRAM_ID,
      `🟢 *Connexion approuvée*\n👤 ${studentName}\n🆔 ${studentID}`,
      { parse_mode: 'Markdown' }
    );

    // 📝 Optionally store in Map
    ctx.session = ctx.session || {};
    ctx.session.studentName = studentName;
    ctx.session.studentID = studentID;

    ctx.reply(`✅ Bonjour ${studentName}. Comment puis-je vous assister aujourd’hui ?`);
    return ctx.reply("📧 Pour recevoir des rappels ou documents, veuillez entrer votre adresse e-mail :");
  } else {
    return ctx.reply("⛔ Identifiant invalide. Veuillez entrer un identifiant étudiant valide.");
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

const studentId = ctx.session?.studentID || 'Unknown';
const studentName = ctx.session?.studentName || 'Unknown';
const timestamp = new Date().toLocaleString(); // Local time format

axios.post(process.env.LOG_SHEET_URL, {
  studentId,
  studentName,
  userMessage: input,
  botReply: reply,
  timestamp
}).catch(err => {
  console.error("Logging error:", err.message);
});


  } catch (err) {
    console.error("Chatbase error:", err.response?.data || err.message);
    ctx.reply(messages.error[lang]);
  }
});

bot.launch();
