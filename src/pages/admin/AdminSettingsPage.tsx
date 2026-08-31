import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertCircle,
  Archive,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  Download,
  FileArchive,
  FileClock,
  FileDown,
  FileText,
  Fingerprint,
  Flag,
  Globe,
  History,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Moon,
  Network,
  Palette,
  PauseCircle,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserCheck,
  Users,
  Wallet,
  Webhook,
  X,
  Zap,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Badge,
} from "@/components/ui/badge";

import {
  Separator,
} from "@/components/ui/separator";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  cn,
} from "@/lib/utils";


// ============================================================
// TYPES
// ============================================================

type SettingsSection =
  | "overview"
  | "collection-balance"
  | "payout-balance"
  | "balance-history"
  | "fees"
  | "transaction-limits"
  | "flutterwave"
  | "provider-health"
  | "webhooks"
  | "service-controls"
  | "maintenance"
  | "reconciliation"
  | "notifications"
  | "admin-authentication"
  | "session-policy"
  | "sensitive-actions"
  | "fraud-controls"
  | "kyc-policies"
  | "compliance"
  | "general"
  | "customer-experience"
  | "feature-flags"
  | "retention"
  | "backups"
  | "exports"
  | "audit-history";

interface NavigationItem {
  id: SettingsSection;
  label: string;
  description?: string;
  icon: React.ElementType;
}

interface NavigationGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  items: NavigationItem[];
}

interface BalanceData {
  currency: string;
  availableBalance: number | null;
  ledgerBalance: number | null;
  source: string | null;
  configured?: boolean;
  accountReference?: string | null;
}

interface BalanceResponse {
  success: boolean;
  status?: string;
  synchronizedAt?: string;
  collection: BalanceData | null;
  payout: BalanceData | null;
  errors?: {
    collection?: string | null;
    payout?: string | null;
  };
}

interface HistoryTransaction {
  type?: string;
  amount?: number | string;
  currency?: string;
  balance_before?: number | string;
  balance_after?: number | string;
  reference?: string;
  date?: string;
  created_at?: string;
  date_created?: string;
  remarks?: string;
  narration?: string;
  status?: string;
  id?: string | number;
  [key: string]: unknown;
}

interface HistoryPageInfo {
  total?: number;
  current_page?: number;
  total_pages?: number;
}

interface HistoryResponse {
  success: boolean;
  currency: string;
  from: string;
  to: string;
  collection: {
    pageInfo: HistoryPageInfo | null;
    transactions: HistoryTransaction[];
  } | null;
  payout: {
    pageInfo: HistoryPageInfo | null;
    transactions: HistoryTransaction[];
    configured?: boolean;
  } | null;
}

interface HealthResponse {
  success: boolean;
  provider: string;
  environment: string;
  collection: {
    available: boolean;
    error: string | null;
  };
  payout: {
    configured: boolean;
    available: boolean;
    error: string | null;
  };
  checkedAt: string;
}

interface SettingToggle {
  enabled: boolean;
  label: string;
  description: string;
}

interface SettingsState {
  maintenanceMode: boolean;
  allowNewRegistrations: boolean;
  allowTransfers: boolean;
  allowWalletFunding: boolean;
  allowBillPayments: boolean;
  allowVirtualAccounts: boolean;
  requireAdminMfa: boolean;
  notifyAdminLogin: boolean;
  notifyLargeTransfer: boolean;
  notifyFailedTransfer: boolean;
  notifyProviderFailure: boolean;
  notifyWebhookFailure: boolean;
  fraudVelocityChecks: boolean;
  blockSuspiciousTransactions: boolean;
  requireKycForTransfers: boolean;
  requireBvnForHighValue: boolean;
  customerEmailNotifications: boolean;
  customerPushNotifications: boolean;
  showMaintenanceBanner: boolean;
  enableFeatureFlags: boolean;
  automaticReconciliation: boolean;
  automaticBackups: boolean;
}

interface AuditItem {
  id: string;
  action: string;
  description: string;
  createdAt: string;
}


interface AdminSettingRow {
  id: string;
  setting_key: string;
  section: string;
  data_type: string;
  value: unknown;
  description: string | null;
  requires_restart: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminSettingsHistoryRow {
  id: string;
  setting_id: string;
  setting_key: string;
  section: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string | null;
  changed_at: string;
  change_type: string;
  metadata: Record<string, unknown> | null;
}

type PersistedSettingKey =
  | keyof SettingsState
  | "maintenanceReason"
  | "defaultTransferFee"
  | "electronicTransferFee"
  | "walletTransferFee"
  | "level1Limit"
  | "level2Limit"
  | "level3Limit"
  | "retentionDays"
  | "sessionTimeout"
  | "maxAdminSessions"
  | "webhookAlertThreshold"
  | "dailyExportLimit";

const PERSISTED_SETTING_KEYS: PersistedSettingKey[] = [
  "maintenanceMode",
  "allowNewRegistrations",
  "allowTransfers",
  "allowWalletFunding",
  "allowBillPayments",
  "allowVirtualAccounts",
  "requireAdminMfa",
  "notifyAdminLogin",
  "notifyLargeTransfer",
  "notifyFailedTransfer",
  "notifyProviderFailure",
  "notifyWebhookFailure",
  "fraudVelocityChecks",
  "blockSuspiciousTransactions",
  "requireKycForTransfers",
  "requireBvnForHighValue",
  "customerEmailNotifications",
  "customerPushNotifications",
  "showMaintenanceBanner",
  "enableFeatureFlags",
  "automaticReconciliation",
  "automaticBackups",
  "maintenanceReason",
  "defaultTransferFee",
  "electronicTransferFee",
  "walletTransferFee",
  "level1Limit",
  "level2Limit",
  "level3Limit",
  "retentionDays",
  "sessionTimeout",
  "maxAdminSessions",
  "webhookAlertThreshold",
  "dailyExportLimit",
];

const SETTING_DESCRIPTIONS: Record<string, string> = {
  maintenanceMode: "Enable platform maintenance mode.",
  allowNewRegistrations: "Allow new customer registrations.",
  allowTransfers: "Allow customer bank and wallet transfers.",
  allowWalletFunding: "Allow customers to fund wallets.",
  allowBillPayments: "Allow customer bill and service payments.",
  allowVirtualAccounts: "Allow permanent virtual accounts.",
  requireAdminMfa: "Require multi-factor authentication for administrators.",
  notifyAdminLogin: "Notify administrators about administrator logins.",
  notifyLargeTransfer: "Notify administrators about high-value transfers.",
  notifyFailedTransfer: "Notify administrators about failed transfers.",
  notifyProviderFailure: "Notify administrators about provider failures.",
  notifyWebhookFailure: "Notify administrators about webhook failures.",
  fraudVelocityChecks: "Enable transaction velocity checks.",
  blockSuspiciousTransactions: "Block transactions matching configured fraud rules.",
  requireKycForTransfers: "Require KYC before customer transfers.",
  requireBvnForHighValue: "Require BVN verification for high-value transfers.",
  customerEmailNotifications: "Enable supported customer email notifications.",
  customerPushNotifications: "Enable supported customer push notifications.",
  showMaintenanceBanner: "Show a maintenance banner to customers.",
  enableFeatureFlags: "Enable centrally managed feature flags.",
  automaticReconciliation: "Enable automatic reconciliation processing.",
  automaticBackups: "Enable the configured automatic backup policy.",
  maintenanceReason: "Customer-facing maintenance message.",
  defaultTransferFee: "Standard IyanjuPay transfer fee in NGN.",
  electronicTransferFee: "Electronic transfer fee in NGN.",
  walletTransferFee: "Wallet transfer fee in NGN.",
  level1Limit: "KYC Level 1 daily transfer limit in NGN.",
  level2Limit: "KYC Level 2 daily transfer limit in NGN.",
  level3Limit: "KYC Level 3 daily transfer limit in NGN.",
  retentionDays: "Administrative data retention period in days.",
  sessionTimeout: "Administrator session timeout in minutes.",
  maxAdminSessions: "Maximum concurrent administrator sessions.",
  webhookAlertThreshold: "Webhook failure alert threshold.",
  dailyExportLimit: "Maximum administrative exports per day.",
};

function normalizeSettingValue(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "value" in value
  ) {
    return (value as { value: unknown }).value;
  }
  return value;
}

function settingValueAsBoolean(
  value: unknown,
  fallback: boolean
): boolean {
  const normalized = normalizeSettingValue(value);

  if (typeof normalized === "boolean") {
    return normalized;
  }

  if (typeof normalized === "string") {
    if (normalized.toLowerCase() === "true") return true;
    if (normalized.toLowerCase() === "false") return false;
  }

  return fallback;
}

function settingValueAsString(
  value: unknown,
  fallback: string
): string {
  const normalized = normalizeSettingValue(value);

  if (
    normalized === null ||
    normalized === undefined
  ) {
    return fallback;
  }

  if (
    typeof normalized === "string" ||
    typeof normalized === "number" ||
    typeof normalized === "boolean"
  ) {
    return String(normalized);
  }

  return fallback;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function camelToSnake(value: string): string {
  return value
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase();
}

function settingStorageKey(
  key: PersistedSettingKey,
  existingKeys: Record<string, string>
): string {
  return (
    existingKeys[key] ??
    camelToSnake(key)
  );
}

function getFriendlyAdminError(
  error: unknown,
  fallback: string
): string {
  const message =
    error instanceof Error
      ? error.message
      : "";

  const normalized = message.toLowerCase();

  if (
    normalized.includes("jwt") ||
    normalized.includes("token") ||
    normalized.includes("session") ||
    normalized.includes("authentication")
  ) {
    return "Your administrator session has expired. Please sign in again.";
  }

  if (
    normalized.includes("permission") ||
    normalized.includes("forbidden") ||
    normalized.includes("not authorized") ||
    normalized.includes("unauthorized")
  ) {
    return "You are not authorized to perform this administrator action.";
  }

  if (
    normalized.includes("network") ||
    normalized.includes("fetch") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("offline")
  ) {
    return "The service is temporarily unavailable. Please check your connection and try again.";
  }

  return fallback;
}


// ============================================================
// CONSTANTS
// ============================================================

const EDGE_FUNCTION_NAME =
  "admin-flutterwave-balance";

const CURRENCY = "NGN";

const navigationGroups: NavigationGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      {
        id: "overview",
        label: "Overview",
        description: "Platform settings summary",
        icon: LayoutDashboard,
      },
    ],
  },

  {
    id: "financial",
    label: "Financial",
    icon: Wallet,
    items: [
      {
        id: "collection-balance",
        label: "Collection Balance",
        description: "Flutterwave merchant collection balance",
        icon: ArrowDownLeft,
      },
      {
        id: "payout-balance",
        label: "Payout Balance",
        description: "Flutterwave payout balance",
        icon: Wallet,
      },
      {
        id: "balance-history",
        label: "Balance History",
        description: "Flutterwave balance movements",
        icon: History,
      },
      {
        id: "fees",
        label: "Fees",
        description: "Platform transaction fees",
        icon: FileText,
      },
      {
        id: "transaction-limits",
        label: "Transaction Limits",
        description: "Customer transaction limits",
        icon: SlidersHorizontal,
      },
    ],
  },

  {
    id: "providers",
    label: "Providers",
    icon: Network,
    items: [
      {
        id: "flutterwave",
        label: "Flutterwave",
        description: "Flutterwave provider configuration",
        icon: Zap,
      },
      {
        id: "provider-health",
        label: "Provider Health",
        description: "Provider connectivity and status",
        icon: Activity,
      },
      {
        id: "webhooks",
        label: "Webhooks",
        description: "Provider webhook monitoring",
        icon: Webhook,
      },
    ],
  },

  {
    id: "operations",
    label: "Operations",
    icon: Settings,
    items: [
      {
        id: "service-controls",
        label: "Service Controls",
        description: "Enable or disable platform services",
        icon: SlidersHorizontal,
      },
      {
        id: "maintenance",
        label: "Maintenance Mode",
        description: "Platform maintenance controls",
        icon: PauseCircle,
      },
      {
        id: "reconciliation",
        label: "Reconciliation",
        description: "Transaction reconciliation controls",
        icon: FileClock,
      },
    ],
  },

  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    items: [
      {
        id: "notifications",
        label: "Notifications",
        description: "Admin and customer notifications",
        icon: Bell,
      },
    ],
  },

  {
    id: "security",
    label: "Security",
    icon: Shield,
    items: [
      {
        id: "admin-authentication",
        label: "Admin Authentication",
        description: "Administrator authentication policy",
        icon: UserCheck,
      },
      {
        id: "session-policy",
        label: "Session Policy",
        description: "Admin session controls",
        icon: Smartphone,
      },
      {
        id: "sensitive-actions",
        label: "Sensitive Actions",
        description: "Protection for high-risk actions",
        icon: Lock,
      },
    ],
  },

  {
    id: "risk",
    label: "Risk & Compliance",
    icon: ShieldCheck,
    items: [
      {
        id: "fraud-controls",
        label: "Fraud Controls",
        description: "Fraud prevention controls",
        icon: Fingerprint,
      },
      {
        id: "kyc-policies",
        label: "KYC Policies",
        description: "Identity verification requirements",
        icon: UserCheck,
      },
      {
        id: "compliance",
        label: "Compliance",
        description: "Compliance configuration",
        icon: ShieldCheck,
      },
    ],
  },

  {
    id: "platform",
    label: "Platform",
    icon: Globe,
    items: [
      {
        id: "general",
        label: "General",
        description: "General platform configuration",
        icon: Settings,
      },
      {
        id: "customer-experience",
        label: "Customer Experience",
        description: "Customer-facing behavior",
        icon: Users,
      },
      {
        id: "feature-flags",
        label: "Feature Flags",
        description: "Platform feature availability",
        icon: Flag,
      },
    ],
  },

  {
    id: "data",
    label: "Data",
    icon: Database,
    items: [
      {
        id: "retention",
        label: "Retention",
        description: "Data retention policies",
        icon: Archive,
      },
      {
        id: "backups",
        label: "Backups",
        description: "Database backup configuration",
        icon: Database,
      },
      {
        id: "exports",
        label: "Exports",
        description: "Data export tools",
        icon: FileDown,
      },
    ],
  },

  {
    id: "audit",
    label: "Audit",
    icon: History,
    items: [
      {
        id: "audit-history",
        label: "Settings Change History",
        description: "Settings modification audit trail",
        icon: History,
      },
    ],
  },
];


// ============================================================
// HELPERS
// ============================================================

function formatCurrency(
  amount: number | string | null | undefined,
  currency = CURRENCY
): string {
  if (
    amount === null ||
    amount === undefined ||
    amount === ""
  ) {
    return "—";
  }

  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(
  amount: number | string | null | undefined
): string {
  if (
    amount === null ||
    amount === undefined ||
    amount === ""
  ) {
    return "—";
  }

  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-NG").format(value);
}

function formatDate(
  value: string | null | undefined
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDateOnly(
  value: Date
): string {
  return value
    .toISOString()
    .slice(0, 10);
}

function getDefaultFromDate(): string {
  const date = new Date();

  date.setDate(
    date.getDate() - 30
  );

  return formatDateOnly(date);
}

function getToday(): string {
  return formatDateOnly(
    new Date()
  );
}

function getSectionTitle(
  section: SettingsSection
): string {
  for (
    const group of navigationGroups
  ) {
    const item =
      group.items.find(
        (entry) =>
          entry.id === section
      );

    if (item) {
      return item.label;
    }
  }

  return "Settings";
}

function getSectionDescription(
  section: SettingsSection
): string {
  for (
    const group of navigationGroups
  ) {
    const item =
      group.items.find(
        (entry) =>
          entry.id === section
      );

    if (item) {
      return (
        item.description ??
        ""
      );
    }
  }

  return "";
}

function flattenNavigation(): NavigationItem[] {
  return navigationGroups.flatMap(
    (group) => group.items
  );
}

function getInitialSettings(): SettingsState {
  return {
    maintenanceMode: false,
    allowNewRegistrations: true,
    allowTransfers: true,
    allowWalletFunding: true,
    allowBillPayments: true,
    allowVirtualAccounts: true,
    requireAdminMfa: true,
    notifyAdminLogin: true,
    notifyLargeTransfer: true,
    notifyFailedTransfer: true,
    notifyProviderFailure: true,
    notifyWebhookFailure: true,
    fraudVelocityChecks: true,
    blockSuspiciousTransactions: true,
    requireKycForTransfers: true,
    requireBvnForHighValue: true,
    customerEmailNotifications: true,
    customerPushNotifications: true,
    showMaintenanceBanner: true,
    enableFeatureFlags: true,
    automaticReconciliation: true,
    automaticBackups: true,
  };
}


// ============================================================
// SMALL UI COMPONENTS
// ============================================================

function SettingRow({
  label,
  description,
  enabled,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {label}
        </p>

        <p className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      </div>

      <Switch
        checked={enabled}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status:
    | "healthy"
    | "warning"
    | "offline"
    | "active"
    | "inactive";
}) {
  const config = {
    healthy: {
      label: "Healthy",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    warning: {
      label: "Warning",
      className:
        "border-amber-200 bg-amber-50 text-amber-700",
    },
    offline: {
      label: "Offline",
      className:
        "border-red-200 bg-red-50 text-red-700",
    },
    active: {
      label: "Active",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    inactive: {
      label: "Inactive",
      className:
        "border-slate-200 bg-slate-50 text-slate-600",
    },
  };

  const item =
    config[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        item.className
      )}
    >
      {item.label}
    </Badge>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
      <div className="mb-4 rounded-full bg-muted p-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>

      <h3 className="text-base font-semibold">
        {title}
      </h3>

      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}


// ============================================================
// MAIN COMPONENT
// ============================================================

function AdminSettingsPage() {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("overview");

  const [mobileNavigationOpen, setMobileNavigationOpen] =
    useState(false);

  const [expandedGroups, setExpandedGroups] =
    useState<Record<string, boolean>>(
      Object.fromEntries(
        navigationGroups.map(
          (group) => [
            group.id,
            true,
          ]
        )
      )
    );

  const [settings, setSettings] =
    useState<SettingsState>(
      getInitialSettings()
    );

  const [collectionBalance, setCollectionBalance] =
    useState<BalanceData | null>(null);

  const [payoutBalance, setPayoutBalance] =
    useState<BalanceData | null>(null);

  const [balanceLoading, setBalanceLoading] =
    useState(false);

  const [balanceError, setBalanceError] =
    useState<string | null>(null);

  const [lastBalanceSync, setLastBalanceSync] =
    useState<string | null>(null);

  const [historyLoading, setHistoryLoading] =
    useState(false);

  const [historyError, setHistoryError] =
    useState<string | null>(null);

  const [history, setHistory] =
    useState<HistoryResponse | null>(null);

  const [historyType, setHistoryType] =
    useState<
      "all" | "collection" | "payout"
    >("all");

  const [historyFrom, setHistoryFrom] =
    useState(getDefaultFromDate());

  const [historyTo, setHistoryTo] =
    useState(getToday());

  const [historyPage, setHistoryPage] =
    useState(1);

  const [providerHealth, setProviderHealth] =
    useState<HealthResponse | null>(null);

  const [healthLoading, setHealthLoading] =
    useState(false);

  const [healthError, setHealthError] =
    useState<string | null>(null);

  const [saving, setSaving] =
    useState(false);

  const [saveMessage, setSaveMessage] =
    useState<string | null>(null);

  const [search, setSearch] =
    useState("");

  const [auditItems, setAuditItems] =
    useState<AuditItem[]>([]);


  const [settingsLoading, setSettingsLoading] =
    useState(false);

  const [settingsError, setSettingsError] =
    useState<string | null>(null);

  const [settingsLoaded, setSettingsLoaded] =
    useState(false);

  const [savedSettingsSnapshot, setSavedSettingsSnapshot] =
    useState<Record<string, unknown>>({});

  const [settingsHistoryLoading, setSettingsHistoryLoading] =
    useState(false);

  const [settingKeyMap, setSettingKeyMap] =
    useState<Record<string, string>>({});

  const [maintenanceReason, setMaintenanceReason] =
    useState("");

  const [defaultTransferFee, setDefaultTransferFee] =
    useState("10");

  const [electronicTransferFee, setElectronicTransferFee] =
    useState("50");

  const [walletTransferFee, setWalletTransferFee] =
    useState("50");

  const [level1Limit, setLevel1Limit] =
    useState("300000");

  const [level2Limit, setLevel2Limit] =
    useState("1000000");

  const [level3Limit, setLevel3Limit] =
    useState("5000000");

  const [retentionDays, setRetentionDays] =
    useState("365");

  const [sessionTimeout, setSessionTimeout] =
    useState("30");

  const [maxAdminSessions, setMaxAdminSessions] =
    useState("3");

  const [webhookAlertThreshold, setWebhookAlertThreshold] =
    useState("5");

  const [dailyExportLimit, setDailyExportLimit] =
    useState("10");


  // ==========================================================
  // NAVIGATION
  // ==========================================================

  const toggleGroup = useCallback(
    (groupId: string) => {
      setExpandedGroups(
        (current) => ({
          ...current,
          [groupId]:
            !current[groupId],
        })
      );
    },
    []
  );

  const navigateTo = useCallback(
    (section: SettingsSection) => {
      setActiveSection(section);
      setMobileNavigationOpen(false);

      window.history.replaceState(
        null,
        "",
        `/admin/settings?section=${section}`
      );
    },
    []
  );


  // ==========================================================
  // INITIAL URL SECTION
  // ==========================================================

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const requested =
      params.get(
        "section"
      ) as SettingsSection | null;

    if (
      requested &&
      flattenNavigation().some(
        (item) =>
          item.id === requested
      )
    ) {
      setActiveSection(requested);
    }
  }, []);


  // ==========================================================
  // PERSISTENT ADMIN SETTINGS
  // ==========================================================

  const currentPersistedValues =
    useMemo<Record<string, unknown>>(
      () => ({
        maintenanceMode: settings.maintenanceMode,
        allowNewRegistrations:
          settings.allowNewRegistrations,
        allowTransfers:
          settings.allowTransfers,
        allowWalletFunding:
          settings.allowWalletFunding,
        allowBillPayments:
          settings.allowBillPayments,
        allowVirtualAccounts:
          settings.allowVirtualAccounts,
        requireAdminMfa:
          settings.requireAdminMfa,
        notifyAdminLogin:
          settings.notifyAdminLogin,
        notifyLargeTransfer:
          settings.notifyLargeTransfer,
        notifyFailedTransfer:
          settings.notifyFailedTransfer,
        notifyProviderFailure:
          settings.notifyProviderFailure,
        notifyWebhookFailure:
          settings.notifyWebhookFailure,
        fraudVelocityChecks:
          settings.fraudVelocityChecks,
        blockSuspiciousTransactions:
          settings.blockSuspiciousTransactions,
        requireKycForTransfers:
          settings.requireKycForTransfers,
        requireBvnForHighValue:
          settings.requireBvnForHighValue,
        customerEmailNotifications:
          settings.customerEmailNotifications,
        customerPushNotifications:
          settings.customerPushNotifications,
        showMaintenanceBanner:
          settings.showMaintenanceBanner,
        enableFeatureFlags:
          settings.enableFeatureFlags,
        automaticReconciliation:
          settings.automaticReconciliation,
        automaticBackups:
          settings.automaticBackups,
        maintenanceReason,
        defaultTransferFee,
        electronicTransferFee,
        walletTransferFee,
        level1Limit,
        level2Limit,
        level3Limit,
        retentionDays,
        sessionTimeout,
        maxAdminSessions,
        webhookAlertThreshold,
        dailyExportLimit,
      }),
      [
        settings,
        maintenanceReason,
        defaultTransferFee,
        electronicTransferFee,
        walletTransferFee,
        level1Limit,
        level2Limit,
        level3Limit,
        retentionDays,
        sessionTimeout,
        maxAdminSessions,
        webhookAlertThreshold,
        dailyExportLimit,
      ]
    );

  const settingsDirty =
    settingsLoaded &&
    !valuesEqual(
      currentPersistedValues,
      savedSettingsSnapshot
    );

  const loadSettings =
    useCallback(async () => {
      setSettingsLoading(true);
      setSettingsError(null);

      try {
        const {
          data: sessionData,
          error: sessionError,
        } = await supabase.auth.getSession();

        if (
          sessionError ||
          !sessionData.session
        ) {
          throw new Error(
            "Your administrator session has expired."
          );
        }

        const {
          data,
          error,
        } = await supabase.rpc(
          "admin_settings_list",
          {
            p_section: null,
            p_search: null,
          }
        );

        if (error) {
          throw error;
        }

        const rows =
          (data ?? []) as AdminSettingRow[];

        const initial =
          getInitialSettings();

        const nextSettings: SettingsState = {
          ...initial,
        };

        const nextScalars = {
          maintenanceReason: "",
          defaultTransferFee: "10",
          electronicTransferFee: "50",
          walletTransferFee: "50",
          level1Limit: "300000",
          level2Limit: "1000000",
          level3Limit: "5000000",
          retentionDays: "365",
          sessionTimeout: "30",
          maxAdminSessions: "3",
          webhookAlertThreshold: "5",
          dailyExportLimit: "10",
        };

        const nextKeyMap: Record<string, string> = {};

        for (const row of rows) {
          const normalizedKey =
            PERSISTED_SETTING_KEYS.find(
              (key) =>
                key === row.setting_key ||
                camelToSnake(key) ===
                  row.setting_key
            );

          if (!normalizedKey) {
            continue;
          }

          nextKeyMap[normalizedKey] =
            row.setting_key;

          if (
            normalizedKey in
            nextSettings
          ) {
            const current =
              nextSettings[
                normalizedKey as keyof SettingsState
              ];

            (
              nextSettings as Record<
                string,
                unknown
              >
            )[normalizedKey] =
              typeof current === "boolean"
                ? settingValueAsBoolean(
                    row.value,
                    current
                  )
                : row.value;
          } else if (
            normalizedKey in
            nextScalars
          ) {
            (
              nextScalars as Record<
                string,
                string
              >
            )[normalizedKey] =
              settingValueAsString(
                row.value,
                (
                  nextScalars as Record<
                    string,
                    string
                  >
                )[normalizedKey]
              );
          }
        }

        setSettings(nextSettings);
        setMaintenanceReason(
          nextScalars.maintenanceReason
        );
        setDefaultTransferFee(
          nextScalars.defaultTransferFee
        );
        setElectronicTransferFee(
          nextScalars.electronicTransferFee
        );
        setWalletTransferFee(
          nextScalars.walletTransferFee
        );
        setLevel1Limit(
          nextScalars.level1Limit
        );
        setLevel2Limit(
          nextScalars.level2Limit
        );
        setLevel3Limit(
          nextScalars.level3Limit
        );
        setRetentionDays(
          nextScalars.retentionDays
        );
        setSessionTimeout(
          nextScalars.sessionTimeout
        );
        setMaxAdminSessions(
          nextScalars.maxAdminSessions
        );
        setWebhookAlertThreshold(
          nextScalars.webhookAlertThreshold
        );
        setDailyExportLimit(
          nextScalars.dailyExportLimit
        );
        setSettingKeyMap(nextKeyMap);

        const snapshot = {
          ...nextSettings,
          ...nextScalars,
        };

        setSavedSettingsSnapshot(
          snapshot
        );
        setSettingsLoaded(true);
      } catch (error) {
        setSettingsLoaded(false);
        setSettingsError(
          getFriendlyAdminError(
            error,
            "Unable to load administrator settings."
          )
        );
      } finally {
        setSettingsLoading(false);
      }
    }, []);

  const loadSettingsHistory =
    useCallback(async () => {
      setSettingsHistoryLoading(true);

      try {
        const {
          data,
          error,
        } = await supabase.rpc(
          "admin_settings_history",
          {
            p_key: null,
            p_limit: 100,
            p_offset: 0,
          }
        );

        if (error) {
          throw error;
        }

        const rows =
          (data ??
            []) as AdminSettingsHistoryRow[];

        setAuditItems(
          rows.map((row) => ({
            id: row.id,
            action:
              row.setting_key,
            description:
              row.change_type ===
              "create"
                ? "Setting created."
                : row.change_type ===
                    "delete"
                  ? "Setting deleted."
                  : "Setting value updated.",
            createdAt:
              row.changed_at,
          }))
        );
      } catch (error) {
        setSettingsError(
          getFriendlyAdminError(
            error,
            "Unable to load settings change history."
          )
        );
      } finally {
        setSettingsHistoryLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (
      activeSection ===
      "audit-history"
    ) {
      void loadSettingsHistory();
    }
  }, [
    activeSection,
    loadSettingsHistory,
  ]);

  // ==========================================================
  // FLUTTERWAVE REQUEST
  // ==========================================================

  const callFlutterwaveFunction =
    useCallback(
      async <T,>(
        action: string,
        params: Record<
          string,
          string | number | undefined
        > = {}
      ): Promise<T> => {
        const {
          data: sessionData,
          error: sessionError,
        } =
          await supabase.auth.getSession();

        if (
          sessionError ||
          !sessionData.session
        ) {
          throw new Error(
            "Your administrator session has expired. Please sign in again."
          );
        }

        const functionUrl =
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}`;

        const url =
          new URL(functionUrl);

        url.searchParams.set(
          "action",
          action
        );

        Object.entries(
          params
        ).forEach(
          ([key, value]) => {
            if (
              value !== undefined &&
              value !== null &&
              String(value).length > 0
            ) {
              url.searchParams.set(
                key,
                String(value)
              );
            }
          }
        );

        const response =
          await fetch(
            url.toString(),
            {
              method: "GET",
              headers: {
                Authorization:
                  `Bearer ${sessionData.session.access_token}`,
                apikey:
                  import.meta.env.VITE_SUPABASE_ANON_KEY,
                Accept:
                  "application/json",
              },
            }
          );

        const text =
          await response.text();

        let payload: any;

        try {
          payload =
            text
              ? JSON.parse(text)
              : null;
        } catch {
          payload = {
            success: false,
            error: text,
          };
        }

        if (!response.ok) {
          throw new Error(
            payload?.error ||
              payload?.message ||
              `Request failed with HTTP ${response.status}.`
          );
        }

        if (
          payload &&
          payload.success === false
        ) {
          throw new Error(
            payload.error ||
              payload.message ||
              "Flutterwave request failed."
          );
        }

        return payload as T;
      },
      []
    );


  // ==========================================================
  // LOAD BALANCES
  // ==========================================================

  const loadBalances =
    useCallback(
      async (
        showLoading = true
      ) => {
        if (showLoading) {
          setBalanceLoading(true);
        }

        setBalanceError(null);

        try {
          const result =
            await callFlutterwaveFunction<BalanceResponse>(
              "balances"
            );

          setCollectionBalance(
            result.collection
          );

          setPayoutBalance(
            result.payout
          );

          setLastBalanceSync(
            result.synchronizedAt ??
              new Date().toISOString()
          );

          const errors =
            [
              result.errors?.collection,
              result.errors?.payout,
            ].filter(Boolean);

          if (errors.length > 0) {
            setBalanceError(
              "One or more Flutterwave balances could not be synchronized."
            );
          }
        } catch (error) {
          setBalanceError(
            getFriendlyAdminError(
              error,
              "Unable to load Flutterwave balances."
            )
          );
        } finally {
          if (showLoading) {
            setBalanceLoading(false);
          }
        }
      },
      [callFlutterwaveFunction]
    );


  // ==========================================================
  // SYNC BALANCES
  // ==========================================================

  const syncBalances =
    useCallback(
      async () => {
        setBalanceLoading(true);
        setBalanceError(null);

        try {
          const result =
            await callFlutterwaveFunction<BalanceResponse>(
              "sync"
            );

          setCollectionBalance(
            result.collection
          );

          setPayoutBalance(
            result.payout
          );

          setLastBalanceSync(
            result.synchronizedAt ??
              new Date().toISOString()
          );

          const errors =
            [
              result.errors?.collection,
              result.errors?.payout,
            ].filter(Boolean);

          if (errors.length > 0) {
            setBalanceError(
              "One or more Flutterwave balances could not be synchronized."
            );
          }
        } catch (error) {
          setBalanceError(
            getFriendlyAdminError(
              error,
              "Unable to synchronize Flutterwave balances."
            )
          );
        } finally {
          setBalanceLoading(false);
        }
      },
      [callFlutterwaveFunction]
    );


  // ==========================================================
  // LOAD HISTORY
  // ==========================================================

  const loadHistory =
    useCallback(
      async () => {
        setHistoryLoading(true);
        setHistoryError(null);

        try {
          const result =
            await callFlutterwaveFunction<HistoryResponse>(
              "history",
              {
                type:
                  historyType,
                from:
                  historyFrom,
                to:
                  historyTo,
                page:
                  historyPage,
              }
            );

          setHistory(result);
        } catch (error) {
          setHistoryError(
            getFriendlyAdminError(
              error,
              "Unable to load Flutterwave balance history."
            )
          );
        } finally {
          setHistoryLoading(false);
        }
      },
      [
        callFlutterwaveFunction,
        historyType,
        historyFrom,
        historyTo,
        historyPage,
      ]
    );


  // ==========================================================
  // PROVIDER HEALTH
  // ==========================================================

  const checkProviderHealth =
    useCallback(
      async () => {
        setHealthLoading(true);
        setHealthError(null);

        try {
          const result =
            await callFlutterwaveFunction<HealthResponse>(
              "health"
            );

          setProviderHealth(
            result
          );
        } catch (error) {
          setHealthError(
            getFriendlyAdminError(
              error,
              "Unable to check provider health."
            )
          );
        } finally {
          setHealthLoading(false);
        }
      },
      [callFlutterwaveFunction]
    );


  // ==========================================================
  // LOAD INITIAL FINANCIAL DATA
  // ==========================================================

  useEffect(() => {
    void loadBalances();
    void checkProviderHealth();
  }, [
    loadBalances,
    checkProviderHealth,
  ]);


  // ==========================================================
  // LOAD HISTORY WHEN OPENED
  // ==========================================================

  useEffect(() => {
    if (
      activeSection ===
      "balance-history"
    ) {
      void loadHistory();
    }
  }, [
    activeSection,
    loadHistory,
  ]);


  // ==========================================================
  // UPDATE SETTING
  // ==========================================================

  const updateSetting =
    useCallback(
      (
        key: keyof SettingsState,
        value: boolean
      ) => {
        setSettings(
          (current) => ({
            ...current,
            [key]: value,
          })
        );

        setSaveMessage(null);
      },
      []
    );


  // ==========================================================
  // SAVE SETTINGS
  // ==========================================================

  const saveSettings =
    useCallback(
      async () => {
        if (!settingsLoaded) {
          setSaveMessage(null);
          setSettingsError(
            "Administrator settings are still loading. Please try again."
          );
          return;
        }

        if (!settingsDirty) {
          setSaveMessage(
            "There are no unsaved settings changes."
          );
          return;
        }

        setSaving(true);
        setSaveMessage(null);
        setSettingsError(null);

        try {
          const entries =
            PERSISTED_SETTING_KEYS
              .filter(
                (key) =>
                  !valuesEqual(
                    currentPersistedValues[key],
                    savedSettingsSnapshot[key]
                  )
              )
              .map((key) => ({
                key,
                value:
                  currentPersistedValues[
                    key
                  ],
              }));

          for (const entry of entries) {
            const storageKey =
              settingStorageKey(
                entry.key,
                settingKeyMap
              );

            const {
              error,
            } = await supabase.rpc(
              "admin_settings_upsert",
              {
                p_key: storageKey,
                p_value:
                  entry.value,
                p_description:
                  SETTING_DESCRIPTIONS[
                    entry.key
                  ] ?? null,
              }
            );

            if (error) {
              throw error;
            }
          }

          setSaveMessage(
            "Settings were saved successfully."
          );

          await loadSettings();
          await loadSettingsHistory();
        } catch (error) {
          setSettingsError(
            getFriendlyAdminError(
              error,
              "Unable to save administrator settings. No successful save should be assumed."
            )
          );
        } finally {
          setSaving(false);
        }
      },
      [
        settingsLoaded,
        settingsDirty,
        currentPersistedValues,
        settingKeyMap,
        loadSettings,
        loadSettingsHistory,
      ]
    );

  // ==========================================================
  // SEARCH NAVIGATION
  // ==========================================================

  const filteredGroups =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      if (!term) {
        return navigationGroups;
      }

      return navigationGroups
        .map((group) => ({
          ...group,
          items:
            group.items.filter(
              (item) =>
                item.label
                  .toLowerCase()
                  .includes(term) ||
                item.description
                  ?.toLowerCase()
                  .includes(term) ||
                group.label
                  .toLowerCase()
                  .includes(term)
            ),
        }))
        .filter(
          (group) =>
            group.items.length > 0
        );
    }, [search]);


  // ==========================================================
  // SUMMARY VALUES
  // ==========================================================

  const totalFlutterwaveAvailable =
    (
      collectionBalance?.availableBalance ??
      0
    ) +
    (
      payoutBalance?.availableBalance ??
      0
    );

  const collectionAvailable =
    collectionBalance?.availableBalance ??
    0;

  const payoutAvailable =
    payoutBalance?.availableBalance ??
    0;


  // ==========================================================
  // NAVIGATION SIDEBAR
  // ==========================================================

  const renderNavigation =
    (
      mobile = false
    ) => (
      <div
        className={cn(
          "flex h-full flex-col",
          mobile
            ? "bg-background"
            : ""
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Settings className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              Admin Settings
            </p>

            <p className="truncate text-xs text-muted-foreground">
              IyanjuPay
            </p>
          </div>

          {mobile && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              onClick={() =>
                setMobileNavigationOpen(
                  false
                )
              }
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search settings..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-4">
            {filteredGroups.map(
              (group) => {
                const Icon =
                  group.icon;

                const expanded =
                  expandedGroups[
                    group.id
                  ] ?? true;

                return (
                  <div
                    key={
                      group.id
                    }
                  >
                    <button
                      type="button"
                      className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted"
                      onClick={() =>
                        toggleGroup(
                          group.id
                        )
                      }
                    >
                      <Icon className="h-3.5 w-3.5" />

                      <span className="flex-1">
                        {group.label}
                      </span>

                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          !expanded &&
                            "-rotate-90"
                        )}
                      />
                    </button>

                    {expanded && (
                      <div className="space-y-0.5">
                        {group.items.map(
                          (
                            item
                          ) => {
                            const ItemIcon =
                              item.icon;

                            const active =
                              activeSection ===
                              item.id;

                            return (
                              <button
                                key={
                                  item.id
                                }
                                type="button"
                                onClick={() =>
                                  navigateTo(
                                    item.id
                                  )
                                }
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                                  active
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                              >
                                <ItemIcon className="h-4 w-4 shrink-0" />

                                <span className="min-w-0 flex-1 truncate">
                                  {
                                    item.label
                                  }
                                </span>

                                {active && (
                                  <ChevronRight className="h-4 w-4 shrink-0" />
                                )}
                              </button>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        </div>

        <div className="border-t p-3">
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />

              <span className="text-xs font-medium">
                Administrator Area
              </span>
            </div>

            <p className="mt-1 text-[11px] text-muted-foreground">
              Protected settings and operational controls.
            </p>
          </div>
        </div>
      </div>
    );


  // ==========================================================
  // PAGE HEADER
  // ==========================================================

  const renderHeader =
    () => (
      <div className="border-b bg-background">
        <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() =>
              setMobileNavigationOpen(
                true
              )
            }
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Settings className="hidden h-5 w-5 text-muted-foreground sm:block" />

              <h1 className="truncate text-lg font-semibold">
                {getSectionTitle(
                  activeSection
                )}
              </h1>
            </div>

            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {getSectionDescription(
                activeSection
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {settingsDirty && (
              <Badge
                variant="outline"
                className="hidden border-amber-200 bg-amber-50 text-amber-700 md:inline-flex"
              >
                Unsaved changes
              </Badge>
            )}

            {settingsDirty && (
              <Button
                size="sm"
                onClick={() =>
                  void saveSettings()
                }
                disabled={
                  saving ||
                  settingsLoading
                }
              >
                <Save className="mr-2 h-4 w-4" />
                {saving
                  ? "Saving..."
                  : "Save Changes"}
              </Button>
            )}

            {lastBalanceSync && (
              <span className="hidden text-xs text-muted-foreground xl:block">
                Synced{" "}
                {formatDate(
                  lastBalanceSync
                )}
              </span>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void loadBalances()
              }
              disabled={
                balanceLoading
              }
            >
              <RefreshCw
                className={cn(
                  "mr-2 h-4 w-4",
                  balanceLoading &&
                    "animate-spin"
                )}
              />

              Refresh
            </Button>
          </div>
        </div>
      </div>
    );


  // ==========================================================
  // OVERVIEW
  // ==========================================================

  const renderOverview =
    () => (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">
            Settings Overview
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Centralized control center for the IyanjuPay fintech platform.
          </p>
        </div>

        {balanceError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />

            <AlertTitle>
              Flutterwave balance warning
            </AlertTitle>

            <AlertDescription>
              {balanceError}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>
                Collection Balance
              </CardDescription>

              <CardTitle className="text-2xl">
                {balanceLoading
                  ? "Loading..."
                  : formatCurrency(
                      collectionAvailable
                    )}
              </CardTitle>
            </CardHeader>

            <CardContent>
              <button
                type="button"
                onClick={() =>
                  navigateTo(
                    "collection-balance"
                  )
                }
                className="text-xs font-medium text-primary hover:underline"
              >
                View collection balance
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>
                Payout Balance
              </CardDescription>

              <CardTitle className="text-2xl">
                {balanceLoading
                  ? "Loading..."
                  : payoutBalance
                      ?.availableBalance ===
                    null
                    ? "Unavailable"
                    : formatCurrency(
                        payoutAvailable
                      )}
              </CardTitle>
            </CardHeader>

            <CardContent>
              <button
                type="button"
                onClick={() =>
                  navigateTo(
                    "payout-balance"
                  )
                }
                className="text-xs font-medium text-primary hover:underline"
              >
                View payout balance
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>
                Combined Available
              </CardDescription>

              <CardTitle className="text-2xl">
                {formatCurrency(
                  totalFlutterwaveAvailable
                )}
              </CardTitle>
            </CardHeader>

            <CardContent>
              <span className="text-xs text-muted-foreground">
                Collection + payout accounts
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>
                Flutterwave
              </CardDescription>

              <CardTitle className="flex items-center gap-2 text-xl">
                {providerHealth?.success ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    Healthy
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    Check status
                  </>
                )}
              </CardTitle>
            </CardHeader>

            <CardContent>
              <button
                type="button"
                onClick={() =>
                  navigateTo(
                    "provider-health"
                  )
                }
                className="text-xs font-medium text-primary hover:underline"
              >
                Provider health
              </button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                Platform Operations
              </CardTitle>

              <CardDescription>
                Current operational controls.
              </CardDescription>
            </CardHeader>

            <CardContent className="divide-y">
              <SettingRow
                label="Transfers"
                description="Allow customers to initiate transfers."
                enabled={
                  settings.allowTransfers
                }
                onChange={(value) =>
                  updateSetting(
                    "allowTransfers",
                    value
                  )
                }
              />

              <SettingRow
                label="Wallet Funding"
                description="Allow customers to fund wallets."
                enabled={
                  settings.allowWalletFunding
                }
                onChange={(value) =>
                  updateSetting(
                    "allowWalletFunding",
                    value
                  )
                }
              />

              <SettingRow
                label="Bill Payments"
                description="Allow customers to purchase services."
                enabled={
                  settings.allowBillPayments
                }
                onChange={(value) =>
                  updateSetting(
                    "allowBillPayments",
                    value
                  )
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Security
              </CardTitle>

              <CardDescription>
                Administrator security posture.
              </CardDescription>
            </CardHeader>

            <CardContent className="divide-y">
              <SettingRow
                label="Administrator MFA"
                description="Require stronger authentication for administrators."
                enabled={
                  settings.requireAdminMfa
                }
                onChange={(value) =>
                  updateSetting(
                    "requireAdminMfa",
                    value
                  )
                }
              />

              <SettingRow
                label="Sensitive Action Protection"
                description="Require additional protection for high-risk operations."
                enabled={
                  true
                }
                onChange={() => undefined}
                disabled
              />

              <SettingRow
                label="Fraud Velocity Checks"
                description="Monitor transaction velocity for suspicious activity."
                enabled={
                  settings.fraudVelocityChecks
                }
                onChange={(value) =>
                  updateSetting(
                    "fraudVelocityChecks",
                    value
                  )
                }
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              Quick Navigation
            </CardTitle>

            <CardDescription>
              Jump directly to an administrative settings area.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  section:
                    "balance-history" as SettingsSection,
                  icon: History,
                  label:
                    "Balance History",
                },
                {
                  section:
                    "provider-health" as SettingsSection,
                  icon: Activity,
                  label:
                    "Provider Health",
                },
                {
                  section:
                    "service-controls" as SettingsSection,
                  icon: SlidersHorizontal,
                  label:
                    "Service Controls",
                },
                {
                  section:
                    "audit-history" as SettingsSection,
                  icon: History,
                  label:
                    "Audit History",
                },
              ].map(
                (item) => {
                  const Icon =
                    item.icon;

                  return (
                    <button
                      key={
                        item.section
                      }
                      type="button"
                      onClick={() =>
                        navigateTo(
                          item.section
                        )
                      }
                      className="flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted"
                    >
                      <Icon className="h-5 w-5 text-muted-foreground" />

                      <span className="text-sm font-medium">
                        {
                          item.label
                        }
                      </span>

                      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                    </button>
                  );
                }
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // COLLECTION BALANCE
  // ==========================================================

  const renderCollectionBalance =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>
                Collection Balance
              </CardTitle>

              <CardDescription>
                Live collection balance from the Flutterwave merchant account.
              </CardDescription>
            </div>

            <Button
              onClick={() =>
                void syncBalances()
              }
              disabled={
                balanceLoading
              }
            >
              <RefreshCw
                className={cn(
                  "mr-2 h-4 w-4",
                  balanceLoading &&
                    "animate-spin"
                )}
              />

              Synchronize
            </Button>
          </CardHeader>

          <CardContent>
            {balanceError && (
              <Alert
                variant="destructive"
                className="mb-6"
              >
                <AlertCircle className="h-4 w-4" />

                <AlertTitle>
                  Unable to fully synchronize
                </AlertTitle>

                <AlertDescription>
                  {balanceError}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="bg-muted/30">
                <CardHeader>
                  <CardDescription>
                    Available Balance
                  </CardDescription>

                  <CardTitle className="text-3xl">
                    {balanceLoading
                      ? "Loading..."
                      : formatCurrency(
                          collectionBalance?.availableBalance
                        )}
                  </CardTitle>
                </CardHeader>
              </Card>

              <Card className="bg-muted/30">
                <CardHeader>
                  <CardDescription>
                    Ledger Balance
                  </CardDescription>

                  <CardTitle className="text-3xl">
                    {balanceLoading
                      ? "Loading..."
                      : formatCurrency(
                          collectionBalance?.ledgerBalance
                        )}
                  </CardTitle>
                </CardHeader>
              </Card>

              <Card className="bg-muted/30">
                <CardHeader>
                  <CardDescription>
                    Currency
                  </CardDescription>

                  <CardTitle className="text-3xl">
                    {collectionBalance?.currency ??
                      CURRENCY}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Collection Account
            </CardTitle>

            <CardDescription>
              Source information for this balance.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border-b py-3">
              <span className="text-sm text-muted-foreground">
                Provider
              </span>

              <span className="text-sm font-medium">
                Flutterwave
              </span>
            </div>

            <div className="flex items-center justify-between border-b py-3">
              <span className="text-sm text-muted-foreground">
                Account Type
              </span>

              <span className="text-sm font-medium">
                Merchant Collection Wallet
              </span>
            </div>

            <div className="flex items-center justify-between border-b py-3">
              <span className="text-sm text-muted-foreground">
                Currency
              </span>

              <span className="text-sm font-medium">
                {collectionBalance?.currency ??
                  CURRENCY}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">
                Last Synchronization
              </span>

              <span className="text-sm font-medium">
                {formatDate(
                  lastBalanceSync
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        <Alert>
          <Wallet className="h-4 w-4" />

          <AlertTitle>
            Flutterwave source
          </AlertTitle>

          <AlertDescription>
            This balance is retrieved directly from the Flutterwave merchant wallet. It is not calculated from the IyanjuPay internal ledger.
          </AlertDescription>
        </Alert>
      </div>
    );


  // ==========================================================
  // PAYOUT BALANCE
  // ==========================================================

  const renderPayoutBalance =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>
                Payout Balance
              </CardTitle>

              <CardDescription>
                Dedicated Flutterwave payout account balance.
              </CardDescription>
            </div>

            <Button
              onClick={() =>
                void syncBalances()
              }
              disabled={
                balanceLoading
              }
            >
              <RefreshCw
                className={cn(
                  "mr-2 h-4 w-4",
                  balanceLoading &&
                    "animate-spin"
                )}
              />

              Synchronize
            </Button>
          </CardHeader>

          <CardContent>
            {payoutBalance?.configured ===
              false && (
              <Alert className="mb-6">
                <AlertCircle className="h-4 w-4" />

                <AlertTitle>
                  Payout account not configured
                </AlertTitle>

                <AlertDescription>
                  The dedicated Flutterwave payout account has not been configured for this environment. The collection balance is intentionally not used as a payout balance.
                </AlertDescription>
              </Alert>
            )}

            {balanceError && (
              <Alert
                variant="destructive"
                className="mb-6"
              >
                <AlertCircle className="h-4 w-4" />

                <AlertTitle>
                  Payout balance warning
                </AlertTitle>

                <AlertDescription>
                  {balanceError}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="bg-muted/30">
                <CardHeader>
                  <CardDescription>
                    Available Balance
                  </CardDescription>

                  <CardTitle className="text-3xl">
                    {balanceLoading
                      ? "Loading..."
                      : payoutBalance?.availableBalance ===
                        null
                        ? "Unavailable"
                        : formatCurrency(
                            payoutBalance?.availableBalance
                          )}
                  </CardTitle>
                </CardHeader>
              </Card>

              <Card className="bg-muted/30">
                <CardHeader>
                  <CardDescription>
                    Ledger Balance
                  </CardDescription>

                  <CardTitle className="text-3xl">
                    {balanceLoading
                      ? "Loading..."
                      : payoutBalance?.ledgerBalance ===
                        null
                        ? "Unavailable"
                        : formatCurrency(
                            payoutBalance?.ledgerBalance
                          )}
                  </CardTitle>
                </CardHeader>
              </Card>

              <Card className="bg-muted/30">
                <CardHeader>
                  <CardDescription>
                    Currency
                  </CardDescription>

                  <CardTitle className="text-3xl">
                    {payoutBalance?.currency ??
                      CURRENCY}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Payout Account
            </CardTitle>

            <CardDescription>
              Dedicated payout account information.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border-b py-3">
              <span className="text-sm text-muted-foreground">
                Provider
              </span>

              <span className="text-sm font-medium">
                Flutterwave
              </span>
            </div>

            <div className="flex items-center justify-between border-b py-3">
              <span className="text-sm text-muted-foreground">
                Account Type
              </span>

              <span className="text-sm font-medium">
                Dedicated Payout Account
              </span>
            </div>

            <div className="flex items-center justify-between border-b py-3">
              <span className="text-sm text-muted-foreground">
                Reference
              </span>

              <span className="max-w-[60%] truncate text-sm font-medium">
                {payoutBalance?.accountReference ??
                  "Not configured"}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">
                Source
              </span>

              <span className="text-sm font-medium">
                Flutterwave Payout Subaccount
              </span>
            </div>
          </CardContent>
        </Card>

        <Alert>
          <ShieldCheck className="h-4 w-4" />

          <AlertTitle>
            Separate financial account
          </AlertTitle>

          <AlertDescription>
            IyanjuPay treats the payout balance as a separate Flutterwave balance. A missing payout configuration never falls back to the collection wallet.
          </AlertDescription>
        </Alert>
      </div>
    );


  // ==========================================================
  // BALANCE HISTORY
  // ==========================================================

  const renderBalanceHistory =
    () => {
      const collectionTransactions =
        history?.collection
          ?.transactions ??
        [];

      const payoutTransactions =
        history?.payout
          ?.transactions ??
        [];

      const rows =
        historyType ===
        "collection"
          ? collectionTransactions.map(
              (item) => ({
                ...item,
                accountType:
                  "Collection",
              })
            )
          : historyType ===
              "payout"
            ? payoutTransactions.map(
                (item) => ({
                  ...item,
                  accountType:
                    "Payout",
                })
              )
            : [
                ...collectionTransactions.map(
                  (item) => ({
                    ...item,
                    accountType:
                      "Collection",
                  })
                ),
                ...payoutTransactions.map(
                  (item) => ({
                    ...item,
                    accountType:
                      "Payout",
                  })
                ),
              ].sort(
                (
                  a,
                  b
                ) => {
                  const aDate =
                    new Date(
                      String(
                        a.date ??
                          a.created_at ??
                          a.date_created ??
                          ""
                      )
                    ).getTime();

                  const bDate =
                    new Date(
                      String(
                        b.date ??
                          b.created_at ??
                          b.date_created ??
                          ""
                      )
                    ).getTime();

                  return (
                    bDate -
                    aDate
                  );
                }
              );

      return (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>
                    Balance History
                  </CardTitle>

                  <CardDescription>
                    Balance movements retrieved directly from Flutterwave.
                  </CardDescription>
                </div>

                <Button
                  variant="outline"
                  onClick={() =>
                    void loadHistory()
                  }
                  disabled={
                    historyLoading
                  }
                >
                  <RefreshCw
                    className={cn(
                      "mr-2 h-4 w-4",
                      historyLoading &&
                        "animate-spin"
                    )}
                  />

                  Refresh History
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label>
                    Account
                  </Label>

                  <Select
                    value={
                      historyType
                    }
                    onValueChange={(
                      value
                    ) => {
                      setHistoryType(
                        value as
                          | "all"
                          | "collection"
                          | "payout"
                      );

                      setHistoryPage(
                        1
                      );
                    }}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="all">
                        All Accounts
                      </SelectItem>

                      <SelectItem value="collection">
                        Collection
                      </SelectItem>

                      <SelectItem value="payout">
                        Payout
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>
                    From
                  </Label>

                  <Input
                    type="date"
                    value={
                      historyFrom
                    }
                    onChange={(
                      event
                    ) => {
                      setHistoryFrom(
                        event.target.value
                      );

                      setHistoryPage(
                        1
                      );
                    }}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>
                    To
                  </Label>

                  <Input
                    type="date"
                    value={
                      historyTo
                    }
                    onChange={(
                      event
                    ) => {
                      setHistoryTo(
                        event.target.value
                      );

                      setHistoryPage(
                        1
                      );
                    }}
                    className="mt-2"
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={() =>
                      void loadHistory()
                    }
                    disabled={
                      historyLoading
                    }
                  >
                    <Search className="mr-2 h-4 w-4" />

                    Search
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {historyError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />

              <AlertTitle>
                History unavailable
              </AlertTitle>

              <AlertDescription>
                {historyError}
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>
                Transactions
              </CardTitle>

              <CardDescription>
                {history
                  ? `${formatNumber(
                      rows.length
                    )} transactions loaded`
                  : "Run a search to load balance movements."}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              {historyLoading ? (
                <div className="flex min-h-[260px] items-center justify-center">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    Loading Flutterwave history...
                  </div>
                </div>
              ) : rows.length ===
                0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={History}
                    title="No balance movements"
                    description="No Flutterwave balance transactions were returned for the selected account and date range."
                  />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            Account
                          </TableHead>

                          <TableHead>
                            Date
                          </TableHead>

                          <TableHead>
                            Type
                          </TableHead>

                          <TableHead>
                            Reference
                          </TableHead>

                          <TableHead className="text-right">
                            Amount
                          </TableHead>

                          <TableHead className="text-right">
                            Balance Before
                          </TableHead>

                          <TableHead className="text-right">
                            Balance After
                          </TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {rows.map(
                          (
                            transaction,
                            index
                          ) => {
                            const amount =
                              Number(
                                transaction.amount ??
                                  0
                              );

                            const before =
                              Number(
                                transaction.balance_before ??
                                  0
                              );

                            const after =
                              Number(
                                transaction.balance_after ??
                                  0
                              );

                            const transactionDate =
                              transaction.date ??
                              transaction.created_at ??
                              transaction.date_created;

                            return (
                              <TableRow
                                key={`${String(
                                  transaction.id ??
                                    transaction.reference ??
                                    index
                                )}-${index}`}
                              >
                                <TableCell>
                                  <Badge variant="outline">
                                    {
                                      transaction.accountType
                                    }
                                  </Badge>
                                </TableCell>

                                <TableCell className="whitespace-nowrap text-sm">
                                  {formatDate(
                                    transactionDate
                                  )}
                                </TableCell>

                                <TableCell>
                                  <span className="capitalize">
                                    {transaction.type ??
                                      "—"}
                                  </span>
                                </TableCell>

                                <TableCell className="max-w-[180px] truncate font-mono text-xs">
                                  {transaction.reference ??
                                    "—"}
                                </TableCell>

                                <TableCell
                                  className={cn(
                                    "text-right font-medium",
                                    amount >=
                                      0
                                      ? "text-emerald-600"
                                      : "text-red-600"
                                  )}
                                >
                                  {formatCurrency(
                                    amount,
                                    transaction.currency ??
                                      CURRENCY
                                  )}
                                </TableCell>

                                <TableCell className="text-right">
                                  {formatCurrency(
                                    before,
                                    transaction.currency ??
                                      CURRENCY
                                  )}
                                </TableCell>

                                <TableCell className="text-right font-medium">
                                  {formatCurrency(
                                    after,
                                    transaction.currency ??
                                      CURRENCY
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          }
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between border-t p-4">
                    <span className="text-sm text-muted-foreground">
                      Page{" "}
                      {
                        historyPage
                      }
                    </span>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          historyPage <=
                            1 ||
                          historyLoading
                        }
                        onClick={() => {
                          setHistoryPage(
                            (
                              current
                            ) =>
                              Math.max(
                                current -
                                  1,
                                1
                              )
                          );
                        }}
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Previous
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          historyLoading ||
                          (
                            history?.collection
                              ?.pageInfo
                              ?.total_pages ??
                            history?.payout
                              ?.pageInfo
                              ?.total_pages ??
                            historyPage
                          ) <=
                            historyPage
                        }
                        onClick={() =>
                          setHistoryPage(
                            (
                              current
                            ) =>
                              current +
                              1
                          )
                        }
                      >
                        Next
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      );
    };


  // ==========================================================
  // FEES
  // ==========================================================

  const renderFees =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Transaction Fees
            </CardTitle>

            <CardDescription>
              Configure the platform-side transaction fee policy.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <Label>
                  Standard Transfer Fee
                </Label>

                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₦
                  </span>

                  <Input
                    value={
                      defaultTransferFee
                    }
                    onChange={(event) =>
                      setDefaultTransferFee(
                        event.target.value
                      )
                    }
                    className="pl-8"
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div>
                <Label>
                  Electronic Transfer Fee
                </Label>

                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₦
                  </span>

                  <Input
                    value={
                      electronicTransferFee
                    }
                    onChange={(event) =>
                      setElectronicTransferFee(
                        event.target.value
                      )
                    }
                    className="pl-8"
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div>
                <Label>
                  Wallet Transfer Fee
                </Label>

                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₦
                  </span>

                  <Input
                    value={
                      walletTransferFee
                    }
                    onChange={(event) =>
                      setWalletTransferFee(
                        event.target.value
                      )
                    }
                    className="pl-8"
                    inputMode="decimal"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <Alert>
              <FileText className="h-4 w-4" />

              <AlertTitle>
                Fee policy
              </AlertTitle>

              <AlertDescription>
                Fee configuration should be persisted through the secured admin settings backend before affecting production transactions.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button
                onClick={() =>
                  void saveSettings()
                }
                disabled={saving}
              >
                <Save className="mr-2 h-4 w-4" />

                Save Fee Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // TRANSACTION LIMITS
  // ==========================================================

  const renderTransactionLimits =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Transaction Limits
            </CardTitle>

            <CardDescription>
              Administrative view of the platform KYC transfer limits.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <Label>
                  Level 1 Daily Limit
                </Label>

                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₦
                  </span>

                  <Input
                    value={
                      level1Limit
                    }
                    onChange={(event) =>
                      setLevel1Limit(
                        event.target.value
                      )
                    }
                    className="pl-8"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div>
                <Label>
                  Level 2 Daily Limit
                </Label>

                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₦
                  </span>

                  <Input
                    value={
                      level2Limit
                    }
                    onChange={(event) =>
                      setLevel2Limit(
                        event.target.value
                      )
                    }
                    className="pl-8"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div>
                <Label>
                  Level 3 Daily Limit
                </Label>

                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₦
                  </span>

                  <Input
                    value={
                      level3Limit
                    }
                    onChange={(event) =>
                      setLevel3Limit(
                        event.target.value
                      )
                    }
                    className="pl-8"
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>

            <Separator className="my-6" />

            <div className="divide-y">
              <SettingRow
                label="Require KYC for transfers"
                description="Customers must satisfy the configured KYC requirements before transferring funds."
                enabled={
                  settings.requireKycForTransfers
                }
                onChange={(value) =>
                  updateSetting(
                    "requireKycForTransfers",
                    value
                  )
                }
              />

              <SettingRow
                label="Require BVN for high-value transactions"
                description="Apply additional identity requirements to higher-value transactions."
                enabled={
                  settings.requireBvnForHighValue
                }
                onChange={(value) =>
                  updateSetting(
                    "requireBvnForHighValue",
                    value
                  )
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // FLUTTERWAVE
  // ==========================================================

  const renderFlutterwave =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Flutterwave
            </CardTitle>

            <CardDescription>
              Provider configuration and financial integration status.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Zap className="h-5 w-5" />
                </div>

                <div>
                  <p className="font-medium">
                    Flutterwave Provider
                  </p>

                  <p className="text-sm text-muted-foreground">
                    Primary payment and transfer provider
                  </p>
                </div>
              </div>

              <StatusBadge
                status={
                  providerHealth?.success
                    ? "healthy"
                    : "warning"
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">
                  Collection Balance
                </p>

                <p className="mt-2 text-2xl font-semibold">
                  {formatCurrency(
                    collectionAvailable
                  )}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Flutterwave merchant wallet
                </p>
              </div>

              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">
                  Payout Balance
                </p>

                <p className="mt-2 text-2xl font-semibold">
                  {payoutBalance?.availableBalance ===
                  null
                    ? "Unavailable"
                    : formatCurrency(
                        payoutAvailable
                      )}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Dedicated payout account
                </p>
              </div>
            </div>

            <Alert>
              <Lock className="h-4 w-4" />

              <AlertTitle>
                Credentials are server-side
              </AlertTitle>

              <AlertDescription>
                Flutterwave secret credentials must remain in Supabase Edge Function secrets. They are never displayed or stored in this frontend page.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() =>
                  void checkProviderHealth()
                }
                disabled={
                  healthLoading
                }
              >
                <Activity
                  className={cn(
                    "mr-2 h-4 w-4",
                    healthLoading &&
                      "animate-pulse"
                  )}
                />

                Check Provider
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // PROVIDER HEALTH
  // ==========================================================

  const renderProviderHealth =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>
                Provider Health
              </CardTitle>

              <CardDescription>
                Real-time connectivity check against Flutterwave.
              </CardDescription>
            </div>

            <Button
              onClick={() =>
                void checkProviderHealth()
              }
              disabled={
                healthLoading
              }
            >
              <RefreshCw
                className={cn(
                  "mr-2 h-4 w-4",
                  healthLoading &&
                    "animate-spin"
                )}
              />

              Run Health Check
            </Button>
          </CardHeader>

          <CardContent>
            {healthError && (
              <Alert
                variant="destructive"
                className="mb-6"
              >
                <AlertCircle className="h-4 w-4" />

                <AlertTitle>
                  Health check failed
                </AlertTitle>

                <AlertDescription>
                  {healthError}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardDescription>
                    Provider
                  </CardDescription>

                  <CardTitle>
                    Flutterwave
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <StatusBadge
                    status={
                      providerHealth?.success
                        ? "healthy"
                        : "warning"
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardDescription>
                    Collection
                  </CardDescription>

                  <CardTitle>
                    {providerHealth
                      ?.collection
                      .available
                      ? "Available"
                      : "Unavailable"}
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <StatusBadge
                    status={
                      providerHealth
                        ?.collection
                        .available
                        ? "healthy"
                        : "offline"
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardDescription>
                    Payout
                  </CardDescription>

                  <CardTitle>
                    {providerHealth
                      ?.payout
                      .configured
                      ? providerHealth.payout
                          .available
                        ? "Available"
                        : "Unavailable"
                      : "Not Configured"}
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <StatusBadge
                    status={
                      !providerHealth
                        ?.payout
                        .configured
                        ? "inactive"
                        : providerHealth
                            .payout
                            .available
                          ? "healthy"
                          : "offline"
                    }
                  />
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Health Details
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border-b py-3">
              <span className="text-sm text-muted-foreground">
                Environment
              </span>

              <Badge variant="outline">
                {providerHealth?.environment ??
                  "Unknown"}
              </Badge>
            </div>

            <div className="flex items-center justify-between border-b py-3">
              <span className="text-sm text-muted-foreground">
                Collection endpoint
              </span>

              <StatusBadge
                status={
                  providerHealth
                    ?.collection
                    .available
                    ? "healthy"
                    : "offline"
                }
              />
            </div>

            <div className="flex items-center justify-between border-b py-3">
              <span className="text-sm text-muted-foreground">
                Payout endpoint
              </span>

              <StatusBadge
                status={
                  !providerHealth
                    ?.payout
                    .configured
                    ? "inactive"
                    : providerHealth
                        ?.payout
                        .available
                      ? "healthy"
                      : "offline"
                }
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">
                Last checked
              </span>

              <span className="text-sm font-medium">
                {formatDate(
                  providerHealth?.checkedAt
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // WEBHOOKS
  // ==========================================================

  const renderWebhooks =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Webhooks
            </CardTitle>

            <CardDescription>
              Monitor provider webhook operations and failures.
            </CardDescription>
          </CardHeader>

          <CardContent className="divide-y">
            <SettingRow
              label="Webhook failure alerts"
              description="Notify administrators when provider webhook processing fails."
              enabled={
                settings.notifyWebhookFailure
              }
              onChange={(value) =>
                updateSetting(
                  "notifyWebhookFailure",
                  value
                )
              }
            />

            <div className="py-5">
              <Label>
                Alert threshold
              </Label>

              <p className="mb-2 mt-1 text-sm text-muted-foreground">
                Number of failures before an operational alert is triggered.
              </p>

              <Input
                value={
                  webhookAlertThreshold
                }
                onChange={(event) =>
                  setWebhookAlertThreshold(
                    event.target.value
                  )
                }
                className="max-w-xs"
                inputMode="numeric"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Webhook Security
            </CardTitle>

            <CardDescription>
              Provider webhook requests must be validated server-side.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Alert>
              <ShieldCheck className="h-4 w-4" />

              <AlertTitle>
                Signature verification
              </AlertTitle>

              <AlertDescription>
                Flutterwave webhook signatures should be verified inside the webhook Edge Function before processing events.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // SERVICE CONTROLS
  // ==========================================================

  const renderServiceControls =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Service Controls
            </CardTitle>

            <CardDescription>
              Control availability of customer-facing financial services.
            </CardDescription>
          </CardHeader>

          <CardContent className="divide-y">
            <SettingRow
              label="Customer registrations"
              description="Allow new customers to create accounts."
              enabled={
                settings.allowNewRegistrations
              }
              onChange={(value) =>
                updateSetting(
                  "allowNewRegistrations",
                  value
                )
              }
            />

            <SettingRow
              label="Wallet funding"
              description="Allow customers to fund their IyanjuPay wallet."
              enabled={
                settings.allowWalletFunding
              }
              onChange={(value) =>
                updateSetting(
                  "allowWalletFunding",
                  value
                )
              }
            />

            <SettingRow
              label="Bank transfers"
              description="Allow customers to initiate Flutterwave-powered transfers."
              enabled={
                settings.allowTransfers
              }
              onChange={(value) =>
                updateSetting(
                  "allowTransfers",
                  value
                )
              }
            />

            <SettingRow
              label="Wallet transfers"
              description="Allow customers to transfer funds internally."
              enabled={
                settings.allowTransfers
              }
              onChange={(value) =>
                updateSetting(
                  "allowTransfers",
                  value
                )
              }
            />

            <SettingRow
              label="Bill payments"
              description="Allow customers to purchase supported services."
              enabled={
                settings.allowBillPayments
              }
              onChange={(value) =>
                updateSetting(
                  "allowBillPayments",
                  value
                )
              }
            />

            <SettingRow
              label="Virtual accounts"
              description="Allow permanent Flutterwave virtual accounts to be created."
              enabled={
                settings.allowVirtualAccounts
              }
              onChange={(value) =>
                updateSetting(
                  "allowVirtualAccounts",
                  value
                )
              }
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={() =>
              void saveSettings()
            }
            disabled={saving}
          >
            <Save className="mr-2 h-4 w-4" />

            Save Service Controls
          </Button>
        </div>
      </div>
    );


  // ==========================================================
  // MAINTENANCE
  // ==========================================================

  const renderMaintenance =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Maintenance Mode
            </CardTitle>

            <CardDescription>
              Temporarily restrict platform operations during maintenance.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-xl border p-5">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-muted p-3">
                  <PauseCircle className="h-5 w-5" />
                </div>

                <div>
                  <p className="font-medium">
                    Platform Maintenance Mode
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Prevent customer transactions while maintenance is in progress.
                  </p>
                </div>
              </div>

              <Switch
                checked={
                  settings.maintenanceMode
                }
                onCheckedChange={(value) =>
                  updateSetting(
                    "maintenanceMode",
                    value
                  )
                }
              />
            </div>

            <div>
              <Label>
                Maintenance message
              </Label>

              <Input
                value={
                  maintenanceReason
                }
                onChange={(event) =>
                  setMaintenanceReason(
                    event.target.value
                  )
                }
                placeholder="Scheduled maintenance is currently in progress."
                className="mt-2"
              />
            </div>

            {settings.maintenanceMode && (
              <Alert>
                <AlertCircle className="h-4 w-4" />

                <AlertTitle>
                  Maintenance mode enabled
                </AlertTitle>

                <AlertDescription>
                  Customer-facing services should respect this state once it is persisted to the platform settings backend.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() =>
                  void saveSettings()
                }
                disabled={saving}
              >
                <Save className="mr-2 h-4 w-4" />

                Save Maintenance Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // RECONCILIATION
  // ==========================================================

  const renderReconciliation =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Reconciliation
            </CardTitle>

            <CardDescription>
              Configure operational reconciliation behavior.
            </CardDescription>
          </CardHeader>

          <CardContent className="divide-y">
            <SettingRow
              label="Automatic reconciliation"
              description="Automatically process provider and internal transaction matching."
              enabled={
                settings.automaticReconciliation
              }
              onChange={(value) =>
                updateSetting(
                  "automaticReconciliation",
                  value
                )
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Reconciliation workflow
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              {[
                "Provider transaction",
                "Internal transaction",
                "Amount comparison",
                "Matched / discrepancy",
              ].map(
                (
                  step,
                  index
                ) => (
                  <div
                    key={step}
                    className="rounded-xl border p-4"
                  >
                    <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                      {index +
                        1}
                    </div>

                    <p className="text-sm font-medium">
                      {step}
                    </p>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // NOTIFICATIONS
  // ==========================================================

  const renderNotifications =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Notification Controls
            </CardTitle>

            <CardDescription>
              Configure operational alerts and customer notifications.
            </CardDescription>
          </CardHeader>

          <CardContent className="divide-y">
            <SettingRow
              label="Administrator login alerts"
              description="Notify administrators when an administrator signs in."
              enabled={
                settings.notifyAdminLogin
              }
              onChange={(value) =>
                updateSetting(
                  "notifyAdminLogin",
                  value
                )
              }
            />

            <SettingRow
              label="Large transfer alerts"
              description="Notify administrators about high-value transactions."
              enabled={
                settings.notifyLargeTransfer
              }
              onChange={(value) =>
                updateSetting(
                  "notifyLargeTransfer",
                  value
                )
              }
            />

            <SettingRow
              label="Failed transfer alerts"
              description="Notify administrators when transfers fail."
              enabled={
                settings.notifyFailedTransfer
              }
              onChange={(value) =>
                updateSetting(
                  "notifyFailedTransfer",
                  value
                )
              }
            />

            <SettingRow
              label="Provider failure alerts"
              description="Notify administrators when Flutterwave operations fail."
              enabled={
                settings.notifyProviderFailure
              }
              onChange={(value) =>
                updateSetting(
                  "notifyProviderFailure",
                  value
                )
              }
            />

            <SettingRow
              label="Customer email notifications"
              description="Send supported transaction notifications by email."
              enabled={
                settings.customerEmailNotifications
              }
              onChange={(value) =>
                updateSetting(
                  "customerEmailNotifications",
                  value
                )
              }
            />

            <SettingRow
              label="Customer push notifications"
              description="Send supported transaction notifications through push."
              enabled={
                settings.customerPushNotifications
              }
              onChange={(value) =>
                updateSetting(
                  "customerPushNotifications",
                  value
                )
              }
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={() =>
              void saveSettings()
            }
            disabled={saving}
          >
            <Save className="mr-2 h-4 w-4" />

            Save Notification Settings
          </Button>
        </div>
      </div>
    );


  // ==========================================================
  // ADMIN AUTHENTICATION
  // ==========================================================

  const renderAdminAuthentication =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Admin Authentication
            </CardTitle>

            <CardDescription>
              Protect access to the administrative platform.
            </CardDescription>
          </CardHeader>

          <CardContent className="divide-y">
            <SettingRow
              label="Require administrator MFA"
              description="Require multi-factor authentication for administrator accounts."
              enabled={
                settings.requireAdminMfa
              }
              onChange={(value) =>
                updateSetting(
                  "requireAdminMfa",
                  value
                )
              }
            />

            <SettingRow
              label="Administrator login notifications"
              description="Record and notify on administrator login activity."
              enabled={
                settings.notifyAdminLogin
              }
              onChange={(value) =>
                updateSetting(
                  "notifyAdminLogin",
                  value
                )
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Authentication principles
            </CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border p-4">
              <KeyRound className="mb-3 h-5 w-5" />

              <p className="font-medium">
                Strong Authentication
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Administrators should use strong authentication methods.
              </p>
            </div>

            <div className="rounded-xl border p-4">
              <Lock className="mb-3 h-5 w-5" />

              <p className="font-medium">
                Least Privilege
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Administrative access should follow assigned roles.
              </p>
            </div>

            <div className="rounded-xl border p-4">
              <History className="mb-3 h-5 w-5" />

              <p className="font-medium">
                Auditability
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Sensitive administrative activity should be auditable.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // SESSION POLICY
  // ==========================================================

  const renderSessionPolicy =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Session Policy
            </CardTitle>

            <CardDescription>
              Configure administrator session behavior.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <Label>
                  Session timeout
                </Label>

                <div className="relative mt-2">
                  <Input
                    value={
                      sessionTimeout
                    }
                    onChange={(event) =>
                      setSessionTimeout(
                        event.target.value
                      )
                    }
                    inputMode="numeric"
                  />

                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    minutes
                  </span>
                </div>
              </div>

              <div>
                <Label>
                  Maximum concurrent sessions
                </Label>

                <Input
                  value={
                    maxAdminSessions
                  }
                  onChange={(event) =>
                    setMaxAdminSessions(
                      event.target.value
                    )
                  }
                  className="mt-2"
                  inputMode="numeric"
                />
              </div>
            </div>

            <Separator />

            <SettingRow
              label="Notify on new administrator login"
              description="Create an operational notification whenever an administrator signs in."
              enabled={
                settings.notifyAdminLogin
              }
              onChange={(value) =>
                updateSetting(
                  "notifyAdminLogin",
                  value
                )
              }
            />

            <div className="flex justify-end">
              <Button
                onClick={() =>
                  void saveSettings()
                }
                disabled={saving}
              >
                <Save className="mr-2 h-4 w-4" />

                Save Session Policy
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // SENSITIVE ACTIONS
  // ==========================================================

  const renderSensitiveActions =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Sensitive Actions
            </CardTitle>

            <CardDescription>
              High-risk administrative operations should require additional controls.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {[
              {
                title:
                  "Require confirmation for financial changes",
                description:
                  "Require explicit confirmation before modifying fees, limits, or financial settings.",
              },
              {
                title:
                  "Require elevated authentication",
                description:
                  "Require recent authentication for highly sensitive operations.",
              },
              {
                title:
                  "Audit sensitive operations",
                description:
                  "Record who performed sensitive administrative actions.",
              },
            ].map(
              (item) => (
                <div
                  key={
                    item.title
                  }
                  className="flex items-start justify-between gap-4 rounded-xl border p-4"
                >
                  <div>
                    <p className="font-medium">
                      {
                        item.title
                      }
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {
                        item.description
                      }
                    </p>
                  </div>

                  <Switch
                    checked={
                      true
                    }
                    disabled
                  />
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // FRAUD CONTROLS
  // ==========================================================

  const renderFraudControls =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Fraud Controls
            </CardTitle>

            <CardDescription>
              Controls for suspicious transaction activity.
            </CardDescription>
          </CardHeader>

          <CardContent className="divide-y">
            <SettingRow
              label="Velocity checks"
              description="Monitor rapid or unusually frequent transactions."
              enabled={
                settings.fraudVelocityChecks
              }
              onChange={(value) =>
                updateSetting(
                  "fraudVelocityChecks",
                  value
                )
              }
            />

            <SettingRow
              label="Block suspicious transactions"
              description="Temporarily block transactions that meet configured fraud rules."
              enabled={
                settings.blockSuspiciousTransactions
              }
              onChange={(value) =>
                updateSetting(
                  "blockSuspiciousTransactions",
                  value
                )
              }
            />
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // KYC POLICIES
  // ==========================================================

  const renderKycPolicies =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              KYC Policies
            </CardTitle>

            <CardDescription>
              Customer identity and transaction verification policies.
            </CardDescription>
          </CardHeader>

          <CardContent className="divide-y">
            <SettingRow
              label="Require KYC for transfers"
              description="Require customers to satisfy their KYC level before transferring funds."
              enabled={
                settings.requireKycForTransfers
              }
              onChange={(value) =>
                updateSetting(
                  "requireKycForTransfers",
                  value
                )
              }
            />

            <SettingRow
              label="Require BVN for high-value transfers"
              description="Apply additional BVN verification requirements to higher limits."
              enabled={
                settings.requireBvnForHighValue
              }
              onChange={(value) =>
                updateSetting(
                  "requireBvnForHighValue",
                  value
                )
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Current Transfer Tiers
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border p-5">
                <p className="text-sm font-medium">
                  Level 1
                </p>

                <p className="mt-2 text-2xl font-semibold">
                  {formatCurrency(
                    level1Limit
                  )}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Daily transfer limit
                </p>
              </div>

              <div className="rounded-xl border p-5">
                <p className="text-sm font-medium">
                  Level 2
                </p>

                <p className="mt-2 text-2xl font-semibold">
                  {formatCurrency(
                    level2Limit
                  )}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Daily transfer limit
                </p>
              </div>

              <div className="rounded-xl border p-5">
                <p className="text-sm font-medium">
                  Level 3
                </p>

                <p className="mt-2 text-2xl font-semibold">
                  {formatCurrency(
                    level3Limit
                  )}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Daily transfer limit
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // COMPLIANCE
  // ==========================================================

  const renderCompliance =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Compliance
            </CardTitle>

            <CardDescription>
              Central compliance controls for the platform.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {[
              "Customer identity verification",
              "Transaction monitoring",
              "Suspicious activity review",
              "Financial audit trail",
              "Provider reconciliation",
              "Administrator activity logging",
            ].map(
              (item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-xl border p-4"
                >
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />

                  <span className="text-sm font-medium">
                    {item}
                  </span>
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // GENERAL
  // ==========================================================

  const renderGeneral =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              General Platform Settings
            </CardTitle>

            <CardDescription>
              Basic platform configuration.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div>
              <Label>
                Platform Name
              </Label>

              <Input
                value="IyanjuPay"
                readOnly
                className="mt-2"
              />
            </div>

            <div>
              <Label>
                Default Currency
              </Label>

              <Select
                value="NGN"
                disabled
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="NGN">
                    Nigerian Naira (NGN)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>
                Country
              </Label>

              <Input
                value="Nigeria"
                readOnly
                className="mt-2"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // CUSTOMER EXPERIENCE
  // ==========================================================

  const renderCustomerExperience =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Customer Experience
            </CardTitle>

            <CardDescription>
              Customer-facing platform behavior.
            </CardDescription>
          </CardHeader>

          <CardContent className="divide-y">
            <SettingRow
              label="Show maintenance banner"
              description="Display an operational banner when maintenance is active."
              enabled={
                settings.showMaintenanceBanner
              }
              onChange={(value) =>
                updateSetting(
                  "showMaintenanceBanner",
                  value
                )
              }
            />

            <SettingRow
              label="Customer email notifications"
              description="Send transactional emails where supported."
              enabled={
                settings.customerEmailNotifications
              }
              onChange={(value) =>
                updateSetting(
                  "customerEmailNotifications",
                  value
                )
              }
            />

            <SettingRow
              label="Customer push notifications"
              description="Send supported customer transaction alerts."
              enabled={
                settings.customerPushNotifications
              }
              onChange={(value) =>
                updateSetting(
                  "customerPushNotifications",
                  value
                )
              }
            />
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // FEATURE FLAGS
  // ==========================================================

  const renderFeatureFlags =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Feature Flags
            </CardTitle>

            <CardDescription>
              Control feature availability across the platform.
            </CardDescription>
          </CardHeader>

          <CardContent className="divide-y">
            <SettingRow
              label="Feature flag system"
              description="Enable centrally managed platform feature flags."
              enabled={
                settings.enableFeatureFlags
              }
              onChange={(value) =>
                updateSetting(
                  "enableFeatureFlags",
                  value
                )
              }
            />

            <SettingRow
              label="Virtual accounts"
              description="Enable permanent Flutterwave virtual account functionality."
              enabled={
                settings.allowVirtualAccounts
              }
              onChange={(value) =>
                updateSetting(
                  "allowVirtualAccounts",
                  value
                )
              }
            />

            <SettingRow
              label="Bill payments"
              description="Enable the service payment feature."
              enabled={
                settings.allowBillPayments
              }
              onChange={(value) =>
                updateSetting(
                  "allowBillPayments",
                  value
                )
              }
            />
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // RETENTION
  // ==========================================================

  const renderRetention =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Data Retention
            </CardTitle>

            <CardDescription>
              Configure administrative data retention policies.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div>
              <Label>
                Retention period
              </Label>

              <div className="relative mt-2 max-w-sm">
                <Input
                  value={
                    retentionDays
                  }
                  onChange={(event) =>
                    setRetentionDays(
                      event.target.value
                    )
                  }
                  inputMode="numeric"
                />

                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  days
                </span>
              </div>
            </div>

            <Alert>
              <Archive className="h-4 w-4" />

              <AlertTitle>
                Preserve financial records
              </AlertTitle>

              <AlertDescription>
                Financial transaction, ledger, reconciliation, and audit records should not be deleted merely because a general retention period expires.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // BACKUPS
  // ==========================================================

  const renderBackups =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Backups
            </CardTitle>

            <CardDescription>
              Database backup and recovery controls.
            </CardDescription>
          </CardHeader>

          <CardContent className="divide-y">
            <SettingRow
              label="Automatic backups"
              description="Keep automated database backups enabled."
              enabled={
                settings.automaticBackups
              }
              onChange={(value) =>
                updateSetting(
                  "automaticBackups",
                  value
                )
              }
            />

            <div className="py-5">
              <p className="text-sm font-medium">
                Backup strategy
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Production backups should be handled by the infrastructure/database provider with recovery testing performed periodically.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // EXPORTS
  // ==========================================================

  const renderExports =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Data Exports
            </CardTitle>

            <CardDescription>
              Administrative data export controls.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div>
              <Label>
                Daily export limit
              </Label>

              <Input
                value={
                  dailyExportLimit
                }
                onChange={(event) =>
                  setDailyExportLimit(
                    event.target.value
                  )
                }
                className="mt-2 max-w-sm"
                inputMode="numeric"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Button
                variant="outline"
                className="justify-start"
              >
                <FileText className="mr-2 h-4 w-4" />

                Transactions
              </Button>

              <Button
                variant="outline"
                className="justify-start"
              >
                <Wallet className="mr-2 h-4 w-4" />

                Balance History
              </Button>

              <Button
                variant="outline"
                className="justify-start"
              >
                <FileArchive className="mr-2 h-4 w-4" />

                Audit Logs
              </Button>
            </div>

            <Alert>
              <Lock className="h-4 w-4" />

              <AlertTitle>
                Export protection
              </AlertTitle>

              <AlertDescription>
                Financial exports should require administrator authorization and should be audited.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // AUDIT HISTORY
  // ==========================================================

  const renderAuditHistory =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Settings Change History
            </CardTitle>

            <CardDescription>
              Administrative settings changes recorded by the persistent PostgreSQL audit history.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {auditItems.length ===
            0 ? (
              <EmptyState
                icon={History}
                title="No settings changes yet"
                description="Persisted settings changes are loaded from the administrator settings audit history."
              />
            ) : (
              <div className="space-y-3">
                {auditItems.map(
                  (item) => (
                    <div
                      key={
                        item.id
                      }
                      className="flex gap-4 rounded-xl border p-4"
                    >
                      <div className="mt-0.5 rounded-full bg-emerald-50 p-2">
                        <Check className="h-4 w-4 text-emerald-600" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {
                              item.action
                            }
                          </p>

                          <span className="text-xs text-muted-foreground">
                            {formatDate(
                              item.createdAt
                            )}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {
                            item.description
                          }
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // GENERIC SECTION FALLBACK
  // ==========================================================

  const renderGenericSection =
    () => (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {getSectionTitle(
                activeSection
              )}
            </CardTitle>

            <CardDescription>
              {getSectionDescription(
                activeSection
              )}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <EmptyState
              icon={Settings}
              title="Configuration area"
              description="This section is included in the admin settings infrastructure and is ready to be connected to its secured persistence and operational controls."
            />
          </CardContent>
        </Card>
      </div>
    );


  // ==========================================================
  // SECTION RENDERER
  // ==========================================================

  const renderActiveSection =
    () => {
      switch (
        activeSection
      ) {
        case "overview":
          return renderOverview();

        case "collection-balance":
          return renderCollectionBalance();

        case "payout-balance":
          return renderPayoutBalance();

        case "balance-history":
          return renderBalanceHistory();

        case "fees":
          return renderFees();

        case "transaction-limits":
          return renderTransactionLimits();

        case "flutterwave":
          return renderFlutterwave();

        case "provider-health":
          return renderProviderHealth();

        case "webhooks":
          return renderWebhooks();

        case "service-controls":
          return renderServiceControls();

        case "maintenance":
          return renderMaintenance();

        case "reconciliation":
          return renderReconciliation();

        case "notifications":
          return renderNotifications();

        case "admin-authentication":
          return renderAdminAuthentication();

        case "session-policy":
          return renderSessionPolicy();

        case "sensitive-actions":
          return renderSensitiveActions();

        case "fraud-controls":
          return renderFraudControls();

        case "kyc-policies":
          return renderKycPolicies();

        case "compliance":
          return renderCompliance();

        case "general":
          return renderGeneral();

        case "customer-experience":
          return renderCustomerExperience();

        case "feature-flags":
          return renderFeatureFlags();

        case "retention":
          return renderRetention();

        case "backups":
          return renderBackups();

        case "exports":
          return renderExports();

        case "audit-history":
          return renderAuditHistory();

        default:
          return renderGenericSection();
      }
    };


  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-muted/20">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] border-r bg-background lg:block">
          {renderNavigation()}
        </aside>

        {mobileNavigationOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() =>
                setMobileNavigationOpen(
                  false
                )
              }
            />

            <aside className="fixed inset-y-0 left-0 z-50 w-[300px] border-r bg-background lg:hidden">
              {renderNavigation(
                true
              )}
            </aside>
          </>
        )}

        <main className="min-w-0 flex-1 lg:pl-[280px]">
          {renderHeader()}

          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
            {settingsLoading && (
              <Alert className="mb-6">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <AlertTitle>
                  Loading administrator settings
                </AlertTitle>
                <AlertDescription>
                  Reading the current settings from the secure administration backend.
                </AlertDescription>
              </Alert>
            )}

            {settingsError && (
              <Alert
                variant="destructive"
                className="mb-6"
              >
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>
                  Settings service unavailable
                </AlertTitle>
                <AlertDescription>
                  {settingsError}
                </AlertDescription>
              </Alert>
            )}

            {saveMessage && (
              <Alert className="mb-6 border-emerald-200 bg-emerald-50 text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />

                <AlertTitle>
                  Settings updated
                </AlertTitle>

                <AlertDescription>
                  {saveMessage}
                </AlertDescription>
              </Alert>
            )}

            {renderActiveSection()}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

  );
}

export default AdminSettingsPage;
