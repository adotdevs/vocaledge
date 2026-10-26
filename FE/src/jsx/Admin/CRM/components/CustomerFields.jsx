import {
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { banksForCountry, yesNoLabel } from "../leadCustomerFields";

const YesNoField = ({ label, value, onChange, disabled }) => (
  <FormControl fullWidth size="small" disabled={disabled}>
    <InputLabel>{label}</InputLabel>
    <Select label={label} value={value || ""} onChange={(event) => onChange(event.target.value)}>
      <MenuItem value="">Not set</MenuItem>
      <MenuItem value="yes">Yes</MenuItem>
      <MenuItem value="no">No</MenuItem>
    </Select>
  </FormControl>
);

export const CustomerFieldsEditor = ({ values, onChange, country, disabled = false }) => {
  const banks = banksForCountry(country);
  const selectedBanks = (values.customerBanks || []).filter((bank) => banks.includes(bank));

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography variant="subtitle2" color="primary">Customer</Typography>
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField fullWidth size="small" label="Customer age" type="number" disabled={disabled} value={values.customerAge} onChange={(event) => onChange("customerAge", event.target.value)} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField fullWidth size="small" label="Amount lost" type="number" disabled={disabled} value={values.amountLost} onChange={(event) => onChange("amountLost", event.target.value)} />
      </Grid>
      <Grid item xs={12}>
        <TextField fullWidth size="small" label="When was amount lost" disabled={disabled} value={values.amountLostWhen} onChange={(event) => onChange("amountLostWhen", event.target.value)} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <YesNoField label="Registered to the platform" disabled={disabled} value={values.registeredToPlatform} onChange={(value) => onChange("registeredToPlatform", value)} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <YesNoField label="Active trading platform" disabled={disabled} value={values.activeTradingPlatform} onChange={(value) => onChange("activeTradingPlatform", value)} />
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth size="small" disabled={disabled}>
          <InputLabel>Banks the customer owns</InputLabel>
          <Select
            multiple
            label="Banks the customer owns"
            value={selectedBanks}
            onChange={(event) => onChange("customerBanks", event.target.value)}
            renderValue={(selected) => selected.join(", ")}
          >
            {banks.map((bank) => (
              <MenuItem key={bank} value={bank}>{bank}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" color="text.secondary">
          Banks follow the lead country. Belgium, Germany, Netherlands, Switzerland, Austria, Portugal, Sweden, and Denmark each have five banks plus Other.
        </Typography>
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField fullWidth size="small" label="Additional phone number" disabled={disabled} value={values.additionalPhone} onChange={(event) => onChange("additionalPhone", event.target.value)} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <YesNoField
          label="Screen sharing"
          disabled={disabled}
          value={values.screenSharing}
          onChange={(value) => {
            onChange("screenSharing", value);
            if (value !== "yes") onChange("screenSharingId", "");
          }}
        />
      </Grid>
      {values.screenSharing === "yes" && (
        <Grid item xs={12} sm={6}>
          <TextField fullWidth size="small" label="Screen sharing ID" type="number" disabled={disabled} value={values.screenSharingId} onChange={(event) => onChange("screenSharingId", event.target.value)} />
        </Grid>
      )}
      <Grid item xs={12} sm={6}>
        <TextField fullWidth size="small" label="Customer potential" type="number" disabled={disabled} value={values.customerPotential} onChange={(event) => onChange("customerPotential", event.target.value)} />
      </Grid>
    </Grid>
  );
};

const Detail = ({ label, value }) => (
  <Grid item xs={12} sm={6}>
    <Typography variant="subtitle2" color="text.secondary">{label}</Typography>
    <Typography variant="body1" sx={{ wordBreak: "break-word" }}>{value || "Not set"}</Typography>
  </Grid>
);

export const CustomerFieldsFilters = ({ filters, onChange }) => (
  <>
    <Grid item xs={12}>
      <Typography variant="subtitle2" color="primary">Customer filters</Typography>
      <Typography variant="caption" color="text.secondary">These filters only search the leads you can already see.</Typography>
    </Grid>
    <Grid item xs={12} sm={6} md={3}>
      <TextField fullWidth size="small" label="Customer age" type="number" value={filters.customerAge || ""} onChange={(event) => onChange("customerAge", event.target.value)} />
    </Grid>
    <Grid item xs={12} sm={6} md={3}>
      <TextField fullWidth size="small" label="Amount lost" type="number" value={filters.amountLost || ""} onChange={(event) => onChange("amountLost", event.target.value)} />
    </Grid>
    <Grid item xs={12} sm={6} md={3}>
      <TextField fullWidth size="small" label="When amount lost" value={filters.amountLostWhen || ""} onChange={(event) => onChange("amountLostWhen", event.target.value)} />
    </Grid>
    <Grid item xs={12} sm={6} md={3}>
      <TextField fullWidth size="small" label="Customer potential" type="number" value={filters.customerPotential || ""} onChange={(event) => onChange("customerPotential", event.target.value)} />
    </Grid>
    <Grid item xs={12} sm={6} md={3}>
      <FormControl fullWidth size="small">
        <InputLabel>Registered</InputLabel>
        <Select label="Registered" value={filters.registeredToPlatform || ""} onChange={(event) => onChange("registeredToPlatform", event.target.value)}>
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="yes">Yes</MenuItem>
          <MenuItem value="no">No</MenuItem>
        </Select>
      </FormControl>
    </Grid>
    <Grid item xs={12} sm={6} md={3}>
      <FormControl fullWidth size="small">
        <InputLabel>Active platform</InputLabel>
        <Select label="Active platform" value={filters.activeTradingPlatform || ""} onChange={(event) => onChange("activeTradingPlatform", event.target.value)}>
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="yes">Yes</MenuItem>
          <MenuItem value="no">No</MenuItem>
        </Select>
      </FormControl>
    </Grid>
    <Grid item xs={12} sm={6} md={3}>
      <FormControl fullWidth size="small">
        <InputLabel>Screen sharing</InputLabel>
        <Select label="Screen sharing" value={filters.screenSharing || ""} onChange={(event) => onChange("screenSharing", event.target.value)}>
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="yes">Yes</MenuItem>
          <MenuItem value="no">No</MenuItem>
        </Select>
      </FormControl>
    </Grid>
    <Grid item xs={12} sm={6} md={3}>
      <TextField fullWidth size="small" label="Screen sharing ID" value={filters.screenSharingId || ""} onChange={(event) => onChange("screenSharingId", event.target.value)} />
    </Grid>
    <Grid item xs={12} sm={6} md={3}>
      <TextField fullWidth size="small" label="Additional phone" value={filters.additionalPhone || ""} onChange={(event) => onChange("additionalPhone", event.target.value)} />
    </Grid>
    <Grid item xs={12} sm={6} md={3}>
      <TextField fullWidth size="small" label="Bank" value={filters.customerBank || ""} onChange={(event) => onChange("customerBank", event.target.value)} placeholder="Bank name" />
    </Grid>
  </>
);

export const CustomerFieldsView = ({ lead }) => (
  <Grid container spacing={2}>
    <Grid item xs={12}>
      <Typography variant="subtitle2" color="primary">Customer</Typography>
    </Grid>
    <Detail label="Customer age" value={lead.customerAge ?? ""} />
    <Detail label="Amount lost" value={lead.amountLost ?? ""} />
    <Detail label="When was amount lost" value={lead.amountLostWhen} />
    <Detail label="Registered to the platform" value={yesNoLabel(lead.registeredToPlatform)} />
    <Detail label="Active trading platform" value={yesNoLabel(lead.activeTradingPlatform)} />
    <Detail label="Banks" value={(lead.customerBanks || []).join(", ")} />
    <Detail label="Additional phone number" value={lead.additionalPhone} />
    <Detail label="Screen sharing" value={yesNoLabel(lead.screenSharing)} />
    {lead.screenSharing === "yes" && <Detail label="Screen sharing ID" value={lead.screenSharingId} />}
    <Detail label="Customer potential" value={lead.customerPotential ?? ""} />
  </Grid>
);
