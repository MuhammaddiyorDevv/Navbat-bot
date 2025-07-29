require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const cron = require("node-cron");

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = 1344592813;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;

const sections = ["Ovqat", "Musor", "Gel", "Qog'oz", "Suv"];
let queues = {};
let usersJoined = {};
let pendingConfirmations = {};

function loadData() {
  if (fs.existsSync("queues.json")) queues = JSON.parse(fs.readFileSync("queues.json"));
  else sections.forEach((s) => (queues[s] = []));

  if (fs.existsSync("users.json")) usersJoined = JSON.parse(fs.readFileSync("users.json"));
  if (fs.existsSync("pending.json")) pendingConfirmations = JSON.parse(fs.readFileSync("pending.json"));
}

function saveData() {
  fs.writeFileSync("queues.json", JSON.stringify(queues, null, 2));
  fs.writeFileSync("users.json", JSON.stringify(usersJoined, null, 2));
  fs.writeFileSync("pending.json", JSON.stringify(pendingConfirmations, null, 2));
}

function getQueueText(section) {
  const queue = queues[section];
  if (!queue || queue.length === 0) return "Navbatda hech kim yo‘q.";
  return `📋 ${section} navbati:\n\n` + queue.map((u, i) => `${i === 0 ? "👉 " : ""}@${u.username}`).join("\n");
}

loadData();

// START
bot.start((ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || `user${userId}`;

  if (!usersJoined[userId]) {
    usersJoined[userId] = {};
    saveData();
    return ctx.reply(
      "Har bir bo‘limga navbatga qo‘shilishni istaysizmi?",
      Markup.inlineKeyboard(
        sections.map((section) => Markup.button.callback(section, `JOIN_${section}`))
      )
    );
  }

  return ctx.reply("Bo‘limlardan birini tanlang:", Markup.keyboard(sections).resize());
});

// JOIN SECTION
sections.forEach((section) => {
  bot.action(`JOIN_${section}`, (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `user${userId}`;

    if (!usersJoined[userId][section]) {
      usersJoined[userId][section] = true;

      const already = queues[section].some((u) => u.id === userId);
      if (!already) queues[section].push({ id: userId, username });

      saveData();
    }

    const joinedAll = sections.every((s) => usersJoined[userId][s]);
    if (joinedAll) {
      return ctx.editMessageText("✅ Siz barcha bo‘limlarga qo‘shildingiz.");
    }

    return ctx.answerCbQuery(`${section} bo‘limiga qo‘shildingiz`);
  });

  // VIEW QUEUE
  bot.hears(section, (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `user${userId}`;

    const already = queues[section].some((u) => u.id === userId);
    if (!already) {
      queues[section].push({ id: userId, username });
      usersJoined[userId] = usersJoined[userId] || {};
      usersJoined[userId][section] = true;
      saveData();
    }

    const isUserTurn = queues[section][0]?.id === userId;

    const buttons = isUserTurn
      ? [[{ text: "✅ Bajardim", callback_data: `DONE_${section}` }]]
      : [];

    ctx.reply(getQueueText(section), {
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  });

  // DONE
  bot.action(`DONE_${section}`, async (ctx) => {
    const userId = ctx.from.id;
    const user = queues[section][0];

    if (!user || user.id !== userId) {
      return ctx.answerCbQuery("❌ Sizning navbatingiz emas!", { show_alert: true });
    }

    pendingConfirmations[section] = user;
    saveData();

    await ctx.reply("✅ Admin tasdiqlaganidan so‘ng navbat yangilanadi.");
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `@${user.username} (${section}) bo‘limida 'Bajardim' bosdi.\nNavbatni almashtirish uchun: /confirm ${section}`
    );
  });
});

// CONFIRM
bot.command("confirm", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [_, section] = ctx.message.text.split(" ");
  if (!section || !pendingConfirmations[section]) return ctx.reply("❌ Tasdiqlash uchun navbat yo‘q.");

  const queue = queues[section];
  const doneUser = queue.shift();
  queue.push(doneUser);
  delete pendingConfirmations[section];
  saveData();

  await ctx.reply(`✅ ${section} bo‘limida navbat yangilandi.`);

  await bot.telegram.sendMessage(
    GROUP_CHAT_ID,
    `✅ ${section} bo‘limida navbat yangilandi.\n@${doneUser.username} vazifani bajardi.`
  );

  const next = queue[0];
  if (next) {
    try {
      await bot.telegram.sendMessage(next.id, `🔔 @${next.username}, ${section} bo‘limida navbat sizga keldi!`);
    } catch (e) {
      console.error("❌ Foydalanuvchiga yuborib bo‘lmadi:", e.message);
    }
  }
});

// ADD USER
bot.command("adduser", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [_, rawUsername, section] = ctx.message.text.split(" ");
  if (!rawUsername || !section || !sections.includes(section)) return ctx.reply("❌ Format: /adduser @username Bo‘lim");

  const username = rawUsername.replace("@", "");
  const exists = queues[section].some((u) => u.username === username);
  if (exists) return ctx.reply("⚠️ Bu user ro‘yxatda bor.");

  queues[section].push({ id: Date.now(), username });
  saveData();
  ctx.reply(`✅ @${username} ${section} bo‘limiga qo‘shildi.`);
});

// REMOVE USER
bot.command("removeuser", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [_, rawUsername, section] = ctx.message.text.split(" ");
  if (!rawUsername || !section || !sections.includes(section)) return ctx.reply("❌ Format: /removeuser @username Bo‘lim");

  const username = rawUsername.replace("@", "");
  const index = queues[section].findIndex((u) => u.username === username);

  if (index !== -1) {
    queues[section].splice(index, 1);
    saveData();
    ctx.reply(`❌ @${username} ${section} bo‘limidan chiqarildi.`);
  } else {
    ctx.reply("❌ User topilmadi.");
  }
});

// STATUS
bot.command("status", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  let message = "📊 Hozirgi navbatlar:\n\n";
  sections.forEach((section) => {
    const q = queues[section];
    message += `🔹 ${section}:\n` + (q.length ? q.map((u, i) => `${i === 0 ? "👉" : "   "} @${u.username}`).join("\n") : "   Hech kim yo‘q") + "\n\n";
  });

  ctx.reply(message);
});

// RESET
bot.command("resetall", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  queues = {};
  usersJoined = {};
  pendingConfirmations = {};
  sections.forEach((s) => (queues[s] = []));
  saveData();

  ctx.reply("♻️ Barcha navbatlar va holatlar tozalandi.");
});

// CRON JOB (optional: eslatmalar har kuni soat 9:00 da)
cron.schedule("0 9 * * *", () => {
  sections.forEach((section) => {
    const user = queues[section]?.[0];
    if (user) {
      bot.telegram.sendMessage(user.id, `📢 Eslatma: Bugun ${section} navbati sizda.`);
    }
  });
});

bot.launch();
console.log("🤖 Bot ishga tushdi!");
