const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    guildId: String,
    channelId: String,
    channelName: String,
    ownerId: String,
    ownerUsername: String,
    claimerId: { type: String, default: null },
    reasonId: String,
    userReason: String, 
    closed: { type: Boolean, default: false },
    transcript: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ticket', ticketSchema);