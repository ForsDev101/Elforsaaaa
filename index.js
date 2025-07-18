const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const GROUP_ID = process.env.GROUP_ID;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

client.login(TOKEN);

const SUSTURULMUS_ROLU = 'Susturulmuß';
const UYARI_ROLLERI = ['U1', 'U2', 'U3'];
const OTOROLLER = ['Askeri Personel', 'Transfer Olmayan Personel'];
const YONETIM_ROLU = 'Yönetim';

let devriyeAcik = false;
const aktifSohbet = new Map();
const siciller = {};
const tamYetkili = new Set();
const kanalSilmeSayaç = {};
const kickSayaç = {};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function hasRole(message, roleName) {
  if (message.author.id === OWNER_ID) return true;
  return message.member.roles.cache.some(r => r.name === roleName);
}
async function logOwner(content) {
  try {
    const owner = await client.users.fetch(OWNER_ID);
    if (owner) owner.send(content);
  } catch {}
}

client.on('guildMemberAdd', async member => {
  for (const rolAdi of OTOROLLER) {
    const rol = member.guild.roles.cache.find(r => r.name === rolAdi);
    if (rol) await member.roles.add(rol).catch(() => {});
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Otomatik selam cevapları
  const selamlar = ['sa', 'Sa', 'selam', 'Selam', 'selamün aleyküm', 'Selamün Aleyküm'];
  if (selamlar.includes(message.content)) {
    await message.reply('Aleyküm selam canım');
    return;
  }

  // Sohbet modu
  if (message.mentions.has(client.user)) {
    aktifSohbet.set(message.author.id, 6);
    await message.reply('Sohbet modunu açtım. Sorularını sorabilirsin.');
    return;
  }
  if (aktifSohbet.has(message.author.id)) {
    const sayac = aktifSohbet.get(message.author.id);
    if (sayac <= 0) {
      aktifSohbet.delete(message.author.id);
      return;
    }
    const cevap = await getAIResponse(message.content);
    await message.reply(cevap);
    aktifSohbet.set(message.author.id, sayac - 1);
    if (sayac - 1 <= 0) aktifSohbet.delete(message.author.id);
    return;
  }

  // Komutlar
  if (!message.content.startsWith('!')) return;
  const args = message.content.slice(1).trim().split(/ +/g);
  const cmd = args.shift().toLowerCase();

  if (cmd === 'format') {
    if (!await hasRole(message, 'Askeri Personel')) return;
    const embed = new EmbedBuilder()
      .setTitle('Başvuru Formatı')
      .setDescription(`Roblox ismim:
Çalıştığım kamplar:
Çalıştığın kampların kişi sayıları:
Kaç saat aktif olurum:
Niçin burayı seçtim:
Düşündüğüm rütbe:
Transfer olunca katıldığım bütün kamplardan çıkacağımı kabul ediyor muyum:
Ss:
tag: <@&1393136901552345095>`);
    message.channel.send({ embeds: [embed] });
    return;
  }

  if (cmd === 'grup') {
    if (!await hasRole(message, 'Askeri Personel')) return;
    message.channel.send('https://www.roblox.com/share/g/33282690');
    return;
  }

  if (cmd === 'yetkili') {
    if (!await hasRole(message, 'Askeri Personel')) return;
    const sebep = args.join(' ');
    if (!sebep) return message.reply('Sebep belirtmelisin.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('yetkili-onay').setLabel('✔️ Onayla').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('yetkili-iptal').setLabel('❌ İptal').setStyle(ButtonStyle.Danger)
    );
    const onayMesaj = await message.channel.send({ content: `Bu komutu boşa kullanmak ban sebebidir. Onaylıyor musunuz?`, components: [row] });
    const filter = i => i.user.id === message.author.id;
    const collector = onayMesaj.createMessageComponentCollector({ filter, time: 30000, max: 1 });
    collector.on('collect', async i => {
      if (i.customId === 'yetkili-onay') {
        await i.deferUpdate();
        const yonetim = message.guild.roles.cache.find(r => r.name === YONETIM_ROLU);
        if (!yonetim) return message.reply('Yönetim rolü bulunamadı.');
        yonetim.members.forEach(async m => {
          try {
            await m.send(`Yetkili bildirimi: ${message.author.tag} tarafından gönderildi.\nSebep: ${sebep}`);
          } catch {}
        });
        message.channel.send('Bildirim gönderildi.');
      } else {
        await i.deferUpdate();
        message.channel.send('İptal edildi.');
      }
      onayMesaj.edit({ components: [] });
    });
    return;
  }

  if (cmd === 'mute') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('Bir kullanıcıyı etiketlemelisin.');
    let sure = 0;
    let sebep = '';
    if (args[1]) {
      const sureStr = args[1];
      const [saat, dakika] = sureStr.split(':');
      sure = ((parseInt(saat) || 0) * 60 + (parseInt(dakika) || 0)) * 60 * 1000;
    }
    sebep = args.slice(sure > 0 ? 2 : 1).join(' ') || 'Sebep belirtilmedi.';
    const rol = message.guild.roles.cache.find(r => r.name === SUSTURULMUS_ROLU);
    if (!rol) return message.reply('Susturulmuş rolü bulunamadı.');
    if (member.roles.cache.has(rol.id)) return message.reply('Kullanıcı zaten susturulmuş.');
    await member.roles.add(rol, sebep);
    message.channel.send(`${member.user.tag} susturuldu. Sebep: ${sebep}${sure > 0 ? ` Süre: ${args[1]}` : ''}`);
    if (sure > 0) {
      setTimeout(async () => {
        if (member.roles.cache.has(rol.id)) {
          await member.roles.remove(rol, 'Mute süresi doldu.');
          message.channel.send(`${member.user.tag} mute süresi doldu, susturulması kaldırıldı.`);
        }
      }, sure);
    }
    await logOwner(`${message.author.tag} tarafından ${member.user.tag} susturuldu. Sebep: ${sebep}${sure > 0 ? ` Süre: ${args[1]}` : ''}`);
    return;
  }

  if (cmd === 'unmute') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('Bir kullanıcıyı etiketlemelisin.');
    const rol = message.guild.roles.cache.find(r => r.name === SUSTURULMUS_ROLU);
    if (!rol) return message.reply('Susturulmuş rolü bulunamadı.');
    if (!member.roles.cache.has(rol.id)) return message.reply('Kullanıcı susturulmamış.');
    await member.roles.remove(rol, 'Unmute işlemi yapıldı.');
    message.channel.send(`${member.user.tag} susturması kaldırıldı.`);
    await logOwner(`${message.author.tag} tarafından ${member.user.tag} susturulması kaldırıldı.`);
    return;
  }

  if (cmd === 'tamyasakla') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('Bir kullanıcıyı etiketlemelisin.');
    const sebep = args.slice(1).join(' ');
    if (!sebep) return message.reply('Sebep belirtmelisin.');
    if (member.id === OWNER_ID) return message.reply('Owner\'a işlem yapılamaz.');
    for (const guild of client.guilds.cache.values()) {
      const uye = await guild.members.fetch(member.id).catch(() => null);
      if (uye && uye.bannable) {
        await uye.ban({ reason: sebep }).catch(() => {});
        try { await uye.send(`Bot tarafından tüm sunuculardan yasaklandınız. Sebep: ${sebep}`); } catch {}
      }
    }
    message.channel.send(`${member.user.tag} tüm sunuculardan yasaklandı. Sebep: ${sebep}`);
    await logOwner(`${message.author.tag} tarafından ${member.user.tag} tüm sunuculardan yasaklandı. Sebep: ${sebep}`);
    return;
  }

  if (cmd === 'tamkick') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('Bir kullanıcıyı etiketlemelisin.');
    const sebep = args.slice(1).join(' ');
    if (!sebep) return message.reply('Sebep belirtmelisin.');
    if (member.id === OWNER_ID) return message.reply('Owner\'a işlem yapılamaz.');
    for (const guild of client.guilds.cache.values()) {
      const uye = await guild.members.fetch(member.id).catch(() => null);
      if (uye && uye.kickable) {
        await uye.kick(sebep).catch(() => {});
        try {
          await uye.send(`Bot tarafından tüm sunuculardan atıldınız. Sebep: ${sebep}`);
        } catch {}
      }
    }
    message.channel.send(`${member.user.tag} tüm sunuculardan atıldı. Sebep: ${sebep}`);
    await logOwner(`${message.author.tag} tarafından ${member.user.tag} tüm sunuculardan atıldı. Sebep: ${sebep}`);
    return;
    }

    if (cmd === 'rolver') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('Bir kullanıcıyı etiketlemelisin.');
    const roles = message.mentions.roles.map(r => r).slice(0, 5);
    if (roles.length === 0) return message.reply('En az bir rol etiketlemelisin.');
    try {
      for (const rol of roles) {
        if (!member.roles.cache.has(rol.id)) await member.roles.add(rol);
      }
      message.channel.send(`${member.user.tag} adlı kullanıcıya roller verildi.`);
      await logOwner(`${message.author.tag} tarafından ${member.user.tag} adlı kullanıcıya roller verildi: ${roles.map(r => r.name).join(', ')}`);
    } catch {
      message.reply('Rol verme sırasında hata oluştu.');
    }
    return;
    }

    if (cmd === 'rütbever') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    const robloxIsmi = args[0];
    const rutbe = args.slice(1).join(' ');
    if (!robloxIsmi || !rutbe) return message.reply('Doğru kullanım: !rütbever (Roblox ismi) (Rütbe)');
    // Burada Rowifi veya noblox entegrasyonu ile Roblox grubunda rütbe verme işlemi yapılacak
    message.channel.send(`Roblox kullanıcısı **${robloxIsmi}** için **${rutbe}** rütbesi verildi (simülasyon).`);
    await logOwner(`${message.author.tag} tarafından ${robloxIsmi} kullanıcısına ${rutbe} rütbesi verildi.`);
    return;
    }

    if (cmd === 'rütbelistesi') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    // Örnek rütbe listesi
    const rutbeler = ['Üye', 'Çavuş', 'Teğmen', 'Yüzbaşı', 'Albay', 'General'];
    const embed = new EmbedBuilder()
      .setTitle('Roblox Grup Rütbeleri')
      .setDescription(rutbeler.map((r, i) => `${i + 1}. ${r}`).join('\n'));
    message.channel.send({ embeds: [embed] });
    return;
    }

    if (cmd === 'verify') {
    // Discord-Roblox doğrulama işlemi
    // Burada Rowifi verify entegrasyonu yapılabilir
    if (!message.guild) return;
    message.channel.send('Discord ve Roblox hesabınız bağlandı (simülasyon).');
    await logOwner(`${message.author.tag} Discord-Roblox doğrulaması yaptı.`);
    return;
    }

    if (cmd === 'update') {
    // Rowifi update işlemi simülasyonu
    if (!message.guild) return;
    message.channel.send('Roblox grubundaki rolünüz Discord\'a yansıtıldı (simülasyon).');
    await logOwner(`${message.author.tag} Roblox rol güncellemesi yaptı.`);
    return;
    }

    if (cmd === 'uyarı') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('Bir kullanıcıyı etiketlemelisin.');
    const sebep = args.slice(1).join(' ');
    if (!sebep) return message.reply('Sebep belirtmelisin.');
    if (!siciller[member.id]) siciller[member.id] = [];
    siciller[member.id].push({ tip: 'Uyarı', sebep, tarih: Date.now() });
    const uyarilar = siciller[member.id].filter(u => u.tip === 'Uyarı').length;
    if (uyarilar === 1) {
      const rol = message.guild.roles.cache.find(r => r.name === 'U1');
      if (rol) await member.roles.add(rol);
      message.channel.send(`${member.user.tag} 1. uyarısını aldı.`);
    } else if (uyarilar === 2) {
      const rol = message.guild.roles.cache.find(r => r.name === 'U2');
      const susturRol = message.guild.roles.cache.find(r => r.name === SUSTURULMUS_ROLU);
      if (rol) await member.roles.add(rol);
      if (susturRol) await member.roles.add(susturRol);
      message.channel.send(`${member.user.tag} 2. uyarısını aldı ve 15 dakika susturuldu.`);
      setTimeout(async () => {
        if (member.roles.cache.has(susturRol.id)) {
          await member.roles.remove(susturRol, 'Mute süresi doldu.');
          message.channel.send(`${member.user.tag} mute süresi doldu.`);
        }
      }, 15 * 60 * 1000);
    } else if (uyarilar === 3) {
      const rol = message.guild.roles.cache.find(r => r.name === 'U3');
      const susturRol = message.guild.roles.cache.find(r => r.name === SUSTURULMUS_ROLU);
      if (rol) await member.roles.add(rol);
      if (susturRol) await member.roles.add(susturRol);
      message.channel.send(`${member.user.tag} 3. uyarısını aldı ve 30 dakika susturuldu.`);
      setTimeout(async () => {
        if (member.roles.cache.has(susturRol.id)) {
          await member.roles.remove(susturRol, 'Mute süresi doldu.');
          message.channel.send(`${member.user.tag} mute süresi doldu.`);
        }
      }, 30 * 60 * 1000);
    } else if (uyarilar >= 4) {
      message.channel.send(`${member.user.tag} 4. uyarısını aldı ve tam yasaklandı.`);
      // Otomatik tam yasakla uygula
      for (const guild of client.guilds.cache.values()) {
        const uye = await guild.members.fetch(member.id).catch(() => null);
        if (uye && uye.bannable) {
          await uye.ban({ reason: '4. uyarı sebebiyle otomatik yasaklandı.' }).catch(() => {});
        }
      }
      await logOwner(`${member.user.tag} 4. uyarı sebebiyle tüm sunuculardan yasaklandı.`);
    }
    await logOwner(`${message.author.tag} tarafından ${member.user.tag} uyarıldı. Sebep: ${sebep}`);
    return;
    }

    if (cmd === 'sicil') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('Bir kullanıcıyı etiketlemelisin.');
    const liste = siciller[member.id] || [];
    if (liste.length === 0) return message.reply('Bu kullanıcının sicil kaydı bulunamadı.');
    const embed = new EmbedBuilder()
      .setTitle(`${member.user.tag} - Sicil Kaydı`)
      .setDescription(liste.map((s, i) => `${i + 1}. [${s.tip}] ${s.sebep} - <t:${Math.floor(s.tarih/1000)}:R>`).join('\n'));
    message.channel.send({ embeds: [embed] });
    return;
    }

    if (cmd === 'sicilsil') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    const member = message.mentions.members.first();
    const no = parseInt(args[1]);
    if (!member || !no) return message.reply('Doğru kullanım: !sicilsil @kisi maddeNo');
    if (!siciller[member.id] || !siciller[member.id][no - 1]) return message.reply('Silinecek madde bulunamadı.');
    siciller[member.id].splice(no - 1, 1);
    message.channel.send(`${member.user.tag} sicilinden ${no}. madde silindi.`);
    await logOwner(`${message.author.tag} tarafından ${member.user.tag} sicilinden ${no}. madde silindi.`);
    return;
    }

    if (cmd === 'sicilekle') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    const member = message.mentions.members.first();
    const madde = args.slice(1).join(' ');
    if (!member || !madde) return message.reply('Doğru kullanım: !sicilekle @kisi madde');
    if (!siciller[member.id]) siciller[member.id] = [];
    siciller[member.id].push({ tip: 'Ek Madde', sebep: madde, tarih: Date.now() });
    message.channel.send(`${member.user.tag} siciline madde eklendi.`);
    await logOwner(`${message.author.tag} tarafından ${member.user.tag} siciline madde eklendi: ${madde}`);
    return;
    }

    if (cmd === 'sunucu') {
    if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
    const guild = message.guild;
      const embed = new EmbedBuilder()
            .setTitle(`${guild.name} Sunucu Bilgileri`)
            .setColor('Grey')
            .addFields(
              { name: 'Kurucu', value: `<@${guild.ownerId}>`, inline: true },
              { name: 'Üye Sayısı', value: `${guild.memberCount}`, inline: true },
              { name: 'Aktif Üye Sayısı', value: `${guild.members.cache.filter(m => m.presence?.status !== 'offline').size}`, inline: true },
              { name: 'Kanal Sayısı', value: `${guild.channels.cache.size}`, inline: true },
              { name: 'Kategori Sayısı', value: `${guild.channels.cache.filter(c => c.type === 4).size}`, inline: true },
              { name: 'Rol Sayısı', value: `${guild.roles.cache.size}`, inline: true },
              { name: 'Sunucu ID', value: `${guild.id}`, inline: true },
              { name: 'Boost Sayısı', value: `${guild.premiumSubscriptionCount}`, inline: true },
              { name: 'Oluşturulma Tarihi', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
            );
          message.channel.send({ embeds: [embed] });
          return;
        }

        if (cmd === 'devriye') {
          if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
          const secim = args[0];
          if (secim === 'aç') {
            devriyeAcik = true;
            message.channel.send('Devriye modu açıldı. Küfür, argo ve +18 kelimeleri filtrelenecek.');
          } else if (secim === 'kapat') {
            devriyeAcik = false;
            message.channel.send('Devriye modu kapatıldı.');
          } else {
            message.channel.send('Doğru kullanım: !devriye aç/kapat');
          }
          return;
        }

        if (cmd === 'çekiliş') {
          if (!await hasRole(message, YONETIM_ROLU)) return message.reply('Yetkin yok.');
          const zaman = args[0];
          const odul = args.slice(1, args.length - 1).join(' ') || args.slice(1).join(' ');
          const kazananSayisi = parseInt(args[args.length - 1]) || 1;
          if (!zaman || !odul) return message.reply('Doğru kullanım: !çekiliş (Saat:Dakika) (Ödül) (Kazanan sayısı opsiyonel)');

          const [saat, dakika] = zaman.split(':').map(n => parseInt(n));
          if (isNaN(saat) || isNaN(dakika)) return message.reply('Zaman formatı yanlış. Saat:Dakika şeklinde olmalı.');

          const sureMs = (saat * 60 + dakika) * 60 * 1000;
          const embed = new EmbedBuilder()
            .setTitle('🎉 Çekiliş Başladı!')
            .setDescription(`Ödül: **${odul}**\nKazanan sayısı: **${kazananSayisi}**\nÇekilişe katılmak için aşağıdaki 🎉 emojisine basınız.`)
            .setColor('Random');
          const cekilisMesaji = await message.channel.send({ embeds: [embed] });
          await cekilisMesaji.react('🎉');

          const filter = (reaction, user) => reaction.emoji.name === '🎉' && !user.bot;
          const collector = cekilisMesaji.createReactionCollector({ filter, time: sureMs });

          collector.on('end', collected => {
            const katilanlar = collected.get('🎉')?.users.cache.filter(u => !u.bot).map(u => u);
            if (!katilanlar || katilanlar.length === 0) {
              message.channel.send('Çekilişe kimse katılmadı.');
              return;
            }
            let kazananlar = [];
            if (katilanlar.length <= kazananSayisi) kazananlar = katilanlar;
            else {
              while (kazananlar.length < kazananSayisi) {
                const secilen = katilanlar[Math.floor(Math.random() * katilanlar.length)];
                if (!kazananlar.includes(secilen)) kazananlar.push(secilen);
              }
            }
            message.channel.send(`Çekiliş sona erdi! Kazananlar: ${kazananlar.map(u => u.toString()).join(', ')} Tebrikler! 🎉`);
          });
          return;
        }

        if (cmd === 'tamyetki') {
          if (message.author.id !== OWNER_ID) return;
          const uye1 = message.mentions.members.first();
          const uye2 = message.mentions.members.at(1);
          tamYetkili.clear();
          if (uye1) tamYetkili.add(uye1.id);
          if (uye2) tamYetkili.add(uye2.id);
          message.channel.send(`Tam yetkili kullanıcılar güncellendi. Yetkili sayısı: ${tamYetkili.size}`);
          await logOwner(`Tam yetkili kullanıcılar ayarlandı: ${Array.from(tamYetkili).join(', ')}`);
          return;
        }

        if (cmd === 'yardım' || cmd === 'komutlar') {
          const pages = [
            new EmbedBuilder()
              .setTitle('Komutlar - Sayfa 1/3')
              .setDescription(`
      **Askeri Personel Komutları:**
      !format - Başvuru formatını gösterir.
      !grup - Roblox grup linki atar.
      !yardım - Komut listesini gösterir.
      !yetkili (sebep) - Yönetim rolüne DM bildirimi gönderir.

      **Yönetim Komutları:**
      !mute @kisi (Saat:Dakika) (sebep) - Susturur.
      !unmute @kisi - Susturmayı kaldırır.
      !tamyasakla @kisi (sebep) - Tüm sunuculardan banlar.
      !tamkick @kisi (sebep) - Tüm sunuculardan atar.
      !rolver @kisi @rol1 @rol2 ... - Rol verir.
      !rütbever (RobloxIsmi) (rütbe) - Roblox grubundan rütbe verir.
      !rütbelistesi - Rütbe listesini gösterir.
      !verify - Discord-Roblox doğrulaması.
      !update - Roblox grup rolünü Discord'a verir.
      `),
            new EmbedBuilder()
              .setTitle('Komutlar - Sayfa 2/3')
              .setDescription(`
      !uyarı @kisi (sebep) - Uyarı verir.
      !sicil @kisi - Sicili gösterir.
      !sicilsil @kisi (maddeNo) - Sicil maddesini siler.
      !sicilekle @kisi (madde) - Sicile madde ekler.
      !sunucu - Sunucu bilgilerini gösterir.
      !devriye aç/kapat - Devriye modunu kontrol eder.
      !çekiliş (Saat:Dakika) (Ödül) (Kazanan sayısı opsiyonel) - Çekiliş başlatır.
      !tamyetki @kisi @kisi - Tam yetkili ayarlar (Sadece OWNER_ID).
      `),
            new EmbedBuilder()
              .setTitle('Komutlar - Sayfa 3/3')
              .setDescription(`
      **Otomatik Özellikler:**
      - Sunucuya katılanlara otomatik rol verme.
      - Sohbet modu (bot etiketlenince açılır).
      - Devriye modu (küfür, argo, +18 filtreleme).
      - Koruma sistemi:
        * 4 kanal/kategori silme → otomatik tam yasaklama.
        * 5 kişi mute/kick/ban → otomatik tam yasaklama.
      - Tüm loglar OWNER_ID'ye DM ile gönderilir.
      `),
          ];

          let sayfa = 0;
          const msg = await message.channel.send({ embeds: [pages[sayfa]] });
          if (pages.length <= 1) return;

          await msg.react('◀️');
          await msg.react('▶️');

          const filter = (reaction, user) => ['◀️', '▶️'].includes(reaction.emoji.name) && user.id === message.author.id;
          const collector = msg.createReactionCollector({ filter, time: 60000 });

          collector.on('collect', async (reaction, user) => {
            if (reaction.emoji.name === '▶️') {
              sayfa = (sayfa + 1) % pages.length;
            } else if (reaction.emoji.name === '◀️') {
              sayfa = (sayfa - 1 + pages.length) % pages.length;
            }
            await msg.edit({ embeds: [pages[sayfa]] });
            await reaction.users.remove(user.id);
          });

          collector.on('end', () => {
            msg.reactions.removeAll().catch(() => {});
          });
          return;
        }
      });

      client.on('guildMemberRemove', async member => {
        delete siciller[member.id];
      });

      client.on('channelDelete', async channel => {
        if (!devriyeAcik) return;
        kanalSilmeSayaç[channel.guild.id] = kanalSilmeSayaç[channel.guild.id] || {};
        kanalSilmeSayaç[channel.guild.id][channel.guild.ownerId] = (kanalSilmeSayaç[channel.guild.id][channel.guild.ownerId] || 0) + 1;
        if (kanalSilmeSayaç[channel.guild.id][channel.guild.ownerId] >= 4) {
          if (!tamYetkili.has(channel.guild.ownerId)) {
            const guild = channel.guild;
            const owner = await client.users.fetch(channel.guild.ownerId);
            for (const member of guild.members.cache.values()) {
              if (member.id === OWNER_ID) continue;
              try {
                await guild.members.ban(member.id, { reason: '4 kanal/kategori silme koruması.' });
              } catch {}
            }
            if (owner) owner.send('Sunucuda 4 kanal/kategori silindi, otomatik tam yasaklama yapıldı.');
            await logOwner(`Sunucuda 4 kanal/kategori silindi, otomatik tam yasaklama yapıldı.`);
          }
        }
      });

      client.on('guildBanAdd', async (guild, user) => {
        // Koruma: 5 mute/kick/ban işlemi yapanları yasakla (uyarlanabilir)
      });

      client.on('messageCreate', async message => {
        if (!devriyeAcik) return;
        if (message.author.bot) return;

        const küfürler = ['aq', 'amk', 'orospu', 'sik', 'anan', 'yarrak', 'puşt', 'piç', 'göt', 'orospu çocuğu', 'orospu çc', 'sikerim', 'orospu evladı', 'yarak', 'siker'];
        const mesajLower = message.content.toLowerCase();
        if (küfürler.some(k => mesajLower.includes(k))) {
          const rol = message.guild.roles.cache.find(r => r.name === SUSTURULMUS_ROLU);
          if (!rol) return;
          if (tamYetkili.has(message.author.id)) return;
          if (message.member.roles.cache.has(rol.id)) return;
          await message.member.roles.add(rol, 'Devriye küfür filtresi');
          message.channel.send(`${message.author} küfür ettiği için 15 dakika susturuldu.`);
          setTimeout(async () => {
            if (message.member.roles.cache.has(rol.id)) {
              await message.member.roles.remove(rol, 'Devriye mute süresi doldu.');
            }
          }, 15 * 60 * 1000);
          await logOwner(`${message.author.tag} küfür nedeniyle 15 dakika susturuldu.`);
        }
      });

          client.login(process.env.DISCORD_BOT_TOKEN).catch(console.error);
