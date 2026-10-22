import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, Paper, Typography } from '@mui/material';
import { Close, Campaign } from '@mui/icons-material';
import { io } from 'socket.io-client';
import { useAuthUser } from 'react-auth-kit';
import { dismissStaffMessageApi, getPendingStaffMessagesApi } from '../../../../Api/Service';
import { getBackendUrl } from '../../../../config/appConfig';

const AGENT_ROLES = new Set(['admin', 'subadmin']);

let sharedSocket = null;

const getSharedSocket = (backendUrl) => {
  if (sharedSocket) return sharedSocket;
  sharedSocket = io(backendUrl, {
    withCredentials: true,
    transports: ['polling', 'websocket'],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    timeout: 20000,
  });
  return sharedSocket;
};

const popupKey = (message) => `${message?._id}:${message?.version}`;

const formatWhen = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const StaffMessagePopup = () => {
  const authUser = useAuthUser();
  const role = authUser()?.user?.role;
  const [messages, setMessages] = useState([]);
  const dismissedKeysRef = useRef(new Set());

  const loadPending = useCallback(async () => {
    try {
      const response = await getPendingStaffMessagesApi();
      if (response?.success) {
        const pending = (response.messages || []).filter(
          (item) => item?._id && !dismissedKeysRef.current.has(popupKey(item))
        );
        setMessages(pending.sort(
          (a, b) => new Date(b.lastSentAt || b.createdAt) - new Date(a.lastSentAt || a.createdAt)
        ));
      }
    } catch (error) {
      console.error('Failed to load staff messages:', error);
    }
  }, []);

  useEffect(() => {
    if (!role || !AGENT_ROLES.has(role)) return undefined;

    loadPending();
    const interval = setInterval(loadPending, 15000);
    const socket = getSharedSocket(getBackendUrl());

    const handleIncoming = () => {
      loadPending();
    };

    const handleDeleted = (payload) => {
      const messageId = payload?.messageId;
      if (!messageId) return;
      setMessages((prev) => prev.filter((item) => String(item._id) !== String(messageId)));
    };

    socket.on('staffMessagePopup', handleIncoming);
    socket.on('staffMessageUpdated', handleIncoming);
    socket.on('staffMessageDeleted', handleDeleted);

    return () => {
      clearInterval(interval);
      socket.off('staffMessagePopup', handleIncoming);
      socket.off('staffMessageUpdated', handleIncoming);
      socket.off('staffMessageDeleted', handleDeleted);
    };
  }, [role, loadPending]);

  const handleClose = async (message) => {
    if (!message?._id) return;
    dismissedKeysRef.current.add(popupKey(message));
    setMessages((prev) => prev.filter((item) => item._id !== message._id));
    try {
      await dismissStaffMessageApi(message._id);
    } catch (error) {
      console.error('Failed to close staff message:', error);
    }
  };

  if (!role || !AGENT_ROLES.has(role) || messages.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 16000,
        bgcolor: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: 1.5, sm: 3 },
      }}
    >
      <Box
        sx={{
          width: 'min(1200px, 96vw)',
          height: 'min(860px, 92vh)',
          maxHeight: '92vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {messages.map((message) => (
          <Paper
            key={popupKey(message)}
            elevation={24}
            sx={{
              borderRadius: 3,
              overflow: 'hidden',
              minHeight: messages.length === 1 ? '100%' : { xs: 420, sm: 560 },
              flex: messages.length === 1 ? 1 : '0 0 auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box
              sx={{
                px: { xs: 2.5, sm: 4 },
                py: 2.5,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#fff',
              }}
            >
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  bgcolor: 'rgba(255,255,255,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Campaign sx={{ fontSize: 30 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1.2 }}>
                  Message
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
                  {message.createdByName || 'Super admin'}
                  {formatWhen(message.lastSentAt || message.createdAt)
                    ? ` · ${formatWhen(message.lastSentAt || message.createdAt)}`
                    : ''}
                </Typography>
              </Box>
              <IconButton
                aria-label="Close message"
                onClick={() => handleClose(message)}
                sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.12)', '&:hover': { bgcolor: 'rgba(255,255,255,0.22)' } }}
              >
                <Close />
              </IconButton>
            </Box>
            <Box
              sx={{
                px: { xs: 3, sm: 6 },
                py: { xs: 4, sm: 6 },
                flex: 1,
                overflowY: 'auto',
              }}
            >
              <Typography
                sx={{
                  fontSize: { xs: '1.35rem', sm: '1.75rem' },
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {message.message}
              </Typography>
            </Box>
            <Box
              sx={{
                px: { xs: 2.5, sm: 4 },
                py: 2,
                display: 'flex',
                justifyContent: 'flex-end',
                borderTop: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Button
                variant="contained"
                size="large"
                onClick={() => handleClose(message)}
                sx={{ minWidth: 140, textTransform: 'none', fontWeight: 700 }}
              >
                Got it
              </Button>
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  );
};

export default StaffMessagePopup;
