import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  IconButton,
  Divider,
  Avatar,
  useMediaQuery,
  useTheme,
  Badge,
  Collapse,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  Dashboard,
  People,
  AdminPanelSettings,
  Logout,
  Menu,
  EmailOutlined,
  Phone,
  PhoneMissed,
  Settings,
  Schedule,
  Error as ErrorIcon,
  Cancel,
  ExpandLess,
  ExpandMore,
  NotificationsActive,
  FolderOpen,
  FilterList,
  Campaign,
  Forum,
} from '@mui/icons-material';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import { useAuthUser, useSignOut } from "react-auth-kit";
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { logoutApi, getEmailQueueStatusApi, getCallQueueStatusApi, getCallStatisticsApi, getReminderBadgeCountApi } from '../../../Api/Service';
import { toast } from 'react-toastify';
import { getLiveSocket } from '../../../utils/liveSocket';
import {
  fetchLeadStatuses,
  getCachedLeadStatuses,
  subscribeLeadStatuses,
} from './components/leadStatusCache';
import { getStatusColor } from './components/leadStatusStyles';
import useLiveCrmUser from './useLiveCrmUser';

const LEADS_LINK = '/admin/dashboard/crm';

const Sidebar = ({ isCollapsed, setIsSidebarCollapsed, isMobileMenu, setisMobileMenu }) => {
  const user = useAuthUser();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [drawerVariant, setDrawerVariant] = useState(isMobile ? "temporary" : "permanent");
  const [emailQueueCount, setEmailQueueCount] = useState(0);
  const [pendingCallsCount, setPendingCallsCount] = useState(0);
  const [failedCallsCount, setFailedCallsCount] = useState(0);
  const [noAnswerCallsCount, setNoAnswerCallsCount] = useState(0);
  const [cancelledCallsCount, setCancelledCallsCount] = useState(0);
  const [reminderBadgeCount, setReminderBadgeCount] = useState(0);
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [leadStatuses, setLeadStatuses] = useState(() => getCachedLeadStatuses() || []);
  const [internalMobileMenu, setInternalMobileMenu] = useState(false);
  const previousPathRef = useRef(location.pathname);
  const { can, role } = useLiveCrmUser();
  const canManageReminders = can("canManageReminders");

  // Use internal state if setisMobileMenu not provided
  const mobileMenuState = isMobileMenu ?? internalMobileMenu;
  const setMobileMenuState = setisMobileMenu ?? setInternalMobileMenu;

  useEffect(() => {
    const fetchReminderBadge = async () => {
      try {
        const response = await getReminderBadgeCountApi();
        if (response.success) {
          setReminderBadgeCount(response.data?.badgeCount || 0);
        }
      } catch (error) {
        // Non-blocking
      }
    };

    if (!canManageReminders) return undefined;

    fetchReminderBadge();
    const interval = setInterval(fetchReminderBadge, 60000);
    return () => clearInterval(interval);
  }, [canManageReminders]);

  // ✅ Socket.io for real-time email queue updates
  useEffect(() => {
    if (!["superadmin", "admin", "subadmin", "manager"].includes(user()?.user?.role)) return undefined;

    const socket = getLiveSocket();

    const onEmailQueue = (data) => {
      const totalCount = (data.pending || 0) + (data.failed || 0);
      setEmailQueueCount(totalCount);
    };
    socket.on('emailQueueUpdate', onEmailQueue);

    // Fetch initial status
    getEmailQueueStatusApi().then(response => {
      if (response.success) {
        const totalCount = (response.data.pending || 0) + (response.data.failed || 0);
        setEmailQueueCount(totalCount);
      }
    }).catch(err => {
      console.error('Error fetching email queue status:', err);
    });

    return () => {
      socket.off('emailQueueUpdate', onEmailQueue);
    };
  }, [user]);

  const isSuperadmin = role === 'superadmin';
  const hasCrmAccess = can('accessCrm');
  const canAccessCallDashboard = can('canAccessCallDashboard');

  // ✅ Fetch pending and failed calls counts for badges
  useEffect(() => {
    if (!canAccessCallDashboard) return;

    let inFlight = false;
    const fetchCallCounts = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const [queueRes, statsRes] = await Promise.all([
          getCallQueueStatusApi({ scheduledPage: 1, scheduledLimit: 1 }),
          getCallStatisticsApi()
        ]);

        if (queueRes.success && queueRes.queue?.scheduledPagination) {
          setPendingCallsCount(queueRes.queue.scheduledPagination.total || 0);
        }

        if (statsRes.success && statsRes.statistics?.byStatus) {
          const failedStats = statsRes.statistics.byStatus.find(s => s._id === 'failed');
          if (failedStats) {
            setFailedCallsCount(failedStats.count || 0);
          }
          const noAnswerStats = statsRes.statistics.byStatus.find(s => s._id === 'no-answer');
          if (noAnswerStats) {
            setNoAnswerCallsCount(noAnswerStats.count || 0);
          }
          const cancelledStats = statsRes.statistics.byStatus.find(s => s._id === 'cancelled');
          if (cancelledStats) {
            setCancelledCallsCount(cancelledStats.count || 0);
          }
        }
      } catch (error) {
        console.error('Error fetching call counts:', error);
      } finally {
        inFlight = false;
      }
    };

    fetchCallCounts();
    const interval = setInterval(fetchCallCounts, 60000);
    return () => clearInterval(interval);
  }, [canAccessCallDashboard]);

  const menuItems = [];
  if (hasCrmAccess) {
    menuItems.push({ icon: <People />, label: 'Leads', link: "/admin/dashboard/crm" });
    if (can('canManageReminders')) {
      menuItems.push({
        icon: <NotificationsActive />,
        label: 'Reminders',
        link: '/admin/crm/reminders',
        badge: true,
        badgeCount: reminderBadgeCount,
      });
    }
    if (can('canManageDocuments')) {
      menuItems.push({
        icon: <FolderOpen />,
        label: 'Document Library',
        link: '/admin/crm/documents',
      });
    }
  }

  // Call-related menu items (will be in dropdown)
  const callMenuItems = [];
  if (canAccessCallDashboard) {
    callMenuItems.push({ icon: <Phone />, label: 'Active Calls', link: "/admin/crm/call-dashboard" });
    callMenuItems.push({ icon: <Schedule />, label: 'Pending Calls Queue', link: "/admin/crm/pending-calls", badge: true, badgeCount: pendingCallsCount });
    callMenuItems.push({ icon: <ErrorIcon />, label: 'Failed Calls', link: "/admin/crm/failed-calls", badge: true, badgeCount: failedCallsCount });
    callMenuItems.push({ icon: <PhoneMissed />, label: 'No Answer Calls', link: "/admin/crm/no-answer-calls", badge: true, badgeCount: noAnswerCallsCount });
    callMenuItems.push({ icon: <Cancel />, label: 'Cancelled Calls', link: "/admin/crm/cancelled-calls", badge: true, badgeCount: cancelledCallsCount });
  }

  useEffect(() => {
    if (!canAccessCallDashboard) {
      setCallMenuOpen(false);
      previousPathRef.current = location.pathname;
      return;
    }

    const isCallRoute = (path) => callMenuItems.some(item => path.startsWith(item.link));
    const currentlyCallRoute = isCallRoute(location.pathname);
    const previouslyCallRoute = isCallRoute(previousPathRef.current);

    if (currentlyCallRoute) {
      setCallMenuOpen(true);
    } else if (previouslyCallRoute) {
      setCallMenuOpen(false);
    }

    previousPathRef.current = location.pathname;
  }, [location.pathname, canAccessCallDashboard, callMenuItems.length]);

  // Add AI Instructions for superadmin and admin
  // if (canAccessAiInstructions) {
  //   menuItems.push({ icon: <Settings />, label: 'AI Instructions', link: "/admin/crm/ai-instructions" });
  // }

  // Admin Management (CRM) - superadmin only
  if (can('canAccessChat')) {
    menuItems.push({ icon: <Forum />, label: 'Chat', link: '/admin/crm/chat/chats' });
  }

  if (isSuperadmin) {
    menuItems.push({ icon: <Campaign />, label: 'Messages', link: "/admin/crm/messages" });
    menuItems.push({ icon: <AdminPanelSettings />, label: 'Admin Management', link: "/admin/crm/admin-management" });
  }

  // Add Recycle Bin and Email Queue for superadmin
  if (user()?.user?.role === 'superadmin') {  // Commented out for now
    menuItems.push({ icon: <DeleteForeverIcon />, label: 'Recycle Bin', link: "/admin/dashboard/crm/recycle-bin" });
    menuItems.push({ icon: <EmailOutlined />, label: 'Email', link: "/admin/crm/email-queue", badge: true });
  }

  // Add Profile link for all admins and superadmin
  if (can('isProfileUpdate')) {
    menuItems.push({ icon: <Settings />, label: 'My Profile', link: "/admin/crm/profile" });
  }

  const isActiveLink = (link) => location.pathname === link || (link.startsWith("/admin/crm/chat") && location.pathname.startsWith("/admin/crm/chat"));
  const isLeadsRoute = location.pathname === LEADS_LINK;
  const activeStatusFilter = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('status') || '';
  }, [location.search]);

  useEffect(() => {
    if (!hasCrmAccess) return undefined;
    return subscribeLeadStatuses(setLeadStatuses);
  }, [hasCrmAccess]);

  useEffect(() => {
    if (!hasCrmAccess) return;
    fetchLeadStatuses().catch(() => { });
  }, [hasCrmAccess]);

  useEffect(() => {
    if (isLeadsRoute && hasCrmAccess) {
      setStatusMenuOpen(true);
    }
  }, [isLeadsRoute, hasCrmAccess]);

  const handleLogout = async () => {
    try {
      const logout = await logoutApi();
      if (logout.success) {
        // Clear localStorage token only when backend is localhost
        // For production backend, cookies handle authentication
        if (typeof window !== 'undefined') {
          try {
            // Dynamic import to avoid circular dependency
            const { isBackendLocalhost, isElectronApp } = require('../../../config/appConfig');
            // Clear localStorage token for Electron OR localhost (both use localStorage, not cookies)
            if (isElectronApp() || isBackendLocalhost()) {
              localStorage.removeItem('jwttoken');
            }
          } catch (e) {
            // Fallback: check API URL directly
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
              localStorage.removeItem('jwttoken');
            }
          }
        }
        signOut();
        navigate("/auth/login/crm");
      } else {
        toast.error(logout.msg);
      }
    } catch (error) {
      toast.error(error.message || "Logout failed");
    }
  };

  const drawerWidth = isCollapsed ? 80 : 280;

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setDrawerVariant("permanent");
        if (setMobileMenuState) {
          setMobileMenuState(false);
        }
      } else {
        setDrawerVariant("temporary");
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initialize on mount

    return () => window.removeEventListener('resize', handleResize);
  }, [setMobileMenuState]);

  return (
    <Drawer
      variant={drawerVariant}
      open={isMobile ? mobileMenuState : true}
      onClose={() => setMobileMenuState && setMobileMenuState(false)}
      sx={{
        width: { xs: 280, md: drawerWidth },
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: { xs: 280, md: drawerWidth },
          boxSizing: 'border-box',
          border: 'none',
          boxShadow: '0 0 20px rgba(0,0,0,0.1)',
          transition: 'width 0.3s ease, transform 0.3s ease',
          overflowX: 'hidden',
        },
      }}
    >
      {/* Header / Logo */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {!isCollapsed && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>V</Avatar>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                Vocaledge
              </Typography>
            </Box>
          )}
          {isCollapsed && (
            <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, mx: 'auto' }}>V</Avatar>
          )}
          <Box>
            {/* Desktop collapse toggle */}
            <IconButton
              onClick={() => setIsSidebarCollapsed(!isCollapsed)}
              size="small"
              sx={{ color: 'text.secondary', display: { xs: 'none', md: 'inline-flex' } }}
            >
              {isCollapsed ? <ChevronRight /> : <ChevronLeft />}
            </IconButton>
            {/* Mobile menu toggle */}
            <IconButton
              onClick={() => setMobileMenuState && setMobileMenuState(false)}
              size="small"
              sx={{ color: 'text.secondary', display: { xs: 'inline-flex', md: 'none' } }}
            >
              <Menu />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Menu Items */}
      <Box sx={{ flex: 1, p: 1, overflow: 'auto' }}>
        <List>
          {menuItems.map((item, index) => {
            // Insert Call Dashboard dropdown after the first item (Leads)
            const shouldShowCallMenu = index === 0 && canAccessCallDashboard && callMenuItems.length > 0;

            return (
              <React.Fragment key={index}>
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    component={Link}
                    to={item.link}
                    onClick={() => isMobile && setMobileMenuState && setMobileMenuState(false)}
                    sx={{
                      borderRadius: 2,
                      color: isActiveLink(item.link) ? 'primary.main' : 'text.secondary',
                      backgroundColor: isActiveLink(item.link) ? 'action.selected' : 'transparent',
                      '&:hover': {
                        backgroundColor: isActiveLink(item.link) ? 'action.selected' : 'action.hover'
                      },
                      justifyContent: isCollapsed ? 'center' : 'flex-start',
                      px: 2,
                      py: 1.5,
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 'auto',
                        color: 'inherit',
                        mr: isCollapsed ? 0 : 2,
                      }}
                    >
                      {item.badge && (
                        (item.badgeCount !== undefined ? item.badgeCount > 0 : emailQueueCount > 0)
                      ) ? (
                        <Badge
                          badgeContent={item.badgeCount !== undefined ? item.badgeCount : emailQueueCount}
                          color={item.link?.includes('failed') ? 'error' : item.link?.includes('reminders') ? 'primary' : 'warning'}
                          max={99}
                        >
                          {item.icon}
                        </Badge>
                      ) : (
                        item.icon
                      )}
                    </ListItemIcon>
                    {!isCollapsed && (
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{
                          fontSize: '0.875rem',
                          fontWeight: isActiveLink(item.link) ? 600 : 500,
                        }}
                      />
                    )}
                    {!isCollapsed && item.badge && (
                      (item.badgeCount !== undefined ? item.badgeCount > 0 : emailQueueCount > 0)
                    ) && (
                        <Badge
                          badgeContent={item.badgeCount !== undefined ? item.badgeCount : emailQueueCount}
                          color={item.link?.includes('failed') ? 'error' : item.link?.includes('reminders') ? 'primary' : 'warning'}
                          max={99}
                        />
                      )}
                  </ListItemButton>
                </ListItem>

                {item.link === LEADS_LINK && hasCrmAccess && (
                  <>
                    <ListItem disablePadding sx={{ mb: 0.5 }}>
                      <ListItemButton
                        onClick={() => {
                          if (isCollapsed) return;
                          setStatusMenuOpen((prev) => {
                            const next = !prev;
                            localStorage.setItem('lead-status-menu-open', JSON.stringify(next));
                            return next;
                          });
                        }}
                        sx={{
                          borderRadius: 2,
                          color: isLeadsRoute ? 'primary.main' : 'text.secondary',
                          backgroundColor: isLeadsRoute ? 'action.selected' : 'transparent',
                          '&:hover': {
                            backgroundColor: 'action.hover',
                          },
                          justifyContent: isCollapsed ? 'center' : 'flex-start',
                          px: 2,
                          py: 1.5,
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 'auto',
                            color: 'inherit',
                            mr: isCollapsed ? 0 : 2,
                          }}
                        >
                          <FilterList />
                        </ListItemIcon>
                        {!isCollapsed && (
                          <>
                            <ListItemText
                              primary="Status"
                              primaryTypographyProps={{
                                fontSize: '0.875rem',
                                fontWeight: isLeadsRoute ? 600 : 500,
                              }}
                            />
                            {statusMenuOpen ? <ExpandLess /> : <ExpandMore />}
                          </>
                        )}
                      </ListItemButton>
                    </ListItem>
                    <Collapse in={statusMenuOpen && !isCollapsed} timeout="auto" unmountOnExit>
                      <List component="div" disablePadding>
                        <ListItem disablePadding sx={{ mb: 0.5, pl: 4 }}>
                          <ListItemButton
                            component={Link}
                            to={LEADS_LINK}
                            onClick={() => isMobile && setMobileMenuState && setMobileMenuState(false)}
                            sx={{
                              borderRadius: 2,
                              color: isLeadsRoute && !activeStatusFilter ? 'primary.main' : 'text.secondary',
                              backgroundColor: isLeadsRoute && !activeStatusFilter ? 'action.selected' : 'transparent',
                              '&:hover': {
                                backgroundColor: isLeadsRoute && !activeStatusFilter ? 'action.selected' : 'action.hover',
                              },
                              px: 2,
                              py: 1.25,
                            }}
                          >
                            <ListItemText
                              primary="All Leads"
                              primaryTypographyProps={{
                                fontSize: '0.8125rem',
                                fontWeight: isLeadsRoute && !activeStatusFilter ? 600 : 500,
                              }}
                            />
                          </ListItemButton>
                        </ListItem>
                        {leadStatuses.map((status) => {
                          const isActive = isLeadsRoute && activeStatusFilter === status.label;
                          return (
                            <ListItem key={status._id} disablePadding sx={{ mb: 0.5, pl: 4 }}>
                              <ListItemButton
                                component={Link}
                                to={`${LEADS_LINK}?status=${encodeURIComponent(status.label)}`}
                                onClick={() => isMobile && setMobileMenuState && setMobileMenuState(false)}
                                sx={{
                                  borderRadius: 2,
                                  color: isActive ? 'primary.main' : 'text.secondary',
                                  backgroundColor: isActive ? 'action.selected' : 'transparent',
                                  '&:hover': {
                                    backgroundColor: isActive ? 'action.selected' : 'action.hover',
                                  },
                                  px: 2,
                                  py: 1.25,
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    bgcolor: getStatusColor(status),
                                    mr: 1,
                                    flexShrink: 0,
                                  }}
                                />
                                <ListItemText
                                  primary={status.label}
                                  primaryTypographyProps={{
                                    fontSize: '0.8125rem',
                                    fontWeight: isActive ? 600 : 500,
                                  }}
                                />
                              </ListItemButton>
                            </ListItem>
                          );
                        })}
                      </List>
                    </Collapse>
                  </>
                )}

                {/* Call Dashboard Dropdown Menu - Inserted after first item (Leads) */}
                {shouldShowCallMenu && (
                  <>
                    <ListItem disablePadding sx={{ mb: 0.5 }}>
                      <ListItemButton
                        onClick={() => !isCollapsed && setCallMenuOpen(prev => { const next = !prev; localStorage.setItem('call-menu-open', JSON.stringify(next)); return next; })}
                        sx={{
                          borderRadius: 2,
                          color: (callMenuItems.some(item => isActiveLink(item.link))) ? 'primary.main' : 'text.secondary',
                          backgroundColor: (callMenuItems.some(item => isActiveLink(item.link))) ? 'action.selected' : 'transparent',
                          '&:hover': {
                            backgroundColor: 'action.hover'
                          },
                          justifyContent: isCollapsed ? 'center' : 'flex-start',
                          px: 2,
                          py: 1.5,
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 'auto',
                            color: 'inherit',
                            mr: isCollapsed ? 0 : 2,
                          }}
                        >
                          <Phone />
                        </ListItemIcon>
                        {!isCollapsed && (
                          <>
                            <ListItemText
                              primary="Call Dashboard"
                              primaryTypographyProps={{
                                fontSize: '0.875rem',
                                fontWeight: (callMenuItems.some(item => isActiveLink(item.link))) ? 600 : 500,
                              }}
                            />
                            {callMenuOpen ? <ExpandLess /> : <ExpandMore />}
                          </>
                        )}
                      </ListItemButton>
                    </ListItem>
                    <Collapse in={callMenuOpen && !isCollapsed} timeout="auto" unmountOnExit>
                      <List component="div" disablePadding>
                        {callMenuItems.map((item, itemIndex) => {
                          const isActive = isActiveLink(item.link);
                          return (
                            <ListItem key={itemIndex} disablePadding sx={{ mb: 0.5, pl: 4 }}>
                              <ListItemButton
                                component={Link}
                                to={item.link}
                                onClick={() => isMobile && setMobileMenuState && setMobileMenuState(false)}
                                sx={{
                                  borderRadius: 2,
                                  color: isActive ? 'primary.main' : 'text.secondary',
                                  backgroundColor: isActive ? 'action.selected' : 'transparent',
                                  '&:hover': {
                                    backgroundColor: isActive ? 'action.selected' : 'action.hover'
                                  },
                                  px: 2,
                                  py: 1.5,
                                }}
                              >
                                <ListItemIcon
                                  sx={{
                                    minWidth: 'auto',
                                    color: 'inherit',
                                    mr: 2,
                                  }}
                                >
                                  {item.badge && item.badgeCount > 0 ? (
                                    <Badge
                                      badgeContent={item.badgeCount}
                                      color={item.link?.includes('failed') ? 'error' : item.link?.includes('no-answer') ? 'warning' : 'default'}
                                      max={99}
                                    >
                                      {item.icon}
                                    </Badge>
                                  ) : (
                                    item.icon
                                  )}
                                </ListItemIcon>
                                <ListItemText
                                  primary={item.label}
                                  primaryTypographyProps={{
                                    fontSize: '0.875rem',
                                    fontWeight: isActive ? 600 : 500,
                                  }}
                                />
                                {item.badge && item.badgeCount > 0 && (
                                  <Badge
                                    badgeContent={item.badgeCount}
                                    color={item.link?.includes('failed') ? 'error' : item.link?.includes('no-answer') ? 'warning' : 'default'}
                                    max={99}
                                  />
                                )}
                              </ListItemButton>
                            </ListItem>
                          );
                        })}
                      </List>
                    </Collapse>
                  </>
                )}
              </React.Fragment>
            );
          })}
        </List>
      </Box>

      <Divider />

      {/* Bottom Section - Logout */}
      <Box sx={{ p: 1 }}>
        <List>
          <ListItem disablePadding>
            <ListItemButton
              onClick={handleLogout}
              sx={{
                borderRadius: 2,
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                px: 2,
                py: 1.5,
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'error.light',
                  color: 'error.main'
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 'auto',
                  color: 'inherit',
                  mr: isCollapsed ? 0 : 2,
                }}
              >
                <Logout />
              </ListItemIcon>
              {!isCollapsed && (
                <ListItemText
                  primary="Logout"
                  primaryTypographyProps={{ fontSize: '0.875rem' }}
                />
              )}
            </ListItemButton>
          </ListItem>
        </List>
      </Box>

      {/* User Profile */}
      {!isCollapsed && (
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
              {'A'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }} noWrap>
                {user()?.user?.firstName}{" "}{user()?.user?.lastName}

              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                {user()?.user?.email}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Drawer>
  );
};

export default Sidebar;
