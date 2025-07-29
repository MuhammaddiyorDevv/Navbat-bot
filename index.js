require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = 1344592813;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;

const sections = ["Ovqat", "Musor", "Gel", "Qog'oz", "Suv"];
let queues = {};
let usersJoined = {};
let pendingConfirmations = {}; // { section: user }

function loadData() {
  if (fs.existsSync("queues.json")) {
    queues = JSON.parse(fs.readFileSync("queues.json"));
  } else {
    sections.forEach((s) => (queues[s] = []));
  }

  if (fs.existsSync("users.json")) {
    usersJoined = JSON.parse(fs.readFileSync("users.json"));
  }

  if (fs.existsSync("pending.json")) {
    pendingConfirmations = JSON.parse(fs.readFileSync("pending.json"));
  }
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

    const buttons = [
      isUserTurn ? [{ text: "✅ Bajardim", callback_data: `DONE_${section}` }] : []
    ].filter((row) => row.length > 0);

    ctx.reply(getQueueText(section), {
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  });

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
      `@${user.username} (${section}) bo‘limida 'Bajardim' tugmasini bosdi.\nNavbatni almashtirish uchun /confirm ${section} ni yuboring.`
    );
  });
});

// ADMIN: confirm
bot.command("confirm", async (ctx) => {
  const userId = ctx.from.id;
  const [_, section] = ctx.message.text.split(" ");

  if (userId !== ADMIN_ID) return;

  const queue = queues[section];
  if (!queue || queue.length === 0 || !pendingConfirmations[section]) {
    return ctx.reply("❌ Tasdiqlash uchun navbat yo‘q.");
  }

  const doneUser = queue.shift();
  queue.push(doneUser);
  delete pendingConfirmations[section];
  saveData();

  await ctx.reply(`✅ ${section} bo‘limida navbat yangilandi.`);

  await bot.telegram.sendMessage(
    GROUP_CHAT_ID,
    `✅ ${section} bo‘limida navbat yangilandi. @${doneUser.username} vazifani bajardi.`
  );

  const next = queue[0];
  if (next) {
    try {
      await bot.telegram.sendMessage(
        next.id,
        `🔔 @${next.username}, ${section} bo‘limidagi navbat sizga keldi!`
      );
    } catch (e) {
      console.error("Eslatma yuborilmadi:", e.message);
    }
  }
});

// ADMIN: add user
bot.command("adduser", (ctx) => {
  const [_, rawUsername, section] = ctx.message.text.split(" ");
  if (ctx.from.id !== ADMIN_ID) return;

  if (!rawUsername || !section || !sections.includes(section)) {
    return ctx.reply("❌ Format: /adduser @username Bo‘limNomi");
  }

  const username = rawUsername.replace("@", "");
  const exists = queues[section].some((u) => u.username === username);
  if (exists) return ctx.reply("⚠️ Bu user allaqachon ro'yxatda.");

  const newUser = { id: Date.now(), username };
  queues[section].push(newUser);
  saveData();

  ctx.reply(`✅ @${username} ${section} bo‘limiga qo‘shildi.`);
});

// ADMIN: remove user
bot.command("removeuser", (ctx) => {
  const [_, rawUsername, section] = ctx.message.text.split(" ");
  if (ctx.from.id !== ADMIN_ID) return;

  if (!rawUsername || !section || !sections.includes(section)) {
    return ctx.reply("❌ Format: /removeuser @username Bo‘limNomi");
  }

  const username = rawUsername.replace("@", "");
  const index = queues[section]?.findIndex((u) => u.username === username);

  if (index !== -1) {
    queues[section].splice(index, 1);
    saveData();
    ctx.reply(`❌ @${username} ${section} bo‘limidan chiqarildi.`);
  } else {
    ctx.reply("❌ User topilmadi.");
  }
});

bot.command("resetall", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  queues = {};
  usersJoined = {};
  pendingConfirmations = {};

  sections.forEach((s) => {
    queues[s] = [];
  });

  saveData();
  ctx.reply("♻️ Barcha navbatlar va foydalanuvchi holatlari tozalandi.");
});

bot.command("status", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  let message = "📊 Hozirgi navbatlar holati:\n\n";

  sections.forEach((section) => {
    const queue = queues[section];
    if (!queue || queue.length === 0) {
      message += `🔹 ${section}: Hech kim navbatda emas.\n`;
    } else {
      message += `🔹 ${section}:\n` + queue.map((u, i) => `${i === 0 ? "👉 " : "   "}@${u.username}`).join("\n") + "\n";
    }
  });

  ctx.reply(message);
});

cron.schedule("0 8 * * *", () => {
  let message = "📢 Har kungi navbat eslatmasi:\n\n";
  sections.forEach((section) => {
    const queue = queues[section];
    if (!queue || queue.length === 0) {
      message += `🔹 ${section}: Hech kim yo'q.\n`;
    } else {
      message += `🔹 ${section}: 👉 @${queue[0].username}\n`;
    }
  });

  bot.telegram.sendMessage(GROUP_CHAT_ID, message);
});


bot.launch();
console.log("🤖 Bot ishga tushdi!");
