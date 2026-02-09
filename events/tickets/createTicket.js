const {
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  Modal,
  TextInputComponent
} = require("discord.js");
const Ticket = require("../../models/Ticket");
const GuildConfig = require("../../models/GuildConfig");

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    if (!interaction.guild) return;

    if (interaction.isSelectMenu() && interaction.customId === "ticket_dropdown") {
      const selectedId = interaction.values[0];
      
      const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
      if (!guildConfig)
        return interaction.reply({ content: "❌ Guild is not configured.", ephemeral: true });

      const reason = guildConfig.reasons.find(r => r.id === selectedId);
      if (!reason)
        return interaction.reply({ content: "❌ Invalid ticket reason.", ephemeral: true });

      const existing = await Ticket.findOne({ guildId: interaction.guild.id, ownerId: interaction.user.id, closed: false });
      
      if (existing) {
          const channelExists = interaction.guild.channels.cache.get(existing.channelId);
          if (!channelExists) {
              existing.closed = true;
              await existing.save();
          } else {
              return interaction.reply({
                content: `❌ You already have an open ticket: <#${existing.channelId}>`,
                ephemeral: true
              });
          }
      }

      const modal = new Modal()
        .setCustomId(`ticket_modal_${selectedId}`)
        .setTitle("Create Ticket");

      const input = new TextInputComponent()
        .setCustomId("ticket_reason_input")
        .setLabel(reason.question || "Describe your issue") 
        .setStyle("PARAGRAPH")
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(1000);

      modal.addComponents(
        new MessageActionRow().addComponents(input)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket_modal_")) {
      const reasonId = interaction.customId.replace("ticket_modal_", "");
      const userReason = interaction.fields.getTextInputValue("ticket_reason_input");

      const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
      const reason = guildConfig?.reasons.find(r => r.id === reasonId);

      if (!reason)
        return interaction.reply({ content: "❌ Invalid ticket config.", ephemeral: true });

      const channel = await interaction.guild.channels.create(
        `ticket-${interaction.user.username}`.toLowerCase(),
        {
          type: "GUILD_TEXT",
          parent: reason.openCategory,
          topic: interaction.user.id,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: ["VIEW_CHANNEL"] },
            {
              id: interaction.user.id,
              allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "ATTACH_FILES"]
            },
            ...reason.staffRoles.map(r => ({
              id: r,
              allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "MANAGE_MESSAGES"]
            }))
          ]
        }
      );

      const newTicket = new Ticket({
        guildId: interaction.guild.id,
        channelId: channel.id,
        channelName: channel.name,
        ownerId: interaction.user.id,
        ownerUsername: interaction.user.username,
        reasonId,
        userReason,
        closed: false,
        transcript: [] 
      });
      await newTicket.save();

      const row = new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId("ticket-claim")
          .setLabel("Claim Ticket")
          .setStyle("PRIMARY"),
        new MessageButton()
          .setCustomId("ticket-close")
          .setLabel("Close Ticket")
          .setStyle("DANGER")
          .setDisabled(true)
      );

      const embed = new MessageEmbed()
        .setTitle(`🎫 ${reason.label}`)
        .addField("User", `<@${interaction.user.id}>`, true)
        .addField("Issue", userReason)
        .setColor(client.config.embedColor)
        .setTimestamp();

      await channel.send({
        content: reason.staffRoles.map(r => `<@&${r}>`).join(" "),
        embeds: [embed],
        components: [row]
      });

      return interaction.reply({
        content: `✅ Ticket created: ${channel}`,
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId === "ticket-claim") {
      const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

      if (!ticket || ticket.claimerId)
        return interaction.reply({ content: "❌ Ticket already claimed.", ephemeral: true });

      const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
      const reason = config.reasons.find(r => r.id === ticket.reasonId);

      const hasStaffRole = interaction.member.roles.cache.some(role =>
        reason.staffRoles.includes(role.id)
      );

      if (!hasStaffRole)
        return interaction.reply({
          content: "❌ Only staff members can claim this ticket.",
          ephemeral: true
        });

      ticket.claimerId = interaction.user.id;
      await ticket.save();

      const row = new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId("ticket-claimed")
          .setLabel(`Claimed by ${interaction.user.username}`)
          .setStyle("SECONDARY")
          .setDisabled(true),
        new MessageButton()
          .setCustomId("ticket-close")
          .setLabel("Close Ticket")
          .setStyle("DANGER")
      );

      await interaction.message.edit({ components: [row] });
      await interaction.channel.send(`✅ Claimed by <@${interaction.user.id}>`);
      return interaction.deferUpdate();
    }

    if (interaction.isButton() && interaction.customId === "ticket-close") {
      const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

      if (!ticket) return interaction.reply({ content: "Ticket not found in DB.", ephemeral: true });

      const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
      const reason = config.reasons.find(r => r.id === ticket.reasonId);

      if(reason.closeCategory) await interaction.channel.setParent(reason.closeCategory).catch(() => {});
      
      await interaction.channel.permissionOverwrites.edit(ticket.ownerId, {
        VIEW_CHANNEL: false
      });

      const row = new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId("ticket-delete")
          .setLabel("Delete Ticket")
          .setStyle("DANGER")
      );

      await interaction.channel.send({
        embeds: [
          new MessageEmbed()
            .setTitle("🔒 Ticket Closed")
            .setDescription(`Closed by <@${interaction.user.id}>. Click delete to save transcript to DB and remove channel.`)
            .setColor("RED")
        ],
        components: [row]
      });

      return interaction.deferUpdate();
    }

    if (interaction.isButton() && interaction.customId === "ticket-delete") {
      const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
      if (!ticket) return interaction.reply({ content: "Ticket DB entry not found.", ephemeral: true });

      const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
      const reason = config.reasons.find(r => r.id === ticket.reasonId);

      await interaction.reply({ content: "📑 Saving transcript to Database...", ephemeral: true });

      let allMessages = [];
      let lastId;

      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const messages = await interaction.channel.messages.fetch(options);
        allMessages.push(...messages.values());
        lastId = messages.last()?.id;

        if (messages.size !== 100) break;
      }

      const transcriptData = allMessages.reverse().map(m => ({
          authorId: m.author.id,
          authorTag: m.author.tag,
          content: m.content,
          timestamp: m.createdAt,
          attachments: m.attachments.map(a => a.url),
          embeds: m.embeds.length > 0
      }));

      ticket.transcript = transcriptData;
      ticket.closed = true;
      await ticket.save();

      const transcriptChannel = interaction.guild.channels.cache.get(reason.transcriptChannel);
      if (transcriptChannel) {
        transcriptChannel.send({
          embeds: [
            new MessageEmbed()
              .setTitle("📄 Ticket Deleted & Saved")
              .addField("Ticket", ticket.channelName || interaction.channel.name, true)
              .addField("Owner", `<@${ticket.ownerId}>`, true)
              .addField("Closed By", `<@${interaction.user.id}>`, true)
              .setDescription("Transcript saved to Database. Check Dashboard.")
              .setColor(client.config.embedColor)
          ]
        });
      }

      setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
    }
  }
};