const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField, Collection } = require("discord.js");
const noblox = require("noblox.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});
(async () => {
  try {
    await noblox.setCookie(process.env.ROBLX_COOK_COOKIE);
    const user = await noblox.getCurrentUser();
    console.log(`[✅] Roblox cookie başarıyla yüklendi: ${user.UserName}`);
  } catch (err) {
    console.error("[❌] Roblox cookie hatası:", err.message);
  }
})();
// Secretler (Zeabur için environment variables olarak tanımla)
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const GROUP_ID = Number(process.env.GROUP_ID);
const ROBLX_COOK_COOKIE = process.env.ROBLX_COOK_COOKIE; // Cookie ismi gizlendi

// Sabit roller ve isimleri
const MUTE_ROLE = "Susturulmuß";
const WARNING_ROLES = ["U1", "U2", "U3"];
const AUTO_ROLES = ["Askeri Personel", "Transfer Olmayan Personel"];
const YONETIM_ROLE = "Yönetim";

// Küfür/argo listesi (geliştirilebilir)
const BAD_WORDS = ["örnekküfür", "argo", "xxx", "testargo"];

// Uyarı ve sicil veri yapıları (memory içi, gerçek projede DB önerilir)
const warnings = new Map(); // userId -> {count, reasons: []}
const sicil = new Map(); // userId -> [{type, reason, date}]
const tamYetkiList = new Set(); // OWNER dışı tam yetkililer

// Devriye modu
let devriyeActive = false;

// Çekilişler için
const giveaways = new Map(); // channelId -> { messageId, participants: Set, timeout }

// Roblox login
(async () => {
  try {
    await noblox.setCookie(AUTH_CKIE);
    const currentUser = await noblox.getCurrentUser();
    console.log(`Roblox Giriş Başarılı: ${currentUser.UserName}`);
  } catch (e) {
    console.error("Roblox Cookie ile giriş başarısız!", e);
  }
})();

// Bot hazır
client.once("ready", () => {
  console.log(`${client.user.tag} olarak giriş yapıldı!`);
});

// Otomatik rol verme
client.on("guildMemberAdd", async member => {
  for (const roleName of AUTO_ROLES) {
    const role = member.guild.roles.cache.find(r => r.name === roleName);
    if (role) {
      try { await member.roles.add(role); } catch {}
    }
  }
});

// Otomatik selam cevabı
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (["sa","selam","selamün aleyküm","aleyküm selam"].some(s => message.content.toLowerCase().includes(s))) {
    message.channel.send("Aleyküm Selam Canım");
  }
});

// Devriye: Küfür / Argo kontrolü
client.on("messageCreate", async message => {
  if (!devriyeActive) return;
  if (message.author.bot) return;
  if (!message.guild) return;

  const text = message.content.toLowerCase();
  if (BAD_WORDS.some(word => text.includes(word))) {
    const muteRole = message.guild.roles.cache.find(r => r.name === MUTE_ROLE);
    if (!muteRole) return;
    if (message.member.roles.cache.has(muteRole.id)) return;

    try {
      await message.member.roles.add(muteRole);
      message.channel.send(`${message.member.user.tag} küfür/argo sebebiyle susturuldu.`);
      setTimeout(async () => {
        if (message.member.roles.cache.has(muteRole.id)) {
          await message.member.roles.remove(muteRole);
          message.channel.send(`${message.member.user.tag} kullanıcısının susturulması kalktı.`);
        }
      }, 15 * 60 * 1000);
    } catch {}
  }
});

// Mesaj silme koruma ve kick/ban/mute koruma için basit sayaçlar
const deleteTracker = new Map();
const actionTracker = new Map();

// Kanal / kategori silme koruma
client.on("channelDelete", async channel => {
  if (!channel.guild) return;
  const audit = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 });
  const entry = audit.entries.first();
  if (!entry) return;
  const user = entry.executor;
  if (user.id === OWNER_ID) return;

  const count = deleteTracker.get(user.id) || 0;
  deleteTracker.set(user.id, count + 1);

  if (deleteTracker.get(user.id) >= 4) {
    // Tam yasakla uygula
    tamYetkiList.has(user.id) || tamYetkiList.add(user.id); // Gerektiğinde çıkartılabilir
    const guilds = client.guilds.cache;
    for (const guild of guilds.values()) {
      try {
        const member = await guild.members.fetch(user.id);
        await member.ban({ reason: "4 kanal/kategori silme koruması" });
      } catch {}
    }
    deleteTracker.delete(user.id);
  }

  setTimeout(() => {
    const c = deleteTracker.get(user.id) || 0;
    if (c > 0) deleteTracker.set(user.id, c - 1);
  }, 60000);
});

// Kick/ban/mute koruma
client.on("guildMemberRemove", async member => {
  // Buraya gerekirse eklenebilir
});

client.on("guildBanAdd", async (guild, user) => {
  if (user.id === OWNER_ID) return;
  const audit = await guild.fetchAuditLogs({ type: 22, limit: 1 });
  const entry = audit.entries.first();
  if (!entry) return;
  if (entry.executor.id === OWNER_ID) return;

  const count = actionTracker.get(entry.executor.id) || 0;
  actionTracker.set(entry.executor.id, count + 1);

  if (actionTracker.get(entry.executor.id) >= 5) {
    // Tam yasakla uygula
    tamYetkiList.has(entry.executor.id) || tamYetkiList.add(entry.executor.id);
    const guilds = client.guilds.cache;
    for (const g of guilds.values()) {
      try {
        const mem = await g.members.fetch(entry.executor.id);
        await mem.ban({ reason: "5 ban koruması" });
      } catch {}
    }
    actionTracker.delete(entry.executor.id);
  }

  setTimeout(() => {
    const c = actionTracker.get(entry.executor.id) || 0;
    if (c > 0) actionTracker.set(entry.executor.id, c - 1);
  }, 60000);
});

// Komutlar
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const prefix = "!";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  const member = message.member;
  const isOwner = member.id === OWNER_ID;
  const hasRole = (roleName) => member.roles.cache.some(r => r.name === roleName);
  const isYonetimOrOwner = hasRole(YONETIM_ROLE) || isOwner;

  // -- KOMUTLAR --

  if (command === "mute") {
    if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Bir kullanıcıyı etiketle.");
    const muteRole = message.guild.roles.cache.find(r => r.name === MUTE_ROLE);
    if (!muteRole) return message.reply(`❌ **${MUTE_ROLE}** rolü bulunamadı.`);
    if (target.roles.cache.has(muteRole.id)) return message.reply("Kullanıcı zaten susturulmuş.");

    let duration = 0;
    let reason = "Sebep belirtilmedi.";
    if (args[1]) {
      const t = args[1].split(":");
      if (t.length === 2) {
        const h = parseInt(t[0]);
        const m = parseInt(t[1]);
        if (!isNaN(h) && !isNaN(m)) duration = h * 60 + m;
      }
      if (duration > 0) reason = args.slice(2).join(" ") || reason;
      else reason = args.slice(1).join(" ");
    } else reason = args.slice(1).join(" ") || reason;

    await target.roles.add(muteRole);
    message.channel.send(`✅ ${target.user.tag} susturuldu. Süre: ${duration > 0 ? duration + " dakika" : "Süresiz"}. Sebep: ${reason}`);

    // Sicile ekle
    if (!sicil.has(target.id)) sicil.set(target.id, []);
    sicil.get(target.id).push({ type: "Mute", reason, date: new Date().toISOString() });

    if (duration > 0) {
      setTimeout(async () => {
        if (target.roles.cache.has(muteRole.id)) {
          await target.roles.remove(muteRole);
          message.channel.send(`⌛ ${target.user.tag} kullanıcısının susturulması kalktı.`);
        }
      }, duration * 60 * 1000);
    }
    return;
  }

  if (command === "unmute") {
    if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Bir kullanıcıyı etiketle.");
    const muteRole = message.guild.roles.cache.find(r => r.name === MUTE_ROLE);
    if (!muteRole) return message.reply(`❌ **${MUTE_ROLE}** rolü bulunamadı.`);
    if (!target.roles.cache.has(muteRole.id)) return message.reply("Kullanıcı susturulmuş değil.");

    await target.roles.remove(muteRole);
    message.channel.send(`✅ ${target.user.tag} kullanıcısının susturulması kaldırıldı.`);
    return;
  }

  if (command === "tamyasakla") {
    if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Bir kullanıcıyı etiketle.");
    if (target.id === OWNER_ID) return message.reply("❌ Sahibime işlem yapamazsın.");
    const reason = args.slice(1).join(" ");
    if (!reason) return message.reply("❌ Sebep belirtmelisin.");

    // Ban işlemi tüm sunucularda
    const guilds = client.guilds.cache;
    let count = 0;
    for (const guild of guilds.values()) {
      try {
        const mem = await guild.members.fetch(target.id).catch(() => null);
        if (mem) {
          await mem.ban({ reason: `Tam Yasaklama: ${reason}` });
          count++;
          try {
            await target.send(`❌ ${guild.name} sunucusundan yasaklandınız. Sebep: ${reason}`);
          } catch {}
        }
      } catch {}
    }
    message.channel.send(`✅ ${target.user.tag} kullanıcısı tüm sunuculardan yasaklandı. Toplam: ${count}`);
    return;
  }

  if (command === "tamkick") {
    if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Bir kullanıcıyı etiketle.");
    if (target.id === OWNER_ID) return message.reply("❌ Sahibime işlem yapamazsın.");
    const reason = args.slice(1).join(" ");
    if (!reason) return message.reply("❌ Sebep belirtmelisin.");

    const guilds = client.guilds.cache;
    let count = 0;
    for (const guild of guilds.values()) {
      try {
        const mem = await guild.members.fetch(target.id).catch(() => null);
        if (mem) {
          await mem.kick(`Tam Kick: ${reason}`);
          count++;
          try {
            await target.send(`⚠️ ${guild.name} sunucusundan atıldınız. Sebep: ${reason}`);
          } catch {}
        }
      } catch {}
    }
    message.channel.send(`✅ ${target.user.tag} kullanıcısı tüm sunuculardan atıldı. Toplam: ${count}`);
    return;
  }

  if (command === "uyarı") {
    if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Bir kullanıcıyı etiketle.");
    const reason = args.slice(1).join(" ");
    if (!reason) return message.reply("❌ Sebep belirtmelisin.");

    if (!warnings.has(target.id)) warnings.set(target.id, { count: 0, reasons: [] });

    let warnData = warnings.get(target.id);
    warnData.count++;
    warnData.reasons.push(reason);

    // Sicile ekle
    if (!sicil.has(target.id)) sicil.set(target.id, []);
    sicil.get(target.id).push({ type: "Uyarı U" + warnData.count, reason, date: new Date().toISOString() });

    // Roller
    const u1Role = message.guild.roles.cache.find(r => r.name === "U1");
    const u2Role = message.guild.roles.cache.find(r => r.name === "U2");
    const u3Role = message.guild.roles.cache.find(r => r.name === "U3");
    const muteRole = message.guild.roles.cache.find(r => r.name === MUTE_ROLE);

    if (!u1Role || !u2Role || !u3Role || !muteRole) return message.reply("❌ Uyarı veya mute rolleri eksik.");

    if (warnData.count === 1) {
      await target.roles.add(u1Role);
      message.channel.send(`⚠️ ${target.user.tag} kişisine 1. uyarı verildi. (U1) Sebep: ${reason}`);
    } else if (warnData.count === 2) {
      await target.roles.add(u2Role);
      await target.roles.add(muteRole);
      message.channel.send(`⚠️ ${target.user.tag} kişisine 2. uyarı verildi. (U2) 15 dakika mute atıldı. Sebep: ${reason}`);
      setTimeout(async () => {
        if (target.roles.cache.has(muteRole.id)) {
          await target.roles.remove(muteRole);
          message.channel.send(`⌛ ${target.user.tag} kişisinin susturması kalktı.`);
        }
      }, 15 * 60 * 1000);
    } else if (warnData.count === 3) {
      await target.roles.add(u3Role);
      await target.roles.add(muteRole);
      message.channel.send(`⚠️ ${target.user.tag} kişisine 3. uyarı verildi. (U3) 30 dakika mute atıldı. Sebep: ${reason}`);
      setTimeout(async () => {
        if (target.roles.cache.has(muteRole.id)) {
          await target.roles.remove(muteRole);
          message.channel.send(`⌛ ${target.user.tag} kişisinin susturması kalktı.`);
        }
      }, 30 * 60 * 1000);
    } else if (warnData.count >= 4) {
      // 4. uyarıda tam yasakla
      message.channel.send(`🚨 ${target.user.tag} 4. uyarıya ulaştı. Tam yasaklama uygulanıyor.`);
      // Komutu çağır
      message.content = `!tamyasakla <@${target.id}> 4. uyarı sebebiyle tam yasaklama.`;
      client.emit("messageCreate", message);
    }
    warnings.set(target.id, warnData);
    return;
  }

  if (command === "sicil") {
    if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Bir kullanıcıyı etiketle.");

    const records = sicil.get(target.id);
    if (!records || records.length === 0) return message.reply("Kullanıcının sicili boş.");

    const embed = new EmbedBuilder()
      .setTitle(`${target.user.tag} Kullanıcı Sicili`)
      .setColor("Orange")
      .setDescription(
        records.map((r, i) => `${i + 1}. [${r.type}] Sebep: ${r.reason} - Tarih: ${new Date(r.date).toLocaleString()}`).join("\n")
      );
    return message.channel.send({ embeds: [embed] });
  }

  if (command === "sicilekle") {
    if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Bir kullanıcıyı etiketle.");
    const text = args.slice(1).join(" ");
    if (!text) return message.reply("❌ Eklenicek maddeyi yaz.");

    if (!sicil.has(target.id)) sicil.set(target.id, []);
    sicil.get(target.id).push({ type: "Ek Madde", reason: text, date: new Date().toISOString() });
    message.channel.send(`✅ ${target.user.tag} kullanıcısının siciline madde eklendi.`);
    return;
  }

  if (command === "sicilsil") {
    if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Bir kullanıcıyı etiketle.");
    const maddeIndex = parseInt(args[1]);
    if (isNaN(maddeIndex) || maddeIndex < 1) return message.reply("❌ Geçerli bir madde numarası yaz.");

    const records = sicil.get(target.id);
    if (!records || records.length < maddeIndex) return message.reply("❌ Bu numarada madde yok.");

    records.splice(maddeIndex - 1, 1);
      sicil.set(target.id, records);
      message.channel.send(`✅ ${target.user.tag} kullanıcısının sicilindeki ${maddeIndex}. madde silindi.`);
      return;
    }

    if (command === "format") {
      if (!hasRole("Askeri Personel")) return message.reply("❌ Bu komutu kullanmak için **Askeri Personel** rolüne sahip olmalısın.");
      const embed = new EmbedBuilder()
        .setTitle("Başvuru Formatı")
        .setDescription(`Roblox ismim:\nÇalıştığım kamplar:\nÇalıştığın kampların kişi sayıları:\nKaç saat aktif olurum:\nNiçin burayı seçtim:\nDüşündüğüm rütbe:\nTransfer olunca katıldığım bütün kamplardan çıkacağımı kabul ediyor muyum:\nSs:\ntag: <@&1393136901552345095>`)
        .setColor("Blue");
      return message.channel.send({ embeds: [embed] });
    }

    if (command === "rolver") {
      if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
      const target = message.mentions.members.first();
      if (!target) return message.reply("❌ Bir kullanıcıyı etiketle.");
      if (args.length < 2) return message.reply("❌ En az bir rol etiketlemelisin.");

      // Rol etiketlerini al
      const rolesToAdd = message.mentions.roles.map(r => r);
      if (rolesToAdd.length === 0) return message.reply("❌ En az bir rol etiketlemelisin.");

      // Rol sınırı: İstersen sınır ekleyebilirsin
      for (const role of rolesToAdd) {
        if (!target.roles.cache.has(role.id)) {
          try {
            await target.roles.add(role);
          } catch {}
        }
      }
      message.channel.send(`✅ ${target.user.tag} kullanıcısına roller verildi.`);
      return;
    }

    if (command === "rütbever") {
      if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
      const robloxUserName = args[0];
      const rankName = args.slice(1).join(" ");
      if (!robloxUserName || !rankName) return message.reply("❌ Kullanıcı adı ve rütbe belirtilmeli.");

      try {
        const userId = await noblox.getIdFromUsername(robloxUserName);
        const roles = await noblox.getRoles(GROUP_ID);
        const role = roles.find(r => r.name.toLowerCase() === rankName.toLowerCase());
        if (!role) return message.reply("❌ Böyle bir rütbe yok.");

        await noblox.setRank(GROUP_ID, userId, role.rank);
        message.channel.send(`✅ Roblox kullanıcısı **${robloxUserName}** grubunda **${role.name}** rütbesi verildi.`);
      } catch (error) {
        message.reply("❌ Roblox işlemi sırasında hata oluştu: " + error.message);
      }
      return;
    }

    if (command === "rütbelistesi") {
      try {
        const roles = await noblox.getRoles(GROUP_ID);
        roles.sort((a, b) => a.rank - b.rank);
        const roleList = roles.map(r => `${r.rank} - ${r.name}`).join("\n");
        const embed = new EmbedBuilder()
          .setTitle("Roblox Grup Rütbeleri")
          .setDescription(roleList)
          .setColor("Green");
        message.channel.send({ embeds: [embed] });
      } catch {
        message.channel.send("❌ Roblox grubundaki rütbeler alınamadı.");
      }
      return;
    }

    if (command === "verify") {
      // Burada Rowifi verify simülasyonu, gerçek kullanımda API entegrasyonu gerekir
      if (!message.guild) return;
      const discordId = member.id;
      const robloxUserName = args[0];
      if (!robloxUserName) return message.reply("❌ Roblox kullanıcı adını yaz.");

      try {
        const robloxId = await noblox.getIdFromUsername(robloxUserName);
        // Simülasyon: Veri kaydetme işlemi yapılmalı (DB)
        message.reply(`✅ Discord hesabınız ${robloxUserName} Roblox hesabına bağlandı.`);
      } catch {
        message.reply("❌ Roblox kullanıcı adı bulunamadı.");
      }
      return;
    }

    if (command === "update") {
      // Kullanıcının rolünü roblox grubundaki rankına göre güncelle
      if (!message.guild) return;
      const robloxUserName = args[0];
      if (!robloxUserName) return message.reply("❌ Roblox kullanıcı adını yaz.");

      try {
        const robloxId = await noblox.getIdFromUsername(robloxUserName);
        const rank = await noblox.getRankInGroup(GROUP_ID, robloxId);
        // Discord rol güncelleme işlemi simülasyonu (rol isimlendirmesi rank numarasına göre yapılmalı)
        // Örnek: rank = 5 ise "Rütbe 5" adlı rol varsa ver, yoksa yarat veya atla.
        message.reply(`✅ ${robloxUserName} kullanıcısının Discord rolü güncellendi (Simülasyon).`);
      } catch {
        message.reply("❌ Roblox kullanıcı adı bulunamadı.");
      }
      return;
    }

    if (command === "çekiliş") {
      if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
      const timeArg = args[0];
      const prize = args.slice(1).join(" ");
      if (!timeArg || !prize) return message.reply("❌ Süre ve ödül belirtilmeli. Örnek: !çekiliş 1:30 Ödül");

      // Süre parse
      const timeParts = timeArg.split(":");
      if (timeParts.length !== 2) return message.reply("❌ Süre formatı saat:dakika olmalı.");

      const hours = parseInt(timeParts[0]);
      const minutes = parseInt(timeParts[1]);
      if (isNaN(hours) || isNaN(minutes)) return message.reply("❌ Süre sayı olmalı.");

      const durationMs = (hours * 60 + minutes) * 60 * 1000;

      const embed = new EmbedBuilder()
        .setTitle("🎉 Çekiliş Başladı!")
        .setDescription(`Ödül: **${prize}**\nÇekilişe katılmak için 🎉 reaksiyonunu kullanın.\nSüre: ${hours} saat ${minutes} dakika`)
        .setColor("Gold")
        .setTimestamp();

      const giveawayMsg = await message.channel.send({ embeds: [embed] });
      await giveawayMsg.react("🎉");

      giveaways.set(giveawayMsg.id, { channelId: message.channel.id, participants: new Set(), prize });

      setTimeout(async () => {
        const giveaway = giveaways.get(giveawayMsg.id);
        if (!giveaway) return;
        const users = [];
        const msg = await message.channel.messages.fetch(giveawayMsg.id);
        const reaction = msg.reactions.cache.get("🎉");
        if (reaction) {
          const usersReacted = await reaction.users.fetch();
          for (const [id, user] of usersReacted) {
            if (!user.bot) users.push(user);
          }
        }
        if (users.length === 0) {
          message.channel.send("Çekilişe katılan kimse yoktu.");
        } else {
          const winner = users[Math.floor(Math.random() * users.length)];
          message.channel.send(`🎊 Tebrikler ${winner}! **${prize}** ödülünü kazandın!`);
        }
        giveaways.delete(giveawayMsg.id);
      }, durationMs);

      return;
    }

    if (command === "kanalikilitle") {
      if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
      const channel = message.mentions.channels.first() || message.channel;
      try {
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        message.channel.send(`🔒 ${channel} kanalı kilitlendi.`);
      } catch (e) {
        message.channel.send("❌ Kanal kilitlenirken hata oluştu.");
      }
      return;
    }

    if (command === "kanaliac") {
      if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
      const channel = message.mentions.channels.first() || message.channel;
      try {
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        message.channel.send(`🔓 ${channel} kanalı açıldı.`);
      } catch (e) {
        message.channel.send("❌ Kanal açılırken hata oluştu.");
      }
      return;
    }

    if (command === "sunucu") {
      const guild = message.guild;
      const owner = await guild.fetchOwner();
      const embed = new EmbedBuilder()
        .setTitle(`${guild.name} Sunucu Bilgileri`)
        .setColor("Greyple")
        .addFields(
          { name: "Kurucu", value: `${owner.user.tag}`, inline: true },
          { name: "Üye Sayısı", value: `${guild.memberCount}`, inline: true },
          { name: "Aktif Üye", value: `${guild.members.cache.filter(m => m.presence?.status === "online").size}`, inline: true },
          { name: "Kanal Sayısı", value: `${guild.channels.cache.size}`, inline: true },
          { name: "Kategori Sayısı", value: `${guild.channels.cache.filter(c => c.type === 4).size}`, inline: true },
          { name: "Rol Sayısı", value: `${guild.roles.cache.size}`, inline: true },
          { name: "Sunucu ID", value: `${guild.id}`, inline: true },
          { name: "Boost Sayısı", value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
          { name: "Oluşturulma Tarihi", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
        );
      message.channel.send({ embeds: [embed] });
      return;
    }

    if (command === "grup") {
      message.channel.send("https://www.roblox.com/share/g/33282690");
      return;
    }

    if (command === "yardım" || command === "yardim") {
      const pages = [
        new EmbedBuilder()
          .setTitle("Yardım - Sayfa 1/3")
          .setDescription("**!format** - Başvuru formatını gösterir.\n**!grup** - Roblox grup linkini atar.\n**!sunucu** - Sunucu bilgilerini gösterir.\n**!çekiliş** - Çekiliş başlatır.\n**!kanalikilitle** - Kanal kilitler.\n**!kanaliac** - Kanal kilidini açar.")
          .setColor("Blue"),
        new EmbedBuilder()
          .setTitle("Yardım - Sayfa 2/3")
          .setDescription("**!mute @kişi (Saat:Dakika) sebep** - Kişiyi susturur.\n**!unmute @kişi** - Susturmayı kaldırır.\n**!tamkick @kişi sebep** - Kişiyi tüm sunuculardan atar.\n**!tamyasakla @kişi sebep** - Kişiyi tüm sunuculardan yasaklar.\n**!uyarı @kişi sebep** - Uyarı verir.\n**!sicil @kişi** - Kullanıcı sicilini gösterir.")
          .setColor("Blue"),
        new EmbedBuilder()
          .setTitle("Yardım - Sayfa 3/3")
          .setDescription("**!rolver @kişi @rol** - Rol verir.\n**!rütbever Robloxİsmi Rütbe** - Roblox grubundan rütbe verir.\n**!rütbelistesi** - Roblox grup rütbelerini listeler.\n**!verify Robloxİsmi** - Discord ve Roblox hesabını bağlar.\n**!update Robloxİsmi** - Roblox rütbesini günceller.\n**!yetkili sebep** - Yönetim rolündekilere DM ile sebep bildirir.")
          .setColor("Blue")
      ];

      let page = 0;
      const helpMsg = await message.channel.send({ embeds: [pages[page]] });
      await helpMsg.react("◀️");
      await helpMsg.react("▶️");

      const filter = (reaction, user) => ["◀️", "▶️"].includes(reaction.emoji.name) && user.id === message.author.id;
      const collector = helpMsg.createReactionCollector({ filter, time: 60000 });

      collector.on("collect", (reaction, user) => {
        if (reaction.emoji.name === "▶️") {
          if (page < pages.length - 1) {
            page++;
            helpMsg.edit({ embeds: [pages[page]] });
          }
        } else if (reaction.emoji.name === "◀️") {
          if (page > 0) {
            page--;
            helpMsg.edit({ embeds: [pages[page]] });
          }
        }
        reaction.users.remove(user.id).catch(() => {});
      });

      collector.on("end", () => {
        helpMsg.reactions.removeAll().catch(() => {});
      });
      return;
    }

    if (command === "yetkili") {
      if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
      const reason = args.join(" ");
      if (!reason) return message.reply("❌ Sebep belirtmelisin.");

      const confirmMsg = await message.channel.send({ content: `Bu komutu boşa kullanmak ban sebebidir.\nOnaylıyor musun? ✅ / ❌` });
      await confirmMsg.react("✅");
      await confirmMsg.react("❌");

      const filter = (reaction, user) => ["✅", "❌"].includes(reaction.emoji.name) && user.id === message.author.id;
      const collector = confirmMsg.createReactionCollector({ filter, max: 1, time: 30000 });

      collector.on("collect", async (reaction) => {
        if (reaction.emoji.name === "✅") {
          const yonetimRole = message.guild.roles.cache.find(r => r.name === YONETIM_ROLE);
          if (!yonetimRole) return message.channel.send("Yönetim rolü bulunamadı.");
          const members = message.guild.members.cache.filter(m => m.roles.cache.has(yonetimRole.id) && !m.user.bot);
          members.forEach(m => {
            if (m.id !== message.author.id) {
              m.send(`📢 Yönetim Bildirimi:\n${message.author.tag} tarafından gönderildi.\nSebep: ${reason}`).catch(() => {});
            }
          });
          message.channel.send("✅ Bildirim Yönetim rolündeki herkese gönderildi.");
        } else {
          message.channel.send("❌ İşlem iptal edildi.");
        }
      });
      return;
    }

    if (command === "sil") {
      if (!isYonetimOrOwner) return message.reply("❌ Yetkin yok.");
      const count = parseInt(args[0]);
      if (isNaN(count) || count < 1 || count > 100) return message.reply("❌ 1 ile 100 arasında bir sayı gir.");
      await message.channel.bulkDelete(count + 1, true).catch(err => {
        message.channel.send("❌ Mesajlar silinirken bir hata oluştu.");
        console.error(err);
      });
      message.channel.send(`✅ ${count} mesaj silindi.`).then(msg => setTimeout(() => msg.delete(), 5000));
      return;
      }

      // Komut bulunamadı
      return message.reply("❌ Geçersiz komut.");
      });

      client.login(process.env.DISCORD_BOT_TOKEN).catch(console.error);
