const mongoose = require("mongoose");

const UserRestrictions = new mongoose.Schema({
    withdrawal2Fa: {
        type: Boolean,
        default: false

    },
    requireEmailVerification: {
        type: Boolean,
        default: true
    },
    walletEnabled: {
        type: Boolean,
        default: true
    },
    autoAssignNewLeads: {
        type: Boolean,
        default: true
    },
    automationSkip: {
        fileNames: { type: [String], default: [] },
        countries: { type: [String], default: [] },
        brands: { type: [String], default: [] },
        sources: { type: [String], default: [] },
    },
    automationAllow: {
        fileNames: { type: [String], default: [] },
        countries: { type: [String], default: [] },
        brands: { type: [String], default: [] },
        sources: { type: [String], default: [] },
    },
}, { timestamps: true });

let UserRestriction = mongoose.model("UserRestriction", UserRestrictions);

module.exports = UserRestriction;
