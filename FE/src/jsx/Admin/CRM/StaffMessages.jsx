import React, { useCallback, useEffect, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { Campaign, Close, Delete, Edit, Refresh, Send } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthUser } from 'react-auth-kit';
import { toast } from 'react-toastify';
import Sidebar from './Sidebar';
import CrmAppBarActions from './components/CrmAppBarActions';
import {
  createStaffMessageApi,
  getStaffMessagesApi,
  deleteStaffMessageApi,
  resendStaffMessageApi,
  updateStaffMessageApi,
} from '../../../Api/Service';

const formatWhen = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const StaffMessages = () => {
  const navigate = useNavigate();
  const authUser = useAuthUser();
  const isSuperAdmin = authUser()?.user?.role === 'superadmin';
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setIsMobileMenu] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (authUser() && !isSuperAdmin) {
      navigate('/admin/dashboard/crm', { replace: true });
    }
  }, [authUser, isSuperAdmin, navigate]);

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getStaffMessagesApi();
      if (response.success) {
        setMessages(response.messages || []);
      } else {
        toast.error(response.msg || 'Failed to load messages');
      }
    } catch (error) {
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) fetchMessages();
  }, [isSuperAdmin, fetchMessages]);

  const handleSend = async () => {
    const message = draft.trim();
    if (!message) {
      toast.error('Write a message first');
      return;
    }
    try {
      setSending(true);
      const response = await createStaffMessageApi({ message });
      if (response.success) {
        toast.success(response.msg || 'Message sent to all agents');
        setDraft('');
        fetchMessages();
      } else {
        toast.error(response.msg || 'Failed to send message');
      }
    } catch (error) {
      toast.error(error?.response?.data?.msg || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleSaveEdit = async () => {
    const message = editText.trim();
    if (!editing || !message) {
      toast.error('Write a message first');
      return;
    }
    try {
      setSavingEdit(true);
      const response = await updateStaffMessageApi(editing._id, { message });
      if (response.success) {
        toast.success('Message updated. Resend the popup if agents should see it again.');
        setEditing(null);
        setEditText('');
        fetchMessages();
      } else {
        toast.error(response.msg || 'Failed to update message');
      }
    } catch (error) {
      toast.error(error?.response?.data?.msg || 'Failed to update message');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting?._id) return;
    try {
      setDeletingId(deleting._id);
      const response = await deleteStaffMessageApi(deleting._id);
      if (response.success) {
        toast.success(response.msg || 'Message deleted');
        if (editing?._id === deleting._id) {
          setEditing(null);
          setEditText('');
        }
        setDeleting(null);
        fetchMessages();
      } else {
        toast.error(response.msg || 'Failed to delete message');
      }
    } catch (error) {
      toast.error(error?.response?.data?.msg || 'Failed to delete message');
    } finally {
      setDeletingId(null);
    }
  };

  const handleResend = async (item) => {
    try {
      setResendingId(item._id);
      const response = await resendStaffMessageApi(item._id);
      if (response.success) {
        toast.success(response.msg || 'Popup sent again to all agents');
        fetchMessages();
      } else {
        toast.error(response.msg || 'Failed to resend popup');
      }
    } catch (error) {
      toast.error(error?.response?.data?.msg || 'Failed to resend popup');
    } finally {
      setResendingId(null);
    }
  };

  if (!isSuperAdmin) return null;

  return (
    <Box sx={{ display: 'block', minHeight: '100vh', bgcolor: 'background.default', position: 'relative' }}>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        isMobileMenu={isMobileMenu}
        setisMobileMenu={setIsMobileMenu}
      />

      {isMobileMenu && (
        <Box
          onClick={() => setIsMobileMenu(false)}
          sx={{
            position: 'fixed',
            inset: 0,
            bgcolor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1199,
            display: { xs: 'block', md: 'none' },
          }}
        />
      )}

      <Box
        component="main"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          ml: { xs: 0, md: isSidebarCollapsed ? '80px' : '280px' },
          transition: 'margin-left 0.3s ease',
        }}
      >
        <AppBar position="sticky" elevation={1} color="inherit" sx={{ bgcolor: 'background.paper' }}>
          <Toolbar>
            <Campaign sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
              Agent Messages
            </Typography>
            <IconButton onClick={fetchMessages} sx={{ mr: 1 }} aria-label="Refresh messages">
              <Refresh />
            </IconButton>
            <CrmAppBarActions />
          </Toolbar>
        </AppBar>

        <Box sx={{ p: { xs: 2, sm: 3 }, flex: 1 }}>
          <Card elevation={2} sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Send a message
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                This opens a popup on every agent screen. They can close it with the X.
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={3}
                maxRows={8}
                label="Message"
                placeholder="Write a message for all agents"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                inputProps={{ maxLength: 2000 }}
              />
              <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <Send />}
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                >
                  Send popup
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            History
          </Typography>

          {loading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : messages.length === 0 ? (
            <Typography color="text.secondary">No messages yet.</Typography>
          ) : (
            <Stack spacing={2}>
              {messages.map((item) => (
                <Card key={item._id} variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent>
                    <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {item.message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
                      Sent {formatWhen(item.createdAt)}
                      {item.sendCount > 1 ? ` · Resent ${item.sendCount - 1} time${item.sendCount - 1 === 1 ? '' : 's'}` : ''}
                      {item.lastSentAt ? ` · Last popup ${formatWhen(item.lastSentAt)}` : ''}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Edit />}
                        onClick={() => {
                          setEditing(item);
                          setEditText(item.message || '');
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={resendingId === item._id ? <CircularProgress size={16} color="inherit" /> : <Send />}
                        onClick={() => handleResend(item)}
                        disabled={resendingId === item._id || deletingId === item._id}
                      >
                        Resend popup
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={deletingId === item._id ? <CircularProgress size={16} color="inherit" /> : <Delete />}
                        onClick={() => setDeleting(item)}
                        disabled={deletingId === item._id}
                      >
                        Delete
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Box>
      </Box>

      <Dialog open={Boolean(deleting)} onClose={() => !deletingId && setDeleting(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete message</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This removes the message from history and closes it on agent screens.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={Boolean(deletingId)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={Boolean(deletingId)}>
            {deletingId ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editing)} onClose={() => !savingEdit && setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            Edit message
            <IconButton onClick={() => setEditing(null)} disabled={savingEdit} aria-label="Close">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Saving changes the stored message. Agents who already closed the popup will not see it again until you resend it.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={4}
            label="Message"
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
            inputProps={{ maxLength: 2000 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)} disabled={savingEdit}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={savingEdit || !editText.trim()}>
            {savingEdit ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StaffMessages;
