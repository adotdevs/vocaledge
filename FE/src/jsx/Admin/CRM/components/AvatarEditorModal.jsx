import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Tabs,
  Tab,
  Slider,
  IconButton,
  Avatar,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import {
  PhotoCamera,
  ZoomIn,
  ZoomOut,
  RotateRight,
  RestartAlt,
  Check,
  Close,
  Face,
  Crop,
} from "@mui/icons-material";

export const DEFAULT_AVATARS = [
  { id: "tech-lead", name: "Tech Lead", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4" },
  { id: "executive-female", name: "Executive", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&backgroundColor=ffdfbf" },
  { id: "strategist", name: "Strategist", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Zack&backgroundColor=c0aede" },
  { id: "support-pro", name: "Support Pro", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sara&backgroundColor=d1d4f9" },
  { id: "analyst-male", name: "Analyst", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alexander&backgroundColor=ffd5dc" },
  { id: "manager-female", name: "Manager", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jessica&backgroundColor=ffdfbf" },
  { id: "creative", name: "Creative", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Precious&backgroundColor=b6e3f4" },
  { id: "operations", name: "Operations", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Brian&backgroundColor=c0aede" },
  { id: "director", name: "Director", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Maria&backgroundColor=ffd5dc" },
  { id: "agent-jack", name: "Agent Jack", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jack&backgroundColor=d1d4f9" },
  { id: "designer", name: "Designer", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sophia&backgroundColor=ffdfbf" },
  { id: "specialist", name: "Specialist", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Milo&backgroundColor=b6e3f4" },
  { id: "bot-spark", name: "AI Spark", url: "https://api.dicebear.com/7.x/bottts/svg?seed=Spark&backgroundColor=c0aede" },
  { id: "bot-nova", name: "AI Nova", url: "https://api.dicebear.com/7.x/bottts/svg?seed=Nova&backgroundColor=b6e3f4" },
  { id: "bot-pulse", name: "AI Pulse", url: "https://api.dicebear.com/7.x/bottts/svg?seed=Pulse&backgroundColor=ffd5dc" },
  { id: "bot-echo", name: "AI Echo", url: "https://api.dicebear.com/7.x/bottts/svg?seed=Echo&backgroundColor=d1d4f9" },
];

const CANVAS_SIZE = 300;
const CROP_RADIUS = 120; // 240px diameter

const AvatarEditorModal = ({
  open,
  onClose,
  onSave,
  initialAvatar = "",
  title = "Adjust Profile Picture",
  userName = "User",
}) => {
  const [tab, setTab] = useState(0);
  const [imageSrc, setImageSrc] = useState(null);
  const [loadedImage, setLoadedImage] = useState(null);
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedDefault, setSelectedDefault] = useState(null);
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setTab(0);
      setZoom(0.85);
      setPan({ x: 0, y: 0 });
      setRotation(0);
      setSelectedDefault(null);
      setSaving(false);
      if (initialAvatar) {
        // Pre-populate if existing
        const isDefault = DEFAULT_AVATARS.some((a) => a.url === initialAvatar);
        if (isDefault) {
          setSelectedDefault(initialAvatar);
          setTab(1);
        } else {
          setImageSrc(initialAvatar);
        }
      } else {
        setImageSrc(null);
        setLoadedImage(null);
      }
    }
  }, [open, initialAvatar]);

  // Load image object whenever imageSrc changes
  useEffect(() => {
    if (!imageSrc) {
      setLoadedImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setLoadedImage(img);
      // Normalized scale to fit the crop circle with a comfortable zoomed-out margin
      const fit = (CROP_RADIUS * 2) / Math.min(img.width, img.height);
      setBaseScale(fit);
      setZoom(0.85); // comfortably zoomed out so full subject is visible
      setPan({ x: 0, y: 0 });
      setRotation(0);
    };
    img.onerror = () => {
      setLoadedImage(null);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Redraw canvas with crop overlay
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (loadedImage) {
      ctx.save();
      // Center
      ctx.translate(CANVAS_SIZE / 2 + pan.x, CANVAS_SIZE / 2 + pan.y);
      ctx.rotate((rotation * Math.PI) / 180);
      const effectiveScale = baseScale * zoom;
      ctx.scale(effectiveScale, effectiveScale);
      ctx.drawImage(
        loadedImage,
        -loadedImage.width / 2,
        -loadedImage.height / 2
      );
      ctx.restore();
    } else {
      // Empty placeholder background
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    // Draw Dark Overlay with circular cutout (viewport)
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CROP_RADIUS, 0, Math.PI * 2, true);
    ctx.fill();

    // Circular crop guide border
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CROP_RADIUS, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    // Subtle grid guides inside circular crop
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    // Vertical center line
    ctx.moveTo(CANVAS_SIZE / 2, CANVAS_SIZE / 2 - CROP_RADIUS + 10);
    ctx.lineTo(CANVAS_SIZE / 2, CANVAS_SIZE / 2 + CROP_RADIUS - 10);
    // Horizontal center line
    ctx.moveTo(CANVAS_SIZE / 2 - CROP_RADIUS + 10, CANVAS_SIZE / 2);
    ctx.lineTo(CANVAS_SIZE / 2 + CROP_RADIUS - 10, CANVAS_SIZE / 2);
    ctx.stroke();
    ctx.restore();
  }, [loadedImage, pan, zoom, rotation, baseScale]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Drag / Pan handlers
  const handleMouseDown = (e) => {
    if (!loadedImage) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !loadedImage) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e) => {
    if (!loadedImage || !e.touches[0]) return;
    setIsDragging(true);
    setDragStart({
      x: e.touches[0].clientX - pan.x,
      y: e.touches[0].clientY - pan.y,
    });
  };

  const handleTouchMove = (e) => {
    if (!isDragging || !loadedImage || !e.touches[0]) return;
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  // File selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target?.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Crop & Export high resolution Blob
  const getCroppedBlob = () => {
    return new Promise((resolve, reject) => {
      if (!loadedImage) {
        reject(new Error("No image loaded"));
        return;
      }
      // Preserve full high-resolution quality based on source image dimensions (no quality degradation)
      const minSourceDim = Math.min(
        loadedImage.naturalWidth || loadedImage.width,
        loadedImage.naturalHeight || loadedImage.height
      );
      const outputSize = Math.max(1024, Math.min(minSourceDim, 2048));

      const offscreen = document.createElement("canvas");
      offscreen.width = outputSize;
      offscreen.height = outputSize;
      const ctx = offscreen.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Smooth scaling with highest quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Clear rect: square image with no rounded clipping baked in (CSS handles rounding)
      ctx.clearRect(0, 0, outputSize, outputSize);

      const scaleRatio = outputSize / (CROP_RADIUS * 2);
      const effectiveScale = baseScale * zoom;

      ctx.save();
      ctx.translate(
        outputSize / 2 + pan.x * scaleRatio,
        outputSize / 2 + pan.y * scaleRatio
      );
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(effectiveScale * scaleRatio, effectiveScale * scaleRatio);
      ctx.drawImage(
        loadedImage,
        -loadedImage.width / 2,
        -loadedImage.height / 2
      );
      ctx.restore();

      offscreen.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas export failed"));
            return;
          }
          const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
          const previewUrl = URL.createObjectURL(blob);
          resolve({ file, previewUrl });
        },
        "image/jpeg",
        0.96
      );
    });
  };

  // Handle Save with instant close and optimistic preview
  const handleSave = async () => {
    try {
      if (tab === 0) {
        if (!loadedImage) {
          onClose();
          return;
        }
        setSaving(true);
        const { file, previewUrl } = await getCroppedBlob();
        onClose();
        if (onSave) {
          onSave({ file, previewUrl });
        }
      } else {
        if (!selectedDefault) {
          onClose();
          return;
        }
        onClose();
        if (onSave) {
          onSave({ avatarUrl: selectedDefault, previewUrl: selectedDefault });
        }
      }
    } catch (err) {
      console.error("Avatar save error:", err);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.25)",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
          fontWeight: 700,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Crop color="primary" />
          <Typography variant="h6" fontWeight={700}>
            {title}
          </Typography>
        </Box>
        <IconButton onClick={onClose} disabled={saving} size="small">
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: "divider", px: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, val) => setTab(val)}
          variant="fullWidth"
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab
            icon={<PhotoCamera fontSize="small" />}
            iconPosition="start"
            label="Upload & Crop"
            sx={{ fontWeight: 600, minHeight: 48 }}
          />
          <Tab
            icon={<Face fontSize="small" />}
            iconPosition="start"
            label="Default Avatars"
            sx={{ fontWeight: 600, minHeight: 48 }}
          />
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 3, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {tab === 0 && (
          <Box sx={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            {!loadedImage ? (
              <Box
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  width: CANVAS_SIZE,
                  height: CANVAS_SIZE,
                  borderRadius: 3,
                  border: "2px dashed",
                  borderColor: "primary.main",
                  bgcolor: "action.hover",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  gap: 1.5,
                  p: 2,
                  textAlign: "center",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    bgcolor: "action.selected",
                    borderColor: "primary.dark",
                  },
                }}
              >
                <Avatar sx={{ width: 64, height: 64, bgcolor: "primary.light", color: "primary.main" }}>
                  <PhotoCamera fontSize="large" />
                </Avatar>
                <Typography variant="body1" fontWeight={600}>
                  Click to select a photo
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Supports JPG, PNG, WEBP (drag & zoom to crop)
                </Typography>
              </Box>
            ) : (
              <>
                {/* Canvas Cropper Viewport */}
                <Box
                  sx={{
                    position: "relative",
                    width: CANVAS_SIZE,
                    height: CANVAS_SIZE,
                    borderRadius: 3,
                    overflow: "hidden",
                    cursor: isDragging ? "grabbing" : "grab",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.1)",
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleMouseUp}
                  onWheel={(e) => {
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? -0.04 : 0.04;
                    setZoom((prev) => Math.min(3.0, Math.max(0.3, Number((prev + delta).toFixed(2)))));
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    width={CANVAS_SIZE}
                    height={CANVAS_SIZE}
                    style={{ display: "block" }}
                  />
                </Box>

                <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
                  Drag inside the circle to reposition
                </Typography>

                {/* Cropper Controls */}
                <Box sx={{ width: "100%", maxWidth: 360, px: 2 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                    <ZoomOut fontSize="small" color="action" />
                    <Slider
                      value={zoom}
                      min={0.3}
                      max={3.0}
                      step={0.02}
                      onChange={(_, val) => setZoom(val)}
                      aria-label="Zoom"
                      size="small"
                      sx={{ flex: 1 }}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                    />
                    <ZoomIn fontSize="small" color="action" />
                  </Box>

                  <Box sx={{ display: "flex", justifyContent: "center", gap: 1.5 }}>
                    <Tooltip title="Rotate 90°">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<RotateRight />}
                        onClick={() => setRotation((r) => (r + 90) % 360)}
                      >
                        Rotate
                      </Button>
                    </Tooltip>
                    <Tooltip title="Reset Zoom & Position">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<RestartAlt />}
                        onClick={() => {
                          setZoom(0.85);
                          setPan({ x: 0, y: 0 });
                          setRotation(0);
                        }}
                      >
                        Reset
                      </Button>
                    </Tooltip>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PhotoCamera />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Change
                    </Button>
                  </Box>
                </Box>
              </>
            )}
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ width: "100%" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: "center" }}>
              Select a stylish default avatar preset for this account:
            </Typography>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "repeat(4, 1fr)", sm: "repeat(4, 1fr)" },
                gap: 2,
                maxHeight: 320,
                overflowY: "auto",
                p: 1,
              }}
            >
              {DEFAULT_AVATARS.map((avatar) => {
                const isSelected = selectedDefault === avatar.url;
                return (
                  <Box
                    key={avatar.id}
                    onClick={() => setSelectedDefault(avatar.url)}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 0.75,
                      cursor: "pointer",
                      p: 1,
                      borderRadius: 2.5,
                      border: "2px solid",
                      borderColor: isSelected ? "primary.main" : "transparent",
                      bgcolor: isSelected ? "primary.50" : "action.hover",
                      transition: "all 0.18s ease-in-out",
                      transform: isSelected ? "scale(1.05)" : "scale(1)",
                      position: "relative",
                      "&:hover": {
                        borderColor: isSelected ? "primary.main" : "divider",
                        transform: "scale(1.04)",
                        bgcolor: isSelected ? "primary.50" : "action.selected",
                      },
                    }}
                  >
                    <Avatar
                      src={avatar.url}
                      sx={{
                        width: 56,
                        height: 56,
                        boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                      }}
                    >
                      {avatar.name[0]}
                    </Avatar>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? "primary.main" : "text.secondary",
                        fontSize: "0.75rem",
                        textAlign: "center",
                      }}
                      noWrap
                    >
                      {avatar.name}
                    </Typography>
                    {isSelected && (
                      <Box
                        sx={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          bgcolor: "primary.main",
                          color: "white",
                          borderRadius: "50%",
                          width: 18,
                          height: 18,
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Check sx={{ fontSize: 13 }} />
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={onClose} disabled={saving} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || (tab === 0 && !loadedImage) || (tab === 1 && !selectedDefault)}
          startIcon={saving ? <CircularProgress size={18} /> : <Check />}
        >
          {saving ? "Saving..." : "Apply & Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AvatarEditorModal;
