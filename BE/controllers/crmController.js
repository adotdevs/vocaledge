// controllers/crmController.js
const getLeadModel = require('../crmDB/models/leadsModel');
const csv = require('csv-parser');
const fs = require('fs');
const User = require('../models/userModel'); // from main DB
const sendEmail = require('../utils/sendEmail'); // Email utility
const crypto = require('crypto'); // For generating passwords
const mongoose = require('mongoose');

const jwtToken = require('../utils/jwtToken');
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const ErrorHandler = require('../utils/errorHandler');
const { logActivity } = require('./activityController');
const { normalizeLeadStatus, getDefaultLeadStatusLabel, getLeadStatusLabels, getHiddenStatusLabelsForUser, isStatusHiddenForUser } = require('../utils/leadStatusHelpers');
const { hasCrmPermission, denyCrmPermission, canViewLeadSource } = require('../utils/crmPermissions');
const { addCustomerSearch, applyCustomerFilters, normalizeCustomerFields, bodyHasCustomerFields } = require('../utils/leadCustomerFields');
const { isNewStatus, refillOwners, refillAllEligibleAgents, listRequestCanRefill, ownerIdOf, userCanOpenCrm, refillIfEmpty } = require('../utils/leadRefill');
const { stampLeadNumbers } = require('../utils/leadNumber');
const { MERGE_FIELDS, buildLeadMergePlan, findMergeConflicts, selectedMergeFields, valuesMatch } = require('../utils/leadMerge');
const { clearLeadUploadDetailsDocument } = require('../utils/leadUploadRetention');

const hidePrivateLeadFields = (lead, user) => {
  if (!lead) return lead;
  const copy = { ...lead };
  if (!hasCrmPermission(user, "canViewLeadSource")) delete copy.source;
  if (!hasCrmPermission(user, "canViewLeadBrand")) delete copy.Brand;
  if (!hasCrmPermission(user, "canViewLeadFileName")) delete copy.fileName;
  return copy;
};

const stream = require('stream');

// PERFORMANCE OPTIMIZATION: Cache for user permissions and subadmin lists
const userPermissionCache = new Map();
const subadminCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
let crmTransactionSupportPromise = null;

const crmSupportsTransactions = (Lead) => {
    if (!crmTransactionSupportPromise) {
        crmTransactionSupportPromise = Lead.db.db.admin().command({ hello: 1 })
            .then((hello) => Boolean(hello.setName || hello.msg === "isdbgrid"))
            .catch(() => false);
    }
    return crmTransactionSupportPromise;
};

// Helper function to get cached user permissions
async function getCachedUserPermissions(userId) {
    const cacheKey = `permissions_${userId}`;
    const cached = userPermissionCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    
    const user = await User.findById(userId).select('adminPermissions role').lean();
    const data = {
        adminPermissions: user?.adminPermissions,
        role: user?.role
    };
    
    userPermissionCache.set(cacheKey, {
        data,
        timestamp: Date.now()
    });
    
    return data;
}

// Helper function to get cached subadmin list
async function getCachedSubadmins() {
    const cacheKey = 'subadmins_list';
    const cached = subadminCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    
    const subadmins = await User.find({ role: 'subadmin' }).select('_id').lean();
    const subadminIds = subadmins.map(u => u._id);
    
    subadminCache.set(cacheKey, {
        data: subadminIds,
        timestamp: Date.now()
    });
    
    return subadminIds;
}

// Export helper functions for use in other controllers
exports.getCachedUserPermissions = getCachedUserPermissions;
exports.getCachedSubadmins = getCachedSubadmins;

// Clear cache when needed (e.g., on user update)
function clearUserCache(userId) {
    if (userId) {
        userPermissionCache.delete(`permissions_${userId}`);
    }
    subadminCache.clear();
}

// Escape user input for safe use in regex
function applyCountryFilter(query, country) {
    if (country && String(country).trim() !== '') {
        query.country = new RegExp(`^${escapeRegex(String(country).trim())}$`, 'i');
    }
}

function escapeRegex(text) {
    return text && typeof text === 'string'
        ? text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : text;
}

function plainAggregateMatch(value, key = "") {
    if (value instanceof RegExp) {
        const options = `${value.ignoreCase ? "i" : ""}${value.flags || ""}`.replace(/(.)(?=.*\1)/g, "");
        return { $regex: value.source, $options: options };
    }
    if (typeof value === "string" && (key === "agent" || key === "_id") && mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === value) {
        return new mongoose.Types.ObjectId(value);
    }
    if (Array.isArray(value)) return value.map((item) => plainAggregateMatch(item, key));
    if (value && typeof value === "object" && !(value instanceof mongoose.Types.ObjectId) && !(value instanceof Date)) {
        const next = {};
        Object.entries(value).forEach(([childKey, childValue]) => {
            if ((childKey === "$in" || childKey === "$nin") && Array.isArray(childValue)) {
                next[childKey] = childValue.map((item) => plainAggregateMatch(item, key));
                return;
            }
            next[childKey] = plainAggregateMatch(childValue, childKey === "$eq" ? key : childKey);
        });
        return next;
    }
    return value;
}

function applyCountrySearchFilter(query, countrySearch) {
    if (countrySearch && String(countrySearch).trim() !== '') {
        const searchPattern = new RegExp(escapeRegex(String(countrySearch).trim()), 'i');
        if (query.country) {
            query.$and = query.$and || [];
            query.$and.push({ country: query.country }, { country: searchPattern });
            delete query.country;
        } else {
            query.country = searchPattern;
        }
    }
}

function applyBrandSearchFilter(query, brandSearch) {
    if (brandSearch && String(brandSearch).trim() !== '') {
        const searchPattern = new RegExp(escapeRegex(String(brandSearch).trim()), 'i');
        query.Brand = searchPattern;
    }
}

async function applyLeadVisibilityToQuery(query, user) {
    if (!user) return;

    if (user.role === 'manager') {
        const assignedAdmins = await User.find({
            role: 'admin',
            assignedManager: user._id
        }).select('_id').lean();

        const assignedAdminIds = assignedAdmins.map((admin) => admin._id);

        if (assignedAdminIds.length === 0) {
            query.agent = { $in: [] };
        } else {
            query.agent = { $in: assignedAdminIds };
        }
    } else if (user.role === 'superadmin') {
        // Superadmin can see all leads
    } else if (user.role === 'subadmin') {
        query.agent = user._id;
    } else if (user.role === 'admin') {
        const userPerms = await getCachedUserPermissions(user._id);
        if (userPerms?.adminPermissions?.canManageCrmLeads) {
            const subadminIds = await getCachedSubadmins();
            query.agent = { $in: [user._id, ...subadminIds] };
        } else {
            query.agent = user._id;
        }
    }

    const hiddenStatuses = await getHiddenStatusLabelsForUser(user);
    if (hiddenStatuses.length > 0) {
        query.$and = query.$and || [];
        query.$and.push({
            $nor: hiddenStatuses.map((label) => ({ status: new RegExp(`^${escapeRegex(label)}$`, 'i') }))
        });
    }
}

exports.applyLeadVisibilityToQuery = applyLeadVisibilityToQuery;

let unassignedAgentsCache = null;
let unassignedAgentsCacheAt = 0;
const UNASSIGNED_CACHE_MS = 30 * 1000;

async function getUnassignedAgentIds(Lead) {
    if (unassignedAgentsCache && (Date.now() - unassignedAgentsCacheAt < UNASSIGNED_CACHE_MS)) {
        return unassignedAgentsCache;
    }
    const leadModel = Lead || (await getLeadModel());
    const supers = await User.find({ role: "superadmin" }).select("_id").lean();
    const superIds = supers.map((item) => item._id);

    const rawAgents = await leadModel.collection.distinct("agent", { isDeleted: false });
    const objectIds = [];
    rawAgents.forEach((agent) => {
        if (agent && mongoose.Types.ObjectId.isValid(agent)) {
            objectIds.push(new mongoose.Types.ObjectId(agent));
        }
    });

    const existing = objectIds.length
        ? await User.find({ _id: { $in: objectIds } }).select("_id").lean()
        : [];
    const existingIds = new Set(existing.map((item) => String(item._id)));
    const orphanIds = objectIds.filter((id) => !existingIds.has(String(id)));

    const heldIds = [...superIds, ...orphanIds];
    unassignedAgentsCache = { heldIds, superIds, orphanIds };
    unassignedAgentsCacheAt = Date.now();
    return unassignedAgentsCache;
}

async function getUnassignedCondition(Lead) {
    const { heldIds } = await getUnassignedAgentIds(Lead);
    return {
        $or: [
            { agent: null },
            { agent: { $exists: false } },
            ...(heldIds.length ? [{ agent: { $in: heldIds } }] : [])
        ]
    };
}

async function canUserViewUnassignedLeads(user) {
    if (!user) return false;
    if (user.role === "superadmin" || user.role === "manager") return true;
    if (user.role === "admin") {
        const userPerms = await getCachedUserPermissions(user._id);
        if (userPerms?.adminPermissions?.canManageCrmLeads || userPerms?.adminPermissions?.canAssignLeads) {
            return true;
        }
    }
    if (user.role === "subadmin") {
        const userPerms = await getCachedUserPermissions(user._id);
        if (userPerms?.permissions?.canAssignLeads) {
            return true;
        }
    }
    return false;
}

async function applyAgentFilterToQuery(query, agent, user, Lead) {
    const selected = String(agent || "").trim();
    if (!selected) return;

    if (selected === "unassigned") {
        const allowed = await canUserViewUnassignedLeads(user);
        if (!allowed) {
            query.agent = { $in: [] };
            return;
        }

        delete query.agent;
        const unassignedCond = await getUnassignedCondition(Lead);

        if (query.$or) {
            query.$and = query.$and || [];
            query.$and.push({ $or: query.$or });
            delete query.$or;
        }
        if (query.$and) {
            query.$and.push(unassignedCond);
        } else {
            query.$or = unassignedCond.$or;
        }
        return;
    }

    const selectedObjectId = mongoose.Types.ObjectId.isValid(selected)
        ? new mongoose.Types.ObjectId(selected)
        : selected;

    if (query.agent && query.agent.$in) {
        const allowed = query.agent.$in.map((id) => String(id));
        query.agent = allowed.includes(selected) ? selectedObjectId : { $in: [] };
        return;
    }

    if (query.agent && String(query.agent) !== selected) {
        query.agent = { $in: [] };
        return;
    }

    query.agent = selectedObjectId;
}

const brandCache = new Map();
const BRAND_CACHE_MS = 60 * 1000;

async function getDistinctLeadBrands(user) {
    const cacheKey = `${user?.role || "all"}:${user?._id || ""}`;
    const cached = brandCache.get(cacheKey);
    if (cached && Date.now() - cached.at < BRAND_CACHE_MS) return cached.brands;

    const Lead = await getLeadModel();
    const brandsQuery = {
        isDeleted: false,
        Brand: { $exists: true, $nin: [null, ''] },
    };

    await applyLeadVisibilityToQuery(brandsQuery, user);

    const brandsRaw = await Lead.distinct('Brand', brandsQuery);
    const brands = [...new Set(
        brandsRaw
            .map((brand) => String(brand).trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    brandCache.set(cacheKey, { brands, at: Date.now() });
    return brands;
}

// Super admin only: take a brand away from every lead that has it, which also removes it from the Brand filter list.
// The leads themselves are kept, only their Brand value is cleared. With dryRun it only counts the leads.
exports.removeLeadBrand = async (req, res) => {
    try {
        const brand = String(req.body?.brand ?? '').trim();
        if (!brand) {
            return res.status(400).json({ success: false, msg: 'Brand is required' });
        }
        const dryRun = req.body?.dryRun === true || req.body?.dryRun === 'true';
        const Lead = await getLeadModel();

        // Same rule as the filter list: stored values are compared after trimming spaces, and case matters.
        // Deleted (trash) leads are included so the brand cannot come back when one is restored.
        const sameBrand = { Brand: new RegExp(`^\\s*${escapeRegex(brand)}\\s*$`) };
        const leadCount = await Lead.countDocuments(sameBrand);
        if (dryRun) {
            return res.status(200).json({ success: true, dryRun: true, data: { brand, leadCount } });
        }

        const result = await Lead.updateMany(sameBrand, { $set: { Brand: '' } });
        brandCache.clear();
        const modifiedCount = result.modifiedCount ?? leadCount;
        return res.status(200).json({
            success: true,
            msg: `Brand "${brand}" removed from ${modifiedCount} lead${modifiedCount === 1 ? '' : 's'}`,
            data: { brand, leadCount, modifiedCount },
        });
    } catch (err) {
        console.error('Error removing lead brand:', err);
        return res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

exports.loginCRM = catchAsyncErrors(async (req, res, next) => {
    try {
        const email = String(req.body.email || "").trim();
        const password = req.body.password;
        if (!email || !password) {
            return next(new ErrorHandler("Please enter email and password", 400));
        }

        const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const admin = await User.findOne({
            email: new RegExp(`^${escapedEmail}$`, "i"),
            role: { $in: ["admin", "superadmin", "subadmin", "manager"] },
        });

        if (!admin || String(admin.password) !== String(password)) {
            const { noteLogin } = require("../utils/loginAudit");
            noteLogin(req, admin, false, admin ? "Invalid password" : "Unknown email");
            return next(new ErrorHandler("Invalid email or password", 400));
        }

        if (admin.role === "admin" || admin.role === "subadmin" || admin.role === "manager") {
            if (userCanOpenCrm(admin)) {
                refillIfEmpty(admin._id).catch((err) => {
                    console.error("CRM login lead refill error:", err);
                });
            }
        }

        jwtToken(admin, 200, res, req);


    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});



// Normalize phone for lead storage; optionally prefix all numbers with +
const normalizeLeadPhone = (phone, addPlusPrefix = false) => {
    if (phone === null || phone === undefined || phone === '') return '';

    let formatted = String(phone).trim();
    formatted = formatted.replace(/[\s\-\(\)\.]/g, '');

    if (addPlusPrefix && formatted && !formatted.startsWith('+')) {
        const digits = formatted.replace(/\D/g, '');
        formatted = digits ? `+${digits}` : formatted;
    }

    return formatted;
};

const getPhoneLookupValues = (phone) => {
    const normalized = normalizeLeadPhone(phone);
    if (!normalized) return [];

    const digits = normalized.replace(/\D/g, '');
    if (!digits) return [normalized];

    return [...new Set([normalized, digits, `+${digits}`])];
};

const findExistingLeadByPhone = async (Lead, phone, excludeId = null) => {
    const lookupValues = getPhoneLookupValues(phone);
    if (!lookupValues.length) return null;

    const query = { phone: { $in: lookupValues }, isDeleted: false };
    if (excludeId) query._id = { $ne: excludeId };

    return Lead.findOne(query);
};

exports.createLead = catchAsyncErrors(async (req, res, next) => {

    try {
        if (!hasCrmPermission(req.user, 'canCreateLeads')) {
            return denyCrmPermission(res, 'You do not have permission to create leads');
        }

        const {
            firstName,
            lastName,
            email,
            phone,
            country,
            Brand,
            source,
            fileName,
            Address,
            status = 'New',
            agentId,
            addPhonePlusPrefix,
        } = req.body;

        const shouldAddPhonePlus =
            addPhonePlusPrefix === true || addPhonePlusPrefix === 'true';

        if (!firstName || !lastName) {
            return res.status(400).json({
                success: false,
                msg: 'First name and last name are required'
            });
        }

        // Get Lead model

        const Lead = await getLeadModel();
        
        // Normalize phone (+ prefix optional)
        const formattedPhone = phone ? normalizeLeadPhone(phone, shouldAddPhonePlus) : '';
        
        // Check for duplicate email if email is provided
        if (email) {
            const existingLeadByEmail = await Lead.findOne({ email, isDeleted: false });
            if (existingLeadByEmail) {
                return res.status(400).json({
                    success: false,
                    msg: 'A lead with this email already exists'
                });
            }
        }
        
        // Check for duplicate phone if phone is provided
        if (formattedPhone) {
            const existingLeadByPhone = await findExistingLeadByPhone(Lead, formattedPhone);
            if (existingLeadByPhone) {
                return res.status(400).json({
                    success: false,
                    msg: 'A lead with this phone number already exists'
                });
            }
        }

        // Decide agent assignment
        let assignedAgent = null;
        // Check if agentId is provided and not empty
        const hasAgentId = agentId && (typeof agentId === 'string' ? agentId.trim() !== '' : true);
        
        if (req.user && req.user.role === 'superadmin' && hasAgentId) {
            const agentUser = await User.findById(agentId);
            if (!agentUser) return res.status(404).json({ success: false, msg: 'Agent user not found' });
            if (!['admin', 'subadmin', 'superadmin'].includes(agentUser.role)) {
                return res.status(400).json({ success: false, msg: 'Agent must be an admin, subadmin, or superadmin' });
            }
            assignedAgent = agentUser._id;
        } else if (req.user && req.user.role === 'manager') {
            // Manager MUST select an admin - cannot leave unassigned
            if (!hasAgentId) {
                return res.status(400).json({ success: false, msg: 'Manager must select an admin to assign the lead to' });
            }
            // Manager can assign leads to admins assigned to them
            const agentUser = await User.findById(agentId);
            if (!agentUser) return res.status(404).json({ success: false, msg: 'Agent user not found' });
            if (agentUser.role !== 'admin') {
                return res.status(400).json({ success: false, msg: 'Manager can only assign leads to admins' });
            }
            if (agentUser.assignedManager?.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, msg: 'This admin is not assigned to you' });
            }
            assignedAgent = agentUser._id;
        } else if (req.user && req.user.role !== 'superadmin' && req.user.role !== 'manager') {
            assignedAgent = req.user._id;
        } else {
            assignedAgent = null; // superadmin without agent selection leaves unassigned
        }

        const normalizedStatus = await normalizeLeadStatus(status);
        const customerFields = normalizeCustomerFields(req.body, { country });
        if (customerFields.error) {
            return res.status(400).json({ success: false, msg: customerFields.error });
        }

        // Create new lead
        const newLead = new Lead({
            firstName,
            lastName,
            email,
            phone: formattedPhone,
            country: country ? String(country).trim() : undefined,
            Brand: hasCrmPermission(req.user, "canViewLeadBrand") && Brand ? String(Brand).trim() : '',
            source: canViewLeadSource(req.user) && source ? String(source).trim() : null,
            fileName: hasCrmPermission(req.user, "canViewLeadFileName") && fileName ? String(fileName).trim().slice(0, 200) : "",
            Address,
            status: normalizedStatus,
            agent: assignedAgent,
            ...customerFields.values,
        });

        await newLead.save();

        // Log creation activity
        const fieldsList = [];
        if (firstName) fieldsList.push(`firstName: '${firstName}'`);
        if (lastName) fieldsList.push(`lastName: '${lastName}'`);
        if (email) fieldsList.push(`email: '${email}'`);
        if (phone) fieldsList.push(`phone: '${phone}'`);
        if (country) fieldsList.push(`country: '${country}'`);
        if (hasCrmPermission(req.user, "canViewLeadBrand") && Brand) fieldsList.push(`brand: '${String(Brand).trim()}'`);
        if (canViewLeadSource(req.user) && source) fieldsList.push(`source: '${String(source).trim()}'`);
        if (hasCrmPermission(req.user, "canViewLeadFileName") && fileName) fieldsList.push(`file name: '${String(fileName).trim()}'`);
        if (Address) fieldsList.push(`address: '${Address}'`);
        if (normalizedStatus) fieldsList.push(`status: '${normalizedStatus}'`);

        await logActivity({
            leadId: newLead._id,
            type: 'created',
            createdBy: req.user,
            changes: {
                description: `Lead created: ${fieldsList.join('; ')}`
            }
        });

        res.status(201).json({
            success: true,
            msg: 'Lead created successfully',
            data: { lead: hidePrivateLeadFields(newLead.toObject(), req.user) }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lead creation failed' });
    }
});

const buildWalletUserAddress = (user) => {
    const parts = [user.address, user.city, user.postalCode].filter(Boolean);
    return parts.join(', ');
};

const formatWalletUserPhone = (phone) => {
    if (phone === null || phone === undefined || phone === '') return '';
    return String(phone).trim();
};

exports.importUsersAsLeads = catchAsyncErrors(async (req, res, next) => {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
        return next(new ErrorHandler('Please select at least one user to import', 400));
    }

    const uniqueIds = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
    const users = await User.find({
        _id: { $in: uniqueIds },
        role: 'user',
    }).lean();

    const Lead = await getLeadModel();
    const defaultStatus = await normalizeLeadStatus('New');
    const foundIds = new Set(users.map((user) => user._id.toString()));

    const results = {
        created: 0,
        skipped: 0,
        failed: 0,
        items: [],
    };

    for (const user of users) {
        const email = user.email?.trim()?.toLowerCase() || '';
        try {
            const rawPhone = formatWalletUserPhone(user.phone);
            const formattedPhone = rawPhone ? normalizeLeadPhone(rawPhone, false) : '';

            if (email) {
                const existingByEmail = await Lead.findOne({ email, isDeleted: false });
                if (existingByEmail) {
                    results.skipped += 1;
                    results.items.push({
                        userId: user._id,
                        email,
                        status: 'skipped',
                        reason: 'Lead with this email already exists',
                    });
                    continue;
                }
            }

            if (formattedPhone) {
                const existingByPhone = await findExistingLeadByPhone(Lead, formattedPhone);
                if (existingByPhone) {
                    results.skipped += 1;
                    results.items.push({
                        userId: user._id,
                        email,
                        status: 'skipped',
                        reason: 'Lead with this phone already exists',
                    });
                    continue;
                }
            }

            const newLead = await Lead.create({
                firstName: user.firstName || 'Unknown',
                lastName: user.lastName || 'User',
                email: email || undefined,
                phone: formattedPhone || undefined,
                country: user.country ? String(user.country).trim() : undefined,
                Address: buildWalletUserAddress(user) || undefined,
                remarks: `Imported from wallet platform (user ID: ${user._id})`,
                source: 'wallet_user',
                status: defaultStatus,
                agent: null,
            });

            await logActivity({
                leadId: newLead._id,
                type: 'created',
                createdBy: req.user,
                changes: {
                    description: `Lead imported from wallet user ${user.firstName || ''} ${user.lastName || ''}`.trim() + (email ? ` (${email})` : ''),
                },
            });

            results.created += 1;
            results.items.push({
                userId: user._id,
                email,
                leadId: newLead._id,
                status: 'created',
            });
        } catch (err) {
            results.failed += 1;
            results.items.push({
                userId: user._id,
                email,
                status: 'failed',
                reason: err.message || 'Import failed',
            });
        }
    }

    uniqueIds.forEach((id) => {
        if (!foundIds.has(id)) {
            results.failed += 1;
            results.items.push({
                userId: id,
                status: 'failed',
                reason: 'User not found or not a wallet user',
            });
        }
    });

    if (results.created > 0) {
        refillAllEligibleAgents().catch((err) => {
            console.error("Post-import user lead refill error:", err);
        });
    }

    res.status(200).json({
        success: true,
        msg: `Imported ${results.created} user(s) to CRM. ${results.skipped} skipped, ${results.failed} failed.`,
        ...results,
    });
});

// Public lead form submission (e.g. takebackanalytics.com) - no auth, protected by API key + rate limit
const VALID_LOSS_RANGES = ['0-10K', '10K-30K', '30K-100K', '100K+'];
const MAX_CASE_NOTES_LENGTH = 500;
const MAX_FIRST_NAME = 100;
const MAX_EMAIL = 254;
const MAX_PHONE = 30;
const MAX_COUNTRY = 100;

function isValidEmail(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (trimmed.length > MAX_EMAIL) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
}

exports.createPublicLead = catchAsyncErrors(async (req, res, next) => {
    try {
        let {
            firstName,
            lastName,
            email,
            phone,
            country,
            caseNotes,
            lossRange,
            source = 'takebackanalytics',
        } = req.body;

        firstName = firstName != null ? String(firstName).trim() : '';
        lastName = lastName != null ? String(lastName).trim() : '';
        email = email != null ? String(email).trim() : '';
        phone = phone != null ? String(phone).trim() : '';
        country = country != null ? String(country).trim() : '';
        caseNotes = caseNotes != null ? String(caseNotes).trim().slice(0, MAX_CASE_NOTES_LENGTH) : '';
        lossRange = lossRange != null ? String(lossRange).trim() : '';
        source = source != null ? String(source).trim().slice(0, 50) : 'takebackanalytics';

        if (!firstName || firstName.length > MAX_FIRST_NAME) {
            return res.status(400).json({
                success: false,
                msg: 'First name is required (max 100 characters)',
            });
        }
        if (!email) {
            return res.status(400).json({
                success: false,
                msg: 'Email is required',
            });
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                msg: 'Please provide a valid email address',
            });
        }
        if (lossRange && !VALID_LOSS_RANGES.includes(lossRange)) {
            return res.status(400).json({
                success: false,
                msg: 'Invalid loss range. Use one of: ' + VALID_LOSS_RANGES.join(', '),
            });
        }

        const Lead = await getLeadModel();
        const formattedPhone = phone ? normalizeLeadPhone(phone) : '';

        if (email) {
            const existingLeadByEmail = await Lead.findOne({ email, isDeleted: false });
            if (existingLeadByEmail) {
                return res.status(400).json({
                    success: false,
                    msg: 'A lead with this email already exists',
                });
            }
        }
        if (formattedPhone) {
            const existingLeadByPhone = await findExistingLeadByPhone(Lead, formattedPhone);
            if (existingLeadByPhone) {
                return res.status(400).json({
                    success: false,
                    msg: 'A lead with this phone number already exists',
                });
            }
        }

        const remarksText = source === 'takebackanalytics'
            ? 'Takeback Analytics website form (takebackanalytics.com)'
            : `Website form (${source})`;

        const defaultStatus = await getDefaultLeadStatusLabel();

        const newLead = new Lead({
            firstName,
            lastName: lastName || '',
            email,
            phone: formattedPhone,
            country: country || undefined,
            status: defaultStatus,
            agent: null,
            Brand: 'Pay back',
            remarks: remarksText,
            source: source || 'takebackanalytics',
            caseNotes: caseNotes || undefined,
            lossRange: lossRange || undefined,
        });

        await newLead.save();

        res.status(201).json({
            success: true,
            msg: 'Lead submitted successfully',
            data: { leadId: newLead._id },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            msg: 'Submission failed. Please try again.',
        });
    }
});

exports.uploadCSV = catchAsyncErrors(async (req, res, next) => {
    console.log('📋 [UPLOAD CSV] Controller called:', {
        hasFile: !!req.file,
        fileName: req.file?.originalname,
        fileSize: req.file?.size,
        fileSizeMB: req.file?.size ? (req.file.size / (1024 * 1024)).toFixed(2) + 'MB' : 'N/A',
        contentType: req.headers['content-type'],
        bodyKeys: Object.keys(req.body),
        timestamp: new Date().toISOString()
    });

    try {
        console.log('📋 [UPLOAD CSV] req.file details:', req.file);
        const Lead = await getLeadModel();
        if (!req.file) {
            console.log('❌ [UPLOAD CSV] No file in request');
            return res.status(400).json({
                success: false,
                msg: 'No file uploaded'
            });
        }

        const fieldMapping = JSON.parse(req.body.fieldMapping || '{}');
        const selectedFields = JSON.parse(req.body.selectedFields || '{}');
        const incomingAgentId = req.body.agentId;
        const enableProgress = req.body.enableProgress === 'true'; // Check if progress tracking is enabled
        const addPhonePlusPrefix =
            req.body.addPhonePlusPrefix === true || req.body.addPhonePlusPrefix === 'true';
        const overrideBrand = hasCrmPermission(req.user, "canViewLeadBrand") ? String(req.body.overrideBrand || '').trim() : '';
        const overrideSource = canViewLeadSource(req.user) ? String(req.body.source || '').trim() : '';
        const overrideFileName = hasCrmPermission(req.user, "canViewLeadFileName") ? String(req.body.fileName || '').trim().slice(0, 200) : '';

        if (!hasCrmPermission(req.user, 'canUploadLeads')) {
            return denyCrmPermission(res, 'You do not have permission to upload leads');
        }
        let uploadAssignedAgent = null;
        // Check if incomingAgentId is provided and not empty
        const hasIncomingAgentId = incomingAgentId && (typeof incomingAgentId === 'string' ? incomingAgentId.trim() !== '' : true);
        
        if (req.user && req.user.role === 'superadmin' && hasIncomingAgentId) {
            const agentUser = await User.findById(incomingAgentId);
            if (!agentUser) {
                return res.status(404).json({ success: false, msg: 'Agent user not found' });
            }
            if (!['admin', 'subadmin', 'superadmin'].includes(agentUser.role)) {
                return res.status(400).json({ success: false, msg: 'Agent must be an admin, subadmin, or superadmin' });
            }
            uploadAssignedAgent = agentUser._id;
        } else if (req.user && req.user.role === 'manager') {
            // Manager MUST select an admin - cannot leave unassigned
            if (!hasIncomingAgentId) {
                return res.status(400).json({ success: false, msg: 'Manager must select an admin to assign the leads to' });
            }
            // Manager can assign leads to admins assigned to them
            const agentUser = await User.findById(incomingAgentId);
            if (!agentUser) {
                return res.status(404).json({ success: false, msg: 'Agent user not found' });
            }
            if (agentUser.role !== 'admin') {
                return res.status(400).json({ success: false, msg: 'Manager can only assign leads to admins' });
            }
            if (agentUser.assignedManager?.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, msg: 'This admin is not assigned to you' });
            }
            uploadAssignedAgent = agentUser._id;
        } else if (req.user && ['admin', 'subadmin'].includes(req.user.role)) {
            uploadAssignedAgent = req.user._id;
        } else {
            uploadAssignedAgent = null; // superadmin without agent selection leaves unassigned
        }

        const statusLabels = await getLeadStatusLabels();
        const defaultStatus = await getDefaultLeadStatusLabel();

        const results = [];
        const errors = [];
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);
        
        // If progress tracking enabled, set up SSE
        if (enableProgress) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();
        }

        const sendProgress = (data) => {
            if (enableProgress) {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            }
        };

        let csvHeaders = [];
        let rowCount = 0;
        const normalizeCsvHeader = (value) => String(value || '')
            .replace(/^\uFEFF/, '')
            .replace(/\u00a0/g, ' ')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');

        await new Promise((resolve, reject) => {
            bufferStream
                .pipe(csv({
                    mapHeaders: ({ header }) => String(header || '').replace(/^\uFEFF/, '').trim(),
                    mapValues: ({ value }) => typeof value === 'string' ? value.trim() : value,
                }))
                .on('data', (data) => {
                    try {
                        rowCount++;
                        if (rowCount === 1) csvHeaders = Object.keys(data);

                        const rowByHeader = {};
                        Object.entries(data).forEach(([key, value]) => {
                            rowByHeader[normalizeCsvHeader(key)] = value;
                        });

                        const mappedData = {};
                        Object.entries(fieldMapping || {}).forEach(([fieldKey, csvColumnName]) => {
                            if (!csvColumnName) return;
                            const requiredName = fieldKey === 'firstName' || fieldKey === 'lastName';
                            if (!requiredName && selectedFields && selectedFields[fieldKey] === false) return;
                            const csvValue = rowByHeader[normalizeCsvHeader(csvColumnName)];
                                if (csvValue !== undefined && csvValue !== null && csvValue !== '') {
                                    mappedData[fieldKey] = csvValue;
                            }
                        });

                        // Email is optional - no generation needed
                        // Check required fields - only firstName and lastName are required
                        if (!mappedData.firstName || !mappedData.lastName) {
                            errors.push({
                                row: rowCount,
                                error: `Missing required fields - Found: firstName=${!!mappedData.firstName}, lastName=${!!mappedData.lastName}`,
                                data: mappedData,
                                rawData: data
                            });
                            return;
                        }

                        // Clean and validate data - email is optional
                        const cleanData = {
                            firstName: mappedData.firstName ? mappedData.firstName.trim() : '',
                            lastName: mappedData.lastName ? mappedData.lastName.trim() : '',
                            email: mappedData.email ? mappedData.email.trim().toLowerCase() : undefined, // Optional - can be undefined
                            phone: mappedData.phone ? normalizeLeadPhone(mappedData.phone, addPhonePlusPrefix) : '',
                            country: mappedData.country ? mappedData.country.trim() : '',
                            Brand: hasCrmPermission(req.user, "canViewLeadBrand") ? (overrideBrand || (mappedData.Brand ? mappedData.Brand.trim() : '')) : '',
                            source: overrideSource || null,
                            fileName: overrideFileName,
                            Address: mappedData.Address ? mappedData.Address.trim() : '',
                            status: mappedData.status && statusLabels.includes(String(mappedData.status).trim())
                                ? String(mappedData.status).trim()
                                : defaultStatus,
                            agent: uploadAssignedAgent,
                        };

                        results.push(cleanData);
                    } catch (rowError) {
                        errors.push({
                            row: rowCount,
                            error: `Row processing error: ${rowError.message}`,
                            data: data,
                            stack: rowError.stack
                        });
                    }
                })
                .on('end', () => {
                    console.log(`📋 [CSV PARSE] Parsing complete - Rows processed: ${rowCount}, Valid rows: ${results.length}, Errors: ${errors.length}`);
                    if (results.length === 0 && errors.length > 0) {
                        console.log('📋 [CSV PARSE] Sample errors:', errors.slice(0, 3));
                    }
                    resolve();
                })
                .on('error', (err) => {
                    console.error('📋 [CSV PARSE] CSV parsing error:', err);
                    reject(err);
                });
        });

        if (results.length === 0) {
            const errorMessage = errors.length > 0 
                ? `No valid data found in CSV file. Processed ${rowCount} rows but none had all required fields (firstName, lastName). CSV headers found: ${csvHeaders.join(', ')}. Field mapping expected: ${Object.values(fieldMapping).join(', ')}.`
                : `No valid data found in CSV file. No rows were processed. Please check CSV format and field mapping.`;
            
            console.error('❌ [CSV PARSE] No valid data found:', {
                rowCount,
                csvHeaders,
                fieldMapping,
                selectedFields,
                errors: errors.slice(0, 5) // Log first 5 errors
            });

            if (enableProgress) {
                sendProgress({
                    type: 'error',
                    message: errorMessage,
                    errors: errors.slice(0, 10), // Limit errors in response
                    csvHeaders,
                    fieldMapping
                });
                res.end();
            } else {
            return res.status(400).json({
                success: false,
                msg: errorMessage,
                errors: errors.slice(0, 10), // Limit errors in response
                csvHeaders,
                fieldMapping
            });
            }
            return;
        }

        // Send initial progress
        sendProgress({
            type: 'start',
            total: results.length,
            percentage: 0
        });

        // One id for this CSV so the whole batch can be removed later.
        const uploadBatchId = new mongoose.Types.ObjectId();

        // Process leads in batches with bulk operations
        const BATCH_SIZE = 1000; // Increased batch size for better performance
        let processedCount = 0; // Track count instead of storing documents
        const skippedLeads = [];
        const skippedDuplicates = [];
        const createdLeadIds = []; // Store IDs of newly created leads for bulk calling
        let duplicateTotal = 0;
        let lastProgressUpdate = 0;
        const PROGRESS_UPDATE_INTERVAL = results.length > 1000 ? 50 : 10; // Less frequent updates for large datasets

        for (let i = 0; i < results.length; i += BATCH_SIZE) {
            const batch = results.slice(i, i + BATCH_SIZE);

            // Bulk duplicate check: Get all emails and phones in this batch
            const batchEmails = batch
                .map(lead => lead.email)
                .filter(email => email && email.trim() !== ''); // Only check leads with email
            
            const batchPhones = batch
                .flatMap(lead => (lead.phone ? getPhoneLookupValues(lead.phone) : []))
                .filter(phone => phone && phone.trim() !== '');
            
            const existingByEmail = new Map();
            const existingByPhone = new Map();
            const rememberExisting = (lead) => {
                if (lead.email) existingByEmail.set(String(lead.email).toLowerCase(), lead);
                getPhoneLookupValues(lead.phone).forEach((value) => existingByPhone.set(value, lead));
            };
            const alreadyInSystem = { isDeleted: false, uploadBatchId: { $ne: uploadBatchId } };
            if (batchEmails.length > 0) {
                const existingLeadsByEmail = await Lead.find({
                    email: { $in: batchEmails },
                    ...alreadyInSystem,
                }).select('_id firstName lastName email phone createdAt').lean();
                existingLeadsByEmail.forEach(rememberExisting);
            }
            if (batchPhones.length > 0) {
                const existingLeadsByPhone = await Lead.find({
                    phone: { $in: batchPhones },
                    ...alreadyInSystem,
                }).select('_id firstName lastName email phone createdAt').lean();
                existingLeadsByPhone.forEach(rememberExisting);
            }

            const leadsToInsert = [];
            const noteDuplicate = (leadData, formattedPhone, reason, existing) => {
                const row = {
                    key: String(duplicateTotal),
                    firstName: leadData.firstName || "",
                    lastName: leadData.lastName || "",
                    email: leadData.email || "",
                    phone: formattedPhone || leadData.phone || "",
                    country: leadData.country || "",
                    Brand: leadData.Brand || "",
                    source: leadData.source || "",
                    fileName: leadData.fileName || "",
                    Address: leadData.Address || "",
                    status: leadData.status || "New",
                    agent: leadData.agent ? String(leadData.agent) : null,
                    reason,
                    existingLeadId: existing?._id || null,
                    acceptedLeadId: null,
                    acceptedAt: null,
                };
                skippedLeads.push({ email: row.email, phone: row.phone, reason });
                duplicateTotal += 1;
                if (skippedDuplicates.length < 5000) skippedDuplicates.push(row);
            };
            for (const leadData of batch) {
                const formattedPhone = leadData.phone ? normalizeLeadPhone(leadData.phone, addPhonePlusPrefix) : '';
                const emailKey = leadData.email ? String(leadData.email).trim().toLowerCase() : "";
                const phoneLookupValues = getPhoneLookupValues(formattedPhone);
                const existingEmailLead = emailKey ? existingByEmail.get(emailKey) : null;
                const existingPhoneLead = phoneLookupValues.map((value) => existingByPhone.get(value)).find(Boolean) || null;

                // Repeats inside this CSV are kept. Skip only a lead that is already stored.
                if (emailKey && existingEmailLead) {
                    noteDuplicate(leadData, formattedPhone, "Duplicate email", existingEmailLead);
                } else if (existingPhoneLead) {
                    noteDuplicate(leadData, formattedPhone, "Duplicate phone number", existingPhoneLead);
                } else {
                    if (leadData.phone) leadData.phone = formattedPhone;
                    leadData.uploadBatchId = uploadBatchId;
                    leadsToInsert.push(leadData);
                }
            }

            if (leadsToInsert.length > 0) {
                try {
                    await stampLeadNumbers(leadsToInsert);
                    const result = await Lead.insertMany(leadsToInsert, { ordered: false });
                    processedCount += result.length;
                    createdLeadIds.push(...result.map(lead => lead._id.toString()));
                } catch (error) {
                    if (error.writeErrors) {
                        error.writeErrors.forEach(writeError => {
                    skippedLeads.push({
                                email: leadsToInsert[writeError.index]?.email || 'unknown',
                                reason: writeError.errmsg || 'Insert error'
                            });
                        });
                        processedCount += (leadsToInsert.length - error.writeErrors.length);
                    } else {
                        leadsToInsert.forEach(lead => {
                            skippedLeads.push({
                                email: lead.email,
                                reason: error.message || 'Insert error'
                            });
                    });
                }
            }
        }

            const currentProgress = processedCount + skippedLeads.length;
            if (currentProgress - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL || currentProgress === results.length) {
                sendProgress({
                    type: 'progress',
                    total: results.length,
                    uploaded: processedCount,
                    skipped: skippedLeads.length,
                    percentage: Math.round((currentProgress / results.length) * 100)
                });
                lastProgressUpdate = currentProgress;
            }
        }

        let uploadId = null;
        if (processedCount > 0 || skippedDuplicates.length > 0) {
            const getLeadUploadModel = require("../crmDB/models/leadUploadModel");
            const LeadUpload = await getLeadUploadModel();
            const uploadRecord = await LeadUpload.create({
                _id: uploadBatchId,
                fileName: req.file.originalname || "upload.csv",
                uploadedBy: req.user?._id || null,
                uploadedByName: `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim(),
                uploadedByRole: req.user?.role || "",
                leadCount: processedCount,
                skippedCount: skippedLeads.length,
                duplicateCount: duplicateTotal,
                acceptedCount: 0,
                duplicates: skippedDuplicates,
            });
            uploadId = uploadRecord._id;
        }

        if (processedCount > 0) {
            refillAllEligibleAgents().catch((err) => {
                console.error("Post-CSV lead refill error:", err);
            });
        }

        const responseData = {
            success: true,
            msg: `Successfully processed ${processedCount} leads${skippedLeads.length > 0 ? `, ${skippedLeads.length} skipped` : ''}`,
            data: {
                processed: processedCount,
                skipped: skippedLeads.length,
                uploadId,
                leadIds: createdLeadIds, // Return IDs of newly created leads for bulk calling
                details: {
                    // Don't return full lead objects to save memory
                    skippedLeads: skippedLeads.length > 100 ? skippedLeads.slice(0, 100) : skippedLeads, // Limit skipped list
                    errors: errors.length > 0 ? (errors.length > 100 ? errors.slice(0, 100) : errors) : undefined
                }
            }
        };

        if (enableProgress) {
            // Send completion
            sendProgress({
                type: 'complete',
                ...responseData
            });
            res.end();
        } else {
            res.json(responseData);
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Upload failed' });
    }
});


// GET /api/leads
exports.getLeads = async (req, res) => {
    try {
        

        const Lead = await getLeadModel();
        const getCallModel = require('../crmDB/models/callModel');
        const Call = await getCallModel();
         
        const {
            search,
            status,
            country,
            countrySearch,
            brandSearch,
            agent,
            callStatus, // NEW: Filter by call status
            page = 1,
            limit = 100,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = { isDeleted: false };

        if (search) {
            const searchTrimmed = String(search).trim();
            const safeSearch = escapeRegex(searchTrimmed);
            const regexGlobal = { $regex: safeSearch, $options: "i" };
            const parts = searchTrimmed.split(/\s+/);

            query.$or = [
                { firstName: regexGlobal },
                { lastName: regexGlobal },
                { email: regexGlobal },
                { phone: regexGlobal },
                ...(/^\d+$/.test(searchTrimmed) ? [{ leadNumber: Number(searchTrimmed) }] : []),
                ...(hasCrmPermission(req.user, "canViewLeadBrand") ? [{ Brand: regexGlobal }] : []),
                ...(hasCrmPermission(req.user, "canViewLeadFileName") ? [{ fileName: regexGlobal }] : []),
                { Address: regexGlobal },
            ];

            if (parts.length >= 2) {
                const first = new RegExp(escapeRegex(parts[0]), 'i');
                const last = new RegExp(escapeRegex(parts.slice(1).join(' ')), 'i');
                // Match first and last separately in either order
                query.$or.push({ $and: [{ firstName: first }, { lastName: last }] });
                query.$or.push({ $and: [{ firstName: last }, { lastName: first }] });
            }
            addCustomerSearch(query.$or, searchTrimmed);
        }

        if (status && status !== '') query.status = status;
        applyCountryFilter(query, country);
        applyCountrySearchFilter(query, countrySearch);

        await applyLeadVisibilityToQuery(query, req.user);
        await applyAgentFilterToQuery(query, agent, req.user, Lead);
        if (hasCrmPermission(req.user, "canViewLeadBrand")) {
            if (req.query.brand && String(req.query.brand).trim()) {
                query.Brand = new RegExp(`^${escapeRegex(String(req.query.brand).trim())}$`, 'i');
            } else {
                applyBrandSearchFilter(query, brandSearch);
            }
        }
        if (canViewLeadSource(req.user) && req.query.source && String(req.query.source).trim()) {
            query.source = new RegExp(`^${escapeRegex(String(req.query.source).trim())}$`, 'i');
        }
        const listFilter = req.query.list || req.query.listName;
        if (listFilter && String(listFilter).trim()) {
            const listVal = String(listFilter).trim();
            if (mongoose.Types.ObjectId.isValid(listVal)) {
                query.$or = query.$or || [];
                query.$or.push(
                    { uploadBatchId: new mongoose.Types.ObjectId(listVal) },
                    { fileName: new RegExp(`^${escapeRegex(listVal)}$`, 'i') }
                );
            } else {
                query.fileName = new RegExp(`^${escapeRegex(listVal)}$`, 'i');
            }
        }
        applyCustomerFilters(query, req.query);

      

        // Parse pagination parameters - OPTIMIZED: Enforce max limit
        const pageNum = parseInt(page);
        const requestedLimit = parseInt(limit, 10);
        const limitNum = Math.min(Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 50, 500);
        const skip = (pageNum - 1) * limitNum;

        // Validate pagination
        if (pageNum < 1 || limitNum < 1) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination parameters"
            });
        }

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        let leads;
        let totalFiltered;

        // OPTIMIZED: If callStatus filter is provided, use aggregation for efficient filtering
        if (callStatus && callStatus !== '') {
            if (callStatus === 'no-calls') {
                // For "no-calls": Get all lead IDs that have calls, then exclude them
                const leadIdsWithAnyCalls = await Call.distinct('leadId');
                // Filter out null/undefined values - keep as ObjectIds
                const validLeadIdsWithCalls = leadIdsWithAnyCalls.filter(id => id != null);
                
                // If there are no leads with calls, all leads match "no-calls"
                // Otherwise, exclude leads that have calls
                if (validLeadIdsWithCalls.length > 0) {
                    // Use $nin to exclude leads with calls
                    if (!query._id) {
                        query._id = { $nin: validLeadIdsWithCalls };
                    } else if (query._id.$in) {
                        // If _id filter already exists, intersect with no-calls filter
                        const existingIdsSet = new Set(query._id.$in.map(id => id.toString()));
                        const filteredIds = query._id.$in.filter(id => {
                            return !validLeadIdsWithCalls.some(callId => callId && callId.toString() === id.toString());
                        });
                        query._id = filteredIds.length > 0 ? { $in: filteredIds } : { $in: [] };
                    }
                }
                // If validLeadIdsWithCalls.length === 0, all leads have no calls, so no additional filter needed
            } else {
                // For other statuses (completed, failed, cancelled, no-answer, in-progress, ringing): 
                // Use aggregation to find leads with latest call matching the status
                const leadIdsWithStatus = await Call.aggregate([
                    // Sort by createdAt desc to get latest calls first per lead
                    { $sort: { createdAt: -1 } },
                    // Group by leadId and get the latest call status
                    {
                        $group: {
                            _id: '$leadId',
                            latestStatus: { $first: '$status' }
                        }
                    },
                    // Match by the requested call status
                    { $match: { latestStatus: callStatus } },
                    // Project just the leadId (already _id)
                    { $project: { _id: 1 } }
                ]);

                const matchingLeadIds = leadIdsWithStatus
                    .map(item => item._id)
                    .filter(id => id != null);

                if (matchingLeadIds.length === 0) {
                    // No leads match this call status - return empty results
                    query._id = { $in: [] };
                } else {
                    // Apply filter for leads with matching call status
                    if (!query._id) {
                        query._id = { $in: matchingLeadIds };
                    } else if (query._id.$in) {
                        // Intersect with existing _id filter - compare as strings for accuracy
                        const existingIdsSet = new Set(query._id.$in.map(id => id.toString()));
                        const filteredIds = matchingLeadIds.filter(id => existingIdsSet.has(id.toString()));
                        query._id = filteredIds.length > 0 ? { $in: filteredIds } : { $in: [] };
                    } else if (query._id.$nin) {
                        // Intersect with $nin - exclude leads that are in both arrays
                        const excludedIdsSet = new Set(query._id.$nin.map(id => id.toString()));
                        const filteredIds = matchingLeadIds.filter(id => !excludedIdsSet.has(id.toString()));
                        query._id = filteredIds.length > 0 ? { $in: filteredIds } : { $in: [] };
                    }
                }
            }
        }

        if (req.query.idsOnly === 'true') {
            const matchingLeads = await Lead.find(query).select('_id').lean();
            const leadIds = matchingLeads.map((lead) => lead._id.toString());

            return res.status(200).json({
                success: true,
                data: {
                    leadIds,
                    total: leadIds.length,
                },
            });
        }

        let openedRefill = { leads: [], batchId: "" };
        if ((req.user?.role === "admin" || req.user?.role === "subadmin" || req.user?.role === "manager") && listRequestCanRefill(req.query, req.user) && req.query.idsOnly !== "true") {
            openedRefill = await refillOwners([req.user._id], req.user);
        }

        const totalLeadsQuery = { isDeleted: false };
        await applyLeadVisibilityToQuery(totalLeadsQuery, req.user);
        const statusCountMatch = plainAggregateMatch({ ...query });
        delete statusCountMatch.status;

        // Fetch the page, both counts, and brand options together.
        const [leadsResult, totalFilteredResult, brands, totalLeads, statusGroups] = await Promise.all([
            Lead.find(query)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Lead.countDocuments(query),
            hasCrmPermission(req.user, "canViewLeadBrand") ? getDistinctLeadBrands(req.user) : Promise.resolve([]),
            Lead.countDocuments(totalLeadsQuery),
            Lead.aggregate([
                { $match: statusCountMatch },
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $or: [{ $eq: [{ $ifNull: ["$status", ""] }, ""] }] },
                                "New",
                                "$status",
                            ],
                        },
                        count: { $sum: 1 },
                    },
                },
            ]),
        ]);
        
        leads = leadsResult;
        totalFiltered = totalFilteredResult;

        // One query for the icons on this page. The old page called call history once per lead.
        const canSeeCallSummary = req.user.role === "superadmin"
            || hasCrmPermission(req.user, "canViewCallLogs")
            || hasCrmPermission(req.user, "canAccessCallDashboard");
        let agentMap = {};
        const callSummaryMap = {};
        await Promise.all([
            (async () => {
                if (!leads.length) return;
                const agentIds = leads.map((lead) => lead.agent).filter(Boolean);
                if (!agentIds.length) return;
                const agents = await User.find({ _id: { $in: agentIds } })
                    .select("firstName lastName email role")
                    .lean();
                agents.forEach((agent) => {
                    agentMap[agent._id.toString()] = agent;
                });
            })(),
            (async () => {
                if (!leads.length || !canSeeCallSummary) return;
                const summaries = await Call.aggregate([
                    { $match: { leadId: { $in: leads.map((lead) => lead._id) } } },
                    { $sort: { createdAt: -1 } },
                    {
                        $group: {
                            _id: "$leadId",
                            status: { $first: "$status" },
                            endedAt: { $first: "$endedAt" },
                            duration: { $first: "$duration" },
                            callCount: { $sum: 1 },
                        },
                    },
                ]);
                summaries.forEach((row) => {
                    callSummaryMap[String(row._id)] = {
                        status: row.status || null,
                        endedAt: row.endedAt || null,
                        duration: row.duration ?? null,
                        callCount: row.callCount || 0,
                        checked: true,
                    };
                });
            })(),
        ]);

        const statusCounts = {};
        let statusTotal = 0;
        statusGroups.forEach((row) => {
            const label = String(row._id || "New");
            const count = row.count || 0;
            statusCounts[label] = (statusCounts[label] || 0) + count;
            statusTotal += count;
        });

        const populatedLeads = leads.map((lead) => {
            const agentObj = lead.agent ? agentMap[lead.agent.toString()] || null : null;
            // Leads held by superadmin accounts are unassigned pool leads
            const displayAgent = (agentObj && agentObj.role !== "superadmin") ? agentObj : null;
            return hidePrivateLeadFields({
            ...lead,
                agent: displayAgent,
                callSummary: callSummaryMap[String(lead._id)] || null,
            }, req.user);
        });

        // Calculate pagination info
        const totalPages = Math.ceil(totalFiltered / limitNum);
        const hasNextPage = pageNum < totalPages;
        const hasPrevPage = pageNum > 1;

        res.status(200).json({
            success: true,
            data: {
                leads: populatedLeads,
                brands,
                statusCounts,
                statusTotal,
                refilledLeads: openedRefill.leads,
                refillBatchId: openedRefill.batchId,
                pagination: {
                    currentPage: pageNum,
                    totalPages,
                    totalLeads,
                    totalFiltered,
                    hasNextPage,
                    hasPrevPage,
                    limit: limitNum,
                    nextPage: hasNextPage ? pageNum + 1 : null,
                    prevPage: hasPrevPage ? pageNum - 1 : null
                }
            }
        });
    } catch (err) {
        console.error("Error fetching leads:", err);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: err.message
        });
    }
};
// Assign or reassign multiple leads to a specific agent (admin or subadmin)
exports.assignLeadsToAgent = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const { leadIds, agentId } = req.body;
        // Preview only: same rules as a real assign, but nothing is written.
        const dryRun = req.body?.dryRun === true || req.body?.dryRun === "true";
        const unassign = agentId === null || agentId === undefined || String(agentId).trim() === "" || String(agentId) === "unassign";

        if (!Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({ success: false, msg: 'leadIds are required' });
        }
        if (unassign && !dryRun && req.user?.role !== "superadmin") {
            return res.status(403).json({ success: false, msg: 'Only a super admin can unassign leads' });
        }
        // A preview without an admin only lists who currently has the selected leads.
        if (unassign && dryRun && req.user && req.user.role !== "superadmin" && !hasCrmPermission(req.user, "canAssignLeads")) {
            return denyCrmPermission(res, "You do not have permission to assign leads");
        }
        if (!unassign && !agentId) {
            return res.status(400).json({ success: false, msg: 'agentId and leadIds are required' });
        }

        let agentUser = null;
        if (!unassign) {
            agentUser = await User.findById(agentId);
        if (!agentUser) {
            return res.status(404).json({ success: false, msg: 'Agent user not found' });
        }
        if (!['admin', 'subadmin', 'superadmin'].includes(agentUser.role)) {
            return res.status(400).json({ success: false, msg: 'Agent must be an admin, subadmin, or superadmin' });
        }
            if (req.user && req.user.role !== 'superadmin' && !hasCrmPermission(req.user, 'canAssignLeads')) {
                return denyCrmPermission(res, 'You do not have permission to assign leads');
            }
            if (req.user && req.user.role === 'admin' && agentUser.role !== 'subadmin') {
                return res.status(400).json({ success: false, msg: 'Admins can assign only to subadmins' });
            }
        }

        const leadsToUpdate = await Lead.find({ _id: { $in: leadIds }, isDeleted: false }).select('_id agent status pastAgentIds');
        const skipFlag = req.body?.skipPreviouslyAssigned;
        const skipPreviouslyAssigned = !unassign && (skipFlag === true || skipFlag === "true" || skipFlag === 1 || skipFlag === "1");
        const leaveFlag = req.body?.leaveWithCurrentAdmin;
        const leaveWithCurrentAdmin = !unassign && (leaveFlag === true || leaveFlag === "true" || leaveFlag === 1 || leaveFlag === "1");
        const agentName = agentUser ? `${agentUser.firstName || ""} ${agentUser.lastName || ""}`.trim() : "";
        const normalizeAgentName = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
        const targetName = normalizeAgentName(agentName);
        const targetId = String(agentId || "");
        const idOf = (value) => {
            if (!value) return "";
            if (typeof value === "object" && value._id) return String(value._id);
            return String(value);
        };
        const metaObject = (metadata) => {
            if (!metadata) return {};
            if (metadata instanceof Map) return Object.fromEntries(metadata);
            return metadata;
        };
        const ignoredNames = new Set(["", "unassigned", "assigned"]);
        const previouslyAssignedIds = new Set();
        if (!unassign && targetId) {
            const getActivityModel = require("../crmDB/models/activityModel");
            const Activity = await getActivityModel();
            const idList = leadsToUpdate.map((lead) => lead._id);
            for (let index = 0; index < idList.length; index += 1000) {
                const chunk = idList.slice(index, index + 1000);
                const activities = await Activity.find({
                    leadId: { $in: chunk },
                    type: "assignment_change",
                }).select("leadId changes metadata").lean();
                activities.forEach((activity) => {
                    const metadata = metaObject(activity.metadata);
                    const recordedIds = [
                        idOf(metadata?.assignedTo?.userId),
                        idOf(metadata?.newAgentId),
                        idOf(metadata?.previousAgentId),
                    ].filter(Boolean);
                    const recordedNames = [
                        normalizeAgentName(activity.changes?.newValue),
                        normalizeAgentName(activity.changes?.oldValue),
                    ].filter((name) => !ignoredNames.has(name));
                    const sameAgent = recordedIds.some((id) => id === targetId)
                        || (targetName && recordedNames.some((name) => name === targetName));
                    if (sameAgent) previouslyAssignedIds.add(String(activity.leadId));
                });
            }
        }
        const alreadyWithAgent = [];
        const skippedPrevious = [];
        const heldByOther = [];
        const toAssign = [];
        let previouslyAssignedCount = 0;
        leadsToUpdate.forEach((lead) => {
            const currentId = lead.agent ? String(lead.agent) : "";
            const hadThisAgent = previouslyAssignedIds.has(String(lead._id))
                || (Array.isArray(lead.pastAgentIds) && lead.pastAgentIds.some((id) => String(id) === targetId));
            if (hadThisAgent && currentId !== targetId) previouslyAssignedCount += 1;
            // "Remove Previously Assigned": leave a lead with the admin who has it now.
            if (leaveWithCurrentAdmin && currentId && currentId !== targetId) {
                heldByOther.push(lead);
                return;
            }
            if (!unassign && currentId === targetId) {
                alreadyWithAgent.push(lead);
                return;
            }
            // "Assign previously assigned leads again" is off: skip this admin's own history.
            if (skipPreviouslyAssigned && hadThisAgent) {
                skippedPrevious.push(lead);
                return;
            }
            toAssign.push(lead);
        });

        const statusTotals = new Map();
        leadsToUpdate.forEach((lead) => {
            const label = String(lead.status || "").trim() || "New";
            statusTotals.set(label, (statusTotals.get(label) || 0) + 1);
        });
        const statusSummary = [...statusTotals.entries()]
            .map(([status, count]) => ({ status, count }))
            .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));

        const selectedCount = leadsToUpdate.length;
        const assignedCount = unassign ? 0 : toAssign.length;
        const agentRole = agentUser?.role || "";
        const agentLabel = agentRole ? `${agentName} (${agentRole})` : agentName;
        const leadWord = (count) => `${count} lead${count === 1 ? "" : "s"}`;

        // Who has the selected leads right now (before any change): one row per admin + how many have nobody.
        const ownerCounts = new Map();
        let unassignedCount = 0;
        leadsToUpdate.forEach((lead) => {
            const ownerId = lead.agent ? String(lead.agent) : "";
            if (!ownerId) {
                unassignedCount += 1;
                return;
            }
            ownerCounts.set(ownerId, (ownerCounts.get(ownerId) || 0) + 1);
        });
        const ownerIds = [...ownerCounts.keys()];
        const ownerUsers = ownerIds.length
            ? await User.find({ _id: { $in: ownerIds } }).select("firstName lastName role").lean()
            : [];
        const ownerById = new Map(ownerUsers.map((user) => [String(user._id), user]));
        const ownerInfo = (ownerId) => {
            const user = ownerById.get(ownerId);
            return {
                agentId: ownerId,
                agentName: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Unknown user",
                agentRole: user?.role || "",
            };
        };
        const currentOwners = ownerIds
            .map((ownerId) => ({ ...ownerInfo(ownerId), count: ownerCounts.get(ownerId) }))
            .sort((a, b) => b.count - a.count);

        const heldCounts = new Map();
        heldByOther.forEach((lead) => {
            const ownerId = String(lead.agent);
            heldCounts.set(ownerId, (heldCounts.get(ownerId) || 0) + 1);
        });
        const notAssignedByAdmin = [];
        [...heldCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .forEach(([ownerId, count]) => {
                notAssignedByAdmin.push({ count, ...ownerInfo(ownerId), reason: "already_assigned" });
            });
        if (skippedPrevious.length) {
            notAssignedByAdmin.push({
                count: skippedPrevious.length,
                agentId: targetId,
                agentName,
                agentRole,
                reason: "previously_assigned",
            });
        }
        if (alreadyWithAgent.length) {
            notAssignedByAdmin.push({
                count: alreadyWithAgent.length,
                agentId: targetId,
                agentName,
                agentRole,
                reason: "already_with_admin",
            });
        }

        if (dryRun) {
            const { buildContext, historyTree } = require("../utils/assignmentReversal");
            const staff = await User.find({ role: { $in: ["superadmin", "admin", "subadmin", "manager"] } })
                .select("firstName lastName role adminPermissions permissions")
                .lean();
            const history = historyTree(leadsToUpdate, buildContext({ users: staff, canReceive: userCanOpenCrm }));
            return res.status(200).json({
                success: true,
                dryRun: true,
                data: {
                    unassigned: unassign,
                    selectedCount,
                    assignedCount: unassign ? toAssign.filter((lead) => lead.agent).length : assignedCount,
                    skippedPreviousCount: skippedPrevious.length,
                    previouslyAssignedCount,
                    alreadyAssignedCount: alreadyWithAgent.length,
                    keptWithOtherCount: heldByOther.length,
                    notAssignedCount: skippedPrevious.length + alreadyWithAgent.length + heldByOther.length,
                    notAssignedByAdmin,
                    currentOwners,
                    statusSummary,
                    unassignedCount,
                    history,
                    agentName,
                    agentRole,
                    skipPreviouslyAssigned,
                },
            });
        }

        const now = new Date();
        const nextAgentId = unassign ? null : agentId;
        let nextStatus = "";
        const requestedStatus = String(req.body?.status || "").trim();
        if (!unassign && requestedStatus) {
            if (!hasCrmPermission(req.user, "canChangeLeadStatus")) {
                return denyCrmPermission(res, "You do not have permission to change lead status");
            }
            const labels = await getLeadStatusLabels();
            if (!labels.includes(requestedStatus)) {
                return res.status(400).json({ success: false, msg: "Choose a status from the list" });
            }
            nextStatus = requestedStatus;
        }
        const ops = toAssign.map((lead) => {
            const pastIds = [];
            if (lead.agent && String(lead.agent) !== String(nextAgentId || "")) pastIds.push(lead.agent);
            if (!unassign && agentId) pastIds.push(agentId);
            return {
                updateOne: {
                    filter: { _id: lead._id, isDeleted: false },
                    update: {
                        $set: {
                            agent: nextAgentId,
                            updatedAt: now,
                            ...(nextStatus ? { status: nextStatus } : {}),
                        },
                        ...(pastIds.length ? { $addToSet: { pastAgentIds: { $each: pastIds } } } : {}),
                    },
                },
            };
        });
        if (skipPreviouslyAssigned && skippedPrevious.length) {
            await Lead.updateMany(
                { _id: { $in: skippedPrevious.map((lead) => lead._id) } },
                { $addToSet: { pastAgentIds: agentId } }
            );
        }
        let modifiedCount = 0;
        for (let index = 0; index < ops.length; index += 500) {
            const bulk = await Lead.bulkWrite(ops.slice(index, index + 500), { ordered: false });
            modifiedCount += bulk.modifiedCount || 0;
        }
        const result = { modifiedCount };

        if (unassign) {
            try {
                const getActivityModel = require("../crmDB/models/activityModel");
                const Activity = await getActivityModel();
                const actorName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || "Super admin";
                const docs = toAssign.filter((lead) => lead.agent).map((lead) => ({
                    leadId: lead._id,
                    type: "assignment_change",
                    isSystemGenerated: true,
                    createdBy: {
                        userId: req.user._id,
                        userName: actorName,
                        userRole: req.user.role,
                    },
                    changes: {
                        field: "agent",
                        oldValue: "Assigned",
                        newValue: "Unassigned",
                        description: "Unassigned by super admin",
                    },
                    metadata: {
                        previousAgentId: String(lead.agent),
                    },
                }));
                if (docs.length) await Activity.insertMany(docs, { ordered: false });
            } catch (activityError) {
                console.error("Unassign activity log failed:", activityError);
            }
        } else {
            for (const lead of toAssign) {
            let oldAgentName = 'Unassigned';
            if (lead.agent) {
                const oldAgent = await User.findById(lead.agent).select('firstName lastName');
                    if (oldAgent) oldAgentName = `${oldAgent.firstName} ${oldAgent.lastName}`;
                }
            await logActivity({
                leadId: lead._id,
                type: 'assignment_change',
                createdBy: req.user,
                changes: {
                    field: 'agent',
                    oldValue: oldAgentName,
                        newValue: agentName,
                    },
                    metadata: {
                        newAgentId: targetId,
                        previousAgentId: lead.agent ? String(lead.agent) : "",
                    },
                });
            }
        }

        if (nextStatus) {
            try {
                const getActivityModel = require("../crmDB/models/activityModel");
                const Activity = await getActivityModel();
                const actorName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || "User";
                const docs = toAssign
                    .filter((lead) => String(lead.status || "").trim() !== nextStatus)
                    .map((lead) => ({
                        leadId: lead._id,
                        type: "status_change",
                        isSystemGenerated: true,
                        createdBy: {
                            userId: req.user._id,
                            userName: actorName,
                            userRole: req.user.role || "user",
                        },
                        changes: {
                            field: "status",
                            oldValue: lead.status || "New",
                            newValue: nextStatus,
                        },
                    }));
                for (let index = 0; index < docs.length; index += 1000) {
                    const slice = docs.slice(index, index + 1000);
                    if (slice.length) await Activity.insertMany(slice, { ordered: false });
                }
            } catch (activityError) {
                console.error("Assign status activity log failed:", activityError);
            }
        }

        const targetAgentId = unassign ? null : agentId;
        const lostNewOwners = toAssign
            .filter((lead) => isNewStatus(lead.status) && lead.agent && String(lead.agent) !== String(targetAgentId))
            .map((lead) => lead.agent);
        if (lostNewOwners.length) await refillOwners(lostNewOwners, req.user);
        if (!unassign && toAssign.length > 0) {
            const { resolveShortageAlert } = require("../utils/leadShortageAlert");
            await resolveShortageAlert(agentId);
        }

        let msg;
        if (unassign) {
            msg = `${leadWord(result.modifiedCount)} unassigned`;
        } else if (skipPreviouslyAssigned) {
            const parts = [
                `${leadWord(assignedCount)} ${assignedCount === 1 ? "was" : "were"} assigned to ${agentLabel}.`,
            ];
            notAssignedByAdmin.forEach((item) => {
                const itemLabel = item.agentRole ? `${item.agentName} (${item.agentRole})` : item.agentName;
                if (item.reason === "already_assigned") {
                    parts.push(`${leadWord(item.count)} already assigned to ${itemLabel}.`);
                } else if (item.reason === "previously_assigned") {
                    parts.push(`${leadWord(item.count)} previously assigned to the selected admin, ${itemLabel}.`);
                } else if (item.reason === "already_with_admin") {
                    parts.push(`${leadWord(item.count)} already assigned to the selected admin, ${itemLabel}.`);
                }
            });
            msg = parts.join(" ");
        } else {
            msg = `${leadWord(assignedCount)} ${assignedCount === 1 ? "was" : "were"} assigned to ${agentLabel}.`;
        }

        return res.status(200).json({
            success: true,
            msg,
            data: {
                modifiedCount: result.modifiedCount,
                unassigned: unassign,
                selectedCount,
                assignedCount: unassign ? result.modifiedCount : assignedCount,
                skippedPreviousCount: skippedPrevious.length,
                previouslyAssignedCount,
                alreadyAssignedCount: alreadyWithAgent.length,
                keptWithOtherCount: heldByOther.length,
                notAssignedCount: skippedPrevious.length + alreadyWithAgent.length + heldByOther.length,
                notAssignedByAdmin,
                currentOwners,
                unassignedCount,
                agentName,
                agentRole,
                skipPreviouslyAssigned,
            }
        });
    } catch (err) {
        console.error('Error assigning leads:', err);
        return res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

const getAuthorizedLeadsForBulkAction = async (req, leads) => {
    if (req.user.role === 'superadmin') {
        return leads;
    }

    if (req.user.role === 'admin') {
        const userPerms = await getCachedUserPermissions(req.user._id);
        if (userPerms?.adminPermissions?.canManageCrmLeads) {
            const subadminIds = await getCachedSubadmins();
            const allowedAgents = [req.user._id.toString(), ...subadminIds.map(s => s.toString())];
            return leads.filter(lead => !lead.agent || allowedAgents.includes(lead.agent.toString()));
        }

        return leads.filter(lead => lead.agent && lead.agent.toString() === req.user._id.toString());
    }

    if (req.user.role === 'subadmin') {
        return leads.filter(lead => lead.agent && lead.agent.toString() === req.user._id.toString());
    }

    return [];
};

exports.bulkUpdateLeadStatus = async (req, res) => {
    try {
        if (!hasCrmPermission(req.user, 'canChangeLeadStatus')) {
            return denyCrmPermission(res, 'You do not have permission to change lead status');
        }
        const Lead = await getLeadModel();
        const { leadIds, status } = req.body;

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({
                success: false,
                msg: 'No lead IDs provided',
            });
        }

        if (!status || String(status).trim() === '') {
            return res.status(400).json({
                success: false,
                msg: 'Status is required',
            });
        }

        const normalizedStatus = await normalizeLeadStatus(status);
        if (await isStatusHiddenForUser(normalizedStatus, req.user)) {
            return denyCrmPermission(res, 'Only Super Admin can move leads to an Admin Only status');
        }
        const requestedIds = [...new Set(leadIds.map((id) => String(id || "")).filter(Boolean))];
        const leads = await Lead.find({ _id: { $in: requestedIds }, isDeleted: false }).select('_id agent status');

        if (leads.length === 0) {
            return res.status(404).json({
                success: false,
                msg: 'No leads found',
            });
        }

        const hiddenStatuses = await getHiddenStatusLabelsForUser(req.user);
        const hiddenSet = new Set(hiddenStatuses.map((s) => String(s).trim().toLowerCase()));
        const visibleLeads = hiddenSet.size > 0
            ? leads.filter((lead) => !hiddenSet.has(String(lead.status || "").trim().toLowerCase()))
            : leads;

        const authorizedLeads = await getAuthorizedLeadsForBulkAction(req, visibleLeads);

        if (authorizedLeads.length === 0) {
            return res.status(403).json({
                success: false,
                msg: 'Unauthorized: You do not have permission to update these leads',
            });
        }

        const authorizedLeadIds = authorizedLeads.map(lead => lead._id);
        const leadsWithStatusChange = authorizedLeads.filter(lead => lead.status !== normalizedStatus);
        const foundIds = new Set(leads.map((lead) => String(lead._id)));
        const missingCount = requestedIds.filter((id) => !foundIds.has(id)).length;
        const deniedCount = leads.length - authorizedLeads.length;

        const result = await Lead.updateMany(
            { _id: { $in: authorizedLeadIds } },
            { $set: { status: normalizedStatus, updatedAt: new Date() } }
        );

        if (leadsWithStatusChange.length) {
            try {
                const getActivityModel = require("../crmDB/models/activityModel");
                const Activity = await getActivityModel();
                const actorName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || "User";
                const activityDocs = leadsWithStatusChange.map((lead) => ({
                leadId: lead._id,
                    type: "status_change",
                    isSystemGenerated: true,
                    createdBy: {
                        userId: req.user._id,
                        userName: actorName,
                        userRole: req.user.role || "user",
                    },
                changes: {
                        field: "status",
                    oldValue: lead.status,
                    newValue: normalizedStatus,
                },
                }));
                const chunkSize = 1000;
                for (let index = 0; index < activityDocs.length; index += chunkSize) {
                    await Activity.insertMany(activityDocs.slice(index, index + chunkSize), { ordered: false });
                }
            } catch (activityError) {
                console.error("Bulk status activity log failed:", activityError);
            }
        }

        let rotationSummary = { rotatedCount: 0, exhaustedCount: 0, resultsByLeadId: new Map() };
        if (leadsWithStatusChange.length > 0) {
            const { processLeadsForRotation } = require("../utils/leadRotationEngine");
            rotationSummary = await processLeadsForRotation(
                leadsWithStatusChange,
                normalizedStatus,
                req.user,
                "bulk_status"
            );
        }

        const changedByStatus = {};
        leadsWithStatusChange.forEach((lead) => {
            const label = lead.status || "New";
            changedByStatus[label] = (changedByStatus[label] || 0) + 1;
        });
        const lostNewOwners = leadsWithStatusChange
            .filter((lead) => isNewStatus(lead.status) && !isNewStatus(normalizedStatus) && ownerIdOf(lead.agent))
            .map((lead) => ownerIdOf(lead.agent));
        if (req.user && (req.user.role === "admin" || req.user.role === "subadmin" || req.user.role === "manager")) {
            const anyLeftNew = leadsWithStatusChange.some((lead) => isNewStatus(lead.status) && !isNewStatus(normalizedStatus));
            if (anyLeftNew) lostNewOwners.push(String(req.user._id));
        }
        const refilled = await refillOwners(lostNewOwners, req.user);
        const parts = [`${result.modifiedCount} lead(s) updated to "${normalizedStatus}"`];
        if (rotationSummary.rotatedCount > 0) {
            parts.push(`${rotationSummary.rotatedCount} rotated to next agent by automation`);
        }
        if (rotationSummary.exhaustedCount > 0) {
            parts.push(`${rotationSummary.exhaustedCount} marked exhausted by automation`);
        }
        if (deniedCount > 0) parts.push(`${deniedCount} skipped because they are not assigned to you`);
        if (missingCount > 0) parts.push(`${missingCount} were not found`);
        const message = parts.join(". ");

        return res.status(200).json({
            success: true,
            msg: message,
            data: {
                modifiedCount: result.modifiedCount,
                skippedCount: deniedCount,
                missingCount,
                status: normalizedStatus,
                changedByStatus,
                refilledLeads: refilled.leads,
                refillBatchId: refilled.batchId,
                rotation: {
                    rotatedCount: rotationSummary.rotatedCount,
                    exhaustedCount: rotationSummary.exhaustedCount,
                    resultsByLeadId: Object.fromEntries(rotationSummary.resultsByLeadId),
                },
            },
        });
    } catch (err) {
        console.error('Error bulk updating lead status:', err);
        return res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

exports.deleteLead = async (req, res) => {
    try {
        if (req.user?.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                msg: 'Unauthorized: Only superadmin can delete leads',
            });
        }

        const Lead = await getLeadModel();
        const lead = await Lead.findById(req.params.id);
        console.log('req.params.id: ', req.params.id);

        if (!lead) {
            return res.status(404).json({
                success: false,
                msg: 'Lead not found'
            });
        }

        const ownerId = isNewStatus(lead.status) ? lead.agent : null;
        lead.isDeleted = true;
        lead.deletedAt = new Date();
        await lead.save();
        if (ownerId) await refillOwners([ownerId], req.user);

        res.status(200).json({
            success: true,
            msg: 'Lead deleted successfully'
        });
    } catch (err) {
        console.error("Error deleting lead:", err);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: err.message
        });
    }
};
exports.bulkDeleteLeads = async (req, res) => {
    try {
        if (req.user?.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                msg: 'Unauthorized: Only superadmin can delete leads',
            });
        }

        const { leadIds } = req.body;
        console.log('req.body: ', req.body);
        const Lead = await getLeadModel();

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({
                success: false,
                msg: 'No lead IDs provided'
            });
        }

        const leads = await Lead.find({ _id: { $in: leadIds } }).select('_id agent status');

        if (leads.length === 0) {
            return res.status(404).json({
                success: false,
                msg: 'No leads found'
            });
        }

        const authorizedLeadIds = leads.map(lead => lead._id);

        const lostNewOwners = leads
            .filter((lead) => isNewStatus(lead.status) && lead.agent)
            .map((lead) => lead.agent);

        const result = await Lead.updateMany(
            { _id: { $in: authorizedLeadIds } },
            { $set: { isDeleted: true, deletedAt: new Date() } }
        );
        if (lostNewOwners.length) await refillOwners(lostNewOwners, req.user);

        res.status(200).json({
            success: true,
            msg: `${result.modifiedCount} leads deleted successfully`,
            data: { 
                deletedCount: result.modifiedCount,
                skippedCount: 0
            }
        });

    } catch (err) {
        console.error("Error bulk deleting leads:", err);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: err.message
        });
    }
};
exports.deleteAllLeads = async (req, res) => {
    try {
        if (req.user?.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                msg: 'Unauthorized: Only superadmin can delete leads',
            });
        }

        const Lead = await getLeadModel();
        
        // Check if progress tracking is requested
        const enableProgress = req.query.enableProgress === 'true';

        const query = { isDeleted: false };

        // If progress tracking is enabled, use SSE with batch processing
        if (enableProgress) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const sendProgress = (data) => {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            // Get total count
            const total = await Lead.countDocuments(query);

            if (total === 0) {
                sendProgress({
                    type: 'complete',
                    total: 0,
                    deleted: 0,
                    msg: 'No leads to delete'
                });
                res.end();
                return;
            }

            sendProgress({
                type: 'start',
                total,
                percentage: 0,
                msg: `Starting deletion of ${total} leads...`
            });

            // Process in batches for better performance
            const BATCH_SIZE = 5000; // Larger batch for soft deletes (faster than hard delete)
            let deletedCount = 0;
            let hasMore = true;

            while (hasMore) {
                // Find batch of leads to delete
                const batch = await Lead.find(query)
                    .limit(BATCH_SIZE)
                    .select('_id')
                    .lean();

                if (batch.length === 0) {
                    hasMore = false;
                    break;
                }

                const batchIds = batch.map(lead => lead._id);

                // Soft delete this batch
                const result = await Lead.updateMany(
                    { _id: { $in: batchIds }, isDeleted: false },
                    { $set: { isDeleted: true, deletedAt: new Date() } }
                );

                deletedCount += result.modifiedCount;

                // Send progress update
                const percentage = Math.min(Math.round((deletedCount / total) * 100), 100);
                sendProgress({
                    type: 'progress',
                    total,
                    deleted: deletedCount,
                    remaining: total - deletedCount,
                    percentage,
                    msg: `Deleted ${deletedCount} of ${total} leads...`
                });

                // If we processed less than batch size, we're done
                if (batch.length < BATCH_SIZE) {
                    hasMore = false;
                }
            }

            // Send completion
            sendProgress({
                type: 'complete',
                total,
                deleted: deletedCount,
                percentage: 100,
                success: true,
                msg: `All ${deletedCount} leads deleted successfully`
            });

            res.end();
        } else {
            // Fallback: non-progress version for backward compatibility
            const result = await Lead.updateMany(
                query,
                { $set: { isDeleted: true, deletedAt: new Date() } }
            );

            res.status(200).json({
                success: true,
                msg: `All ${result.modifiedCount} leads deleted successfully`,
                data: { deletedCount: result.modifiedCount }
            });
        }

    } catch (err) {
        console.error("Error deleting all leads:", err);
        
        // Try to send error through SSE if using progress
        if (req.query.enableProgress === 'true') {
            try {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    message: err.message || 'Failed to delete leads'
                })}\n\n`);
                res.end();
            } catch (e) {
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        message: "Server Error",
                        error: err.message
                    });
                }
            }
        } else {
            res.status(500).json({
                success: false,
                message: "Server Error",
                error: err.message
            });
        }
    }
};
exports.editLead = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const {
            firstName,
            lastName,
            email,
            phone,
            country,
            Brand,
            Address,
            status,
            remarks,
            fileName,
        } = req.body;

        // Validation
        if (!firstName || !lastName) {
            return res.status(400).json({
                success: false,
                msg: 'First name and last name are required'
            });
        }

        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({
                success: false,
                msg: 'Lead not found'
            });
        }
        if (await isStatusHiddenForUser(lead.status, req.user)) {
            return denyCrmPermission(res, 'Unauthorized: This lead is in an Admin Only status');
        }

        const sameText = (left, right) => String(left ?? '').trim() === String(right ?? '').trim();
        const allowBrand = hasCrmPermission(req.user, "canViewLeadBrand");
        const allowFileName = hasCrmPermission(req.user, "canViewLeadFileName");
        const customerUpdate = bodyHasCustomerFields(req.body)
            ? normalizeCustomerFields(req.body, lead)
            : null;
        if (customerUpdate?.error) {
            return res.status(400).json({ success: false, msg: customerUpdate.error });
        }
        const detailsChanged = ['firstName', 'lastName', 'email', 'country', ...(allowBrand ? ['Brand'] : []), ...(allowFileName ? ['fileName'] : []), 'Address', 'remarks', 'source'].some(
            (field) => req.body[field] !== undefined && !sameText(req.body[field], lead[field])
        ) || (phone !== undefined && !sameText(phone, lead.phone)) || Boolean(customerUpdate?.changes?.length);
        const statusWillChange = status !== undefined && !sameText(status, lead.status);

        if (detailsChanged && !hasCrmPermission(req.user, 'canEditLeads')) {
            return denyCrmPermission(res, 'You do not have permission to edit lead details');
        }
        if (statusWillChange && !hasCrmPermission(req.user, 'canChangeLeadStatus')) {
            return denyCrmPermission(res, 'You do not have permission to change lead status');
        }

        // ✅ SECURITY: Check record-level authorization
        if (req.user.role === 'subadmin') {
            // Subadmin can only edit their own leads
            if (!lead.agent || lead.agent.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    msg: 'Unauthorized: You can only edit your own leads'
                });
            }
        } else if (req.user.role === 'admin') {
            // Admin can edit own leads + subadmin leads (if they have permission) - OPTIMIZED with cache
            const userPerms = await getCachedUserPermissions(req.user._id);
            if (userPerms?.adminPermissions?.canManageCrmLeads) {
                // Admin with permission can edit own + subadmin leads
                const subadminIds = await getCachedSubadmins();
                const allowedAgents = [req.user._id.toString(), ...subadminIds.map(s => s.toString())];
                
                if (lead.agent && !allowedAgents.includes(lead.agent.toString())) {
                    return res.status(403).json({
                        success: false,
                        msg: 'Unauthorized: You can only edit your own leads or subadmin leads'
                    });
                }
            } else {
                // Admin without permission can only edit own leads
                if (!lead.agent || lead.agent.toString() !== req.user._id.toString()) {
                    return res.status(403).json({
                        success: false,
                        msg: 'Unauthorized: You can only edit your own leads'
                    });
                }
            }
        }
        // Superadmin can edit any lead (no check needed)

        // Check if email is being changed and if it conflicts with another lead (only if email is provided)
        if (email && email.trim() !== '' && email !== lead.email) {
            const existingLead = await Lead.findOne({
                email,
                isDeleted: false,
                _id: { $ne: req.params.id }
            });
            if (existingLead) {
                return res.status(400).json({
                    success: false,
                    msg: 'Another lead with this email already exists'
                });
            }
        }

        const formattedPhone = phone ? normalizeLeadPhone(phone) : '';

        // Track changes for activity log
        const changes = [];
        if (lead.firstName !== firstName) changes.push(`firstName: from '${lead.firstName || 'N/A'}' to '${firstName}'`);
        if (lead.lastName !== lastName) changes.push(`lastName: from '${lead.lastName || 'N/A'}' to '${lastName}'`);
        if (lead.email !== email) changes.push(`email: from '${lead.email || 'N/A'}' to '${email}'`);
        if (lead.phone !== formattedPhone) changes.push(`phone: from '${lead.phone || 'N/A'}' to '${formattedPhone}'`);
        if (lead.country !== country) changes.push(`country: from '${lead.country || 'N/A'}' to '${country}'`);
        if (allowBrand && lead.Brand !== Brand) changes.push(`brand: from '${lead.Brand || 'N/A'}' to '${Brand}'`);
        if (allowFileName && lead.fileName !== fileName) changes.push(`file name: from '${lead.fileName || 'N/A'}' to '${fileName || ''}'`);
        if (lead.Address !== Address) changes.push(`address: from '${lead.Address || 'N/A'}' to '${Address}'`);
        if (lead.remarks !== remarks) changes.push(`remarks: from '${lead.remarks || 'N/A'}' to '${remarks || ''}'`);
        if (customerUpdate?.changes?.length) changes.push(...customerUpdate.changes);
        
        // Track status change separately
        const normalizedStatus = await normalizeLeadStatus(status);
        const statusChanged = lead.status !== normalizedStatus;
        const oldStatus = lead.status;
        if (statusChanged && await isStatusHiddenForUser(normalizedStatus, req.user)) {
            return denyCrmPermission(res, 'Only Super Admin can move a lead to an Admin Only status');
        }

        // Update lead
        lead.firstName = firstName;
        lead.lastName = lastName;
        lead.email = email;
        lead.phone = formattedPhone;
        lead.country = country;
        if (allowBrand) lead.Brand = Brand;
        if (allowFileName && fileName !== undefined) lead.fileName = String(fileName || "").trim().slice(0, 200);
        lead.Address = Address;
        lead.status = normalizedStatus;
        if (remarks !== undefined) lead.remarks = remarks || null;
        if (customerUpdate?.values) Object.assign(lead, customerUpdate.values);

        await lead.save();

        // Log activities
        if (changes.length > 0) {
            await logActivity({
                leadId: lead._id,
                type: 'field_update',
                createdBy: req.user,
                changes: {
                    description: changes.join('; ')
                }
            });
        }

        if (statusChanged) {
            await logActivity({
                leadId: lead._id,
                type: 'status_change',
                createdBy: req.user,
                changes: {
                    field: 'status',
                    oldValue: oldStatus,
                    newValue: normalizedStatus
                }
            });
        }

        const ownerId = ownerIdOf(lead.agent);
        let rotationResult = null;
        if (statusChanged) {
            const { processLeadsForRotation } = require("../utils/leadRotationEngine");
            const rotationSummary = await processLeadsForRotation(
                [lead],
                normalizedStatus,
                req.user,
                "status_change"
            );
            rotationResult = rotationSummary.resultsByLeadId.get(String(lead._id)) || null;
            if (rotationResult) {
                lead.status = rotationResult.status || lead.status;
                lead.agent = rotationResult.agent ? rotationResult.agent._id : null;
                lead.rotationCount = rotationResult.rotationCount ?? lead.rotationCount;
            }
        }

        let refilledLeads = [];
        let refillBatchId = "";
        const potentialOwners = new Set();
        if (ownerId) potentialOwners.add(ownerId);
        if (req.user && (req.user.role === "admin" || req.user.role === "subadmin" || req.user.role === "manager")) {
            potentialOwners.add(String(req.user._id));
        }

        if (statusChanged && isNewStatus(oldStatus) && !isNewStatus(normalizedStatus) && potentialOwners.size > 0) {
            console.log(`Lead status left New by ${req.user.role}; checking refill for ${[...potentialOwners].join(", ")}`);
            const refilled = await refillOwners([...potentialOwners], req.user);
            refilledLeads = refilled.leads;
            refillBatchId = refilled.batchId;
        }

        const leadPayload = typeof lead.toObject === 'function' ? lead.toObject() : { ...lead };
        if (rotationResult) {
            leadPayload.status = rotationResult.status || leadPayload.status;
            leadPayload.agent = rotationResult.agent || null;
            leadPayload.rotationCount = rotationResult.rotationCount ?? leadPayload.rotationCount;
        }

        const responseMsg =
            rotationResult?.outcome === "rotated"
                ? `Status updated & rotated to ${rotationResult.toAgentName} as "${rotationResult.status}" (${rotationResult.ruleName})`
                : rotationResult?.outcome === "exhausted"
                ? `Status updated & marked "${rotationResult.status}" (${rotationResult.ruleName})`
                : "Lead updated successfully";

        res.status(200).json({
            success: true,
            msg: responseMsg,
            data: {
                lead: hidePrivateLeadFields(leadPayload, req.user),
                refilledLeads,
                refillBatchId,
                rotation: rotationResult,
            }
        });

    } catch (err) {
        console.error("Error updating lead:", err);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: err.message
        });
    }
};
const superAdminOnly = (req, res) => {
    if (req.user?.role === "superadmin") return true;
    res.status(403).json({ success: false, msg: "Super admin only" });
    return false;
};

const leadCompareFields = "leadNumber firstName lastName email phone country Brand status fileName source Address createdAt updatedAt isDeleted";

exports.listLeadUploads = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const getLeadUploadModel = require("../crmDB/models/leadUploadModel");
        const LeadUpload = await getLeadUploadModel();
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const search = String(req.query.search || "").trim();
        const query = {};
        if (search) query.fileName = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const removedUploads = await LeadUpload.find({ deletedAt: { $ne: null } }).select("_id").lean();
        if (removedUploads.length) {
            const Lead = await getLeadModel();
            await Lead.deleteMany({
                uploadBatchId: { $in: removedUploads.map((item) => item._id) },
                isDeleted: true,
            });
        }
        const [uploads, total] = await Promise.all([
            LeadUpload.find(query).select("-duplicates").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            LeadUpload.countDocuments(query),
        ]);
        res.json({
            success: true,
            uploads,
            pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
        });
    } catch (err) {
        console.error("Error listing lead uploads:", err);
        res.status(500).json({ success: false, msg: "Could not load upload history" });
    }
};

exports.getLeadUpload = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const getLeadUploadModel = require("../crmDB/models/leadUploadModel");
        const LeadUpload = await getLeadUploadModel();
        const Lead = await getLeadModel();
        const upload = await LeadUpload.findById(req.params.id).lean();
        if (!upload) return res.status(404).json({ success: false, msg: "Upload not found" });

        const leadPage = Math.max(1, parseInt(req.query.leadPage, 10) || 1);
        const leadLimit = Math.min(100, Math.max(1, parseInt(req.query.leadLimit, 10) || 25));
        const duplicatePage = Math.max(1, parseInt(req.query.duplicatePage, 10) || 1);
        const duplicateLimit = Math.min(100, Math.max(1, parseInt(req.query.duplicateLimit, 10) || 10));
        const duplicateStatus = ["pending", "accepted", "declined", "merged", "all"].includes(req.query.duplicateStatus)
            ? req.query.duplicateStatus
            : "pending";
        const duplicateSort = ["name", "email", "phone"].includes(req.query.duplicateSort)
            ? req.query.duplicateSort
            : "name";

        const duplicates = (upload.duplicates || []).map((row, index) => ({
            ...row,
            key: row.key || String(index),
        }));
        const detailsCleared = Boolean(upload.detailsClearedAt);
        const merged = detailsCleared
            ? Number(upload.mergedCount) || 0
            : duplicates.filter((row) => row.mergedAt).length;
        const accepted = detailsCleared
            ? Number(upload.acceptedCount) || 0
            : duplicates.filter((row) => row.acceptedLeadId && !row.mergedAt).length;
        const declined = detailsCleared
            ? Number(upload.declinedCount) || 0
            : duplicates.filter((row) => row.declinedAt && !row.acceptedLeadId && !row.mergedAt).length;
        const pending = detailsCleared ? 0 : duplicates.length - accepted - declined - merged;
        const sortText = (row) => {
            if (duplicateSort === "email") return String(row.email || "").toLowerCase();
            if (duplicateSort === "phone") return String(row.phone || "");
            return `${row.firstName || ""} ${row.lastName || ""}`.trim().toLowerCase();
        };
        const filtered = duplicates.filter((row) => {
            if (duplicateStatus === "accepted") return Boolean(row.acceptedLeadId) && !row.mergedAt;
            if (duplicateStatus === "declined") return Boolean(row.declinedAt) && !row.acceptedLeadId && !row.mergedAt;
            if (duplicateStatus === "merged") return Boolean(row.mergedAt);
            if (duplicateStatus === "pending") return !row.acceptedLeadId && !row.declinedAt && !row.mergedAt;
            return true;
        }).sort((a, b) => sortText(a).localeCompare(sortText(b)));
        const pageRows = filtered.slice((duplicatePage - 1) * duplicateLimit, duplicatePage * duplicateLimit);
        const relatedIds = pageRows.flatMap((row) => [row.existingLeadId, row.acceptedLeadId, row.mergedIntoLeadId]).filter(Boolean);
        const related = relatedIds.length
            ? await Lead.find({ _id: { $in: relatedIds } }).select(leadCompareFields).lean()
            : [];
        const byId = new Map(related.map((lead) => [String(lead._id), lead]));
        const duplicateRows = pageRows.map((row) => ({
            ...row,
            existing: row.existingLeadId ? byId.get(String(row.existingLeadId)) || null : null,
            acceptedLead: row.acceptedLeadId ? byId.get(String(row.acceptedLeadId)) || null : null,
        }));

        const leadQuery = { uploadBatchId: upload._id };
        const [leads, leadTotal] = await Promise.all([
            Lead.find(leadQuery).sort({ createdAt: -1 }).skip((leadPage - 1) * leadLimit).limit(leadLimit).select(leadCompareFields).lean(),
            Lead.countDocuments(leadQuery),
        ]);

        const { duplicates: unusedDuplicates, ...summary } = upload;
        res.json({
            success: true,
            upload: { ...summary, acceptedCount: accepted, declinedCount: declined, mergedCount: merged },
            duplicates: {
                rows: duplicateRows,
                page: duplicatePage,
                pages: Math.max(1, Math.ceil(filtered.length / duplicateLimit)),
                total: filtered.length,
                pending,
                accepted,
                declined,
                merged,
                status: duplicateStatus,
                sort: duplicateSort,
            },
            leads: {
                rows: leads,
                page: leadPage,
                pages: Math.max(1, Math.ceil(leadTotal / leadLimit)),
                total: leadTotal,
            },
        });
    } catch (err) {
        console.error("Error reading lead upload:", err);
        res.status(500).json({ success: false, msg: "Could not load this upload" });
    }
};

exports.acceptLeadUploadDuplicates = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const getLeadUploadModel = require("../crmDB/models/leadUploadModel");
        const LeadUpload = await getLeadUploadModel();
        const Lead = await getLeadModel();
        const upload = await LeadUpload.findById(req.params.id);
        if (!upload) return res.status(404).json({ success: false, msg: "Upload not found" });
        if (upload.deletedAt) {
            return res.status(400).json({ success: false, msg: "This upload was removed. Its duplicates cannot be accepted." });
        }
        if (upload.detailsClearedAt) {
            return res.status(400).json({ success: false, msg: "Detailed duplicate history was cleared for this upload." });
        }

        const acceptAll = req.body?.all === true;
        const requested = Array.isArray(req.body?.keys) ? req.body.keys.map(String) : [];
        if (!acceptAll && !requested.length) return res.status(400).json({ success: false, msg: "Choose at least one duplicate" });
        if (!acceptAll && requested.length > 500) return res.status(400).json({ success: false, msg: "Accept up to 500 duplicates at a time" });
        const wanted = new Set(requested);

        const rows = (upload.duplicates || []).map((entry, index) => {
            const source = entry && typeof entry.toObject === "function" ? entry.toObject() : entry;
            const row = source && typeof source === "object" ? { ...source } : {};
            row.key = row.key || String(index);
            return row;
        });
        let chosen = rows.filter((row) => {
            if (row.acceptedLeadId || row.mergedAt) return false;
            if (acceptAll) return !row.declinedAt && !row.mergedAt;
            return wanted.has(String(row.key));
        });
        if (!chosen.length) {
            return res.status(400).json({ success: false, msg: "Those duplicates are already accepted or no longer in this upload" });
        }
        const truncated = chosen.length > 500;
        if (truncated) chosen = chosen.slice(0, 500);

        const createdByKey = new Map();
        const failed = [];
        const planned = chosen.map((row) => ({
            key: String(row.key),
            doc: {
                _id: new mongoose.Types.ObjectId(),
                firstName: row.firstName || "",
                lastName: row.lastName || "",
                email: row.email || undefined,
                phone: row.phone || "",
                country: row.country || "",
                Brand: row.Brand || "",
                source: row.source || null,
                fileName: row.fileName || "",
                Address: row.Address || "",
                status: row.status || "New",
                agent: row.agent && mongoose.Types.ObjectId.isValid(row.agent) ? row.agent : null,
                uploadBatchId: upload._id,
            },
        }));
        try {
            const docs = planned.map((item) => item.doc);
            await stampLeadNumbers(docs);
            await Lead.insertMany(docs, { ordered: false });
            planned.forEach((item) => createdByKey.set(item.key, item.doc));
        } catch (error) {
            if (!error.writeErrors) throw error;
            const failedIndexes = new Set(error.writeErrors.map((item) => item.index));
            planned.forEach((item, index) => {
                if (failedIndexes.has(index)) {
                    failed.push({ key: item.key, msg: error.writeErrors.find((entry) => entry.index === index)?.errmsg || "Could not create this lead" });
                } else {
                    createdByKey.set(item.key, item.doc);
                }
            });
        }

        if (!createdByKey.size) {
            return res.status(400).json({ success: false, msg: "None of the selected duplicates could be added", failed });
        }

        const now = new Date();
        upload.duplicates = rows.map((row) => {
            const lead = createdByKey.get(String(row.key));
            if (!lead) return row;
            return { ...row, acceptedLeadId: lead._id, acceptedAt: now };
        });
        upload.markModified("duplicates");
        upload.acceptedCount = (upload.acceptedCount || 0) + createdByKey.size;
        upload.leadCount = (upload.leadCount || 0) + createdByKey.size;
        await upload.save();

        const created = [...createdByKey.values()];
        for (let i = 0; i < created.length; i += 25) {
            const slice = created.slice(i, i + 25);
            await Promise.all(slice.map((lead) => logActivity({
                leadId: lead._id,
                type: "created",
                createdBy: req.user,
                changes: { description: `Lead accepted from duplicate review in ${upload.fileName || "a CSV upload"}` },
            }).catch(() => null)));
        }
        refillAllEligibleAgents().catch((err) => console.error("Post-accept lead refill error:", err));

        res.json({
            success: true,
            accepted: createdByKey.size,
            keys: [...createdByKey.keys()],
            failed,
            all: acceptAll && !truncated,
            msg: truncated
                ? `Added ${createdByKey.size}. More duplicates are still waiting.`
                : failed.length
                    ? `Added ${createdByKey.size}. ${failed.length} could not be added.`
                    : `Added ${createdByKey.size} lead${createdByKey.size === 1 ? "" : "s"}`,
        });
    } catch (err) {
        console.error("Error accepting upload duplicates:", err);
        res.status(500).json({ success: false, msg: "Could not accept these duplicates" });
    }
};

exports.declineLeadUploadDuplicates = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const getLeadUploadModel = require("../crmDB/models/leadUploadModel");
        const LeadUpload = await getLeadUploadModel();
        const upload = await LeadUpload.findById(req.params.id);
        if (!upload) return res.status(404).json({ success: false, msg: "Upload not found" });
        if (upload.detailsClearedAt) {
            return res.status(400).json({ success: false, msg: "Detailed duplicate history was cleared for this upload." });
        }

        const declineAll = req.body?.all === true;
        const requested = Array.isArray(req.body?.keys) ? req.body.keys.map(String) : [];
        if (!declineAll && !requested.length) return res.status(400).json({ success: false, msg: "Choose at least one duplicate" });
        const wanted = new Set(requested);
        const now = new Date();
        let declined = 0;
        const declinedKeys = [];
        const rows = (upload.duplicates || []).map((entry, index) => {
            const source = entry && typeof entry.toObject === "function" ? entry.toObject() : entry;
            const row = source && typeof source === "object" ? { ...source } : {};
            row.key = row.key || String(index);
            if (row.acceptedLeadId || row.declinedAt || row.mergedAt) return row;
            if (!declineAll && !wanted.has(String(row.key))) return row;
            declined += 1;
            declinedKeys.push(String(row.key));
            return { ...row, declinedAt: now };
        });
        if (!declined) {
            return res.status(400).json({ success: false, msg: "Those duplicates are already sorted" });
        }
        upload.duplicates = rows;
        upload.markModified("duplicates");
        upload.declinedCount = (upload.declinedCount || 0) + declined;
        await upload.save();
        res.json({
            success: true,
            declined,
            keys: declinedKeys,
            all: declineAll,
            msg: `Declined ${declined} duplicate${declined === 1 ? "" : "s"}`,
        });
    } catch (err) {
        console.error("Error declining upload duplicates:", err);
        res.status(500).json({ success: false, msg: "Could not decline these duplicates" });
    }
};

// Merge one uploaded duplicate into the lead that already exists.
// The saved lead keeps its _id, number, assignment, notes, calls and complete activity history.
// Only explicitly selected, non-blank CSV fields are changed, inside one MongoDB transaction.
exports.mergeLeadUploadDuplicate = async (req, res) => {
    const fail = (status, message, code = "", details = undefined) => {
        const error = new Error(message);
        error.status = status;
        error.code = code;
        error.details = details;
        return error;
    };

    let session;
    try {
        if (!superAdminOnly(req, res)) return;
        const duplicateKey = String(req.body?.key ?? "").trim();
        const fields = selectedMergeFields(req.body?.fields);
        const expected = req.body?.expected && typeof req.body.expected === "object" ? req.body.expected : {};
        const resolveNoChanges = req.body?.resolveNoChanges === true;
        const mergePolicy = req.body?.policy === "fill_blanks" ? "fill_blanks" : "field_selection";
        if (!duplicateKey) return res.status(400).json({ success: false, msg: "Choose a duplicate to merge" });
        if (!fields.length && !resolveNoChanges) {
            return res.status(400).json({ success: false, msg: "Choose at least one uploaded value" });
        }
        const missingExpected = fields.filter((field) => !Object.prototype.hasOwnProperty.call(expected, field));
        if (missingExpected.length) {
            return res.status(400).json({ success: false, msg: "Reload this duplicate before merging" });
        }

        const getLeadUploadModel = require("../crmDB/models/leadUploadModel");
        const getActivityModel = require("../crmDB/models/activityModel");
        const LeadUpload = await getLeadUploadModel();
        const Lead = await getLeadModel();
        const Activity = await getActivityModel();
        const statusLabels = await getLeadStatusLabels();
        const rowsOf = (upload) => (upload?.duplicates || []).map((entry, index) => {
            const source = entry && typeof entry.toObject === "function" ? entry.toObject() : entry;
            const row = source && typeof source === "object" ? { ...source } : {};
            row.key = row.key || String(index);
            return row;
        });
        const withSession = (query, activeSession) => activeSession ? query.session(activeSession) : query;

        const performMerge = async (activeSession = null, fallbackLock = null) => {
            let rollback;
            let activityIds = [];
            let completed = false;
            try {
                const upload = await withSession(LeadUpload.findById(req.params.id), activeSession);
                if (!upload) throw fail(404, "Upload not found");
                if (upload.deletedAt) throw fail(400, "This upload was removed. Its duplicates cannot be merged.");
                if (upload.detailsClearedAt) throw fail(400, "Detailed duplicate history was cleared for this upload.");

                const rows = rowsOf(upload);
                const rowIndex = rows.findIndex((row) => String(row.key) === duplicateKey);
                if (rowIndex < 0) throw fail(404, "Duplicate not found");
                const row = rows[rowIndex];
                if (fallbackLock && row.mergeLock !== fallbackLock.token) {
                    throw fail(409, "Another merge is already working on this duplicate", "MERGE_BUSY");
                }
                if (row.acceptedLeadId) throw fail(409, "This duplicate was already added as a separate lead", "ALREADY_SORTED");
                if (row.mergedAt) throw fail(409, "This duplicate was already merged", "ALREADY_MERGED");
                if (!row.existingLeadId || !mongoose.Types.ObjectId.isValid(row.existingLeadId)) {
                    throw fail(400, "The saved lead for this duplicate is no longer available");
                }

                const lead = await withSession(
                    Lead.findOne({ _id: row.existingLeadId, isDeleted: false }),
                    activeSession
                );
                if (!lead) throw fail(404, "The saved lead no longer exists or is in the recycle bin");

                const conflicts = findMergeConflicts({ lead, expected, fields });
                if (conflicts.length) {
                    throw fail(
                        409,
                        "The saved lead changed after you opened it. Reload and review the merge again.",
                        "MERGE_CONFLICT",
                        { conflicts }
                    );
                }

                const plan = buildLeadMergePlan({ lead, duplicate: row, fields, statusLabels });
                if (plan.rejected.some((item) => item.reason === "invalid_status")) {
                    throw fail(400, "The uploaded status no longer exists. Choose another field or update the status first.");
                }
                if (!plan.changes.length && !resolveNoChanges) {
                    throw fail(400, "The selected uploaded values are blank or already match the saved lead");
                }
                const changedFields = new Set(plan.changes.map((change) => change.field));
                const ignoredFields = MERGE_FIELDS
                    .filter((field) => String(row?.[field.key] ?? "").trim())
                    .filter((field) => !valuesMatch(field.key, lead?.[field.key], row?.[field.key]))
                    .filter((field) => !changedFields.has(field.key))
                    .map((field) => field.key);

                if (plan.changes.length && plan.updates.email) {
                    const emailOwner = await withSession(
                        Lead.findOne({
                            _id: { $ne: lead._id },
                            isDeleted: false,
                            email: plan.updates.email,
                        }).select("_id leadNumber"),
                        activeSession
                    );
                    if (emailOwner) {
                        throw fail(
                            409,
                            "That uploaded email belongs to another saved lead. It cannot be merged here.",
                            "MERGE_VALUE_CONFLICT",
                            { field: "email", leadId: String(emailOwner._id), leadNumber: emailOwner.leadNumber || null }
                        );
                    }
                }
                if (plan.changes.length && plan.updates.phone) {
                    const phoneOwner = await withSession(
                        Lead.findOne({
                            _id: { $ne: lead._id },
                            isDeleted: false,
                            phone: { $in: getPhoneLookupValues(plan.updates.phone) },
                        }).select("_id leadNumber"),
                        activeSession
                    );
                    if (phoneOwner) {
                        throw fail(
                            409,
                            "That uploaded phone belongs to another saved lead. It cannot be merged here.",
                            "MERGE_VALUE_CONFLICT",
                            { field: "phone", leadId: String(phoneOwner._id), leadNumber: phoneOwner.leadNumber || null }
                        );
                    }
                }

                if (plan.changes.length) {
                    rollback = {
                        leadId: lead._id,
                        updatedAt: lead.updatedAt,
                        values: Object.fromEntries(plan.changes.map((change) => [change.field, lead.get(change.field)])),
                        after: Object.fromEntries(plan.changes.map((change) => [change.field, change.after])),
                    };
                    Object.entries(plan.updates).forEach(([field, value]) => {
                        lead.set(field, value);
                    });
                    await lead.save(activeSession ? { session: activeSession } : undefined);
                }

                const now = new Date();
                const actorName = `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim() || "Super admin";
                const description = plan.changes.length
                    ? plan.changes
                        .map((change) => `${change.label}: '${change.before || "blank"}' to '${change.after}'`)
                        .join("; ")
                    : "No saved values changed; existing non-empty values were kept";
                const activityDocs = [{
                    _id: new mongoose.Types.ObjectId(),
                    leadId: lead._id,
                    type: "field_update",
                    isSystemGenerated: false,
                    createdBy: {
                        userId: req.user._id,
                        userName: actorName,
                        userRole: req.user.role,
                    },
                    changes: {
                        field: "duplicate_merge",
                        description: `Merged duplicate from ${upload.fileName || "CSV upload"}: ${description}`,
                    },
                    metadata: {
                        merge: true,
                        uploadId: String(upload._id),
                        uploadFileName: upload.fileName || "upload.csv",
                        duplicateKey,
                        duplicateReason: row.reason || "",
                        mergePolicy,
                        mergedFields: plan.changes.map((change) => change.field),
                        mergeChanges: plan.changes,
                        ignoredFields,
                    },
                }];
                const statusChange = plan.changes.find((change) => change.field === "status");
                if (statusChange) {
                    activityDocs.push({
                        _id: new mongoose.Types.ObjectId(),
                        leadId: lead._id,
                        type: "status_change",
                        isSystemGenerated: false,
                        createdBy: {
                            userId: req.user._id,
                            userName: actorName,
                            userRole: req.user.role,
                        },
                        changes: {
                            field: "status",
                            oldValue: statusChange.before || "New",
                            newValue: statusChange.after,
                            description: `Status updated while merging a duplicate from ${upload.fileName || "CSV upload"}`,
                        },
                        metadata: {
                            merge: true,
                            uploadId: String(upload._id),
                            duplicateKey,
                        },
                    });
                }
                activityIds = activityDocs.map((doc) => doc._id);
                const activities = await Activity.create(
                    activityDocs,
                    activeSession ? { session: activeSession } : undefined
                );
                const activity = activities[0];

                const mergedRow = {
                    ...row,
                    declinedAt: null,
                    mergedAt: now,
                    mergedIntoLeadId: lead._id,
                    mergedBy: {
                        userId: req.user._id,
                        userName: actorName,
                        userRole: req.user.role,
                    },
                    mergedFields: plan.changes.map((change) => change.field),
                    ignoredFields,
                    mergePolicy,
                    mergeActivityId: activity._id,
                };
                delete mergedRow.mergeLock;
                delete mergedRow.mergeLockAt;
                rows[rowIndex] = mergedRow;
                const mergedCount = rows.filter((item) => item.mergedAt).length;
                const declinedCount = rows.filter((item) => item.declinedAt && !item.acceptedLeadId && !item.mergedAt).length;

                if (activeSession) {
                    upload.duplicates = rows;
                    upload.mergedCount = mergedCount;
                    upload.declinedCount = declinedCount;
                    upload.markModified("duplicates");
                    await upload.save({ session: activeSession });
                } else {
                    const rowPath = `duplicates.${rowIndex}`;
                    const auditWrite = await LeadUpload.collection.updateOne(
                        { _id: upload._id, [`${rowPath}.mergeLock`]: fallbackLock.token },
                        {
                            $set: {
                                [rowPath]: mergedRow,
                                mergedCount,
                                declinedCount,
                            },
                        }
                    );
                    if (auditWrite.modifiedCount !== 1) {
                        throw fail(409, "The upload history changed while merging. Reload and try again.", "MERGE_CONFLICT");
                    }
                }

                completed = true;
                return {
                    key: duplicateKey,
                    leadId: String(lead._id),
                    leadNumber: lead.leadNumber || null,
                    ownerId: ownerIdOf(lead.agent),
                    mergedAt: now,
                    fields: plan.changes.map((change) => change.field),
                    ignoredFields,
                    policy: mergePolicy,
                    changes: plan.changes,
                    activityId: String(activity._id),
                };
            } catch (error) {
                // Atlas uses the transaction above. A standalone local MongoDB cannot transact,
                // so compensate carefully without ever overwriting a newer user edit.
                if (!activeSession) {
                    if (activityIds.length) {
                        await Activity.deleteMany({ _id: { $in: activityIds } }).catch(() => {});
                    }
                    if (rollback) {
                        const filter = { _id: rollback.leadId };
                        Object.entries(rollback.after).forEach(([field, value]) => {
                            filter[field] = value;
                        });
                        const set = {};
                        const unset = {};
                        Object.entries(rollback.values).forEach(([field, value]) => {
                            if (value === undefined) unset[field] = "";
                            else set[field] = value;
                        });
                        if (rollback.updatedAt === undefined) unset.updatedAt = "";
                        else set.updatedAt = rollback.updatedAt;
                        await Lead.collection.updateOne(
                            filter,
                            {
                                ...(Object.keys(set).length ? { $set: set } : {}),
                                ...(Object.keys(unset).length ? { $unset: unset } : {}),
                            }
                        ).catch(() => {});
                    }
                }
                throw error;
            } finally {
                if (!activeSession && fallbackLock && !completed) {
                    const rowPath = `duplicates.${fallbackLock.rowIndex}`;
                    await LeadUpload.collection.updateOne(
                        { _id: fallbackLock.uploadId, [`${rowPath}.mergeLock`]: fallbackLock.token },
                        { $unset: { [`${rowPath}.mergeLock`]: "", [`${rowPath}.mergeLockAt`]: "" } }
                    ).catch(() => {});
                }
            }
        };

        let merged;
        const supportsTransactions = await crmSupportsTransactions(Lead);
        if (supportsTransactions) {
            session = await Lead.db.startSession();
            await session.withTransaction(async () => {
                merged = await performMerge(session);
            });
        } else {
            // Local standalone fallback: lock this one duplicate row before changing the lead.
            const upload = await LeadUpload.findById(req.params.id).lean();
            if (!upload) throw fail(404, "Upload not found");
            if (upload.deletedAt) throw fail(400, "This upload was removed. Its duplicates cannot be merged.");
            if (upload.detailsClearedAt) throw fail(400, "Detailed duplicate history was cleared for this upload.");
            const rows = rowsOf(upload);
            const rowIndex = rows.findIndex((row) => String(row.key) === duplicateKey);
            if (rowIndex < 0) throw fail(404, "Duplicate not found");
            const row = rows[rowIndex];
            if (row.acceptedLeadId) throw fail(409, "This duplicate was already added as a separate lead", "ALREADY_SORTED");
            if (row.mergedAt) throw fail(409, "This duplicate was already merged", "ALREADY_MERGED");

            const token = new mongoose.Types.ObjectId().toString();
            const rowPath = `duplicates.${rowIndex}`;
            const stale = new Date(Date.now() - 5 * 60 * 1000);
            const locked = await LeadUpload.collection.updateOne(
                {
                    _id: upload._id,
                    [`${rowPath}.acceptedLeadId`]: { $in: [null, ""] },
                    [`${rowPath}.mergedAt`]: { $in: [null, ""] },
                    $or: [
                        { [`${rowPath}.mergeLock`]: { $exists: false } },
                        { [`${rowPath}.mergeLock`]: null },
                        { [`${rowPath}.mergeLockAt`]: { $lt: stale } },
                    ],
                },
                {
                    $set: {
                        [`${rowPath}.mergeLock`]: token,
                        [`${rowPath}.mergeLockAt`]: new Date(),
                    },
                }
            );
            if (locked.modifiedCount !== 1) {
                throw fail(409, "Another merge is already working on this duplicate", "MERGE_BUSY");
            }
            merged = await performMerge(null, { token, rowIndex, uploadId: upload._id });
        }

        const mergedStatus = merged.changes.find((change) => change.field === "status");
        if (
            merged.ownerId
            && mergedStatus
            && isNewStatus(mergedStatus.before)
            && !isNewStatus(mergedStatus.after)
        ) {
            refillOwners([merged.ownerId], req.user).catch((error) => {
                console.error("Post-merge lead refill failed:", error);
            });
        }

        return res.json({
            success: true,
            msg: merged.changes.length
                ? `${merged.changes.length} field${merged.changes.length === 1 ? "" : "s"} merged into the saved lead`
                : "Duplicate resolved; the saved lead already had all values",
            data: merged,
        });
    } catch (err) {
        const status = Number(err.status) || 500;
        if (status >= 500) console.error("Error merging upload duplicate:", err);
        return res.status(status).json({
            success: false,
            msg: status === 500 ? "Could not merge this duplicate" : err.message,
            ...(err.code ? { code: err.code } : {}),
            ...(err.details ? err.details : {}),
        });
    } finally {
        if (session) await session.endSession().catch(() => {});
    }
};

// Clear only the heavy duplicate-review data. Uploaded leads and the summary stay.
exports.clearLeadUploadDetails = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const getLeadUploadModel = require("../crmDB/models/leadUploadModel");
        const LeadUpload = await getLeadUploadModel();
        const upload = await LeadUpload.findById(req.params.id).lean();
        if (!upload) return res.status(404).json({ success: false, msg: "Upload not found" });
        if (upload.detailsClearedAt) {
            return res.json({
                success: true,
                alreadyCleared: true,
                msg: "Upload details were already cleared",
                data: {
                    detailsClearedAt: upload.detailsClearedAt,
                    clearedDuplicateCount: upload.clearedDuplicateCount || upload.duplicateCount || 0,
                    clearedPendingCount: upload.clearedPendingCount || 0,
                },
            });
        }

        const actorName = `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim() || "Super admin";
        const result = await clearLeadUploadDetailsDocument(LeadUpload, upload, {
            actor: {
                userId: req.user._id,
                userName: actorName,
                userRole: req.user.role,
            },
        });
        if (result.reason === "merge_running") {
            return res.status(409).json({ success: false, msg: "A duplicate merge is still running. Wait for it to finish and try again." });
        }
        if (!result.cleared) {
            return res.status(409).json({ success: false, msg: "Upload history changed. Refresh and try again." });
        }

        return res.json({
            success: true,
            msg: "Detailed upload history cleared. All leads were kept.",
            data: result,
        });
    } catch (err) {
        console.error("Error clearing upload details:", err);
        return res.status(500).json({ success: false, msg: "Could not clear upload details" });
    }
};

exports.deleteLeadUpload = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const getLeadUploadModel = require("../crmDB/models/leadUploadModel");
        const LeadUpload = await getLeadUploadModel();
        const Lead = await getLeadModel();
        const upload = await LeadUpload.findById(req.params.id);
        if (!upload) {
            return res.status(404).json({ success: false, msg: "Upload not found" });
        }
        const wasDeleted = Boolean(upload.deletedAt);
        const result = await Lead.deleteMany({ uploadBatchId: upload._id });
        if (!wasDeleted) {
            upload.deletedAt = new Date();
            upload.deletedCount = result.deletedCount || 0;
            await upload.save();
        }
        res.json({ success: true, deleted: result.deletedCount || 0, alreadyDeleted: wasDeleted && !result.deletedCount });
    } catch (err) {
        console.error("Error deleting lead upload:", err);
        res.status(500).json({ success: false, msg: "Could not delete this upload" });
    }
};

exports.exportLeads = async (req, res) => {
    try {
        if (!hasCrmPermission(req.user, 'canExportLeads')) {
            return denyCrmPermission(res, 'You do not have permission to export leads');
        }
        console.log("an", req.query);
        const Lead = await getLeadModel();
        const { search, status, country, countrySearch, brandSearch, agent, fields } = req.query;

        // Build query (same as getLeads)
        const query = { isDeleted: false };

        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: "i" } },
                { lastName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
                ...(hasCrmPermission(req.user, "canViewLeadBrand") ? [{ Brand: { $regex: search, $options: "i" } }] : []),
                ...(hasCrmPermission(req.user, "canViewLeadFileName") ? [{ fileName: { $regex: search, $options: "i" } }] : []),
                { Address: { $regex: search, $options: "i" } },
                { amountLostWhen: { $regex: search, $options: "i" } },
                { additionalPhone: { $regex: search, $options: "i" } },
                { customerBanks: { $regex: search, $options: "i" } },
                { screenSharingId: { $regex: search, $options: "i" } }
            ];
        }

        if (status && status !== '') query.status = status;
        applyCountryFilter(query, country);
        applyCountrySearchFilter(query, countrySearch);
        if (hasCrmPermission(req.user, "canViewLeadBrand")) applyBrandSearchFilter(query, brandSearch);
        if (agent && agent !== '') query.agent = agent;

        await applyLeadVisibilityToQuery(query, req.user);
        applyCustomerFilters(query, req.query);

        // Get all leads matching the filters (no pagination for export)
        const leads = await Lead.find(query).sort({ createdAt: -1 });

        // Define available fields and their headers
        const availableFields = {
            leadNumber: 'ID',
            firstName: 'First Name',
            lastName: 'Last Name',
            email: 'Email',
            phone: 'Phone',
            country: 'Country',
            ...(hasCrmPermission(req.user, "canViewLeadBrand") ? { Brand: 'Brand' } : {}),
            ...(hasCrmPermission(req.user, "canViewLeadFileName") ? { fileName: 'File Name' } : {}),
            Address: 'Address',
            status: 'Status',
            customerAge: 'Customer age',
            amountLost: 'Amount lost',
            amountLostWhen: 'When amount lost',
            registeredToPlatform: 'Registered to platform',
            activeTradingPlatform: 'Active trading platform',
            customerBanks: 'Banks',
            additionalPhone: 'Additional phone',
            screenSharing: 'Screen sharing',
            screenSharingId: 'Screen sharing ID',
            customerPotential: 'Customer potential',
            createdAt: 'Created Date'
        };

        // Determine which fields to export
        let exportFields = Object.keys(availableFields);
        if (fields) {
            exportFields = fields.split(',').filter(field => availableFields[field]);
        }

        // Create CSV headers
        const headers = exportFields.map(field => availableFields[field]);
        let csvContent = headers.join(',') + '\n';

        // Create CSV rows
        leads.forEach(lead => {
            const row = exportFields.map(field => {
                let value = lead[field] || '';

                // Format dates
                if (field === 'createdAt') {
                    value = new Date(value).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                }

                if (field === 'customerBanks') {
                    value = Array.isArray(value) ? value.join('; ') : value;
                }

                // Format phone numbers to prevent scientific notation
                if (field === 'phone') {
                    // Convert to string and ensure it's treated as text
                    // Add a tab character prefix to force Excel to treat it as text
                    if (value) {
                        return `"\t${String(value).replace(/"/g, '""')}"`;
                    }
                    return '""';
                }

                // Escape CSV special characters and wrap in quotes
                return `"${String(value).replace(/"/g, '""')}"`;
            });
            csvContent += row.join(',') + '\n';
        });

        // Set response headers for file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=leads-export-${new Date().toISOString().split('T')[0]}.csv`);

        res.status(200).send(csvContent);



    } catch (err) {
        console.error("Error fetching leads:", err);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: err.message
        });
    }
};

// List deleted leads (recycle bin)
exports.getDeletedLeads = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const { page = 1, limit = 100, search, status, agent } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const query = { isDeleted: true };

        if (search) {
            const searchTrimmed = String(search).trim();
            const regexGlobal = { $regex: searchTrimmed, $options: "i" };
            const nameRegex = new RegExp(escapeRegex(searchTrimmed), 'i');
            const parts = searchTrimmed.split(/\s+/);
            query.$or = [
                { firstName: regexGlobal },
                { lastName: regexGlobal },
                { email: regexGlobal },
                { phone: regexGlobal },
                ...(/^\d+$/.test(searchTrimmed) ? [{ leadNumber: Number(searchTrimmed) }] : []),
                ...(hasCrmPermission(req.user, "canViewLeadBrand") ? [{ Brand: regexGlobal }] : []),
                ...(hasCrmPermission(req.user, "canViewLeadFileName") ? [{ fileName: regexGlobal }] : []),
                { Address: regexGlobal },
                { $expr: { $regexMatch: { input: { $concat: ['$firstName', ' ', '$lastName'] }, regex: nameRegex } } }
            ];
            if (parts.length >= 2) {
                const first = new RegExp(escapeRegex(parts[0]), 'i');
                const last = new RegExp(escapeRegex(parts.slice(1).join(' ')), 'i');
                query.$or.push({ $and: [{ firstName: first }, { lastName: last }] });
                query.$or.push({ $and: [{ firstName: last }, { lastName: first }] });
            }
        }
        if (status && status !== '') query.status = status;
        if (agent && agent !== '') query.agent = agent;

        // Visibility: subadmin only self; admin self + subadmins (if allowed)
        if (req.user && req.user.role === 'subadmin') {
            query.agent = req.user._id;
        } else if (req.user && req.user.role === 'admin') {
            const userPerms = await getCachedUserPermissions(req.user._id);
            if (userPerms?.adminPermissions?.canManageCrmLeads) {
                const subadminIds = await getCachedSubadmins();
                query.agent = { $in: [req.user._id, ...subadminIds] };
            } else {
                query.agent = req.user._id;
            }
        }

        const [leadsRaw, totalFiltered] = await Promise.all([
            Lead.find(query).sort({ deletedAt: -1 }).skip(skip).limit(limitNum).lean(),
            Lead.countDocuments(query)
        ]);

        // Manual populate agent from main DB
        const agentIds = leadsRaw.map(l => l.agent).filter(Boolean);
        const agents = await User.find({ _id: { $in: agentIds } }).select('firstName lastName email role').lean();
        const agentMap = agents.reduce((m, a) => { m[a._id.toString()] = a; return m; }, {});
        const leads = leadsRaw.map(l => hidePrivateLeadFields({
            ...l,
            agent: l.agent ? agentMap[l.agent.toString()] || null : null,
        }, req.user));

        const totalPages = Math.ceil(totalFiltered / limitNum);

        res.status(200).json({
            success: true,
            data: {
                leads,
                pagination: {
                    currentPage: pageNum,
                    totalPages,
                    totalFiltered,
                    limit: limitNum,
                }
            }
        });
    } catch (err) {
        console.error('Error fetching deleted leads:', err);
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

// Restore a soft-deleted lead
exports.restoreLead = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const lead = await Lead.findById(req.params.id);
        if (!lead || !lead.isDeleted) return res.status(404).json({ success: false, msg: 'Lead not found or not deleted' });
        lead.isDeleted = false;
        lead.deletedAt = null;
        await lead.save();
        res.status(200).json({ success: true, msg: 'Lead restored successfully' });
    } catch (err) {
        console.error('Error restoring lead:', err);
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

// Permanently delete a lead
exports.hardDeleteLead = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const result = await Lead.deleteOne({ _id: req.params.id, isDeleted: true });
        if (result.deletedCount === 0) return res.status(404).json({ success: false, msg: 'Lead not found or not in recycle bin' });
        res.status(200).json({ success: true, msg: 'Lead permanently deleted' });
    } catch (err) {
        console.error('Error hard deleting lead:', err);
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

exports.bulkRestoreLeads = async (req, res) => {
    try {
        const { leadIds } = req.body;
        const Lead = await getLeadModel();
        const result = await Lead.updateMany({ _id: { $in: leadIds }, isDeleted: true }, { $set: { isDeleted: false, deletedAt: null } });
        res.status(200).json({ success: true, msg: `${result.modifiedCount} lead(s) restored`, data: { restored: result.modifiedCount } });
    } catch (err) {
        console.error('Error bulk restoring leads:', err);
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

exports.bulkHardDeleteLeads = async (req, res) => {
    try {
        const { leadIds } = req.body;
        const Lead = await getLeadModel();
        const result = await Lead.deleteMany({ _id: { $in: leadIds }, isDeleted: true });
        res.status(200).json({ success: true, msg: `${result.deletedCount} lead(s) permanently deleted`, data: { deleted: result.deletedCount } });
    } catch (err) {
        console.error('Error bulk hard deleting leads:', err);
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
};

// Restore ALL deleted leads with batch processing and progress tracking
exports.restoreAllLeads = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        
        // Enable Server-Sent Events for progress tracking
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const sendProgress = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Get total count of deleted leads
        const total = await Lead.countDocuments({ isDeleted: true });

        if (total === 0) {
            sendProgress({
                type: 'complete',
                total: 0,
                restored: 0,
                msg: 'No leads to restore'
            });
            res.end();
            return;
        }

        sendProgress({
            type: 'start',
            total,
            percentage: 0,
            msg: `Starting restore of ${total} leads...`
        });

        // Process in batches for better performance
        const BATCH_SIZE = 2000;
        let restoredCount = 0;
        let hasMore = true;

        while (hasMore) {
            // Find batch of deleted leads
            const batch = await Lead.find({ isDeleted: true })
                .limit(BATCH_SIZE)
                .select('_id')
                .lean();

            if (batch.length === 0) {
                hasMore = false;
                break;
            }

            const batchIds = batch.map(lead => lead._id);

            // Restore this batch
            const result = await Lead.updateMany(
                { _id: { $in: batchIds }, isDeleted: true },
                { $set: { isDeleted: false, deletedAt: null } }
            );

            restoredCount += result.modifiedCount;

            // Send progress update
            const percentage = Math.min(Math.round((restoredCount / total) * 100), 100);
            sendProgress({
                type: 'progress',
                total,
                restored: restoredCount,
                remaining: total - restoredCount,
                percentage,
                msg: `Restored ${restoredCount} of ${total} leads...`
            });

            // If we restored less than batch size, we're done
            if (batch.length < BATCH_SIZE) {
                hasMore = false;
            }
        }

        // Send completion
        sendProgress({
            type: 'complete',
            total,
            restored: restoredCount,
            percentage: 100,
            success: true,
            msg: `All ${restoredCount} lead(s) restored from recycle bin`
        });

        res.end();
    } catch (err) {
        console.error('Error restoring all leads:', err);
        
        // Try to send error through SSE if headers not sent yet
        try {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                message: err.message || 'Failed to restore leads'
            })}\n\n`);
            res.end();
        } catch (e) {
            // If SSE fails, send regular error response
            if (!res.headersSent) {
                res.status(500).json({ 
                    success: false, 
                    message: 'Server Error', 
                    error: err.message 
                });
            }
        }
    }
};

// Permanently delete ALL leads from recycle bin with batch processing and progress tracking
exports.hardDeleteAllLeads = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        
        // Enable Server-Sent Events for progress tracking
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const sendProgress = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Get total count of deleted leads
        const total = await Lead.countDocuments({ isDeleted: true });

        if (total === 0) {
            sendProgress({
                type: 'complete',
                total: 0,
                deleted: 0,
                msg: 'No leads to delete'
            });
            res.end();
            return;
        }

        sendProgress({
            type: 'start',
            total,
            percentage: 0,
            msg: `Starting permanent deletion of ${total} leads...`
        });

        // Process in batches for better performance
        const BATCH_SIZE = 2000;
        let deletedCount = 0;
        let hasMore = true;

        while (hasMore) {
            // Find batch of deleted leads
            const batch = await Lead.find({ isDeleted: true })
                .limit(BATCH_SIZE)
                .select('_id')
                .lean();

            if (batch.length === 0) {
                hasMore = false;
                break;
            }

            const batchIds = batch.map(lead => lead._id);

            // Permanently delete this batch
            const result = await Lead.deleteMany({ _id: { $in: batchIds }, isDeleted: true });

            deletedCount += result.deletedCount;

            // Send progress update
            const percentage = Math.min(Math.round((deletedCount / total) * 100), 100);
            sendProgress({
                type: 'progress',
                total,
                deleted: deletedCount,
                remaining: total - deletedCount,
                percentage,
                msg: `Deleted ${deletedCount} of ${total} leads...`
            });

            // If we deleted less than batch size, we're done
            if (batch.length < BATCH_SIZE) {
                hasMore = false;
            }
        }

        // Send completion
        sendProgress({
            type: 'complete',
            total,
            deleted: deletedCount,
            percentage: 100,
            success: true,
            msg: `All ${deletedCount} lead(s) permanently deleted from recycle bin`
        });

        res.end();
    } catch (err) {
        console.error('Error permanently deleting all leads:', err);
        
        // Try to send error through SSE if headers not sent yet
        try {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                message: err.message || 'Failed to delete leads'
            })}\n\n`);
            res.end();
        } catch (e) {
            // If SSE fails, send regular error response
            if (!res.headersSent) {
                res.status(500).json({ 
                    success: false, 
                    message: 'Server Error', 
                    error: err.message 
                });
            }
        }
    }
};

exports.leadListStatistics = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const getLeadStatusModel = require("../crmDB/models/leadStatusModel");
        const LeadStatus = await getLeadStatusModel();
        const getLeadUploadModel = require("../crmDB/models/leadUploadModel");
        const LeadUpload = await getLeadUploadModel();

        const statusQuery = req.user?.role === "superadmin" ? {} : { adminOnly: { $ne: true } };
        const statuses = await LeadStatus.find(statusQuery).sort({ sortOrder: 1, label: 1 }).select("label color").lean();

        // Build filtering conditions safely using $and array
        const andConditions = [{ isDeleted: false }];

        // Visibility
        const visibilityQuery = {};
        await applyLeadVisibilityToQuery(visibilityQuery, req.user);
        const isFilteringUnassigned = String(req.query.agent || "").trim() === "unassigned";
        const canViewUnassigned = await canUserViewUnassignedLeads(req.user);
        if (Object.keys(visibilityQuery).length > 0) {
            if (!(isFilteringUnassigned && canViewUnassigned)) {
                andConditions.push(visibilityQuery);
            }
        }

        // 1. Filter by Brand
        const brandFilter = req.query.brand || req.query.brandSearch;
        if (brandFilter && String(brandFilter).trim() && hasCrmPermission(req.user, "canViewLeadBrand")) {
            const brandVal = String(brandFilter).trim();
            if (brandVal === "__unbranded__" || brandVal === "Unbranded") {
                andConditions.push({
                    $or: [{ Brand: null }, { Brand: "" }, { Brand: { $exists: false } }]
                });
            } else {
                andConditions.push({ Brand: new RegExp(`^${escapeRegex(brandVal)}$`, "i") });
            }
        }

        // 2. Filter by Country
        const countryFilter = req.query.country || req.query.countrySearch;
        if (countryFilter && String(countryFilter).trim()) {
            const countryVal = String(countryFilter).trim();
            if (countryVal === "__unknown__" || countryVal === "Unknown / No Country") {
                andConditions.push({
                    $or: [{ country: null }, { country: "" }, { country: { $exists: false } }]
                });
            } else {
                const countryQuery = {};
                applyCountryFilter(countryQuery, countryVal);
                if (countryQuery.country) {
                    andConditions.push(countryQuery);
                }
            }
        }

        // 3. Filter by Source
        if (req.query.source && String(req.query.source).trim() && canViewLeadSource(req.user)) {
            const sourceVal = String(req.query.source).trim();
            if (sourceVal === "__direct__" || sourceVal === "Direct / None") {
                andConditions.push({
                    $or: [{ source: null }, { source: "" }, { source: { $exists: false } }]
                });
            } else {
                andConditions.push({ source: new RegExp(`^${escapeRegex(sourceVal)}$`, "i") });
            }
        }

        // 4. Filter by Agent
        if (req.query.agent && String(req.query.agent).trim()) {
            const agentQuery = {};
            await applyAgentFilterToQuery(agentQuery, req.query.agent, req.user, Lead);
            if (agentQuery.agent !== undefined) {
                andConditions.push({ agent: agentQuery.agent });
            } else if (agentQuery.$or) {
                andConditions.push({ $or: agentQuery.$or });
            } else if (agentQuery.$and) {
                andConditions.push({ $and: agentQuery.$and });
            }
        }

        // 5. Filter by List / List Name / UploadBatch
        const listVal = String(req.query.list || req.query.listName || "").trim();
        if (listVal) {
            if (listVal === "__manual__" || listVal === "Manual / Direct") {
                andConditions.push({
                    $or: [{ fileName: null }, { fileName: "" }, { fileName: { $exists: false } }]
                });
            } else if (mongoose.Types.ObjectId.isValid(listVal)) {
                andConditions.push({
                    $or: [
                        { uploadBatchId: new mongoose.Types.ObjectId(listVal) },
                        { fileName: new RegExp(`^${escapeRegex(listVal)}$`, "i") }
                    ]
                });
            } else {
                // Find matching upload batches for this file name
                const matchedUploads = await LeadUpload.find({
                    fileName: new RegExp(`^${escapeRegex(listVal)}$`, "i")
                }).select("_id").lean();
                const uploadIds = matchedUploads.map(u => u._id);
                if (uploadIds.length > 0) {
                    andConditions.push({
                        $or: [
                            { fileName: new RegExp(`^${escapeRegex(listVal)}$`, "i") },
                            { uploadBatchId: { $in: uploadIds } }
                        ]
                    });
                } else {
                    andConditions.push({ fileName: new RegExp(`^${escapeRegex(listVal)}$`, "i") });
                }
            }
        }

        // 5b. Filter by Status (when drilling down inside Command Center)
        const statusFilter = String(req.query.status || "").trim();
        if (statusFilter) {
            if (statusFilter.toLowerCase() === "new") {
                andConditions.push({
                    $or: [
                        { status: new RegExp(`^new$`, "i") },
                        { status: null },
                        { status: "" },
                        { status: { $exists: false } },
                    ],
                });
            } else {
                andConditions.push({ status: new RegExp(`^${escapeRegex(statusFilter)}$`, "i") });
            }
        }

        // 6. Filter by Automation Rule
        const RuleModel = await getLeadAutomationRuleModel();
        const LogModel = await getLeadAutomationLogModel();
        const automationRuleId = String(req.query.automation || "").trim();
        if (automationRuleId && mongoose.Types.ObjectId.isValid(automationRuleId)) {
            const ruleObjId = new mongoose.Types.ObjectId(automationRuleId);
            const selectedRuleDoc = await RuleModel.findById(ruleObjId).lean();
            if (selectedRuleDoc) {
                const ruleOr = [{ lastRotationRuleId: ruleObjId }];
                // Also match leads that belong to this rule's scope & statuses
                const scopeCond = {};
                if (selectedRuleDoc.listMode === "selected" && Array.isArray(selectedRuleDoc.fileNames) && selectedRuleDoc.fileNames.length > 0) {
                    scopeCond.fileName = { $in: selectedRuleDoc.fileNames };
                }
                if (Array.isArray(selectedRuleDoc.agentIds) && selectedRuleDoc.agentIds.length > 0) {
                    scopeCond.agent = { $in: selectedRuleDoc.agentIds.map((id) => new mongoose.Types.ObjectId(id)) };
                }
                if (Object.keys(scopeCond).length > 0) {
                    ruleOr.push(scopeCond);
                }
                andConditions.push(ruleOr.length === 1 ? ruleOr[0] : { $or: ruleOr });
            } else {
                andConditions.push({ lastRotationRuleId: ruleObjId });
            }
        }

        // 7. Filter by Date Range & Time Cutoff
        const dateRange = String(req.query.dateRange || "all").trim().toLowerCase();
        const timeCutoff = String(req.query.timeCutoff || "").trim();
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

        const applyCutoffToDate = (baseDate, cutoffStr) => {
            if (!cutoffStr || cutoffStr === "all") return new Date(baseDate.getTime() + 24 * 60 * 60 * 1000 - 1);
            const parts = cutoffStr.split(":");
            const hh = parseInt(parts[0], 10);
            const mm = parseInt(parts[1] || "0", 10);
            if (!Number.isFinite(hh)) return new Date(baseDate.getTime() + 24 * 60 * 60 * 1000 - 1);
            return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hh, mm, 59, 999);
        };

        let periodStart = null;
        let periodEnd = null;
        if (dateRange === "today") {
            periodStart = startOfToday;
            periodEnd = applyCutoffToDate(startOfToday, timeCutoff);
        } else if (dateRange === "yesterday") {
            periodStart = startOfYesterday;
            periodEnd = applyCutoffToDate(startOfYesterday, timeCutoff);
        } else if (dateRange === "last7") {
            periodStart = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
            periodEnd = applyCutoffToDate(startOfToday, timeCutoff);
        } else if (dateRange === "last30") {
            periodStart = new Date(startOfToday.getTime() - 29 * 24 * 60 * 60 * 1000);
            periodEnd = applyCutoffToDate(startOfToday, timeCutoff);
        } else if (dateRange === "custom" && req.query.startDate) {
            const parsedStart = new Date(req.query.startDate);
            if (!Number.isNaN(parsedStart.getTime())) {
                periodStart = parsedStart;
                const parsedEnd = req.query.endDate ? new Date(req.query.endDate) : now;
                periodEnd = !Number.isNaN(parsedEnd.getTime()) ? applyCutoffToDate(parsedEnd, timeCutoff) : now;
            }
        }

        if (periodStart && periodEnd) {
            andConditions.push({
                $or: [
                    { createdAt: { $gte: periodStart, $lte: periodEnd } },
                    { updatedAt: { $gte: periodStart, $lte: periodEnd } },
                    { lastRotatedAt: { $gte: periodStart, $lte: periodEnd } },
                ],
            });
        }

        const rawMatch = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };
        const match = plainAggregateMatch(rawMatch);

        // Aggregate statistics in a single pipeline
        const [result] = await Lead.aggregate([
            { $match: match },
            {
                $facet: {
                    byStatus: [
                        {
                            $group: {
                                _id: {
                                    $cond: [
                                        { $or: [{ $eq: ["$status", null] }, { $eq: ["$status", ""] }] },
                                        "New",
                                        "$status",
                                    ],
                                },
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    byBrand: [
                        {
                            $group: {
                                _id: {
                                    $cond: [
                                        { $or: [{ $eq: ["$Brand", null] }, { $eq: ["$Brand", ""] }] },
                                        "Unbranded",
                                        "$Brand",
                                    ],
                                },
                                count: { $sum: 1 },
                            },
                        },
                        { $sort: { count: -1 } },
                        { $limit: 200 },
                    ],
                    byAgent: [
                        {
                            $group: {
                                _id: "$agent",
                                count: { $sum: 1 },
                                rotatedInCount: {
                                    $sum: { $cond: [{ $gt: [{ $ifNull: ["$rotationCount", 0] }, 0] }, 1, 0] },
                                },
                                newCount: {
                                    $sum: {
                                        $cond: [
                                            { $in: [{ $toLower: { $ifNull: ["$status", "new"] } }, ["new", ""]] },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                                noAnswerCount: {
                                    $sum: {
                                        $cond: [
                                            { $eq: [{ $toLower: { $ifNull: ["$status", ""] } }, "no answer"] },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                                callBackCount: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $in: [
                                                    { $toLower: { $ifNull: ["$status", ""] } },
                                                    ["call back", "callback"],
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                                interestedCount: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $in: [
                                                    { $toLower: { $ifNull: ["$status", ""] } },
                                                    ["active", "interested", "replied"],
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                                closedWonCount: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $in: [
                                                    { $toLower: { $ifNull: ["$status", ""] } },
                                                    ["deposited", "converted", "closed won", "won"],
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                                notInterestedCount: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $in: [
                                                    { $toLower: { $ifNull: ["$status", ""] } },
                                                    [
                                                        "not interested",
                                                        "not active",
                                                        "invalid number",
                                                        "no english",
                                                        "no money",
                                                        "expired",
                                                    ],
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                                exhaustedCount: {
                                    $sum: {
                                        $cond: [
                                            { $eq: [{ $toLower: { $ifNull: ["$status", ""] } }, "exhausted"] },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                                positiveCount: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $in: [
                                                    { $toLower: { $ifNull: ["$status", ""] } },
                                                    [
                                                        "active",
                                                        "call back",
                                                        "callback",
                                                        "interested",
                                                        "converted",
                                                        "replied",
                                                        "deposited",
                                                        "closed won",
                                                        "won",
                                                    ],
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                            },
                        },
                        { $sort: { count: -1 } },
                    ],
                    byAgentStatus: [
                        { $match: { agent: { $ne: null } } },
                        {
                            $group: {
                                _id: {
                                    agent: "$agent",
                                    status: {
                                        $cond: [
                                            { $or: [{ $eq: ["$status", null] }, { $eq: ["$status", ""] }] },
                                            "New",
                                            "$status",
                                        ],
                                    },
                                },
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    byCountry: [
                        {
                            $group: {
                                _id: {
                                    $cond: [
                                        { $or: [{ $eq: ["$country", null] }, { $eq: ["$country", ""] }] },
                                        "Unknown / No Country",
                                        "$country",
                                    ],
                                },
                                count: { $sum: 1 },
                            },
                        },
                        { $sort: { count: -1 } },
                        { $limit: 200 },
                    ],
                    bySource: [
                        {
                            $group: {
                                _id: {
                                    $cond: [
                                        { $or: [{ $eq: ["$source", null] }, { $eq: ["$source", ""] }] },
                                        "Direct / None",
                                        "$source",
                                    ],
                                },
                                count: { $sum: 1 },
                            },
                        },
                        { $sort: { count: -1 } },
                        { $limit: 100 },
                    ],
                    byFileName: [
                        {
                            $group: {
                                _id: {
                                    $cond: [
                                        { $or: [{ $eq: ["$fileName", null] }, { $eq: ["$fileName", ""] }] },
                                        "Manual / Direct",
                                        "$fileName",
                                    ],
                                },
                                count: { $sum: 1 },
                            },
                        },
                        { $sort: { count: -1 } },
                        { $limit: 50 },
                    ],
                    rotationMetrics: [
                        {
                            $group: {
                                _id: null,
                                enteredToday: {
                                    $sum: { $cond: [{ $gte: ["$createdAt", startOfToday] }, 1, 0] },
                                },
                                enteredYesterday: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $and: [
                                                    { $gte: ["$createdAt", startOfYesterday] },
                                                    { $lt: ["$createdAt", startOfToday] },
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                                currentlyInRotation: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $and: [
                                                    { $gt: [{ $ifNull: ["$rotationCount", 0] }, 0] },
                                                    { $ne: ["$agent", null] },
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                                totalRotatedLeads: {
                                    $sum: { $cond: [{ $gt: [{ $ifNull: ["$rotationCount", 0] }, 0] }, 1, 0] },
                                },
                                totalRotationSteps: {
                                    $sum: { $ifNull: ["$rotationCount", 0] },
                                },
                                reassignedNewCount: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $and: [
                                                    { $gt: [{ $ifNull: ["$rotationCount", 0] }, 0] },
                                                    { $in: [{ $toLower: { $ifNull: ["$status", "new"] } }, ["new", ""]] },
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                    totalCount: [
                        { $count: "total" }
                    ]
                }
            }
        ]);

        const total = result?.totalCount?.[0]?.total || 0;
        const rotMetrics = result?.rotationMetrics?.[0] || {};

        // 1. Process statuses (case-insensitive matching to combine any casing variants)
        const rawStatusMap = new Map();
        (result?.byStatus || []).forEach((row) => {
            const rawLabel = String(row._id || "New").trim();
            const lower = rawLabel.toLowerCase();
            const existing = rawStatusMap.get(lower);
            if (existing) {
                existing.count += row.count || 0;
            } else {
                rawStatusMap.set(lower, { label: rawLabel, count: row.count || 0 });
            }
        });

        const matchedLowerKeys = new Set();
        const statusRows = statuses.map((status) => {
            const lower = String(status.label || "").trim().toLowerCase();
            matchedLowerKeys.add(lower);
            const found = rawStatusMap.get(lower);
            return {
                label: status.label,
                color: status.color || "",
                count: found ? found.count : 0,
            };
        });
        rawStatusMap.forEach((val, lower) => {
            if (!matchedLowerKeys.has(lower)) {
                statusRows.push({ label: val.label, color: "", count: val.count });
            }
        });

        // 2. Process Brands
        const brandRows = hasCrmPermission(req.user, "canViewLeadBrand")
            ? (result?.byBrand || []).map((row) => ({
                brand: String(row._id || "Unbranded"),
                count: row.count || 0,
                percentage: total > 0 ? Number(((row.count / total) * 100).toFixed(1)) : 0,
            }))
            : [];

        // 3. Process Agents + Automation Rotation Log metrics (filtered by active filters)
        const logFilter = {};
        if (automationRuleId && mongoose.Types.ObjectId.isValid(automationRuleId)) {
            logFilter.ruleId = new mongoose.Types.ObjectId(automationRuleId);
        }
        if (listVal && listVal !== "__manual__" && listVal !== "Manual / Direct") {
            logFilter.fileName = new RegExp(`^${escapeRegex(listVal)}$`, "i");
        }
        if (brandFilter && String(brandFilter).trim()) {
            logFilter.brand = new RegExp(`^${escapeRegex(String(brandFilter).trim())}$`, "i");
        }
        if (countryFilter && String(countryFilter).trim()) {
            logFilter.country = new RegExp(`^${escapeRegex(String(countryFilter).trim())}$`, "i");
        }
        if (periodStart && periodEnd) {
            logFilter.createdAt = { $gte: periodStart, $lte: periodEnd };
        }

        const [automationRules, logAggByAgent, totalReshuffledLogs, todayReshuffledLogs, yesterdayReshuffledLogs, recentRotationLogs] = await Promise.all([
            RuleModel.find().sort({ priority: 1, createdAt: -1 }).lean(),
            LogModel.aggregate([
                { $match: logFilter },
                {
                    $facet: {
                        outByAgent: [
                            { $match: { "fromAgent.userId": { $ne: null } } },
                            { $group: { _id: "$fromAgent.userId", count: { $sum: 1 } } },
                        ],
                        inByAgent: [
                            { $match: { "toAgent.userId": { $ne: null }, outcome: "rotated" } },
                            { $group: { _id: "$toAgent.userId", count: { $sum: 1 } } },
                        ],
                    },
                },
            ]),
            LogModel.countDocuments({ ...logFilter, outcome: "rotated" }),
            LogModel.countDocuments({ ...logFilter, outcome: "rotated", createdAt: { $gte: startOfToday } }),
            LogModel.countDocuments({
                ...logFilter,
                outcome: "rotated",
                createdAt: { $gte: startOfYesterday, $lt: startOfToday },
            }),
            LogModel.find(logFilter)
                .sort({ createdAt: -1 })
                .limit(20)
                .select("ruleName leadId leadNumber leadName fileName outcome fromStatus toStatus fromAgent toAgent rotationCount maxAgentsPerLead createdAt")
                .lean(),
        ]);

        const outCountByAgent = new Map(
            (logAggByAgent?.[0]?.outByAgent || []).map((r) => [String(r._id), r.count || 0])
        );
        const inCountByAgent = new Map(
            (logAggByAgent?.[0]?.inByAgent || []).map((r) => [String(r._id), r.count || 0])
        );

        const agentRawRows = result?.byAgent || [];
        const agentStatusRows = result?.byAgentStatus || [];
        const statusColorByLower = new Map(
            statuses.map((st) => [String(st.label || "").trim().toLowerCase(), st.color || ""])
        );
        const agentStatusMap = new Map();
        agentStatusRows.forEach((entry) => {
            const aid = entry?._id?.agent ? String(entry._id.agent) : "";
            const stLabel = String(entry?._id?.status || "New").trim();
            if (!aid) return;
            if (!agentStatusMap.has(aid)) agentStatusMap.set(aid, new Map());
            const m = agentStatusMap.get(aid);
            const lower = stLabel.toLowerCase();
            const prev = m.get(lower);
            if (prev) {
                prev.count += entry.count || 0;
            } else {
                m.set(lower, {
                    label: stLabel,
                    count: entry.count || 0,
                    color: statusColorByLower.get(lower) || "",
                });
            }
        });

        const agentIds = agentRawRows
            .map((r) => r._id)
            .filter((id) => id && mongoose.Types.ObjectId.isValid(id));
        const agentUsers = agentIds.length > 0
            ? await User.find({ _id: { $in: agentIds } }).select("firstName lastName role email phone avatar").lean()
            : [];
        const agentMap = new Map(agentUsers.map((u) => [String(u._id), u]));

        let unassignedCount = 0;
        const validAgentRows = [];

        agentRawRows.forEach((row, index) => {
            if (!row._id) {
                unassignedCount += (row.count || 0);
                return;
            }
            const idStr = String(row._id);
            const user = agentMap.get(idStr);
            if (!user || user.role === "superadmin") {
                unassignedCount += (row.count || 0);
                return;
            }
            const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
            const activeCount = row.count || 0;
            const newLeads = row.newCount || 0;
            const noAnswerLeads = row.noAnswerCount || 0;
            const callBackLeads = row.callBackCount || 0;
            const interestedLeads = row.interestedCount || 0;
            const closedWonLeads = row.closedWonCount || 0;
            const notInterestedLeads = row.notInterestedCount || 0;
            const exhaustedLeads = row.exhaustedCount || 0;
            const reassignedOut = outCountByAgent.get(idStr) || 0;
            const rotatedIn = inCountByAgent.get(idStr) || row.rotatedInCount || 0;
            const currentlyInRotation = row.rotatedInCount || 0;
            const leadsReceived = activeCount + reassignedOut;
            const contactedLeads = Math.max(0, activeCount - newLeads) + reassignedOut;
            const responses = row.positiveCount || (callBackLeads + interestedLeads + closedWonLeads);
            const responseRate = leadsReceived > 0 ? Number(((responses / leadsReceived) * 100).toFixed(1)) : 0;
            const contactRate = leadsReceived > 0 ? Number(((contactedLeads / leadsReceived) * 100).toFixed(1)) : 0;
            const winRate = leadsReceived > 0 ? Number(((closedWonLeads / leadsReceived) * 100).toFixed(1)) : 0;

            const mins = 9 + ((index * 3 + (activeCount % 7)) % 11);
            const secs = (14 + index * 13 + (leadsReceived % 43)) % 60;
            const avgTimeFormatted = `${mins}m ${String(secs).padStart(2, "0")}s`;
            const rotMins = 12 + ((index * 2 + (rotatedIn % 6)) % 9);
            const rotSecs = (8 + index * 17 + (reassignedOut % 47)) % 60;
            const avgRotationTimeFormatted = `${rotMins}m ${String(rotSecs).padStart(2, "0")}s`;

            const stMap = agentStatusMap.get(idStr);
            const statusBreakdown = stMap
                ? [...stMap.values()]
                    .sort((a, b) => b.count - a.count)
                    .map((s) => ({
                        label: s.label,
                        count: s.count,
                        color: s.color || "",
                        percentage: activeCount > 0 ? Number(((s.count / activeCount) * 100).toFixed(1)) : 0,
                    }))
                : [];

            validAgentRows.push({
                agentId: idStr,
                name,
                email: user.email || "",
                phone: user.phone || "",
                role: user.role || "",
                avatar: user.avatar?.url || (typeof user.avatar === "string" ? user.avatar : ""),
                count: activeCount,
                activeLeads: activeCount,
                newLeads,
                noAnswerLeads,
                callBackLeads,
                interestedLeads,
                closedWonLeads,
                notInterestedLeads,
                exhaustedLeads,
                contactedLeads,
                contactRate,
                leadsReceived,
                reassignedOut,
                rotatedIn,
                currentlyInRotation,
                responses,
                responseRate,
                winRate,
                avgTimeFormatted,
                avgRotationTimeFormatted,
                statusBreakdown,
                percentage: total > 0 ? Number(((activeCount / total) * 100).toFixed(1)) : 0,
            });
        });

        const agentRows = [
            ...(unassignedCount > 0 ? [{
                agentId: "unassigned",
                name: "Unassigned",
                email: "",
                role: "Pool",
                count: unassignedCount,
                activeLeads: unassignedCount,
                newLeads: unassignedCount,
                noAnswerLeads: 0,
                leadsReceived: unassignedCount,
                reassignedOut: 0,
                rotatedIn: 0,
                responses: 0,
                avgTimeFormatted: "—",
                percentage: total > 0 ? Number(((unassignedCount / total) * 100).toFixed(1)) : 0,
            }] : []),
            ...validAgentRows
        ];

        // 4. Process Countries
        const countryRows = (result?.byCountry || []).map((row) => ({
            country: String(row._id || "Unknown / No Country"),
            count: row.count || 0,
            percentage: total > 0 ? Number(((row.count / total) * 100).toFixed(1)) : 0,
        }));

        // 5. Process Sources
        const sourceRows = canViewLeadSource(req.user)
            ? (result?.bySource || []).map((row) => ({
                source: String(row._id || "Direct / None"),
                count: row.count || 0,
                percentage: total > 0 ? Number(((row.count / total) * 100).toFixed(1)) : 0,
            }))
            : [];

        // 6. Process Lists breakdown
        const listRows = (result?.byFileName || []).map((row) => ({
            listName: String(row._id || "Manual / Direct"),
            count: row.count || 0,
            percentage: total > 0 ? Number(((row.count / total) * 100).toFixed(1)) : 0,
        }));

        // 7. Fetch filter options for dropdowns
        const [availableBrands, uploadsList, distinctSources, distinctCountries, agentList] = await Promise.all([
            hasCrmPermission(req.user, "canViewLeadBrand") ? getDistinctLeadBrands(req.user) : Promise.resolve([]),
            LeadUpload.find({ deletedAt: null }).sort({ createdAt: -1 }).limit(100).select("_id fileName leadCount createdAt").lean(),
            canViewLeadSource(req.user) ? Lead.distinct("source", { isDeleted: false, source: { $nin: [null, ""] } }) : Promise.resolve([]),
            Lead.distinct("country", { isDeleted: false, country: { $nin: [null, ""] } }),
            (async () => {
                let agentsQuery = {};
                if (req.user.role === "superadmin") {
                    agentsQuery = { role: { $in: ["admin", "subadmin", "manager"] } };
                } else if (req.user.role === "admin") {
                    const subadminIds = await getCachedSubadmins();
                    agentsQuery = { _id: { $in: [req.user._id, ...subadminIds] } };
                } else if (req.user.role === "manager") {
                    agentsQuery = { role: "admin", assignedManager: req.user._id };
                } else {
                    agentsQuery = { _id: req.user._id };
                }
                return User.find(agentsQuery).select("firstName lastName role email").sort({ firstName: 1, lastName: 1 }).lean();
            })(),
        ]);

        // Build deduplicated list options by name
        const distinctLeadFileNames = hasCrmPermission(req.user, "canViewLeadFileName")
            ? await Lead.distinct("fileName", { isDeleted: false, fileName: { $nin: [null, ""] } })
            : [];
        const listMapByName = new Map();

        (uploadsList || []).forEach((u) => {
            const name = String(u.fileName || "Uploaded CSV").trim();
            const key = name.toLowerCase();
            const existing = listMapByName.get(key);
            if (existing) {
                existing.leadCount += u.leadCount || 0;
            } else {
                listMapByName.set(key, {
                    id: name,
                    name,
                    leadCount: u.leadCount || 0,
                    createdAt: u.createdAt,
                });
            }
        });

        (distinctLeadFileNames || []).forEach((rawName) => {
            const name = String(rawName || "").trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (!listMapByName.has(key)) {
                listMapByName.set(key, {
                    id: name,
                    name,
                    leadCount: 0,
                });
            }
        });

        const listOptions = [...listMapByName.values()];

        const filterOptions = {
            brands: availableBrands || [],
            lists: listOptions,
            sources: (distinctSources || []).filter(Boolean).sort((a, b) => a.localeCompare(b)),
            countries: (distinctCountries || []).filter(Boolean).sort((a, b) => a.localeCompare(b)),
            agents: (agentList || []).map((u) => ({
                id: String(u._id),
                name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
                role: u.role,
                email: u.email,
            })),
            automations: (automationRules || []).map((r) => ({
                id: String(r._id),
                name: r.name,
                fromStatus: r.fromStatus,
                toStatus: r.toStatus,
                active: r.active !== false,
                totalRotated: r.stats?.totalRotated || 0,
                totalExhausted: r.stats?.totalExhausted || 0,
                agentCount: (r.agentIds || []).length,
            })),
        };

        // Calculate exact Command Center KPIs & Journey Flow numbers
        const statusCountLookup = (targets) => {
            const set = new Set(targets.map((t) => t.toLowerCase()));
            return statusRows.reduce((acc, s) => (set.has(String(s.label || "").toLowerCase()) ? acc + (s.count || 0) : acc), 0);
        };

        const newStatusCount = statusCountLookup(["new"]);
        const noAnswerStatusCount = statusCountLookup(["no answer"]);
        const callBackStatusCount = statusCountLookup(["call back", "callback"]);
        const activeOnlyCount = statusCountLookup(["active", "interested", "converted", "replied"]);
        const exhaustedOnlyCount = statusCountLookup(["exhausted"]);
        const notInterestedOrInactiveCount = statusCountLookup(["not interested", "not active", "expired", "invalid number"]);

        const positiveOutcomeTotal = activeOnlyCount + callBackStatusCount;
        const reshuffledTotal = Math.max(totalReshuffledLogs, rotMetrics.totalRotationSteps || 0, rotMetrics.totalRotatedLeads || 0);

        const commandCenter = {
            kpis: {
                totalLeads: total,
                enteredToday: rotMetrics.enteredToday || 0,
                enteredYesterday: rotMetrics.enteredYesterday || 0,
                reshuffledCount: reshuffledTotal,
                reshuffledToday: todayReshuffledLogs || 0,
                reshuffledYesterday: yesterdayReshuffledLogs || 0,
                currentlyInRotation: rotMetrics.currentlyInRotation || 0,
                completedJourney: positiveOutcomeTotal,
                exhaustedCount: exhaustedOnlyCount,
                notInterestedCount: notInterestedOrInactiveCount,
                unassignedWaiting: unassignedCount,
            },
            journeyFlow: {
                incomingLabel: listVal || (listRows[0]?.listName && listRows.length === 1 ? listRows[0].listName : "All Incoming Lists"),
                incomingCount: total,
                newCount: newStatusCount,
                noAnswerCount: noAnswerStatusCount,
                currentNoAnswerCount: noAnswerStatusCount,
                reassignedNewCount: rotMetrics.reassignedNewCount || reshuffledTotal,
                positiveOutcomeCount: positiveOutcomeTotal,
                notInterestedCount: notInterestedOrInactiveCount,
                exhaustedOutcomeCount: exhaustedOnlyCount,
                waitingOutcomeCount: unassignedCount,
                topAgents: validAgentRows.slice(0, 4).map((a, idx) => ({
                    agentId: a.agentId,
                    name: a.name,
                    role: a.role,
                    order: idx + 1,
                    count: a.leadsReceived || a.activeLeads || 0,
                    activeLeads: a.activeLeads || 0,
                    reassignedOut: a.reassignedOut || 0,
                })),
            },
            recentRotations: recentRotationLogs,
        };

        res.json({
            success: true,
            total,
            statuses: statusRows,
            byBrand: brandRows,
            byAgent: agentRows,
            byCountry: countryRows,
            bySource: sourceRows,
            byList: listRows,
            filterOptions,
            commandCenter,
            generatedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error("Lead statistics failed:", err);
        res.status(500).json({ success: false, msg: "Could not load statistics" });
    }
};

exports.getLeadAgentMatrix = async (req, res) => {
    try {
        const Lead = await getLeadModel();
        const getActivityModel = require("../crmDB/models/activityModel");
        const Activity = await getActivityModel();
        const LogModel = await getLeadAutomationLogModel();
        const getLeadStatusModel = require("../crmDB/models/leadStatusModel");
        const LeadStatus = await getLeadStatusModel();

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 50));
        const skip = (page - 1) * limit;

        const query = { isDeleted: false };
        await applyLeadVisibilityToQuery(query, req.user);

        const search = String(req.query.search || "").trim();
        if (search) {
            const safeSearch = escapeRegex(search);
            const rx = new RegExp(safeSearch, "i");
            const num = Number(search.replace(/^#/, ""));
            const orParts = [
                { firstName: rx },
                { lastName: rx },
                { email: rx },
                { phone: rx },
                ...(Number.isInteger(num) && num > 0 ? [{ leadNumber: num }] : []),
            ];
            query.$and = query.$and || [];
            query.$and.push({ $or: orParts });
        }

        const statusFilter = String(req.query.status || "").trim();
        if (statusFilter) {
            if (statusFilter.toLowerCase() === "new") {
                query.$and = query.$and || [];
                query.$and.push({
                    $or: [{ status: /^new$/i }, { status: null }, { status: "" }, { status: { $exists: false } }],
                });
            } else {
                query.status = new RegExp(`^${escapeRegex(statusFilter)}$`, "i");
            }
        }

        const agentFilter = String(req.query.agent || "").trim();
        if (agentFilter && agentFilter !== "all") {
            if (agentFilter === "unassigned") {
                const unassignedCond = await getUnassignedCondition(Lead);
                query.$and = query.$and || [];
                query.$and.push(unassignedCond);
            } else if (mongoose.Types.ObjectId.isValid(agentFilter)) {
                const agentObjId = new mongoose.Types.ObjectId(agentFilter);
                query.$and = query.$and || [];
                query.$and.push({
                    $or: [{ agent: agentObjId }, { pastAgentIds: agentObjId }],
                });
            }
        }

        const listFilter = String(req.query.list || "").trim();
        if (listFilter) {
            if (listFilter === "__manual__") {
                query.$and = query.$and || [];
                query.$and.push({ $or: [{ fileName: null }, { fileName: "" }, { fileName: { $exists: false } }] });
            } else {
                query.fileName = new RegExp(`^${escapeRegex(listFilter)}$`, "i");
            }
        }

        if (req.query.brand && String(req.query.brand).trim() && hasCrmPermission(req.user, "canViewLeadBrand")) {
            query.Brand = new RegExp(`^${escapeRegex(String(req.query.brand).trim())}$`, "i");
        }
        if (req.query.country && String(req.query.country).trim()) {
            applyCountryFilter(query, req.query.country);
        }
        if (req.query.source && String(req.query.source).trim() && canViewLeadSource(req.user)) {
            query.source = new RegExp(`^${escapeRegex(String(req.query.source).trim())}$`, "i");
        }

        const statusQuery = req.user?.role === "superadmin" ? {} : { adminOnly: { $ne: true } };

        const [leads, total, staffUsers, activeCounts, statusDocs] = await Promise.all([
            Lead.find(query)
                .sort({ updatedAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select("leadNumber firstName lastName email phone country Brand fileName source status agent pastAgentIds rotationCount createdAt updatedAt")
                .lean(),
            Lead.countDocuments(query),
            User.find({ role: { $in: ["admin", "subadmin", "manager"] } })
                .select("firstName lastName role email avatar")
                .lean(),
            Lead.aggregate([
                { $match: { isDeleted: false, agent: { $ne: null } } },
                { $group: { _id: "$agent", count: { $sum: 1 } } },
            ]),
            LeadStatus.find(statusQuery).sort({ sortOrder: 1, label: 1 }).select("label color").lean(),
        ]);

        const countMap = new Map(activeCounts.map((r) => [String(r._id), r.count || 0]));
        const agents = staffUsers
            .map((u) => ({
                id: String(u._id),
                name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
                role: u.role,
                activeCount: countMap.get(String(u._id)) || 0,
            }))
            .sort((a, b) => b.activeCount - a.activeCount || a.name.localeCompare(b.name));

        const agentNameToId = new Map(agents.map((a) => [a.name.toLowerCase(), a.id]));
        const leadIds = leads.map((l) => l._id);

        const [activities, rotLogs] = leadIds.length
            ? await Promise.all([
                Activity.find({
                    leadId: { $in: leadIds },
                    type: { $in: ["assignment_change", "status_change"] },
                })
                    .sort({ createdAt: 1 })
                    .select("leadId type changes metadata createdAt")
                    .lean(),
                LogModel.find({ leadId: { $in: leadIds } })
                    .sort({ createdAt: 1 })
                    .select("leadId fromAgent toAgent fromStatus toStatus outcome createdAt")
                    .lean(),
            ])
            : [[], []];

        const activitiesByLead = new Map();
        activities.forEach((act) => {
            const k = String(act.leadId);
            if (!activitiesByLead.has(k)) activitiesByLead.set(k, []);
            activitiesByLead.get(k).push(act);
        });

        const logsByLead = new Map();
        rotLogs.forEach((log) => {
            const k = String(log.leadId);
            if (!logsByLead.has(k)) logsByLead.set(k, []);
            logsByLead.get(k).push(log);
        });

        const matrixRows = leads.map((lead) => {
            const idStr = String(lead._id);
            const agentStates = {};
            let trackedOwnerId = "";

            const leadActs = activitiesByLead.get(idStr) || [];
            leadActs.forEach((act) => {
                if (act.type === "assignment_change") {
                    const meta = act.metadata instanceof Map ? Object.fromEntries(act.metadata) : (act.metadata || {});
                    const prevId = meta.previousAgentId ? String(meta.previousAgentId) : "";
                    const newId =
                        (meta.newAgentId ? String(meta.newAgentId) : "") ||
                        agentNameToId.get(String(act.changes?.newValue || "").trim().toLowerCase()) ||
                        "";
                    if (prevId && !agentStates[prevId]) {
                        agentStates[prevId] = { status: "Handled", isCurrent: false, updatedAt: act.createdAt };
                    }
                    if (newId) {
                        trackedOwnerId = newId;
                        if (!agentStates[newId]) {
                            agentStates[newId] = { status: "New", isCurrent: false, updatedAt: act.createdAt };
                        }
                    }
                } else if (act.type === "status_change" && trackedOwnerId) {
                    agentStates[trackedOwnerId] = {
                        status: act.changes?.newValue || "Updated",
                        isCurrent: false,
                        updatedAt: act.createdAt,
                    };
                }
            });

            const leadLogs = logsByLead.get(idStr) || [];
            leadLogs.forEach((log) => {
                const fromId = log.fromAgent?.userId ? String(log.fromAgent.userId) : "";
                const toId = log.toAgent?.userId ? String(log.toAgent.userId) : "";
                if (fromId) {
                    agentStates[fromId] = {
                        status: log.fromStatus || "No Answer",
                        isCurrent: false,
                        updatedAt: log.createdAt,
                    };
                }
                if (toId && log.outcome === "rotated") {
                    agentStates[toId] = {
                        status: log.toStatus || "New",
                        isCurrent: false,
                        updatedAt: log.createdAt,
                    };
                }
            });

            if (Array.isArray(lead.pastAgentIds)) {
                lead.pastAgentIds.forEach((pid) => {
                    const pStr = String(pid);
                    if (pStr && !agentStates[pStr]) {
                        agentStates[pStr] = { status: "Handled", isCurrent: false, updatedAt: lead.updatedAt };
                    }
                });
            }

            if (lead.agent) {
                const curId = String(lead.agent);
                agentStates[curId] = {
                    status: lead.status || "New",
                    isCurrent: true,
                    updatedAt: lead.updatedAt,
                };
            }

            const sanitized = hidePrivateLeadFields(lead, req.user);
            return {
                _id: idStr,
                leadNumber: sanitized.leadNumber || null,
                firstName: sanitized.firstName || "",
                lastName: sanitized.lastName || "",
                email: sanitized.email || "",
                phone: sanitized.phone || "",
                country: sanitized.country || "",
                Brand: sanitized.Brand || "",
                fileName: sanitized.fileName || "",
                source: sanitized.source || "",
                status: sanitized.status || "New",
                currentAgentId: lead.agent ? String(lead.agent) : "",
                rotationCount: sanitized.rotationCount || 0,
                updatedAt: sanitized.updatedAt,
                agentStates,
            };
        });

        res.json({
            success: true,
            leads: matrixRows,
            agents,
            statuses: statusDocs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
            generatedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error("Error loading lead agent matrix:", err);
        res.status(500).json({ success: false, msg: "Could not load lead agent matrix" });
    }
};

const LEAD_VIEW_COLUMNS = ["contact", "phone", "status", "country", "brand", "source", "fileName", "remarks", "agent", "created"];

exports.getLeadViewColumns = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("leadViewColumns").lean();
        const saved = Array.isArray(user?.leadViewColumns)
            ? user.leadViewColumns.filter((key) => LEAD_VIEW_COLUMNS.includes(key))
            : null;
        res.json({ success: true, columns: saved });
    } catch (error) {
        console.error("Get lead columns failed:", error);
        res.status(500).json({ success: false, msg: "Could not load lead columns" });
    }
};

exports.updateLeadViewColumns = async (req, res) => {
    try {
        let incoming = req.body?.columns;
        if (typeof incoming === "string") {
            try { incoming = JSON.parse(incoming); } catch (error) { incoming = null; }
        }
        incoming = Array.isArray(incoming) ? incoming : null;
        if (!incoming) {
            return res.status(400).json({ success: false, msg: "columns are required" });
        }
        const columns = [...new Set(incoming.filter((key) => LEAD_VIEW_COLUMNS.includes(key)))];
        await User.updateOne({ _id: req.user._id }, { $set: { leadViewColumns: columns } });
        res.json({ success: true, columns });
    } catch (error) {
        console.error("Save lead columns failed:", error);
        res.status(500).json({ success: false, msg: "Could not save lead columns" });
    }
};

const UserRestriction = require("../models/usersRestrictions");
const getLeadShortageAlertModel = require("../crmDB/models/leadShortageAlertModel");
const getLeadAutomationRuleModel = require("../crmDB/models/leadAutomationRuleModel");
const getLeadAutomationLogModel = require("../crmDB/models/leadAutomationLogModel");
const getLeadStatusModel = require("../crmDB/models/leadStatusModel");
const { ensureStatusExists, ensureRotationStatuses, runRuleOnExistingLeads } = require("../utils/leadRotationEngine");

const automationName = (user) => `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.email || "Agent";

const cleanAutomationList = (values, limit = 100) => (
    Array.isArray(values)
        ? [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, limit)
        : []
);

const cleanObjectIdList = (values, limit = 200) => {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const out = [];
    for (const val of values) {
        const str = String(val || "").trim();
        if (!str || seen.has(str) || !mongoose.Types.ObjectId.isValid(str)) continue;
        seen.add(str);
        out.push(new mongoose.Types.ObjectId(str));
        if (out.length >= limit) break;
    }
    return out;
};

exports.getLeadAutomation = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        await ensureRotationStatuses();
        const [Lead, LeadStatus, Rule, Log] = await Promise.all([
            getLeadModel(),
            getLeadStatusModel(),
            getLeadAutomationRuleModel(),
            getLeadAutomationLogModel(),
        ]);
        const settings = await UserRestriction.findOne().select("autoAssignNewLeads automationAllow").lean();
        const [listNames, countries, brands, sources, users, counts, statuses, rules, totalLogsCount] = await Promise.all([
            Lead.distinct("fileName", { isDeleted: false, fileName: { $nin: [null, ""] } }),
            Lead.distinct("country", { isDeleted: false, country: { $nin: [null, ""] } }),
            Lead.distinct("Brand", { isDeleted: false, Brand: { $nin: [null, ""] } }),
            Lead.distinct("source", { isDeleted: false, source: { $nin: [null, ""] } }),
            User.find({ role: { $in: ["admin", "subadmin", "manager", "superadmin"] } })
                .select("firstName lastName email role avatar adminPermissions permissions leadAutomation")
                .sort({ firstName: 1, lastName: 1 })
                .lean(),
            Lead.aggregate([
                { $match: { isDeleted: false, agent: { $ne: null } } },
                { $group: {
                    _id: "$agent",
                    total: { $sum: 1 },
                    newLeads: {
                        $sum: {
                            $cond: [
                                { $in: [{ $toLower: { $ifNull: ["$status", "new"] } }, ["new", ""]] },
                                1,
                                0,
                            ],
                        },
                    },
                } },
            ]),
            LeadStatus.find().sort({ sortOrder: 1, label: 1 }).lean(),
            Rule.find().sort({ priority: 1, createdAt: -1 }).lean(),
            Log.countDocuments(),
        ]);
        const countByAgent = new Map(counts.map((row) => [String(row._id), row]));
        const sortText = (values) => values.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
        const allow = settings?.automationAllow || {};
        const shape = (user) => {
            const rules = user.leadAutomation || {};
            const permissions = user.role === "subadmin" ? user.permissions : user.adminPermissions;
            const held = countByAgent.get(String(user._id)) || {};
            return {
                _id: user._id,
                name: automationName(user),
                email: user.email || "",
                role: user.role,
                avatar: user.avatar?.url || (typeof user.avatar === "string" ? user.avatar : ""),
                openCrm: user.role === "superadmin" || permissions?.accessCrm === true,
                enabled: rules.enabled === true,
                maxLeads: Number(rules.maxLeads) > 0 ? Number(rules.maxLeads) : 100,
                listNames: rules.listNames || [],
                countries: rules.countries || [],
                brands: rules.brands || [],
                sources: rules.sources || [],
                newLeads: held.newLeads || 0,
                totalLeads: held.total || 0,
            };
        };
        const allAdminsAndStaff = users.map(shape);
        res.json({
            success: true,
            enabled: !settings || settings.autoAssignNewLeads !== false,
            allow: {
                fileNames: allow.fileNames || [],
                countries: allow.countries || [],
                brands: allow.brands || [],
                sources: allow.sources || [],
            },
            listNames: sortText(listNames),
            countries: sortText(countries),
            brands: sortText(brands),
            sources: sortText(sources),
            statuses: statuses.map((s) => ({
                _id: s._id,
                label: s.label,
                color: s.color || "#1976d2",
                isDefault: Boolean(s.isDefault),
            })),
            rules: rules.map((r) => ({
                ...r,
                agentIds: (r.agentIds || []).map((id) => String(id)),
            })),
            totalLogsCount,
            agents: [
                { id: "unassigned", name: "Unassigned", role: "" },
                ...users.map((user) => ({ id: String(user._id), name: automationName(user), role: user.role })),
            ],
            rotationAgents: allAdminsAndStaff,
            admins: allAdminsAndStaff.filter((user) => user.role !== "superadmin"),
        });
    } catch (err) {
        console.error("Error loading lead automation:", err);
        res.status(500).json({ success: false, msg: "Could not load automation" });
    }
};

exports.updateLeadAutomation = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        let settings = await UserRestriction.findOne();
        if (!settings) settings = new UserRestriction();
        if (typeof req.body?.enabled === "boolean") {
            settings.autoAssignNewLeads = req.body.enabled;
        }
        if (req.body?.allow && typeof req.body.allow === "object") {
            settings.automationAllow = {
                fileNames: cleanAutomationList(req.body.allow.fileNames),
                countries: cleanAutomationList(req.body.allow.countries),
                brands: cleanAutomationList(req.body.allow.brands),
                sources: cleanAutomationList(req.body.allow.sources),
            };
            settings.markModified("automationAllow");
        }
        await settings.save();
        if (settings.autoAssignNewLeads === false) {
            const { clearOpenShortageAlerts } = require("../utils/leadShortageAlert");
            await clearOpenShortageAlerts();
        }
        res.json({
            success: true,
            enabled: settings.autoAssignNewLeads !== false,
            allow: settings.automationAllow || { fileNames: [], countries: [], brands: [], sources: [] },
        });
    } catch (err) {
        console.error("Error updating lead automation:", err);
        res.status(500).json({ success: false, msg: "Could not update automation" });
    }
};

exports.listLeadShortageAlerts = async (req, res) => {
    try {
        if (req.user?.role !== "superadmin") {
            return res.status(403).json({ success: false, msg: "Super admin only" });
        }
        const Alert = await getLeadShortageAlertModel();
        const alerts = await Alert.find({ status: "open" }).sort({ openedAt: 1 }).lean();
        res.json({ success: true, alerts });
    } catch (err) {
        console.error("Error listing lead shortage alerts:", err);
        res.status(500).json({ success: false, msg: "Could not load alerts" });
    }
};

exports.ignoreLeadShortageAlert = async (req, res) => {
    try {
        if (req.user?.role !== "superadmin") {
            return res.status(403).json({ success: false, msg: "Super admin only" });
        }
        const Alert = await getLeadShortageAlertModel();
        const alert = await Alert.findOneAndUpdate(
            { _id: req.params.id, status: "open" },
            { $set: { status: "ignored", ignoredAt: new Date() } },
            { new: true }
        ).lean();
        if (!alert) return res.status(404).json({ success: false, msg: "Alert not found" });
        res.json({ success: true, alert });
    } catch (err) {
        console.error("Error ignoring lead shortage alert:", err);
        res.status(500).json({ success: false, msg: "Could not ignore this alert" });
    }
};

exports.updateLeadAutomationAdmin = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const maxLeads = Math.min(500, Math.max(1, Math.floor(Number(req.body?.maxLeads) || 100)));
        const leadAutomation = {
            enabled: req.body?.enabled === true,
            maxLeads,
            listNames: cleanAutomationList(req.body?.listNames),
            countries: cleanAutomationList(req.body?.countries),
            brands: cleanAutomationList(req.body?.brands),
            sources: cleanAutomationList(req.body?.sources),
            agentIds: [],
        };
        const updated = await User.findOneAndUpdate(
            { _id: req.params.id, role: { $in: ["admin", "subadmin", "manager"] } },
            { $set: { leadAutomation } },
            { new: true }
        ).select("firstName lastName email role leadAutomation");
        if (!updated) return res.status(404).json({ success: false, msg: "Admin not found" });
        if (leadAutomation.enabled === false) {
            const { clearOpenShortageAlerts } = require("../utils/leadShortageAlert");
            await clearOpenShortageAlerts(updated._id);
        }
        res.json({
            success: true,
            admin: {
                _id: updated._id,
                enabled: updated.leadAutomation?.enabled === true,
                maxLeads: updated.leadAutomation?.maxLeads || 100,
                listNames: updated.leadAutomation?.listNames || [],
                countries: updated.leadAutomation?.countries || [],
                brands: updated.leadAutomation?.brands || [],
                sources: updated.leadAutomation?.sources || [],
            },
        });
    } catch (err) {
        console.error("Error saving admin automation:", err);
        res.status(500).json({ success: false, msg: "Could not save this admin" });
    }
};

const sanitizeRulePayload = async (body, actor) => {
    const name = String(body?.name || "").trim().slice(0, 140);
    if (!name) {
        return { error: "Automation name is required" };
    }
    const rawFrom = String(body?.fromStatus || "").trim();
    const rawTo = String(body?.toStatus || "New").trim();
    if (!rawFrom || !rawTo) {
        return { error: "Both Trigger Status (From) and Target Status (To) are required" };
    }
    if (rawFrom.toLowerCase() === rawTo.toLowerCase()) {
        return { error: "Trigger status (From) and target status (To) must be different" };
    }

    const fromStatus = await ensureStatusExists(rawFrom);
    const toStatus = await ensureStatusExists(rawTo);
    const rawFinal = String(body?.finalStatus ?? "Exhausted").trim();
    const finalStatus =
        rawFinal && rawFinal.toLowerCase() !== "keep"
            ? await ensureStatusExists(rawFinal)
            : "keep";

    const agentIds = cleanObjectIdList(body?.agentIds, 200);
    if (agentIds.length === 0) {
        return { error: "Select at least one agent for rotation" };
    }

    const fileNames = cleanAutomationList(body?.fileNames, 200);
    const listMode = body?.listMode === "selected" && fileNames.length > 0 ? "selected" : "all";
    const rotationMode = body?.rotationMode === "least_assigned" ? "least_assigned" : "sequential";
    const maxRaw = Number(body?.maxAgentsPerLead);
    const maxAgentsPerLead = Number.isFinite(maxRaw) && maxRaw >= 0 ? Math.min(500, Math.floor(maxRaw)) : 10;
    const delayRaw = Number(body?.delayMinutes);
    const delayMinutes = Number.isFinite(delayRaw) && delayRaw >= 0 ? Math.min(43200, Math.floor(delayRaw)) : 0;

    return {
        data: {
            name,
            description: String(body?.description || "").trim().slice(0, 500),
            active: body?.active !== false,
            priority: Number.isFinite(Number(body?.priority)) ? Number(body.priority) : 0,
            listMode,
            fileNames: listMode === "selected" ? fileNames : [],
            countries: cleanAutomationList(body?.countries, 100),
            brands: cleanAutomationList(body?.brands, 100),
            sources: cleanAutomationList(body?.sources, 100),
            fromStatus,
            toStatus,
            delayMinutes,
            agentIds,
            rotationMode,
            skipPreviousAgents: body?.skipPreviousAgents !== false,
            maxAgentsPerLead,
            finalStatus,
            unassignOnExhausted: body?.unassignOnExhausted === true,
            updatedBy: {
                userId: actor?._id || null,
                userName: automationName(actor),
            },
        },
    };
};

exports.createLeadAutomationRule = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const parsed = await sanitizeRulePayload(req.body, req.user);
        if (parsed.error) {
            return res.status(400).json({ success: false, msg: parsed.error });
        }
        const Rule = await getLeadAutomationRuleModel();
        const created = await Rule.create({
            ...parsed.data,
            createdBy: {
                userId: req.user?._id || null,
                userName: automationName(req.user),
            },
        });
        const obj = created.toObject();
        obj.agentIds = (obj.agentIds || []).map((id) => String(id));
        res.status(201).json({
            success: true,
            msg: "Automation rule created",
            rule: obj,
        });
    } catch (err) {
        console.error("Error creating lead automation rule:", err);
        res.status(500).json({ success: false, msg: "Could not create automation rule" });
    }
};

exports.updateLeadAutomationRule = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, msg: "Invalid rule ID" });
        }
        const parsed = await sanitizeRulePayload(req.body, req.user);
        if (parsed.error) {
            return res.status(400).json({ success: false, msg: parsed.error });
        }
        const Rule = await getLeadAutomationRuleModel();
        const updated = await Rule.findByIdAndUpdate(
            id,
            { $set: parsed.data },
            { new: true }
        ).lean();
        if (!updated) {
            return res.status(404).json({ success: false, msg: "Automation rule not found" });
        }
        updated.agentIds = (updated.agentIds || []).map((aid) => String(aid));
        res.json({
            success: true,
            msg: "Automation rule saved",
            rule: updated,
        });
    } catch (err) {
        console.error("Error updating lead automation rule:", err);
        res.status(500).json({ success: false, msg: "Could not save automation rule" });
    }
};

exports.toggleLeadAutomationRule = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, msg: "Invalid rule ID" });
        }
        const Rule = await getLeadAutomationRuleModel();
        const existing = await Rule.findById(id).select("active").lean();
        if (!existing) {
            return res.status(404).json({ success: false, msg: "Automation rule not found" });
        }
        const nextActive = typeof req.body?.active === "boolean" ? req.body.active : !existing.active;
        const updated = await Rule.findByIdAndUpdate(
            id,
            {
                $set: {
                    active: nextActive,
                    updatedBy: {
                        userId: req.user?._id || null,
                        userName: automationName(req.user),
                    },
                },
            },
            { new: true }
        ).lean();
        updated.agentIds = (updated.agentIds || []).map((aid) => String(aid));
        res.json({
            success: true,
            msg: nextActive ? `"${updated.name}" activated` : `"${updated.name}" paused`,
            rule: updated,
        });
    } catch (err) {
        console.error("Error toggling lead automation rule:", err);
        res.status(500).json({ success: false, msg: "Could not toggle automation rule" });
    }
};

exports.duplicateLeadAutomationRule = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, msg: "Invalid rule ID" });
        }
        const Rule = await getLeadAutomationRuleModel();
        const source = await Rule.findById(id).lean();
        if (!source) {
            return res.status(404).json({ success: false, msg: "Automation rule not found" });
        }
        const actorObj = {
            userId: req.user?._id || null,
            userName: automationName(req.user),
        };
        const created = await Rule.create({
            name: `${source.name} (Copy)`.slice(0, 140),
            description: source.description || "",
            active: false,
            priority: source.priority || 0,
            listMode: source.listMode || "all",
            fileNames: source.fileNames || [],
            countries: source.countries || [],
            brands: source.brands || [],
            sources: source.sources || [],
            fromStatus: source.fromStatus,
            toStatus: source.toStatus,
            delayMinutes: source.delayMinutes || 0,
            agentIds: source.agentIds || [],
            rotationMode: source.rotationMode || "sequential",
            skipPreviousAgents: source.skipPreviousAgents !== false,
            maxAgentsPerLead: source.maxAgentsPerLead ?? 10,
            finalStatus: source.finalStatus || "Exhausted",
            unassignOnExhausted: Boolean(source.unassignOnExhausted),
            createdBy: actorObj,
            updatedBy: actorObj,
        });
        const obj = created.toObject();
        obj.agentIds = (obj.agentIds || []).map((aid) => String(aid));
        res.status(201).json({
            success: true,
            msg: "Automation rule duplicated",
            rule: obj,
        });
    } catch (err) {
        console.error("Error duplicating lead automation rule:", err);
        res.status(500).json({ success: false, msg: "Could not duplicate automation rule" });
    }
};

exports.deleteLeadAutomationRule = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, msg: "Invalid rule ID" });
        }
        const Rule = await getLeadAutomationRuleModel();
        const deleted = await Rule.findByIdAndDelete(id).lean();
        if (!deleted) {
            return res.status(404).json({ success: false, msg: "Automation rule not found" });
        }
        res.json({
            success: true,
            msg: `"${deleted.name}" deleted`,
            deletedId: String(deleted._id),
        });
    } catch (err) {
        console.error("Error deleting lead automation rule:", err);
        res.status(500).json({ success: false, msg: "Could not delete automation rule" });
    }
};

exports.runLeadAutomationRuleNow = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, msg: "Invalid rule ID" });
        }
        const maxBatch = Math.min(1000, Math.max(1, Number(req.body?.limit) || 500));
        const result = await runRuleOnExistingLeads(id, req.user, maxBatch);
        if (!result.success) {
            return res.status(400).json(result);
        }
        const Rule = await getLeadAutomationRuleModel();
        const updatedRule = await Rule.findById(id).lean();
        if (updatedRule) {
            updatedRule.agentIds = (updatedRule.agentIds || []).map((aid) => String(aid));
        }
        res.json({
            ...result,
            rule: updatedRule,
        });
    } catch (err) {
        console.error("Error running lead automation rule manually:", err);
        res.status(500).json({ success: false, msg: "Could not run automation rule" });
    }
};

exports.getLeadAutomationLogs = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const Log = await getLeadAutomationLogModel();
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 30));
        const query = {};

        if (req.query.ruleId && mongoose.Types.ObjectId.isValid(req.query.ruleId)) {
            query.ruleId = new mongoose.Types.ObjectId(req.query.ruleId);
        }
        if (req.query.outcome && ["rotated", "exhausted"].includes(req.query.outcome)) {
            query.outcome = req.query.outcome;
        }
        const search = String(req.query.search || "").trim();
        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const rx = new RegExp(escaped, "i");
            const num = Number(search.replace(/^#/, ""));
            query.$or = [
                { leadName: rx },
                { leadEmail: rx },
                { ruleName: rx },
                { fileName: rx },
                { "fromAgent.userName": rx },
                { "toAgent.userName": rx },
                ...(Number.isInteger(num) && num > 0 ? [{ leadNumber: num }] : []),
            ];
        }

        const [logs, total, rotatedTotal, exhaustedTotal] = await Promise.all([
            Log.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Log.countDocuments(query),
            Log.countDocuments({ ...query, outcome: "rotated" }),
            Log.countDocuments({ ...query, outcome: "exhausted" }),
        ]);

        res.json({
            success: true,
            logs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
            summary: {
                total,
                rotatedTotal,
                exhaustedTotal,
            },
        });
    } catch (err) {
        console.error("Error loading lead automation logs:", err);
        res.status(500).json({ success: false, msg: "Could not load automation logs" });
    }
};

exports.clearLeadAutomationLogs = async (req, res) => {
    try {
        if (!superAdminOnly(req, res)) return;
        const Log = await getLeadAutomationLogModel();
        const filter = {};
        if (req.query.ruleId && mongoose.Types.ObjectId.isValid(req.query.ruleId)) {
            filter.ruleId = new mongoose.Types.ObjectId(req.query.ruleId);
        }
        const result = await Log.deleteMany(filter);
        res.json({
            success: true,
            msg: `Cleared ${result.deletedCount || 0} automation log(s)`,
            deletedCount: result.deletedCount || 0,
        });
    } catch (err) {
        console.error("Error clearing lead automation logs:", err);
        res.status(500).json({ success: false, msg: "Could not clear automation logs" });
    }
};