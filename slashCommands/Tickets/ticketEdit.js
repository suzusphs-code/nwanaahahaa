const GuildConfig = require("../../models/GuildConfig");

module.exports = {
    name: "ticketedit",
    description: "Edit an existing ticket reason",
    userPerms: ["ADMINISTRATOR"],
    options: [
        {
            name: "reason",
            description: "Ticket reason ID",
            type: 3,
            required: true
        },
        {
            name: "field",
            description: "What to edit",
            type: 3,
            required: true,
            choices: [
                { name: "Label", value: "label" },
                { name: "Description", value: "description" },
                { name: "Question", value: "question" },
                { name: "Add Staff Role", value: "addstaff" },
                { name: "Remove Staff Role", value: "removestaff" },
                { name: "Open Category", value: "opencategory" },
                { name: "Close Category", value: "closecategory" },
                { name: "Transcript Channel", value: "transcript" },
                { name: "Panel Channel", value: "panel" }
            ]
        },
        {
            name: "value",
            description: "New value (text)",
            type: 3,
            required: false
        },
        {
            name: "role",
            description: "Staff role (for add/remove)",
            type: 8,
            required: false
        },
        {
            name: "channel",
            description: "Category / Channel",
            type: 7,
            required: false
        }
    ],

    run: async (client, interaction) => {
        const reasonId = interaction.options.getString("reason");
        const field = interaction.options.getString("field");
        const textValue = interaction.options.getString("value");
        const role = interaction.options.getRole("role");
        const channel = interaction.options.getChannel("channel");

        const guildConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });

        if (!guildConfig || !guildConfig.reasons) {
            return interaction.reply({
                content: "❌ No ticket configuration found for this server.",
                ephemeral: true
            });
        }

        const reasonIndex = guildConfig.reasons.findIndex(r => r.id === reasonId);
        if (reasonIndex === -1) {
            return interaction.reply({
                content: `❌ Ticket reason ID \`${reasonId}\` not found.`,
                ephemeral: true
            });
        }

        const reason = guildConfig.reasons[reasonIndex];
        let updated = false;

        try {
            switch (field) {
                case "label":
                    if (!textValue) return fail("Please provide a text value.");
                    reason.label = textValue;
                    updated = true;
                    break;

                case "description":
                    if (!textValue) return fail("Please provide a text value.");
                    reason.description = textValue;
                    updated = true;
                    break;
                
                case "question":
                    if (!textValue) return fail("Please provide a text value.");
                    reason.question = textValue;
                    updated = true;
                    break;

                case "addstaff":
                    if (!role) return fail("Please provide a role.");
                    if (!reason.staffRoles.includes(role.id)) {
                        reason.staffRoles.push(role.id);
                        updated = true;
                    }
                    break;

                case "removestaff":
                    if (!role) return fail("Please provide a role.");
                    reason.staffRoles = reason.staffRoles.filter(r => r !== role.id);
                    updated = true;
                    break;

                case "opencategory":
                    if (!channel) return fail("Please provide a category.");
                    reason.openCategory = channel.id;
                    updated = true;
                    break;

                case "closecategory":
                    if (!channel) return fail("Please provide a category.");
                    reason.closeCategory = channel.id;
                    updated = true;
                    break;

                case "transcript":
                    if (!channel) return fail("Please provide a channel.");
                    reason.transcriptChannel = channel.id;
                    updated = true;
                    break;

                case "panel":
                    if (!channel) return fail("Please provide a channel.");
                    reason.panelChannel = channel.id;
                    guildConfig.panelChannel = channel.id;
                    updated = true;
                    break;
            }

            if (updated) {
                guildConfig.reasons[reasonIndex] = reason;
                guildConfig.markModified('reasons');
                await guildConfig.save();

                return interaction.reply({
                    content: `✅ Ticket reason **${reasonId}** updated successfully in Database.`,
                    ephemeral: true
                });
            } else {
                return interaction.reply({ content: "❌ No changes made.", ephemeral: true });
            }

        } catch (err) {
            console.error(err);
            return interaction.reply({ content: "❌ An error occurred while saving to the database.", ephemeral: true });
        }

        function fail(msg) {
            interaction.reply({ content: `❌ ${msg}`, ephemeral: true });
        }
    }
};