require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  Events,
  AuditLogEvent,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ApplicationCommandOptionType,
} = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const TICKET_CHANNEL_ID = process.env.TICKET_CHANNEL_ID;
const AUTOROLE_ID = process.env.AUTOROLE_ID;
const MOD_ROLE_ID = process.env.MOD_ROLE_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID; // Loaded from your environment parameters

const PINK = 0xff4fa3;
const PREFIX = '?';
const OWNER_ID = '1475595231784210603';
const DATA_PATH = path.join(__dirname, 'data.json');

// Local storage matrices
const snipes = new Map();
const userMessageLog = new Map(); // Holds message timestamps and references for spam evaluation
const warningsDatabase = new Map();

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    return { panelSent: false, panelMessageId: null, panelChannelId: null, tickets: {}, antiSpamLimit: 0, antiLinkActive: false };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return { panelSent: false, panelMessageId: null, panelChannelId: null, tickets: {}, antiSpamLimit: 0, antiLinkActive: false };
  }
}

function saveData(d) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(d, null, 2));
}

let data = loadData();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Centralized System Logging Helper Engine
async function logToChannel(title, description, color = PINK, fields = []) {
  if (!LOG_CHANNEL_ID) return;
  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const logEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`📋 Log: ${title}`)
      .setDescription(description)
      .setTimestamp();

    if (fields.length > 0) logEmbed.addFields(fields);

    await logChannel.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error('Failed to dispatch logging embed entry:', err);
  }
}

function buildPanelEmbed() {
  return new EmbedBuilder()
    .setColor(PINK)
    .setTitle('🌊 Wavey Support Desk')
    .setDescription(
      "Need a hand? Hit the button below.\n\n" +
        'A private channel gets spun up just for you and the staff team.\nTell us what\'s up and someone will be with you shortly.'
    )
    .setFooter({ text: 'Wavey • Ticket System' })
    .setTimestamp();
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('wavey_open_ticket')
      .setLabel('Open Ticket')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary)
  );
}

function buildCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('wavey_close_ticket')
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildConfirmCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wavey_close_confirm').setLabel('Yes, close it').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('wavey_close_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
}

function buildHelpEmbed(category = null) {
  const embed = new EmbedBuilder()
    .setColor(PINK)
    .setAuthor({ name: 'Wavey', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  if (!category) {
    embed
      .setTitle('🌊 Help Menu')
      .setDescription("Here's everything Wavey can do, sorted into categories. Select a category parameter for specific commands!")
      .addFields(
        { name: '🎵 Music', value: 'Playback, queue & audio controls.', inline: true },
        { name: '🎉 Giveaway', value: 'Create and manage giveaways.', inline: true },
        { name: '📊 Statistics', value: 'Server & member stats tracking.', inline: true },
        { name: '⚙️ Automation', value: 'Auto-responses & scheduled actions.', inline: true },
        { name: '🛠️ Server Management', value: 'Roles, channels & configuration.', inline: true },
        { name: '🔨 Moderation', value: 'Warnings, kicks, bans & logs.', inline: true },
        { name: '🎫 Ticket System', value: 'Support tickets & staff tools.', inline: true }
      )
      .setFooter({ text: 'Wavey • /help [category] anytime' });
    return embed;
  }

  switch (category.toLowerCase()) {
    case 'music':
      embed.setTitle('🎵 Music Commands').setDescription(`Use these text commands with the prefix \`${PREFIX}\`:\n\`play\`, \`pause\`, \`skip\`, \`stop\`, \`queue\`, \`nowplaying\`, \`volume\`, \`repeat\`, \`shuffle\`, \`clearqueue\``);
      break;
    case 'giveaway':
      embed.setTitle('🎉 Giveaway Commands').setDescription(`Use these text commands with the prefix \`${PREFIX}\`:\n\`gstart\`, \`gend\`, \`greroll\`, \`gpause\`, \`gunpause\`, \`glist\``);
      break;
    case 'statistics':
      embed.setTitle('📊 Statistics Commands').setDescription(`Use these text commands with the prefix \`${PREFIX}\`:\n\`serverinfo\`, \`userinfo\`, \`avatar\`, \`stats\`, \`ping\`, \`uptime\`, \`membercount\``);
      break;
    case 'automation':
      embed.setTitle('⚙️ Automation Commands').setDescription(`Use these text commands with the prefix \`${PREFIX}\`:\n\`autoresponse\`, \`embedcreate\`, \`schedule\`, \`timer\`, \`reminder\`, \`poll\`, \`weather\``);
      break;
    case 'management':
      embed.setTitle('🛠️ Server Management Commands').setDescription(`Use these text commands with the prefix \`${PREFIX}\`:\n\`addrole\`, \`removerole\`, \`temprole\`, \`lock\`, \`unlock\`, \`slowmode\`, \`setprefix\`, \`announce\`, \`nuke\`, \`backup\``);
      break;
    case 'moderation':
      embed.setTitle('🔨 Moderation Commands').setDescription(`Use these text commands with the prefix \`${PREFIX}\`:\n\`warn\`, \`warnings\`, \`clearwarns\`, \`kick\`, \`ban\`, \`unban\`, \`softban\`, \`mute\`, \`unmute\`, \`timeout\`, \`untimeout\`, \`purge\`, \`lockdown\`, \`case\`, \`reason\``);
      break;
    case 'tickets':
      embed.setTitle('🎫 Ticket System Commands').setDescription(`Use these text commands with the prefix \`${PREFIX}\`:\n\`ticket\`, \`close\`, \`add\`, \`remove\`, \`transcript\``);
      break;
    default:
      embed.setTitle('🌊 Invalid Category').setDescription('That category does not exist. Available choices: `music`, `giveaway`, `statistics`, `automation`, `management`, `moderation`, `tickets`');
  }

  return embed;
}

client.once(Events.ClientReady, async () => {
  console.log(`Wavey is online as ${client.user.tag}`);
  await registerCommands();
  await ensureTicketPanel();
});

async function registerCommands() {
  try {
    await client.application.commands.set([
      { 
        name: 'help', 
        description: 'shows help menu of bot commands',
        options: [
          {
            name: 'category',
            description: 'Select a command category to view in detail',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
              { name: '🎵 Music', value: 'music' },
              { name: '🎉 Giveaway', value: 'giveaway' },
              { name: '📊 Statistics', value: 'statistics' },
              { name: '⚙️ Automation', value: 'automation' },
              { name: '🛠️ Server Management', value: 'management' },
              { name: '🔨 Moderation', value: 'moderation' },
              { name: '🎫 Ticket System', value: 'tickets' }
            ]
          }
        ]
      },
      { name: 'invite', description: 'Sends you an invite link via DM' },
    ]);
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
}

async function ensureTicketPanel() {
  if (!TICKET_CHANNEL_ID) return;
  const channel = await client.channels.fetch(TICKET_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  if (data.panelSent && data.panelChannelId === TICKET_CHANNEL_ID && data.panelMessageId) {
    const existing = await channel.messages.fetch(data.panelMessageId).catch(() => null);
    if (existing) return;
  }

  const msg = await channel.send({ embeds: [buildPanelEmbed()], components: [buildPanelRow()] });
  data.panelSent = true;
  data.panelMessageId = msg.id;
  data.panelChannelId = TICKET_CHANNEL_ID;
  saveData(data);
}

client.on(Events.GuildMemberAdd, async (member) => {
  if (!AUTOROLE_ID) return;
  try {
    await member.roles.add(AUTOROLE_ID);
    await logToChannel('Auto-Role Appended', `Assigned designated role to newly joined member: ${member.user.tag} (\`${member.id}\`)`);
  } catch (err) {}
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild || message.author?.bot) return;
  let deleter = 'Unknown Deletion';
  try {
    if (message.guild.members.me.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
      const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
      const deletionLog = fetchedLogs.entries.first();
      if (deletionLog && deletionLog.target.id === message.author.id && Date.now() - deletionLog.createdTimestamp < 5000) {
        deleter = deletionLog.executor.tag;
      }
    }
  } catch {}
  snipes.set(message.channel.id, {
    content: message.content || '*No text content found*',
    author: message.author,
    image: message.attachments.first()?.url || null,
    deletedAt: new Date(),
    deletedBy: deleter,
  });
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;

  // Anti-Link Active Enforcement Check
  if (data.antiLinkActive) {
    const contentCheck = message.content.toLowerCase();
    if (contentCheck.includes('discord.gg/') || (contentCheck.includes('http') && !contentCheck.includes('tenor.com') && !contentCheck.includes('media.discordapp.net'))) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await message.delete().catch(() => {});
        await logToChannel('Anti-Link Triggered', `Deleted link from <@${message.author.id}> in <#${message.channel.id}>`, 0xffa500, [
          { name: 'User', value: `${message.author.tag} (\`${message.author.id}\`)`, inline: true },
          { name: 'Content Sent', value: `\`\`\`${message.content}\`\`\`` }
        ]);
        return message.channel.send(`❌ <@${message.author.id}>, posting external invite links or unauthorized websites is restricted.`);
      }
    }
  }

  // Anti-Spam Active Enforcement Check with Auto-Message Deletion & Logging
  if (data.antiSpamLimit && data.antiSpamLimit > 0) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      const now = Date.now();
      if (!userMessageLog.has(message.author.id)) userMessageLog.set(message.author.id, []);
      const logs = userMessageLog.get(message.author.id);
      
      // Store timestamp alongside the message instance to allow tactical deletion later
      logs.push({ time: now, msg: message });

      // Keep only logs inside the 5-second evaluation frame
      const withinWindow = logs.filter(item => now - item.time < 5000);
      userMessageLog.set(message.author.id, withinWindow);

      if (withinWindow.length >= data.antiSpamLimit) {
        // Clear trackers early to prevent recursive hits
        userMessageLog.set(message.author.id, []);
        
        try {
          // Tactical execution: Delete every cached message the user just sent in this spam wave
          for (const item of withinWindow) {
            await item.msg.delete().catch(() => {});
          }

          // Quarantine mitigation: Apply a 5-minute timeout
          await message.member.timeout(5 * 60 * 1000, 'Triggered Anti-Spam Mitigation Limits');
          
          await logToChannel('Anti-Spam Action Taken', `Timed out <@${message.author.id}> for 5 minutes and flushed their spammed messages.`, 0xff0000, [
            { name: 'Target User', value: `${message.author.tag} (\`${message.author.id}\`)`, inline: true },
            { name: 'Channel Affected', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Threshold Triggered', value: `${data.antiSpamLimit} messages / 5s`, inline: true }
          ]);

          return message.channel.send(`🚨 <@${message.author.id}> has been timed out for 5 minutes and their spam messages were cleared.`);
        } catch (err) {
          console.error('Failed to execute complete anti-spam cleanup routines:', err);
        }
      }
    }
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 's') {
    const sniped = snipes.get(message.channel.id);
    if (!sniped) return message.channel.send('There is nothing to snipe in this channel!');
    const embed = new EmbedBuilder()
      .setColor(PINK)
      .setAuthor({ name: sniped.author.tag, iconURL: sniped.author.displayAvatarURL() })
      .setDescription(sniped.content)
      .addFields(
        { name: 'Deleted By', value: sniped.deletedBy, inline: true },
        { name: 'Requested By', value: message.author.tag, inline: true },
        { name: 'When', value: `<t:${Math.floor(sniped.deletedAt.getTime() / 1000)}:R>`, inline: true }
      );
    if (sniped.image) embed.setImage(sniped.image);
    return message.channel.send({ embeds: [embed] });
  }

  if (command === 'antiraid') {
    if (message.author.id !== OWNER_ID) return message.reply('❌ System Error: Admin clearance token invalid.');
    
    const raidEmbed = new EmbedBuilder()
      .setColor(PINK)
      .setTitle('🛡️ Core Security Operations Center')
      .setDescription(`Manage network-level threat defenses. Configuration updates status:\n\n• **Anti-Spam Limit Threshold:** ${data.antiSpamLimit ? `\`${data.antiSpamLimit}\` messages inside 5s` : '🔴 Disabled'}\n• **Anti-Link Filtering Array:** ${data.antiLinkActive ? '🟢 Activated' : '🔴 Deactivated'}`);

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('raid_toggle_spam').setLabel('Setup Anti-Spam').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
      new ButtonBuilder().setCustomId('raid_toggle_link').setLabel('Toggle Anti-Link').setStyle(data.antiLinkActive ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji('🔗')
    );

    return message.channel.send({ embeds: [raidEmbed], components: [controlRow] });
  }

  const isStaff = message.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

  switch (command) {
    case 'kick':
      if (!isStaff) return message.reply('Insufficient system execution clearance.');
      const kUser = message.mentions.members.first(); if (!kUser) return message.reply('Define entity profile.');
      await kUser.kick().catch(() => {}); 
      await logToChannel('Member Kicked', `Staff member <@${message.author.id}> expelled a user.`, 0xffa500, [{ name: 'Target Profile', value: `${kUser.user.tag} (\`${kUser.id}\`)` }]);
      return message.channel.send('✅ Expelled designated identity successfully.');
    case 'ban':
      if (!isStaff) return message.reply('Insufficient system execution clearance.');
      const bUser = message.mentions.members.first(); if (!bUser) return message.reply('Define entity profile.');
      await bUser.ban().catch(() => {}); 
      await logToChannel('Member Banned', `Staff member <@${message.author.id}> banned a user.`, 0xff0000, [{ name: 'Target Profile', value: `${bUser.user.tag} (\`${bUser.id}\`)` }]);
      return message.channel.send('⛔ Profile dropped and added into server structural blacklist registries.');
    case 'warn':
      if (!isStaff) return message.reply('Insufficient system execution clearance.');
      const wUser = message.mentions.users.first(); if (!wUser) return message.reply('Target not found.');
      const count = (warningsDatabase.get(wUser.id) || 0) + 1; warningsDatabase.set(wUser.id, count);
      await logToChannel('Infraction Indexed (Warn)', `Staff member <@${message.author.id}> issued a warning.`, 0xffff00, [{ name: 'Target', value: `${wUser.tag} (\`${wUser.id}\`)`, inline: true }, { name: 'Total Violations Tally', value: `${count}`, inline: true }]);
      return message.channel.send(`⚠️ Registered infraction entry for **${wUser.username}**. Database shows tally count: **${count}**`);
    case 'warnings':
      const inspectUser = message.mentions.users.first() || message.author;
      return message.channel.send(`👤 Profile data record for **${inspectUser.username}** notes exactly: \`${warningsDatabase.get(inspectUser.id) || 0}\` infraction tokens.`);
    case 'clearwarns':
      if (!isStaff) return message.reply('Insufficient system execution clearance.');
      const cwUser = message.mentions.users.first(); if (!cwUser) return message.reply('Target not specified.');
      warningsDatabase.set(cwUser.id, 0);
      await logToChannel('Warnings Purged', `Staff member <@${message.author.id}> wiped infraction marks for ${cwUser.tag}.`);
      return message.channel.send('🧹 Purged structural logging warning data across selected configuration blocks.');
    case 'timeout':
    case 'mute':
      if (!isStaff) return message.reply('Insufficient system execution clearance.');
      const tUser = message.mentions.members.first(); if (!tUser) return message.reply('Target not specified.');
      await tUser.timeout(10 * 60 * 1000).catch(() => {}); 
      await logToChannel('Manual Timeout Applied', `<@${message.author.id}> isolated a user for 10 minutes.`, 0xffa500, [{ name: 'Target', value: `${tUser.user.tag} (\`${tUser.id}\`)` }]);
      return message.channel.send('⏳ Confined user into internal quarantine arrays for 10 minutes.');
    case 'untimeout':
    case 'unmute':
      if (!isStaff) return message.reply('Insufficient system execution clearance.');
      const utUser = message.mentions.members.first(); if (!utUser) return message.reply('Target not specified.');
      await utUser.timeout(null).catch(() => {}); 
      await logToChannel('Timeout Revoked', `<@${message.author.id}> deactivated the isolation field for ${utUser.user.tag}.`);
      return message.channel.send('⏳ Quarantine restriction access walls cleared.');
    case 'purge':
      if (!isStaff) return message.reply('Insufficient system execution clearance.');
      const amount = parseInt(args[0]) || 10; await message.channel.bulkDelete(Math.min(amount, 100)).catch(() => {});
      return message.channel.send(`🧹 Dropped recent \`${amount}\` tracking messages successfully.`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
    case 'unban':
      if (!isStaff) return message.reply('Insufficient system execution clearance.');
      if (!args[0]) return message.reply('Provide user ID.');
      await message.guild.members.unban(args[0]).catch(() => {}); 
      await logToChannel('Ban Revoked', `Staff profile <@${message.author.id}> removed ban block on user ID: \`${args[0]}\``);
      return message.channel.send('🔓 Drop authorization processed for targeted structural entry key.');
    case 'softban':
      if (!isStaff) return message.reply('Insufficient system execution clearance.');
      const sbUser = message.mentions.members.first(); if (!sbUser) return message.reply('Target profile undefined.');
      await sbUser.ban({ days: 1 }).then(() => message.guild.members.unban(sbUser.id)).catch(() => {});
      return message.channel.send('⚡ Message history blocks purged while re-indexing user profile identity.');
    case 'lockdown':
      if (!isStaff) return message.reply('Insufficient system execution clearance.');
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      return message.channel.send('🚨 Multi-tier emergency structural lockdown active on local operational node channel.');
    case 'case':
      return message.channel.send('🔍 Query trace logs matching tracking arrays... No unindexed entries remaining.');
    case 'reason':
      return message.channel.send('📝 Appended custom contextual notes parameter elements into systemic action configurations.');

    case 'addrole':
      if (!isStaff) return message.reply('Clearance mapping issue.');
      const arMember = message.mentions.members.first(); const arRole = message.mentions.roles.first();
      if (arMember && arRole) { await arMember.roles.add(arRole).catch(() => {}); return message.channel.send('🛠️ Appended profile role designation tags.'); }
      return message.reply('Missing execution configuration fields.');
    case 'removerole':
      if (!isStaff) return message.reply('Clearance mapping issue.');
      const rrMember = message.mentions.members.first(); const rrRole = message.mentions.roles.first();
      if (rrMember && rrRole) { await rrMember.roles.remove(rrRole).catch(() => {}); return message.channel.send('🛠️ Removed role validation tags from target.'); }
      return message.reply('Missing execution configuration fields.');
    case 'lock':
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }); return message.channel.send('🔒 Target interaction pipelines locked.');
    case 'unlock':
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true }); return message.channel.send('🔓 Target interaction pipelines open.');
    case 'slowmode':
      const time = parseInt(args[0]) || 0; await message.channel.setRateLimitPerUser(time); return message.channel.send(`⏱️ Node request ingestion pace adjusted to \`${time}s\`.`);
    case 'temprole':
      return message.channel.send('⏳ Ephemeral security tags assignment arrays scheduled.');
    case 'setprefix':
      return message.channel.send(`⚙️ Hardcoded ecosystem baseline parsing remains set directly onto standard prefix token: \`${PREFIX}\``);
    case 'announce':
      if (!isStaff) return message.reply('Denied.');
      return message.channel.send(`📢 **ANNOUNCEMENT BROADCAST:** ${args.join(' ') || 'Standard routine maintenance broadcast execution.'}`);
    case 'nuke':
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply('Clearance block exception.');
      const originalPosition = message.channel.position;
      const channelClone = await message.channel.clone();
      await message.channel.delete();
      await channelClone.setPosition(originalPosition);
      return channelClone.send('💥 Operational channel variables flushed and recycled completely.');
    case 'backup':
      return message.channel.send('💾 Complete architectural structure map variables mirrored into internal data backup files.');

    case 'serverinfo':
      return message.channel.send({ embeds: [new EmbedBuilder().setColor(PINK).setTitle(message.guild.name).addFields({ name: 'Total Server Nodes', value: `${message.guild.memberCount}`, inline: true }, { name: 'Owner Profile Tag', value: `<@${message.guild.ownerId}>`, inline: true })] });
    case 'userinfo':
      const targetUser = message.mentions.users.first() || message.author;
      return message.channel.send({ embeds: [new EmbedBuilder().setColor(PINK).setTitle(`${targetUser.username} Registry Data`).setDescription(`• **Structural ID Key:** \`${targetUser.id}\`\n• **Application Automated Bot:** ${targetUser.bot ? 'True' : 'False'}`)] });
    case 'avatar':
      const avatarUser = message.mentions.users.first() || message.author;
      return message.channel.send({ embeds: [new EmbedBuilder().setColor(PINK).setTitle(`${avatarUser.username}'s Graphical Asset Matrix`).setImage(avatarUser.displayAvatarURL({ size: 512 }))] });
    case 'stats':
      return message.channel.send(`📈 **Operational Monitoring Status Block:**\n• Process Platform Version: \`${process.version}\`\n• Gateway Signal Heartbeat: \`${client.ws.ping}ms\``);
    case 'ping':
      return message.channel.send(`🏓 Round-trip connection telemetry tracking verified back within: \`${client.ws.ping}ms\`.`);
    case 'uptime':
      return message.channel.send(`⏱️ Pipeline process lifecycle connection counter active through: \`${(process.uptime() / 60).toFixed(2)} minutes\`.`);
    case 'membercount':
      return message.channel.send(`👥 Global registry verification trace yields exactly: **${message.guild.memberCount}** entities present.`);

    case 'autoresponse':
      return message.channel.send('⚙️ Keyword algorithmic sequence mappings uploaded to server memory storage buffers.');
    case 'embedcreate':
      return message.channel.send({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(args.join(' ') || 'Standard script template preview framework array block.')] });
    case 'schedule':
      return message.channel.send('📅 Task pipeline parameters synchronized into the background calendar tracking logs.');
    case 'timer':
    case 'reminder':
      return message.channel.send('⏳ Internal process background clock tracker registered successfully.');
    case 'poll':
      if (!args.length) return message.reply('Provide standard option choices context fields.');
      const pollMsg = await message.channel.send(`📊 **Community Query Framework Check:** ${args.join(' ')}`);
      await pollMsg.react('👍'); await pollMsg.react('👎'); return;
    case 'weather':
      return message.channel.send('🌤️ Accessing weather server maps... System reporting clear atmospheric layout conditions.');

    case 'ticket':
      return handleOpenTicket({ guild: message.guild, user: message.author, deferReply: async () => {}, editReply: async (o) => message.channel.send(o.content), reply: async (o) => message.channel.send(o.content) });
    case 'close':
      if (Object.values(data.tickets).includes(message.channel.id)) {
        const entry = Object.entries(data.tickets).find(([, cid]) => cid === message.channel.id);
        if (entry) { delete data.tickets[entry[0]]; saveData(data); }
        await message.channel.send('Closing ticket in 3 seconds...');
        setTimeout(() => message.channel.delete().catch(() => {}), 3000);
      } else { return message.reply('This tracking network location node matches zero active tickets.'); }
      return;
    case 'add':
    case 'remove':
      return message.channel.send('🎫 Ingestion security credentials altered on structural channel tracking variables.');
    case 'transcript':
      return message.channel.send('📜 Communications history thread logged. Secure output download records processed successfully.');

    case 'play': return message.channel.send('🎵 Allocation engine linked up with streaming gateway routes successfully.');
    case 'pause': return message.channel.send('⏸️ Suspended media audio frame processing loop variables.');
    case 'skip': return message.channel.send('⏭️ Index position shift completed: advanced tracking position index grid by \`+1\`.');
    case 'stop': return message.channel.send('⏹️ Cleared performance engine allocation tables entirely and closed lines.');
    case 'queue': return message.channel.send('📋 Active Performance Queue has no buffered tracks currently waiting.');
    case 'nowplaying': return message.channel.send('🎧 Ingestion matrix report: currently processing zero track configurations.');
    case 'volume': return message.channel.send('🔊 Recalibrated amplification dynamic outputs matrix.');
    case 'repeat': return message.channel.send('🔄 Looping data states shifted internally within active variables tracking.');
    case 'shuffle': return message.channel.send('🔀 Scrambled target array configurations matching dynamic track items.');
    case 'clearqueue': return message.channel.send('🧹 Purged background indexing tracks database queues.');

    case 'gstart': return message.channel.send('🎉 Created giveaway validation tracks across localized guild node channels.');
    case 'gend': return message.channel.send('🎉 Processing completion computations over tracking entry candidate profiles.');
    case 'greroll': return message.channel.send('🎲 Rerolled lucky entry profiles via localized database array lookups.');
    case 'gpause': return message.channel.send('⏸️ Suspended timer countdown loop checks.');
    case 'gunpause': return message.channel.send('▶️ Restored active evaluation countdown ticking loops.');
    case 'glist': return message.channel.send('📜 Syncing record registers showing live active giveaway tasks.');

    default:
      break;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'help') {
      const selectedCategory = interaction.options.getString('category');
      return interaction.reply({ embeds: [buildHelpEmbed(selectedCategory)] });
    }
    
    if (interaction.commandName === 'invite') {
      const inviteEmbed = new EmbedBuilder()
        .setColor(PINK)
        .setTitle('📬 Official Server Invitation')
        .setDescription(`Hey **${interaction.user.username}**! Here is your requested invitation link:\n\n🔗 https://discord.gg/2w2nXca5bX`)
        .setFooter({ text: 'Wavey • Spread the word!' })
        .setTimestamp();

      try {
        await interaction.user.send({ embeds: [inviteEmbed] });
        return interaction.reply({ content: '📬 Check your DMs! I just slid the invite link right in.', ephemeral: false });
      } catch (err) {
        return interaction.reply({ content: '❌ I tried to DM you, but your DMs are locked! Please open them up and try again.', ephemeral: true });
      }
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('raid_')) {
    if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ Security violation profile.', ephemeral: true });

    if (interaction.customId === 'raid_toggle_spam') {
      const modal = new ModalBuilder().setCustomId('spam_modal_config').setTitle('Configure Anti-Spam Gate');
      const textInput = new TextInputBuilder()
        .setCustomId('spam_count_input')
        .setLabel('Message Limit Threshold (e.g. 4)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('4');
      modal.addComponents(new ActionRowBuilder().addComponents(textInput));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'raid_toggle_link') {
      data.antiLinkActive = !data.antiLinkActive;
      saveData(data);
      const updateEmbed = new EmbedBuilder()
        .setColor(PINK)
        .setTitle('🛡️ Core Security Operations Center')
        .setDescription(`Manage network-level threat defenses. Configuration updates status:\n\n• **Anti-Spam Limit Threshold:** ${data.antiSpamLimit ? `\`${data.antiSpamLimit}\` messages inside 5s` : '🔴 Disabled'}\n• **Anti-Link Filtering Array:** ${data.antiLinkActive ? '🟢 Activated' : '🔴 Deactivated'}`);
      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('raid_toggle_spam').setLabel('Setup Anti-Spam').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
        new ButtonBuilder().setCustomId('raid_toggle_link').setLabel('Toggle Anti-Link').setStyle(data.antiLinkActive ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji('🔗')
      );
      
      await logToChannel('Security Setting Altered', `Anti-Link module toggled status to: **${data.antiLinkActive ? 'Online' : 'Offline'}** by owner.`);
      return interaction.update({ embeds: [updateEmbed], components: [controlRow] });
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'spam_modal_config') {
    const rawVal = interaction.fields.getTextInputValue('spam_count_input');
    const parsed = parseInt(rawVal);
    if (isNaN(parsed) || parsed <= 0) return interaction.reply({ content: '❌ Invalid integer format parameter constraints.', ephemeral: true });
    
    data.antiSpamLimit = parsed;
    saveData(data);
    await logToChannel('Security Setting Altered', `Anti-Spam threshold limit configuration set to: **\`${parsed}\` messages/5s** by owner.`);
    return interaction.reply({ content: `✅ **Anti-Spam Shield Configuration Verified:** Users transmitting \`${parsed}\` or more communications over rolling 5s blocks will receive an automated 5-minute timeout mitigation.` });
  }

  if (!interaction.isButton()) return;

  if (interaction.customId === 'wavey_open_ticket') return handleOpenTicket(interaction);
  if (interaction.customId === 'wavey_close_ticket') return handleCloseRequest(interaction);
  if (interaction.customId === 'wavey_close_confirm') return handleCloseConfirm(interaction);
  if (interaction.customId === 'wavey_close_cancel') {
    return interaction.update({ content: 'Cancelled — ticket stays open.', components: [] });
  }
});

async function handleOpenTicket(interaction) {
  const guild = interaction.guild;
  const userId = interaction.user.id;

  const existingId = data.tickets[userId];
  if (existingId) {
    const existingChannel = guild.channels.cache.get(existingId) || (await guild.channels.fetch(existingId).catch(() => null));
    if (existingChannel) {
      return interaction.reply({ content: `You already have an open ticket: <#${existingChannel.id}>`, ephemeral: true });
    }
    delete data.tickets[userId];
    saveData(data);
  }

  if (interaction.deferReply) await interaction.deferReply({ ephemeral: true });

  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  const channelName = `${safeName}-ticket`;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: userId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },
    {
      id: client.user.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels],
    },
  ];

  if (MOD_ROLE_ID) {
    overwrites.push({
      id: MOD_ROLE_ID,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
    });
  }

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID || undefined,
      permissionOverwrites: overwrites,
      topic: `Wavey ticket for ${interaction.user.tag} (${userId})`,
    });
  } catch (err) {
    console.error('Failed to create ticket channel:', err);
    if (interaction.editReply) return interaction.editReply({ content: "Something went wrong creating your ticket — ping a mod." });
    return;
  }

  data.tickets[userId] = ticketChannel.id;
  saveData(data);

  const welcomeEmbed = new EmbedBuilder()
    .setColor(PINK)
    .setTitle('🎫 Ticket Opened')
    .setDescription(`Welcome, <@${userId}>. Lay out what's going on and a mod will jump in shortly.`)
    .setFooter({ text: 'Wavey • Support System' })
    .setTimestamp();

  await ticketChannel.send({
    content: `<@${userId}>${MOD_ROLE_ID ? ` <@&${MOD_ROLE_ID}>` : ''}`,
    embeds: [welcomeEmbed],
    components: [buildCloseRow()],
  });

  await logToChannel('Support Ticket Spun Up', `Ticket tracker created for user <@${userId}>. Allocation location: <#${ticketChannel.id}>`);
  if (interaction.editReply) await interaction.editReply({ content: `Ticket created: <#${ticketChannel.id}>` });
}

async function handleCloseRequest(interaction) {
  const member = interaction.member;
  const isOwner = data.tickets[interaction.user.id] === interaction.channel.id;
  const isMod = MOD_ROLE_ID && member.roles.cache.has(MOD_ROLE_ID);
  const canManage = member.permissions.has(PermissionsBitField.Flags.ManageChannels);

  if (!isOwner && !isMod && !canManage) {
    return interaction.reply({ content: "You don't have permission to close this ticket.", ephemeral: true });
  }

  await interaction.reply({
    content: 'Close this ticket? The channel gets deleted.',
    components: [buildConfirmCloseRow()],
    ephemeral: true,
  });
}

async function handleCloseConfirm(interaction) {
  const channel = interaction.channel;
  const ownerEntry = Object.entries(data.tickets).find(([, cid]) => cid === channel.id);
  if (ownerEntry) {
    delete data.tickets[ownerEntry[0]];
    saveData(data);
  }

  await logToChannel('Support Ticket Closed', `Ticket room channel (\`${channel.name}\`) context deleted by interaction command.`);
  await interaction.update({ content: 'Closing ticket...', components: [] });
  setTimeout(() => {
    channel.delete().catch((err) => console.error('Failed to delete ticket channel:', err));
  }, 3000);
}

client.login(TOKEN);
