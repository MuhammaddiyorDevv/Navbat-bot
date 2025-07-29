require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

const bot = new Telegraf(process.env.BOT_TOKEN);
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const ADMIN_ID = 1344592813;
const sections = ["Ovqat", "Musor", "Gel", "Qog'oz", "Suv"];

let queues = {};
let pendingApprovals = {}; // section -> user
let usersJoined = {};

function loadData() {
  if (fs.existsSync("queues.json")) queues = JSON.parse(fs.readFileSync("queues.json"));
  else sections.forEach((s) => (queues[s] = []));

  if (fs.existsSync("users.json")) usersJoined = JSON.parse(fs.readFileSync("users.json"));
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

loadData();

// ADMIN komandasi orqali user qo‘shish
bot.command("adduser", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Sizda ruxsat yo‘q.");

  const parts = ctx.message.text.split(" ");
  if (parts.length < 3) return ctx.reply("Foydalanish: /adduser <@username> <section>");

  const username = parts[1].replace("@", "");
  const section = parts[2];
  if (!sections.includes(section)) return ctx.reply("Bo‘lim topilmadi.");

  const id = Date.now(); // Fake ID (real ID bo‘lmasa)
  queues[section].push({ id, username });
  saveData();
  ctx.reply(`✅ @${username} ${section} navbatiga qo‘shildi.`);
});

// User navbatni ko‘rish uchun
sections.forEach((section) => {
  bot.hears(section, (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `user${userId}`;
    const queue = queues[section];

    const isInQueue = queue.some((u) => u.id === userId);
    if (!isInQueue) {
      queue.push({ id: userId, username });
      saveData();
      ctx.reply(`${section} bo‘limiga qo‘shildingiz.`);
    }

    const isUserTurn = queue.length > 0 && queue[0].id === userId;
    const buttons = [
      isUserTurn ? [{ text: "✅ Bajardim", callback_data: `DONE_${section}` }] : [],
      [{ text: "❌ Chiqish", callback_data: `LEAVE_${section}` }],
    ].filter(row => row.length > 0);

    ctx.reply(getQueueText(section), {
      reply_markup: { inline_keyboard: buttons },
    });
  });

  bot.action(`DONE_${section}`, async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    const queue = queues[section];

    if (queue.length > 0 && queue[0].id === userId) {
      pendingApprovals[section] = queue[0]; // saqlaymiz

      await bot.telegram.sendMessage(ADMIN_ID, `✅ @${username} ${section} ishini bajarganini bildirdi. Tasdiqlaysizmi?`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Tasdiqlayman", callback_data: `CONFIRM_${section}` }],
          ],
        },
      });

      await bot.telegram.sendMessage(GROUP_CHAT_ID, `📢 @${username} ${section} bo‘limidagi vazifani bajarganini bildirdi. Admin tasdiqlashini kutmoqda.`);
      await ctx.answerCbQuery("Tasdiq uchun adminga yuborildi.");
    } else {
      ctx.answerCbQuery("❌ Sizning navbatingiz emas!", { show_alert: true });
    }
  });

  bot.action(`CONFIRM_${section}`, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery("❌ Ruxsat yo‘q");

    const queue = queues[section];
    const doneUser = pendingApprovals[section];

    if (queue.length > 0 && doneUser && queue[0].username === doneUser.username) {
      queue.shift();
      queue.push(doneUser);
      saveData();
      delete pendingApprovals[section];

      await ctx.reply(`✅ @${doneUser.username} tasdiqlandi. Navbat yangilandi.`);
      const next = queue[0];
      if (next) {
        await bot.telegram.sendMessage(next.id, `🔔 @${next.username}, ${section} bo‘limidagi navbat sizga keldi!`);
      }
    } else {
      ctx.reply("⚠️ Navbat allaqachon o‘zgargan yoki noto‘g‘ri holat.");
    }
  });

  bot.action(`LEAVE_${section}`, (ctx) => {
    const userId = ctx.from.id;
    const queue = queues[section];
    const index = queue.findIndex((u) => u.id === userId);
    if (index !== -1) {
      queue.splice(index, 1);
      saveData();
      ctx.reply(`Siz ${section} navbatidan chiqarildingiz.`);
    } else {
      ctx.answerCbQuery("Siz bu navbatda emassiz.");
    }
  });
});

bot.launch();
console.log("🤖 Bot ishga tushdi!");
