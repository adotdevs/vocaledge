import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Paper, Typography } from '@mui/material';
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
    transports: ['websocket', 'polling'],
  });
  return sharedSocket;
};

const popupKey = (message) => `${message?._id}:${message?.version}`;

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
        p: 2,
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        {messages.map((message) => (
          <Paper
            key={popupKey(message)}
            elevation={16}
            sx={{
              p: 2.5,
              borderRadius: 2,
              borderTop: '4px solid',
              borderColor: 'primary.main',
            }}
          >
            <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1}>
              <Box display="flex" alignItems="center" gap={1}>
                <Campaign color="primary" />
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Message
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {message.createdByName || 'Super admin'}
                  </Typography>
                </Box>
              </Box>
              <IconButton
                aria-label="Close message"
                onClick={() => handleClose(message)}
                size="small"
              >
                <Close />
              </IconButton>
            </Box>
            <Typography
              variant="body1"
              sx={{ mt: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {message.message}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
};

export default StaffMessagePopup;
