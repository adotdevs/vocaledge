const mongoose = require('mongoose');
const connectCRMDatabase = require('../../config/crmDatabase');

const callSchema = new mongoose.Schema({
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        required: true,
        index: true
    },
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    phoneNumber: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['scheduled', 'ringing', 'in-progress', 'completed', 'failed', 'no-answer', 'cancelled'],
        default: 'scheduled',
        index: true
    },
    callType: {
        type: String,
        enum: ['manual', 'automatic', 'scheduled'],
        default: 'manual'
    },
    duration: {
        type: Number, // seconds
        default: 0
    },
    startedAt: {
        type: Date
    },
    endedAt: {
        type: Date
    },
    scheduledAt: {
        type: Date // for scheduled calls
    },
    summary: {
        type: String // GPT-generated call summary
    },
    transcript: {
        type: String // full conversation transcript
    },
    summaryFileUrl: {
        type: String // path to summary JSON/TXT
    },
    metadata: {
        turns: Number,
        context: mongoose.Schema.Types.Mixed,
        sentiment: String,
        keyPoints: [String],
        nextAction: String,
        sipStatus: {
            code: mongoose.Schema.Types.Mixed, // Can be Number (100, 180, 183, 200) or String ('BYE')
            message: String, // "Session Progress", "OK", "BYE"
            receivedAt: Date
        },
        sipEvents: [{
            code: mongoose.Schema.Types.Mixed, // Can be Number (100, 180, 183, 200) or String ('BYE')
            message: String,
            timestamp: Date,
            type: String // 'trying', 'progress', 'ringing', 'answered', 'bye', 'cancel'
        }]
    },
    activeCallTime: {
        type: Number, // seconds - time from answered to ended
        default: 0
    },
    ringingTime: {
        type: Number, // seconds - time from start to answered
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update updatedAt on save
callSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Create indexes for better performance
callSchema.index({ leadId: 1, createdAt: -1 }); // For fetching calls by lead
callSchema.index({ status: 1, scheduledAt: 1 }); // For scheduled calls cron
callSchema.index({ sessionId: 1 }); // For quick lookup by session

const getCallModel = async () => {
    const crmDB = await connectCRMDatabase();
    return crmDB.model('Call', callSchema);
};

module.exports = getCallModel;
module.exports.getCallModel = getCallModel;

