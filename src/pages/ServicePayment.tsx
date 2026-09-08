import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  History,
  Loader2,
  LockKeyhole,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ServicePaymentProps {
  service: { title: string; type: string } | null;
  walletBalance: number;
  onBack: () => void;
  onHistory?: () => void;
  onPurchase: (
    amount: number,
    details: Record<string, any>
  ) => Promise<any>;
}

type Biller = Record<string, any>;
type Item = Record<string, any>;

type DataTab =
  | "HOT"
  | "EXTRA_NIGHT"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY";

const SERVICE_ALIASES: Record<string, string> = {
  airtime_epin: "airtime-card",
  airtime_card: "airtime-card",
  data_epin: "data-card",
  data_card: "data-card",
  recharge: "recharge-card",
  recharge_card: "recharge-card",
};

const SERVICE_TITLES: Record<string, string> = {
  airtime: "Airtime",
  data: "Mobile Data",
  cable: "Cable TV",
  electricity: "Electricity",
  education: "Education",
  "airtime-card": "Airtime E-pin",
  "data-card": "Data E-pin",
  airtime_epin: "Airtime E-pin",
  data_epin: "Data E-pin",
  "recharge-card": "Recharge Card",
};


const AIRTIME_AMOUNTS = [
  50,
  100,
  200,
  500,
  1000,
  2000,
  5000,
];

const BILL_AMOUNTS = [
  100,
  200,
  500,
  1000,
  2000,
  5000,
  10000,
];

const DATA_TABS: DataTab[] = [
  "HOT",
  "EXTRA_NIGHT",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
];

/*
 * ============================================================
 * ELECTRICITY DISCO CONFIGURATION
 * ============================================================
 */

const ELECTRICITY_DISCO_NAMES = [
  "AEDC Abuja Disco",
  "BEDC Benin Disco",
  "EEDC Enugu Disco",
  "EKEDC Eko Disco",
  "IBEDC Ibadan Disco",
  "IKEDC Ikeja Disco",
  "JED Jos Disco",
  "KAEDCO Kaduna Disco",
  "KEDCO Kano Disco",
  "PHED Port Harcourt Disco",
  "YEDC Yola Disco",
] as const;

const ELECTRICITY_DISCO_ALIASES: Record<string, string> = {
  aedc: "AEDC Abuja Disco",
  abuja: "AEDC Abuja Disco",
  "abuja disco": "AEDC Abuja Disco",
  "abuja electricity": "AEDC Abuja Disco",
  "abuja electricity distribution company":
    "AEDC Abuja Disco",

  bedc: "BEDC Benin Disco",
  benin: "BEDC Benin Disco",
  "benin disco": "BEDC Benin Disco",
  "benin electricity": "BEDC Benin Disco",
  "benin electricity distribution company":
    "BEDC Benin Disco",

  eedc: "EEDC Enugu Disco",
  enugu: "EEDC Enugu Disco",
  "enugu disco": "EEDC Enugu Disco",
  "enugu electricity": "EEDC Enugu Disco",
  "enugu electricity distribution company":
    "EEDC Enugu Disco",

  ekedc: "EKEDC Eko Disco",
  eko: "EKEDC Eko Disco",
  "eko disco": "EKEDC Eko Disco",
  "eko electricity": "EKEDC Eko Disco",
  "eko electricity distribution company":
    "EKEDC Eko Disco",

  ibedc: "IBEDC Ibadan Disco",
  ibadan: "IBEDC Ibadan Disco",
  "ibadan disco": "IBEDC Ibadan Disco",
  "ibadan electricity": "IBEDC Ibadan Disco",
  "ibadan electricity distribution company":
    "IBEDC Ibadan Disco",

  ikedc: "IKEDC Ikeja Disco",
  ikeja: "IKEDC Ikeja Disco",
  "ikeja disco": "IKEDC Ikeja Disco",
  "ikeja electricity": "IKEDC Ikeja Disco",
  "ikeja electricity distribution company":
    "IKEDC Ikeja Disco",

  jed: "JED Jos Disco",
  jos: "JED Jos Disco",
  "jos disco": "JED Jos Disco",
  "jos electricity": "JED Jos Disco",
  "jos electricity distribution company":
    "JED Jos Disco",

  kaedco: "KAEDCO Kaduna Disco",
  kaduna: "KAEDCO Kaduna Disco",
  "kaduna disco": "KAEDCO Kaduna Disco",
  "kaduna electricity": "KAEDCO Kaduna Disco",
  "kaduna electricity distribution company":
    "KAEDCO Kaduna Disco",

  kedco: "KEDCO Kano Disco",
  kano: "KEDCO Kano Disco",
  "kano disco": "KEDCO Kano Disco",
  "kano electricity": "KEDCO Kano Disco",
  "kano electricity distribution company":
    "KEDCO Kano Disco",

  phed: "PHED Port Harcourt Disco",
  "port harcourt": "PHED Port Harcourt Disco",
  "port harcourt disco": "PHED Port Harcourt Disco",
  "port harcourt electricity":
    "PHED Port Harcourt Disco",
  "port harcourt electricity distribution company":
    "PHED Port Harcourt Disco",

  yedc: "YEDC Yola Disco",
  yola: "YEDC Yola Disco",
  "yola disco": "YEDC Yola Disco",
  "yola electricity": "YEDC Yola Disco",
  "yola electricity distribution company":
    "YEDC Yola Disco",
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function naira(value: unknown): string {
  return `₦${num(value).toLocaleString("en-NG", {
    maximumFractionDigits: 2,
  })}`;
}

function normaliseServiceType(type: string): string {
  const value = clean(type).toLowerCase();
  return SERVICE_ALIASES[value] ?? value;
}

function displayServiceTitle(
  service: { title: string; type: string } | null
): string {
  if (!service) return "Services";

  return (
    SERVICE_TITLES[normaliseServiceType(service.type)] ??
    service.title
  );
}

function getCode(
  value: Biller | Item | null | undefined
): string {
  return clean(
    value?.biller_code ??
      value?.billerCode ??
      value?.network_code ??
      value?.networkCode ??
      value?.cable_code ??
      value?.cableCode ??
      value?.code ??
      value?.id ??
      value?.value
  );
}

function getName(
  value: Biller | Item | null | undefined
): string {
  return clean(
    value?.name ??
      value?.label ??
      value?.title ??
      value?.short_name ??
      value?.shortName ??
      value?.biller_name ??
      value?.billerName ??
      value?.network_name ??
      value?.networkName ??
      value?.description
  );
}

function getItemCode(item: Item | null | undefined): string {
  return clean(
    item?.item_code ??
      item?.itemCode ??
      item?.product_code ??
      item?.productCode ??
      item?.variation_code ??
      item?.variationCode ??
      item?.plan_code ??
      item?.planCode ??
      item?.package_code ??
      item?.packageCode ??
      item?.code ??
      item?.id ??
      item?.value
  );
}

function getItemPrice(item: Item | null | undefined): number {
  return num(
    item?.selling_price ??
      item?.sellingPrice ??
      item?.price ??
      item?.amount ??
      item?.denomination ??
      item?.value
  );
}

function getProviderPrice(
  item: Item | null | undefined
): number {
  return num(
    item?.providerPrice ??
      item?.provider_price ??
      item?.cost ??
      item?.provider_amount
  );
}

function normaliseDataPlanLabel(value: unknown): string {
  let label = clean(value).replace(/\s+/g, " ").trim();
  if (!label) return "Data plan";

  const compact = label.replace(/\s+/g, "");
  const codeSize = compact.match(
    /^m?(\d+(?:\.\d+)?)(kb|kbs|mb|mbs|gb|gbs|tb|tbs)$/i,
  );
  if (codeSize) {
    return `${codeSize[1]} ${codeSize[2].replace(/s$/i, "").toUpperCase()}`;
  }

  const embeddedSize = label.match(
    /(\d+(?:\.\d+)?)\s*(KB|KBS|MB|MBS|GB|GBS|TB|TBS)\b/i,
  );
  if (embeddedSize) {
    return `${embeddedSize[1]} ${embeddedSize[2].replace(/s$/i, "").toUpperCase()}`;
  }

  label = label
    .replace(/\b(sme|awoof|direct|direct\s+data|gifting|gift|corporate|business|promo|promotion|bonus|hot\s*deal|hot)\b/gi, "")
    .replace(/\s*[-|–—]\s*/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return label || "Data plan";
}

function durationDays(item: Item): number {
  const raw = item.raw && typeof item.raw === "object" ? item.raw : {};
  const candidates = [
    item.validity_days,
    item.validityDays,
    item.duration_days,
    item.durationDays,
    item.duration,
    item.validity,
    item.validity_period,
    item.validityPeriod,
    item.period,
    item.plan_period,
    item.planPeriod,
    item.plan_type,
    item.planType,
    item.name,
    item.plan_name,
    item.planName,
    item.description,
    getItemCode(item),
    raw.validity_days,
    raw.validityDays,
    raw.duration_days,
    raw.durationDays,
    raw.duration,
    raw.validity,
    raw.validity_period,
    raw.validityPeriod,
    raw.period,
    raw.plan_period,
    raw.planPeriod,
    raw.plan_type,
    raw.planType,
    raw.type,
    raw.category,
    raw.name,
    raw.plan_name,
    raw.planName,
    raw.description,
  ];

  for (const value of candidates) {
    const numeric = num(value);
    if (numeric > 0 && numeric <= 1000) return numeric;

    const match = clean(value).match(
      /(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months)/i,
    );
    if (!match) continue;

    const count = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("month")) return count * 30;
    if (unit.startsWith("week")) return count * 7;
    return count;
  }

  return 0;
}

function getPlanName(item: Item): string {
  return normaliseDataPlanLabel(
    item.display_name ??
      item.displayName ??
      item.name ??
      item.plan_name ??
      item.planName ??
      item.packageName ??
      item.package_name ??
      item.description ??
      getItemCode(item),
  );
}

function getDataPlanSize(item: Item): string {
  const candidates = [
    item.display_name,
    item.displayName,
    item.name,
    item.plan_name,
    item.planName,
    getItemCode(item),
    item.data,
    item.data_amount,
    item.dataAmount,
    item.volume,
    item.bundle_size,
    item.bundleSize,
    item.size,
  ];

  for (const value of candidates) {
    const label = clean(value).replace(/\s+/g, " ").trim();
    const match = label.match(
      /(?:^|\s|m)(\d+(?:\.\d+)?)\s*(KB|KBS|MB|MBS|GB|GBS|TB|TBS)\b/i,
    );
    if (match) {
      return `${match[1]} ${match[2].replace(/s$/i, "").toUpperCase()}`;
    }
  }

  return normaliseDataPlanLabel(getPlanName(item));
}

function getDataPlanDuration(item: Item): string {
  const days = durationDays(item);
  if (days > 0) {
    if (days >= 28) return `${days} days`;
    if (days % 7 === 0) return `${days / 7} week${days / 7 === 1 ? "" : "s"}`;
    return `${days} days`;
  }

  const explicit = clean(
    item.validity ??
      item.duration ??
      item.period ??
      item.plan_period ??
      item.planPeriod ??
      item.validity_period ??
      item.validityPeriod,
  );

  return explicit || "Data plan";
}

function planGroup(item: Item): DataTab {
  const backendGroup = clean(item.dataCategory).toUpperCase().replace(/[\s-]+/g, "_");

  if (backendGroup === "HOT" || backendGroup === "HOT_DEAL" || backendGroup === "PROMO") {
    return "HOT";
  }

  if (backendGroup === "EXTRA_NIGHT" || backendGroup === "NIGHT" || backendGroup === "NIGHT_PLAN") {
    return "EXTRA_NIGHT";
  }

  if (backendGroup === "DAILY" || backendGroup === "WEEKLY" || backendGroup === "MONTHLY") {
    return backendGroup as DataTab;
  }

  const raw = item.raw && typeof item.raw === "object" ? item.raw : {};
  const text = [
    item.period,
    item.plan_period,
    item.planPeriod,
    item.plan_type,
    item.planType,
    item.category,
    item.type,
    item.data_type,
    item.dataType,
    item.bundle_type,
    item.bundleType,
    item.validity,
    item.validity_days,
    item.validityDays,
    item.duration,
    item.name,
    item.plan_name,
    item.planName,
    item.description,
    raw.period,
    raw.plan_period,
    raw.planPeriod,
    raw.plan_type,
    raw.planType,
    raw.category,
    raw.type,
    raw.validity,
    raw.validity_days,
    raw.validityDays,
    raw.duration,
    raw.name,
    raw.plan_name,
    raw.planName,
    raw.description,
  ]
    .map(clean)
    .join(" ")
    .toLowerCase();

  if (/extra\s*night|night\s*(data|plan|bundle)|midnight|11\s*pm|12\s*am|1\s*am|2\s*am|3\s*am|4\s*am|5\s*am/.test(text)) {
    return "EXTRA_NIGHT";
  }

  if (/hot\s*deal|promo|promotion|bonus|special|popular|best\s*seller/.test(text)) {
    return "HOT";
  }

  const days = durationDays(item);
  if (days >= 28) return "MONTHLY";
  if (days >= 7) return "WEEKLY";
  if (days > 0) return "DAILY";

  if (/monthly|30\s*days?|31\s*days?|1\s*month|2\s*months?|3\s*months?/.test(text)) {
    return "MONTHLY";
  }
  if (/weekly|7\s*days?|14\s*days?|1\s*week|2\s*weeks?/.test(text)) {
    return "WEEKLY";
  }
  if (/daily|1\s*day|2\s*days?|3\s*days?|24\s*hours?/.test(text)) {
    return "DAILY";
  }

  // Never hide an otherwise valid catalogue item behind an "Other" tab.
  // Unclassified plans are surfaced under HOT so every returned plan remains reachable.
  return "HOT";
}

function isVariable(item: Item): boolean {
  const minimum = num(
    item.minimum ??
      item.min_amount ??
      item.minAmount
  );

  const maximum = num(
    item.maximum ??
      item.max_amount ??
      item.maxAmount
  );

  return (
    !!item.is_airtime ||
    (!!minimum && !getItemCode(item)) ||
    (!!maximum && !getItemCode(item))
  );
}

function firstArray(...values: any[]): any[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function providerLogo(
  name: string,
  code = ""
): string | null {
  const value = `${name} ${code}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");

  if (value.includes("dstv")) {
    return "https://www.google.com/s2/favicons?domain=dstv.com&sz=128";
  }

  if (value.includes("gotv")) {
    return "https://www.google.com/s2/favicons?domain=gotvafrica.com&sz=128";
  }

  if (
    value.includes("startime") ||
    value.includes("startimes")
  ) {
    return "https://www.google.com/s2/favicons?domain=startimestv.com&sz=128";
  }

  if (value.includes("showmax")) {
    return "https://www.google.com/s2/favicons?domain=showmax.com&sz=128";
  }

  if (
    value.includes("mtn") ||
    /\b01\b/.test(value)
  ) {
    return "https://www.google.com/s2/favicons?domain=mtn.ng&sz=128";
  }

  if (
    value.includes("glo") ||
    /\b02\b/.test(value)
  ) {
    return "https://www.google.com/s2/favicons?domain=gloworld.com&sz=128";
  }

  if (
    value.includes("9mobile") ||
    value.includes("etisalat") ||
    /\b03\b/.test(value)
  ) {
    return "https://www.google.com/s2/favicons?domain=9mobile.com.ng&sz=128";
  }

  if (
    value.includes("airtel") ||
    /\b04\b/.test(value)
  ) {
    return "https://www.google.com/s2/favicons?domain=airtel.com.ng&sz=128";
  }

  return null;
}

const OFFLINE_BILLERS: Record<string, Biller[]> = {
  airtime: [
    { biller_code: "01", name: "MTN" },
    { biller_code: "02", name: "Glo" },
    { biller_code: "03", name: "9mobile" },
    { biller_code: "04", name: "Airtel" },
  ],

  data: [
    { biller_code: "01", name: "MTN" },
    { biller_code: "02", name: "Glo" },
    { biller_code: "03", name: "9mobile" },
    { biller_code: "04", name: "Airtel" },
  ],

  "airtime-card": [
    { biller_code: "01", name: "MTN" },
    { biller_code: "02", name: "Glo" },
    { biller_code: "03", name: "9mobile" },
    { biller_code: "04", name: "Airtel" },
  ],

  "data-card": [
    { biller_code: "01", name: "MTN" },
    { biller_code: "02", name: "Glo" },
    { biller_code: "03", name: "9mobile" },
    { biller_code: "04", name: "Airtel" },
  ],

  cable: [
    { biller_code: "dstv", name: "DStv" },
    { biller_code: "gotv", name: "GOtv" },
    { biller_code: "startimes", name: "Startimes" },
    { biller_code: "showmax", name: "Showmax" },
  ],

  electricity: [
    { biller_code: "01", name: "AEDC Abuja Disco" },
    { biller_code: "02", name: "BEDC Benin Disco" },
    { biller_code: "03", name: "EEDC Enugu Disco" },
    { biller_code: "04", name: "EKEDC Eko Disco" },
    { biller_code: "05", name: "IBEDC Ibadan Disco" },
    { biller_code: "06", name: "IKEDC Ikeja Disco" },
    { biller_code: "07", name: "JED Jos Disco" },
    { biller_code: "08", name: "KAEDCO Kaduna Disco" },
    { biller_code: "09", name: "KEDCO Kano Disco" },
    { biller_code: "10", name: "PHED Port Harcourt Disco" },
    { biller_code: "11", name: "YEDC Yola Disco" },
  ],
};

function normaliseDiscoText(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalElectricityDisco(
  biller: Biller
): string {
  const name = normaliseDiscoText(getName(biller));
  const code = normaliseDiscoText(getCode(biller));

  const combined = `${name} ${code}`;

  for (const [
    alias,
    canonical,
  ] of Object.entries(
    ELECTRICITY_DISCO_ALIASES
  )) {
    const normalizedAlias =
      normaliseDiscoText(alias);

    if (
      name === normalizedAlias ||
      code === normalizedAlias ||
      name.includes(normalizedAlias) ||
      combined.includes(normalizedAlias)
    ) {
      return canonical;
    }
  }

  for (const canonical of ELECTRICITY_DISCO_NAMES) {
    const normalizedCanonical =
      normaliseDiscoText(canonical);

    if (
      name === normalizedCanonical ||
      name.includes(normalizedCanonical)
    ) {
      return canonical;
    }
  }

  return "";
}

function filterElectricityDiscos(live: Biller[]): Biller[] {
  const result: Biller[] = [];
  const seen = new Set<string>();

  for (const biller of live) {
    if (isPlaceholderBiller(biller)) continue;

    const code = getCode(biller);
    const name = getName(biller);
    const canonical = canonicalElectricityDisco(biller);
    const displayName = canonical || clean(biller.display_name) || name || code;
    const key = code.toLowerCase() || normaliseDiscoText(displayName);

    if (!key || seen.has(key)) continue;
    seen.add(key);

    result.push({
      ...biller,
      display_name: displayName,
    });
  }

  // Only use the old list when the provider returned no usable electricity billers.
  if (!result.length) {
    for (const biller of OFFLINE_BILLERS.electricity ?? []) {
      const code = getCode(biller);
      const name = getName(biller);
      const key = code.toLowerCase() || normaliseDiscoText(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push({ ...biller, display_name: name });
    }
  }

  return result;
}
function isPlaceholderBiller(
  value: Biller
): boolean {
  const name = getName(value)
    .toLowerCase()
    .replace(/\s+/g, "");

  const code = getCode(value)
    .toLowerCase()
    .replace(/\s+/g, "");

  return [name, code].some((v) =>
    /^(\[?\[?\{?tv\}?\]?\]?|\[objectobject\])$/.test(
      v
    )
  );
}

function mergeBillers(
  service: string,
  live: Biller[]
): Biller[] {
  const cleaned = live.filter(
    (b) => !isPlaceholderBiller(b)
  );

  if (service === "electricity") {
    return filterElectricityDiscos(cleaned);
  }

  const result: Biller[] = [];
  const seen = new Set<string>();

  const canonicalName = (
    biller: Biller
  ): string => {
    const raw =
      `${getName(biller)} ${getCode(
        biller
      )}`.toLowerCase();

    if (
      raw.includes("mtn") ||
      /\b01\b/.test(raw)
    ) {
      return "mtn";
    }

    if (
      raw.includes("glo") ||
      /\b02\b/.test(raw)
    ) {
      return "glo";
    }

    if (
      raw.includes("9mobile") ||
      raw.includes("etisalat") ||
      /\b03\b/.test(raw)
    ) {
      return "9mobile";
    }

    if (
      raw.includes("airtel") ||
      /\b04\b/.test(raw)
    ) {
      return "airtel";
    }

    if (raw.includes("dstv")) return "dstv";
    if (raw.includes("gotv")) return "gotv";

    if (
      raw.includes("startime") ||
      raw.includes("startimes")
    ) {
      return "startimes";
    }

    if (raw.includes("showmax")) return "showmax";

    return "";
  };

  const add = (biller: Biller) => {
    const code = getCode(biller).toLowerCase();
    const name = getName(biller).toLowerCase();
    const canonical = canonicalName(biller);

    const key =
      canonical || code || name;

    if (!key || seen.has(key)) return;

    seen.add(key);
    result.push(biller);
  };

  cleaned.forEach(add);
  (OFFLINE_BILLERS[service] ?? []).forEach(add);

  return result;
}

function initials(name: string): string {
  const words = clean(name)
    .split(/\s+/)
    .filter(Boolean);

  return (
    words.length >= 2
      ? words[0][0] + words[1][0]
      : clean(name).slice(0, 2)
  ).toUpperCase();
}

type ProcessingSession = {
  amount: number;
  details: Record<string, any>;
  idempotencyKey: string;
};

type TransactionStatus =
  | "processing"
  | "success"
  | "pending"
  | "failed";

function createIdempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `svc-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

function transactionStatusFromResult(
  result: any
): Exclude<TransactionStatus, "processing"> {
  const explicitSuccess =
    result?.success === true ||
    result?.data?.success === true;

  const explicitFailure =
    result?.success === false ||
    result?.data?.success === false;

  const status = clean(
    result?.status ??
      result?.transaction_status ??
      result?.transactionStatus ??
      result?.data?.status ??
      result?.data?.transaction_status ??
      result?.data?.transactionStatus
  ).toLowerCase();

  if (explicitSuccess) {
    return "success";
  }

  if (explicitFailure) {
    return "failed";
  }

  if (
    [
      "failed",
      "failure",
      "declined",
      "cancelled",
      "canceled",
      "reversed",
    ].includes(status)
  ) {
    return "failed";
  }

  if (
    [
      "pending",
      "processing",
      "queued",
      "initiated",
      "in_progress",
      "in-progress",
    ].includes(status)
  ) {
    return "pending";
  }

  if (
    [
      "success",
      "successful",
      "completed",
      "complete",
      "successful_transaction",
    ].includes(status)
  ) {
    return "success";
  }

  return "success";
}

function transactionReferenceFromResult(
  result: any
): string {
  return clean(
    result?.reference ??
      result?.transaction_reference ??
      result?.transactionReference ??
      result?.provider_reference ??
      result?.providerReference ??
      result?.data?.reference ??
      result?.data?.transaction_reference ??
      result?.data?.transactionReference ??
      result?.data?.provider_reference
  );
}

/*
 * ============================================================
 * TRANSACTION PROCESSING SCREEN
 * ============================================================
 */

function ServiceTransactionProcessing({
  amount,
  details,
  execute,
  onDone,
  onBack,
}: {
  amount: number;
  details: Record<string, any>;
  execute: () => Promise<any>;
  onDone: () => void;
  onBack: () => void;
}) {
  const [status, setStatus] =
    useState<TransactionStatus>("processing");

  const [reference, setReference] =
    useState("");

  const [message, setMessage] =
    useState(
      "Your payment is being processed securely."
    );

  const [copied, setCopied] =
    useState(false);

  const startedRef =
    React.useRef(false);

  const serviceName =
    clean(
      details?.biller?.display_name ??
        details?.biller?.name ??
        details?.biller?.label ??
        details?.biller?.title
    ) ||
    clean(details?.service_title) ||
    "Service";

  const customerValue = clean(
    details?.smartCardNumber ||
      details?.smartcardNumber ||
      details?.meterNumber ||
      details?.phoneNumber ||
      details?.customer
  );

  const itemName = clean(
    details?.item?.name ??
      details?.item?.plan_name ??
      details?.item?.packageName ??
      details?.item?.description
  );

  const run = useCallback(async () => {
    setStatus("processing");
    setMessage(
      "Your payment is being processed securely."
    );

    try {
      const result = await execute();

      const nextStatus =
        transactionStatusFromResult(result);

      setReference(
        transactionReferenceFromResult(result)
      );

      setMessage(
        nextStatus === "pending"
          ? "Your payment has been received and is still being processed."
          : nextStatus === "failed"
            ? "We could not complete this transaction."
            : "Your service purchase was completed successfully."
      );

      setStatus(nextStatus);
    } catch (error: any) {
      setMessage(
        error?.message ||
          "We could not complete this transaction."
      );

      setStatus("failed");
    }
  }, [execute]);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      void run();
    }
  }, [run]);

  const copyReference = async () => {
    if (!reference) return;

    try {
      await navigator.clipboard.writeText(
        reference
      );

      setCopied(true);

      window.setTimeout(
        () => setCopied(false),
        1600
      );
    } catch {}
  };

  const isProcessing =
    status === "processing";
  const isSuccess =
    status === "success";
  const isPending =
    status === "pending";
  const isFailed =
    status === "failed";

  return (
    <>
      <style>{`
        /*
         * =====================================================
         * SERVICE TRANSACTION PROCESSING THEME
         * =====================================================
         *
         * These selectors are intentionally dedicated to the
         * transaction-processing screen.
         *
         * They do NOT depend on generic .bg-white or .text-*
         * selectors alone.
         */

        .iyanjupay-service-processing-page {
          min-height: 100vh;
          background-color: #f9fafb;
          color: #111827;
          transition:
            background-color 180ms ease,
            color 180ms ease;
        }

        .iyanjupay-processing-card {
          background-color: #ffffff;
          color: #111827;
          border-color: #e5e7eb;
        }

        .iyanjupay-processing-hero {
          background-image: linear-gradient(
            to bottom,
            #f9fafb,
            #ffffff
          );
          border-color: #e5e7eb;
        }

        .iyanjupay-processing-summary {
          background-color: #f9fafb;
          border-color: #e5e7eb;
        }

        .iyanjupay-processing-reference {
          background-color: #ffffff;
          border-color: #e5e7eb;
        }

        .iyanjupay-processing-reference-value {
          background-color: #f9fafb;
          color: #111827;
        }

        .iyanjupay-processing-status {
          border-color: #d1fae5;
          background-color: #ecfdf5;
          color: #166534;
        }

        .iyanjupay-processing-pending {
          border-color: #fde68a;
          background-color: #fffbeb;
          color: #92400e;
        }

        .iyanjupay-processing-failed {
          border-color: #fecaca;
          background-color: #fef2f2;
          color: #991b1b;
        }

        .iyanjupay-processing-secondary {
          background-color: #ffffff;
          border-color: #d1d5db;
          color: #111827;
        }

        .iyanjupay-processing-secondary:hover {
          background-color: #f3f4f6;
        }

        /*
         * =====================================================
         * BLUE THEME
         * =====================================================
         */

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-processing-page {
          background-color: #f4f8ff;
          color: #111827;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-processing-card {
          background-color: #ffffff;
          color: #111827;
          border-color: #dbe5f5;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-processing-hero {
          background-image: linear-gradient(
            to bottom,
            #f4f8ff,
            #ffffff
          );
          border-color: #dbe5f5;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-processing-summary {
          background-color: #f4f8ff;
          border-color: #dbe5f5;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-processing-reference {
          background-color: #ffffff;
          border-color: #dbe5f5;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-processing-reference-value {
          background-color: #f4f8ff;
          color: #111827;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-processing-secondary {
          background-color: #ffffff;
          border-color: #cbd5e1;
          color: #111827;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-processing-secondary:hover {
          background-color: #eff6ff;
        }

        /*
         * =====================================================
         * DARK THEME
         * =====================================================
         */

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page {
          background-color: #090d18;
          color: #f8fafc;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-processing-card {
          background-color: #111827 !important;
          color: #f8fafc !important;
          border-color: #334155 !important;
        }

        

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-processing-hero {
          background-image: linear-gradient(
            to bottom,
            #0f172a,
            #111827
          ) !important;
          border-color: #334155 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-processing-summary {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-processing-reference {
          background-color: #111827 !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-processing-reference-value {
          background-color: #0f172a !important;
          color: #f8fafc !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-processing-status {
          border-color: #14532d !important;
          background-color: #052e2b !important;
          color: #bbf7d0 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-processing-pending {
          border-color: #92400e !important;
          background-color: #451a03 !important;
          color: #fde68a !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-processing-failed {
          border-color: #7f1d1d !important;
          background-color: #450a0a !important;
          color: #fecaca !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-processing-secondary {
          background-color: #111827 !important;
          border-color: #475569 !important;
          color: #f8fafc !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-processing-secondary:hover {
          background-color: #1e293b !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .text-gray-900 {
          color: #f8fafc !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .text-gray-800 {
          color: #f1f5f9 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .text-gray-700 {
          color: #e2e8f0 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .text-gray-600 {
          color: #cbd5e1 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .text-gray-500 {
          color: #94a3b8 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .text-gray-400 {
          color: #64748b !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .border-t {
          border-color: #334155 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .bg-green-50 {
          background-color: #052e2b !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .text-green-600 {
          color: #86efac !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .bg-amber-50 {
          background-color: #451a03 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .text-amber-600 {
          color: #fbbf24 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .bg-red-50 {
          background-color: #450a0a !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-processing-page
          .text-red-600 {
          color: #fca5a5 !important;
        }
      `}</style>

      <div className="iyanjupay-service-processing-page">
        <header className="iyanjupay-service-header sticky top-0 z-20 border-b border-violet-900/20 bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] text-white shadow-md">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              disabled={isProcessing}
              aria-label="Back"
              className="text-white hover:bg-white/15 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <h1 className="text-base font-bold text-white sm:text-lg">
              Transaction
            </h1>

            <span className="w-9" />
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6 pb-10">
          <section className="iyanjupay-processing-card overflow-hidden rounded-[2rem] border shadow-sm">
            <div className="iyanjupay-processing-hero border-b px-5 py-8 text-center sm:px-8">
              <div
                className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${
                  isFailed
                    ? "bg-red-50 text-red-600"
                    : isPending
                      ? "bg-amber-50 text-amber-600"
                      : "bg-green-50 text-green-600"
                }`}
              >
                {isProcessing ? (
                  <Loader2 className="h-9 w-9 animate-spin" />
                ) : isSuccess ? (
                  <Check className="h-10 w-10" />
                ) : isPending ? (
                  <Clock3 className="h-9 w-9" />
                ) : (
                  <XCircle className="h-10 w-10" />
                )}
              </div>

              <p className="mt-5 text-sm font-semibold text-gray-500">
                {isProcessing
                  ? "Processing payment"
                  : isSuccess
                    ? "Payment successful"
                    : isPending
                      ? "Payment pending"
                      : "Payment failed"}
              </p>

              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">
                {isProcessing
                  ? "Please wait..."
                  : isSuccess
                    ? "Purchase completed"
                    : isPending
                      ? "We're still processing it"
                      : "We couldn't complete it"}
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
                {message}
              </p>

              {isProcessing && (
                <div className="iyanjupay-processing-status mx-auto mt-6 flex max-w-sm items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium">
                  <LockKeyhole className="h-4 w-4" />
                  Securing your transaction...
                </div>
              )}
            </div>

            <div className="space-y-4 p-5 sm:p-7">
              <div className="iyanjupay-processing-summary rounded-2xl border p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <Receipt className="h-4 w-4" />
                  Transaction summary
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">
                      Service
                    </span>

                    <span className="text-right font-semibold">
                      {serviceName}
                    </span>
                  </div>

                  {customerValue && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">
                        Customer
                      </span>

                      <span className="max-w-[65%] break-all text-right font-semibold">
                        {customerValue}
                      </span>
                    </div>
                  )}

                  {itemName && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">
                        Package
                      </span>

                      <span className="max-w-[65%] text-right font-semibold">
                        {itemName}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-gray-500">
                      Amount
                    </span>

                    <span className="text-lg font-extrabold">
                      {naira(amount)}
                    </span>
                  </div>
                </div>
              </div>

              {reference && (
                <div className="iyanjupay-processing-reference rounded-2xl border p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <Sparkles className="h-3.5 w-3.5" />
                    Transaction reference
                  </div>

                  <div className="iyanjupay-processing-reference-value flex items-center gap-2 rounded-xl px-3 py-3">
                    <span className="min-w-0 flex-1 break-all text-sm font-semibold">
                      {reference}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        void copyReference()
                      }
                      aria-label="Copy reference"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {isPending && (
                <div className="iyanjupay-processing-pending rounded-2xl border p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />

                    <div>
                      <p className="font-bold">
                        Do not pay again yet
                      </p>

                      <p className="mt-1 leading-6">
                        The transaction has been submitted.
                        Check your transaction history before
                        trying again.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isFailed && (
                <div className="iyanjupay-processing-failed rounded-2xl border p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0" />

                    <div>
                      <p className="font-bold">
                        No successful purchase was confirmed
                      </p>

                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-1">
                {isFailed && (
                  <Button
                    className="iyanjupay-service-primary h-12 w-full bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] font-bold text-white shadow-sm hover:brightness-105"
                    onClick={() => void run()}
                  >
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Retry transaction
                  </Button>
                )}

                {!isProcessing && (
                  <Button
                    variant={
                      isFailed
                        ? "outline"
                        : "default"
                    }
                    className={`${
                      !isFailed
                        ? "iyanjupay-service-primary bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] text-white shadow-sm hover:brightness-105"
                        : "iyanjupay-processing-secondary"
                    } h-12 w-full font-bold`}
                    onClick={onDone}
                  >
                    {isPending
                      ? "Continue to Services"
                      : "Done"}
                  </Button>
                )}
              </div>

              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Your payment is protected by IyanjuPay's
                secure transaction flow.
              </p>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}

export default function ServicePayment({
  service,
  walletBalance,
  onBack,
  onHistory,
  onPurchase,
}: ServicePaymentProps) {
  const { toast } = useToast();

  const rawServiceType = clean(
    service?.type
  ).toLowerCase();

  const serviceType =
    normaliseServiceType(rawServiceType);

  const serviceTitle =
    displayServiceTitle(service);

  const serviceFunction = "peyflex-services";

  const serviceRequestType =
    serviceType === "education"
      ? "education"
      : serviceType;

  const isAirtime =
    serviceType === "airtime";

  const isData =
    serviceType === "data";

  const isCable =
    serviceType === "cable";

  const isElectricity =
    serviceType === "electricity";

  const isEpin =
    serviceType === "airtime-card" ||
    serviceType === "data-card";

  const isRechargeCard =
    serviceType === "recharge-card";

  const isPhoneService =
    isAirtime ||
    isData ||
    isEpin ||
    serviceType === "education";

  const isAmountOnly =
    isAirtime || isElectricity;

  const requiresIdentifierVerification =
    isCable ||
    isElectricity;

  const [billers, setBillers] =
    useState<Biller[]>([]);

  const [items, setItems] =
    useState<Item[]>([]);

  const [
    selectedBillerCode,
    setSelectedBillerCode,
  ] = useState("");

  const [
    selectedItemCode,
    setSelectedItemCode,
  ] = useState("");

  const [customer, setCustomer] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [meterType, setMeterType] =
    useState("");

  const [dataTab, setDataTab] =
    useState<DataTab>("DAILY");

  const [customAmount, setCustomAmount] =
    useState(false);

  const [loadingBillers, setLoadingBillers] =
    useState(false);

  const [loadingItems, setLoadingItems] =
    useState(false);

  const [
    verifyingIdentifier,
    setVerifyingIdentifier,
  ] = useState(false);

  const [verified, setVerified] =
    useState(false);

  const [verifiedName, setVerifiedName] =
    useState("");

  const [showPin, setShowPin] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [verifyingPin, setVerifyingPin] =
    useState(false);

  const [
    processingSession,
    setProcessingSession,
  ] =
    useState<ProcessingSession | null>(
      null
    );

  const [error, setError] =
    useState("");

  const selectedBiller = useMemo(
    () =>
      billers.find(
        (b) =>
          getCode(b) ===
          selectedBillerCode
      ) ?? null,
    [billers, selectedBillerCode]
  );

  const selectedItem = useMemo(
    () =>
      items.find(
        (i) =>
          getItemCode(i) ===
          selectedItemCode
      ) ?? null,
    [items, selectedItemCode]
  );

  const customerLabel =
    isPhoneService
      ? "Phone Number"
      : isCable
        ? "SmartCard / IUC Number"
        : isElectricity
          ? "Meter Number"
          : "Customer Number";

  const customerPlaceholder =
    isPhoneService
      ? "e.g. 08012345678"
      : isCable
        ? "Enter SmartCard / IUC number"
        : isElectricity
          ? "Enter meter number"
          : "Enter customer number";

  const resetVerification =
    useCallback(() => {
      setVerified(false);
      setVerifiedName("");
    }, []);

  const resetForm = useCallback(() => {
    setBillers([]);
    setItems([]);
    setSelectedBillerCode("");
    setSelectedItemCode("");
    setCustomer("");
    setAmount("");
    setMeterType("");
    setCustomAmount(false);
    setDataTab("DAILY");
    resetVerification();
    setError("");
    setShowPin(false);
    setPaymentPin("");
  }, [resetVerification]);

  useEffect(() => {
    resetForm();
  }, [serviceType, resetForm]);

  const invoke = useCallback(
    async (body: Record<string, any>) => {
      const {
        data,
        error: fnError,
      } =
        await supabase.functions.invoke(
          serviceFunction,
          {
            body,
          }
        );

      if (fnError) {
        throw new Error(
          fnError.message ||
            "Service request failed."
        );
      }

      if (!data || data.success !== true) {
        throw new Error(
          data?.error ||
            "Service request failed."
        );
      }

      return data;
    },
    [serviceFunction]
  );

  const loadBillers =
    useCallback(async () => {
      if (!serviceType) return;

      setLoadingBillers(true);
      setError("");

      try {
        const data = await invoke({
          action: "billers",
          service: serviceRequestType,
          country: "NG",
        });

        const loaded = firstArray(
          data.billers,
          data.networks,
          data.providers,
          data.cableProviders,
          data.electricityCompanies,
          data.examTypes
        );

        let merged = mergeBillers(
          serviceType,
          loaded
        );

        setBillers(merged);

        if (
          !merged.length &&
          !isAmountOnly
        ) {
          setError(
            "No service options are currently available."
          );
        }
      } catch (e: any) {
        const message =
          e?.message ||
          "Unable to load service options.";

        setError(message);

        toast({
          title:
            "Unable to load services",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLoadingBillers(false);
      }
    }, [
      invoke,
      isAmountOnly,
      serviceType,
      toast,
    ]);

  useEffect(() => {
    void loadBillers();
  }, [loadBillers]);

  const loadItems =
    useCallback(
      async (billerCode: string) => {
        if (!billerCode) return;

        setLoadingItems(true);
        setError("");
        setItems([]);
        setSelectedItemCode("");

        if (!isData) {
          setAmount("");
        }

        try {
          const data = await invoke({
            action: "items",
            service: serviceRequestType,
            biller_code: billerCode,
            country: "NG",

            ...(isElectricity
              ? {
                  meter_type:
                    meterType ||
                    undefined,
                }
              : {}),

          });

          const loaded = firstArray(
            data.items,
            data.plans,
            data.packages
          );

          setItems(loaded);

          if (isData) {
            setDataTab("DAILY");
          }

          if (
            !loaded.length &&
            !isAmountOnly
          ) {
            setError(
              "No packages are currently available for this option."
            );
          }
        } catch (e: any) {
          const message =
            e?.message ||
            "Unable to load packages.";

          setError(message);

          toast({
            title:
              "Unable to load packages",
            description: message,
            variant: "destructive",
          });
        } finally {
          setLoadingItems(false);
        }
      },
      [
        invoke,
        isAmountOnly,
        isData,
        isElectricity,
        meterType,
        serviceType,
        toast,
      ]
    );

  const handleBillerSelect = async (
    code: string
  ) => {
    if (
      processingSession ||
      verifyingPin
    ) {
      return;
    }

    setSelectedBillerCode(code);
    setSelectedItemCode("");
    setItems([]);
    setAmount("");
    setCustomer("");
    setCustomAmount(false);
    resetVerification();
    setError("");

    if (isElectricity) {
      return;
    }

    await loadItems(code);
  };

  const handleMeterType = (
    value: string
  ) => {
    setMeterType(value);
    setCustomer("");
    setAmount("");
    resetVerification();
  };

  const verifyIdentifier =
    async () => {
      if (!selectedBillerCode) {
        toast({
          title: "Select an option",
          description:
            "Select the service option first.",
          variant: "destructive",
        });

        return;
      }

      if (!customer.trim()) {
        toast({
          title: "Number required",
          description: `Enter your ${customerLabel.toLowerCase()}.`,
          variant: "destructive",
        });

        return;
      }

      setVerifyingIdentifier(true);
      setError("");

      try {
        const data = await invoke(
          isCable
            ? {
                action: "verify_customer",
                service: "cable",
                biller_code: selectedBillerCode,
                customer: customer.trim(),
                iuc: customer.trim(),
                smartcard_number: customer.trim(),
              }
            : {
                action: "verify_customer",
                service: "electricity",
                biller_code: selectedBillerCode,
                customer: customer.trim(),
                meter: customer.trim(),
                meter_number: customer.trim(),
                meter_type: meterType,
              }
        )

        setVerified(true);

        setVerifiedName(
          clean(
            data.customer_name ??
              data.customerName
          )
        );

        toast({
          title: "Verified",
          description:
            data.message ||
            "The number was verified successfully.",
        });

        if (isCable) {
          await loadItems(
            selectedBillerCode
          );
        }
      } catch (e: any) {
        setVerified(false);
        setVerifiedName("");

        const message =
          e?.message ||
          "Unable to verify the number.";

        setError(message);

        toast({
          title:
            "Verification failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setVerifyingIdentifier(false);
      }
    };

  useEffect(() => {
    if (
      !requiresIdentifierVerification ||
      !selectedBillerCode
    ) {
      return;
    }

    const value = customer.trim();

    const minimumLength = 8;

    if (
      value.length <
        minimumLength ||
      (isElectricity &&
        !meterType)
    ) {
      return;
    }

    const timer =
      window.setTimeout(() => {
        void verifyIdentifier();
      }, 650);

    return () =>
      window.clearTimeout(timer);
  }, [
    customer,
    selectedBillerCode,
    meterType,
    requiresIdentifierVerification,
    isElectricity,
  ]);

  function normalisePhone(
    value: string
  ): string {
    const v = clean(value).replace(
      /\s+/g,
      ""
    );

    if (/^0\d{10}$/.test(v)) {
      return `+234${v.slice(1)}`;
    }

    if (/^\d{10}$/.test(v)) {
      return `+234${v}`;
    }

    if (/^234\d{10}$/.test(v)) {
      return `+${v}`;
    }

    return v;
  }

  const handleItemSelect = (
    item: Item
  ) => {
    const code =
      getItemCode(item);

    const price =
      getItemPrice(item);

    if (!code) return;

    if (price <= 0) {
      toast({
        title:
          "Unavailable price",
        description:
          "This package does not have a valid selling price.",
        variant: "destructive",
      });

      return;
    }

    setSelectedItemCode(code);
    setAmount(String(price));
    setCustomAmount(false);
    setError("");
  };

  const amountMinimum = num(
    selectedItem?.minimum ??
      selectedItem?.min_amount ??
      selectedItem?.minAmount
  );

  const amountMaximum = num(
    selectedItem?.maximum ??
      selectedItem?.max_amount ??
      selectedItem?.maxAmount
  );

  const visibleDataPlans =
    useMemo(() => {
      if (!isData) return [];

      const available =
        items.filter(
          (i) => !isVariable(i)
        );

      return available.filter(
        (i) =>
          planGroup(i) === dataTab
      );
    }, [
      dataTab,
      isData,
      items,
    ]);

  const meterTypes = useMemo(() => {
    const nested = firstArray(
      selectedBiller?.serviceProviders,
      selectedBiller?.meterTypes,
      selectedBiller?.meter_types
    );

    return nested;
  }, [selectedBiller]);

  useEffect(() => {
    if (
      isElectricity &&
      selectedBiller &&
      meterTypes.length &&
      !meterType
    ) {
      setMeterType(
        getCode(meterTypes[0])
      );
    }
  }, [
    isElectricity,
    meterType,
    meterTypes,
    selectedBiller,
  ]);

  const canEnterAmount =
    isAirtime ||
    isElectricity;

  const needsItem =
    !canEnterAmount;

  const hasRequiredIdentifier =
    isCable || isElectricity
      ? verified
      : isRechargeCard
        ? true
        : !!customer.trim();

  const hasAmount =
    num(amount) > 0;

  const hasItem =
    !needsItem ||
    !!selectedItemCode;

  const canPurchase =
    !!selectedBillerCode &&
    hasRequiredIdentifier &&
    hasAmount &&
    hasItem &&
    !loadingItems &&
    !verifyingIdentifier &&
    !processingSession;

  const validateBeforePin = () => {
    if (!selectedBillerCode) {
      return "Please select the service option.";
    }

    if (
      requiresIdentifierVerification &&
      !verified
    ) {
      return "Please verify the number before continuing.";
    }

    if (!hasRequiredIdentifier) {
      return `Please enter the ${customerLabel.toLowerCase()}.`;
    }

    if (
      needsItem &&
      !selectedItemCode
    ) {
      return "Please select a package.";
    }

    if (!hasAmount) {
      return "Please select or enter a valid amount.";
    }

    if (
      isData &&
      selectedItem &&
      Math.abs(
        num(amount) -
          getItemPrice(
            selectedItem
          )
      ) > 0.01
    ) {
      return "The selected data plan price is no longer valid.";
    }

    if (
      amountMinimum > 0 &&
      num(amount) <
        amountMinimum
    ) {
      return `Minimum amount is ${naira(
        amountMinimum
      )}.`;
    }

    if (
      amountMaximum > 0 &&
      num(amount) >
        amountMaximum
    ) {
      return `Maximum amount is ${naira(
        amountMaximum
      )}.`;
    }

    if (
      num(amount) >
      num(walletBalance)
    ) {
      return "Insufficient wallet balance.";
    }

    if (
      isPhoneService &&
      !/^\+234\d{10}$/.test(
        normalisePhone(customer)
      )
    ) {
      return "Enter a valid Nigerian phone number.";
    }

    return "";
  };

  const buildDetails = () => {
    const phone =
      isPhoneService
        ? normalisePhone(
            customer
          )
        : "";

    return {
      customer:
        phone ||
        customer.trim(),

      biller_code:
        selectedBillerCode,

      billerCode:
        selectedBillerCode,

      item_code:
        selectedItemCode,

      itemCode:
        selectedItemCode,

      phoneNumber: phone,
      phone,

      meterNumber:
        isElectricity
          ? customer.trim()
          : "",

      meter_number:
        isElectricity
          ? customer.trim()
          : "",

      meterType:
        isElectricity
          ? meterType
          : "",

      meter_type:
        isElectricity
          ? meterType
          : "",

      smartCardNumber:
        isCable
          ? customer.trim()
          : "",

      smartcardNumber:
        isCable
          ? customer.trim()
          : "",

      smartcard_number:
        isCable
          ? customer.trim()
          : "",


      type: serviceType,
      service: serviceRequestType,
      country: "NG",

      // Peyflex-specific request fields.
      network:
        isAirtime || isData || isRechargeCard
          ? selectedBillerCode
          : "",
      mobile_number:
        isAirtime || isData
          ? phone
          : "",
      plan_code:
        isData
          ? selectedItemCode
          : "",
      identifier:
        serviceType === "education"
          ? "education"
          : isCable
            ? selectedBillerCode
            : "",
      plan_id:
        serviceType === "education"
          ? selectedItemCode
          : "",
      quantity:
        isRechargeCard ? 1 : undefined,

      selling_amount:
        num(amount),

      amount:
        num(amount),

      item: selectedItem,
      biller: selectedBiller,

      customer_name:
        verifiedName,

      verified,
    };
  };

  const startPurchase = () => {
    const validationError =
      validateBeforePin();

    if (validationError) {
      toast({
        title:
          "Check your details",
        description:
          validationError,
        variant: "destructive",
      });

      return;
    }

    setPaymentPin("");
    setError("");
    setShowPin(true);
  };

  const confirmPurchase =
    async () => {
      if (!/^\d{4}$/.test(paymentPin)) {
        toast({
          title: "Invalid PIN",
          description:
            "Enter your 4-digit payment PIN.",
          variant: "destructive",
        });

        return;
      }

      setVerifyingPin(true);
      setError("");

      try {
        const {
          data,
          error: pinError,
        } =
          await supabase.rpc(
            "verify_payment_pin",
            {
              _pin: paymentPin,
            }
          );

        if (pinError) {
          throw new Error(
            "Unable to verify payment PIN."
          );
        }

        if (!data?.success) {
          throw new Error(
            data?.message ||
              "Invalid payment PIN."
          );
        }

        const idempotencyKey =
          createIdempotencyKey();

        const details = {
          ...buildDetails(),
          idempotency_key:
            idempotencyKey,
          idempotencyKey,
          service_title:
            serviceTitle,
        };

        setShowPin(false);
        setPaymentPin("");

        setProcessingSession({
          amount: num(amount),
          details,
          idempotencyKey,
        });
      } catch (e: any) {
        const message =
          e?.message ||
          "Unable to complete this payment.";

        setError(message);

        toast({
          title:
            "Payment failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setVerifyingPin(false);
      }
    };

  const renderBillerCard = (
    biller: Biller
  ) => {
    const code =
      getCode(biller);

    const name =
      serviceType === "electricity"
        ? clean(
            biller.display_name
          ) ||
          getName(biller) ||
          code
        : getName(biller) ||
          code;

    const selected =
      code ===
      selectedBillerCode;

    const logo =
      clean(
        biller.logo_url ??
          biller.logoUrl ??
          biller.logo
      ) ||
      providerLogo(
        name,
        code
      );

    return (
      <button
        key={`${code}-${name}`}
        type="button"
        onClick={() =>
          void handleBillerSelect(
            code
          )
        }
        disabled={
          loadingBillers ||
          !!processingSession ||
          verifyingPin
        }
        className={`iyanjupay-service-biller-card flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border bg-white px-1.5 py-2 transition active:scale-[0.98] ${
          selected
            ? "border-[#6D28D9] bg-violet-50 ring-1 ring-[#6D28D9]/20"
            : "border-gray-200 hover:border-violet-300 hover:bg-violet-50/30"
        }`}
      >
        <span
          className={`iyanjupay-service-biller-logo flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border bg-white text-xs font-bold text-gray-600 shadow-sm ${
            selected
              ? "border-[#6D28D9]"
              : "border-gray-200"
          }`}
        >
          {logo ? (
            <img
              src={logo}
              alt=""
              className="h-full w-full object-contain p-1"
              onError={(e) => {
                e.currentTarget.style.display =
                  "none";
              }}
            />
          ) : (
            initials(name)
          )}
        </span>

        <span
          className={`max-w-[86px] truncate text-[10px] font-semibold leading-tight ${
            selected
              ? "text-[#4C1D95]"
              : "text-gray-800"
          }`}
          title={name}
        >
          {name}
        </span>
      </button>
    );
  };

  const renderDataPlan = (
    item: Item
  ) => {
    const code =
      getItemCode(item);

    const price =
      getItemPrice(item);

    const selected =
      code ===
      selectedItemCode;

    const size =
      getDataPlanSize(item);

    const duration =
      getDataPlanDuration(item);

    return (
      <button
        key={code}
        type="button"
        onClick={() =>
          handleItemSelect(item)
        }
        disabled={
          !!processingSession ||
          verifyingPin ||
          price <= 0
        }
        aria-pressed={selected}
        className={`relative min-w-0 overflow-hidden rounded-xl border px-1.5 py-2.5 text-center transition active:scale-[0.98] ${
          selected
            ? "iyanjupay-service-selected border-[#6D28D9] bg-violet-50 ring-2 ring-violet-100"
            : "border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50/30"
        }`}
      >
        <div
          className={`truncate text-[11px] font-extrabold leading-tight sm:text-xs ${
            selected
              ? "text-[#4C1D95]"
              : "text-gray-900"
          }`}
          title={size}
        >
          {size}
        </div>

        <div
          className={`mt-1 truncate text-[11px] font-extrabold leading-tight sm:text-xs ${
            selected
              ? "text-[#4C1D95]"
              : "text-[#4C1D95]"
          }`}
          title={naira(price)}
        >
          {naira(price)}
        </div>

        <div
          className={`mt-1 truncate text-[9px] font-semibold leading-tight sm:text-[10px] ${
            selected
              ? "text-[#4C1D95]"
              : "text-gray-500"
          }`}
          title={duration}
        >
          {duration}
        </div>
      </button>
    );
  };

  const renderPlan = (
    item: Item
  ) => {
    const code =
      getItemCode(item);

    const price =
      getItemPrice(item);

    const selected =
      code ===
      selectedItemCode;

    return (
      <button
        key={code}
        type="button"
        onClick={() =>
          handleItemSelect(item)
        }
        className={`relative min-w-0 rounded-xl border bg-white p-3 text-left transition active:scale-[0.99] ${
          selected
            ? "iyanjupay-service-selected border-[#6D28D9] ring-2 ring-violet-100"
            : "border-gray-200 hover:border-violet-300"
        }`}
      >
        <div className="truncate text-xs font-bold text-gray-900 sm:text-sm">
          {getPlanName(item)}
        </div>

        <div className="mt-1.5 text-sm font-extrabold text-[#4C1D95] sm:text-base">
          {naira(price)}
        </div>

        {item.validity_days ||
        item.validity ||
        item.duration ? (
          <div className="mt-1 truncate text-[10px] text-gray-500 sm:text-xs">
            {clean(
              item.validity ??
                item.duration ??
                `${item.validity_days} days`
            )}
          </div>
        ) : null}
      </button>
    );
  };

  if (!service) {
    return null;
  }

  /*
   * ============================================================
   * PROCESSING STATE
   * ============================================================
   */

  if (processingSession) {
    return (
      <ServiceTransactionProcessing
        amount={
          processingSession.amount
        }
        details={
          processingSession.details
        }
        execute={() =>
          onPurchase(
            processingSession.amount,
            processingSession.details
          )
        }
        onBack={() =>
          setProcessingSession(null)
        }
        onDone={() => {
          setProcessingSession(null);
          resetForm();
        }}
      />
    );
  }

  return (
    <>
      <style>{`
        /*
         * =====================================================
         * IYANJUPAY SERVICE PAYMENT THEME
         * =====================================================
         */

        .iyanjupay-service-page {
          background-color: #f9fafb;
          color: #111827;
          transition:
            background-color 180ms ease,
            color 180ms ease;
        }

        /*
         * -----------------------------------------------------
         * LIGHT / NORMAL
         * -----------------------------------------------------
         */

        html[data-iyanjupay-theme="light"]
          .iyanjupay-service-page,
        html[data-iyanjupay-theme="normal"]
          .iyanjupay-service-page {
          background-color: #f9fafb;
          color: #111827;
        }

        /*
         * -----------------------------------------------------
         * BLUE
         * -----------------------------------------------------
         */

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page {
          background-color: #f4f8ff;
          color: #111827;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .bg-white {
          background-color: #ffffff !important;
          color: #111827 !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .bg-gray-50 {
          background-color: #f8fbff !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .bg-gray-100 {
          background-color: #eaf2ff !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .text-gray-900 {
          color: #111827 !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .text-gray-800 {
          color: #1f2937 !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .text-gray-700 {
          color: #374151 !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .text-gray-600 {
          color: #4b5563 !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .text-gray-500 {
          color: #6b7280 !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .text-gray-400 {
          color: #9ca3af !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .bg-violet-50 {
          background-color: #dbeafe !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .text-purple-600,
        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .text-purple-700 {
          color: #1d4ed8 !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .iyanjupay-service-header {
          background-image: linear-gradient(
            to right,
            #082a63,
            #1554b8,
            #2563eb
          ) !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .iyanjupay-service-primary {
          background-image: linear-gradient(
            to right,
            #082a63,
            #1554b8,
            #2563eb
          ) !important;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-service-page
          .iyanjupay-service-selected {
          border-color: #2563eb !important;
          color: #1d4ed8 !important;
          background-color: #dbeafe !important;
        }

        /*
         * -----------------------------------------------------
         * DARK
         * -----------------------------------------------------
         */

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page {
          background-color: #090d18;
          color: #f8fafc;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .bg-white {
          background-color: #111827 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .bg-gray-50 {
          background-color: #090d18 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .bg-gray-100 {
          background-color: #1e293b !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          [class*="border-gray-200"] {
          border-color: #334155 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          [class*="border-gray-100"] {
          border-color: #334155 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-gray-900 {
          color: #f8fafc !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-gray-800 {
          color: #f1f5f9 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-gray-700 {
          color: #e2e8f0 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-gray-600 {
          color: #cbd5e1 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-gray-500 {
          color: #94a3b8 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-gray-400 {
          color: #64748b !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .bg-violet-50 {
          background-color: #312e81 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .bg-green-50 {
          background-color: #052e2b !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-green-700 {
          color: #86efac !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-green-800 {
          color: #bbf7d0 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .bg-amber-50 {
          background-color: #451a03 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-amber-600 {
          color: #fbbf24 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-amber-800 {
          color: #fde68a !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .bg-red-50 {
          background-color: #450a0a !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-red-600 {
          color: #fca5a5 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-red-700,
        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .text-red-800 {
          color: #fecaca !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .border-red-200 {
          border-color: #7f1d1d !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .border-amber-200 {
          border-color: #92400e !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .border-green-100 {
          border-color: #14532d !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          input,
        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          select {
          background-color: #111827 !important;
          color: #f8fafc !important;
          border-color: #334155 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          input::placeholder {
          color: #64748b !important;
          opacity: 1 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .iyanjupay-service-header {
          background-image: linear-gradient(
            to right,
            #111827,
            #312e81,
            #1e40af
          ) !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .iyanjupay-service-primary {
          background-image: linear-gradient(
            to right,
            #111827,
            #312e81,
            #1e40af
          ) !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .iyanjupay-service-selected {
          border-color: #6366f1 !important;
          color: #c4b5fd !important;
          background-color: #312e81 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page
          .iyanjupay-service-biller-logo {
          background-color: #ffffff !important;
          color: #111827 !important;
          border-color: #475569 !important;
        }

        /*
         * =====================================================
         * PAYMENT PIN SCREEN
         * =====================================================
         *
         * Dedicated selectors make the PIN screen reliable
         * under all three Dashboard themes.
         */

        .iyanjupay-payment-pin-card {
          background-color: #ffffff;
          color: #111827;
          border-color: #e5e7eb;
        }

        .iyanjupay-payment-pin-icon {
          background-color: #ecfdf5;
          color: #15803d;
        }

        .iyanjupay-payment-pin-description {
          color: #6b7280;
        }

        .iyanjupay-payment-pin-input {
          background-color: #ffffff;
          color: #111827;
          border-color: #d1d5db;
        }

        .iyanjupay-payment-pin-input::placeholder {
          color: #9ca3af;
          opacity: 1;
        }

        .iyanjupay-payment-pin-error {
          border-color: #fecaca;
          background-color: #fef2f2;
          color: #b91c1c;
        }

        .iyanjupay-payment-pin-back {
          background-color: #ffffff;
          color: #111827;
          border-color: #d1d5db;
        }

        .iyanjupay-payment-pin-back:hover {
          background-color: #f3f4f6;
        }

        /*
         * BLUE PIN THEME
         */

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-payment-pin-card {
          background-color: #ffffff;
          color: #111827;
          border-color: #dbe5f5;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-payment-pin-icon {
          background-color: #dbeafe;
          color: #1d4ed8;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-payment-pin-description {
          color: #4b5563;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-payment-pin-input {
          background-color: #ffffff;
          color: #111827;
          border-color: #bfdbfe;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-payment-pin-back {
          background-color: #ffffff;
          color: #111827;
          border-color: #cbd5e1;
        }

        html[data-iyanjupay-theme="blue"]
          .iyanjupay-payment-pin-back:hover {
          background-color: #eff6ff;
        }

        /*
         * DARK PIN THEME
         */

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-payment-pin-card {
          background-color: #111827 !important;
          color: #f8fafc !important;
          border-color: #334155 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-payment-pin-icon {
          background-color: #052e2b !important;
          color: #86efac !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-payment-pin-description {
          color: #94a3b8 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-payment-pin-input {
          background-color: #0f172a !important;
          color: #f8fafc !important;
          border-color: #334155 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-payment-pin-input::placeholder {
          color: #64748b !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-payment-pin-error {
          border-color: #7f1d1d !important;
          background-color: #450a0a !important;
          color: #fecaca !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-payment-pin-back {
          background-color: #111827 !important;
          color: #f8fafc !important;
          border-color: #475569 !important;
        }

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-payment-pin-back:hover {
          background-color: #1e293b !important;
        }

        /*
         * Prevent the generic outline/input styling from
         * reintroducing a light PIN background.
         */

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-payment-pin-card
          input {
          background-color: #0f172a !important;
          color: #f8fafc !important;
          border-color: #334155 !important;
        }

        /*
         * =====================================================
         * SERVICE PAGE PROCESSING ROOT
         * =====================================================
         */

        html[data-iyanjupay-theme="dark"]
          .iyanjupay-service-page {
          background-color: #090d18;
        }
      `}</style>

      <div className="iyanjupay-service-page min-h-screen bg-gray-50 text-gray-900">
        <header className="iyanjupay-service-header sticky top-0 z-20 border-b border-violet-900/20 bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] text-white shadow-md">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="Back"
              className="text-white hover:bg-white/15 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className="min-w-0 text-center">
              <h1 className="truncate text-base font-bold sm:text-lg">
                {serviceTitle}
              </h1>

              <p className="text-[10px] text-violet-100 sm:text-xs">
                Secure service purchase
              </p>
            </div>

            {onHistory ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onHistory}
                className="text-white hover:bg-white/15 hover:text-white"
              >
                <History className="mr-1.5 h-4 w-4" />
                History
              </Button>
            ) : (
              <span className="w-9" />
            )}
          </div>
        </header>

        <main className="mx-auto max-w-5xl space-y-3 px-3 py-4 pb-8 sm:px-4">
          {showPin ? (
            /*
             * ==================================================
             * PAYMENT PIN SCREEN
             * ==================================================
             */
            <section className="iyanjupay-payment-pin-card rounded-3xl border p-6 shadow-sm">
              <div className="mx-auto max-w-sm text-center">
                <div className="iyanjupay-payment-pin-icon mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full">
                  <ShieldCheck className="h-7 w-7" />
                </div>

                <h2 className="text-xl font-bold">
                  Confirm payment
                </h2>

                <p className="iyanjupay-payment-pin-description mt-1 text-sm">
                  Enter your 4-digit payment PIN to
                  continue.
                </p>

                <div className="mt-6">
                  <Input
                    autoFocus
                    inputMode="numeric"
                    maxLength={4}
                    type="password"
                    value={paymentPin}
                    onChange={(e) =>
                      setPaymentPin(
                        e.target.value
                          .replace(
                            /\D/g,
                            ""
                          )
                          .slice(
                            0,
                            4
                          )
                      )
                    }
                    onKeyDown={(e) => {
                      if (
                        e.key ===
                        "Enter"
                      ) {
                        void confirmPurchase();
                      }
                    }}
                    placeholder="••••"
                    className="iyanjupay-payment-pin-input h-14 text-center text-2xl tracking-[0.5em]"
                    disabled={
                      verifyingPin
                    }
                    aria-label="Payment PIN"
                  />
                </div>

                {error && (
                  <div className="iyanjupay-payment-pin-error mt-4 rounded-xl border p-3 text-sm">
                    {error}
                  </div>
                )}

                <div className="mt-5 space-y-2">
                  <Button
                    className="iyanjupay-service-primary h-12 w-full bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] font-bold text-white shadow-sm hover:brightness-105"
                    onClick={() =>
                      void confirmPurchase()
                    }
                    disabled={
                      verifyingPin ||
                      paymentPin.length !==
                        4
                    }
                  >
                    {verifyingPin ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying PIN...
                      </>
                    ) : (
                      "Confirm Payment"
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    className="iyanjupay-payment-pin-back h-12 w-full"
                    onClick={() =>
                      setShowPin(false)
                    }
                    disabled={
                      verifyingPin
                    }
                  >
                    Back
                  </Button>
                </div>
              </div>
            </section>
          ) : (
            <>
              {/* Compact service selector — intentionally kept separate from the purchase logic. */}
              <section className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-gray-900">
                      {isAirtime ? "Select network" : isData ? "Select network" : isCable ? "Select service" : isElectricity ? "Select Disco" : serviceType === "education" ? "Select examination" : "Select option"}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Choose an option to continue.
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void loadBillers()}
                    disabled={loadingBillers}
                    className="h-8 w-8 shrink-0 rounded-full"
                    aria-label="Refresh service options"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingBillers ? "animate-spin" : ""}`} />
                  </Button>
                </div>

                {loadingBillers ? (
                  <div className="flex items-center justify-center py-7 text-xs text-gray-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading options...
                  </div>
                ) : billers.length ? (
                  <div className="grid w-full grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
                    {billers.map(renderBillerCard)}
                  </div>
                ) : (
                  <div className="rounded-xl bg-gray-50 p-4 text-center text-xs text-gray-500">
                    No service options available right now.
                  </div>
                )}
              </section>

              {isElectricity && selectedBiller && (
                <section className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
                  <div className="mb-2 text-xs font-bold text-gray-900">Meter type</div>
                  {meterTypes.length ? (
                    <div className="grid grid-cols-2 gap-2">
                      {meterTypes.map((meter: Biller) => {
                        const code = getCode(meter);
                        const name = getName(meter);
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => handleMeterType(code)}
                            className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                              meterType === code
                                ? "border-[#6D28D9] bg-violet-50 text-[#4C1D95] ring-1 ring-[#6D28D9]/20"
                                : "border-gray-200 bg-white text-gray-700 hover:border-violet-300"
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <select
                      value={meterType}
                      onChange={(e) => handleMeterType(e.target.value)}
                      className="h-10 w-full rounded-xl border bg-white px-3 text-xs"
                    >
                      <option value="">Select meter type</option>
                      <option value="PREPAID">Prepaid</option>
                      <option value="POSTPAID">Postpaid</option>
                    </select>
                  )}
                </section>
              )}

              {isPhoneService && (
                <section className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
                  <Label className="text-xs font-bold text-gray-900">{customerLabel}</Label>
                  <Input
                    value={customer}
                    onChange={(e) => {
                      setCustomer(isPhoneService ? e.target.value : e.target.value.replace(/\s+/g, ""));
                      if (isCable || isElectricity) resetVerification();
                    }}
                    placeholder={customerPlaceholder}
                    inputMode="tel"
                    className="mt-2 h-10 rounded-xl text-sm"
                    disabled={!!processingSession}
                  />
                </section>
              )}

              {(isCable || isElectricity) && selectedBillerCode && (
                <section className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="text-xs font-bold text-gray-900">{customerLabel}</Label>
                    {verified && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  </div>
                  <Input
                    value={customer}
                    onChange={(e) => {
                      setCustomer(e.target.value.replace(/\s+/g, ""));
                      resetVerification();
                    }}
                    placeholder={customerPlaceholder}
                    inputMode="numeric"
                    className="h-10 rounded-xl text-sm"
                  />
                  {verifyingIdentifier && (
                    <div className="mt-2 flex items-center gap-2 text-[11px] font-medium text-[#6D28D9]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Verifying details...
                    </div>
                  )}
                  {verified && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate font-semibold">{verifiedName || "Account verified"}</span>
                    </div>
                  )}
                </section>
              )}

              {isData && selectedBillerCode && (
                <section className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
                  <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
                    {DATA_TABS.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setDataTab(tab)}
                        className={`whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                          dataTab === tab
                            ? "bg-[#082A63] text-white shadow-sm"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {tab === "EXTRA_NIGHT" ? "Extra Night" : tab.charAt(0) + tab.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>

                  {loadingItems ? (
                    <div className="flex items-center justify-center py-7 text-xs text-gray-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading data plans...
                    </div>
                  ) : visibleDataPlans.length ? (
                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                      {visibleDataPlans.map(renderDataPlan)}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-gray-50 p-4 text-center text-xs text-gray-500">
                      No plans in this category.
                    </div>
                  )}
                </section>
              )}

              {((isCable && selectedBillerCode) || (isEpin && selectedBillerCode) || (isRechargeCard && selectedBillerCode) || (serviceType === "education" && selectedBillerCode)) && (
                <section className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-xs font-bold text-gray-900">{serviceType === "education" ? "Select product" : "Select package"}</h2>
                      <p className="mt-0.5 text-[11px] text-gray-500">Choose the option you want.</p>
                    </div>
                  </div>

                  {loadingItems ? (
                    <div className="flex items-center justify-center py-7 text-xs text-gray-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading options...
                    </div>
                  ) : items.length ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {items.filter((i) => !isVariable(i)).map(renderPlan)}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-gray-50 p-4 text-center text-xs text-gray-500">
                      No options available.
                    </div>
                  )}
                </section>
              )}

              {canEnterAmount && ((isElectricity && verified) || isAirtime) && (
                <section className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-xs font-bold text-gray-900">Select amount</h2>
                      <p className="mt-0.5 text-[11px] text-gray-500">Choose an amount or enter your own.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-8">
                    {(isAirtime ? AIRTIME_AMOUNTS : BILL_AMOUNTS).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setAmount(String(value));
                          setCustomAmount(false);
                        }}
                        className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition ${
                          amount === String(value) && !customAmount
                            ? "border-[#6D28D9] bg-violet-50 text-[#4C1D95] ring-1 ring-[#6D28D9]/20"
                            : "border-gray-200 bg-white text-gray-700 hover:border-violet-300"
                        }`}
                      >
                        {naira(value)}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        setCustomAmount(true);
                        setAmount("");
                      }}
                      className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition ${
                        customAmount
                          ? "border-[#6D28D9] bg-violet-50 text-[#4C1D95] ring-1 ring-[#6D28D9]/20"
                          : "border-gray-200 bg-white text-gray-700 hover:border-violet-300"
                      }`}
                    >
                      Custom
                    </button>
                  </div>

                  {customAmount && (
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="mt-3 h-10 rounded-xl text-sm"
                    />
                  )}
                </section>
              )}

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              <section className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
                {hasAmount && (
                  <div className="mb-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
                    <span className="text-xs text-gray-500">Amount</span>
                    <span className="text-sm font-extrabold text-[#082A63]">{naira(amount)}</span>
                  </div>
                )}
                <Button
                  className="iyanjupay-service-primary h-11 w-full rounded-xl bg-gradient-to-r from-[#082A63] via-[#1554B8] to-[#2563EB] text-sm font-bold text-white shadow-sm hover:brightness-105"
                  onClick={startPurchase}
                  disabled={!canPurchase}
                >
                  {isAirtime ? "Buy Airtime" : `Continue${hasAmount ? ` to Pay ${naira(amount)}` : ""}`}
                </Button>
                <p className="mt-2 text-center text-[10px] text-gray-500">
                  Your payment PIN is required to complete this purchase.
                </p>
              </section>
            </>
          )}
        </main>
      </div>
    </>
  );
}
