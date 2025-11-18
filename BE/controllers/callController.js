// controllers/callController.js
const getLeadModel = require('../crmDB/models/leadsModel');
const getCallModel = require('../crmDB/models/callModel');
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const ErrorHandler = require('../utils/errorHandler');
const { logActivity } = require('./activityController');

/**
 * Initiate a call for a lead (manual)
 */
exports.initiateCall = catchAsyncErrors(async (req, res, next) => {
    try {
        const { leadId, phoneNumber } = req.body;

        if (!leadId || !phoneNumber) {
            return next(new ErrorHandler('Lead ID and phone number are required', 400));
        }

        // Get models
        const Lead = await getLeadModel();
        const Call = await getCallModel();

        // Verify lead exists
        const lead = await Lead.findById(leadId);
        if (!lead) {
            return next(new ErrorHandler('Lead not found', 404));
        }

        // Create call record
        const sessionId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const call = new Call({
            leadId: leadId,
            sessionId: sessionId,
            phoneNumber: phoneNumber,
            status: 'ringing',
            callType: 'manual',
            startedAt: new Date()
        });
        await call.save();

        // Emit Socket.io event for real-time status
        if (global.io) {
            global.io.emit('call:status:update', {
                callId: call._id,
                sessionId: sessionId,
                leadId: leadId,
                phoneNumber: phoneNumber,
                status: 'ringing',
                startedAt: call.startedAt
            });
        }

        // Initiate call using VoIP agent
        if (global.voipAgent) {
            // Prepare lead information for the bot
            const leadInfo = {
                firstName: lead.firstName || null,
                lastName: lead.lastName || null,
                email: lead.email || null,
                phone: lead.phone || null,
                country: lead.country || null,
                brand: lead.Brand || null,
                address: lead.Address || null,
                status: lead.status || null
            };
            
            // Store leadId, callId, and leadInfo in session metadata
            const callSession = await global.voipAgent.makeCall(phoneNumber, 'shimmer', null, { 
                leadId: leadId,
                callId: call._id.toString(), // Pass MongoDB call ID as callId
                leadInfo: leadInfo // Pass lead information for personalized conversation
            });
            
            // Update call with session info
            call.sessionId = callSession.id || sessionId;
            await call.save();

            // Update call status to in-progress when call starts
            setTimeout(async () => {
                const updatedCall = await Call.findById(call._id);
                if (updatedCall && updatedCall.status === 'ringing') {
                    updatedCall.status = 'in-progress';
                    await updatedCall.save();
                    
                    if (global.io) {
                        global.io.emit('call:status:update', {
                            callId: call._id,
                            sessionId: call.sessionId,
                            leadId: leadId,
                            status: 'in-progress'
                        });
                    }
                }
            }, 2000);
        } else {
            return next(new ErrorHandler('VoIP agent not initialized', 500));
        }

        res.status(200).json({
            success: true,
            call: {
                id: call._id,
                sessionId: call.sessionId,
                leadId: leadId,
                phoneNumber: phoneNumber,
                status: call.status
            }
        });

    } catch (error) {
        console.error('Error initiating call:', error);
        return next(new ErrorHandler(error.message || 'Failed to initiate call', 500));
    }
});

// Global call queue for sequential calling
let callQueue = [];
let isProcessingQueue = false;
let currentCall = null;

/**
 * Process call queue sequentially (one by one)
 */
async function processCallQueue() {
    if (isProcessingQueue || callQueue.length === 0) {
        return;
    }

    isProcessingQueue = true;
    const Call = await getCallModel();

    while (callQueue.length > 0) {
        const queueItem = callQueue.shift();
        const { callId, leadId, phoneNumber, delay = 5000 } = queueItem;

        try {
            // Wait for delay before next call
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            // Check if there's an active call
            const activeCall = await Call.findOne({
                status: { $in: ['ringing', 'in-progress'] }
            });

            if (activeCall) {
                // Wait for active call to finish
                await waitForCallToFinish(activeCall.sessionId);
            }

            // Get call record
            const call = await Call.findById(callId);
            if (!call || call.status !== 'scheduled') {
                continue;
            }

            currentCall = call;

            // Update status to ringing
            call.status = 'ringing';
            call.startedAt = new Date();
            await call.save();

            // Emit status update
            if (global.io) {
                global.io.emit('call:status:update', {
                    callId: call._id,
                    sessionId: call.sessionId,
                    leadId: leadId,
                    status: 'ringing',
                    phoneNumber: phoneNumber
                });

                global.io.emit('bulk:call:progress', {
                    total: queueItem.total,
                    completed: queueItem.completed,
                    current: {
                        callId: call._id,
                        leadId: leadId,
                        phoneNumber: phoneNumber,
                        status: 'ringing'
                    }
                });
            }

            // Initiate call
            if (global.voipAgent) {
                // Fetch lead information for personalized conversation
                const Lead = await getLeadModel();
                const lead = await Lead.findById(leadId);
                
                const leadInfo = lead ? {
                    firstName: lead.firstName || null,
                    lastName: lead.lastName || null,
                    email: lead.email || null,
                    phone: lead.phone || null,
                    country: lead.country || null,
                    brand: lead.Brand || null,
                    address: lead.Address || null,
                    status: lead.status || null
                } : {};
                
                const callSession = await global.voipAgent.makeCall(phoneNumber, 'shimmer', null, { 
                    leadId: leadId,
                    callId: call._id.toString(),
                    sessionId: call.sessionId, // Pass the CRM sessionId so VoIP agent can use it
                    leadInfo: leadInfo // Pass lead information for personalized conversation
                });
                
                // Update call with VoIP session ID if different
                if (callSession && callSession.id && callSession.id !== call.sessionId) {
                    call.sessionId = callSession.id;
                    await call.save();
                }

                // Wait for call to complete (max 5 minutes)
                await waitForCallToFinish(call.sessionId, 300000);

                // Update completed count
                queueItem.completed++;
            }

        } catch (error) {
            console.error(`Error processing call ${callId}:`, error);
            const call = await Call.findById(callId);
            if (call) {
                call.status = 'failed';
                call.endedAt = new Date();
                await call.save();
            }
        }

        currentCall = null;
    }

    isProcessingQueue = false;

    // Emit completion
    if (global.io) {
        global.io.emit('bulk:call:complete', {
            message: 'All calls in queue completed'
        });
    }
}

/**
 * Wait for call to finish
 */
async function waitForCallToFinish(sessionId, maxWait = 300000) {
    const Call = await getCallModel();
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
        const call = await Call.findOne({ sessionId: sessionId });
        
        if (!call || call.status === 'completed' || call.status === 'failed' || call.status === 'no-answer' || call.status === 'cancelled') {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
    }
}

/**
 * Bulk call leads (automatic) - Sequential one-by-one calling
 */
exports.bulkCallLeads = catchAsyncErrors(async (req, res, next) => {
    try {
        const { leadIds, options = {} } = req.body;

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return next(new ErrorHandler('Lead IDs array is required', 400));
        }

        const Lead = await getLeadModel();
        const Call = await getCallModel();

        // Get leads with phone numbers
        const leads = await Lead.find({ 
            _id: { $in: leadIds },
            phone: { $exists: true, $ne: null, $ne: '' }
        });

        if (leads.length === 0) {
            return next(new ErrorHandler('No valid leads with phone numbers found', 404));
        }

        const calls = [];
        const delay = options.delay || 5000; // 5 seconds between calls (after previous call ends)

        // Create call records and add to queue
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];

            const sessionId = `bulk_call_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;
            const call = new Call({
                leadId: lead._id,
                sessionId: sessionId,
                phoneNumber: lead.phone,
                status: 'scheduled',
                callType: 'automatic',
                scheduledAt: new Date()
            });
            await call.save();
            calls.push(call);

            // Add to queue
            callQueue.push({
                callId: call._id,
                leadId: lead._id,
                phoneNumber: lead.phone,
                delay: i === 0 ? 0 : delay, // No delay for first call
                total: leads.length,
                completed: 0
            });

            // Link call to lead
            if (!lead.callHistory) {
                lead.callHistory = [];
            }
            if (!lead.callHistory.includes(call._id)) {
                lead.callHistory.push(call._id);
                await lead.save();
            }
        }

        // Start processing queue
        processCallQueue().catch(err => {
            console.error('Error processing call queue:', err);
        });

        res.status(200).json({
            success: true,
            message: `Queued ${calls.length} calls for sequential processing`,
            calls: calls.map(c => ({
                id: c._id,
                sessionId: c.sessionId,
                leadId: c.leadId,
                phoneNumber: c.phoneNumber,
                status: c.status
            })),
            queueSize: callQueue.length
        });

    } catch (error) {
        console.error('Error in bulk call:', error);
        return next(new ErrorHandler(error.message || 'Failed to initiate bulk calls', 500));
    }
});

/**
 * Get call queue status
 */
exports.getCallQueueStatus = catchAsyncErrors(async (req, res, next) => {
    try {
        const Call = await getCallModel();
        const activeCall = await Call.findOne({
            status: { $in: ['ringing', 'in-progress'] }
        }).populate('leadId', 'firstName lastName email phone');

        // Get pending calls from queue (scheduled calls waiting to be processed)
        const pendingCalls = await Call.find({
            status: 'scheduled',
            scheduledAt: { $lte: new Date() } // Only scheduled calls that are due
        })
        .populate('leadId', 'firstName lastName email phone')
        .sort({ scheduledAt: 1 })
        .limit(20); // Limit to 20 for performance

        // Get all scheduled calls (including future ones)
        const allScheduledCalls = await Call.find({
            status: 'scheduled'
        }).countDocuments();

        res.status(200).json({
            success: true,
            queue: {
                pending: callQueue.length,
                isProcessing: isProcessingQueue,
                currentCall: currentCall ? {
                    callId: currentCall._id,
                    leadId: currentCall.leadId,
                    phoneNumber: currentCall.phoneNumber,
                    status: currentCall.status,
                    sessionId: currentCall.sessionId
                } : null,
                activeCall: activeCall ? {
                    callId: activeCall._id,
                    leadId: activeCall.leadId,
                    phoneNumber: activeCall.phoneNumber,
                    status: activeCall.status,
                    duration: activeCall.duration,
                    sessionId: activeCall.sessionId,
                    startedAt: activeCall.startedAt,
                    leadInfo: activeCall.leadId ? {
                        firstName: activeCall.leadId.firstName,
                        lastName: activeCall.leadId.lastName,
                        email: activeCall.leadId.email,
                        phone: activeCall.leadId.phone
                    } : null
                } : null,
                pendingCalls: pendingCalls.map(call => ({
                    callId: call._id,
                    sessionId: call.sessionId,
                    leadId: call.leadId,
                    phoneNumber: call.phoneNumber,
                    status: call.status,
                    scheduledAt: call.scheduledAt,
                    leadInfo: call.leadId ? {
                        firstName: call.leadId.firstName,
                        lastName: call.leadId.lastName,
                        email: call.leadId.email,
                        phone: call.leadId.phone
                    } : null
                })),
                totalScheduled: allScheduledCalls
            }
        });

    } catch (error) {
        console.error('Error getting queue status:', error);
        return next(new ErrorHandler(error.message || 'Failed to get queue status', 500));
    }
});

/**
 * Schedule a call for a specific time
 */
exports.scheduleCall = catchAsyncErrors(async (req, res, next) => {
    try {
        const { leadId, phoneNumber, scheduledAt } = req.body;

        if (!leadId || !phoneNumber || !scheduledAt) {
            return next(new ErrorHandler('Lead ID, phone number, and scheduled time are required', 400));
        }

        const Call = await getCallModel();
        const scheduledDate = new Date(scheduledAt);

        if (scheduledDate < new Date()) {
            return next(new ErrorHandler('Scheduled time must be in the future', 400));
        }

        const sessionId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const call = new Call({
            leadId: leadId,
            sessionId: sessionId,
            phoneNumber: phoneNumber,
            status: 'scheduled',
            callType: 'scheduled',
            scheduledAt: scheduledDate
        });
        await call.save();

        res.status(200).json({
            success: true,
            call: {
                id: call._id,
                sessionId: call.sessionId,
                leadId: leadId,
                phoneNumber: phoneNumber,
                status: call.status,
                scheduledAt: call.scheduledAt
            }
        });

    } catch (error) {
        console.error('Error scheduling call:', error);
        return next(new ErrorHandler(error.message || 'Failed to schedule call', 500));
    }
});

/**
 * Get call status
 */
exports.getCallStatus = catchAsyncErrors(async (req, res, next) => {
    try {
        const { sessionId } = req.params;

        const Call = await getCallModel();
        const call = await Call.findOne({ sessionId: sessionId }).populate('leadId', 'firstName lastName email phone');

        if (!call) {
            return next(new ErrorHandler('Call not found', 404));
        }

        res.status(200).json({
            success: true,
            call: call
        });

    } catch (error) {
        console.error('Error getting call status:', error);
        return next(new ErrorHandler(error.message || 'Failed to get call status', 500));
    }
});

/**
 * Get call history for a lead
 */
exports.getCallHistory = catchAsyncErrors(async (req, res, next) => {
    try {
        const { leadId } = req.params;

        const Call = await getCallModel();
        const calls = await Call.find({ leadId: leadId })
            .sort({ createdAt: -1 })
            .limit(50);

        res.status(200).json({
            success: true,
            calls: calls
        });

    } catch (error) {
        console.error('Error getting call history:', error);
        return next(new ErrorHandler(error.message || 'Failed to get call history', 500));
    }
});

/**
 * Cancel a call
 */
exports.cancelCall = catchAsyncErrors(async (req, res, next) => {
    try {
        const { sessionId } = req.params;

        const Call = await getCallModel();
        const call = await Call.findOne({ sessionId: sessionId });

        if (!call) {
            return next(new ErrorHandler('Call not found', 404));
        }

        if (call.status === 'completed' || call.status === 'cancelled') {
            return next(new ErrorHandler('Call cannot be cancelled', 400));
        }

        // Tell VoIP agent to end the call (send BYE message)
        if (global.voipAgent) {
            try {
                const ended = global.voipAgent.endCallBySessionId(sessionId);
                if (!ended) {
                    console.warn(`⚠️ Could not end call in VoIP agent for sessionId: ${sessionId}`);
                    // Continue anyway - update database status
                }
            } catch (error) {
                console.error('❌ Error ending call in VoIP agent:', error);
                // Continue anyway - update database status
            }
        }

        call.status = 'cancelled';
        call.endedAt = new Date();
        if (call.startedAt) {
            call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
        }
        await call.save();

        // Emit Socket.io event
        if (global.io) {
            global.io.emit('call:status:update', {
                callId: call._id,
                sessionId: sessionId,
                leadId: call.leadId,
                status: 'cancelled',
                endedAt: call.endedAt
            });
        }

        res.status(200).json({
            success: true,
            message: 'Call cancelled',
            call: call
        });

    } catch (error) {
        console.error('Error cancelling call:', error);
        return next(new ErrorHandler(error.message || 'Failed to cancel call', 500));
    }
});

/**
 * Webhook endpoint for call summary (called by VoIP bot)
 */
exports.receiveCallSummary = catchAsyncErrors(async (req, res, next) => {
    try {
        const { sessionId, leadId, summary, transcript, metadata } = req.body;

        if (!sessionId) {
            return next(new ErrorHandler('Session ID is required', 400));
        }

        const Call = await getCallModel();
        const Lead = await getLeadModel();

        // Find call by sessionId
        const call = await Call.findOne({ sessionId: sessionId });
        if (!call) {
            return next(new ErrorHandler('Call not found', 404));
        }

        // Update call with summary
        call.summary = summary || call.summary;
        // Prefer JSON transcript format if available, otherwise use text format
        call.transcript = transcript || call.transcript;
        // Also store transcriptText if provided for backward compatibility
        if (req.body.transcriptText) {
            call.transcriptText = req.body.transcriptText;
        }
        call.metadata = metadata || call.metadata;
        call.status = 'completed';
        call.endedAt = new Date();
        if (call.startedAt) {
            call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
        }
        await call.save();

        // Update lead's call history
        if (leadId) {
            const lead = await Lead.findById(leadId);
            if (lead) {
                if (!lead.callHistory) {
                    lead.callHistory = [];
                }
                if (!lead.callHistory.includes(call._id)) {
                    lead.callHistory.push(call._id);
                    await lead.save();
                }
            }
        }

        // Create activity log entry
        if (leadId && summary) {
            await logActivity({
                leadId: leadId,
                type: 'call_logged',
                comment: summary,
                metadata: {
                    callId: call._id,
                    sessionId: sessionId,
                    duration: call.duration,
                    transcript: transcript
                },
                isSystemGenerated: true
            });
        }

        // Emit Socket.io event
        if (global.io) {
            global.io.emit('call:summary:ready', {
                callId: call._id,
                sessionId: sessionId,
                leadId: leadId || call.leadId,
                summary: summary
            });
        }

        res.status(200).json({
            success: true,
            message: 'Call summary received',
            call: call
        });

    } catch (error) {
        console.error('Error receiving call summary:', error);
        return next(new ErrorHandler(error.message || 'Failed to receive call summary', 500));
    }
});

/**
 * Internal method to update call status (called by VoIP bot)
 * Tracks SIP events and calculates timing
 * This is the internal version that can be called directly (not wrapped in catchAsyncErrors)
 */
async function updateCallStatusInternal(sessionId, status, data = {}) {
    try {
        const Call = await getCallModel();
        const call = await Call.findOne({ sessionId: sessionId });

        if (!call) {
            console.error(`Call not found for sessionId: ${sessionId}`);
            return;
        }

        const now = new Date();
        call.status = status;

        // Track SIP events
        if (data.sipCode && data.sipMessage) {
            if (!call.metadata) call.metadata = {};
            if (!call.metadata.sipEvents) call.metadata.sipEvents = [];
            
            // Check if this event already exists to avoid duplicates
            const eventExists = call.metadata.sipEvents.some(e => 
                e.code === data.sipCode && 
                e.message === data.sipMessage &&
                Math.abs(new Date(e.timestamp) - now) < 1000 // Within 1 second
            );
            
            if (!eventExists) {
                const sipEvent = {
                    code: data.sipCode, // Can be Number or String ('BYE')
                    message: data.sipMessage,
                    timestamp: now,
                    type: data.sipType || getSipEventType(data.sipCode)
                };
                
                call.metadata.sipEvents.push(sipEvent);
            }
            // Update sipStatus (latest SIP event)
            call.metadata.sipStatus = {
                code: data.sipCode, // Can be Number or String ('BYE')
                message: data.sipMessage,
                receivedAt: now
            };
        }

        // Calculate timing
        if (data.startedAt) {
            call.startedAt = new Date(data.startedAt);
        } else if (!call.startedAt && status !== 'scheduled') {
            call.startedAt = now;
        }

        // Track when call is answered (200 OK)
        if (data.sipCode === 200 && status === 'in-progress') {
            call.status = 'in-progress';
            if (call.startedAt) {
                call.ringingTime = Math.floor((now - call.startedAt) / 1000);
            }
        }

        // Track when call ends (BYE)
        if (data.sipCode && (data.sipMessage === 'BYE' || status === 'completed' || status === 'failed')) {
            call.endedAt = now;
            if (call.startedAt) {
                call.duration = Math.floor((now - call.startedAt) / 1000);
                
                // Calculate active call time (from answered to ended)
                const answeredAt = call.metadata?.sipEvents?.find(e => e.code === 200)?.timestamp;
                if (answeredAt) {
                    call.activeCallTime = Math.floor((now - new Date(answeredAt)) / 1000);
                }
            }
        }

        if (data.duration) call.duration = data.duration;
        if (data.endedAt) call.endedAt = new Date(data.endedAt);
        
        await call.save();

        // Emit Socket.io event with detailed info
        if (global.io) {
            global.io.emit('call:status:update', {
                callId: call._id,
                sessionId: sessionId,
                leadId: call.leadId,
                phoneNumber: call.phoneNumber,
                status: status,
                duration: call.duration,
                activeCallTime: call.activeCallTime,
                ringingTime: call.ringingTime,
                sipStatus: call.metadata?.sipStatus,
                sipEvents: call.metadata?.sipEvents || [],
                startedAt: call.startedAt,
                endedAt: call.endedAt
            });
        }

    } catch (error) {
        console.error('Error updating call status:', error);
    }
}

/**
 * Exported version wrapped in catchAsyncErrors for API routes
 */
exports.updateCallStatus = catchAsyncErrors(async (req, res, next) => {
    try {
        const { sessionId, status, ...data } = req.body;
        await updateCallStatusInternal(sessionId, status, data);
        res.status(200).json({ success: true });
    } catch (error) {
        return next(new ErrorHandler(error.message || 'Failed to update call status', 500));
    }
});

// Export internal version for direct calls
exports.updateCallStatusInternal = updateCallStatusInternal;

/**
 * Helper to determine SIP event type from status code
 */
exports.getSipEventType = (code) => {
    if (code === 100) return 'trying';
    if (code === 180) return 'ringing';
    if (code === 183) return 'progress';
    if (code === 200) return 'answered';
    if (code >= 400 && code < 500) return 'client_error';
    if (code >= 500 && code < 600) return 'server_error';
    if (code === 'BYE') return 'bye';
    return 'unknown';
};

/**
 * Get call statistics
 */
exports.getCallStatistics = catchAsyncErrors(async (req, res, next) => {
    try {
        const Call = await getCallModel();
        const { startDate, endDate } = req.query;

        const matchQuery = {};
        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
            if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
        }

        const stats = await Call.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalDuration: { $sum: '$duration' },
                    avgDuration: { $avg: '$duration' },
                    totalActiveTime: { $sum: '$activeCallTime' },
                    avgActiveTime: { $avg: '$activeCallTime' }
                }
            }
        ]);

        const totalCalls = await Call.countDocuments(matchQuery);
        const completedCalls = await Call.countDocuments({ ...matchQuery, status: 'completed' });
        const activeCalls = await Call.countDocuments({ ...matchQuery, status: 'in-progress' });
        const failedCalls = await Call.countDocuments({ ...matchQuery, status: 'failed' });

        res.status(200).json({
            success: true,
            statistics: {
                total: totalCalls,
                completed: completedCalls,
                active: activeCalls,
                failed: failedCalls,
                byStatus: stats,
                successRate: totalCalls > 0 ? ((completedCalls / totalCalls) * 100).toFixed(2) : 0
            }
        });

    } catch (error) {
        console.error('Error getting call statistics:', error);
        return next(new ErrorHandler(error.message || 'Failed to get call statistics', 500));
    }
});

/**
 * Get active calls
 */
exports.getActiveCalls = catchAsyncErrors(async (req, res, next) => {
    try {
        const Call = await getCallModel();
        const activeCalls = await Call.find({
            status: { $in: ['ringing', 'in-progress'] }
        })
        .populate('leadId', 'firstName lastName email phone')
        .sort({ startedAt: -1 })
        .limit(50);

        // Calculate live duration for active calls
        const callsWithLiveDuration = activeCalls.map(call => {
            const callObj = call.toObject();
            if (call.startedAt) {
                const liveDuration = Math.floor((new Date() - call.startedAt) / 1000);
                callObj.liveDuration = liveDuration;
                callObj.liveDurationFormatted = formatDuration(liveDuration);
            }
            return callObj;
        });

        res.status(200).json({
            success: true,
            calls: callsWithLiveDuration,
            count: activeCalls.length
        });

    } catch (error) {
        console.error('Error getting active calls:', error);
        return next(new ErrorHandler(error.message || 'Failed to get active calls', 500));
    }
});

/**
 * Helper to format duration
 */
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

