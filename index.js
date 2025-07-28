require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

const bot = new Telegraf(process.env.BOT_TOKEN);
const sections = ["Ovqat", "Musor", "Gel", "Qog'oz", "Suv"];

let queues = {};
let usersJoined = {};

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

  const lines = queue.map((user, i) => {
    return `${i === 0 ? "👉 " : ""}@${user.username}`;
  });
  return `📋 ${section} navbati:\n\n` + lines.join("\n");
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

// Qo‘shilish tugmalari
sections.forEach((section) => {
  bot.action(`JOIN_${section}`, (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `user${userId}`;

    if (!usersJoined[userId][section]) {
      usersJoined[userId][section] = true;

      const alreadyInQueue = queues[section].some((u) => u.id === userId);
      if (!alreadyInQueue) {
        queues[section].push({ id: userId, username });
      }

      saveData();
    }

    const joinedAll = sections.every((s) => usersJoined[userId][s]);
    if (joinedAll) {
      return ctx.editMessageText("Siz barcha bo‘limlarga qo‘shildingiz.");
    }

    return ctx.answerCbQuery(`${section} bo‘limiga qo‘shildingiz`);
  });

  // Bo‘lim tanlanganda
  bot.hears(section, (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `user${userId}`;

    const alreadyInQueue = queues[section].some((u) => u.id === userId);
    if (!alreadyInQueue) {
      queues[section].push({ id: userId, username });
      usersJoined[userId] = usersJoined[userId] || {};
      usersJoined[userId][section] = true;
      saveData();
      ctx.reply(`${section} bo‘limiga qo‘shildingiz.`);
    }

    const queue = queues[section];
    const isUserTurn = queue.length > 0 && queue[0].id === userId;

    ctx.reply(getQueueText(section), {
      reply_markup: {
        inline_keyboard: [
          isUserTurn ? [{ text: "✅ Bajardim", callback_data: `DONE_${section}` }] : [],
          [{ text: "❌ Chiqish", callback_data: `LEAVE_${section}` }],
        ].filter((row) => row.length > 0),
      },
    });
  });

  // Bajardim
  bot.action(`DONE_${section}`, (ctx) => {
    const userId = ctx.from.id;
    const queue = queues[section];

    if (queue.length > 0 && queue[0].id === userId) {
      const doneUser = queue.shift();
      queue.push(doneUser);
      saveData();
      ctx.reply(`✅ @${doneUser.username} vazifani bajardi. Navbat yangilandi.`);
    } else {
      ctx.answerCbQuery("Sizning navbatingiz emas!", { show_alert: true });
    }
  });

  // Chiqish
  bot.action(`LEAVE_${section}`, (ctx) => {
    const userId = ctx.from.id;
    const queue = queues[section];

    const index = queue.findIndex((u) => u.id === userId);
    if (index !== -1) {
      queue.splice(index, 1);
      usersJoined[userId][section] = false;
      saveData();
      ctx.reply(`Siz ${section} bo‘limidan chiqarildingiz.`);
    } else {
      ctx.answerCbQuery("Siz bu navbatda emassiz.");
    }
  });
});

bot.launch();
console.log("🤖 Bot ishga tushdi!");
