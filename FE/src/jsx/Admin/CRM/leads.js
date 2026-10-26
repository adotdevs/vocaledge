import React, { useEffect, useState, useCallback, useMemo, memo, useRef, startTransition } from "react";
import {
    Box,
    AppBar,
    Toolbar,
    Typography,
    TextField,
    Button,
    IconButton,
    Card,
    CardContent,
    Grid,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Menu,
    MenuItem,
    CircularProgress,
    InputAdornment,
    Select,
    FormControl,
    InputLabel,
    Pagination,
    Stack,
    Badge,
    Avatar,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stepper,
    Step,
    StepLabel,
    StepContent,
    Tabs,
    Tab,
    FormControlLabel,
    Checkbox,
    FormGroup,
    Alert,
    Checkbox as MuiCheckbox,
    Collapse,
    List,
    ListItem,
    ListItemText,
    Divider,
    LinearProgress,
    Tooltip,
    Autocomplete,
} from "@mui/material";
import {
    Add,
    Search,
    FilterList,
    Download,
    MoreVert,
    Visibility,
    Edit,
    Delete,
    Email,
    Phone,
    Mail,
    BarChart,
    Schedule,
    AttachMoney,
    People,
    CloudUpload,
    Description,
    Close,
    SwapHoriz,
    LocationOn,
    NavigateBefore,
    NavigateNext,
    KeyboardArrowDown,
    KeyboardArrowUp,
    DeleteSweep,
    SelectAll,
    DeselectOutlined,
    Menu as MenuIcon,
    CheckCircle,
    Upload as UploadIcon,
    PersonAdd as PersonAddIcon,
    PhoneInTalk,
    PhoneCallback,
    PhoneDisabled,
    Cancel,
    AccessTime,
    Comment,
    Alarm,
    NotificationsActive,
    OpenInNew,
    ContentCopy,
} from "@mui/icons-material";
import {
    adminCrmLeadsApi,
    createLeadApi,
    uploadLeadsCsvApi,
    uploadLeadsCsvStreamApi,
    deleteLeadApi,
    deleteLeadsBulkApi,
    deleteAllLeadsApi,
    deleteAllLeadsApiWithProgress,
    updateLeadApi, exportLeadsApi,
    allUsersApi,
    signleUsersApi,
    assignLeadsApi,
    bulkUpdateLeadStatusApi,
    activateLeadApi,
    activateLeadsBulkApi,
    initiateCallApi,
    bulkCallLeadsApi,
    scheduleCallApi,
    getCallStatusApi,
    getActiveCallsApi,
    cancelCallApi,
    activateLeadsBulkWithProgress,
    getEmailQueueStatusApi,
    getLeadWithActivityApi,
    addLeadCommentApi
} from "../../../Api/Service";
import { toast } from "react-toastify";
import Sidebar from "./Sidebar.js";
import LeadUploadHistory from "./components/LeadUploadHistory";
import CrmAccessDenied from "./components/CrmAccessDenied";
import { useNavigate, useSearchParams } from "react-router-dom";
import { subscribeChatEvents } from "./chatEvents";
import { useAuthUser } from "react-auth-kit";
import { debounce } from "../../../utils/debounce";
// Removed socket.io-client - using SSE instead
import { mapSipEventsToStatus } from '../../../utils/callStatus';
import sseClient from '../../../utils/sseClient';
import CrmAppBarActions from './components/CrmAppBarActions';
import { getBackendUrl } from '../../../config/appConfig';
import LeadStatusSelect from './components/LeadStatusSelect';
import InlineLeadStatusCell from './components/InlineLeadStatusCell';
import {
    fetchLeadStatuses,
    getCachedLeadStatuses,
    subscribeLeadStatuses,
} from './components/leadStatusCache';
import { contrastText, getStatusChipSx, getStatusColor } from './components/leadStatusStyles';
import useLiveCrmUser from './useLiveCrmUser';
import SendLeadEmailDialog from './components/SendLeadEmailDialog';
import LeadRemindersSection from './components/LeadRemindersSection';
import ReminderModal from './components/ReminderModal';
import { CustomerFieldsEditor, CustomerFieldsFilters, CustomerFieldsView } from './components/CustomerFields';
import { applyCustomerFieldChange, emptyCustomerFields, customerFieldsFromLead } from './leadCustomerFields';

const statusCountBadgeSx = (chipColor, filled) => {
    const ink = filled ? contrastText(chipColor || "#5e35b1") : "#3d4754";
    return {
        px: 0.75,
        minWidth: 22,
        height: 18,
        borderRadius: "999px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.68rem",
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: 0,
        bgcolor: filled ? ink : "#e7ebf0",
        color: filled ? (chipColor || "#5e35b1") : "#3d4754",
        boxShadow: filled ? "none" : "inset 0 0 0 1px rgba(15, 23, 42, 0.08)",
    };
};

// ... (Field mapping configuration and CreateLeadDialog component remain the same)
// Field mapping configuration based on updated schema
const AVAILABLE_FIELDS = [
    { key: 'firstName', label: 'First Name', required: true, description: 'Lead first name' },
    { key: 'lastName', label: 'Last Name', required: true, description: 'Lead last name' },
    { key: 'email', label: 'Email', required: false, description: 'Email address' },
    { key: 'phone', label: 'Phone', required: false, description: 'Phone number' },
    { key: 'country', label: 'Country', required: false, description: 'Country name' },
    { key: 'Brand', label: 'Brand', required: false, description: 'Map a column, or type one brand for every lead', allowText: true },
    { key: 'source', label: 'Source', required: false, description: 'Type a source to assign to every lead', inputOnly: true },
    { key: 'fileName', label: 'File Name', required: false, description: 'Type a file name to assign to every lead', inputOnly: true },
    { key: 'Address', label: 'Address', required: false, description: 'Physical address' },
    { key: 'status', label: 'Status', required: false, description: 'Lead status (uses your configured statuses)' },
];

// Enhanced Create Lead Dialog Component - Memoized for performance
const CreateLeadDialog = memo(({ open, onClose, onLeadCreated, agents, currentUser, allowCsvUpload, allowManageStatuses, allowViewSource = false, allowViewBrand = false, allowViewFileName = false }) => {
    const leadFields = AVAILABLE_FIELDS.filter((field) => {
        if (field.key === 'source' && !allowViewSource) return false;
        if (field.key === 'Brand' && !allowViewBrand) return false;
        if (field.key === 'fileName' && !allowViewFileName) return false;
        return true;
    });

    const [activeStep, setActiveStep] = useState(0);
    const [tabValue, setTabValue] = useState(0);
    const [manualForm, setManualForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        country: "",
        Brand: "",
        source: "",
        fileName: "",
        Address: "",
        status: "New",
        ...emptyCustomerFields(),
    });
    const [overrideBrand, setOverrideBrand] = useState("");
    const [overrideSource, setOverrideSource] = useState("");
    const [overrideFileName, setOverrideFileName] = useState("");
    const [csvFile, setCsvFile] = useState(null);
    const [csvHeaders, setCsvHeaders] = useState([]);
    const [csvPreview, setCsvPreview] = useState([]);
    const [fieldMapping, setFieldMapping] = useState({});
    const [callAfterUpload, setCallAfterUpload] = useState(false);
    const [addPhonePlusPrefix, setAddPhonePlusPrefix] = useState(false);
    const [uploadedLeadIds, setUploadedLeadIds] = useState([]);
    const [selectedFields, setSelectedFields] = useState({});
    const [uploading, setUploading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [mappingComplete, setMappingComplete] = useState(false);
    const [selectedAgentId, setSelectedAgentId] = useState("");
    const [uploadProgress, setUploadProgress] = useState({
        total: 0,
        uploaded: 0,
        skipped: 0,
        remaining: 0,
        percentage: 0,
        isUploading: false
    });

    useEffect(() => {
        // Default assigned agent behavior based on role
        if (open && currentUser?.user) {
            if (currentUser.user.role === 'manager' && agents.length > 0) {
                // Manager: default to first assigned admin (if any)
                setSelectedAgentId(agents[0]._id);
            } else if (currentUser.user.role === 'superadmin' && agents.length > 0) {
                // Superadmin: default to first agent (if any)
                setSelectedAgentId(agents[0]._id);
            } else if (currentUser.user.role !== 'manager' && currentUser.user.role !== 'superadmin') {
                // Other roles: default to self
                setSelectedAgentId(currentUser.user._id);
            } else {
                // Manager/Superadmin with no agents: leave empty
                setSelectedAgentId("");
            }
        }
    }, [open, currentUser, agents]);

    const steps = ['Choose Method', 'Upload & Map Fields', 'Review & Submit'];

    // Prevent CSV tab when not allowed (subadmin or admin without permission)
    useEffect(() => {
        if (!allowCsvUpload && tabValue === 1) {
            setTabValue(0);
        }
    }, [allowCsvUpload, tabValue]);

    // Initialize selected fields
    useEffect(() => {
        const initialSelectedFields = {};
        leadFields.forEach(field => {
            initialSelectedFields[field.key] = field.required;
        });
        setSelectedFields(initialSelectedFields);
    }, []);

    const handleManualFormChange = (field, value) => {
        setManualForm((prev) => applyCustomerFieldChange(prev, field, value));
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
            setCsvFile(file);
            parseCsvHeaders(file);
        } else {
            toast.error('Please select a valid CSV file');
        }
    };

    const parseCsvHeaders = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const csvText = e.target.result;
            const lines = csvText.split('\n');
            const headers = lines[0].split(',').map(header => header.trim().replace(/"/g, ''));

            setCsvHeaders(headers);

            // Create preview of first 3 rows
            const previewRows = lines.slice(1, 4).map(line => {
                const values = line.split(',').map(value => value.trim().replace(/"/g, ''));
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                return row;
            }).filter(row => Object.values(row).some(val => val !== ''));

            setCsvPreview(previewRows);

            // Auto-map fields based on header names
            const autoMapping = {};
            headers.forEach(header => {
                const matchedField = leadFields.find(field =>
                    header.toLowerCase().includes(field.key.toLowerCase()) ||
                    field.key.toLowerCase().includes(header.toLowerCase()) ||
                    header.toLowerCase().includes(field.label.toLowerCase())
                );
                if (matchedField) {
                    autoMapping[matchedField.key] = header;
                }
            });
            setFieldMapping(autoMapping);
        };
        reader.readAsText(file);
    };

    const handleFieldMappingChange = (fieldKey, csvHeader) => {
        setFieldMapping(prev => ({
            ...prev,
            [fieldKey]: csvHeader
        }));
    };

    const handleFieldSelectionChange = (fieldKey, isSelected) => {
        setSelectedFields(prev => ({
            ...prev,
            [fieldKey]: isSelected
        }));

        // If deselecting a field, remove from mapping and clear typed overrides
        if (!isSelected) {
            setFieldMapping(prev => {
                const newMapping = { ...prev };
                delete newMapping[fieldKey];
                return newMapping;
            });
            if (fieldKey === 'Brand') setOverrideBrand("");
            if (fieldKey === 'source') setOverrideSource("");
        }
    };

    const validateFieldMapping = () => {
        // Check if all required fields are mapped
        const requiredFields = leadFields.filter(field => field.required);
        const missingRequired = requiredFields.some(field =>
            selectedFields[field.key] && !fieldMapping[field.key]
        );

        if (missingRequired) {
            toast.error('Please map all required fields');
            return false;
        }

        // Check if at least one field is selected
        const hasSelectedFields = Object.values(selectedFields).some(selected => selected);
        if (!hasSelectedFields) {
            toast.error('Please select at least one field to import');
            return false;
        }

        return true;
    };

    const handleManualSubmit = async () => {
        try {
            setCreating(true);

            // Validate: Manager must select an admin
            if (currentUser?.user?.role === 'manager' && !selectedAgentId) {
                toast.error('Please select an admin to assign the lead to');
                setCreating(false);
                return;
            }

            const payload = { ...manualForm, addPhonePlusPrefix };
            // Superadmin and manager can select agent
            if ((currentUser?.user?.role === 'superadmin' || currentUser?.user?.role === 'manager') && selectedAgentId) {
                payload.agentId = selectedAgentId;
            }
            const response = await createLeadApi(payload);
            if (response.success) {
                toast.success('Lead created successfully!');
                onLeadCreated();
                onClose();
                resetForm();
            } else {
                toast.error(response.msg || 'Failed to create lead');
            }
        } catch (error) {
            toast.error('Error creating lead');
            console.error('Create lead error:', error);
        } finally {
            setCreating(false);
        }
    };

    // Handle bulk calling after CSV upload
    const handleBulkCallAfterUpload = async (leadIds) => {
        if (!leadIds || leadIds.length === 0) {
            toast.warning('No leads to call');
            return;
        }

        try {
            toast.info(`Initiating calls for ${leadIds.length} leads...`);
            const response = await bulkCallLeadsApi(leadIds, { delay: 5000 });

            if (response.success) {
                toast.success(`Queued ${response.calls.length} calls for sequential processing`);
            } else {
                // Check if it's a Vapi config error
                if (response.requiresVapiConfig || response.msg?.includes('Vapi API key')) {
                    toast.error(response.msg || response.message || 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.');
                } else {
                    toast.error(response.msg || response.message || 'Failed to initiate bulk calls');
                }
            }
        } catch (error) {
            console.error('Error initiating bulk calls:', error);
            // Check if it's a Vapi config error
            if (error.response?.data?.requiresVapiConfig || error.response?.data?.msg?.includes('Vapi API key')) {
                toast.error(error.response?.data?.msg || error.response?.data?.message || 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.');
            } else {
                toast.error(error.response?.data?.msg || error.response?.data?.message || 'Error initiating bulk calls');
            }
        }
    };

    const handleCsvUpload = async () => {
        if (!csvFile) {
            toast.error('Please select a CSV file');
            return;
        }

        // Validate: Manager must select an admin
        if (currentUser?.user?.role === 'manager' && !selectedAgentId) {
            toast.error('Please select an admin to assign the leads to');
            return;
        }

        if (!validateFieldMapping()) {
            return;
        }

        try {
            setUploading(true);

            // Initialize progress
            setUploadProgress({
                total: 0,
                uploaded: 0,
                skipped: 0,
                remaining: 0,
                percentage: 0,
                isUploading: true
            });

            const formData = new FormData();
            formData.append('file', csvFile);
            formData.append('fieldMapping', JSON.stringify(fieldMapping));
            formData.append('selectedFields', JSON.stringify(selectedFields));
            formData.append('enableProgress', 'true'); // Enable SSE progress
            formData.append('addPhonePlusPrefix', addPhonePlusPrefix ? 'true' : 'false');
            formData.append('overrideBrand', selectedFields.Brand ? overrideBrand.trim() : '');
            formData.append('source', selectedFields.source ? overrideSource.trim() : '');
            formData.append('fileName', selectedFields.fileName ? overrideFileName.trim() : '');
            // Superadmin and manager can select agent for bulk upload
            if ((currentUser?.user?.role === 'superadmin' || currentUser?.user?.role === 'manager') && selectedAgentId) {
                formData.append('agentId', selectedAgentId);
            }

            // Use the streaming API with progress callback
            const result = await uploadLeadsCsvStreamApi(formData, (eventData) => {
                if (eventData.type === 'start') {
                    setUploadProgress({
                        total: eventData.total,
                        uploaded: 0,
                        skipped: 0,
                        remaining: eventData.total,
                        percentage: 0,
                        isUploading: true
                    });
                } else if (eventData.type === 'progress') {
                    const total = eventData.total || 0;
                    const uploaded = eventData.uploaded || 0;
                    const skipped = eventData.skipped || 0;
                    const remaining = Math.max(0, total - uploaded - skipped);
                    setUploadProgress({
                        total: total,
                        uploaded: uploaded,
                        skipped: skipped,
                        remaining: remaining,
                        percentage: eventData.percentage || 0,
                        isUploading: true
                    });
                } else if (eventData.type === 'complete') {
                    setUploadProgress({
                        total: eventData.data.processed + eventData.data.skipped,
                        uploaded: eventData.data.processed,
                        skipped: eventData.data.skipped,
                        remaining: 0,
                        percentage: 100,
                        isUploading: false
                    });

                    toast.success(eventData.msg);

                    // Show warning if leads were skipped
                    if (eventData.data.skipped > 0) {
                        setTimeout(() => {
                            toast.warning(`${eventData.data.skipped} lead(s) skipped due to duplicate emails`, {
                                autoClose: 5000
                            });
                        }, 500);
                    }

                    // Store uploaded lead IDs if call after upload is enabled
                    if (callAfterUpload && eventData.data.processed > 0) {
                        // Fetch the newly uploaded leads to get their IDs
                        // We'll trigger bulk calling after a short delay
                        setUploadedLeadIds(eventData.data.leadIds || []);
                    }

                    // Wait a bit to show 100% completion
                    setTimeout(() => {
                        onLeadCreated();

                        // If call after upload is enabled, initiate bulk calls
                        if (callAfterUpload && eventData.data.processed > 0) {
                            handleBulkCallAfterUpload(eventData.data.leadIds || []);
                        }

                        onClose();
                        resetForm();
                    }, 1500);
                } else if (eventData.type === 'error') {
                    // Stop upload immediately on error
                    setUploading(false);
                    setUploadProgress({
                        total: 0,
                        uploaded: 0,
                        skipped: 0,
                        remaining: 0,
                        percentage: 0,
                        isUploading: false
                    });

                    // Show specific error message
                    const errorMsg = eventData.message || 'Upload failed';
                    toast.error(errorMsg, {
                        autoClose: 8000
                    });
                }
            });

            // Check if the result indicates failure
            if (result && !result.success) {
                setUploading(false);
                setUploadProgress({
                    total: 0,
                    uploaded: 0,
                    skipped: 0,
                    remaining: 0,
                    percentage: 0,
                    isUploading: false
                });

                const errorMsg = result.msg || result.message || 'Upload failed';
                toast.error(errorMsg, {
                    autoClose: 8000
                });
                return; // Stop execution
            }

        } catch (error) {
            toast.error('Error uploading leads');
            console.error('Upload leads error:', error);
            setUploadProgress({
                total: 0,
                uploaded: 0,
                skipped: 0,
                remaining: 0,
                percentage: 0,
                isUploading: false
            });
        } finally {
            setUploading(false);
        }
    };

    const resetForm = () => {
        setCallAfterUpload(false);
        setAddPhonePlusPrefix(false);
        setUploadedLeadIds([]);
        setManualForm({
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            country: "",
            Brand: "",
            source: "",
            fileName: "",
            Address: "",
            status: "New",
            ...emptyCustomerFields(),
        });
        setOverrideBrand("");
        setOverrideSource("");
        setOverrideFileName("");
        setCsvFile(null);
        setCsvHeaders([]);
        setCsvPreview([]);
        setFieldMapping({});
        setMappingComplete(false);
        setActiveStep(0);
        setTabValue(0);
        setSelectedAgentId("");
        setUploadProgress({
            total: 0,
            uploaded: 0,
            skipped: 0,
            remaining: 0,
            percentage: 0,
            isUploading: false
        });

        // Reset selected fields to defaults
        const initialSelectedFields = {};
        leadFields.forEach(field => {
            initialSelectedFields[field.key] = field.required;
        });
        setSelectedFields(initialSelectedFields);
    };

    const handleNext = () => {
        if (activeStep === 1 && tabValue === 1) {
            if (!validateFieldMapping()) {
                return;
            }
            setMappingComplete(true);
        }
        setActiveStep((prev) => prev + 1);
    };

    const handleBack = () => {
        setActiveStep((prev) => prev - 1);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const renderPhonePlusPrefixOption = (sx = {}) => (
        <Box
            sx={{
                mt: 2,
                mb: 2,
                p: 2,
                bgcolor: 'info.light',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'info.main',
                ...sx,
            }}
        >
            <FormControlLabel
                control={
                    <MuiCheckbox
                        checked={addPhonePlusPrefix}
                        onChange={(e) => setAddPhonePlusPrefix(e.target.checked)}
                        color="primary"
                    />
                }
                label={
                    <Box>
                        <Typography variant="body2" color="white" sx={{ fontWeight: 600 }}>
                            Add + prefix to all phone numbers
                        </Typography>
                        <Typography variant="caption" color="white">
                            When checked, every phone number will be saved with a leading + (e.g. +1234567890)
                        </Typography>
                    </Box>
                }
            />
        </Box>
    );

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="lg"
            fullWidth
            fullScreen={typeof window !== 'undefined' && window.innerWidth < 600}
        >
            <DialogTitle>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6">Create New Lead</Typography>
                    <IconButton onClick={handleClose}>
                        <Close />
                    </IconButton>
                </Box>
            </DialogTitle>

            <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
                <Stepper activeStep={activeStep} orientation="vertical">
                    {/* Step 1: Choose Method */}
                    <Step>
                        <StepLabel>Choose Creation Method</StepLabel>
                        <StepContent>
                            <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ mb: 2 }}>
                                <Tab label="Manual Entry" />
                                {allowCsvUpload && (
                                    <Tab label="CSV Upload" />
                                )}
                            </Tabs>

                            {tabValue === 0 && (
                                <Box>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        Add a single lead manually by filling out the form
                                    </Typography>
                                    <Button variant="contained" onClick={handleNext}>
                                        Continue with Manual Entry
                                    </Button>
                                </Box>
                            )}

                            {tabValue === 1 && allowCsvUpload && (
                                <Box>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        Upload a CSV file to create multiple leads at once
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        component="label"
                                        startIcon={<CloudUpload />}
                                        sx={{ mb: 2 }}
                                    >
                                        Select CSV File
                                        <input
                                            type="file"
                                            hidden
                                            accept=".csv"
                                            onChange={handleFileUpload}
                                        />
                                    </Button>
                                    {csvFile && (
                                        <>
                                            <Typography variant="body2" sx={{ mb: 2 }}>
                                                Selected: {csvFile.name} ({csvHeaders.length} columns detected)
                                            </Typography>
                                            {renderPhonePlusPrefixOption({ mt: 0 })}
                                        </>
                                    )}
                                    <Box>
                                        <Button
                                            variant="contained"
                                            onClick={handleNext}
                                            disabled={!csvFile}
                                        >
                                            Continue with CSV Upload
                                        </Button>
                                    </Box>
                                </Box>
                            )}
                        </StepContent>
                    </Step>

                    {/* Step 2: Enter Details / Map Fields */}
                    <Step>
                        <StepLabel>
                            {tabValue === 0 ? 'Enter Lead Details' : 'Map CSV Fields'}
                        </StepLabel>
                        <StepContent>
                            {tabValue === 0 ? (
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            label="First Name"
                                            value={manualForm.firstName}
                                            onChange={(e) => handleManualFormChange('firstName', e.target.value)}
                                            required
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            label="Last Name"
                                            value={manualForm.lastName}
                                            onChange={(e) => handleManualFormChange('lastName', e.target.value)}
                                            required
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            label="Email"
                                            type="email"
                                            value={manualForm.email}
                                            onChange={(e) => handleManualFormChange('email', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            label="Phone"
                                            value={manualForm.phone}
                                            onChange={(e) => handleManualFormChange('phone', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        {renderPhonePlusPrefixOption({ mt: 0, mb: 0 })}
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            label="Country"
                                            value={manualForm.country}
                                            onChange={(e) => handleManualFormChange('country', e.target.value)}
                                        />
                                    </Grid>
                                    {allowViewBrand && (
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            label="Brand"
                                            value={manualForm.Brand}
                                            onChange={(e) => handleManualFormChange('Brand', e.target.value)}
                                            placeholder="Brand assigned to this lead"
                                        />
                                    </Grid>
                                    )}
                                    {allowViewSource && (
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            label="Source"
                                            value={manualForm.source}
                                            onChange={(e) => handleManualFormChange('source', e.target.value)}
                                            placeholder="Where this lead came from"
                                        />
                                    </Grid>
                                    )}
                                    {allowViewFileName && (
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            label="File Name"
                                            value={manualForm.fileName}
                                            onChange={(e) => handleManualFormChange('fileName', e.target.value)}
                                            placeholder="File name for this lead"
                                        />
                                    </Grid>
                                    )}
                                    <Grid item xs={12}>
                                        <TextField
                                            fullWidth
                                            label="Address"
                                            value={manualForm.Address}
                                            onChange={(e) => handleManualFormChange('Address', e.target.value)}
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <LocationOn />
                                                    </InputAdornment>
                                                ),
                                            }}
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <CustomerFieldsEditor
                                            values={manualForm}
                                            country={manualForm.country}
                                            onChange={handleManualFormChange}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <LeadStatusSelect
                                            value={manualForm.status}
                                            onChange={(e) => handleManualFormChange('status', e.target.value)}
                                            allowManage={allowManageStatuses}
                                            onStatusesChange={(statuses) => {
                                                const defaultStatus = statuses.find((s) => s.isDefault)?.label || statuses[0]?.label;
                                                if (defaultStatus) {
                                                    setManualForm((prev) => {
                                                        if (!prev.status || prev.status === 'New') {
                                                            return { ...prev, status: defaultStatus };
                                                        }
                                                        return prev;
                                                    });
                                                }
                                            }}
                                        />
                                    </Grid>
                                </Grid>
                            ) : (
                                <Box>
                                    <Alert severity="info" sx={{ mb: 2 }}>
                                        Map your CSV columns to the lead fields. Required fields are marked with *
                                    </Alert>

                                    {renderPhonePlusPrefixOption()}

                                    {/* CSV Preview */}
                                    {csvPreview.length > 0 && (
                                        <Box sx={{ mb: 3 }}>
                                            <Typography variant="subtitle2" gutterBottom>
                                                CSV Preview (first 3 rows):
                                            </Typography>
                                            <TableContainer component={Paper} variant="outlined">
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            {csvHeaders.map(header => (
                                                                <TableCell key={header} sx={{ fontWeight: 'bold' }}>
                                                                    {header}
                                                                </TableCell>
                                                            ))}
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {csvPreview.map((row, index) => (
                                                            <TableRow key={index}>
                                                                {csvHeaders.map(header => (
                                                                    <TableCell key={header}>
                                                                        {row[header] || '-'}
                                                                    </TableCell>
                                                                ))}
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        </Box>
                                    )}

                                    {/* Field Mapping Interface */}
                                    <Typography variant="subtitle2" gutterBottom>
                                        Field Mapping:
                                    </Typography>
                                    <Grid container spacing={2}>
                                        {leadFields.map(field => (
                                            <Grid item xs={12} key={field.key}>
                                                <Card variant="outlined">
                                                    <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                                                        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                                                            <Box display="flex" alignItems="center" gap={2} flex={1}>
                                                                <FormControlLabel
                                                                    control={
                                                                        <Checkbox
                                                                            checked={selectedFields[field.key] || false}
                                                                            onChange={(e) => handleFieldSelectionChange(field.key, e.target.checked)}
                                                                            disabled={field.required}
                                                                        />
                                                                    }
                                                                    label={
                                                                        <Box>
                                                                            <Typography variant="body2" fontWeight="medium">
                                                                                {field.label} {field.required && '*'}
                                                                            </Typography>
                                                                            <Typography variant="caption" color="text.secondary">
                                                                                {field.description}
                                                                            </Typography>
                                                                        </Box>
                                                                    }
                                                                />
                                                            </Box>

                                                            {selectedFields[field.key] && !field.inputOnly && (
                                                                <Box display="flex" alignItems="center" gap={1} flex={1}>
                                                                    <SwapHoriz fontSize="small" color="action" />
                                                                    <FormControl size="small" fullWidth>
                                                                        <InputLabel>Map to CSV column</InputLabel>
                                                                        <Select
                                                                            value={fieldMapping[field.key] || ''}
                                                                            label="Map to CSV column"
                                                                            onChange={(e) => handleFieldMappingChange(field.key, e.target.value)}
                                                                        >
                                                                            <MenuItem value="">
                                                                                <em>Select column...</em>
                                                                            </MenuItem>
                                                                            {csvHeaders.map(header => (
                                                                                <MenuItem key={header} value={header}>
                                                                                    {header}
                                                                                </MenuItem>
                                                                            ))}
                                                                        </Select>
                                                                    </FormControl>
                                                                </Box>
                                                            )}
                                                            {selectedFields[field.key] && field.allowText && (
                                                                <TextField
                                                                    size="small"
                                                                    label="Or type brand for all leads"
                                                                    placeholder="Assigned to every lead"
                                                                    value={overrideBrand}
                                                                    onChange={(e) => setOverrideBrand(e.target.value)}
                                                                    sx={{ flex: '1 1 240px' }}
                                                                />
                                                            )}
                                                            {selectedFields[field.key] && field.inputOnly && field.key === 'source' && (
                                                                <TextField
                                                                    size="small"
                                                                    label="Type source for all leads"
                                                                    placeholder="Assigned to every lead"
                                                                    value={overrideSource}
                                                                    onChange={(e) => setOverrideSource(e.target.value)}
                                                                    sx={{ flex: '1 1 240px' }}
                                                                />
                                                            )}
                                                            {selectedFields[field.key] && field.inputOnly && field.key === 'fileName' && (
                                                                <TextField
                                                                    size="small"
                                                                    label="Type file name for all leads"
                                                                    placeholder="Assigned to every lead"
                                                                    value={overrideFileName}
                                                                    onChange={(e) => setOverrideFileName(e.target.value)}
                                                                    sx={{ flex: '1 1 240px' }}
                                                                />
                                                            )}
                                                        </Box>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                        ))}
                                    </Grid>

                                    {/* Mapping Summary */}
                                    <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                                        <Typography variant="caption" display="block" gutterBottom>
                                            <strong>Mapping Summary:</strong>
                                        </Typography>
                                        <Typography variant="caption" display="block">
                                            Selected: {Object.values(selectedFields).filter(Boolean).length} fields |
                                            Mapped: {Object.values(fieldMapping).filter(Boolean).length} fields
                                        </Typography>
                                    </Box>
                                </Box>
                            )}
                            <Box sx={{ mt: 2 }}>
                                <Button onClick={handleBack} sx={{ mr: 1 }}>
                                    Back
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={handleNext}
                                    disabled={
                                        tabValue === 0 && (!manualForm.firstName || !manualForm.lastName)
                                    }
                                >
                                    Next
                                </Button>
                            </Box>
                        </StepContent>
                    </Step>

                    {/* Step 3: Review & Submit */}
                    <Step>
                        <StepLabel>Review & Submit</StepLabel>
                        <StepContent>
                            {tabValue === 0 ? (
                                <Box>
                                    <Typography variant="h6" gutterBottom>Review Lead Information</Typography>
                                    <Grid container spacing={1}>
                                        <Grid item xs={6}><strong>First Name:</strong></Grid>
                                        <Grid item xs={6}>{manualForm.firstName}</Grid>
                                        <Grid item xs={6}><strong>Last Name:</strong></Grid>
                                        <Grid item xs={6}>{manualForm.lastName}</Grid>
                                        <Grid item xs={6}><strong>Email:</strong></Grid>
                                        <Grid item xs={6}>{manualForm.email}</Grid>
                                        <Grid item xs={6}><strong>Phone:</strong></Grid>
                                        <Grid item xs={6}>
                                            {manualForm.phone}
                                            {addPhonePlusPrefix && manualForm.phone ? ' (+ will be added)' : ''}
                                        </Grid>
                                        <Grid item xs={6}><strong>Country:</strong></Grid>
                                        <Grid item xs={6}>{manualForm.country}</Grid>
                                        {allowViewBrand && (
                                            <>
                                                <Grid item xs={6}><strong>Brand:</strong></Grid>
                                                <Grid item xs={6}>{manualForm.Brand}</Grid>
                                            </>
                                        )}
                                        {allowViewSource && (
                                            <>
                                                <Grid item xs={6}><strong>Source:</strong></Grid>
                                                <Grid item xs={6}>{manualForm.source}</Grid>
                                            </>
                                        )}
                                        {allowViewFileName && (
                                            <>
                                                <Grid item xs={6}><strong>File Name:</strong></Grid>
                                                <Grid item xs={6}>{manualForm.fileName}</Grid>
                                            </>
                                        )}
                                        <Grid item xs={6}><strong>Address:</strong></Grid>
                                        <Grid item xs={6}>{manualForm.Address}</Grid>
                                        <Grid item xs={6}><strong>Status:</strong></Grid>
                                        <Grid item xs={6}>{manualForm.status}</Grid>
                                    </Grid>
                                </Box>
                            ) : (
                                <Box>
                                    {!uploadProgress.isUploading && uploadProgress.percentage === 0 ? (
                                        <>
                                            <Typography variant="h6" gutterBottom>Ready to Upload</Typography>

                                            {renderPhonePlusPrefixOption()}

                                            {/* Call After Upload Option */}
                                            <Box sx={{ mt: 2, mb: 2, p: 2, bgcolor: 'info.light', borderRadius: 1, border: '1px solid', borderColor: 'info.main' }}>
                                                <FormControlLabel
                                                    control={
                                                        <MuiCheckbox
                                                            checked={callAfterUpload}
                                                            onChange={(e) => setCallAfterUpload(e.target.checked)}
                                                            color="primary"
                                                        />
                                                    }
                                                    label={
                                                        <Box>
                                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                Call leads automatically after upload
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                Leads with phone numbers will be called sequentially (one by one)
                                                            </Typography>
                                                        </Box>
                                                    }
                                                />
                                            </Box>

                                            <Typography variant="body2" gutterBottom>
                                                You are about to upload <strong>{csvFile?.name}</strong> with the following mapping:
                                            </Typography>

                                            {(overrideBrand.trim() || overrideSource.trim() || overrideFileName.trim()) && (
                                                <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                        <strong>Applied to every lead</strong>
                                                    </Typography>
                                                    {overrideBrand.trim() && (
                                                        <Typography variant="body2" sx={{ mb: 1 }}>
                                                            <strong>Brand:</strong> {overrideBrand.trim()}
                                                        </Typography>
                                                    )}
                                                    {overrideSource.trim() && (
                                                        <Typography variant="body2" sx={{ mb: 1 }}>
                                                            <strong>Source:</strong> {overrideSource.trim()}
                                                        </Typography>
                                                    )}
                                                    {overrideFileName.trim() && (
                                                        <Typography variant="body2">
                                                            <strong>File Name:</strong> {overrideFileName.trim()}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            )}

                                            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                                                {leadFields.filter(field => selectedFields[field.key] && fieldMapping[field.key]).map(field => (
                                                    <Typography key={field.key} variant="body2" sx={{ mb: 1 }}>
                                                        <strong>{field.label}:</strong> {fieldMapping[field.key]}
                                                        {field.key === 'Brand' && overrideBrand.trim() ? ' (overridden by brand text)' : ''}
                                                    </Typography>
                                                ))}
                                            </Box>

                                            <Alert severity="warning" sx={{ mt: 2 }}>
                                                This will import {csvPreview.length > 0 ? 'multiple' : 'all'} leads from the CSV file. Duplicate emails will be skipped automatically.
                                            </Alert>
                                        </>
                                    ) : (
                                        <Box>
                                            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <UploadIcon color="primary" />
                                                Uploading Leads...
                                            </Typography>

                                            <Box sx={{ mt: 3, mb: 3 }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                    <Typography variant="body2" color="text.secondary">
                                                        Progress
                                                    </Typography>
                                                    <Typography variant="body2" fontWeight="bold" color="primary">
                                                        {uploadProgress.percentage}%
                                                    </Typography>
                                                </Box>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={uploadProgress.percentage}
                                                    sx={{
                                                        height: 10,
                                                        borderRadius: 5,
                                                        bgcolor: 'grey.200',
                                                        '& .MuiLinearProgress-bar': {
                                                            borderRadius: 5,
                                                        }
                                                    }}
                                                />
                                            </Box>

                                            <Grid container spacing={2} sx={{ mt: 2 }}>
                                                <Grid item xs={12} sm={3}>
                                                    <Card variant="outlined" sx={{ bgcolor: 'success.light', borderColor: 'success.main' }}>
                                                        <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                                            <CheckCircle color="success" sx={{ fontSize: 32, mb: 1 }} />
                                                            <Typography variant="h5" fontWeight="bold">
                                                                {uploadProgress.uploaded}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                Uploaded
                                                            </Typography>
                                                        </CardContent>
                                                    </Card>
                                                </Grid>
                                                <Grid item xs={12} sm={3}>
                                                    <Card variant="outlined" sx={{ bgcolor: 'warning.light', borderColor: 'warning.main' }}>
                                                        <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                                            <CircularProgress size={32} sx={{ mb: 1 }} />
                                                            <Typography variant="h5" fontWeight="bold">
                                                                {uploadProgress.remaining}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                Remaining
                                                            </Typography>
                                                        </CardContent>
                                                    </Card>
                                                </Grid>
                                                <Grid item xs={12} sm={3}>
                                                    <Card variant="outlined" sx={{ bgcolor: 'error.light', borderColor: 'error.main' }}>
                                                        <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                                            <Close color="error" sx={{ fontSize: 32, mb: 1 }} />
                                                            <Typography variant="h5" fontWeight="bold">
                                                                {uploadProgress.skipped}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                Skipped (Duplicates)
                                                            </Typography>
                                                        </CardContent>
                                                    </Card>
                                                </Grid>
                                                <Grid item xs={12} sm={3}>
                                                    <Card variant="outlined" sx={{ bgcolor: 'info.light', borderColor: 'info.main' }}>
                                                        <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                                            <Description color="info" sx={{ fontSize: 32, mb: 1 }} />
                                                            <Typography variant="h5" fontWeight="bold">
                                                                {uploadProgress.total}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                Total Leads
                                                            </Typography>
                                                        </CardContent>
                                                    </Card>
                                                </Grid>
                                            </Grid>

                                            {uploadProgress.skipped > 0 && (
                                                <Alert severity="warning" sx={{ mt: 2 }}>
                                                    <strong>{uploadProgress.skipped} lead(s) skipped</strong> due to duplicate email addresses. These leads already exist in the system.
                                                </Alert>
                                            )}

                                            {uploadProgress.percentage === 100 && (
                                                <Alert severity="success" sx={{ mt: 2 }}>
                                                    Upload completed successfully! {uploadProgress.uploaded} lead(s) added{uploadProgress.skipped > 0 ? `, ${uploadProgress.skipped} skipped` : ''}. The dialog will close automatically.
                                                </Alert>
                                            )}
                                        </Box>
                                    )}
                                </Box>
                            )}
                            <Box sx={{ mt: 2 }}>
                                <Button
                                    onClick={handleBack}
                                    sx={{ mr: 1 }}
                                    disabled={uploadProgress.isUploading}
                                >
                                    Back
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={tabValue === 0 ? handleManualSubmit : handleCsvUpload}
                                    disabled={creating || uploading || uploadProgress.isUploading}
                                >
                                    {creating || uploading || uploadProgress.isUploading ? <CircularProgress size={24} /> : 'Submit'}
                                </Button>
                            </Box>
                        </StepContent>
                    </Step>
                </Stepper>
                {(currentUser?.user?.role === 'superadmin' || currentUser?.user?.role === 'manager') && (
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                            {currentUser?.user?.role === 'manager' ? 'Assign to Admin' : 'Assign to Agent'}
                        </Typography>
                        <FormControl fullWidth size="small">
                            <InputLabel>{currentUser?.user?.role === 'manager' ? 'Admin' : 'Agent'}</InputLabel>
                            <Select
                                value={selectedAgentId}
                                label={currentUser?.user?.role === 'manager' ? 'Admin' : 'Agent'}
                                onChange={(e) => setSelectedAgentId(e.target.value)}
                                disabled={currentUser?.user?.role === 'manager' && agents.length === 0}
                                required={currentUser?.user?.role === 'manager'}
                            >
                                {currentUser?.user?.role === 'superadmin' && (
                                    <MenuItem value="">
                                        <em>Unassigned</em>
                                    </MenuItem>
                                )}
                                {agents.length === 0 && currentUser?.user?.role === 'manager' ? (
                                    <MenuItem value="" disabled>
                                        No admins assigned to you
                                    </MenuItem>
                                ) : (
                                    agents
                                        .filter(a => {
                                            // For manager: only show admins
                                            if (currentUser?.user?.role === 'manager') {
                                                return a.role === 'admin';
                                            }
                                            // For superadmin: show all admins, subadmins, superadmins
                                            return a.role === 'admin' || a.role === 'subadmin' || a.role === 'superadmin';
                                        })
                                        .map(agent => (
                                            <MenuItem key={agent._id} value={agent._id}>
                                                {agent.firstName} {agent.lastName} ({agent.role}) - {agent.email}{currentUser?.user?._id === agent._id ? ' (self)' : ''}
                                            </MenuItem>
                                        ))
                                )}
                            </Select>
                        </FormControl>
                        {currentUser?.user?.role === 'manager' && agents.length === 0 && (
                            <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                                You need to have admins assigned to you before you can upload leads. Please contact superadmin.
                            </Typography>
                        )}
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
});

// View Details Component - Memoized for performance
const LeadDetails = memo(({ lead, open, onClose, navigate, showSource = false, showBrand = false, showFileName = false }) => {
    if (!lead) return null;

    const handleViewStream = () => {
        onClose();
        navigate(`/admin/crm/lead/${lead._id}/stream`);
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            fullScreen={typeof window !== 'undefined' && window.innerWidth < 600}
        >
            <DialogTitle>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6">Lead Details</Typography>
                    <IconButton onClick={onClose}>
                        <Close />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
                <Grid container spacing={3} sx={{ mt: 1 }}>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2" color="text.secondary">First Name</Typography>
                        <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{lead.firstName}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2" color="text.secondary">Last Name</Typography>
                        <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{lead.lastName}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2" color="text.secondary">Email</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, wordBreak: 'break-all', fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                            <Email fontSize="small" />
                            <Typography
                                component="a"
                                href={`mailto:${lead.email}`}
                                variant="body1"
                                sx={{
                                    color: "primary.main",
                                    textDecoration: "none",
                                    cursor: "pointer",
                                    "&:hover": {
                                        textDecoration: "underline"
                                    }
                                }}
                            >
                                {lead.email}
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2" color="text.secondary">Phone</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, wordBreak: 'break-word' }}>
                            <Phone fontSize="small" />
                            <Typography
                                component="a"
                                href={`tel:${lead.phone}`}
                                variant="body1"
                                sx={{
                                    color: lead.phone ? "primary.main" : "text.secondary",
                                    textDecoration: "none",
                                    cursor: lead.phone ? "pointer" : "default",
                                    "&:hover": {
                                        textDecoration: lead.phone ? "underline" : "none"
                                    }
                                }}
                            >
                                {lead.phone || 'Not provided'}
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2" color="text.secondary">Country</Typography>
                        <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{lead.country || 'Not provided'}</Typography>
                    </Grid>
                    {showBrand && (
                    <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2" color="text.secondary">Brand</Typography>
                        <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{lead.Brand || 'Not provided'}</Typography>
                    </Grid>
                    )}
                    {showSource && (
                    <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2" color="text.secondary">Source</Typography>
                        <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{lead.source || 'Not provided'}</Typography>
                    </Grid>
                    )}
                    {showFileName && (
                    <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2" color="text.secondary">File Name</Typography>
                        <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{lead.fileName || 'Not provided'}</Typography>
                    </Grid>
                    )}
                    {lead.remarks && (
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" color="text.secondary">Remarks (Source)</Typography>
                            <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{lead.remarks}</Typography>
                        </Grid>
                    )}
                    {(lead.caseNotes || lead.lossRange) && (
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" color="text.secondary">Case / Loss details</Typography>
                            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                                {lead.caseNotes && <>{lead.caseNotes}</>}
                                {lead.caseNotes && lead.lossRange && ' · '}
                                {lead.lossRange && <>Loss: {lead.lossRange}</>}
                            </Typography>
                        </Grid>
                    )}
                    <Grid item xs={12}>
                        <Typography variant="subtitle2" color="text.secondary">Address</Typography>
                        <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', gap: 1, wordBreak: 'break-word' }}>
                            <LocationOn fontSize="small" />
                            {lead.Address || 'Not provided'}
                        </Typography>
                    </Grid>
                    <Grid item xs={12}>
                        <CustomerFieldsView lead={lead} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2" color="text.secondary">Status</Typography>
                        <Chip
                            label={lead.status}
                            sx={getStatusChipSx(getStatusColor(lead.status, getCachedLeadStatuses() || []))}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2" color="text.secondary">Created Date</Typography>
                        <Typography variant="body1" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                            {new Date(lead.createdAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </Typography>
                    </Grid>
                    {lead.notes && lead.notes.length > 0 && (
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                Notes
                            </Typography>
                            <List dense>
                                {lead.notes.map((note, index) => (
                                    <ListItem key={index}>
                                        <ListItemText
                                            primary={note.text}
                                            secondary={`By ${note.author?.firstName || 'Unknown'} on ${new Date(note.createdAt).toLocaleDateString()}`}
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </Grid>
                    )}
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
                <Button
                    variant="contained"
                    onClick={handleViewStream}
                    startIcon={<Visibility />}
                >
                    View Stream
                </Button>
            </DialogActions>
        </Dialog>
    );
});

// Edit Lead Component - Memoized for performance
const EditLeadDialog = memo(({ lead, open, onClose, onLeadUpdated, allowManageStatuses, allowViewBrand = false, allowViewFileName = false }) => {

    const [editForm, setEditForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        country: "",
        Brand: "",
        fileName: "",
        Address: "",
        status: "New",

        remarks: "",
        ...emptyCustomerFields(),
    });
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        if (lead) {
            setEditForm({
                firstName: lead.firstName || "",
                lastName: lead.lastName || "",
                email: lead.email || "",
                phone: lead.phone || "",
                country: lead.country || "",
                Brand: lead.Brand || "",
                fileName: lead.fileName || "",
                Address: lead.Address || "",
                status: lead.status || "New",
                remarks: lead.remarks || "",
                ...customerFieldsFromLead(lead),
            });
        }
    }, [lead]);

    const handleEditFormChange = (field, value) => {
        setEditForm((prev) => applyCustomerFieldChange(prev, field, value));
    };

    const handleUpdateLead = async () => {
        try {
            setUpdating(true);
            const response = await updateLeadApi(lead._id, editForm);
            if (response.success) {
                toast.success('Lead updated successfully!');
                onLeadUpdated(response.data?.lead || { ...lead, ...editForm }, response.data);
                onClose();
            } else {
                toast.error(response.msg || 'Failed to update lead');
            }
        } catch (error) {
            toast.error('Error updating lead');
            console.error('Update lead error:', error);
        } finally {
            setUpdating(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            fullScreen={typeof window !== 'undefined' && window.innerWidth < 600}
        >
            <DialogTitle>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6">Edit Lead</Typography>
                    <IconButton onClick={onClose}>
                        <Close />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            fullWidth
                            label="First Name"
                            value={editForm.firstName}
                            onChange={(e) => handleEditFormChange('firstName', e.target.value)}
                            required
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            fullWidth
                            label="Last Name"
                            value={editForm.lastName}
                            onChange={(e) => handleEditFormChange('lastName', e.target.value)}
                            required
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            fullWidth
                            label="Email"
                            type="email"
                            value={editForm.email}
                            onChange={(e) => handleEditFormChange('email', e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            fullWidth
                            label="Phone"
                            value={editForm.phone}
                            onChange={(e) => handleEditFormChange('phone', e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            fullWidth
                            label="Country"
                            value={editForm.country}
                            onChange={(e) => handleEditFormChange('country', e.target.value)}
                        />
                    </Grid>
                    {allowViewBrand && (
                    <Grid item xs={12} sm={6}>
                        <TextField
                            fullWidth
                            label="Brand"
                            value={editForm.Brand}
                            onChange={(e) => handleEditFormChange('Brand', e.target.value)}
                        />
                    </Grid>
                    )}
                    {allowViewFileName && (
                    <Grid item xs={12} sm={6}>
                        <TextField
                            fullWidth
                            label="File Name"
                            value={editForm.fileName}
                            onChange={(e) => handleEditFormChange('fileName', e.target.value)}
                        />
                    </Grid>
                    )}
                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Remarks (where lead came from)"
                            value={editForm.remarks}
                            onChange={(e) => handleEditFormChange('remarks', e.target.value)}
                            placeholder="e.g. Takeback Analytics website form"
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Address"
                            value={editForm.Address}
                            onChange={(e) => handleEditFormChange('Address', e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <LocationOn />
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <CustomerFieldsEditor
                            values={editForm}
                            country={editForm.country}
                            onChange={handleEditFormChange}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <LeadStatusSelect
                            value={editForm.status}
                            onChange={(e) => handleEditFormChange('status', e.target.value)}
                            allowManage={allowManageStatuses}
                        />
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleUpdateLead}
                    disabled={updating || !editForm.firstName || !editForm.lastName}
                >
                    {updating ? <CircularProgress size={24} /> : 'Update Lead'}
                </Button>
            </DialogActions>
        </Dialog>
    );
});

const CopyPhoneButton = memo(({ phone, isCopied = false, onCopy }) => {
    const handleCopy = async (event) => {
        event.stopPropagation();
        event.preventDefault();

        if (!phone) return;

        try {
            await navigator.clipboard.writeText(String(phone));
            onCopy?.(String(phone));
        } catch (error) {
            console.error("Copy phone error:", error);
            toast.error("Failed to copy phone number");
        }
    };

    if (!phone) return null;

    return (
        <Tooltip title={isCopied ? "Copied" : "Copy phone number"} arrow>
            <IconButton
                size="small"
                onClick={handleCopy}
                aria-label={isCopied ? "Phone number copied" : "Copy phone number"}
                sx={{
                    p: 0.35,
                    ml: 0.25,
                    color: isCopied ? "success.main" : "text.secondary",
                    bgcolor: isCopied ? "rgba(46, 125, 50, 0.12)" : "transparent",
                    transition: "transform 0.25s ease, color 0.25s ease, background-color 0.25s ease",
                    transform: isCopied ? "scale(1.15)" : "scale(1)",
                    animation: isCopied ? "phoneCopyPop 0.45s ease" : "none",
                    "@keyframes phoneCopyPop": {
                        "0%": { transform: "scale(1)" },
                        "45%": { transform: "scale(1.28)" },
                        "100%": { transform: "scale(1.15)" },
                    },
                    "&:hover": {
                        bgcolor: isCopied ? "rgba(46, 125, 50, 0.18)" : "action.hover",
                    },
                }}
            >
                {isCopied ? (
                    <CheckCircle sx={{ fontSize: 16 }} />
                ) : (
                    <ContentCopy sx={{ fontSize: 15 }} />
                )}
            </IconButton>
        </Tooltip>
    );
});

CopyPhoneButton.displayName = "CopyPhoneButton";

const LeadsPage = () => {

    let authUser = useAuthUser();
    let navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    useEffect(() => {
        if (authUser().user.role === "user") {
            navigate("/dashboard");
            return;
        }

    }, []);
    const [leads, setLeads] = useState([]);
    const leadsRef = useRef(leads);
    leadsRef.current = leads;
    const [crmAccessDenied, setCrmAccessDenied] = useState(false);
    const [allLeadsForFiltering, setAllLeadsForFiltering] = useState([]); // Store all leads when filtering by call status
    const [filteredLeads, setFilteredLeads] = useState([]); // Filtered leads for display
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [filters, setFilters] = useState({
        search: "",
        status: "",
        countrySearch: "",
        brandSearch: "",
        agent: "",
        callStatus: "",
        customerAge: "",
        amountLost: "",
        amountLostWhen: "",
        registeredToPlatform: "",
        activeTradingPlatform: "",
        customerBank: "",
        additionalPhone: "",
        screenSharing: "",
        screenSharingId: "",
        customerPotential: "",
    });
    // Temporary search values (not applied until Search button is clicked)
    const [tempSearch, setTempSearch] = useState("");
    const [tempCountrySearch, setTempCountrySearch] = useState("");
    const [tempBrandSearch, setTempBrandSearch] = useState("");
    const [brandOptions, setBrandOptions] = useState([]);
    const [copiedPhones, setCopiedPhones] = useState(() => new Set());
    const handlePhoneCopied = useCallback((phoneNumber) => {
        setCopiedPhones((prev) => {
            if (prev.has(phoneNumber)) return prev;
            const next = new Set(prev);
            next.add(phoneNumber);
            return next;
        });
    }, []);
    const [statusCounts, setStatusCounts] = useState({});
    const [statusTotal, setStatusTotal] = useState(0);
    const filtersRef = useRef(filters);
    filtersRef.current = filters;
    const appliedRefillIds = useRef(new Set());
    const applyRefilledLeads = useCallback((rows) => {
        const incoming = Array.isArray(rows) ? rows : [];
        const fresh = [];
        incoming.forEach((lead) => {
            const id = lead?._id ? String(lead._id) : "";
            if (!id || appliedRefillIds.current.has(id)) return;
            appliedRefillIds.current.add(id);
            fresh.push(lead);
        });
        if (!fresh.length) return;
        const show = !filtersRef.current.status || filtersRef.current.status === "New";
        if (show) {
            setLeads((prev) => {
                const seen = new Set(prev.map((item) => String(item._id)));
                const adding = fresh.filter((lead) => !seen.has(String(lead._id)));
                return adding.length ? [...adding, ...prev] : prev;
            });
        }
        setStatusCounts((prev) => ({ ...prev, New: (Number(prev.New) || 0) + fresh.length }));
        setStatusTotal((prev) => Number(prev) + fresh.length);
        setPagination((prev) => ({
            ...prev,
            totalLeads: Number(prev.totalLeads || 0) + fresh.length,
            totalFiltered: show ? Number(prev.totalFiltered || 0) + fresh.length : prev.totalFiltered,
        }));
        toast.success(`${fresh.length.toLocaleString()} new leads added`);
    }, []);
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalLeads: 0,
        totalFiltered: 0,
        limit: 50,  // Reduced from 100 for better performance
        hasNextPage: false,
        hasPrevPage: false,
    });
    const [countries, setCountries] = useState([
        "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda",
        "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas",
        "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize",
        "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil",
        "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
        "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China",
        "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus",
        "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic",
        "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia",
        "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia",
        "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea",
        "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland",
        "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
        "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, North",
        "Korea, South", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon",
        "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
        "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta",
        "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia",
        "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique",
        "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand",
        "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway", "Oman",
        "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay",
        "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia",
        "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines",
        "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal",
        "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia",
        "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain",
        "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
        "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo",
        "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan",
        "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom",
        "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City",
        "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
    ]);
    const countryOptions = useMemo(
        () => ["EU (European Union)", ...countries],
        [countries]
    );
    const mapCountryOptionToFilter = useCallback((option) => {
        if (!option) return "";
        if (option === "EU (European Union)") return "EU";
        return String(option).trim();
    }, []);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
    const [isMobileMenu, setisMobileMenu] = useState(false) // Start with false (closed) on mobile

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) {
                // Mobile: close sidebar by default
                setisMobileMenu(false);
                setIsSidebarCollapsed(false);
            } else {
                // Desktop: open sidebar by default
                setisMobileMenu(true);
            }
        };

        // Run once on mount
        handleResize();

        // Add event listener for screen resize
        window.addEventListener("resize", handleResize);

        // Cleanup listener
        return () => window.removeEventListener("resize", handleResize);
    }, []);
    const [anchorEl, setAnchorEl] = useState(null);
    const [selectedLead, setSelectedLead] = useState(null);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [uploadHistoryOpen, setUploadHistoryOpen] = useState(false);
    const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [sendEmailDialogOpen, setSendEmailDialogOpen] = useState(false);
    const [emailLead, setEmailLead] = useState(null);
    const [reminderModalOpen, setReminderModalOpen] = useState(false);
    const [reminderLead, setReminderLead] = useState(null);
    const [reminderListRefresh, setReminderListRefresh] = useState({});
    const [updatingStatusLeadId, setUpdatingStatusLeadId] = useState(null);
    const [removingLeadIds, setRemovingLeadIds] = useState({});
    const LEAD_REMOVE_ANIMATION_MS = 400;
    const [selectedLeads, setSelectedLeads] = useState(new Set());
    const [allFilteredSelected, setAllFilteredSelected] = useState(false);
    const [selectingAllLeads, setSelectingAllLeads] = useState(false);
    const [callStatuses, setCallStatuses] = useState({}); // Track call status per lead
    const [leadCallStatuses, setLeadCallStatuses] = useState({}); // Track latest call status per lead (completed/failed)
    const [loadingCallStatuses, setLoadingCallStatuses] = useState(false); // Track loading state for call statuses
    const loadingRef = useRef(false); // Ref to track loading state without causing re-renders
    // Finalization guards: once a call ends (failed/completed/cancelled), ignore subsequent downgrade events
    const [finalizedGuards, setFinalizedGuards] = useState({
        bySessionId: {}, // sessionId -> true
        byLeadId: {} // leadId -> true
    });
    const finalizedGuardsRef = useRef(finalizedGuards);
    const callAccessRef = useRef({ dashboard: false, logs: false });
    useEffect(() => {
        finalizedGuardsRef.current = finalizedGuards;
    }, [finalizedGuards]);
    const [socket, setSocket] = useState(null);
    const [expandedLead, setExpandedLead] = useState(null);
    const [latestAdminComments, setLatestAdminComments] = useState({});
    const [loadingLatestComment, setLoadingLatestComment] = useState({});
    const [leadCommentDrafts, setLeadCommentDrafts] = useState({});
    const [submittingLeadComments, setSubmittingLeadComments] = useState({});
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteType, setDeleteType] = useState(''); // 'single', 'bulk', 'all'
    const [deleting, setDeleting] = useState(false);
    const [activating, setActivating] = useState(false); // Track activation state
    const [activateConfirmOpen, setActivateConfirmOpen] = useState(false); // Confirmation dialog
    const [activationModalOpen, setActivationModalOpen] = useState(false); // Blocking modal for activation
    const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true); // Option to send welcome email
    const [activationProgress, setActivationProgress] = useState({
        total: 0,
        activated: 0,
        skipped: 0,
        failed: 0,
        percentage: 0,
        msg: 'Starting...',
        completed: false
    });
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [statusDialogOpen, setStatusDialogOpen] = useState(false);
    const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false);
    const [bulkStatusValue, setBulkStatusValue] = useState('');
    const [selectedAgentId, setSelectedAgentId] = useState("");
    const [emailQueueStatus, setEmailQueueStatus] = useState({
        pending: 0,
        processing: 0,
        failed: 0,
        total: 0
    });
    const [deleteProgress, setDeleteProgress] = useState({
        total: 0,
        deleted: 0,
        percentage: 0,
        isProcessing: false,
        msg: ''
    });

    // Call progress dialog (live status)
    const [callProgressOpen, setCallProgressOpen] = useState(false);
    const [callProgress, setCallProgress] = useState({
        leadId: null,
        sessionId: null,
        phoneNumber: null,
        status: 'initiating',
        timeline: [],
        startedAt: null,
        liveDuration: 0
    });
    const [cancellingCall, setCancellingCall] = useState(false);

    // Live duration counter for active calls
    useEffect(() => {
        if (!callProgressOpen || !callProgress.startedAt || callProgress.status === 'completed' || callProgress.status === 'failed' || callProgress.status === 'cancelled') {
            return;
        }

        const interval = setInterval(() => {
            if (callProgress.startedAt) {
                const now = new Date();
                const started = new Date(callProgress.startedAt);
                const duration = Math.floor((now - started) / 1000);
                setCallProgress(prev => ({
                    ...prev,
                    liveDuration: duration
                }));
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [callProgressOpen, callProgress.startedAt, callProgress.status]);

    // Auto-close dialog when call ends (completed/failed/cancelled)
    useEffect(() => {
        if (callProgressOpen && callProgress.status &&
            (callProgress.status === 'completed' || callProgress.status === 'failed' || callProgress.status === 'cancelled')) {
            console.log('🔒 [LEADS.JS] Call ended, closing dialog in 3 seconds. Status:', callProgress.status);
            const timer = setTimeout(() => {
                setCallProgressOpen(false);
                console.log('🔒 [LEADS.JS] Dialog closed after call ended');
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [callProgressOpen, callProgress.status]);

    // Handle cancel call
    const handleCancelCall = async () => {
        if (!callProgress.sessionId) {
            toast.error('No active call to cancel');
            return;
        }

        try {
            setCancellingCall(true);
            const response = await cancelCallApi(callProgress.sessionId);
            if (response.success) {
                toast.success('Call cancelled successfully');
                setCallProgress(prev => ({
                    ...prev,
                    status: 'cancelled'
                }));
                setTimeout(() => {
                    setCallProgressOpen(false);
                    setCallStatuses(prev => {
                        const updated = { ...prev };
                        if (callProgress.leadId) {
                            delete updated[callProgress.leadId];
                        }
                        return updated;
                    });
                }, 2000);
            } else {
                toast.error(response.msg || 'Failed to cancel call');
            }
        } catch (error) {
            console.error('Error cancelling call:', error);
            toast.error('Failed to cancel call');
        } finally {
            setCancellingCall(false);
        }
    };

    // ✅ Email queue polling - check every 10 seconds
    useEffect(() => {
        const fetchEmailQueueStatus = async () => {
            try {
                const response = await getEmailQueueStatusApi();
                if (response.success) {
                    setEmailQueueStatus({
                        pending: response.data.pending || 0,
                        processing: response.data.processing || 0,
                        failed: response.data.failed || 0,
                        total: response.data.total || 0
                    });
                }
            } catch (err) {
                console.error('Error fetching email queue status:', err);
            }
        };

        fetchEmailQueueStatus();
        const interval = setInterval(fetchEmailQueueStatus, 60000);

        return () => clearInterval(interval);
    }, []);

    // ✅ Polling for active calls status updates (like CallDashboard.jsx)
    useEffect(() => {
        let inFlight = false;
        const fetchActiveCallsStatus = async () => {
            if (!callAccessRef.current.dashboard || inFlight) return;
            inFlight = true;
            try {
                const response = await getActiveCallsApi();
                if (response?.success === false) {
                    callAccessRef.current.stoppedDashboard = true;
                    callAccessRef.current.dashboard = false;
                    return;
                }
                if (response.success && response.calls) {
                    console.log('📞 [LEADS.JS] Active calls received from polling:', response.calls.length);

                    // Map status based on SIP events and current status (same logic as CallDashboard)
                    const statusMap = {};
                    response.calls.forEach(call => {
                        const leadId = call.leadId?._id || call.leadId;
                        if (!leadId) return;
                        // Ignore calls that are finalized locally (use ref to avoid stale closure)
                        const guards = finalizedGuardsRef.current || { byLeadId: {}, bySessionId: {} };
                        if (guards.byLeadId[leadId] || (call.sessionId && guards.bySessionId[call.sessionId])) {
                            return;
                        }

                        const originalStatus = call.status;
                        let mappedStatus = originalStatus;

                        // Map status based on SIP codes if available
                        if (call.metadata?.sipStatus) {
                            const sipCode = call.metadata.sipStatus.code;
                            if (sipCode === 100) {
                                mappedStatus = 'initiating';
                            } else if (sipCode === 180 || sipCode === 183) {
                                mappedStatus = 'ringing';
                            } else if (sipCode === 200) {
                                // 200 OK can mean two things:
                                // 1. Call answered (response to INVITE with SDP) - should be 'in-progress'
                                // 2. Call termination confirmed (response to BYE) - should be 'completed'
                                if (originalStatus === 'completed' || originalStatus === 'failed') {
                                    mappedStatus = originalStatus;
                                } else {
                                    // Call answered - set to in-progress (THIS IS THE KEY FIX)
                                    mappedStatus = 'in-progress';
                                }
                            } else if (sipCode === 'BYE') {
                                mappedStatus = 'completed';
                            }
                        }

                        // Use explicit terminal status if provided (always override)
                        if (originalStatus && (originalStatus === 'completed' || originalStatus === 'failed' || originalStatus === 'cancelled')) {
                            mappedStatus = originalStatus;
                        }

                        statusMap[leadId] = mappedStatus;

                        console.log('📞 [LEADS.JS] Call status mapping:', {
                            leadId,
                            sessionId: call.sessionId,
                            phoneNumber: call.phoneNumber,
                            originalStatus,
                            mappedStatus,
                            sipCode: call.metadata?.sipStatus?.code,
                            sipMessage: call.metadata?.sipStatus?.message
                        });

                        // Update call progress dialog if this is the current call
                        // Use functional update to access latest callProgress state
                        setCallProgress(prev => {
                            if (call.sessionId && prev.sessionId === call.sessionId) {
                                console.log('📊 [LEADS.JS - POLLING] Updating call progress dialog:', {
                                    sessionId: call.sessionId,
                                    prevStatus: prev.status,
                                    newStatus: mappedStatus,
                                    sipCode: call.metadata?.sipStatus?.code
                                });

                                const updated = {
                                    ...prev,
                                    status: mappedStatus,
                                    duration: call.duration || prev.duration,
                                    activeCallTime: call.activeCallTime || prev.activeCallTime,
                                    ringingTime: call.ringingTime || prev.ringingTime,
                                    startedAt: call.startedAt || prev.startedAt,
                                    endedAt: call.endedAt || prev.endedAt
                                };

                                // Auto-close dialog after call ends
                                if (mappedStatus === 'completed' || mappedStatus === 'failed' || mappedStatus === 'cancelled') {
                                    setTimeout(() => {
                                        setCallProgressOpen(false);
                                        console.log('🔒 [LEADS.JS - POLLING] Closing dialog - call ended');
                                    }, 3000);
                                }

                                return updated;
                            }
                            return prev;
                        });
                    });

                    // Update call statuses state
                    setCallStatuses(prev => {
                        const updated = { ...statusMap };
                        // Keep only active calls, remove completed/failed/cancelled
                        Object.keys(updated).forEach(leadId => {
                            const status = updated[leadId];
                            if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                                delete updated[leadId];
                            }
                        });
                        return updated;
                    });
                }
            } catch (err) {
                console.error('Error fetching active calls status:', err);
            } finally {
                inFlight = false;
            }
        };

        fetchActiveCallsStatus();
        const interval = setInterval(fetchActiveCallsStatus, 20000);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty deps - polling should run continuously

    // ✅ Use Socket.io for real-time call status updates (replacing polling to avoid infinite loops)

    // ❌ REMOVED: Socket.io call status updates (replaced with polling)
    // Keeping email queue socket listener for now since it works
    useEffect(() => {
        // Get backend URL from centralized config
        const backendUrl = getBackendUrl();

        console.log('🔌 [LEADS.JS] Using backend URL for SSE:', backendUrl);

        // Connect to SSE endpoint for real-time updates (async)
        // Don't let SSE connection failures affect other functionality
        let sseEnabled = true;

        try {
            // Only try SSE if not explicitly disabled
            if (localStorage.getItem('disableSSE') === 'true') {
                console.log('⚠️ [LEADS.JS] SSE disabled by user preference');
                sseEnabled = false;
            } else {
                const ssePromise = sseClient.connect(`${backendUrl}/api/v1/crm/call/updates/sse`);

                // Set a timeout for SSE connection
                const sseTimeout = setTimeout(() => {
                    console.warn('⚠️ [LEADS.JS] SSE connection timeout - disabling SSE for this session');
                    sseClient.disconnect();
                    sseEnabled = false;
                }, 15000); // 15 second timeout

                ssePromise
                    .then(() => {
                        clearTimeout(sseTimeout);
                        console.log('✅ [LEADS.JS] SSE connected successfully');
                    })
                    .catch(err => {
                        clearTimeout(sseTimeout);
                        console.warn('⚠️ [LEADS.JS] SSE connection failed, but continuing:', err);
                        sseEnabled = false;
                        // SSE is optional for real-time updates, polling will still work
                    });
            }
        } catch (err) {
            console.warn('⚠️ [LEADS.JS] SSE setup failed, but continuing:', err);
            sseEnabled = false;
        }

        // Listen for call status updates via SSE (if enabled)
        let unsubscribeCallStatus = null;
        if (sseEnabled) {
            unsubscribeCallStatus = sseClient.on('call:status:update', (data) => {
                console.log('═══════════════════════════════════════════════════════════');
                console.log('📞 [LEADS.JS] Socket call:status:update received:');
                console.log('  📦 Raw Data:', JSON.stringify(data, null, 2));
                console.log('  📋 Status:', data.status);
                console.log('  🔢 SIP Code:', data.sipStatus?.code);
                console.log('  📝 SIP Message:', data.sipStatus?.message);
                console.log('  👤 Lead ID:', data.leadId);
                console.log('  🆔 Session ID:', data.sessionId);
                console.log('═══════════════════════════════════════════════════════════');

                const leadId = data.leadId?._id || data.leadId || null;
                const sessionId = data.sessionId || null;

                if (!leadId && !sessionId) {
                    console.warn('⚠️ [LEADS.JS] No leadId or sessionId in socket update, ignoring');
                    return;
                }

                // Ignore if we already finalized this call (use ref to avoid stale closure)
                const guards = finalizedGuardsRef.current || { bySessionId: {}, byLeadId: {} };
                if ((sessionId && guards.bySessionId[sessionId]) || (leadId && guards.byLeadId[leadId])) {
                    console.log('  🚫 [LEADS.JS] Ignoring event due to finalized guard');
                    return;
                }

                // Map status based on SIP codes - SIP codes take priority
                let mappedStatus = data.status;

                // ALWAYS check SIP codes first - they're more definitive
                if (data.sipStatus && data.sipStatus.code !== undefined) {
                    const sipCode = data.sipStatus.code;
                    console.log('  🔍 [LEADS.JS] Mapping status from SIP code:', sipCode);

                    if (sipCode === 100) {
                        mappedStatus = 'initiating';
                    } else if (sipCode === 180 || sipCode === 183) {
                        mappedStatus = 'ringing';
                    } else if (sipCode === 200) {
                        // 200 OK can mean two things:
                        // 1. Call answered (response to INVITE with SDP) - should be 'in-progress'
                        // 2. Call termination confirmed (response to BYE) - should be 'completed'
                        // Check if this is termination by looking at explicit status
                        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
                            // Explicit terminal status overrides
                            mappedStatus = data.status;
                            console.log('  ⚠️ [LEADS.JS] 200 OK but status is terminal:', data.status);
                        } else {
                            // Call answered - set to in-progress (THIS IS THE KEY FIX)
                            mappedStatus = 'in-progress';
                            console.log('  ✅ [LEADS.JS] 200 OK mapped to in-progress (call answered)');
                        }
                    } else if (sipCode === 'BYE') {
                        mappedStatus = 'completed';
                    }
                } else {
                    // If no SIP code but we have a status, use it (could be connecting, initiating, etc.)
                    if (data.status && data.status !== 'connecting') {
                        mappedStatus = data.status;
                    } else if (!data.status) {
                        // If no status at all, keep connecting state
                        mappedStatus = 'connecting';
                    }
                    console.log('  ⚠️ [LEADS.JS] No SIP code in socket data, using status:', mappedStatus);
                }

                // Use explicit terminal status if provided (always override)
                if (data.status && (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled')) {
                    mappedStatus = data.status;
                    console.log('  🔒 [LEADS.JS] Terminal status override:', mappedStatus);
                }

                // Only update from "connecting" if we have valid webhook status
                // If we're in connecting state and get no valid status, keep connecting
                const currentStatus = callStatuses[leadId];
                if (currentStatus === 'connecting') {
                    // Only update if we have a valid non-connecting status from webhook
                    if (!mappedStatus || mappedStatus === 'connecting') {
                        // Still waiting for webhook, keep connecting
                        console.log('  ⏳ [LEADS.JS] Still waiting for webhook, keeping connecting status');
                        return;
                    }
                    // Valid status received, will update below
                    console.log('  ✅ [LEADS.JS] Received webhook status, updating from connecting to:', mappedStatus);
                }

                console.log('  📍 [LEADS.JS] Final mapped status:', mappedStatus, 'for leadId:', leadId, '(original:', data.status, ', SIP:', data.sipStatus?.code, ')');

                // Update call statuses
                if (leadId && mappedStatus) {
                    setCallStatuses(prev => {
                        const updated = { ...prev };
                        updated[leadId] = mappedStatus;

                        // Remove status when call ends
                        if (mappedStatus === 'completed' || mappedStatus === 'failed' || mappedStatus === 'cancelled') {
                            delete updated[leadId];
                            console.log('  🗑️  [LEADS.JS] Removed completed/failed/cancelled call from statuses');
                        }

                        return updated;
                    });
                }

                // Mark finalized to prevent subsequent downgrades
                if (mappedStatus === 'completed' || mappedStatus === 'failed' || mappedStatus === 'cancelled') {
                    setFinalizedGuards(prev => ({
                        bySessionId: sessionId ? { ...prev.bySessionId, [sessionId]: true } : { ...prev.bySessionId },
                        byLeadId: leadId ? { ...prev.byLeadId, [leadId]: true } : { ...prev.byLeadId }
                    }));
                }

                // Update call progress dialog if this is the current call
                // Use functional update to access latest callProgress state and ensure we have sessionId
                setCallProgress(prev => {
                    // Check if this update is for the current call (match by sessionId)
                    if (sessionId && prev.sessionId && String(prev.sessionId) === String(sessionId)) {
                        const sipStatus = data.sipStatus || {};

                        console.log('📊 [LEADS.JS - SOCKET] Updating call progress dialog:', {
                            sessionId,
                            prevStatus: prev.status,
                            newStatus: mappedStatus,
                            sipCode: sipStatus.code,
                            sipMessage: sipStatus.message
                        });

                        // Build timeline entry
                        let timelineLabel = `Status: ${mappedStatus}`;
                        if (sipStatus.code) {
                            const sipCode = sipStatus.code;
                            let reasonPhrase = 'Unknown';
                            if (sipCode === 100) reasonPhrase = 'Trying';
                            else if (sipCode === 180) reasonPhrase = 'Ringing';
                            else if (sipCode === 183) reasonPhrase = sipStatus.message === 'Ringing' ? 'Ringing' : 'Session Progress';
                            else if (sipCode === 200) reasonPhrase = mappedStatus === 'completed' ? 'Call Termination Confirmed' : 'Call Answered (SDP)';
                            else if (sipCode === 'BYE') reasonPhrase = 'Call Ended';
                            else if (sipCode === 408) reasonPhrase = 'Request Timeout';
                            else reasonPhrase = sipStatus.message || 'Unknown';

                            timelineLabel = `SIP ${sipCode} ${reasonPhrase}`;
                        }

                        // Check if timeline event exists
                        const eventExists = prev.timeline.some(e => {
                            const eCode = e.sipCode?.toString() || e.sipCode;
                            const dataCode = sipStatus.code?.toString() || sipStatus.code;
                            return eCode === dataCode &&
                                Math.abs(new Date(e.t).getTime() - new Date().getTime()) < 5000;
                        });

                        const next = {
                            ...prev,
                            status: mappedStatus, // ✅ CRITICAL: Update status with mapped status
                            duration: data.duration || prev.duration,
                            activeCallTime: data.activeCallTime || prev.activeCallTime,
                            ringingTime: data.ringingTime || prev.ringingTime,
                            startedAt: data.startedAt || prev.startedAt,
                            endedAt: data.endedAt || prev.endedAt,
                            timeline: eventExists ? prev.timeline : [...prev.timeline, {
                                t: new Date().toISOString(),
                                label: timelineLabel,
                                sipCode: sipStatus.code,
                                sipMessage: sipStatus.message
                            }]
                        };

                        console.log('📊 [LEADS.JS - CALL PROGRESS] Updated from socket:', {
                            prevStatus: prev.status,
                            newStatus: next.status,
                            sipCode: sipStatus.code
                        });

                        // Auto-close dialog after call ends
                        if (mappedStatus === 'completed' || mappedStatus === 'failed' || mappedStatus === 'cancelled') {
                            console.log('🔒 [LEADS.JS - SOCKET] Scheduling dialog close - call ended with status:', mappedStatus);
                            setTimeout(() => {
                                setCallProgressOpen(false);
                                console.log('🔒 [LEADS.JS - SOCKET] Dialog closed');
                            }, 3000);
                        }

                        return next;
                    } else {
                        console.log('⚠️ [LEADS.JS - SOCKET] Skipping call progress update - sessionId mismatch:', {
                            receivedSessionId: sessionId,
                            currentSessionId: prev.sessionId,
                            match: sessionId && prev.sessionId && String(prev.sessionId) === String(sessionId)
                        });
                        return prev; // Not for current call, keep previous state
                    }
                });

                // Show toasts for status changes - only for superadmin or when lead belongs to current user
                if (leadId) {
                    const me = authUser?.();
                    const currentUserId = me?.user?._id;
                    const role = me?.user?.role;
                    const canShowToast = role === 'superadmin' || (() => {
                        if (!currentUserId) return false;
                        const lead = (leadsRef?.current || []).find(l => l._id === leadId);
                        if (!lead) return false;
                        const agentId = lead.agent?._id || lead.agent;
                        return agentId && String(agentId) === String(currentUserId);
                    })();
                    if (!canShowToast) return;

                    const prevStatus = callStatuses[leadId];
                    if (mappedStatus === 'in-progress' && prevStatus !== 'in-progress') {
                        toast.success(`Call answered: ${data.phoneNumber || ''}`, { autoClose: 2000 });
                    } else if (mappedStatus === 'ringing' && prevStatus !== 'ringing') {
                        toast.info(`Call ringing: ${data.phoneNumber || ''}`, { autoClose: 1500 });
                    } else if (mappedStatus === 'completed' && prevStatus !== 'completed') {
                        toast.info(`Call completed: ${data.phoneNumber || ''}`, { autoClose: 2000 });
                        if (leadId) {
                            setLeadCallStatuses((prev) => {
                                const current = prev[leadId] || {};
                                return {
                                    ...prev,
                                    [leadId]: {
                                        status: mappedStatus,
                                        endedAt: data.endedAt || new Date().toISOString(),
                                        duration: data.duration ?? current.duration ?? null,
                                        callCount: (current.callCount || 0) + 1,
                                        checked: true,
                                    },
                                };
                            });
                        }
                        setTimeout(() => {
                            const currentPage = pagination?.currentPage || 1;
                            if (typeof fetchLeads === 'function') {
                                fetchLeads(currentPage);
                            }
                        }, 2000);
                    }
                }
            });
        }

        setSocket(socket);

        // Fetch initial status
        getEmailQueueStatusApi().then(response => {
            if (response.success) {
                setEmailQueueStatus({
                    pending: response.data.pending || 0,
                    processing: response.data.processing || 0,
                    failed: response.data.failed || 0,
                    total: response.data.total || 0
                });
            }
        }).catch(err => {
            console.error('Error fetching email queue status:', err);
        });

        return () => {
            // Cleanup SSE connection
            sseClient.disconnect();
            if (sseEnabled && unsubscribeCallStatus) {
                unsubscribeCallStatus();
            }
        };
    }, []);

    // Toggle sidebar
    const currentAuthUser = authUser();
    const { can } = useLiveCrmUser();
    const getAllUsers = useCallback(async (includeAgents = true) => {
        try {
            const currentUser = authUser().user;
            const currentUserResponse = await signleUsersApi(currentUser._id);
            const updatedCurrentUser = currentUserResponse?.signleUser;
            if (!updatedCurrentUser) {
                toast.error("Failed to fetch user data");
                setCurrentUserLatest(currentUser);
                return;
            }
            setCurrentUserLatest(updatedCurrentUser);

            // ✅ CRITICAL: Check CRM access permissions in real-time and redirect if false
            // Superadmin always has access
            // Manager must have explicit accessCrm permission (same as admin)
            const crmAllowed = updatedCurrentUser.role === "superadmin" || (
                (updatedCurrentUser.role === "admin" || updatedCurrentUser.role === "manager")
                    ? (updatedCurrentUser.adminPermissions?.accessCrm === true || updatedCurrentUser.adminPermissions?.accessCrm === "true")
                    : updatedCurrentUser.role === "subadmin"
                        ? (updatedCurrentUser.permissions?.accessCrm === true || updatedCurrentUser.permissions?.accessCrm === "true")
                        : false
            );
            if (!crmAllowed) {
                setCrmAccessDenied(true);
                return;
            }
            setCrmAccessDenied(false);
            if (!includeAgents) return;

            let agents = []; // Initialize agents array

            // Fetch agents based on user role and permissions
            if (updatedCurrentUser.role === "superadmin") {
                // Superadmin can see all admins, subadmins, and superadmins
                const [adminsResponse, subadminsResponse] = await Promise.all([
                    allUsersApi({ role: 'admin', limit: 1000, brief: 'true' }),
                    allUsersApi({ role: 'subadmin', limit: 1000, brief: 'true' })
                ]);

                const allFetchedAgents = [
                    ...(adminsResponse.success ? adminsResponse.allUsers : []),
                    ...(subadminsResponse.success ? subadminsResponse.allUsers : [])
                ];

                // ✅ DEDUPLICATION: Check if current user already exists in fetched agents
                const currentUserExists = allFetchedAgents.some(agent => agent._id === updatedCurrentUser._id);

                agents = currentUserExists
                    ? allFetchedAgents
                    : [...allFetchedAgents, updatedCurrentUser]; // Include self only if not already present

            } else if (updatedCurrentUser.role === "admin") {
                // Admin: can assign only if allowed, and targets restricted to subadmins
                if (updatedCurrentUser.adminPermissions?.canAssignLeads === true) {
                    const subadminsResponse = await allUsersApi({ role: 'subadmin', limit: 1000, brief: 'true' });
                    agents = subadminsResponse.success ? subadminsResponse.allUsers : [];
                } else {
                    agents = [];
                }
            } else if (updatedCurrentUser.role === "subadmin" && updatedCurrentUser.permissions?.canAssignLeads === true) {
                const subadminsResponse = await allUsersApi({ role: 'subadmin', limit: 1000, brief: 'true' });
                agents = subadminsResponse.success ? subadminsResponse.allUsers : [];
            } else if (updatedCurrentUser.role === "manager") {
                // Manager: can only see admins assigned to them
                const adminsResponse = await allUsersApi({ role: 'admin', limit: 1000, brief: 'true' });
                if (adminsResponse.success && adminsResponse.allUsers) {
                    // Filter to only admins assigned to this manager
                    agents = adminsResponse.allUsers.filter(admin =>
                        admin.assignedManager &&
                        admin.assignedManager.toString() === updatedCurrentUser._id.toString()
                    );
                } else {
                    agents = [];
                }
            } else {
                agents = [];
            }

            setAgents(agents); // Set the agents state

        } catch (error) {
            toast.error(error.message || "Error fetching users");
        }
    }, []); // ✅ EMPTY dependencies - only run once on mount

    useEffect(() => {
        getAllUsers(true);
        // Recheck access without downloading the full agent lists again.
        const permissionCheckInterval = setInterval(() => {
            getAllUsers(false);
        }, 30000);

        return () => {
            clearInterval(permissionCheckInterval);
        };
    }, []); // ✅ EMPTY dependencies - only call getAllUsers on mount and cleanup on unmount
    const [agents, setAgents] = useState([]);
    const [currentUserLatest, setCurrentUserLatest] = useState(null);
    const canManageStatuses = can('canManageLeadStatuses');
    const canViewLeadSource = can('canViewLeadSource');
    const canViewLeadBrand = can('canViewLeadBrand');
    const canViewLeadFileName = can('canViewLeadFileName');
    const leadColumnCount = 11 + (canViewLeadSource ? 1 : 0) + (canViewLeadBrand ? 1 : 0) + (canViewLeadFileName ? 1 : 0);
    const [filterLeadStatuses, setFilterLeadStatuses] = useState(() => getCachedLeadStatuses() || []);

    useEffect(() => {
        return subscribeLeadStatuses(setFilterLeadStatuses);
    }, []);

    useEffect(() => {
        fetchLeadStatuses().catch(() => {});
    }, []);
    const isSuperAdmin = currentUserLatest?.role === 'superadmin';
    const canSendLeadEmail = can('canSendLeadEmail');
    const canMakeCalls = can('canMakeCalls');
    if (!callAccessRef.current.stoppedDashboard) {
        callAccessRef.current.dashboard = can('canAccessCallDashboard');
    }
    if (!callAccessRef.current.stoppedLogs) {
        callAccessRef.current.logs = can('canViewCallLogs') || can('canAccessCallDashboard');
    }

    // OPTIMIZED: Fetch leads with filters and pagination - backend now handles callStatus filtering
    const fetchLeads = async (page = 1, limit = pagination.limit) => {
        const showSpinner = leadsRef.current.length === 0;
        try {
            if (showSpinner) setLoading(true);
            else setRefreshing(true);
            loadingRef.current = true;

            const params = {
                ...filters,
                page,
                limit
            };

            const res = await adminCrmLeadsApi({ params });

            if (res.success) {
                const nextLeads = res.data.leads || [];
                const incoming = Array.isArray(res.data.refilledLeads) ? res.data.refilledLeads : [];
                const showRefill = !filters.status || filters.status === "New";
                const seen = new Set(nextLeads.map((lead) => String(lead._id)));
                const adding = [];
                let unseenRefill = 0;
                incoming.forEach((lead) => {
                    const id = lead?._id ? String(lead._id) : "";
                    if (!id) return;
                    if (!appliedRefillIds.current.has(id)) unseenRefill += 1;
                    appliedRefillIds.current.add(id);
                    if (showRefill && !seen.has(id)) adding.push(lead);
                });
                const statusMap = {};
                nextLeads.forEach((lead) => {
                    if (!lead?._id || !lead.callSummary) return;
                    statusMap[lead._id] = lead.callSummary;
                });
                startTransition(() => {
                    setLeads(adding.length ? [...adding, ...nextLeads] : nextLeads);
                    setLeadCallStatuses(statusMap);
                    setLoadingCallStatuses(false);
                    setBrandOptions(Array.isArray(res.data.brands) ? res.data.brands : []);
                    setStatusCounts((prev) => {
                        const incomingCounts = res.data.statusCounts;
                        if (!incomingCounts || typeof incomingCounts !== "object" || Array.isArray(incomingCounts)) return prev;
                        if (!Object.keys(incomingCounts).length && nextLeads.length) return prev;
                        return incomingCounts;
                    });
                    setStatusTotal((prev) => {
                        const incomingTotal = Number(res.data.statusTotal);
                        if (!Number.isFinite(incomingTotal)) return prev;
                        if (incomingTotal === 0 && nextLeads.length) return prev;
                        return incomingTotal;
                    });
                    setAllLeadsForFiltering([]);
                    setFilteredLeads([]);
                    setPagination(res.data.pagination || {
                        currentPage: 1,
                        totalPages: 1,
                        totalLeads: 0,
                        totalFiltered: 0,
                        limit: limit,
                        hasNextPage: false,
                        hasPrevPage: false,
                    });
                    setLoading(false);
                    setRefreshing(false);
                });
                if (unseenRefill > 0) toast.success(`${unseenRefill.toLocaleString()} new leads added`);
            } else {
                toast.error(res.msg || 'Failed to fetch leads');
                startTransition(() => {
                    setLeads([]);
                    setPagination(prev => ({ ...prev, currentPage: 1, totalPages: 1 }));
                    setLoading(false);
                    setRefreshing(false);
                });
            }
        } catch (err) {
            console.error("Error fetching leads:", err);
            toast.error('Error fetching leads');
            startTransition(() => {
                setLeads([]);
                setAllLeadsForFiltering([]);
                setFilteredLeads([]);
                setLoading(false);
                setRefreshing(false);
            });
        } finally {
            loadingRef.current = false;
        }
    };

    const fetchDropdownData = async () => {
        try {
            setCountries([]);
            setAgents([]);
        } catch (err) {
            console.error("Error fetching dropdown data:", err);
        }
    };

    useEffect(() => {
        setSelectedLeads(new Set());
        setAllFilteredSelected(false);
        fetchLeads(1); // Reset to page 1 when filters change
    }, [filters]);

    useEffect(() => subscribeChatEvents({
        "leads.refilled": (payload) => applyRefilledLeads(payload?.leads),
    }), [applyRefilledLeads]);

    useEffect(() => {
        const statusFromUrl = searchParams.get('status') || '';
        setFilters((prev) => {
            if (prev.status === statusFromUrl) {
                return prev;
            }
            return { ...prev, status: statusFromUrl };
        });
    }, [searchParams]);

    // REMOVED: Frontend filtering is no longer needed - backend handles all filtering efficiently

    const handleLeadCreated = () => {
        fetchLeads(pagination.currentPage);
    };

    const moveStatusCount = (fromStatus, toStatus) => {
        const from = fromStatus || "New";
        const to = toStatus || "New";
        if (from === to) return;
        setStatusCounts((prev) => ({
            ...prev,
            [from]: Math.max(0, (prev[from] || 0) - 1),
            [to]: (prev[to] || 0) + 1,
        }));
    };

    const handleLeadUpdated = (updated, extra) => {
        if (!updated?._id) return;
        const nextStatus = updated.status;
        const current = leads.find((item) => item._id === updated._id);
        if (current && nextStatus && current.status !== nextStatus) {
            moveStatusCount(current.status, nextStatus);
        }
        if (extra?.refilledLeads?.length) applyRefilledLeads(extra.refilledLeads);
        if (filters.status && nextStatus && nextStatus !== filters.status) {
            setLeads((prev) => prev.filter((item) => item._id !== updated._id));
            setPagination((prev) => ({
                ...prev,
                totalFiltered: Math.max(0, (prev.totalFiltered || 0) - 1),
            }));
            return;
        }
        setLeads((prev) => prev.map((item) => {
            if (item._id !== updated._id) return item;
            const agent = updated.agent && typeof updated.agent === "object" && updated.agent.firstName
                ? updated.agent
                : item.agent;
            return { ...item, ...updated, agent, callSummary: item.callSummary };
        }));
    };

    // Call handlers
    const handleCallLead = async (lead) => {
        if (!canMakeCalls) {
            toast.error('You do not have permission to make calls');
            return;
        }
        if (!lead.phone) {
            toast.error('Lead has no phone number');
            return;
        }

        console.log('📞 [LEADS.JS] Initiating call for lead:', lead._id, lead.phone);

        try {
            // Set status to "connecting" to indicate we're waiting for VAPI/webhook
            setCallStatuses(prev => ({ ...prev, [lead._id]: 'connecting' }));

            // Call API - this should work regardless of SSE connection
            const response = await initiateCallApi(lead._id, lead.phone);
            console.log('📞 [LEADS.JS] Call API response:', response);

            if (response.success) {
                toast.success(`Connecting to ${lead.firstName} ${lead.lastName}...`);
                // Open live call progress dialog
                console.log('📞 [LEADS.JS] Opening call progress dialog:', response.call);

                setCallProgress({
                    leadId: lead._id,
                    sessionId: response.call?.sessionId || null,
                    phoneNumber: lead.phone,
                    status: 'connecting', // Start with connecting, wait for webhook to update
                    startedAt: new Date().toISOString(),
                    liveDuration: 0,
                    timeline: [
                        { t: new Date().toISOString(), label: 'Waiting for VAPI', sipCode: 'CONNECTING', sipMessage: 'Connecting to VAPI service...' }
                    ]
                });

                // DO NOT update status based on API response - wait for webhook
                // The status will be updated when webhook events arrive via SSE
                // Keep status as "connecting" until webhook confirms actual status
            } else {
                // Check if it's a Vapi config error
                if (response.requiresVapiConfig || response.msg?.includes('Vapi API key')) {
                    toast.error(response.msg || response.message || 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.');
                } else {
                    toast.error(response.msg || response.message || 'Failed to initiate call');
                }
                setCallStatuses(prev => {
                    const updated = { ...prev };
                    delete updated[lead._id]; // Remove status on failure
                    return updated;
                });
                console.error('❌ [LEADS.JS] Call initiation failed:', response);
                // Mark this lead as finalized (timeout) to ignore late ringing events for a short period
                setFinalizedGuards(prev => ({
                    bySessionId: { ...prev.bySessionId },
                    byLeadId: { ...prev.byLeadId, [lead._id]: true }
                }));
                // Auto-clear guard after 30s to allow future calls on this lead
                setTimeout(() => {
                    setFinalizedGuards(prev => {
                        const nextByLead = { ...prev.byLeadId };
                        delete nextByLead[lead._id];
                        return { ...prev, byLeadId: nextByLead };
                    });
                }, 30000);
            }
        } catch (error) {
            console.error('❌ [LEADS.JS] Error initiating call:', error);
            // Check if it's a Vapi config error
            if (error.response?.data?.requiresVapiConfig || error.response?.data?.msg?.includes('Vapi API key')) {
                toast.error(error.response?.data?.msg || error.response?.data?.message || 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.');
            } else {
                toast.error(error.response?.data?.msg || error.response?.data?.message || error.message || 'Failed to initiate call');
            }
            setCallStatuses(prev => {
                const updated = { ...prev };
                delete updated[lead._id]; // Remove status on error
                return updated;
            });
            // Mark this lead as finalized (timeout/error) to ignore late ringing events for a short period
            setFinalizedGuards(prev => ({
                bySessionId: { ...prev.bySessionId },
                byLeadId: { ...prev.byLeadId, [lead._id]: true }
            }));
            setTimeout(() => {
                setFinalizedGuards(prev => {
                    const nextByLead = { ...prev.byLeadId };
                    delete nextByLead[lead._id];
                    return { ...prev, byLeadId: nextByLead };
                });
            }, 30000);
        }
    };

    const handleBulkCall = async () => {
        if (!canMakeCalls) {
            toast.error('You do not have permission to make calls');
            return;
        }
        if (selectedLeads.size === 0) {
            toast.error('Please select leads to call');
            return;
        }

        const selectedLeadIds = Array.from(selectedLeads);
        const leadsToCall = leads.filter(lead => selectedLeadIds.includes(lead._id) && lead.phone);

        if (leadsToCall.length === 0) {
            toast.error('Selected leads have no phone numbers');
            return;
        }

        try {
            const response = await bulkCallLeadsApi(selectedLeadIds, { delay: 5000 });
            if (response.success) {
                toast.success(`Queued ${response.calls.length} calls`);
            } else {
                // Check if it's a Vapi config error
                if (response.requiresVapiConfig || response.msg?.includes('Vapi API key')) {
                    toast.error(response.msg || response.message || 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.');
                } else {
                    toast.error(response.msg || response.message || 'Failed to initiate bulk calls');
                }
            }
        } catch (error) {
            console.error('Error initiating bulk calls:', error);
            // Check if it's a Vapi config error
            if (error.response?.data?.requiresVapiConfig || error.response?.data?.msg?.includes('Vapi API key')) {
                toast.error(error.response?.data?.msg || error.response?.data?.message || 'Vapi API key is not configured. Please configure your Vapi settings in your profile before making calls.');
            } else {
                toast.error(error.response?.data?.msg || error.response?.data?.message || 'Failed to initiate bulk calls');
            }
        }
    };

    // Selection handlers
    const isAllPageSelected = leads.length > 0 && leads.every((lead) => selectedLeads.has(lead._id));

    const handleSelectAll = () => {
        startTransition(() => {
            setAllFilteredSelected(false);
            if (isAllPageSelected) {
                setSelectedLeads((prev) => {
                    const next = new Set(prev);
                    leads.forEach((lead) => next.delete(lead._id));
                    return next;
                });
            } else {
                setSelectedLeads((prev) => {
                    const next = new Set(prev);
                    leads.forEach((lead) => next.add(lead._id));
                    return next;
                });
            }
        });
    };

    const handleSelectAllInCrm = async () => {
        if (allFilteredSelected || (pagination.totalFiltered > 0 && selectedLeads.size === pagination.totalFiltered)) {
            setSelectedLeads(new Set());
            setAllFilteredSelected(false);
            return;
        }

        if (pagination.totalFiltered === 0) {
            toast.warning('No leads to select');
            return;
        }

        try {
            setSelectingAllLeads(true);
            const params = { ...filters, idsOnly: 'true' };
            const res = await adminCrmLeadsApi({ params });

            if (res.success && Array.isArray(res.data?.leadIds)) {
                const nextIds = res.data.leadIds;
                startTransition(() => {
                    setSelectedLeads(new Set(nextIds));
                    setAllFilteredSelected(true);
                });
                toast.success(`Selected ${nextIds.length} lead(s)`);
            } else {
                toast.error(res.msg || 'Failed to select all leads');
            }
        } catch (err) {
            console.error('Error selecting all leads:', err);
            toast.error('Error selecting all leads');
        } finally {
            setSelectingAllLeads(false);
        }
    };

    const handleSelectLead = useCallback((leadId) => {
        setAllFilteredSelected(false);
        startTransition(() => {
            setSelectedLeads(prev => {
                const next = new Set(prev);
                if (next.has(leadId)) next.delete(leadId);
                else next.add(leadId);
                return next;
            });
        });
    }, []);

    const unassignSelectedLeads = async () => {
        if (!isSuperAdmin || selectedLeads.size === 0) return;
        try {
            setAssigning(true);
            const ids = Array.from(selectedLeads);
            const res = await assignLeadsApi(ids, "unassign");
            if (!res.success) {
                toast.error(res.msg || "Failed to unassign leads");
                return;
            }
            const idSet = new Set(ids.map(String));
            setLeads((prev) => {
                if (filters.agent) return prev.filter((lead) => !idSet.has(String(lead._id)));
                return prev.map((lead) => idSet.has(String(lead._id)) ? { ...lead, agent: null } : lead);
            });
            if (filters.agent) {
                setPagination((prev) => ({
                    ...prev,
                    totalFiltered: Math.max(0, (prev.totalFiltered || 0) - ids.length),
                }));
            }
            toast.success(res.msg || "Leads unassigned");
            setSelectedAgentId("");
            setSelectedLeads(new Set());
            setAllFilteredSelected(false);
            setAssignDialogOpen(false);
        } catch (err) {
            console.error("Unassign error:", err);
            toast.error("Error unassigning leads");
        } finally {
            setAssigning(false);
        }
    };

    // Delete handlers
    const handleDeleteClick = (type, lead = null) => {
        if (!isSuperAdmin) {
            toast.error('Only superadmin can delete leads');
            return;
        }
        setDeleteType(type);
        setSelectedLead(lead);
        setDeleteConfirmOpen(true);
    };

    const handleDeleteConfirm = async () => {
        try {
            setDeleting(true);
            let response;

            switch (deleteType) {
                case 'single':
                    response = await deleteLeadApi(selectedLead._id);
                    if (response.success) {
                        toast.success(response.msg || 'Lead deleted successfully');
                        fetchLeads(pagination.currentPage);
                    } else {
                        toast.error(response.msg || 'Failed to delete lead');
                    }
                    break;

                case 'bulk':
                    response = await deleteLeadsBulkApi(Array.from(selectedLeads));
                    if (response.success) {
                        toast.success(response.msg || 'Leads deleted successfully');
                        setSelectedLeads(new Set());
                        setAllFilteredSelected(false);
                        fetchLeads(pagination.currentPage);
                    } else {
                        toast.error(response.msg || 'Failed to delete leads');
                    }
                    break;

                case 'all':
                    // Use progress tracking for delete all
                    setDeleteProgress({
                        total: 0,
                        deleted: 0,
                        percentage: 0,
                        isProcessing: true,
                        msg: 'Starting deletion...'
                    });

                    await deleteAllLeadsApiWithProgress((progressData) => {
                        if (progressData.type === 'start') {
                            setDeleteProgress({
                                total: progressData.total,
                                deleted: 0,
                                percentage: 0,
                                isProcessing: true,
                                msg: progressData.msg || 'Starting deletion...'
                            });
                        } else if (progressData.type === 'progress') {
                            setDeleteProgress({
                                total: progressData.total,
                                deleted: progressData.deleted,
                                percentage: progressData.percentage,
                                isProcessing: true,
                                msg: progressData.msg || `Deleting ${progressData.deleted} of ${progressData.total}...`
                            });
                        } else if (progressData.type === 'complete') {
                            setDeleteProgress({
                                total: progressData.total,
                                deleted: progressData.deleted,
                                percentage: 100,
                                isProcessing: false,
                                msg: progressData.msg || 'Deletion complete!'
                            });
                            toast.success(progressData.msg || 'All leads deleted successfully');
                            setTimeout(() => {
                                fetchLeads(1); // Reset to page 1
                                setDeleteConfirmOpen(false);
                                setDeleting(false);
                            }, 1000);
                            return; // Exit early to prevent finally block
                        } else if (progressData.type === 'error') {
                            toast.error(progressData.message || 'Failed to delete leads');
                            setDeleteProgress({
                                ...deleteProgress,
                                isProcessing: false
                            });
                        }
                    });
                    return; // Exit early for 'all' type to handle in progress callback

                default:
                    return;
            }

        } catch (error) {
            toast.error('Error deleting leads');
            console.error('Delete leads error:', error);
            setDeleteProgress({
                ...deleteProgress,
                isProcessing: false
            });
        } finally {
            if (deleteType !== 'all') {
                setDeleting(false);
                setDeleteConfirmOpen(false);
                setSelectedLead(null);
                setDeleteType('');
            }
        }
    };

    // Menu handlers
    const handleMenuOpen = (event, lead) => {
        setAnchorEl(event.currentTarget);
        setSelectedLead(lead);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
        setSelectedLead(null);
    };

    const handleViewDetails = () => {
        setViewDetailsOpen(true);
        setAnchorEl(null);
    };

    const handleEditLead = () => {
        setEditDialogOpen(true);
        setAnchorEl(null);
    };

    const handleDeleteLead = () => {
        handleDeleteClick('single', selectedLead);
        setAnchorEl(null);
    };

    // Activation handlers
    const handleActivateLead = async () => {
        const lead = selectedLead;
        setAnchorEl(null);

        try {
            const response = await activateLeadApi(lead._id);
            if (response.success) {
                toast.success(response.msg || 'Lead activated successfully!');
                fetchLeads(pagination.currentPage, pagination.limit);
            } else {
                toast.error(response.msg || 'Failed to activate lead');
            }
        } catch (error) {
            console.error('Activation error:', error);
            toast.error(error.response?.data?.msg || 'Failed to activate lead');
        }
    };

    const handleBulkActivate = async () => {
        const leadIds = Array.from(selectedLeads);

        if (leadIds.length === 0) {
            toast.warning('No leads selected');
            return;
        }

        // Close confirmation dialog
        setActivateConfirmOpen(false);

        // Open blocking modal
        setActivationModalOpen(true);
        setActivationProgress({
            total: leadIds.length,
            activated: 0,
            skipped: 0,
            failed: 0,
            percentage: 0,
            msg: 'Starting user creation...',
            completed: false
        });

        try {
            // Call API with progress callback - Pass sendWelcomeEmail option
            const result = await activateLeadsBulkWithProgress(leadIds, sendWelcomeEmail, (progressData) => {
                // Update modal progress in real-time
                setActivationProgress({
                    total: progressData.total || leadIds.length,
                    activated: progressData.activated || 0,
                    skipped: progressData.skipped || 0,
                    failed: progressData.failed || 0,
                    percentage: progressData.percentage || 0,
                    msg: progressData.msg || 'Processing...',
                    completed: progressData.completed || false
                });
            });

            // Close modal
            setActivationModalOpen(false);

            // Refresh leads table
            fetchLeads(pagination.currentPage, pagination.limit);
            setSelectedLeads(new Set());
            setAllFilteredSelected(false);

            // Show skipped users toast if any
            if (result.skippedUsers && result.skippedUsers.length > 0) {
                setTimeout(() => {
                    toast.warning(
                        `⚠️ ${result.skippedUsers.length} User(s) Already Exist in the system`,
                        {
                            autoClose: 8000
                        }
                    );
                }, 1500);
            }

            // If emails were not sent, download CSV with credentials
            if (!sendWelcomeEmail && result.credentials && result.credentials.length > 0) {
                // Generate CSV content
                const csvHeaders = ['Email', 'Password', 'First Name', 'Last Name', 'Status'];
                const csvRows = result.credentials.map(cred => [
                    cred.email,
                    cred.password,
                    cred.firstName || '',
                    cred.lastName || '',
                    'Active'
                ]);

                // Combine headers and rows
                const csvContent = [
                    csvHeaders.join(','),
                    ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
                ].join('\n');

                // Create and download CSV file
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', `user-credentials-${new Date().toISOString().split('T')[0]}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                toast.success(
                    `✅ ${result.activated} users created successfully! Credentials CSV downloaded.`,
                    { autoClose: 6000 }
                );
                setTimeout(() => {
                    toast.info(
                        '📥 User credentials have been downloaded. Please share them securely with the users.',
                        { autoClose: 5000 }
                    );
                }, 1000);
            } else if (sendWelcomeEmail) {
                // Show success toast with email info
                const emailsQueued = result.emailsQueued || 0;
                if (emailsQueued > 0) {
                    toast.success(
                        `✅ ${result.activated} users created successfully! ${emailsQueued} welcome emails are being sent in the background.`,
                        { autoClose: 6000 }
                    );
                    setTimeout(() => {
                        toast.info(
                            '📧 Check the Email Queue page to monitor email sending progress.',
                            { autoClose: 5000 }
                        );
                    }, 1000);
                } else {
                    toast.success(
                        `✅ ${result.activated} users created successfully!`,
                        { autoClose: 6000 }
                    );
                }
            }

        } catch (error) {
            console.error('❌ Bulk activation error:', error);
            setActivationModalOpen(false);
            toast.error(error.message || 'Failed to activate leads');
        }
    };

    // OPTIMIZED: Pagination handlers - backend handles all filtering and pagination
    const handlePageChange = (event, newPage) => {
        fetchLeads(newPage, pagination.limit);
    };

    const handleLimitChange = (event) => {
        const newLimit = parseInt(event.target.value);
        setPagination(prev => ({ ...prev, limit: newLimit }));
        fetchLeads(1, newLimit);
    };

    const handleNextPage = () => {
        if (pagination.hasNextPage) {
            fetchLeads(pagination.currentPage + 1, pagination.limit);
        }
    };

    const handlePrevPage = () => {
        if (pagination.hasPrevPage) {
            fetchLeads(pagination.currentPage - 1, pagination.limit);
        }
    };

    const handleInlineStatusChange = useCallback(async (lead, newStatus) => {
        if (!lead?._id || !newStatus || newStatus === lead.status) {
            return;
        }

        setUpdatingStatusLeadId(lead._id);
        try {
            const response = await updateLeadApi(lead._id, {
                firstName: lead.firstName,
                lastName: lead.lastName,
                email: lead.email,
                phone: lead.phone,
                country: lead.country,
                Brand: lead.Brand,
                Address: lead.Address,
                status: newStatus,
                remarks: lead.remarks,
            });

            if (response.success) {
                moveStatusCount(lead.status, newStatus);
                const shouldRemoveFromFilteredView = filters.status && newStatus !== filters.status;

                if (shouldRemoveFromFilteredView) {
                    setRemovingLeadIds((prev) => ({ ...prev, [lead._id]: true }));
                    if (expandedLead === lead._id) {
                        setExpandedLead(null);
                    }
                    setSelectedLeads((prev) => {
                        if (!prev.has(lead._id)) {
                            return prev;
                        }
                        const next = new Set(prev);
                        next.delete(lead._id);
                        return next;
                    });

                    window.setTimeout(() => {
                        setLeads((prev) => prev.filter((item) => item._id !== lead._id));
                        setRemovingLeadIds((prev) => {
                            const next = { ...prev };
                            delete next[lead._id];
                            return next;
                        });
                        setPagination((prev) => ({
                            ...prev,
                            totalFiltered: Math.max(0, (prev.totalFiltered || 0) - 1),
                        }));
                    }, LEAD_REMOVE_ANIMATION_MS);
                } else {
                    setLeads((prev) =>
                        prev.map((item) =>
                            item._id === lead._id ? { ...item, status: newStatus } : item
                        )
                    );
                }
                toast.success("Status updated");
                if (response.data?.refilledLeads?.length) applyRefilledLeads(response.data.refilledLeads);
            } else {
                toast.error(response.msg || "Failed to update status");
            }
        } catch (error) {
            console.error("Error updating lead status:", error);
            toast.error(error?.msg || "Failed to update status");
        } finally {
            setUpdatingStatusLeadId(null);
        }
    }, [filters.status, expandedLead]);

    const formatDate = useCallback((dateString) => {
        if (!dateString) return "";
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }, []);

    const handleFilterChange = useCallback((field, value) => {
        // For search fields, only update temporary values until Search is clicked
        if (field === 'search') {
            setTempSearch(value);
            return;
        }

        // For other filters, apply immediately (skip if unchanged to avoid refetch loops)
        setFilters((prev) => {
            if (prev[field] === value) {
                return prev;
            }
            return {
                ...prev,
                [field]: value,
            };
        });

        if (field === 'status') {
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                if (value) {
                    next.set('status', value);
                } else {
                    next.delete('status');
                }
                return next;
            }, { replace: true });
        }
    }, [setSearchParams]);

    // Handle search button click
    const handleSearch = useCallback(() => {
        setFilters((prev) => ({
            ...prev,
            search: tempSearch,
            countrySearch: tempCountrySearch.trim(),
            brandSearch: tempBrandSearch.trim(),
        }));
    }, [tempSearch, tempCountrySearch, tempBrandSearch]);

    const applyCountrySearchOnBlur = useCallback(() => {
        const nextValue = tempCountrySearch.trim();
        setFilters((prev) => {
            if (prev.countrySearch === nextValue) {
                return prev;
            }
            return {
                ...prev,
                countrySearch: nextValue,
            };
        });
    }, [tempCountrySearch]);

    const applyBrandSearchOnBlur = useCallback(() => {
        const nextValue = tempBrandSearch.trim();
        setFilters((prev) => {
            if (prev.brandSearch === nextValue) {
                return prev;
            }
            return {
                ...prev,
                brandSearch: nextValue,
            };
        });
    }, [tempBrandSearch]);

    // Handle Enter key in search field
    const handleSearchKeyPress = useCallback((e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    }, [handleSearch]);

    // Clear all filters
    const handleClearFilters = () => {
        setTempSearch("");
        setTempCountrySearch("");
        setTempBrandSearch("");
        setFilters({
            search: "",
            status: "",
            countrySearch: "",
            brandSearch: "",
            agent: "",
            callStatus: "",
            customerAge: "",
            amountLost: "",
            amountLostWhen: "",
            registeredToPlatform: "",
            activeTradingPlatform: "",
            customerBank: "",
            additionalPhone: "",
            screenSharing: "",
            screenSharingId: "",
            customerPotential: "",
        });
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('status');
            return next;
        }, { replace: true });
    };

    const fetchLatestAdminComment = useCallback(async (leadId) => {
        setLoadingLatestComment(prev => ({ ...prev, [leadId]: true }));
        try {
            const response = await getLeadWithActivityApi(leadId);
            if (response.success && Array.isArray(response.activities)) {
                const adminRoles = ['admin', 'superadmin', 'subadmin', 'manager'];
                const adminComments = response.activities
                    .filter(a => a.type === 'comment' && adminRoles.includes((a.createdBy?.userRole || '').toLowerCase()))
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                const latest = adminComments[0] ? {
                    content: adminComments[0].comment || adminComments[0].description || '',
                    createdAt: adminComments[0].createdAt,
                    createdBy: adminComments[0].createdBy || {},
                } : null;
                setLatestAdminComments(prev => ({ ...prev, [leadId]: latest }));
            } else {
                setLatestAdminComments(prev => ({ ...prev, [leadId]: null }));
            }
        } catch (err) {
            console.error('Error fetching latest admin comment:', err);
            setLatestAdminComments(prev => ({ ...prev, [leadId]: null }));
        } finally {
            setLoadingLatestComment(prev => ({ ...prev, [leadId]: false }));
        }
    }, []);

    const handleLeadCommentChange = (leadId, value) => {
        setLeadCommentDrafts((prev) => ({ ...prev, [leadId]: value }));
    };

    const handleAddLeadComment = async (leadId) => {
        const comment = (leadCommentDrafts[leadId] || '').trim();
        if (!comment) {
            toast.warning('Please enter a comment');
            return;
        }

        try {
            setSubmittingLeadComments((prev) => ({ ...prev, [leadId]: true }));
            const response = await addLeadCommentApi(leadId, comment);

            if (response.success) {
                toast.success('Comment added successfully');
                setLeadCommentDrafts((prev) => ({ ...prev, [leadId]: '' }));
                await fetchLatestAdminComment(leadId);
            } else {
                toast.error(response.message || 'Failed to add comment');
            }
        } catch (error) {
            console.error('Error adding comment:', error);
            toast.error('Error adding comment');
        } finally {
            setSubmittingLeadComments((prev) => ({ ...prev, [leadId]: false }));
        }
    };

    const handleLeadCommentKeyPress = (e, leadId) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAddLeadComment(leadId);
        }
    };

    const toggleExpandLead = (leadId) => {
        const next = expandedLead === leadId ? null : leadId;
        setExpandedLead(next);
        if (next && !latestAdminComments[next]) {
            fetchLatestAdminComment(next);
        }
    };

    const handleExportLeads = async () => {
        try {
            toast.info('Preparing export...');

            const response = await exportLeadsApi(filters);

            // Check if response.data is a Blob
            if (response.data instanceof Blob) {
                // Create download link directly from the blob
                const url = window.URL.createObjectURL(response.data);
                const link = document.createElement('a');
                link.href = url;

                // Get filename from headers
                const contentDisposition = response.headers['content-disposition'];
                let filename = `leads-${new Date().toISOString().split('T')[0]}.csv`;

                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
                    if (filenameMatch) {
                        filename = filenameMatch[1];
                    }
                }

                link.setAttribute('download', filename);
                document.body.appendChild(link);
                link.click();

                // Clean up
                window.URL.revokeObjectURL(url);
                document.body.removeChild(link);

                toast.success('Leads exported successfully!');
            } else {
                // Fallback: create blob from response data
                const blob = new Blob([response.data], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `leads-${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link);
                link.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(link);
                toast.success('Leads exported successfully!');
            }

        } catch (error) {
            console.error('Export error:', error);
            toast.error('Failed to export leads');
        }
    };

    if (crmAccessDenied) {
        return <CrmAccessDenied />;
    }

    return (
        <Box sx={{ display: "block", height: "100vh", bgcolor: "background.default", position: "relative" }}>
            {/* Sidebar */}
            <Box>
                <Sidebar
                    setisMobileMenu={setisMobileMenu}
                    isMobileMenu={isMobileMenu}
                    isCollapsed={isSidebarCollapsed}
                    setIsSidebarCollapsed={setIsSidebarCollapsed}
                />
            </Box>

            {/* Overlay for mobile - closes sidebar when clicked */}
            {isMobileMenu && (
                <Box
                    onClick={() => setisMobileMenu(false)}
                    sx={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.5)",
                        zIndex: 1199, // Below sidebar (1200) but above content
                        display: { xs: "block", md: "none" }, // Only show on mobile
                        cursor: "pointer"
                    }}
                />
            )}

            {/* Main Content */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    ml: {
                        xs: 0, // for mobile (0 - 600px) 
                        md: isSidebarCollapsed ? "80px" : "280px", // from 900px+
                    },
                    transition: "margin-left 0.3s ease",
                }}
            >
                {/* Live Call Progress Dialog - Enhanced UI */}

                {/* Header */}
                <AppBar
                    position="static"
                    elevation={0}
                    sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}
                >
                    <Toolbar sx={{ justifyContent: "space-between" }}>
                        <Box
                            sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <IconButton

                                onClick={() => setisMobileMenu(!isMobileMenu)}
                                size="small"
                                sx={{
                                    color: 'text.secondary', display: {
                                        xs: 'block',
                                        md: 'none'
                                    }
                                }}
                            >
                                <MenuIcon />
                            </IconButton>
                            <Box>
                                <Typography variant="h5" fontWeight="bold" color="text.primary">
                                    Leads Management
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Track and manage your sales pipeline
                                </Typography>
                            </Box>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                            <CrmAppBarActions />
                        </Box>
                    </Toolbar>
                </AppBar>

                {/* Bulk Actions Bar - Positioned outside scrollable area for true stickiness */}
                {selectedLeads.size > 0 && (
                    <Card elevation={4} sx={{
                        borderRadius: 0,
                        bgcolor: 'primary.main',
                        position: 'sticky',
                        top: 0,
                        zIndex: 1100, // Higher z-index to stay above everything
                        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                        borderBottom: '2px solid rgba(255,255,255,0.2)',
                    }}>
                        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                            <Box sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: { xs: 'flex-start', sm: 'center' },
                                flexDirection: { xs: 'column', sm: 'row' },
                                gap: 2
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Badge
                                        badgeContent={selectedLeads.size}
                                        color="error"
                                        sx={{
                                            '& .MuiBadge-badge': {
                                                fontSize: '0.875rem',
                                                height: 24,
                                                minWidth: 24,
                                                fontWeight: 'bold'
                                            }
                                        }}
                                    >
                                        <SelectAll sx={{ color: 'white', fontSize: { xs: 28, sm: 32 } }} />
                                    </Badge>
                                    <Box>
                                        <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'white' }}>
                                            {allFilteredSelected
                                                ? `All ${pagination.totalFiltered} Filtered Lead${pagination.totalFiltered !== 1 ? 's' : ''} Selected`
                                                : `${selectedLeads.size} Lead${selectedLeads.size > 1 ? 's' : ''} Selected`}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)', display: { xs: 'none', sm: 'block' } }}>
                                            Choose an action below
                                        </Typography>
                                    </Box>
                                </Box>
                                <Box sx={{
                                    display: 'flex',
                                    gap: 1,
                                    flexWrap: 'wrap',
                                    width: { xs: '100%', sm: 'auto' }
                                }}>
                                    {can('canAssignLeads') && (
                                        <Button
                                            variant="contained"
                                            color="success"
                                            startIcon={<People sx={{ display: { xs: 'none', sm: 'block' } }} />}
                                            onClick={() => setAssignDialogOpen(true)}
                                            size="small"
                                            sx={{
                                                flex: { xs: '1 1 auto', sm: '0 0 auto' },
                                                fontWeight: 'bold',
                                            }}
                                        >
                                            Assign
                                        </Button>
                                    )}
                                    {isSuperAdmin && (
                                        <Button
                                            variant="contained"
                                            color="warning"
                                            onClick={() => unassignSelectedLeads()}
                                            disabled={assigning}
                                            size="small"
                                            sx={{
                                                flex: { xs: '1 1 auto', sm: '0 0 auto' },
                                                fontWeight: 'bold',
                                            }}
                                        >
                                            Unassign
                                        </Button>
                                    )}
                                    {can('canChangeLeadStatus') && (
                                    <Button
                                        variant="contained"
                                        color="secondary"
                                        startIcon={<SwapHoriz sx={{ display: { xs: 'none', sm: 'block' } }} />}
                                        onClick={() => setStatusDialogOpen(true)}
                                        size="small"
                                        sx={{
                                            flex: { xs: '1 1 auto', sm: '0 0 auto' },
                                            fontWeight: 'bold',
                                        }}
                                    >
                                        Change Status ({selectedLeads.size})
                                    </Button>
                                    )}
                                    {canMakeCalls && (
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        startIcon={<Phone />}
                                        onClick={handleBulkCall}
                                        size="small"
                                        sx={{
                                            flex: { xs: '1 1 auto', sm: '0 0 auto' },
                                            fontWeight: 'bold',
                                        }}
                                    >
                                        Call Selected ({selectedLeads.size})
                                    </Button>
                                    )}
                                    <Button
                                        variant="outlined"
                                        startIcon={<Close sx={{ display: { xs: 'none', sm: 'block' } }} />}
                                        onClick={() => {
                                            setSelectedLeads(new Set());
                                            setAllFilteredSelected(false);
                                        }}
                                        size="small"
                                        sx={{
                                            flex: { xs: '1 1 auto', sm: '0 0 auto' },
                                            color: 'white',
                                            borderColor: 'rgba(255,255,255,0.5)',
                                            fontWeight: 'bold',
                                            '&:hover': {
                                                borderColor: 'white',
                                                bgcolor: 'rgba(255,255,255,0.1)'
                                            }
                                        }}
                                    >
                                        Clear
                                    </Button>
                                    {isSuperAdmin && (
                                        <Button
                                            variant="contained"
                                            color="error"
                                            startIcon={<DeleteSweep />}
                                            onClick={() => handleDeleteClick('bulk')}
                                            size="small"
                                            sx={{
                                                flex: { xs: '1 1 100%', sm: '0 0 auto' },
                                                fontWeight: 'bold',
                                            }}
                                        >
                                            Delete ({selectedLeads.size})
                                        </Button>
                                    )}
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                )}

                {/* Main Content Area */}
                <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, sm: 3 } }}>
                    {/* Action Bar */}
                    <Box sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: { xs: "flex-start", md: "center" },
                        flexDirection: { xs: "column", md: "row" },
                        gap: 2,
                        mb: 3
                    }}>
                        <Box>
                            <Typography variant="h6" fontWeight="bold" gutterBottom>
                                All Leads
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                                Manage your leads and track conversions
                            </Typography>
                        </Box>
                        <Box sx={{
                            display: "flex",
                            gap: 1,
                            flexWrap: "wrap",
                            width: { xs: '100%', md: 'auto' }
                        }}>
                           
                            <Button
                                variant="outlined"
                                startIcon={selectingAllLeads ? <CircularProgress size={16} /> : <SelectAll sx={{ display: { xs: 'none', sm: 'block' } }} />}
                                onClick={handleSelectAllInCrm}
                                disabled={loading || selectingAllLeads || pagination.totalFiltered === 0}
                                size="small"
                                sx={{
                                    borderRadius: 2,
                                    flex: { xs: '1 1 auto', sm: '0 0 auto' }
                                }}
                            >
                                {selectingAllLeads
                                    ? 'Selecting...'
                                    : allFilteredSelected || (pagination.totalFiltered > 0 && selectedLeads.size === pagination.totalFiltered)
                                        ? 'Clear Selection'
                                        : `Select All (${pagination.totalFiltered.toLocaleString()})`}
                            </Button>
                            {can('canExportLeads') && (
                            <Button
                                variant="outlined"
                                startIcon={<Download sx={{ display: { xs: 'none', sm: 'block' } }} />}
                                onClick={handleExportLeads}
                                disabled={loading}
                                size="small"
                                sx={{
                                    borderRadius: 2,
                                    flex: { xs: '1 1 auto', sm: '0 0 auto' }
                                }}
                            >
                                Export
                            </Button>
                            )}
                            {isSuperAdmin && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    sx={{
                                        borderRadius: 2,
                                        flex: { xs: '1 1 auto', sm: '0 0 auto' }
                                    }}
                                    onClick={() => setUploadHistoryOpen(true)}
                                >
                                    Upload history
                                </Button>
                            )}
                            {isSuperAdmin && leads.length > 0 && (
                                <Button
                                    variant="outlined"
                                    color="error"
                                    startIcon={<Delete sx={{ display: { xs: 'none', sm: 'block' } }} />}
                                    size="small"
                                    sx={{
                                        borderRadius: 2,
                                        flex: { xs: '1 1 auto', sm: '0 0 auto' }
                                    }}
                                    onClick={() => handleDeleteClick('all')}
                                >
                                    Delete All
                                </Button>
                            )}
                            {can('canCreateLeads') && (
                            <Button
                                variant="contained"
                                startIcon={<Add />}
                                size="small"
                                sx={{
                                    borderRadius: 2,
                                    flex: { xs: '1 1 100%', sm: '0 0 auto' }
                                }}
                                onClick={() => setCreateDialogOpen(true)}
                            >
                                Create Lead
                            </Button>
                            )}
                        </Box>
                    </Box>

                    {/* Filters Card */}
                    <Card elevation={2} sx={{ mb: 3, borderRadius: 3 }}>
                        <CardContent>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
                                <FilterList color="action" />
                                <Typography variant="h6" fontWeight="bold">
                                    Filters & Search
                                </Typography>
                            </Box>
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6} md={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        placeholder="Search leads..."
                                        value={tempSearch}
                                        onChange={(e) => handleFilterChange("search", e.target.value)}
                                        onKeyPress={handleSearchKeyPress}
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <Search />
                                                </InputAdornment>
                                            ),
                                        }}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6} md={3}>
                                    <Autocomplete
                                        freeSolo
                                        fullWidth
                                        size="small"
                                        options={countryOptions}
                                        inputValue={tempCountrySearch}
                                        onInputChange={(event, newInputValue) => {
                                            setTempCountrySearch(newInputValue);
                                        }}
                                        onChange={(event, newValue) => {
                                            if (newValue === null || newValue === "") {
                                                setTempCountrySearch("");
                                                setFilters((prev) => ({ ...prev, countrySearch: "" }));
                                                return;
                                            }
                                            const filterValue = mapCountryOptionToFilter(newValue);
                                            setTempCountrySearch(filterValue);
                                            setFilters((prev) => ({ ...prev, countrySearch: filterValue }));
                                        }}
                                        filterOptions={(options, { inputValue }) => {
                                            const query = inputValue.trim().toLowerCase();
                                            if (!query) return options;
                                            return options.filter((option) =>
                                                option.toLowerCase().includes(query)
                                            );
                                        }}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Country"
                                                placeholder="Search or select country..."
                                                onKeyPress={handleSearchKeyPress}
                                                onBlur={(e) => {
                                                    params.inputProps?.onBlur?.(e);
                                                    applyCountrySearchOnBlur();
                                                }}
                                                InputProps={{
                                                    ...params.InputProps,
                                                    startAdornment: (
                                                        <>
                                                            <InputAdornment position="start">
                                                                <LocationOn fontSize="small" />
                                                            </InputAdornment>
                                                            {params.InputProps.startAdornment}
                                                        </>
                                                    ),
                                                }}
                                            />
                                        )}
                                    />
                                </Grid>
                                {canViewLeadBrand && (
                                <Grid item xs={12} sm={6} md={3}>
                                    <Autocomplete
                                        freeSolo
                                        fullWidth
                                        size="small"
                                        options={brandOptions}
                                        inputValue={tempBrandSearch}
                                        onInputChange={(event, newInputValue) => {
                                            setTempBrandSearch(newInputValue);
                                        }}
                                        onChange={(event, newValue) => {
                                            if (newValue === null || newValue === "") {
                                                setTempBrandSearch("");
                                                setFilters((prev) => ({ ...prev, brandSearch: "" }));
                                                return;
                                            }
                                            const filterValue = String(newValue).trim();
                                            setTempBrandSearch(filterValue);
                                            setFilters((prev) => ({ ...prev, brandSearch: filterValue }));
                                        }}
                                        filterOptions={(options, { inputValue }) => {
                                            const query = inputValue.trim().toLowerCase();
                                            if (!query) return options;
                                            return options.filter((option) =>
                                                option.toLowerCase().includes(query)
                                            );
                                        }}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Brand"
                                                placeholder="Search or select brand..."
                                                onKeyPress={handleSearchKeyPress}
                                                onBlur={(e) => {
                                                    params.inputProps?.onBlur?.(e);
                                                    applyBrandSearchOnBlur();
                                                }}
                                                InputProps={{
                                                    ...params.InputProps,
                                                    startAdornment: (
                                                        <>
                                                            <InputAdornment position="start">
                                                                <Description fontSize="small" />
                                                            </InputAdornment>
                                                            {params.InputProps.startAdornment}
                                                        </>
                                                    ),
                                                }}
                                            />
                                        )}
                                    />
                                </Grid>
                                )}
                                {(can('canAssignLeads') || authUser().user.role === 'manager') ? <Grid item xs={12} sm={6} md={3}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Agent</InputLabel>
                                        <Select
                                            value={filters.agent}
                                            label="Agent"
                                            onChange={(e) => handleFilterChange("agent", e.target.value)}
                                        >
                                            <MenuItem value="">All Agents</MenuItem>
                                            {agents.map((agent) => (
                                                <MenuItem key={agent._id} value={agent._id}>
                                                    {agent.firstName} {agent.lastName} ({agent.role}) - {agent.email}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid> : ""}
                                <Grid item xs={12} sm={6} md={3}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Call Status</InputLabel>
                                        <Select
                                            value={filters.callStatus}
                                            label="Call Status"
                                            onChange={(e) => handleFilterChange("callStatus", e.target.value)}
                                        >
                                            <MenuItem value="">All Call Statuses</MenuItem>
                                            <MenuItem value="completed">✅ Completed Calls</MenuItem>
                                            <MenuItem value="failed">❌ Failed Calls</MenuItem>
                                            <MenuItem value="cancelled">🚫 Cancelled Calls</MenuItem>
                                            <MenuItem value="no-answer">📞 No Answer</MenuItem>
                                            <MenuItem value="no-calls">📵 No Calls</MenuItem>
                                            <MenuItem value="in-progress">🔄 In Progress</MenuItem>
                                            <MenuItem value="ringing">📱 Ringing</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12}>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25, display: 'block', fontWeight: 600 }}>
                                        Status
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center' }}>
                                        <Chip
                                            label={(
                                                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.85 }}>
                                                    All
                                                    <Box component="span" sx={statusCountBadgeSx("#5e35b1", !filters.status)}>
                                                        {Number(statusTotal || 0).toLocaleString()}
                                                    </Box>
                                                </Box>
                                            )}
                                            clickable
                                            size="medium"
                                            onClick={() => handleFilterChange('status', '')}
                                            color={!filters.status ? 'primary' : 'default'}
                                            variant={!filters.status ? 'filled' : 'outlined'}
                                            sx={{
                                                height: 36,
                                                fontWeight: !filters.status ? 700 : 500,
                                                '& .MuiChip-label': { fontSize: '0.9375rem', px: 1.5 },
                                                ...(!filters.status && {
                                                    boxShadow: 2,
                                                    transform: 'scale(1.03)',
                                                }),
                                            }}
                                        />
                                        {filterLeadStatuses.map((status) => {
                                            const isSelected = filters.status === status.label;
                                            const statusColor = getStatusColor(status);
                                            const statusCount = Number(statusCounts[status.label] || 0).toLocaleString();

                                            return (
                                                <Chip
                                                    key={status._id}
                                                    label={(
                                                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.85 }}>
                                                            {status.label}
                                                            <Box component="span" sx={statusCountBadgeSx(statusColor, isSelected)}>
                                                                {statusCount}
                                                            </Box>
                                                        </Box>
                                                    )}
                                                    clickable
                                                    size="medium"
                                                    onClick={() => handleFilterChange('status', status.label)}
                                                    sx={{
                                                        height: 36,
                                                        fontWeight: isSelected ? 700 : 500,
                                                        '& .MuiChip-label': { fontSize: '0.9375rem', px: 1.5 },
                                                        ...getStatusChipSx(statusColor, { filled: isSelected }),
                                                        ...(isSelected && {
                                                            boxShadow: 3,
                                                            transform: 'scale(1.05)',
                                                        }),
                                                    }}
                                                />
                                            );
                                        })}
                                        {canManageStatuses && (
                                            <LeadStatusSelect
                                                manageButtonOnly
                                                value={filters.status}
                                                onChange={(e) => handleFilterChange('status', e.target.value)}
                                                onStatusesChange={() => fetchLeadStatuses({ force: true }).catch(() => {})}
                                            />
                                        )}
                                    </Box>
                                </Grid>
                                <CustomerFieldsFilters filters={filters} onChange={handleFilterChange} />
                                {/* Action Buttons Row */}
                                <Grid item xs={12}>
                                    <Box sx={{
                                        display: "flex",
                                        gap: 1,
                                        justifyContent: "flex-start",
                                        flexWrap: "wrap"
                                    }}>
                                        <Button
                                            variant="contained"
                                            startIcon={<Search />}
                                            onClick={handleSearch}
                                            size="small"
                                            sx={{
                                                borderRadius: 2,
                                                minWidth: 120
                                            }}
                                        >
                                            Search
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            startIcon={<Close />}
                                            onClick={handleClearFilters}
                                            size="small"
                                            sx={{
                                                borderRadius: 2,
                                                minWidth: 120
                                            }}
                                        >
                                            Clear Filters
                                        </Button>
                                    </Box>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>

                    {/* Leads Table */}
                    <Card elevation={2} sx={{ borderRadius: 3, overflow: 'hidden' }}>
                        {/* Pagination bar at top of leads section */}
                        {leads.length > 0 && (
                            <Box sx={{ p: { xs: 1, sm: 2 }, borderBottom: 1, borderColor: 'divider' }}>
                                <Box sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: 2
                                }}>
                                    {/* Page Size Selector */}
                                    <Box sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        order: { xs: 2, md: 1 }
                                    }}>
                                        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                                            Rows:
                                        </Typography>
                                        <Select
                                            size="small"
                                            value={pagination.limit}
                                            onChange={handleLimitChange}
                                            sx={{ minWidth: 80 }}
                                            MenuProps={{
                                                sx: { zIndex: 1600 },
                                                PaperProps: {
                                                    sx: {
                                                        maxHeight: 320,
                                                        bgcolor: "background.paper",
                                                        backgroundImage: "none",
                                                    },
                                                },
                                            }}
                                        >
                                            {[50, 100, 150, 200, 250, 500].map((size) => (
                                                <MenuItem key={size} value={size}>{size}</MenuItem>
                                            ))}
                                        </Select>
                                    </Box>

                                    {/* Pagination Info */}
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{
                                            order: { xs: 3, md: 2 },
                                            width: { xs: '100%', md: 'auto' },
                                            textAlign: { xs: 'center', md: 'left' },
                                            fontSize: { xs: '0.75rem', sm: '0.875rem' }
                                        }}
                                    >
                                        {((pagination.currentPage - 1) * pagination.limit) + 1}-
                                        {Math.min(pagination.currentPage * pagination.limit, pagination.totalFiltered)} of{' '}
                                        {pagination.totalFiltered}
                                        {pagination.totalFiltered !== pagination.totalLeads && (
                                            <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                                                {' '}(filtered from {pagination.totalLeads})
                                            </Box>
                                        )}
                                    </Typography>

                                    {/* Pagination Controls */}
                                    <Box sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                        order: { xs: 1, md: 3 }
                                    }}>
                                        <IconButton
                                            size="small"
                                            onClick={handlePrevPage}
                                            disabled={!pagination.hasPrevPage}
                                            sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
                                        >
                                            <NavigateBefore />
                                        </IconButton>
                                        <Button
                                            size="small"
                                            onClick={handlePrevPage}
                                            disabled={!pagination.hasPrevPage}
                                            startIcon={<NavigateBefore />}
                                            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                                        >
                                            Prev
                                        </Button>

                                        <Pagination
                                            count={pagination.totalPages}
                                            page={pagination.currentPage}
                                            onChange={handlePageChange}
                                            color="primary"
                                            size="small"
                                            showFirstButton={false}
                                            showLastButton={false}
                                            siblingCount={0}
                                            boundaryCount={1}
                                            sx={{
                                                '& .MuiPagination-ul': {
                                                    flexWrap: 'nowrap'
                                                }
                                            }}
                                        />

                                        <Button
                                            size="small"
                                            onClick={handleNextPage}
                                            disabled={!pagination.hasNextPage}
                                            endIcon={<NavigateNext />}
                                            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                                        >
                                            Next
                                        </Button>
                                        <IconButton
                                            size="small"
                                            onClick={handleNextPage}
                                            disabled={!pagination.hasNextPage}
                                            sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
                                        >
                                            <NavigateNext />
                                        </IconButton>
                                    </Box>
                                </Box>
                            </Box>
                        )}

                        <TableContainer sx={{ overflowX: 'auto', opacity: refreshing ? 0.72 : 1, transition: 'opacity 0.15s ease' }}>
                            {refreshing && <LinearProgress />}
                            {loading ? (
                                <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: 400, gap: 2 }}>
                                    <CircularProgress />
                                    <Typography variant="body2" color="text.secondary">
                                        Loading leads...
                                    </Typography>
                                </Box>
                            ) : (
                                <>
                                    <Table
                                        sx={{
                                            minWidth: { xs: 800, md: 'auto' },
                                            '& .MuiTableHead-root .MuiTableCell-root': {
                                                fontSize: '0.875rem',
                                            },
                                            '& .MuiTableBody-root .MuiTableCell-root': {
                                                fontSize: '0.9375rem',
                                                py: 1.25,
                                            },
                                            '& .MuiTableBody-root .MuiTypography-body2': {
                                                fontSize: '0.9375rem',
                                            },
                                            '& .MuiTableBody-root .MuiTypography-caption': {
                                                fontSize: '0.8125rem',
                                            },
                                            '& .MuiTableBody-root .MuiTypography-subtitle2': {
                                                fontSize: '0.8125rem',
                                            },
                                            '& .MuiTableBody-root .MuiChip-label': {
                                                fontSize: '0.75rem',
                                            },
                                        }}
                                    >
                                        <TableHead>
                                            <TableRow>
                                                <TableCell padding="checkbox">
                                                    <MuiCheckbox
                                                        indeterminate={selectedLeads.size > 0 && !isAllPageSelected}
                                                        checked={isAllPageSelected}
                                                        onChange={handleSelectAll}
                                                    />
                                                </TableCell>
                                                <TableCell />
                                                <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 200 }}>
                                                    Contact
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 130 }}>
                                                    Phone
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 120 }}>
                                                    Status
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 120 }}>
                                                    Country
                                                </TableCell>
                                                {canViewLeadBrand && (
                                                <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 120 }}>
                                                    Brand
                                                </TableCell>
                                                )}
                                                {canViewLeadSource && (
                                                <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 140 }}>
                                                    Source
                                                </TableCell>
                                                )}
                                                {canViewLeadFileName && (
                                                <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 140 }}>
                                                    File Name
                                                </TableCell>
                                                )}
                                                 <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 160 }}>
                                                    Remarks
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 150 }}>
                                                    Agent
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 120 }}>
                                                    Created
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 100, textAlign: 'center' }}>
                                                    Call
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: "bold", color: "text.secondary", minWidth: 90 }}>
                                                    Actions
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {leads.map((lead) => {
                                                const isRemoving = Boolean(removingLeadIds[lead._id]);
                                                const removingRowSx = {
                                                    transition: 'opacity 0.35s ease, transform 0.35s ease',
                                                    opacity: isRemoving ? 0 : 1,
                                                    transform: isRemoving ? 'translateX(-20px)' : 'none',
                                                    pointerEvents: isRemoving ? 'none' : 'auto',
                                                };

                                                return (
                                                <React.Fragment key={lead._id}>
                                                    <TableRow
                                                        hover={!isRemoving}
                                                        sx={{
                                                            ...removingRowSx,
                                                            contentVisibility: 'auto',
                                                            containIntrinsicSize: 'auto 72px',
                                                        }}
                                                    >
                                                        <TableCell padding="checkbox">
                                                            <MuiCheckbox
                                                                checked={selectedLeads.has(lead._id)}
                                                                onChange={() => handleSelectLead(lead._id)}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => toggleExpandLead(lead._id)}
                                                            >
                                                                {expandedLead === lead._id ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                                                            </IconButton>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Box>
                                                                <Typography
                                                                    variant="body2"
                                                                    fontWeight="bold"
                                                                    onClick={() => navigate(`/admin/crm/lead/${lead._id}/stream`)}
                                                                    sx={{
                                                                        fontSize: '1rem',
                                                                        cursor: 'pointer',
                                                                        color: 'primary.main',
                                                                        '&:hover': {
                                                                            textDecoration: 'underline'
                                                                        }
                                                                    }}
                                                                >
                                                                    {lead.firstName} {lead.lastName}
                                                                </Typography>
                                                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                                                                    <Email sx={{ fontSize: 16, color: "text.secondary" }} />
                                                                    <Typography
                                                                        component="a"
                                                                        href={`mailto:${lead.email}`}
                                                                        variant="caption"
                                                                        sx={{
                                                                            color: "primary.main",
                                                                            textDecoration: "none",
                                                                            cursor: "pointer",
                                                                            "&:hover": {
                                                                                textDecoration: "underline"
                                                                            }
                                                                        }}
                                                                    >
                                                                        {lead.email}
                                                                    </Typography>
                                                                </Box>
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                                                <Phone sx={{ fontSize: 16, color: "text.secondary" }} />
                                                                <Typography
                                                                    component="a"
                                                                    href={`tel:${lead.phone}`}
                                                                    variant="body2"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    sx={{
                                                                        color: "primary.main",
                                                                        textDecoration: "none",
                                                                        cursor: "pointer",
                                                                        "&:hover": {
                                                                            textDecoration: "underline"
                                                                        }
                                                                    }}
                                                                >
                                                                    {lead.phone}
                                                                </Typography>
                                                                <CopyPhoneButton
                                                                    phone={lead.phone}
                                                                    isCopied={copiedPhones.has(String(lead.phone))}
                                                                    onCopy={handlePhoneCopied}
                                                                />
                                                            </Box>
                                                        </TableCell>
                                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                                            {can('canChangeLeadStatus') ? (
                                                            <InlineLeadStatusCell
                                                                lead={lead}
                                                                onStatusChange={handleInlineStatusChange}
                                                                saving={updatingStatusLeadId === lead._id}
                                                            />
                                                            ) : (
                                                                <Chip label={lead.status || 'New'} size="small" sx={getStatusChipSx(getStatusColor(lead.status, filterLeadStatuses))} />
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography variant="body2">{lead.country}</Typography>
                                                        </TableCell>
                                                        {canViewLeadBrand && (
                                                        <TableCell>
                                                            <Typography variant="body2" fontWeight="medium">
                                                                {lead.Brand}
                                                            </Typography>
                                                        </TableCell>
                                                        )}
                                                        {canViewLeadSource && (
                                                        <TableCell>
                                                            <Typography variant="body2" sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.source || ''}>
                                                                {lead.source || '—'}
                                                            </Typography>
                                                        </TableCell>
                                                        )}
                                                        {canViewLeadFileName && (
                                                        <TableCell>
                                                            <Typography variant="body2" sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.fileName || ''}>
                                                                {lead.fileName || '—'}
                                                            </Typography>
                                                        </TableCell>
                                                        )}
                                                        <TableCell>
                                                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.remarks || ''}>
                                                                {lead.remarks || '—'}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography variant="body2" fontWeight="medium">
                                                                {lead.agent ? `${lead.agent.firstName} ${lead.agent.lastName} (${lead.agent.role})` : 'Unassigned'}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography variant="body2" color="text.secondary">
                                                                {formatDate(lead.createdAt)}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell sx={{ textAlign: 'center' }}>
                                                            {(() => {
                                                                const callInfo = leadCallStatuses[lead._id];
                                                                const activeCallStatus = callStatuses[lead._id]; // For in-progress/ringing calls

                                                                // Priority: active call status > historical call status
                                                                const displayStatus = activeCallStatus || (callInfo?.status);

                                                                if (loadingCallStatuses && !callInfo && !activeCallStatus) {
                                                                    return (
                                                                        <CircularProgress size={16} sx={{ color: 'text.secondary' }} />
                                                                    );
                                                                }

                                                                if (displayStatus === 'completed' || displayStatus === 'in-progress') {
                                                                    return (
                                                                        <Tooltip
                                                                            title={
                                                                                <Box>
                                                                                    <Typography variant="caption" display="block" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                                                        Call Status: {displayStatus === 'completed' ? 'Completed' : 'In Progress'}
                                                                                    </Typography>
                                                                                    {callInfo?.endedAt && (
                                                                                        <Typography variant="caption" display="block">
                                                                                            Last call: {new Date(callInfo.endedAt).toLocaleDateString()}
                                                                                        </Typography>
                                                                                    )}
                                                                                    {callInfo?.callCount > 0 && (
                                                                                        <Typography variant="caption" display="block">
                                                                                            Total calls: {callInfo.callCount}
                                                                                        </Typography>
                                                                                    )}
                                                                                </Box>
                                                                            }
                                                                            arrow
                                                                        >
                                                                            <Box sx={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                width: 32,
                                                                                height: 32,
                                                                                borderRadius: '50%',
                                                                                bgcolor: 'success.light',
                                                                                color: 'success.main',
                                                                                border: '2px solid',
                                                                                borderColor: 'success.main'
                                                                            }}>
                                                                                <CheckCircle sx={{ fontSize: 18 }} />
                                                                            </Box>
                                                                        </Tooltip>
                                                                    );
                                                                }

                                                                if (displayStatus === 'failed' || displayStatus === 'cancelled') {
                                                                    return (
                                                                        <Tooltip
                                                                            title={
                                                                                <Box>
                                                                                    <Typography variant="caption" display="block" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                                                        Call Status: {displayStatus === 'failed' ? 'Failed' : 'Cancelled'}
                                                                                    </Typography>
                                                                                    {callInfo?.endedAt && (
                                                                                        <Typography variant="caption" display="block">
                                                                                            Last call: {new Date(callInfo.endedAt).toLocaleDateString()}
                                                                                        </Typography>
                                                                                    )}
                                                                                    {callInfo?.callCount > 0 && (
                                                                                        <Typography variant="caption" display="block">
                                                                                            Total calls: {callInfo.callCount}
                                                                                        </Typography>
                                                                                    )}
                                                                                </Box>
                                                                            }
                                                                            arrow
                                                                        >
                                                                            <Box sx={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                width: 32,
                                                                                height: 32,
                                                                                borderRadius: '50%',
                                                                                bgcolor: 'error.light',
                                                                                color: 'error.main',
                                                                                border: '2px solid',
                                                                                borderColor: 'error.main'
                                                                            }}>
                                                                                <Cancel sx={{ fontSize: 18 }} />
                                                                            </Box>
                                                                        </Tooltip>
                                                                    );
                                                                }

                                                                if (displayStatus === 'connecting') {
                                                                    return (
                                                                        <Tooltip
                                                                            title={
                                                                                <Box>
                                                                                    <Typography variant="caption" display="block" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                                                        Call Status: Connecting
                                                                                    </Typography>
                                                                                    <Typography variant="caption" display="block">
                                                                                        Waiting for VAPI connection...
                                                                                    </Typography>
                                                                                </Box>
                                                                            }
                                                                            arrow
                                                                        >
                                                                            <Box sx={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                width: 32,
                                                                                height: 32,
                                                                                borderRadius: '50%',
                                                                                bgcolor: 'info.light',
                                                                                color: 'info.main',
                                                                                border: '2px solid',
                                                                                borderColor: 'info.main'
                                                                            }}>
                                                                                <CircularProgress size={18} sx={{ color: 'info.main' }} />
                                                                            </Box>
                                                                        </Tooltip>
                                                                    );
                                                                }

                                                                if (displayStatus === 'ringing' || displayStatus === 'initiating') {
                                                                    return (
                                                                        <Tooltip
                                                                            title={
                                                                                <Box>
                                                                                    <Typography variant="caption" display="block" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                                                        Call Status: {displayStatus === 'ringing' ? 'Ringing' : 'Initiating'}
                                                                                    </Typography>
                                                                                    <Typography variant="caption" display="block">
                                                                                        Call in progress...
                                                                                    </Typography>
                                                                                </Box>
                                                                            }
                                                                            arrow
                                                                        >
                                                                            <Box sx={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                width: 32,
                                                                                height: 32,
                                                                                borderRadius: '50%',
                                                                                bgcolor: 'warning.light',
                                                                                color: 'warning.main',
                                                                                border: '2px solid',
                                                                                borderColor: 'warning.main'
                                                                            }}>
                                                                                <PhoneCallback sx={{ fontSize: 18 }} />
                                                                            </Box>
                                                                        </Tooltip>
                                                                    );
                                                                }

                                                                // No call history
                                                                return (
                                                                    <Tooltip
                                                                        title={
                                                                            <Box>
                                                                                <Typography variant="caption" display="block" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                                                    No Call History
                                                                                </Typography>
                                                                                <Typography variant="caption" display="block">
                                                                                    This lead has not been called yet
                                                                                </Typography>
                                                                            </Box>
                                                                        }
                                                                        arrow
                                                                    >
                                                                        <Box sx={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            width: 32,
                                                                            height: 32,
                                                                            borderRadius: '50%',
                                                                            bgcolor: 'grey.200',
                                                                            color: 'grey.500',
                                                                            border: '2px solid',
                                                                            borderColor: 'grey.300'
                                                                        }}>
                                                                            <PhoneDisabled sx={{ fontSize: 18 }} />
                                                                        </Box>
                                                                    </Tooltip>
                                                                );
                                                            })()}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                                                {lead.phone && canMakeCalls && (
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                        <IconButton
                                                                            size="small"
                                                                            color={callStatuses[lead._id] === 'in-progress' ? 'success' :
                                                                                callStatuses[lead._id] === 'ringing' || callStatuses[lead._id] === 'initiating' ? 'warning' :
                                                                                    callStatuses[lead._id] === 'connecting' ? 'info' : 'primary'}
                                                                            onClick={() => handleCallLead(lead)}
                                                                            disabled={!canMakeCalls || callStatuses[lead._id] === 'ringing' || callStatuses[lead._id] === 'in-progress' || callStatuses[lead._id] === 'connecting' || callStatuses[lead._id] === 'initiating'}
                                                                            title={callStatuses[lead._id] === 'in-progress' ? 'Call in progress' :
                                                                                callStatuses[lead._id] === 'ringing' ? 'Call ringing' :
                                                                                    callStatuses[lead._id] === 'connecting' ? 'Connecting to VAPI...' :
                                                                                        callStatuses[lead._id] === 'initiating' ? 'Initiating call...' : 'Call Lead'}
                                                                        >
                                                                            {callStatuses[lead._id] === 'in-progress' ? <PhoneInTalk /> :
                                                                                callStatuses[lead._id] === 'ringing' || callStatuses[lead._id] === 'initiating' ? <PhoneCallback /> :
                                                                                    callStatuses[lead._id] === 'connecting' ? <CircularProgress size={20} /> : <Phone />}
                                                                        </IconButton>
                                                                        {callStatuses[lead._id] && (
                                                                            <Chip
                                                                                label={callStatuses[lead._id] === 'connecting' ? 'CONNECTING' :
                                                                                    callStatuses[lead._id].replace('-', ' ').toUpperCase()}
                                                                                size="small"
                                                                                color={callStatuses[lead._id] === 'in-progress' ? 'success' :
                                                                                    callStatuses[lead._id] === 'ringing' || callStatuses[lead._id] === 'initiating' ? 'warning' :
                                                                                        callStatuses[lead._id] === 'connecting' ? 'info' : 'default'}
                                                                                sx={{
                                                                                    height: 20,
                                                                                    fontSize: '0.65rem',
                                                                                    fontWeight: 600,
                                                                                    textTransform: 'capitalize'
                                                                                }}
                                                                            />
                                                                        )}
                                                                    </Box>
                                                                )}
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={(e) => handleMenuOpen(e, lead)}
                                                                >
                                                                    <MoreVert />
                                                                </IconButton>
                                                            </Box>
                                                        </TableCell>
                                                    </TableRow>
                                                    <TableRow sx={removingRowSx}>
                                                        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={leadColumnCount}>
                                                            <Collapse in={expandedLead === lead._id && !isRemoving} timeout="auto" unmountOnExit>
                                                                <Box sx={{ margin: 1, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                                                                    <Grid container spacing={2}>
                                                                        <Grid item xs={12} sm={6} md={3}>
                                                                            <Typography variant="subtitle2" color="text.secondary">Email</Typography>
                                                                            <Typography
                                                                                component="a"
                                                                                href={`mailto:${lead.email}`}
                                                                                variant="body2"
                                                                                sx={{
                                                                                    color: "primary.main",
                                                                                    textDecoration: "none",
                                                                                    cursor: "pointer",
                                                                                    "&:hover": {
                                                                                        textDecoration: "underline"
                                                                                    }
                                                                                }}
                                                                            >
                                                                                {lead.email}
                                                                            </Typography>
                                                                        </Grid>
                                                                        <Grid item xs={12} sm={6} md={3}>
                                                                            <Typography variant="subtitle2" color="text.secondary">Phone</Typography>
                                                                            <Typography
                                                                                component="a"
                                                                                href={`tel:${lead.phone}`}
                                                                                variant="body2"
                                                                                sx={{
                                                                                    color: lead.phone ? "primary.main" : "text.secondary",
                                                                                    textDecoration: "none",
                                                                                    cursor: lead.phone ? "pointer" : "default",
                                                                                    "&:hover": {
                                                                                        textDecoration: lead.phone ? "underline" : "none"
                                                                                    }
                                                                                }}
                                                                            >
                                                                                {lead.phone || 'Not provided'}
                                                                            </Typography>
                                                                        </Grid>
                                                                        <Grid item xs={12} sm={6} md={3}>
                                                                            <Typography variant="subtitle2" color="text.secondary">Country</Typography>
                                                                            <Typography variant="body2">{lead.country || 'Not provided'}</Typography>
                                                                        </Grid>
                                                                        {canViewLeadBrand && (
                                                                        <Grid item xs={12} sm={6} md={3}>
                                                                            <Typography variant="subtitle2" color="text.secondary">Brand</Typography>
                                                                            <Typography variant="body2">{lead.Brand || 'Not provided'}</Typography>
                                                                        </Grid>
                                                                        )}
                                                                        {canViewLeadSource && (
                                                                        <Grid item xs={12} sm={6} md={3}>
                                                                            <Typography variant="subtitle2" color="text.secondary">Source</Typography>
                                                                            <Typography variant="body2">{lead.source || 'Not provided'}</Typography>
                                                                        </Grid>
                                                                        )}
                                                                        {canViewLeadFileName && (
                                                                        <Grid item xs={12} sm={6} md={3}>
                                                                            <Typography variant="subtitle2" color="text.secondary">File Name</Typography>
                                                                            <Typography variant="body2">{lead.fileName || 'Not provided'}</Typography>
                                                                        </Grid>
                                                                        )}
                                                                         {lead.remarks && (
                                                                            <Grid item xs={12}>
                                                                                <Typography variant="subtitle2" color="text.secondary">Remarks (Source)</Typography>
                                                                                <Typography variant="body2">{lead.remarks}</Typography>
                                                                            </Grid>
                                                                        )}
                                                                        <Grid item xs={12}>
                                                                            <Typography variant="subtitle2" color="text.secondary">Address</Typography>
                                                                            <Typography variant="body2">{lead.Address || 'Not provided'}</Typography>
                                                                        </Grid>
                                                                        <Grid item xs={12}>
                                                                            <LeadRemindersSection
                                                                                leadId={lead._id}
                                                                                leadName={`${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.email}
                                                                                compact
                                                                                showViewAll
                                                                                refreshTrigger={reminderListRefresh[lead._id] || 0}
                                                                            />
                                                                        </Grid>
                                                                        {can('canCommentOnLeads') && (
                                                                        <Grid item xs={12}>
                                                                            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                                <Comment sx={{ fontSize: 18 }} /> Add comment to stream
                                                                            </Typography>
                                                                            <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
                                                                                <TextField
                                                                                    fullWidth
                                                                                    multiline
                                                                                    minRows={2}
                                                                                    maxRows={4}
                                                                                    placeholder="Write a comment... (Enter to send, Shift+Enter for new line)"
                                                                                    value={leadCommentDrafts[lead._id] || ''}
                                                                                    onChange={(e) => handleLeadCommentChange(lead._id, e.target.value)}
                                                                                    onKeyPress={(e) => handleLeadCommentKeyPress(e, lead._id)}
                                                                                    disabled={!!submittingLeadComments[lead._id]}
                                                                                    size="small"
                                                                                />
                                                                                <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 1 }}>
                                                                                    <Button
                                                                                        size="small"
                                                                                        variant="contained"
                                                                                        onClick={() => handleAddLeadComment(lead._id)}
                                                                                        disabled={
                                                                                            !!submittingLeadComments[lead._id]
                                                                                            || !(leadCommentDrafts[lead._id] || '').trim()
                                                                                        }
                                                                                        startIcon={
                                                                                            submittingLeadComments[lead._id]
                                                                                                ? <CircularProgress size={16} color="inherit" />
                                                                                                : <Comment sx={{ fontSize: 16 }} />
                                                                                        }
                                                                                    >
                                                                                        {submittingLeadComments[lead._id] ? 'Posting...' : 'Post Comment'}
                                                                                    </Button>
                                                                                </Box>
                                                                            </Paper>
                                                                            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                                <Comment sx={{ fontSize: 18 }} /> Latest admin comment (stream)
                                                                            </Typography>
                                                                            {loadingLatestComment[lead._id] ? (
                                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5 }}>
                                                                                    <CircularProgress size={20} />
                                                                                    <Typography variant="body2" color="text.secondary">Loading…</Typography>
                                                                                </Box>
                                                                            ) : latestAdminComments[lead._id] ? (
                                                                                <Paper
                                                                                    variant="outlined"
                                                                                    sx={{
                                                                                        p: 1.5,
                                                                                        bgcolor: 'action.hover',
                                                                                        borderColor: 'divider',
                                                                                        borderLeft: '3px solid',
                                                                                        borderLeftColor: 'primary.main',
                                                                                    }}
                                                                                >
                                                                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>
                                                                                        {latestAdminComments[lead._id].content}
                                                                                    </Typography>
                                                                                    <Typography variant="caption" color="text.secondary">
                                                                                        {latestAdminComments[lead._id].createdBy?.userName || 'Admin'} · {formatDate(latestAdminComments[lead._id].createdAt)} at {new Date(latestAdminComments[lead._id].createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                                                                    </Typography>
                                                                                </Paper>
                                                                            ) : (
                                                                                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                                                    No admin comments in stream yet.
                                                                                </Typography>
                                                                            )}
                                                                        </Grid>
                                                                        )}
                                                                        <Grid item xs={12}>
                                                                            <Box sx={{
                                                                                display: 'flex',
                                                                                gap: 1,
                                                                                flexWrap: 'wrap'
                                                                            }}>
                                                                                <Button
                                                                                    size="small"
                                                                                    variant="outlined"
                                                                                    color="primary"
                                                                                    startIcon={<OpenInNew />}
                                                                                    onClick={() => navigate(`/admin/crm/lead/${lead._id}/stream`)}
                                                                                    sx={{ flex: { xs: '1 1 48%', sm: '0 0 auto' } }}
                                                                                >
                                                                                    Stream
                                                                                </Button>
                                                                                {canSendLeadEmail && lead.email && (
                                                                                    <Button
                                                                                        size="small"
                                                                                        variant="outlined"
                                                                                        color="primary"
                                                                                        startIcon={<Email />}
                                                                                        onClick={() => {
                                                                                            setEmailLead(lead);
                                                                                            setSendEmailDialogOpen(true);
                                                                                        }}
                                                                                        sx={{ flex: { xs: '1 1 48%', sm: '0 0 auto' } }}
                                                                                    >
                                                                                        Send Email
                                                                                    </Button>
                                                                                )}
                                                                                {can('canManageReminders') && (
                                                                                <Button
                                                                                    size="small"
                                                                                    variant="outlined"
                                                                                    startIcon={<Add />}
                                                                                    onClick={() => {
                                                                                        setReminderLead(lead);
                                                                                        setReminderModalOpen(true);
                                                                                    }}
                                                                                    sx={{ flex: { xs: '1 1 48%', sm: '0 0 auto' } }}
                                                                                >
                                                                                    Reminder
                                                                                </Button>
                                                                                )}
                                                                                {can('canEditLeads') && (
                                                                                <Button
                                                                                    size="small"
                                                                                    variant="outlined"
                                                                                    startIcon={<Edit />}
                                                                                    onClick={() => {
                                                                                        setSelectedLead(lead);
                                                                                        setEditDialogOpen(true);
                                                                                    }}
                                                                                    sx={{ flex: { xs: '1 1 48%', sm: '0 0 auto' } }}
                                                                                >
                                                                                    Edit
                                                                                </Button>
                                                                                )}
                                                                                <Button
                                                                                    size="small"
                                                                                    variant="outlined"
                                                                                    startIcon={<Visibility />}
                                                                                    onClick={() => {
                                                                                        setSelectedLead(lead);
                                                                                        setViewDetailsOpen(true);
                                                                                    }}
                                                                                    sx={{ flex: { xs: '1 1 48%', sm: '0 0 auto' } }}
                                                                                >
                                                                                    View
                                                                                </Button>
                                                                                {isSuperAdmin && (
                                                                                    <Button
                                                                                        size="small"
                                                                                        variant="outlined"
                                                                                        color="error"
                                                                                        startIcon={<Delete />}
                                                                                        onClick={() => handleDeleteClick('single', lead)}
                                                                                        sx={{ flex: { xs: '1 1 48%', sm: '0 0 auto' } }}
                                                                                    >
                                                                                        Delete
                                                                                    </Button>
                                                                                )}
                                                                            </Box>
                                                                        </Grid>
                                                                    </Grid>
                                                                </Box>
                                                            </Collapse>
                                                        </TableCell>
                                                    </TableRow>
                                                </React.Fragment>
                                                );
                                            })}
                                            {leads.length === 0 && !loading && (
                                                <TableRow>
                                                    <TableCell colSpan={leadColumnCount} align="center" sx={{ py: 8 }}>
                                                        <Search sx={{ fontSize: 48, color: "grey.300", mb: 2 }} />
                                                        <Typography variant="h6" color="text.secondary" gutterBottom>
                                                            {filters.callStatus ? `No leads with ${filters.callStatus === 'completed' ? 'completed' : filters.callStatus === 'failed' ? 'failed' : filters.callStatus === 'cancelled' ? 'cancelled' : filters.callStatus === 'no-answer' ? 'no answer' : filters.callStatus === 'in-progress' ? 'in-progress' : filters.callStatus === 'ringing' ? 'ringing' : 'no'} call status` : 'No leads found'}
                                                        </Typography>
                                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                                            {filters.callStatus ? 'Try adjusting your call status filter or other filters' : 'Try adjusting your filters or create a new lead'}
                                                        </Typography>
                                                        {can('canCreateLeads') && (
                                                        <Button
                                                            variant="contained"
                                                            startIcon={<Add />}
                                                            onClick={() => setCreateDialogOpen(true)}
                                                        >
                                                            Create Your First Lead
                                                        </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>

                                    {/* Pagination moved to top */}
                                </>
                            )}
                        </TableContainer>
                    </Card>
                </Box>
            </Box>

            {/* Actions Menu */}
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                PaperProps={{
                    elevation: 3,
                    sx: { borderRadius: 2, minWidth: 160 },
                }}
            >
                <MenuItem onClick={handleViewDetails}>
                    <Visibility sx={{ mr: 1, fontSize: 20 }} />
                    View Details
                </MenuItem>
                {can('canEditLeads') && (
                <MenuItem onClick={handleEditLead}>
                    <Edit sx={{ mr: 1, fontSize: 20 }} />
                    Edit Lead
                </MenuItem>
                )}
                {isSuperAdmin && (
                    <MenuItem onClick={handleDeleteLead} sx={{ color: "error.main" }}>
                        <Delete sx={{ mr: 1, fontSize: 20 }} />
                        Delete
                    </MenuItem>
                )}
            </Menu>

            <LeadUploadHistory
                open={uploadHistoryOpen}
                onClose={() => setUploadHistoryOpen(false)}
                onDeleted={() => fetchLeads(pagination.currentPage)}
            />

            {/* Create Lead Dialog */}
            <CreateLeadDialog
                open={createDialogOpen}
                onClose={() => setCreateDialogOpen(false)}
                onLeadCreated={handleLeadCreated}
                agents={agents}
                currentUser={currentAuthUser}
                allowCsvUpload={can('canUploadLeads')}
                allowManageStatuses={canManageStatuses}
                allowViewSource={canViewLeadSource}
                allowViewBrand={canViewLeadBrand}
                allowViewFileName={canViewLeadFileName}
            />

            {/* View Details Dialog */}
            <LeadDetails
                lead={selectedLead}
                open={viewDetailsOpen}
                onClose={() => setViewDetailsOpen(false)}
                navigate={navigate}
                showSource={canViewLeadSource}
                showBrand={canViewLeadBrand}
                showFileName={canViewLeadFileName}
            />

            {/* Edit Lead Dialog */}
            <EditLeadDialog
                lead={selectedLead}
                open={editDialogOpen}
                onClose={() => setEditDialogOpen(false)}
                onLeadUpdated={handleLeadUpdated}
                allowManageStatuses={canManageStatuses}
                allowViewBrand={canViewLeadBrand}
                allowViewFileName={canViewLeadFileName}
            />

            <SendLeadEmailDialog
                open={sendEmailDialogOpen}
                onClose={() => {
                    setSendEmailDialogOpen(false);
                    setEmailLead(null);
                }}
                lead={emailLead}
                staffUser={currentUserLatest}
                isSuperAdmin={isSuperAdmin}
            />

            <ReminderModal
                open={reminderModalOpen}
                onClose={() => {
                    setReminderModalOpen(false);
                    setReminderLead(null);
                }}
                leadId={reminderLead?._id}
                leadName={
                    reminderLead
                        ? `${reminderLead.firstName || ''} ${reminderLead.lastName || ''}`.trim() || reminderLead.email
                        : ''
                }
                onSaved={() => {
                    if (reminderLead?._id) {
                        setReminderListRefresh((prev) => ({
                            ...prev,
                            [reminderLead._id]: (prev[reminderLead._id] || 0) + 1,
                        }));
                    }
                }}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirmOpen}
                onClose={() => !deleteProgress.isProcessing && setDeleteConfirmOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>
                    <Box display="flex" alignItems="center" gap={1}>
                        <Delete color="error" />
                        <Typography variant="h6">Confirm Delete</Typography>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
                    {!deleteProgress.isProcessing ? (
                        <>
                            <Typography>
                                {deleteType === 'single' && `Are you sure you want to delete ${selectedLead?.firstName} ${selectedLead?.lastName}?`}
                                {deleteType === 'bulk' && `Are you sure you want to delete ${selectedLeads.size} selected leads?`}
                                {deleteType === 'all' && (
                                    <>
                                        <Typography variant="body1" gutterBottom>
                                            Are you sure you want to delete <strong>ALL {pagination.totalFiltered} leads</strong>?
                                        </Typography>
                                        <Typography variant="body2" color="error" sx={{ mt: 2, fontWeight: 'bold' }}>
                                            ⚠️ This action will move all leads to the recycle bin.
                                        </Typography>
                                    </>
                                )}
                            </Typography>
                            {deleteType !== 'all' && (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    This will move the lead(s) to the recycle bin.
                                </Typography>
                            )}
                        </>
                    ) : (
                        <Box sx={{ width: '100%', py: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">
                                    {deleteProgress.msg}
                                </Typography>
                                <Typography variant="body2" fontWeight="bold" color="error.main">
                                    {deleteProgress.percentage}%
                                </Typography>
                            </Box>
                            <LinearProgress
                                variant="determinate"
                                value={deleteProgress.percentage}
                                color="error"
                                sx={{ height: 8, borderRadius: 4 }}
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Deleted {deleteProgress.deleted.toLocaleString()} of {deleteProgress.total.toLocaleString()} leads
                            </Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirmOpen(false)} disabled={deleteProgress.isProcessing}>
                        {deleteProgress.isProcessing ? 'Processing...' : 'Cancel'}
                    </Button>
                    {!deleteProgress.isProcessing && (
                        <Button
                            variant="contained"
                            color="error"
                            onClick={handleDeleteConfirm}
                            disabled={deleting}
                            startIcon={deleting ? <CircularProgress size={20} /> : <Delete />}
                        >
                            {deleting ? 'Starting...' : 'Delete'}
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            {/* Activation Confirmation Dialog */}
            <Dialog
                open={activateConfirmOpen}
                onClose={() => !activating && setActivateConfirmOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonAddIcon color="primary" />
                        <Typography variant="h6">Confirm Activation</Typography>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body1" sx={{ mb: 2 }}>
                        You are about to activate <strong>{selectedLeads.size} lead{selectedLeads.size !== 1 ? 's' : ''}</strong> to users.
                    </Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                            <strong>This will:</strong>
                        </Typography>
                        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                            <li>Create user accounts for each lead (fast - ~30 seconds)</li>
                            <li>Generate random passwords</li>
                            {sendWelcomeEmail && <li>Queue welcome emails for background sending</li>}
                        </ul>
                    </Alert>

                    {/* Email Option Toggle */}
                    <Box sx={{
                        p: 2,
                        bgcolor: 'background.default',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        mb: 2
                    }}>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={sendWelcomeEmail}
                                    onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                                    color="primary"
                                />
                            }
                            label={
                                <Box>
                                    <Typography variant="body2" fontWeight="medium">
                                        📧 Send Welcome Emails
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {sendWelcomeEmail
                                            ? 'Welcome emails with login credentials will be sent to all activated users'
                                            : 'Users will be created without sending welcome emails'}
                                    </Typography>
                                </Box>
                            }
                        />
                    </Box>

                    {!sendWelcomeEmail && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            <Typography variant="body2" fontWeight="medium" gutterBottom>
                                📥 CSV Download
                            </Typography>
                            <Typography variant="caption">
                                A CSV file containing email addresses and passwords will be automatically downloaded after user creation.
                                You can use this file to share credentials with users manually.
                            </Typography>
                        </Alert>
                    )}

                    <Typography variant="body2" color="text.secondary">
                        ℹ️ User creation is fast! {sendWelcomeEmail && 'After completion, emails will be sent in the background automatically.'}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setActivateConfirmOpen(false)}
                        disabled={activating}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleBulkActivate}
                        variant="contained"
                        sx={{
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
                            }
                        }}
                        startIcon={activating ? <CircularProgress size={20} color="inherit" /> : <PersonAddIcon />}
                        disabled={activating}
                    >
                        {activating ? 'Activating...' : `Activate ${selectedLeads.size} Lead${selectedLeads.size !== 1 ? 's' : ''}`}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Bulk Change Status Dialog */}
            <Dialog
                open={statusDialogOpen}
                onClose={() => !bulkStatusUpdating && setStatusDialogOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>Change Status for Selected Leads</DialogTitle>
                <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
                    <Typography sx={{ mb: 2 }}>
                        Choose a new status for {selectedLeads.size} selected lead{selectedLeads.size !== 1 ? 's' : ''}:
                    </Typography>
                    <LeadStatusSelect
                        value={bulkStatusValue}
                        onChange={(e) => setBulkStatusValue(e.target.value)}
                        fullWidth
                        allowManage={false}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setStatusDialogOpen(false)}
                        disabled={bulkStatusUpdating}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={async () => {
                            try {
                                if (!bulkStatusValue) {
                                    toast.error('Please select a status');
                                    return;
                                }
                                setBulkStatusUpdating(true);
                                const res = await bulkUpdateLeadStatusApi(Array.from(selectedLeads), bulkStatusValue);
                                if (res.success) {
                                    const incoming = Array.isArray(res.data?.refilledLeads) ? res.data.refilledLeads : [];
                                    const changed = res.data?.changedByStatus || {};
                                    setStatusCounts((prev) => {
                                        const next = { ...prev };
                                        let moved = 0;
                                        Object.entries(changed).forEach(([label, count]) => {
                                            const amount = Number(count) || 0;
                                            moved += amount;
                                            next[label] = Math.max(0, (Number(next[label]) || 0) - amount);
                                        });
                                        if (moved) next[bulkStatusValue] = (Number(next[bulkStatusValue]) || 0) + moved;
                                        return next;
                                    });
                                    const selectedIds = new Set(Array.from(selectedLeads).map(String));
                                    const showUpdated = !filters.status || filters.status === bulkStatusValue;
                                    const removedOnPage = leads.filter((lead) => selectedIds.has(String(lead._id))).length;
                                    setLeads((prev) => prev.flatMap((lead) => {
                                        if (!selectedIds.has(String(lead._id))) return [lead];
                                        if (!showUpdated) return [];
                                        return [{ ...lead, status: bulkStatusValue }];
                                    }));
                                    if (!showUpdated) {
                                        const removed = allFilteredSelected
                                            ? (Number(res.data?.modifiedCount) || removedOnPage)
                                            : removedOnPage;
                                        setPagination((prev) => ({
                                            ...prev,
                                            totalFiltered: Math.max(0, (prev.totalFiltered || 0) - removed),
                                        }));
                                    }
                                    applyRefilledLeads(incoming);
                                    toast.success(res.msg || 'Lead statuses updated successfully');
                                    setBulkStatusValue('');
                                    setSelectedLeads(new Set());
                                    setAllFilteredSelected(false);
                                    setStatusDialogOpen(false);
                                } else {
                                    toast.error(res.msg || 'Failed to update lead statuses');
                                }
                            } catch (err) {
                                console.error('Bulk status update error:', err);
                                toast.error(err.response?.data?.msg || 'Error updating lead statuses');
                            } finally {
                                setBulkStatusUpdating(false);
                            }
                        }}
                        disabled={bulkStatusUpdating || selectedLeads.size === 0 || !bulkStatusValue}
                    >
                        {bulkStatusUpdating ? <CircularProgress size={24} /> : 'Update Status'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Assign Leads Dialog */}
            <Dialog
                open={assignDialogOpen}
                onClose={() => setAssignDialogOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>Assign Selected Leads</DialogTitle>
                <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
                    <Typography sx={{ mb: 2 }}>Select an agent to assign {selectedLeads.size} lead(s):</Typography>
                    <FormControl fullWidth size="small">
                        <InputLabel>Agent</InputLabel>
                        <Select
                            value={selectedAgentId}
                            label="Agent"
                            onChange={(e) => setSelectedAgentId(e.target.value)}
                        >
                            {agents
                                .filter(a => a.role === 'admin' || a.role === 'subadmin' || a.role === 'superadmin')
                                .map(agent => (
                                    <MenuItem key={agent._id} value={agent._id}>
                                        {agent.firstName} {agent.lastName} ({agent.role}) - {agent.email}{currentAuthUser?.user?._id === agent._id ? ' (self)' : ''}
                                    </MenuItem>
                                ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
                    {isSuperAdmin && (
                        <Button
                            color="warning"
                            onClick={unassignSelectedLeads}
                            disabled={assigning || selectedLeads.size === 0}
                        >
                            Unassign
                        </Button>
                    )}
                    <Button
                        variant="contained"
                        onClick={async () => {
                            try {
                                if (!selectedAgentId) {
                                    toast.error('Please select an agent');
                                    return;
                                }
                                setAssigning(true);
                                const res = await assignLeadsApi(Array.from(selectedLeads), selectedAgentId);
                                if (res.success) {
                                    toast.success(res.msg || 'Leads assigned successfully');
                                    // Fetch leads first before closing modal
                                    await fetchLeads(pagination.currentPage);
                                    // Reset state before closing
                                    setSelectedAgentId("");
                                    setSelectedLeads(new Set());
                                    setAllFilteredSelected(false);
                                    setAssigning(false);
                                    // Close modal last
                                    setAssignDialogOpen(false);
                                } else {
                                    toast.error(res.msg || 'Failed to assign leads');
                                    setAssigning(false);
                                }
                            } catch (err) {
                                console.error('Assign error:', err);
                                toast.error('Error assigning leads');
                                setAssigning(false);
                            }
                        }}
                        disabled={assigning || selectedLeads.size === 0}
                    >
                        {assigning ? <CircularProgress size={24} /> : 'Assign'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Blocking Activation Modal */}
            <Dialog
                open={activationModalOpen}
                onClose={() => { }} // Can't close while processing
                disableEscapeKeyDown
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonAddIcon color="primary" />
                        <Typography variant="h6">Creating User Accounts</Typography>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ py: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {activationProgress.msg}
                        </Typography>

                        <Box sx={{ mb: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" fontWeight="medium">
                                    Progress
                                </Typography>
                                <Typography variant="body2" fontWeight="bold" color="primary">
                                    {activationProgress.percentage}%
                                </Typography>
                            </Box>
                            <LinearProgress
                                variant="determinate"
                                value={activationProgress.percentage}
                                sx={{
                                    height: 10,
                                    borderRadius: 5,
                                    bgcolor: 'grey.200',
                                    '& .MuiLinearProgress-bar': {
                                        borderRadius: 5,
                                        background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                                    }
                                }}
                            />
                        </Box>

                        <Grid container spacing={2}>
                            <Grid item xs={4}>
                                <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#f1f8e9', borderRadius: 2 }}>
                                    <Typography variant="h5" fontWeight="bold" color="#558b2f">
                                        {activationProgress.activated}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Created
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={4}>
                                <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#fff3e0', borderRadius: 2 }}>
                                    <Typography variant="h5" fontWeight="bold" color="#e65100">
                                        {activationProgress.skipped}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Skipped
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={4}>
                                <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#ffebee', borderRadius: 2 }}>
                                    <Typography variant="h5" fontWeight="bold" color="#c62828">
                                        {activationProgress.failed}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Failed
                                    </Typography>
                                </Box>
                            </Grid>
                        </Grid>

                        <Alert severity="info" sx={{ mt: 2 }}>
                            <Typography variant="caption">
                                ⏳ Please wait... This usually takes 10-30 seconds for 100 leads.
                            </Typography>
                        </Alert>
                    </Box>
                </DialogContent>
            </Dialog>
        </Box>
    );
};

export default LeadsPage;