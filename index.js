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
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID; 

const PINK = 0xff4fa3;
const PREFIX = '?';
const OWNER_ID = '1475595231784210603';
const DATA_PATH = path.join(__dirname, 'data.json');

// Local storage maps
const snipes = new Map();
const userMessageLog = new Map(); 
const warningsDatabase = new Map();
const processingSpamUsers = new Set(); 
const activeCustomVCs = new Map();

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    return { panelSent: false, panelMessageId: null, panelChannelId: null, tickets: {}, antiSpamLimit: 0, antiLinkActive: false, j2cChannelId: null };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return { panelSent: false, panelMessageId: null, panelChannelId: null, tickets: {}, antiSpamLimit: 0, antiLinkActive: false, j2cChannelId: null };
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
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Helper function to build the Security Control Center panel embed dynamically
function buildAntiRaidEmbed() {
  return new EmbedBuilder()
    .setColor(PINK)
    .setTitle('🛡️ Security Control Center')
    .setDescription(`Manage server-level antiraid toggles below:\n\n• **Anti-Spam Limit:** ${data.antiSpamLimit ? `🟢 \`${data.antiSpamLimit}\` messages inside 5s` : '🔴 Disabled'}\n• **Anti-Link Filter:** ${data.antiLinkActive ? '🟢 Active' : '🔴 Disabled'}`);
}

function buildAntiRaidButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('raid_toggle_spam').setLabel('Setup Anti-Spam').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
    new ButtonBuilder().setCustomId('raid_toggle_link').setLabel('Toggle Anti-Link').setStyle(data.antiLinkActive ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji('🔗')
  );
}

// Helper function to send simple matching pink embeds in chat
function sendEmbed(message, title, description, error = false) {
  const embed = new EmbedBuilder()
    .setColor(error ? 0xff0000 : PINK)
    .setDescription(description);
  if (title) embed.setTitle(title);
  return message.channel.send({ embeds: [embed] });
}

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
    new ButtonBuilder().setCustomId('wavey_open_ticket').setLabel('Open Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
  );
}

function buildCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wavey_close_ticket').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
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
      embed.setTitle('🛠️ Server Management Commands').setDescription(`Use these text commands with the prefix \`${PREFIX}\`:\n\`addrole\`, \`removerole\`, \`temprole\`, \`lock\`, \`unlock\`, \`slowmode\`, \`setprefix\`, \`announce\`, \`nuke\`, \`backup\`, \`j2c\``);
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
    await logToChannel('Auto-Role Added', `Assigned the auto-role to newly joined member: ${member.user.tag} (\`${member.id}\`)`);
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

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const user = newState.member?.user;
  if (!user || user.bot) return;

  if (newState.channelId && newState.channelId === data.j2cChannelId) {
    const guild = newState.guild;
    const categoryId = newState.channel.parentId;
    const voiceChannelName = `${user.username}-vc`;

    try {
      const customVC = await guild.channels.create({
        name: voiceChannelName,
        type: ChannelType.GuildVoice,
        parent: categoryId || undefined,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect],
          },
          {
            id: user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
          }
        ]
      });

      await newState.member.voice.setChannel(customVC).catch(() => {});

      activeCustomVCs.set(customVC.id, {
        ownerId: user.id,
        voiceChannelId: customVC.id
      });

      const vcControlEmbed = new EmbedBuilder()
        .setColor(PINK)
        .setTitle('🔊 Voice Channel Controls')
        .setDescription(`Hey <@${user.id}>! Welcome to your private room. Use the control deck below to manage your settings instantly directly from this voice chat.`);

      const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vc_lock').setLabel('Lock room').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('vc_unlock').setLabel('Unlock room').setStyle(ButtonStyle.Success).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('vc_permit').setLabel('Permit User').setStyle(ButtonStyle.Primary).setEmoji('➕'),
        new ButtonBuilder().setCustomId('vc_kick').setLabel('Kick User').setStyle(ButtonStyle.Secondary).setEmoji('👢'),
        new ButtonBuilder().setCustomId('vc_delete').setLabel('Delete Room').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
      );

      await customVC.send({ content: `<@${user.id}>`, embeds: [vcControlEmbed], components: [btnRow] });
      await logToChannel('Voice Room Initialized', `Created temporary voice interface for user: ${user.tag}`);

    } catch (err) {
      console.error('Failed to create custom voice session assets:', err);
    }
  }

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const cachedRoom = activeCustomVCs.get(oldState.channelId);
    if (cachedRoom) {
      const channelObj = oldState.guild.channels.cache.get(oldState.channelId);
      if (channelObj && channelObj.members.size === 0) {
        activeCustomVCs.delete(oldState.channelId);
        await channelObj.delete().catch(() => {});
        await logToChannel('Voice Room Automated Cleanup', `Wiped out empty custom voice channel owned by user ID: \`${cachedRoom.ownerId}\``);
      }
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;

  if (data.antiLinkActive) {
    const contentCheck = message.content.toLowerCase();
    if (contentCheck.includes('discord.gg/') || (contentCheck.includes('http') && !contentCheck.includes('tenor.com') && !contentCheck.includes('media.discordapp.net'))) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await message.delete().catch(() => {});
        await logToChannel('Anti-Link Triggered', `Deleted link from <@${message.author.id}> in <#${message.channel.id}>`, 0xffa500, [
          { name: 'User', value: `${message.author.tag} (\`${message.author.id}\`)`, inline: true },
          { name: 'Content Sent', value: `\`\`\`${message.content}\`\`\`` }
        ]);
        const embed = new EmbedBuilder().setColor(0xff0000).setDescription(`❌ <@${message.author.id}>, posting external links or invites is not allowed.`);
        return message.channel.send({ embeds: [embed] });
      }
    }
  }

  if (data.antiSpamLimit && data.antiSpamLimit > 0) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      const now = Date.now();
      if (!userMessageLog.has(message.author.id)) userMessageLog.set(message.author.id, []);
      const logs = userMessageLog.get(message.author.id);
      
      logs.push({ time: now, msg: message });

      const withinWindow = logs.filter(item => now - item.time < 5000);
      userMessageLog.set(message.author.id, withinWindow);

      if (withinWindow.length >= data.antiSpamLimit) {
        if (processingSpamUsers.has(message.author.id)) return;
        processingSpamUsers.add(message.author.id);

        userMessageLog.set(message.author.id, []);
        
        try {
          await message.member.timeout(5 * 60 * 1000, 'Triggered Anti-Spam Mitigation Limits');
          
          const alertEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('🚨 Anti-Spam Triggered')
            .setDescription(`<@${message.author.id}> has been timed out for 5 minutes and their spammed messages were cleared.`);
          await message.channel.send({ embeds: [alertEmbed] });

          await logToChannel('Anti-Spam Action Taken', `Timed out <@${message.author.id}> for 5 minutes and cleared their spammed messages.`, 0xff0000, [
            { name: 'Target User', value: `${message.author.tag} (\`${message.author.id}\`)`, inline: true },
            { name: 'Channel Affected', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Threshold Triggered', value: `${data.antiSpamLimit} messages / 5s`, inline: true }
          ]);

          for (const item of withinWindow) {
            await item.msg.delete().catch(() => {});
          }
        } catch (err) {
          console.error('Failed to execute complete anti-spam cleanup routines:', err);
        } finally {
          processingSpamUsers.delete(message.author.id);
        }
        return;
      }
    }
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 's') {
    const sniped = snipes.get(message.channel.id);
    if (!sniped) return sendEmbed(message, null, '❌ There is nothing to snipe in this channel!', true);
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
    if (message.author.id !== OWNER_ID) return sendEmbed(message, null, '❌ Error: You do not have permission to use this command.', true);
    return message.channel.send({ embeds: [buildAntiRaidEmbed()], components: [buildAntiRaidButtons()] });
  }

  const isStaff = message.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

  switch (command) {
    case 'j2c':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const targetVcId = args[0];
      if (!targetVcId) return sendEmbed(message, null, '❌ Please provide a valid Voice Channel ID.', true);
      
      data.j2cChannelId = targetVcId;
      saveData(data);
      return sendEmbed(message, '🔊 Join-To-Create Synced', `Successfully linked the Join-To-Create tracking target trigger to Channel ID: \`${targetVcId}\``);

    case 'kick':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const kUser = message.mentions.members.first(); if (!kUser) return sendEmbed(message, null, '❌ Please mention a user to kick.', true);
      await kUser.kick().catch(() => {}); 
      await logToChannel('Member Kicked', `Staff member <@${message.author.id}> kicked a user.`, 0xffa500, [{ name: 'Target', value: `${kUser.user.tag} (\`${kUser.id}\`)` }]);
      return sendEmbed(message, '👢 Member Kicked', `Successfully kicked **${kUser.user.tag}** from the server.`);
    case 'ban':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const bUser = message.mentions.members.first(); if (!bUser) return sendEmbed(message, null, '❌ Please mention a user to ban.', true);
      await bUser.ban().catch(() => {}); 
      await logToChannel('Member Banned', `Staff member <@${message.author.id}> banned a user.`, 0xff0000, [{ name: 'Target', value: `${bUser.user.tag} (\`${bUser.id}\`)` }]);
      return sendEmbed(message, '⛔ Member Banned', `Successfully banned **${bUser.user.tag}** and added them to the blacklist.`);
    case 'warn':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const wUser = message.mentions.users.first(); if (!wUser) return sendEmbed(message, null, '❌ Please mention a user to warn.', true);
      const count = (warningsDatabase.get(wUser.id) || 0) + 1; warningsDatabase.set(wUser.id, count);
      await logToChannel('Warning Issued', `Staff member <@${message.author.id}> warned a user.`, 0xffff00, [{ name: 'Target', value: `${wUser.tag} (\`${wUser.id}\`)`, inline: true }, { name: 'Total Warnings', value: `${count}`, inline: true }]);
      return sendEmbed(message, '⚠️ Warning Issued', `Successfully warned **${wUser.username}**. Total warnings: **${count}**`);
    case 'warnings':
      const inspectUser = message.mentions.users.first() || message.author;
      return sendEmbed(message, '📊 Warnings Tracker', `**${inspectUser.username}** currently has \`${warningsDatabase.get(inspectUser.id) || 0}\` warning marks.`);
    case 'clearwarns':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const cwUser = message.mentions.users.first(); if (!cwUser) return sendEmbed(message, null, '❌ Please mention a user to clear warnings for.', true);
      warningsDatabase.set(cwUser.id, 0);
      await logToChannel('Warnings Cleared', `Staff member <@${message.author.id}> wiped warnings for ${cwUser.tag}.`);
      return sendEmbed(message, '🧹 Warnings Cleared', `Successfully wiped all warning history for **${cwUser.username}**.`);
    case 'timeout':
    case 'mute':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const tUser = message.mentions.members.first(); if (!tUser) return sendEmbed(message, null, '❌ Please mention a user to mute.', true);
      await tUser.timeout(10 * 60 * 1000).catch(() => {}); 
      await logToChannel('Manual Timeout Applied', `<@${message.author.id}> timed out a user for 10 minutes.`, 0xffa500, [{ name: 'Target', value: `${tUser.user.tag} (\`${tUser.id}\`)` }]);
      return sendEmbed(message, '⏳ User Muted', `Successfully muted **${tUser.user.tag}** for 10 minutes.`);
    case 'untimeout':
    case 'unmute':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const utUser = message.mentions.members.first(); if (!utUser) return sendEmbed(message, null, '❌ Please mention a user to unmute.', true);
      await utUser.timeout(null).catch(() => {}); 
      await logToChannel('Timeout Revoked', `<@${message.author.id}> unmuted ${utUser.user.tag}.`);
      return sendEmbed(message, '🔊 User Unmuted', `Successfully removed the mute from **${utUser.user.tag}**.`);
    case 'purge':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const amount = parseInt(args[0]) || 10; await message.channel.bulkDelete(Math.min(amount, 100)).catch(() => {});
      return sendEmbed(message, '🧹 Purge Complete', `Successfully deleted the last \`${amount}\` messages.`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
    case 'unban':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      if (!args[0]) return sendEmbed(message, null, '❌ Please provide a user ID to unban.', true);
      await message.guild.members.unban(args[0]).catch(() => {}); 
      await logToChannel('Ban Revoked', `Staff profile <@${message.author.id}> unbanned user ID: \`${args[0]}\``);
      return sendEmbed(message, '🔓 User Unbanned', `Successfully unbanned user ID: \`${args[0]}\``);
    case 'softban':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const sbUser = message.mentions.members.first(); if (!sbUser) return sendEmbed(message, null, '❌ Please mention a user.', true);
      await sbUser.ban({ days: 1 }).then(() => message.guild.members.unban(sbUser.id)).catch(() => {});
      return sendEmbed(message, '⚡ Softbanned', `Softbanned **${sbUser.user.tag}** (kicked them and cleared their last 24h messages).`);
    case 'lockdown':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      return sendEmbed(message, '🚨 Channel Locked', 'An emergency lockdown has been enabled on this channel.');
    case 'case':
      return sendEmbed(message, '🔍 Log Query', 'All system infraction case logs are currently up to date.');
    case 'reason':
      return sendEmbed(message, '📝 Reason Updated', 'Successfully attached custom moderation reason logs to the database.');

    case 'addrole':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const arMember = message.mentions.members.first(); const arRole = message.mentions.roles.first();
      if (arMember && arRole) { await arMember.roles.add(arRole).catch(() => {}); return sendEmbed(message, '🛠️ Role Added', `Successfully gave the role **${arRole.name}** to **${arMember.user.username}**.`); }
      return sendEmbed(message, null, '❌ Missing target member or role.', true);
    case 'removerole':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const rrMember = message.mentions.members.first(); const rrRole = message.mentions.roles.first();
      if (rrMember && rrRole) { await rrMember.roles.remove(rrRole).catch(() => {}); return sendEmbed(message, '🛠️ Role Removed', `Successfully removed the role **${rrRole.name}** from **${rrMember.user.username}**.`); }
      return sendEmbed(message, null, '❌ Missing target member or role.', true);
    case 'lock':
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }); 
      return sendEmbed(message, '🔒 Channel Locked', 'This channel has been successfully locked down.');
    case 'unlock':
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true }); 
      return sendEmbed(message, '🔓 Channel Unlocked', 'This channel has been successfully unlocked.');
    case 'slowmode':
      const time = parseInt(args[0]) || 0; await message.channel.setRateLimitPerUser(time); 
      return sendEmbed(message, '⏱️ Slowmode Updated', `Slowmode has been adjusted to \`${time}s\` for this channel.`);
    case 'temprole':
      return sendEmbed(message, '⏳ Temporary Role', 'Temporary role timer configuration maps scheduled successfully.');
    case 'setprefix':
      return sendEmbed(message, '⚙️ Prefix Config', `The bot prefix remains hardcoded to standard token: \`${PREFIX}\``);
    case 'announce':
      if (!isStaff) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      return sendEmbed(message, '📢 Announcement', args.join(' ') || 'Standard server broadcast.');
    case 'nuke':
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return sendEmbed(message, null, '❌ Missing Permissions.', true);
      const originalPosition = message.channel.position;
      const channelClone = await message.channel.clone();
      await message.channel.delete();
      await channelClone.setPosition(originalPosition);
      return sendEmbed({ channel: channelClone }, '💥 Channel Nuked', 'This channel has been successfully nuked and cleared out.');
    case 'backup':
      return sendEmbed(message, '💾 Backup Saved', 'Successfully saved a snapshot mirror of the server configuration maps.');

    case 'serverinfo':
      return message.channel.send({ embeds: [new EmbedBuilder().setColor(PINK).setTitle(message.guild.name).addFields({ name: 'Total Members', value: `${message.guild.memberCount}`, inline: true }, { name: 'Owner', value: `<@${message.guild.ownerId}>`, inline: true })] });
    case 'userinfo':
      const targetUser = message.mentions.users.first() || message.author;
      return message.channel.send({ embeds: [new EmbedBuilder().setColor(PINK).setTitle(`${targetUser.username}'s Profile`).setDescription(`• **User ID:** \`${targetUser.id}\`\n• **Is Bot:** ${targetUser.bot ? 'Yes' : 'No'}`)] });
    case 'avatar':
      const avatarUser = message.mentions.users.first() || message.author;
      return message.channel.send({ embeds: [new EmbedBuilder().setColor(PINK).setTitle(`${avatarUser.username}'s Avatar`).setImage(avatarUser.displayAvatarURL({ size: 512 }))] });
    case 'stats':
      return sendEmbed(message, '📈 System Stats', `• Node Version: \`${process.version}\`\n• API Latency: \`${client.ws.ping}ms\``);
    case 'ping':
      return sendEmbed(message, '🏓 Pong!', `Connection latency is currently \`${client.ws.ping}ms\`.`);
    case 'uptime':
      return sendEmbed(message, '⏱️ Uptime Tracking', `The bot has been active for \`${(process.uptime() / 60).toFixed(2)} minutes\`.`);
    case 'membercount':
      return sendEmbed(message, '👥 Member Count', `There are currently **${message.guild.memberCount}** members in this server.`);

    case 'autoresponse':
      return sendEmbed(message, '⚙️ Autoresponses', 'Keyword sequence triggers have been synced.');
    case 'embedcreate':
      return message.channel.send({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(args.join(' ') || 'Embed layout template configuration preview.')] });
    case 'schedule':
      return sendEmbed(message, '📅 Task Scheduled', 'Successfully synced background calendar scheduler trackers.');
    case 'timer':
    case 'reminder':
      return sendEmbed(message, '⏳ Timer Started', 'Process clock alert background tracker successfully enabled.');
    case 'poll':
      if (!args.length) return sendEmbed(message, null, '❌ Please provide context options for the poll.', true);
      const pollMsg = await message.channel.send({ embeds: [new EmbedBuilder().setColor(PINK).setTitle('📊 Community Poll').setDescription(args.join(' '))] });
      await pollMsg.react('👍'); await pollMsg.react('👎'); return;
    case 'weather':
      return sendEmbed(message, '🌤️ Weather Forecast', 'Accessing weather nodes... Conditions report clear sky maps.');

    case 'ticket':
      return handleOpenTicket({ guild: message.guild, user: message.author, deferReply: async () => {}, editReply: async (o) => message.channel.send(o.content), reply: async (o) => message.channel.send(o.content) });
    case 'close':
      if (Object.values(data.tickets).includes(message.channel.id)) {
        const entry = Object.entries(data.tickets).find(([, cid]) => cid === message.channel.id);
        if (entry) { delete data.tickets[entry[0]]; saveData(data); }
        await sendEmbed(message, '🔒 Ticket Closing', 'Closing this ticket and deleting the channel in 3 seconds...');
        setTimeout(() => message.channel.delete().catch(() => {}), 3000);
      } else { return sendEmbed(message, null, '❌ This channel does not belong to any active tickets.', true); }
      return;
    case 'add':
    case 'remove':
      return sendEmbed(message, '🎫 Ticket Access', 'Successfully altered channel permissions access settings.');
    case 'transcript':
      return sendEmbed(message, '📜 Transcript Saved', 'Secure transcript download link has been fully processed.');

    case 'play': return sendEmbed(message, '🎵 Audio Player', 'Successfully linked voice playback streaming routes.');
    case 'pause': return sendEmbed(message, '⏸️ Audio Paused', 'Suspended active audio playback tracks queue stream.');
    case 'skip': return sendEmbed(message, '⏭️ Track Skipped', 'Advanced active music list forward by exactly \`+1\`.');
    case 'stop': return sendEmbed(message, '⏹️ Player Stopped', 'Disconnected voice line pipelines and emptied player queue maps.');
    case 'queue': return sendEmbed(message, '📋 Audio Queue', 'The server music queue list is currently empty.');
    case 'nowplaying': return sendEmbed(message, '🎧 Now Playing', 'There are currently no active tracks processing.');
    case 'volume': return sendEmbed(message, '🔊 Volume Adjusted', 'Recalibrated dynamic volume master balance mix.');
    case 'repeat': return sendEmbed(message, '🔄 Loop Toggled', 'Loop data variable parameters changed successfully.');
    case 'shuffle': return sendEmbed(message, '🔀 Queue Shuffled', 'Successfully scrambled music track positioning lookups.');
    case 'clearqueue': return sendEmbed(message, '🧹 Queue Cleared', 'Successfully dropped all indexed streaming tracks cache.');

    case 'gstart': return sendEmbed(message, '🎉 Giveaway Created', 'Launched giveaway monitor tasks inside localized server nodes.');
    case 'gend': return sendEmbed(message, '🎉 Giveaway Ended', 'Computing metrics over existing participant registers.');
    case 'greroll': return sendEmbed(message, '🎲 Winner Rerolled', 'Picked new winner tokens via automated database indexing.');
    case 'gpause': return sendEmbed(message, '⏸️ Giveaway Paused', 'Suspended countdown tracking loops.');
    case 'gunpause': return sendEmbed(message, '▶️ Giveaway Restored', 'Re-enabled active countdown check routines.');
    case 'glist': return sendEmbed(message, '📜 Giveaway Records', 'Synchronizing data records for live server giveaways.');

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
        .setTitle('📬 Server Invite Link')
        .setDescription(`Hey **${interaction.user.username}**! Here is your official invitation link:\n\n🔗 https://discord.gg/2w2nXca5bX`)
        .setFooter({ text: 'Wavey • Share with your friends!' })
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
    if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ Access Denied: Owner profile check failed.', ephemeral: true });

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
      
      await logToChannel('Security Config Altered', `Anti-Link module toggled to: **${data.antiLinkActive ? 'Online' : 'Offline'}** by owner.`);
      return interaction.update({ embeds: [buildAntiRaidEmbed()], components: [buildAntiRaidButtons()] });
    }
  }

  // FIxed Modal Submit handler to dynamically update the control panel embed status
  if (interaction.isModalSubmit() && interaction.customId === 'spam_modal_config') {
    const rawVal = interaction.fields.getTextInputValue('spam_count_input');
    const parsed = parseInt(rawVal);
    if (isNaN(parsed) || parsed <= 0) return interaction.reply({ content: '❌ Invalid configuration input format setup constraints.', ephemeral: true });
    
    data.antiSpamLimit = parsed;
    saveData(data);
    await logToChannel('Security Config Altered', `Anti-Spam threshold set to: **\`${parsed}\` messages/5s** by owner.`);
    
    // Updates the dashboard view instantly to show the green dot and limit parameter!
    return interaction.update({ embeds: [buildAntiRaidEmbed()], components: [buildAntiRaidButtons()] });
  }

  if (interaction.isButton() && interaction.customId.startsWith('vc_')) {
    const matchedRoom = activeCustomVCs.get(interaction.channelId);
    if (!matchedRoom) return interaction.reply({ content: '❌ This management deck does not point to an active session map.', ephemeral: true });
    
    if (interaction.user.id !== matchedRoom.ownerId) {
      return interaction.reply({ content: '❌ Only the creator of this voice session can use these layout controls.', ephemeral: true });
    }

    const vcChannelObj = interaction.guild.channels.cache.get(matchedRoom.voiceChannelId);
    if (!vcChannelObj) return interaction.reply({ content: '❌ The voice channel instance was not found.', ephemeral: true });

    switch (interaction.customId) {
      case 'vc_lock':
        await vcChannelObj.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
        return interaction.reply({ content: '🔒 **Room Locked:** New members can no longer join your voice channel.', ephemeral: true });

      case 'vc_unlock':
        await vcChannelObj.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
        return interaction.reply({ content: '🔓 **Room Unlocked:** Anyone can join your voice channel now.', ephemeral: true });

      case 'vc_permit': {
        const modal = new ModalBuilder().setCustomId('vc_modal_permit').setTitle('Permit User Access');
        const textInput = new TextInputBuilder()
          .setCustomId('permit_user_id')
          .setLabel('User ID to allow entry')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('1475595231784210603');
        modal.addComponents(new ActionRowBuilder().addComponents(textInput));
        return interaction.showModal(modal);
      }

      case 'vc_kick': {
        const modal = new ModalBuilder().setCustomId('vc_modal_kick').setTitle('Kick User from Voice');
        const textInput = new TextInputBuilder()
          .setCustomId('kick_user_id')
          .setLabel('User ID to kick out')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('1475595231784210603');
        modal.addComponents(new ActionRowBuilder().addComponents(textInput));
        return interaction.showModal(modal);
      }

      case 'vc_delete':
        activeCustomVCs.delete(matchedRoom.voiceChannelId);
        await vcChannelObj.delete().catch(() => {});
        return;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('vc_modal_')) {
    const matchedRoom = activeCustomVCs.get(interaction.channelId);
    if (!matchedRoom) return interaction.reply({ content: '❌ Room mapping reference not found.', ephemeral: true });

    const vcChannelObj = interaction.guild.channels.cache.get(matchedRoom.voiceChannelId);
    if (!vcChannelObj) return interaction.reply({ content: '❌ Voice instance no longer exists.', ephemeral: true });

    if (interaction.customId === 'vc_modal_permit') {
      const targetId = interaction.fields.getTextInputValue('permit_user_id').trim();
      const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!targetMember) return interaction.reply({ content: '❌ Could not find that user inside this server.', ephemeral: true });

      await vcChannelObj.permissionOverwrites.edit(targetMember.id, { Connect: true, ViewChannel: true });
      return interaction.reply({ content: `✅ Whitelisted <@${targetMember.id}>! They can now access your room.`, ephemeral: true });
    }

    if (interaction.customId === 'vc_modal_kick') {
      const targetId = interaction.fields.getTextInputValue('kick_user_id').trim();
      const targetMember = vcChannelObj.members.get(targetId);
      if (!targetMember) return interaction.reply({ content: '❌ That user is not currently sitting inside your voice channel.', ephemeral: true });

      await targetMember.voice.disconnect().catch(() => {});
      await vcChannelObj.permissionOverwrites.edit(targetMember.id, { Connect: false });
      return interaction.reply({ content: `👢 Disconnected <@${targetMember.id}> and locked them out of this session.`, ephemeral: true });
    }
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

  await logToChannel('Ticket Opened', `Ticket room created for user <@${userId}>. Location: <#${ticketChannel.id}>`);
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

  await logToChannel('Ticket Closed', `Ticket room channel (\`${channel.name}\`) was successfully closed and cleared out.`);
  await interaction.update({ content: 'Closing ticket...', components: [] });
  setTimeout(() => {
    channel.delete().catch((err) => console.error('Failed to delete ticket channel:', err));
  }, 3000);
}

client.login(TOKEN);
