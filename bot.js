require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
const PASSCODE = process.env.PASSCODE || 'SAP101';
const authorizedUsers = new Set();
const userLanguages = new Map(); // userId → 'fr', 'ht', or 'en'

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
  const lang = detectLanguage(ctx.message.text || '') || 'en';
  userLanguages.set(ctx.from.id, lang);
  ctx.reply(messages.welcome[lang]);
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const input = ctx.message.text.trim();

  if (!userLanguages.has(userId)) {
    userLanguages.set(userId, detectLanguage(input));
  }

  const lang = userLanguages.get(userId);

  // Check access
  if (!authorizedUsers.has(userId)) {
    if (input === PASSCODE) {
      authorizedUsers.add(userId);
      return ctx.reply(messages.passcodeSuccess[lang]);
    } else {
      return ctx.reply(messages.passcodeFail[lang]);
    }
  }

  // Restrict spiritual topics
  if (restrictedKeywords.some(w => input.toLowerCase().includes(w))) {
    return ctx.reply(messages.restricted[lang]);
  }

  // Chatbase query
  try {
    console.log("User input:", input);

    const response = await axios.post('https://www.chatbase.co/api/v1/chat', {
      messages: [{ role: 'user', content: input }],
      chatbotId: process.env.CHATBASE_BOT_ID,
      stream: false
    }, {
      headers: {
        Authorization: `Bearer ${process.env.CHATBASE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log("Chatbase raw response:", JSON.stringify(response.data, null, 2));

    const reply = response.data?.text;

    if (reply) {
      ctx.reply(reply);
    } else {
      ctx.reply(messages.fallback[lang]);
    }
  } catch (err) {
    console.error("Error contacting Chatbase:", err.response?.data || err.message);
    ctx.reply(messages.error[lang]);
  }
});

bot.launch();
