export const STATUS_COLOR_PALETTE = [
    "#1976d2",
    "#0288d1",
    "#0097a7",
    "#00796b",
    "#2e7d32",
    "#689f38",
    "#f9a825",
    "#ef6c00",
    "#e65100",
    "#d32f2f",
    "#c2185b",
    "#7b1fa2",
    "#512da8",
    "#455a64",
    "#5d4037",
    "#616161",
];

const FALLBACK_COLORS = {
    New: "#1976d2",
    "Call Back": "#ef6c00",
    "Not Active": "#d32f2f",
    Active: "#2e7d32",
    "Not Interested": "#757575",
};

export const normalizeHexColor = (value) => {
    if (value === undefined || value === null) return "";
    let hex = String(value).trim();
    if (!hex) return "";
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "";
    return hex.toLowerCase();
};

export const hexToHsl = (hex) => {
    const normalized = normalizeHexColor(hex) || "#1976d2";
    const raw = normalized.slice(1);
    const red = parseInt(raw.slice(0, 2), 16) / 255;
    const green = parseInt(raw.slice(2, 4), 16) / 255;
    const blue = parseInt(raw.slice(4, 6), 16) / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;
    let hue = 0;
    let saturation = 0;
    const delta = max - min;

    if (delta !== 0) {
        saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
        if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
        else if (max === green) hue = (blue - red) / delta + 2;
        else hue = (red - green) / delta + 4;
        hue /= 6;
    }

    return {
        h: Math.round(hue * 360),
        s: Math.round(saturation * 100),
        l: Math.round(lightness * 100),
    };
};

export const hslToHex = (hue, saturation, lightness) => {
    const sat = Math.max(0, Math.min(100, saturation)) / 100;
    const light = Math.max(0, Math.min(100, lightness)) / 100;
    const channel = (index) => {
        const position = (index + hue / 30) % 12;
        const amplitude = sat * Math.min(light, 1 - light);
        const value = light - amplitude * Math.max(-1, Math.min(position - 3, Math.min(9 - position, 1)));
        return Math.round(value * 255).toString(16).padStart(2, "0");
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
};

export const contrastText = (hex) => {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return "#ffffff";
    const raw = normalized.slice(1);
    const red = parseInt(raw.slice(0, 2), 16);
    const green = parseInt(raw.slice(2, 4), 16);
    const blue = parseInt(raw.slice(4, 6), 16);
    const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
    return brightness >= 160 ? "#1a1a1a" : "#ffffff";
};

export const getStatusColor = (statusOrLabel, statuses = []) => {
    if (statusOrLabel && typeof statusOrLabel === "object") {
        const own = normalizeHexColor(statusOrLabel.color);
        if (own) return own;
        return FALLBACK_COLORS[statusOrLabel.label] || "#757575";
    }

    const label = typeof statusOrLabel === "string" ? statusOrLabel : "";
    const match = (statuses || []).find((status) => status.label === label);
    const fromList = normalizeHexColor(match?.color);
    if (fromList) return fromList;
    return FALLBACK_COLORS[label] || "#757575";
};

export const getStatusChipSx = (color, { filled = true } = {}) => {
    const hex = normalizeHexColor(color) || "#757575";
    const text = contrastText(hex);
    if (filled) {
        return {
            bgcolor: hex,
            color: text,
            border: "1px solid",
            borderColor: hex,
            "&:hover": { bgcolor: hex },
        };
    }
    return {
        bgcolor: "transparent",
        color: hex,
        border: "1px solid",
        borderColor: hex,
        "&:hover": { bgcolor: "transparent" },
    };
};

export const getLeadStatusChipProps = (status, statuses = []) => {
    const hex = getStatusColor(status, statuses);
    return {
        color: "default",
        variant: "filled",
        hex,
        sx: getStatusChipSx(hex, { filled: true }),
    };
};
