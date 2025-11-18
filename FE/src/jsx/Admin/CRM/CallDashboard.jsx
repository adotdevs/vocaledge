import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    Chip,
    CircularProgress,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Button,
    Stack,
    LinearProgress,
    Divider,
    Tooltip,
    Avatar,
} from '@mui/material';
import {
    Phone,
    PhoneInTalk,
    PhoneCallback,
    PhoneDisabled,
    CheckCircle,
    Cancel,
    Stop,
    Schedule,
    AccessTime,
    Timer,
    TrendingUp,
    People,
    Refresh,
    PlayArrow,
    Pause,
    Menu as MenuIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
    getCallStatisticsApi,
    getActiveCallsApi,
    getCallQueueStatusApi,
    cancelCallApi,
} from '../../../Api/Service';
import io from 'socket.io-client';
import Sidebar from './Sidebar.js';

const CallDashboard = () => {
    const [statistics, setStatistics] = useState(null);
    const [activeCalls, setActiveCalls] = useState([]);
    const [queueStatus, setQueueStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileMenu, setIsMobileMenu] = useState(false);

    // Fetch all data
    const fetchDashboardData = useCallback(async () => {
        try {
            setRefreshing(true);
            const [statsRes, activeRes, queueRes] = await Promise.all([
                getCallStatisticsApi(),
                getActiveCallsApi(),
                getCallQueueStatusApi(),
            ]);

            if (statsRes.success) {
                setStatistics(statsRes.statistics);
            }
            if (activeRes.success) {
                setActiveCalls(activeRes.calls || []);
            }
            if (queueRes.success) {
                setQueueStatus(queueRes.queue);
            }
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            toast.error('Error loading dashboard data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();
        
        // Set up auto-refresh every 5 seconds
        const interval = setInterval(() => {
            fetchDashboardData();
        }, 5000);

        return () => clearInterval(interval);
    }, [fetchDashboardData]);

    // Socket.io for real-time updates
    useEffect(() => {
        const backendUrl = process.env.REACT_APP_API_URL?.replace('/api/v1', '') || 
                          (window.location.hostname.includes('vocaledge.io') ? 'https://api.vocaledge.io' : 'http://localhost:4000');
        
        const socket = io(backendUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
        });

        socket.on('call:status:update', (data) => {
            // Update active calls in real-time
            setActiveCalls(prev => {
                const existingIndex = prev.findIndex(c => c.sessionId === data.sessionId);
                if (existingIndex >= 0) {
                    const updated = [...prev];
                    updated[existingIndex] = {
                        ...updated[existingIndex],
                        ...data,
                    };
                    return updated;
                } else if (data.status === 'in-progress' || data.status === 'ringing') {
                    return [...prev, data];
                }
                return prev;
            });
            
            // Refresh statistics
            fetchDashboardData();
        });

        socket.on('bulk:call:progress', (data) => {
            if (queueStatus) {
                setQueueStatus(prev => ({
                    ...prev,
                    pending: data.total - data.completed,
                }));
            }
        });

        socket.on('bulk:call:complete', () => {
            fetchDashboardData();
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchDashboardData, queueStatus]);

    const handleCancelCall = async (sessionId) => {
        try {
            const response = await cancelCallApi(sessionId);
            if (response.success) {
                toast.success('Call cancelled');
                fetchDashboardData();
            } else {
                toast.error(response.message || 'Failed to cancel call');
            }
        } catch (error) {
            console.error('Error cancelling call:', error);
            toast.error('Error cancelling call');
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box
            sx={{
                display: 'flex',
                height: '100vh',
                overflow: 'hidden',
            }}
        >
            {/* Sidebar */}
            <Sidebar
                setisMobileMenu={setIsMobileMenu}
                isMobileMenu={isMobileMenu}
                isCollapsed={isSidebarCollapsed}
                setIsSidebarCollapsed={setIsSidebarCollapsed}
            />

            {/* Mobile Menu Overlay */}
            {isMobileMenu && (
                <Box
                    onClick={() => setIsMobileMenu(false)}
                    sx={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        zIndex: 1199,
                        display: { xs: 'block', md: 'none' },
                        cursor: 'pointer'
                    }}
                />
            )}

            {/* Main Content */}
            <Box
                component="main"
                sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    ml: {
                        xs: 0,
                        md: isSidebarCollapsed ? '0' : '0',
                    },
                    transition: 'margin-left 0.3s ease',
                    height: '100vh',
                    overflow: 'auto',
                }}
            >
                <Box sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <IconButton
                                onClick={() => setIsMobileMenu(!isMobileMenu)}
                                sx={{
                                    color: 'text.primary',
                                    display: { xs: 'block', md: 'none' },
                                }}
                            >
                                <MenuIcon />
                            </IconButton>
                            <Typography variant="h4" sx={{ fontWeight: 700 }}>
                                Call Dashboard
                            </Typography>
                        </Box>
                        <Button
                            variant="outlined"
                            startIcon={refreshing ? <CircularProgress size={16} /> : <Refresh />}
                            onClick={fetchDashboardData}
                            disabled={refreshing}
                        >
                            Refresh
                        </Button>
                    </Box>

                    {/* Statistics Cards */}
                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={6} md={3}>
                            <Card elevation={2} sx={{ bgcolor: 'primary.main', color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                                        {statistics?.total || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Total Calls
                                    </Typography>
                                </Box>
                                <Phone sx={{ fontSize: 48, opacity: 0.8 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={2} sx={{ bgcolor: 'success.main', color: 'white' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                                        {statistics?.completed || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Completed
                                    </Typography>
                                </Box>
                                <CheckCircle sx={{ fontSize: 48, opacity: 0.8 }} />
                            </Box>
                        </CardContent>
                    </Card>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                            <Card elevation={2} sx={{ bgcolor: 'info.main', color: 'white' }}>
                                <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                                        {activeCalls.length}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        Active Calls
                                    </Typography>
                                </Box>
                                <PhoneInTalk sx={{ fontSize: 48, opacity: 0.8 }} />
                            </Box>
                        </CardContent>
                    </Card>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                            <Card elevation={2} sx={{ bgcolor: 'warning.main', color: 'white' }}>
                                <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                                        {queueStatus?.pending || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                        In Queue
                                    </Typography>
                                </Box>
                                <Schedule sx={{ fontSize: 48, opacity: 0.8 }} />
                            </Box>
                        </CardContent>
                    </Card>
                        </Grid>
                    </Grid>

                    {/* Success Rate & Queue Status */}
                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        <Grid item xs={12} md={6}>
                            <Card elevation={2}>
                        <CardContent>
                            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                                Success Rate
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ flex: 1 }}>
                                    <LinearProgress 
                                        variant="determinate" 
                                        value={parseFloat(statistics?.successRate || 0)} 
                                        sx={{ 
                                            height: 20, 
                                            borderRadius: 2,
                                            bgcolor: 'grey.200',
                                            '& .MuiLinearProgress-bar': {
                                                borderRadius: 2,
                                                bgcolor: 'success.main'
                                            }
                                        }}
                                    />
                                </Box>
                                <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main', minWidth: 80 }}>
                                    {statistics?.successRate || 0}%
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                {statistics?.completed || 0} completed out of {statistics?.total || 0} total calls
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card elevation={2}>
                        <CardContent>
                            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                                Call Queue Status
                            </Typography>
                            <Stack spacing={2}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" color="text.secondary">
                                        Pending in Queue
                                    </Typography>
                                    <Chip 
                                        label={queueStatus?.pending || 0} 
                                        color="warning"
                                        sx={{ fontWeight: 600 }}
                                    />
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" color="text.secondary">
                                        Total Scheduled
                                    </Typography>
                                    <Chip 
                                        label={queueStatus?.totalScheduled || 0} 
                                        color="info"
                                        sx={{ fontWeight: 600 }}
                                    />
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" color="text.secondary">
                                        Currently Processing
                                    </Typography>
                                    <Chip 
                                        label={queueStatus?.isProcessing ? 'Yes' : 'No'} 
                                        color={queueStatus?.isProcessing ? 'info' : 'default'}
                                        sx={{ fontWeight: 600 }}
                                    />
                                </Box>
                                {queueStatus?.currentCall && (
                                    <Box sx={{ p: 2, bgcolor: 'info.light', borderRadius: 1, border: '1px solid', borderColor: 'info.main' }}>
                                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom sx={{ fontWeight: 600 }}>
                                            Current Call in Queue
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                            {queueStatus.currentCall.phoneNumber}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Status: {queueStatus.currentCall.status}
                                        </Typography>
                                    </Box>
                                )}
                                {queueStatus?.activeCall && (
                                    <Box sx={{ p: 2, bgcolor: 'success.light', borderRadius: 1, border: '1px solid', borderColor: 'success.main' }}>
                                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom sx={{ fontWeight: 600 }}>
                                            Active Call
                                        </Typography>
                                        {queueStatus.activeCall.leadInfo && (
                                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                                {queueStatus.activeCall.leadInfo.firstName} {queueStatus.activeCall.leadInfo.lastName}
                                            </Typography>
                                        )}
                                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                            {queueStatus.activeCall.phoneNumber}
                                        </Typography>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                Duration: {formatDuration(queueStatus.activeCall.duration || 0)}
                                            </Typography>
                                            <Chip 
                                                label={queueStatus.activeCall.status?.replace('-', ' ').toUpperCase()} 
                                                size="small"
                                                color="success"
                                                sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                                            />
                                        </Box>
                                    </Box>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>
                    </Grid>
                    </Grid>

                    {/* Active Calls Table */}
                    <Card elevation={2}>
                        <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            Active Calls
                        </Typography>
                        <Chip 
                            label={`${activeCalls.length} Active`}
                            color="info"
                            sx={{ fontWeight: 600 }}
                        />
                    </Box>

                    {activeCalls.length === 0 ? (
                        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                            <PhoneDisabled sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                            <Typography variant="h6" color="text.secondary" gutterBottom>
                                No Active Calls
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                All calls are completed or no calls are in progress
                            </Typography>
                        </Paper>
                    ) : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Lead</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Started</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {activeCalls.map((call) => (
                                        <TableRow key={call._id || call.sessionId} hover>
                                            <TableCell>
                                                {call.leadId ? (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <Avatar sx={{ width: 32, height: 32, fontSize: '0.75rem' }}>
                                                            {call.leadId.firstName?.[0]}{call.leadId.lastName?.[0]}
                                                        </Avatar>
                                                        <Box>
                                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                {call.leadId.firstName} {call.leadId.lastName}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {call.leadId.email}
                                                            </Typography>
                                                        </Box>
                                                    </Box>
                                                ) : (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Unknown Lead
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Phone sx={{ fontSize: 16, color: 'text.secondary' }} />
                                                    <Typography variant="body2">
                                                        {call.phoneNumber}
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={call.status?.replace('-', ' ').toUpperCase() || 'UNKNOWN'} 
                                                    size="small"
                                                    color={
                                                        call.status === 'completed' ? 'success' :
                                                        call.status === 'in-progress' ? 'info' :
                                                        call.status === 'ringing' ? 'warning' :
                                                        call.status === 'failed' ? 'error' : 'default'
                                                    }
                                                    icon={
                                                        call.status === 'in-progress' ? <PhoneInTalk /> :
                                                        call.status === 'ringing' ? <PhoneCallback /> :
                                                        <Phone />
                                                    }
                                                    sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Timer sx={{ fontSize: 16, color: 'text.secondary' }} />
                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                        {call.liveDurationFormatted || formatDuration(call.liveDuration || call.duration || 0)}
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="text.secondary">
                                                    {formatDateTime(call.startedAt)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Tooltip title="Cancel Call">
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleCancelCall(call.sessionId)}
                                                    >
                                                        <Stop />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                    </CardContent>
                    </Card>

                    {/* Pending Calls Queue */}
                    {queueStatus?.pendingCalls && queueStatus.pendingCalls.length > 0 && (
                        <Card elevation={2} sx={{ mt: 3 }}>
                            <CardContent>
                                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                                    Pending Calls Queue ({queueStatus.pendingCalls.length})
                                </Typography>
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600 }}>Lead</TableCell>
                                                <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                                                <TableCell sx={{ fontWeight: 600 }}>Scheduled At</TableCell>
                                                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {queueStatus.pendingCalls.map((call) => (
                                                <TableRow key={call.callId || call.sessionId} hover>
                                                    <TableCell>
                                                        {call.leadInfo ? (
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <Avatar sx={{ width: 28, height: 28, fontSize: '0.7rem' }}>
                                                                    {call.leadInfo.firstName?.[0]}{call.leadInfo.lastName?.[0]}
                                                                </Avatar>
                                                                <Box>
                                                                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                                                        {call.leadInfo.firstName} {call.leadInfo.lastName}
                                                                    </Typography>
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        {call.leadInfo.email}
                                                                    </Typography>
                                                                </Box>
                                                            </Box>
                                                        ) : (
                                                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                                                Unknown Lead
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            <Phone sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                            <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                                                                {call.phoneNumber}
                                                            </Typography>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                                            {formatDateTime(call.scheduledAt)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip 
                                                            label={call.status?.replace('-', ' ').toUpperCase() || 'SCHEDULED'} 
                                                            size="small"
                                                            color="warning"
                                                            sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </CardContent>
                        </Card>
                    )}

                    {/* Statistics Breakdown */}
                    {statistics && statistics.byStatus && statistics.byStatus.length > 0 && (
                        <Card elevation={2} sx={{ mt: 3 }}>
                            <CardContent>
                        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                            Statistics by Status
                        </Typography>
                        <Grid container spacing={2}>
                            {statistics.byStatus.map((stat) => (
                                <Grid item xs={12} sm={6} md={4} key={stat._id}>
                                    <Paper variant="outlined" sx={{ p: 2 }}>
                                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                            {stat._id?.replace('-', ' ').toUpperCase() || 'UNKNOWN'}
                                        </Typography>
                                        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                                            {stat.count}
                                        </Typography>
                                        {stat.avgDuration > 0 && (
                                            <Typography variant="caption" color="text.secondary">
                                                Avg Duration: {formatDuration(Math.round(stat.avgDuration))}
                                            </Typography>
                                        )}
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>
                        </CardContent>
                    </Card>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

export default CallDashboard;

