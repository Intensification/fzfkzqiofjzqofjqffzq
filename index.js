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
} = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const TICKET_CHANNEL_ID = process.env.TICKET_CHANNEL_ID;
const AUTOROLE_ID = process.env.AUTOROLE_ID;
const MOD_ROLE_ID = process.env.MOD_ROLE_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null;

const PINK = 0xff4fa3;
const DATA_PATH = path.join(__dirname, 'data.json');

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    return { panelSent: false, panelMessageId: null, panelChannelId: null, tickets: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return { panelSent: false, panelMessageId: null, panelChannelId: null, tickets: {} };
  }
}

function saveData(d) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(d, null, 2));
}

let data = loadData();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

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

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(PINK)
    .setAuthor({ name: 'Wavey', iconURL: client.user.displayAvatarURL() })
    .setTitle('🌊 Help Menu')
    .setDescription("Here's everything Wavey can do, sorted into categories.")
    .addFields(
      { name: '🎵 Music', value: 'Playback, queue & audio controls.', inline: true },
      { name: '🎉 Giveaway', value: 'Create and manage giveaways.', inline: true },
      { name: '📊 Statistics', value: 'Server & member stats tracking.', inline: true },
      { name: '⚙️ Automation', value: 'Auto-responses & scheduled actions.', inline: true },
      { name: '🛠️ Server Management', value: 'Roles, channels & configuration.', inline: true },
      { name: '🔨 Moderation', value: 'Warnings, kicks, bans & logs.', inline: true },
      { name: '🎫 Ticket System', value: 'Support tickets & staff tools.', inline: true }
    )
    .setFooter({ text: 'Wavey • /help anytime' })
    .setTimestamp();
}

client.once(Events.ClientReady, async () => {
  console.log(`Wavey is online as ${client.user.tag}`);
  await registerCommands();
  await ensureTicketPanel();
});

async function registerCommands() {
  try {
    await client.application.commands.set([
      { name: 'help', description: 'shows help menu of bot commands' },
    ]);
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
}

async function ensureTicketPanel() {
  if (!TICKET_CHANNEL_ID) {
    console.warn('TICKET_CHANNEL_ID not set, skipping panel send.');
    return;
  }

  const channel = await client.channels.fetch(TICKET_CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.warn('Could not fetch TICKET_CHANNEL_ID, check the id.');
    return;
  }

  if (data.panelSent && data.panelChannelId === TICKET_CHANNEL_ID && data.panelMessageId) {
    const existing = await channel.messages.fetch(data.panelMessageId).catch(() => null);
    if (existing) {
      console.log('Ticket panel already exists, skipping resend.');
      return;
    }
  }

  const msg = await channel.send({ embeds: [buildPanelEmbed()], components: [buildPanelRow()] });
  data.panelSent = true;
  data.panelMessageId = msg.id;
  data.panelChannelId = TICKET_CHANNEL_ID;
  saveData(data);
  console.log('Ticket panel sent.');
}

client.on(Events.GuildMemberAdd, async (member) => {
  if (!AUTOROLE_ID) return;
  try {
    await member.roles.add(AUTOROLE_ID);
  } catch (err) {
    console.error(`Couldn't autorole ${member.user.tag}:`, err.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'help') {
      return interaction.reply({ embeds: [buildHelpEmbed()] });
    }
    return;
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

  await interaction.deferReply({ ephemeral: true });

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
    return interaction.editReply({ content: "Something went wrong creating your ticket — ping a mod." });
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

  await interaction.editReply({ content: `Ticket created: <#${ticketChannel.id}>` });
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

  await interaction.update({ content: 'Closing ticket...', components: [] });
  setTimeout(() => {
    channel.delete().catch((err) => console.error('Failed to delete ticket channel:', err));
  }, 3000);
}

client.login(TOKEN);
