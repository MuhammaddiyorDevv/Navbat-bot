require("dotenv").config();
const { Telegraf } = require("telegraf");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");

const bot = new Telegraf(process.env.BOT_TOKEN);

const adminId = 1344592813; // Adminning Telegram IDsi
const groupId = -1002132791483; // Guruh ID

const sectionsPath = path.join(__dirname, "sections.json");

let sections = {
  Ovqat: {
    fixedSchedule: {
      Dushanba: "@djurayev_19",
      Seshanba: "@Odiljonov_02",
      Chorshanba: "@qosimjon_1",
      Payshanba: "@gulomoov_1",
      Juma: "@Odiljonov_02",
      Shanba: "@Asadullohbek",
      Yakshanba: "@Asadullohbek",
    },
  },
  Musor: [],
  Gel: [],
  Qogoz: [],
  Suv: [],
};

function loadSections() {
  if (fs.existsSync(sectionsPath)) {
    const data = fs.readFileSync(sectionsPath);
    try {
      const parsed = JSON.parse(data);
      Object.keys(parsed).forEach((key) => {
        if (key === "Ovqat") {
          sections[key].fixedSchedule = parsed[key].fixedSchedule;
        } else {
          sections[key] = parsed[key];
        }
      });
    } catch (e) {
      console.error("Invalid JSON format in sections.json");
    }
  }
}

function saveSections() {
  const dataToSave = {
    Ovqat: {
      fixedSchedule: sections.Ovqat.fixedSchedule,
    },
    Musor: sections.Musor,
    Gel: sections.Gel,
    Qogoz: sections.Qogoz,
    Suv: sections.Suv,
  };
  fs.writeFileSync(sectionsPath, JSON.stringify(dataToSave, null, 2));
}

loadSections();

bot.command("adduser", async (ctx) => {
  const senderId = ctx.message.from.id;
  if (senderId !== adminId) return;

  const args = ctx.message.text.split(" ");
  if (args.length < 3) return ctx.reply("Foydalanuvchi va bo‘limni kiriting");
  const username = args[1];
  const section = args[2];

  if (!sections[section]) return ctx.reply("Bo‘lim mavjud emas");

  if (section === "Ovqat") return ctx.reply("Ovqat bo‘limiga foydalanuvchi qo‘shib bo‘lmaydi, u jadval asosida ishlaydi.");

  if (!sections[section].includes(username)) {
    sections[section].push(username);
    saveSections();
    ctx.reply(`${username} ${section} bo‘limiga qo‘shildi`);
  } else {
    ctx.reply(`${username} allaqachon ${section} bo‘limida mavjud`);
  }
});

bot.command("removeuser", async (ctx) => {
  const senderId = ctx.message.from.id;
  if (senderId !== adminId) return;

  const args = ctx.message.text.split(" ");
  if (args.length < 3) return ctx.reply("Foydalanuvchi va bo‘limni kiriting");
  const username = args[1];
  const section = args[2];

  if (!sections[section]) return ctx.reply("Bo‘lim mavjud emas");

  if (section === "Ovqat") return ctx.reply("Ovqat bo‘limidagi jadval o‘zgartirib bo‘lmaydi");

  const index = sections[section].indexOf(username);
  if (index === -1) return ctx.reply(`${username} ${section} bo‘limida topilmadi`);

  sections[section].splice(index, 1);
  saveSections();
  ctx.reply(`${username} ${section} bo‘limidan olib tashlandi`);
});

bot.command("show", (ctx) => {
  const content = Object.entries(sections)
    .map(([key, val]) => {
      if (key === "Ovqat") {
        const days = val.fixedSchedule;
        return `🍽️ ${key}:
` + Object.entries(days).map(([d, u]) => `${d}: ${u}`).join("\n");
      } else {
        return `🔁 ${key}: ${val.join(", ")}`;
      }
    })
    .join("\n\n");

  ctx.reply(content);
});

cron.schedule("0 9 * * *", () => {
  const days = [
    "Yakshanba",
    "Dushanba",
    "Seshanba",
    "Chorshanba",
    "Payshanba",
    "Juma",
    "Shanba",
  ];
  const today = days[new Date().getDay()];
  const user = sections.Ovqat.fixedSchedule[today];
  if (user) {
    bot.telegram.sendMessage(groupId, `Bugun ovqat tayyorlash navbati: ${user}`);
  }
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
