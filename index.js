require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const cron = require("node-cron");

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = 1344592813;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID; // .env faylga joylang

const sections = ["Ovqat", "Musor", "Gel", "Qog'oz", "Suv"];
let queues = {};
let usersJoined = {};
let pendingActions = {};

function loadData() {
  if (fs.existsSync("queues.json")) {
    queues = JSON.parse(fs.readFileSync("queues.json"));
  } else {
    sections.forEach((section) => (queues[section] = []));
  }

  if (fs.existsSync("users.json")) {
    usersJoined = JSON.parse(fs.readFileSync("users.json"));
  }
}

function saveData() {
  fs.writeFileSync("queues.json", JSON.stringify(queues, null, 2));
  fs.writeFileSync("users.json", JSON.stringify(usersJoined, null, 2));
}

function getQueueText(section) {
  const queue = queues[section];
  if (!queue || queue.length === 0) return "Navbatda hech kim yo‘q.";

  return `📋 ${section} navbati:\n\n` + queue.map((u, i) => `${i === 0 ? "👉 " : ""}@${u.username}`).join("\n");
}

function getUser(username) {
  return username.startsWith("@") ? username.slice(1) : username;
}

loadData();

bot.start((ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || `user${userId}`;

  if (!usersJoined[userId]) {
    usersJoined[userId] = {};
    saveData();
    return ctx.reply(
      "Har bir bo‘limga navbatga qo‘shilishni istaysizmi?",
      Markup.inlineKeyboard(
        sections.map((section) =>
          Markup.button.callback(section, `JOIN_${section}`)
        )
      )
    );
  }

  return ctx.reply("Bo‘limlardan birini tanlang:", Markup.keyboard(sections).resize());
});

// JOIN
sections.forEach((section) => {
  bot.action(`JOIN_${section}`, (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `user${userId}`;

    usersJoined[userId] = usersJoined[userId] || {};

    if (!usersJoined[userId][section]) {
      usersJoined[userId][section] = true;

      if (section === "Ovqat" || !queues[section].some((u) => u.id === userId)) {
        queues[section].push({ id: userId, username });
        saveData();
      }
    }

    const joinedAll = sections.every((s) => usersJoined[userId][s]);
    if (joinedAll) {
      return ctx.editMessageText("✅ Siz barcha bo‘limlarga qo‘shildingiz.");
    }

    return ctx.answerCbQuery(`${section} bo‘limiga qo‘shildingiz`);
  });

  bot.hears(section, (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `user${userId}`;
    usersJoined[userId] = usersJoined[userId] || {};

    if (section === "Ovqat" || !queues[section].some((u) => u.id === userId)) {
      queues[section].push({ id: userId, username });
      usersJoined[userId][section] = true;
      saveData();
    }

    const isUserTurn = queues[section][0]?.id === userId;

    const buttons = [
      isUserTurn ? [{ text: "✅ Bajardim", callback_data: `DONE_${section}` }] : [],
      [{ text: "❌ Chiqish", callback_data: `LEAVE_${section}` }],
    ].filter(row => row.length > 0);

    ctx.reply(getQueueText(section), {
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  });

  // ✅ Bajardim
  bot.action(`DONE_${section}`, async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `user${userId}`;
    const queue = queues[section];

    if (queue[0]?.id !== userId) {
      return ctx.answerCbQuery("❌ Sizning navbatingiz emas!", { show_alert: true });
    }

    pendingActions[section] = { type: "done", user: queue[0] };
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `🛠 @${username} ${section} bo‘limida "Bajardim" tugmasini bosdi.\nTasdiqlaysizmi?`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Tasdiqlayman", `CONFIRM_DONE_${section}`)],
      ])
    );
    await ctx.reply("⏳ Admin tasdiqlashini kuting...");
  });

  // ❌ Chiqish (faqat admin tasdiqlasa)
  bot.action(`LEAVE_${section}`, async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `user${userId}`;
    pendingActions[`${userId}_${section}`] = { type: "leave", userId, username };

    await bot.telegram.sendMessage(
      ADMIN_ID,
      `⚠️ @${username} ${section} bo‘limidan chiqmoqchi.\nTasdiqlaysizmi?`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Chiqishga ruxsat", `CONFIRM_LEAVE_${userId}_${section}`)],
      ])
    );
    await ctx.reply("⏳ Admin tasdiqlashini kuting...");
  });
});

// ✅ Admin tasdiqlari
bot.action(/CONFIRM_DONE_(.+)/, async (ctx) => {
  const section = ctx.match[1];
  const queue = queues[section];

  if (queue.length === 0 || !pendingActions[section]) return;

  const doneUser = queue.shift();
  queue.push(doneUser);
  delete pendingActions[section];
  saveData();

  await ctx.reply("✅ Navbat yangilandi.");
  await bot.telegram.sendMessage(GROUP_CHAT_ID, `🔄 ${section} bo‘limida navbat yangilandi!`);
  const nextUser = queue[0];
  if (nextUser) {
    await bot.telegram.sendMessage(nextUser.id, `🔔 ${section} bo‘limida navbat sizga keldi, @${nextUser.username}!`);
  }
});

bot.action(/CONFIRM_LEAVE_(\d+)_(.+)/, (ctx) => {
  const userId = parseInt(ctx.match[1]);
  const section = ctx.match[2];

  const queue = queues[section];
  const index = queue.findIndex((u) => u.id === userId);
  if (index !== -1) queue.splice(index, 1);
  if (usersJoined[userId]) usersJoined[userId][section] = false;

  delete pendingActions[`${userId}_${section}`];
  saveData();

  ctx.reply(`✅ ${section} bo‘limidan chiqarildi.`);
});

// Admin: /adduser @username Section
bot.command("adduser", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [_, username, section] = ctx.message.text.split(" ");
  if (!sections.includes(section)) return ctx.reply("❌ Bo‘lim noto‘g‘ri!");

  const clean = getUser(username);
  const id = Math.floor(Math.random() * 1e10); // dummy ID
  queues[section].push({ id, username: clean });
  saveData();

  ctx.reply(`✅ @${clean} ${section} bo‘limiga qo‘shildi.`);
});

// Admin: /removeuser @username Section
bot.command("removeuser", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [_, username, section] = ctx.message.text.split(" ");
  if (!sections.includes(section)) return ctx.reply("❌ Bo‘lim noto‘g‘ri!");

  const clean = getUser(username);
  queues[section] = queues[section].filter((u) => u.username !== clean);
  saveData();

  ctx.reply(`❌ @${clean} ${section} bo‘limidan olib tashlandi.`);
});

// Cron bilan eslatma (har kuni 10:00 da)
cron.schedule("0 10 * * *", () => {
  for (const section of sections) {
    const queue = queues[section];
    if (queue.length > 0) {
      const user = queue[0];
      bot.telegram.sendMessage(
        user.id,
        `🕙 Esingizda bo‘lsin, bugun ${section} navbat sizga tegishli!`
      );
    }
  }
});

bot.launch();
console.log("🤖 Bot ishga tushdi!");
