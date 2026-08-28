import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Filter,
  Headphones,
  Loader2,
  Mail,
  MapPin,
  CalendarDays,
  MessageCircle,
  MoreVertical,
  Phone,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  User,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// TYPES
// ============================================================

type AdminRole =
  | "super_admin"
  | "operations_admin"
  | "support_admin"
  | "finance_admin"
  | "compliance_admin"
  | "read_only_admin";

type ConversationStatus =
  | "open"
  | "waiting_user"
  | "waiting_admin"
  | "resolved"
  | "closed";

type ConversationPriority =
  | "low"
  | "normal"
  | "high"
  | "urgent";

interface Conversation {
  id: string;
  user_id: string;
  assigned_admin_id: string | null;
  subject: string | null;
  status: ConversationStatus;
  priority: ConversationPriority;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  closed_at: string | null;
}

interface SupportMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: "user" | "admin" | "system";
  message: string;
  created_at: string;
  read_at: string | null;
}

interface SupportAdmin {
  user_id: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

/*
 * IMPORTANT:
 *
 * The RPC get_support_customer_details()
 * returns `user_id`, NOT `id`.
 *
 * Do not change this back to `id`.
 *
 * Raw BVN/NIN values are intentionally NOT
 * returned to the frontend.
 */
interface UserProfile {
  user_id: string;
  full_name: string | null;
  phone_number: string | null;
  nickname: string | null;
  gender: string | null;
  date_of_birth: string | null;
  email: string | null;
  address: string | null;
  kyc_level: number | null;
  kyc_status: string | null;
  bvn_verified: boolean;
  phone_verified: boolean;
  created_at: string | null;
}

interface ConversationWithProfile
  extends Conversation {
  profile?: UserProfile | null;
}

// ============================================================
// CONSTANTS
// ============================================================

const STATUS_OPTIONS: {
  value: ConversationStatus | "all";
  label: string;
}[] = [
  {
    value: "all",
    label: "All Conversations",
  },
  {
    value: "open",
    label: "Open",
  },
  {
    value: "waiting_user",
    label: "Waiting for User",
  },
  {
    value: "waiting_admin",
    label: "Waiting for Admin",
  },
  {
    value: "resolved",
    label: "Resolved",
  },
  {
    value: "closed",
    label: "Closed",
  },
];

const PRIORITY_OPTIONS: {
  value: ConversationPriority | "all";
  label: string;
}[] = [
  {
    value: "all",
    label: "All Priorities",
  },
  {
    value: "urgent",
    label: "Urgent",
  },
  {
    value: "high",
    label: "High",
  },
  {
    value: "normal",
    label: "Normal",
  },
  {
    value: "low",
    label: "Low",
  },
];

const STATUS_LABELS: Record<
  ConversationStatus,
  string
> = {
  open: "Open",
  waiting_admin: "Waiting Admin",
  waiting_user: "Waiting User",
  resolved: "Resolved",
  closed: "Closed",
};

const ROLE_LABELS: Record<
  AdminRole,
  string
> = {
  super_admin: "Super Admin",
  operations_admin: "Operations Admin",
  support_admin: "Support Admin",
  finance_admin: "Finance Admin",
  compliance_admin: "Compliance Admin",
  read_only_admin: "Read Only Admin",
};

// ============================================================
// HELPERS
// ============================================================

const formatTime = (
  value: string
): string => {
  try {
    return new Date(value).toLocaleTimeString(
      "en-NG",
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  } catch {
    return "";
  }
};

const formatDateTime = (
  value: string
): string => {
  try {
    return new Date(value).toLocaleString(
      "en-NG",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    );
  } catch {
    return "";
  }
};

const formatDate = (
  value: string | null
): string => {
  if (!value) {
    return "Not available";
  }

  try {
    return new Date(
      `${value}T00:00:00`
    ).toLocaleDateString("en-NG", {
      dateStyle: "medium",
    });
  } catch {
    return value;
  }
};

const formatRelativeTime = (
  value: string | null
): string => {
  if (!value) {
    return "";
  }

  const timestamp =
    new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const diff =
    Date.now() - timestamp;

  if (diff < 0) {
    return "Just now";
  }

  const minutes = Math.floor(
    diff / 60000
  );

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(
    minutes / 60
  );

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(
    hours / 24
  );

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(
    value
  ).toLocaleDateString("en-NG");
};

const shortId = (
  value: string | null
): string => {
  if (!value) {
    return "Unassigned";
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(
    0,
    8
  )}...${value.slice(-4)}`;
};

const getPriorityClasses = (
  priority: ConversationPriority
): string => {
  switch (priority) {
    case "urgent":
      return "bg-red-100 text-red-700 border-red-200";

    case "high":
      return "bg-orange-100 text-orange-700 border-orange-200";

    case "normal":
      return "bg-blue-100 text-blue-700 border-blue-200";

    case "low":
      return "bg-gray-100 text-gray-600 border-gray-200";

    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
};

const getStatusClasses = (
  status: ConversationStatus
): string => {
  switch (status) {
    case "open":
      return "bg-green-100 text-green-700";

    case "waiting_admin":
      return "bg-orange-100 text-orange-700";

    case "waiting_user":
      return "bg-blue-100 text-blue-700";

    case "resolved":
      return "bg-purple-100 text-purple-700";

    case "closed":
      return "bg-gray-100 text-gray-600";

    default:
      return "bg-gray-100 text-gray-600";
  }
};

// ============================================================
// PROFILE HELPERS
// ============================================================

const getProfileDisplayName = (
  profile: UserProfile | null | undefined,
  fallbackUserId: string
): string => {
  if (!profile) {
    return `User ${shortId(
      fallbackUserId
    )}`;
  }

  if (
    profile.full_name &&
    profile.full_name.trim()
  ) {
    return profile.full_name.trim();
  }

  if (
    profile.nickname &&
    profile.nickname.trim()
  ) {
    return profile.nickname.trim();
  }

  if (
    profile.email &&
    profile.email.trim()
  ) {
    return profile.email.trim();
  }

  if (
    profile.phone_number &&
    profile.phone_number.trim()
  ) {
    return profile.phone_number.trim();
  }

  return `User ${shortId(
    fallbackUserId
  )}`;
};

const getProfileEmail = (
  profile: UserProfile | null | undefined
): string => {
  return (
    profile?.email?.trim() ||
    "Email not available"
  );
};

const getProfilePhone = (
  profile: UserProfile | null | undefined
): string => {
  return (
    profile?.phone_number?.trim() ||
    "Phone not available"
  );
};

const getProfileInitials = (
  profile: UserProfile | null | undefined,
  fallbackUserId: string
): string => {
  const name =
    getProfileDisplayName(
      profile,
      fallbackUserId
    );

  const parts = name
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return "U";
};

// ============================================================
// COMPONENT
// ============================================================

const AdminSupportPage = () => {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const { toast } = useToast();

  // ==========================================================
  // ADMIN
  // ==========================================================

  const [adminRecord, setAdminRecord] =
    useState<SupportAdmin | null>(null);

  const [admins, setAdmins] =
    useState<SupportAdmin[]>([]);

  const [adminLoading, setAdminLoading] =
    useState(true);

  const [accessDenied, setAccessDenied] =
    useState(false);

  // ==========================================================
  // CONVERSATIONS
  // ==========================================================

  const [
    conversations,
    setConversations,
  ] = useState<
    ConversationWithProfile[]
  >([]);

  const [
    conversationsLoading,
    setConversationsLoading,
  ] = useState(true);

  const [
    selectedConversationId,
    setSelectedConversationId,
  ] = useState<string | null>(null);

  const selectedConversation =
    useMemo(
      () =>
        conversations.find(
          (conversation) =>
            conversation.id ===
            selectedConversationId
        ) ?? null,
      [
        conversations,
        selectedConversationId,
      ]
    );

  // ==========================================================
  // MESSAGES
  // ==========================================================

  const [messages, setMessages] =
    useState<SupportMessage[]>([]);

  const [
    messagesLoading,
    setMessagesLoading,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const [sending, setSending] =
    useState(false);

  const messagesEndRef =
    useRef<HTMLDivElement | null>(
      null
    );

  // ==========================================================
  // FILTERS
  // ==========================================================

  const [search, setSearch] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<
    ConversationStatus | "all"
  >("all");

  const [
    priorityFilter,
    setPriorityFilter,
  ] = useState<
    ConversationPriority | "all"
  >("all");

  const [
    assignedFilter,
    setAssignedFilter,
  ] = useState<
    "all" | "mine" | "unassigned"
  >("all");

  const [showFilters, setShowFilters] =
    useState(false);

  // ==========================================================
  // UI
  // ==========================================================

  const [
    mobileConversationOpen,
    setMobileConversationOpen,
  ] = useState(false);

  const [
    updatingConversation,
    setUpdatingConversation,
  ] = useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  // ==========================================================
  // SCROLL
  // ==========================================================

  const scrollToBottom =
    useCallback(() => {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView(
          {
            behavior: "smooth",
          }
        );
      }, 50);
    }, []);

  // ==========================================================
  // CHECK ADMIN ACCESS
  // ==========================================================

  const checkAdminAccess =
    useCallback(async () => {
      if (!user?.id) {
        setAdminLoading(false);
        return;
      }

      setAdminLoading(true);
      setAccessDenied(false);

      try {
        const {
          data,
          error,
        } = await supabase
          .from("support_admins")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          setAdminRecord(null);
          setAccessDenied(true);
          return;
        }

        setAdminRecord(
          data as SupportAdmin
        );
      } catch (error: any) {
        console.error(
          "Admin access check failed:",
          error
        );

        setAdminRecord(null);
        setAccessDenied(true);

        toast({
          title: "Access denied",
          description:
            error?.message ||
            "Unable to verify your administrator access.",
          variant: "destructive",
        });
      } finally {
        setAdminLoading(false);
      }
    }, [user?.id, toast]);

  // ==========================================================
  // LOAD ADMINS
  // ==========================================================

  const loadAdmins =
    useCallback(async () => {
      if (!adminRecord) {
        return;
      }

      try {
        const {
          data,
          error,
        } = await supabase
          .from("support_admins")
          .select("*")
          .eq("is_active", true)
          .order("created_at", {
            ascending: true,
          });

        if (error) {
          throw error;
        }

        setAdmins(
          (data ?? []) as SupportAdmin[]
        );
      } catch (error) {
        console.error(
          "Failed to load support admins:",
          error
        );
      }
    }, [adminRecord]);

  // ==========================================================
  // LOAD USER PROFILES THROUGH SECURE RPC
  // ==========================================================

  const loadProfilesForConversations =
    useCallback(
      async (
        rows: Conversation[]
      ): Promise<Map<string, UserProfile>> => {
        const profileMap =
          new Map<string, UserProfile>();

        const userIds = Array.from(
          new Set(
            rows
              .map(
                (conversation) =>
                  conversation.user_id
              )
              .filter(Boolean)
          )
        );

        if (userIds.length === 0) {
          return profileMap;
        }

        try {
          const {
            data,
            error,
          } = await supabase.rpc(
            "get_support_customer_details",
            {
              p_user_ids: userIds,
            }
          );

          if (error) {
            console.error(
              "Failed to load support customer details:",
              error
            );

            return profileMap;
          }

          const profiles =
            (data ?? []) as UserProfile[];

          /*
           * IMPORTANT:
           *
           * The SQL RPC returns:
           *
           *   user_id
           *
           * NOT:
           *
           *   id
           *
           * Therefore the map MUST use
           * profile.user_id.
           */
          profiles.forEach(
            (profile) => {
              if (profile.user_id) {
                profileMap.set(
                  profile.user_id,
                  profile
                );
              }
            }
          );

        } catch (error) {
          console.error(
            "Support customer details loading failed:",
            error
          );
        }

        return profileMap;
      },
      []
    );

  // ==========================================================
  // ATTACH PROFILES
  // ==========================================================

  const attachProfiles =
    useCallback(
      async (
        rows: Conversation[]
      ): Promise<
        ConversationWithProfile[]
      > => {
        const profileMap =
          await loadProfilesForConversations(
            rows
          );

        return rows.map(
          (conversation) => ({
            ...conversation,

            profile:
              profileMap.get(
                conversation.user_id
              ) ?? null,
          })
        );
      },
      [loadProfilesForConversations]
    );

  // ==========================================================
  // LOAD CONVERSATIONS
  // ==========================================================

  const loadConversations =
    useCallback(
      async (silent = false) => {
        if (!adminRecord) {
          return;
        }

        if (!silent) {
          setConversationsLoading(true);
        }

        try {
          const {
            data,
            error,
          } = await supabase
            .from(
              "support_conversations"
            )
            .select("*")
            .order("updated_at", {
              ascending: false,
            });

          if (error) {
            throw error;
          }

          const rows =
            (data ?? []) as Conversation[];

          const withProfiles =
            await attachProfiles(rows);

          setConversations(
            withProfiles
          );

          setSelectedConversationId(
            (current) => {
              if (
                current &&
                rows.some(
                  (item) =>
                    item.id === current
                )
              ) {
                return current;
              }

              return (
                rows[0]?.id ?? null
              );
            }
          );
        } catch (error: any) {
          console.error(
            "Failed to load conversations:",
            error
          );

          toast({
            title:
              "Unable to load support inbox",
            description:
              error?.message ||
              "Please try again.",
            variant: "destructive",
          });
        } finally {
          if (!silent) {
            setConversationsLoading(
              false
            );
          }
        }
      },
      [
        adminRecord,
        attachProfiles,
        toast,
      ]
    );

  // ==========================================================
  // LOAD SINGLE CUSTOMER PROFILE THROUGH SECURE RPC
  // ==========================================================

  const loadSingleProfile =
    useCallback(
      async (
        userId: string
      ): Promise<UserProfile | null> => {
        if (!userId) {
          return null;
        }

        try {
          const {
            data,
            error,
          } = await supabase.rpc(
            "get_support_customer_details",
            {
              p_user_ids: [userId],
            }
          );

          if (error) {
            console.error(
              "Failed to load support customer profile:",
              error
            );

            return null;
          }

          const profile =
            (data?.[0] as
              | UserProfile
              | undefined) ?? null;

          return profile;
        } catch (error) {
          console.error(
            "Single support customer profile error:",
            error
          );

          return null;
        }
      },
      []
    );

  // ==========================================================
  // LOAD MESSAGES
  // ==========================================================

  const loadMessages =
    useCallback(
      async (
        conversationId: string
      ) => {
        setMessagesLoading(true);

        try {
          const {
            data,
            error,
          } = await supabase
            .from("support_messages")
            .select("*")
            .eq(
              "conversation_id",
              conversationId
            )
            .order("created_at", {
              ascending: true,
            });

          if (error) {
            throw error;
          }

          const loaded =
            (data ??
              []) as SupportMessage[];

          setMessages(loaded);

          scrollToBottom();

          const unreadUserMessageIds =
            loaded
              .filter(
                (item) =>
                  item.sender_type ===
                    "user" &&
                  !item.read_at
              )
              .map(
                (item) => item.id
              );

          if (
            unreadUserMessageIds.length >
            0
          ) {
            const readAt =
              new Date().toISOString();

            const {
              error:
                markReadError,
            } = await supabase
              .from(
                "support_messages"
              )
              .update({
                read_at: readAt,
              })
              .in(
                "id",
                unreadUserMessageIds
              );

            if (markReadError) {
              console.error(
                "Failed to mark messages read:",
                markReadError
              );
            } else {
              setMessages(
                (current) =>
                  current.map(
                    (item) =>
                      unreadUserMessageIds.includes(
                        item.id
                      )
                        ? {
                            ...item,
                            read_at:
                              readAt,
                          }
                        : item
                  )
              );
            }
          }
        } catch (error: any) {
          console.error(
            "Failed to load messages:",
            error
          );

          toast({
            title:
              "Unable to load messages",
            description:
              error?.message ||
              "Please try again.",
            variant: "destructive",
          });
        } finally {
          setMessagesLoading(false);
        }
      },
      [scrollToBottom, toast]
    );

  // ==========================================================
  // AUTH / ADMIN ACCESS
  // ==========================================================

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      window.location.replace("/");
      return;
    }

    checkAdminAccess();
  }, [
    authLoading,
    user,
    checkAdminAccess,
  ]);

  // ==========================================================
  // LOAD DATA AFTER ADMIN VERIFIED
  // ==========================================================

  useEffect(() => {
    if (!adminRecord) {
      return;
    }

    loadAdmins();
    loadConversations();
  }, [
    adminRecord,
    loadAdmins,
    loadConversations,
  ]);

  // ==========================================================
  // LOAD SELECTED CONVERSATION MESSAGES
  // ==========================================================

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    loadMessages(
      selectedConversationId
    );
  }, [
    selectedConversationId,
    loadMessages,
  ]);

  // ==========================================================
  // REALTIME — CONVERSATIONS
  // ==========================================================

  useEffect(() => {
    if (!adminRecord) {
      return;
    }

    const channel =
      supabase.channel(
        "admin-support-conversations"
      );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "support_conversations",
      },
      async (payload) => {
        if (
          payload.eventType ===
          "INSERT"
        ) {
          const incoming =
            payload.new as Conversation;

          const withProfiles =
            await attachProfiles([
              incoming,
            ]);

          const conversation =
            withProfiles[0];

          if (!conversation) {
            return;
          }

          setConversations(
            (current) => {
              if (
                current.some(
                  (item) =>
                    item.id ===
                    incoming.id
                )
              ) {
                return current;
              }

              return [
                conversation,
                ...current,
              ].sort(
                (a, b) =>
                  new Date(
                    b.updated_at
                  ).getTime() -
                  new Date(
                    a.updated_at
                  ).getTime()
              );
            }
          );

          return;
        }

        if (
          payload.eventType ===
          "UPDATE"
        ) {
          const incoming =
            payload.new as Conversation;

          const withProfiles =
            await attachProfiles([
              incoming,
            ]);

          const conversation =
            withProfiles[0];

          if (!conversation) {
            return;
          }

          setConversations(
            (current) =>
              current
                .map((item) =>
                  item.id ===
                  incoming.id
                    ? {
                        ...conversation,
                        profile:
                          conversation.profile ??
                          item.profile ??
                          null,
                      }
                    : item
                )
                .sort(
                  (a, b) =>
                    new Date(
                      b.updated_at
                    ).getTime() -
                    new Date(
                      a.updated_at
                    ).getTime()
                )
          );

          return;
        }

        if (
          payload.eventType ===
          "DELETE"
        ) {
          const deleted =
            payload.old as Conversation;

          setConversations(
            (current) =>
              current.filter(
                (item) =>
                  item.id !==
                  deleted.id
              )
          );

          if (
            selectedConversationId ===
            deleted.id
          ) {
            setSelectedConversationId(
              null
            );
            setMessages([]);
          }
        }
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    adminRecord,
    selectedConversationId,
    attachProfiles,
  ]);

  // ==========================================================
  // REALTIME — MESSAGES
  // ==========================================================

  useEffect(() => {
    if (!adminRecord) {
      return;
    }

    const channel =
      supabase.channel(
        "admin-support-messages"
      );

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
      },
      async (payload) => {
        const incoming =
          payload.new as SupportMessage;

        setConversations(
          (current) =>
            current
              .map((conversation) =>
                conversation.id ===
                incoming.conversation_id
                  ? {
                      ...conversation,
                      updated_at:
                        incoming.created_at,
                      last_message_at:
                        incoming.created_at,
                    }
                  : conversation
              )
              .sort(
                (a, b) =>
                  new Date(
                    b.updated_at
                  ).getTime() -
                  new Date(
                    a.updated_at
                  ).getTime()
              )
        );

        if (
          incoming.conversation_id !==
          selectedConversationId
        ) {
          return;
        }

        setMessages(
          (current) => {
            if (
              current.some(
                (item) =>
                  item.id ===
                  incoming.id
              )
            ) {
              return current;
            }

            return [
              ...current,
              incoming,
            ];
          }
        );

        scrollToBottom();

        if (
          incoming.sender_type ===
            "user" &&
          !incoming.read_at
        ) {
          const readAt =
            new Date().toISOString();

          await supabase
            .from("support_messages")
            .update({
              read_at: readAt,
            })
            .eq(
              "id",
              incoming.id
            );

          setMessages(
            (current) =>
              current.map(
                (item) =>
                  item.id ===
                  incoming.id
                    ? {
                        ...item,
                        read_at:
                          readAt,
                      }
                    : item
              )
          );
        }
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    adminRecord,
    selectedConversationId,
    scrollToBottom,
  ]);

  // ==========================================================
  // FILTERED CONVERSATIONS
  // ==========================================================

  const filteredConversations =
    useMemo(() => {
      const normalizedSearch =
        search.trim().toLowerCase();

      return conversations.filter(
        (conversation) => {
          if (
            statusFilter !== "all" &&
            conversation.status !==
              statusFilter
          ) {
            return false;
          }

          if (
            priorityFilter !== "all" &&
            conversation.priority !==
              priorityFilter
          ) {
            return false;
          }

          if (
            assignedFilter === "mine" &&
            conversation.assigned_admin_id !==
              user?.id
          ) {
            return false;
          }

          if (
            assignedFilter ===
              "unassigned" &&
            conversation.assigned_admin_id
          ) {
            return false;
          }

          if (!normalizedSearch) {
            return true;
          }

          const profile =
            conversation.profile;

          const searchable = [
            conversation.subject,
            conversation.user_id,
            conversation.id,
            conversation.status,
            conversation.priority,

            profile?.full_name,
            profile?.nickname,
            profile?.email,
            profile?.phone_number,
            profile?.address,
            profile?.gender,
            profile?.kyc_status,
            profile?.kyc_level,
          ]
            .filter(
              (value) =>
                value !== null &&
                value !== undefined &&
                String(value).trim() !== ""
            )
            .join(" ")
            .toLowerCase();

          return searchable.includes(
            normalizedSearch
          );
        }
      );
    }, [
      conversations,
      search,
      statusFilter,
      priorityFilter,
      assignedFilter,
      user?.id,
    ]);

  // ==========================================================
  // COUNTS
  // ==========================================================

  const counts = useMemo(() => {
    const open =
      conversations.filter(
        (item) =>
          item.status === "open"
      ).length;

    const waitingAdmin =
      conversations.filter(
        (item) =>
          item.status ===
          "waiting_admin"
      ).length;

    const urgent =
      conversations.filter(
        (item) =>
          item.priority ===
            "urgent" &&
          item.status !==
            "closed"
      ).length;

    const assignedToMe =
      conversations.filter(
        (item) =>
          item.assigned_admin_id ===
            user?.id &&
          item.status !== "closed"
      ).length;

    return {
      total: conversations.length,
      open,
      waitingAdmin,
      urgent,
      assignedToMe,
    };
  }, [
    conversations,
    user?.id,
  ]);

  // ==========================================================
  // SELECT CONVERSATION
  // ==========================================================

  const selectConversation = (
    conversationId: string
  ) => {
    setSelectedConversationId(
      conversationId
    );

    setMobileConversationOpen(
      true
    );
  };

  // ==========================================================
  // UPDATE CONVERSATION
  // ==========================================================

  const updateConversation =
    async (
      updates: Partial<
        Pick<
          Conversation,
          | "status"
          | "priority"
          | "assigned_admin_id"
        >
      >
    ) => {
      if (
        !selectedConversation ||
        updatingConversation
      ) {
        return;
      }

      setUpdatingConversation(true);

      try {
        const nextUpdates: Record<
          string,
          unknown
        > = {
          ...updates,
        };

        if (
          updates.status ===
          "closed"
        ) {
          nextUpdates.closed_at =
            new Date().toISOString();
        } else if (
          updates.status &&
          updates.status !==
            "closed"
        ) {
          nextUpdates.closed_at =
            null;
        }

        const {
          data,
          error,
        } = await supabase
          .from(
            "support_conversations"
          )
          .update(nextUpdates)
          .eq(
            "id",
            selectedConversation.id
          )
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        const updatedConversation =
          data as Conversation;

        const profile =
          selectedConversation.profile ??
          (await loadSingleProfile(
            updatedConversation.user_id
          ));

        setConversations(
          (current) =>
            current
              .map((item) =>
                item.id ===
                selectedConversation.id
                  ? {
                      ...updatedConversation,
                      profile,
                    }
                  : item
              )
              .sort(
                (a, b) =>
                  new Date(
                    b.updated_at
                  ).getTime() -
                  new Date(
                    a.updated_at
                  ).getTime()
              )
        );

        toast({
          title:
            "Conversation updated",
          description:
            "The support conversation has been updated.",
        });
      } catch (error: any) {
        console.error(
          "Conversation update failed:",
          error
        );

        toast({
          title: "Update failed",
          description:
            error?.message ||
            "Unable to update conversation.",
          variant: "destructive",
        });
      } finally {
        setUpdatingConversation(
          false
        );
      }
    };

  // ==========================================================
  // ASSIGN TO CURRENT ADMIN
  // ==========================================================

  const assignToMe =
    async () => {
      if (!user?.id) {
        return;
      }

      await updateConversation({
        assigned_admin_id:
          user.id,
      });
    };

  // ==========================================================
  // SEND MESSAGE
  // ==========================================================

  const sendMessage =
    async () => {
      const cleanMessage =
        message.trim();

      if (
        !cleanMessage ||
        sending ||
        !selectedConversation ||
        !user?.id
      ) {
        return;
      }

      if (
        selectedConversation.status ===
        "closed"
      ) {
        toast({
          title:
            "Conversation closed",
          description:
            "This conversation is closed and cannot receive new messages.",
          variant: "destructive",
        });

        return;
      }

      setSending(true);

      try {
        const {
          error,
        } = await supabase
          .from("support_messages")
          .insert({
            conversation_id:
              selectedConversation.id,
            sender_id:
              user.id,
            sender_type:
              "admin",
            message:
              cleanMessage,
          });

        if (error) {
          throw error;
        }

        setMessage("");

        const {
          error:
            statusError,
        } = await supabase
          .from(
            "support_conversations"
          )
          .update({
            status:
              "waiting_user",
          })
          .eq(
            "id",
            selectedConversation.id
          )
          .neq(
            "status",
            "closed"
          );

        if (statusError) {
          console.error(
            "Failed to update conversation status:",
            statusError
          );
        }

        scrollToBottom();
      } catch (error: any) {
        console.error(
          "Failed to send admin message:",
          error
        );

        toast({
          title:
            "Message failed",
          description:
            error?.message ||
            "Unable to send your reply.",
          variant: "destructive",
        });
      } finally {
        setSending(false);
      }
    };

  // ==========================================================
  // KEYBOARD
  // ==========================================================

  const handleKeyDown =
    (
      event: React.KeyboardEvent<HTMLInputElement>
    ) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        sendMessage();
      }
    };

  // ==========================================================
  // REFRESH
  // ==========================================================

  const refreshAll =
    async () => {
      if (!adminRecord) {
        return;
      }

      setRefreshing(true);

      try {
        await Promise.all([
          loadAdmins(),
          loadConversations(true),
        ]);

        if (
          selectedConversationId
        ) {
          await loadMessages(
            selectedConversationId
          );
        }
      } finally {
        setRefreshing(false);
      }
    };

  // ==========================================================
  // AUTH LOADING
  // ==========================================================

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-purple-600 mx-auto" />

          <p className="mt-3 text-sm text-gray-500">
            Checking administrator access...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // ADMIN LOADING
  // ==========================================================

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-purple-600 mx-auto" />

          <p className="mt-3 text-sm text-gray-500">
            Verifying administrator account...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // ACCESS DENIED
  // ==========================================================

  if (
    accessDenied ||
    !adminRecord
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-purple-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>

          <h1 className="text-xl font-bold text-gray-900">
            Access Denied
          </h1>

          <p className="text-sm text-gray-500 mt-2">
            Your account does not have
            active administrator access
            to the IyanjuPay support
            dashboard.
          </p>

          <Button
            className="mt-6 bg-purple-600 hover:bg-purple-700"
            onClick={() =>
              window.location.replace(
                "/"
              )
            }
          >
            Return to IyanjuPay
          </Button>
        </div>
      </div>
    );
  }

  // ==========================================================
  // SELECTED CUSTOMER
  // ==========================================================

  const selectedProfile =
    selectedConversation?.profile ??
    null;

  const selectedCustomerName =
    selectedConversation
      ? getProfileDisplayName(
          selectedProfile,
          selectedConversation.user_id
        )
      : "Customer";

  const selectedCustomerEmail =
    getProfileEmail(
      selectedProfile
    );

  const selectedCustomerPhone =
    getProfilePhone(
      selectedProfile
    );

  // ==========================================================
  // DASHBOARD
  // ==========================================================

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md shrink-0">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Headphones className="h-5 w-5" />
              </div>

              <div>
                <h1 className="font-bold text-lg">
                  IyanjuPay Admin
                </h1>

                <p className="text-xs text-white/75">
                  Support Center
                </p>
              </div>

            </div>

            <div className="flex items-center gap-2">

              <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10">
                <Shield className="h-4 w-4" />

                <span className="text-sm">
                  {
                    ROLE_LABELS[
                      adminRecord.role
                    ]
                  }
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={refreshAll}
                disabled={refreshing}
                className="text-white hover:bg-white/20"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    refreshing
                      ? "animate-spin"
                      : ""
                  }`}
                />
              </Button>

            </div>
          </div>
        </div>
      </header>

      {/* ======================================================
          STATISTICS
      ====================================================== */}

      <div className="bg-white border-b px-4 sm:px-6 py-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">

          <div className="rounded-xl border bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">
              Total
            </p>

            <p className="text-xl font-bold text-gray-900">
              {counts.total}
            </p>
          </div>

          <div className="rounded-xl border bg-green-50 px-4 py-3">
            <p className="text-xs text-green-600">
              Open
            </p>

            <p className="text-xl font-bold text-green-700">
              {counts.open}
            </p>
          </div>

          <div className="rounded-xl border bg-orange-50 px-4 py-3">
            <p className="text-xs text-orange-600">
              Waiting Admin
            </p>

            <p className="text-xl font-bold text-orange-700">
              {counts.waitingAdmin}
            </p>
          </div>

          <div className="rounded-xl border bg-red-50 px-4 py-3">
            <p className="text-xs text-red-600">
              Urgent
            </p>

            <p className="text-xl font-bold text-red-700">
              {counts.urgent}
            </p>
          </div>

          <div className="rounded-xl border bg-purple-50 px-4 py-3">
            <p className="text-xs text-purple-600">
              Assigned To Me
            </p>

            <p className="text-xl font-bold text-purple-700">
              {counts.assignedToMe}
            </p>
          </div>

        </div>
      </div>

      {/* ======================================================
          MAIN
      ====================================================== */}

      <main className="flex-1 min-h-0 flex overflow-hidden">

        {/* ====================================================
            CONVERSATION LIST
        ==================================================== */}

        <section
          className={`
            w-full lg:w-[390px]
            bg-white border-r
            flex flex-col
            ${
              mobileConversationOpen
                ? "hidden lg:flex"
                : "flex"
            }
          `}
        >

          {/* SEARCH */}

          <div className="p-4 border-b">

            <div className="relative">

              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

              <Input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search by name, email, phone, ID..."
                className="pl-9 pr-9"
              />

              {search && (
                <button
                  type="button"
                  onClick={() =>
                    setSearch("")
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

            </div>

            <div className="flex items-center justify-between mt-3">

              <p className="text-sm font-semibold text-gray-800">
                Support Inbox
              </p>

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setShowFilters(
                    (value) => !value
                  )
                }
                className="text-gray-600"
              >
                <Filter className="h-4 w-4 mr-1" />
                Filters
              </Button>

            </div>

            {showFilters && (
              <div className="mt-3 space-y-2">

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target
                        .value as
                        | ConversationStatus
                        | "all"
                    )
                  }
                  className="w-full h-10 rounded-md border bg-white px-3 text-sm"
                >
                  {STATUS_OPTIONS.map(
                    (option) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {option.label}
                      </option>
                    )
                  )}
                </select>

                <select
                  value={priorityFilter}
                  onChange={(event) =>
                    setPriorityFilter(
                      event.target
                        .value as
                        | ConversationPriority
                        | "all"
                    )
                  }
                  className="w-full h-10 rounded-md border bg-white px-3 text-sm"
                >
                  {PRIORITY_OPTIONS.map(
                    (option) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {option.label}
                      </option>
                    )
                  )}
                </select>

                <select
                  value={assignedFilter}
                  onChange={(event) =>
                    setAssignedFilter(
                      event.target
                        .value as
                        | "all"
                        | "mine"
                        | "unassigned"
                    )
                  }
                  className="w-full h-10 rounded-md border bg-white px-3 text-sm"
                >
                  <option value="all">
                    All Assignments
                  </option>

                  <option value="mine">
                    Assigned To Me
                  </option>

                  <option value="unassigned">
                    Unassigned
                  </option>
                </select>

              </div>
            )}
          </div>

          {/* LIST */}

          <div className="flex-1 overflow-y-auto">

            {conversationsLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
              </div>
            ) : filteredConversations.length ===
              0 ? (
              <div className="h-full flex flex-col items-center justify-center px-6 text-center">

                <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center mb-4">
                  <MessageCircle className="h-6 w-6 text-purple-600" />
                </div>

                <h3 className="font-semibold text-gray-900">
                  No conversations
                </h3>

                <p className="text-sm text-gray-500 mt-1">
                  There are no support
                  conversations matching
                  your filters.
                </p>

              </div>
            ) : (
              filteredConversations.map(
                (conversation) => {
                  const selected =
                    conversation.id ===
                    selectedConversationId;

                  const profile =
                    conversation.profile;

                  const customerName =
                    getProfileDisplayName(
                      profile,
                      conversation.user_id
                    );

                  const customerEmail =
                    getProfileEmail(
                      profile
                    );

                  const customerPhone =
                    getProfilePhone(
                      profile
                    );

                  const initials =
                    getProfileInitials(
                      profile,
                      conversation.user_id
                    );

                  return (
                    <button
                      type="button"
                      key={
                        conversation.id
                      }
                      onClick={() =>
                        selectConversation(
                          conversation.id
                        )
                      }
                      className={`
                        w-full text-left
                        px-4 py-4
                        border-b
                        transition
                        ${
                          selected
                            ? "bg-purple-50 border-l-4 border-l-purple-600"
                            : "hover:bg-gray-50 border-l-4 border-l-transparent"
                        }
                      `}
                    >

                      <div className="flex items-start gap-3">

                        <div
                          className={`
                            w-10 h-10 rounded-full
                            flex items-center justify-center
                            shrink-0
                            text-xs font-bold
                            ${
                              selected
                                ? "bg-purple-600 text-white"
                                : "bg-purple-100 text-purple-700"
                            }
                          `}
                        >
                          {initials}
                        </div>

                        <div className="flex-1 min-w-0">

                          <div className="flex items-start justify-between gap-2">

                            <div className="min-w-0">

                              <p className="font-semibold text-sm text-gray-900 truncate">
                                {
                                  customerName
                                }
                              </p>

                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {
                                  customerEmail
                                }
                              </p>

                              <p className="text-xs text-gray-500 truncate">
                                {
                                  customerPhone
                                }
                              </p>

                            </div>

                            <span className="text-[10px] text-gray-400 whitespace-nowrap">
                              {formatRelativeTime(
                                conversation.last_message_at ||
                                  conversation.updated_at
                              )}
                            </span>

                          </div>

                          <p className="text-xs text-gray-500 truncate mt-2">
                            {conversation.subject ||
                              "Customer Support"}
                          </p>

                          <div className="flex items-center gap-2 mt-2 flex-wrap">

                            <span
                              className={`text-[10px] px-2 py-1 rounded-full ${getStatusClasses(
                                conversation.status
                              )}`}
                            >
                              {
                                STATUS_LABELS[
                                  conversation.status
                                ]
                              }
                            </span>

                            <span
                              className={`text-[10px] px-2 py-1 rounded-full border ${getPriorityClasses(
                                conversation.priority
                              )}`}
                            >
                              {
                                conversation.priority
                              }
                            </span>

                            {!conversation.assigned_admin_id && (
                              <span className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-500">
                                Unassigned
                              </span>
                            )}

                          </div>
                        </div>
                      </div>
                    </button>
                  );
                }
              )
            )}
          </div>
        </section>

        {/* ====================================================
            CONVERSATION PANEL
        ==================================================== */}

        <section
          className={`
            flex-1
            min-w-0
            flex flex-col
            bg-gray-50
            ${
              mobileConversationOpen
                ? "flex"
                : "hidden lg:flex"
            }
          `}
        >

          {!selectedConversation ? (

            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">

              <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center mb-5">
                <MessageCircle className="h-9 w-9 text-purple-600" />
              </div>

              <h2 className="text-xl font-bold text-gray-900">
                Support Inbox
              </h2>

              <p className="text-sm text-gray-500 mt-2 max-w-md">
                Select a conversation
                from the inbox to view
                the customer details,
                messages and respond
                in realtime.
              </p>

            </div>

          ) : (

            <>

              {/* ==================================================
                  CUSTOMER HEADER
              ================================================== */}

              <div className="bg-white border-b">

                <div className="px-4 sm:px-6 py-4">

                  <div className="flex items-center justify-between gap-3">

                    <div className="flex items-center gap-3 min-w-0">

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setMobileConversationOpen(
                            false
                          )
                        }
                        className="lg:hidden shrink-0"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </Button>

                      <div className="w-11 h-11 rounded-full bg-purple-100 flex items-center justify-center shrink-0 text-purple-700 font-bold">
                        {getProfileInitials(
                          selectedProfile,
                          selectedConversation.user_id
                        )}
                      </div>

                      <div className="min-w-0">

                        <h2 className="font-bold text-gray-900 truncate">
                          {
                            selectedCustomerName
                          }
                        </h2>

                        <p className="text-xs text-gray-500 truncate">
                          {
                            selectedCustomerEmail
                          }
                        </p>

                        <p className="text-xs text-gray-500 truncate">
                          {
                            selectedCustomerPhone
                          }
                        </p>

                      </div>
                    </div>

                    <div className="flex items-center gap-2">

                      <span
                        className={`hidden sm:inline-flex text-xs px-2.5 py-1 rounded-full ${getStatusClasses(
                          selectedConversation.status
                        )}`}
                      >
                        {
                          STATUS_LABELS[
                            selectedConversation.status
                          ]
                        }
                      </span>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-gray-500"
                      >
                        <MoreVertical className="h-5 w-5" />
                      </Button>

                    </div>
                  </div>

                  {/* =================================================
                      CUSTOMER INFORMATION
                  ================================================= */}

                  <div className="mt-4 rounded-xl border bg-gray-50 p-4">

                    <div className="flex items-center gap-2 mb-3">

                      <User className="h-4 w-4 text-purple-600" />

                      <p className="text-sm font-bold text-gray-900">
                        Customer Information
                      </p>

                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

                      {/* NAME */}

                      <div className="rounded-lg bg-white border p-3">

                        <p className="text-[10px] uppercase tracking-wide text-gray-400">
                          Full Name
                        </p>

                        <p className="text-sm font-semibold text-gray-900 mt-1 break-words">
                          {
                            selectedCustomerName
                          }
                        </p>

                      </div>

                      {/* EMAIL */}

                      <div className="rounded-lg bg-white border p-3">

                        <div className="flex items-center gap-1.5">

                          <Mail className="h-3.5 w-3.5 text-gray-400" />

                          <p className="text-[10px] uppercase tracking-wide text-gray-400">
                            Email
                          </p>

                        </div>

                        <p className="text-sm font-medium text-gray-900 mt-1 break-all">
                          {
                            selectedCustomerEmail
                          }
                        </p>

                      </div>

                      {/* PHONE */}

                      <div className="rounded-lg bg-white border p-3">

                        <div className="flex items-center gap-1.5">

                          <Phone className="h-3.5 w-3.5 text-gray-400" />

                          <p className="text-[10px] uppercase tracking-wide text-gray-400">
                            Phone
                          </p>

                        </div>

                        <p className="text-sm font-medium text-gray-900 mt-1">
                          {
                            selectedCustomerPhone
                          }
                        </p>

                      </div>

                      {/* NICKNAME */}

                      <div className="rounded-lg bg-white border p-3">

                        <p className="text-[10px] uppercase tracking-wide text-gray-400">
                          Nickname
                        </p>

                        <p className="text-sm font-medium text-gray-900 mt-1">
                          {
                            selectedProfile?.nickname ||
                            "Not available"
                          }
                        </p>

                      </div>

                      {/* GENDER */}

                      <div className="rounded-lg bg-white border p-3">

                        <p className="text-[10px] uppercase tracking-wide text-gray-400">
                          Gender
                        </p>

                        <p className="text-sm font-medium text-gray-900 mt-1 capitalize">
                          {
                            selectedProfile?.gender ||
                            "Not available"
                          }
                        </p>

                      </div>

                      {/* DATE OF BIRTH */}

                      <div className="rounded-lg bg-white border p-3">

                        <div className="flex items-center gap-1.5">

                          <CalendarDays className="h-3.5 w-3.5 text-gray-400" />

                          <p className="text-[10px] uppercase tracking-wide text-gray-400">
                            Date of Birth
                          </p>

                        </div>

                        <p className="text-sm font-medium text-gray-900 mt-1">
                          {formatDate(
                            selectedProfile?.date_of_birth ??
                              null
                          )}
                        </p>

                      </div>

                      {/* ADDRESS */}

                      <div className="rounded-lg bg-white border p-3 sm:col-span-2">

                        <div className="flex items-center gap-1.5">

                          <MapPin className="h-3.5 w-3.5 text-gray-400" />

                          <p className="text-[10px] uppercase tracking-wide text-gray-400">
                            Address
                          </p>

                        </div>

                        <p className="text-sm font-medium text-gray-900 mt-1 break-words">
                          {
                            selectedProfile?.address ||
                            "Address not available"
                          }
                        </p>

                      </div>

                      {/* KYC */}

                      <div className="rounded-lg bg-white border p-3">

                        <div className="flex items-center gap-1.5">

                          <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />

                          <p className="text-[10px] uppercase tracking-wide text-gray-400">
                            KYC
                          </p>

                        </div>

                        <div className="mt-1 flex items-center gap-2">

                          <span className="text-sm font-semibold text-gray-900">
                            Level{" "}
                            {selectedProfile?.kyc_level ??
                              1}
                          </span>

                          <span
                            className={`text-[10px] px-2 py-1 rounded-full ${
                              selectedProfile?.kyc_status ===
                              "verified"
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {
                              selectedProfile?.kyc_status ||
                              "unverified"
                            }
                          </span>

                        </div>
                      </div>

                      {/* BVN */}

                      <div className="rounded-lg bg-white border p-3">

                        <p className="text-[10px] uppercase tracking-wide text-gray-400">
                          BVN Verification
                        </p>

                        <span
                          className={`inline-flex mt-1 text-[10px] px-2 py-1 rounded-full ${
                            selectedProfile?.bvn_verified
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {selectedProfile?.bvn_verified
                            ? "Verified"
                            : "Not verified"}
                        </span>

                      </div>

                      {/* NIN */}

                      <div className="rounded-lg bg-white border p-3">

                        <p className="text-[10px] uppercase tracking-wide text-gray-400">
                          NIN
                        </p>

                        <p className="text-sm font-medium text-gray-500 mt-1">
                          Protected
                        </p>

                      </div>

                      {/* PHONE VERIFICATION */}

                      <div className="rounded-lg bg-white border p-3">

                        <p className="text-[10px] uppercase tracking-wide text-gray-400">
                          Phone Verification
                        </p>

                        <span
                          className={`inline-flex mt-1 text-[10px] px-2 py-1 rounded-full ${
                            selectedProfile?.phone_verified
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {selectedProfile?.phone_verified
                            ? "Verified"
                            : "Not verified"}
                        </span>

                      </div>

                    </div>

                    {/* USER ID */}

                    <div className="mt-3 pt-3 border-t">

                      <p className="text-[10px] uppercase tracking-wide text-gray-400">
                        User ID
                      </p>

                      <p className="text-xs font-mono text-gray-500 mt-1 break-all">
                        {
                          selectedConversation.user_id
                        }
                      </p>

                    </div>

                  </div>

                  {/* =================================================
                      ADMIN CONTROLS
                  ================================================= */}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">

                    {/* STATUS */}

                    <div>
                      <label className="text-[11px] font-medium text-gray-500 block mb-1">
                        Status
                      </label>

                      <select
                        value={
                          selectedConversation.status
                        }
                        disabled={
                          updatingConversation
                        }
                        onChange={(event) =>
                          updateConversation({
                            status:
                              event.target
                                .value as ConversationStatus,
                          })
                        }
                        className="w-full h-9 rounded-md border bg-white px-2.5 text-sm"
                      >
                        {STATUS_OPTIONS.filter(
                          (option) =>
                            option.value !==
                            "all"
                        ).map(
                          (option) => (
                            <option
                              key={
                                option.value
                              }
                              value={
                                option.value
                              }
                            >
                              {
                                option.label
                              }
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {/* PRIORITY */}

                    <div>
                      <label className="text-[11px] font-medium text-gray-500 block mb-1">
                        Priority
                      </label>

                      <select
                        value={
                          selectedConversation.priority
                        }
                        disabled={
                          updatingConversation
                        }
                        onChange={(event) =>
                          updateConversation({
                            priority:
                              event.target
                                .value as ConversationPriority,
                          })
                        }
                        className="w-full h-9 rounded-md border bg-white px-2.5 text-sm"
                      >
                        {PRIORITY_OPTIONS.filter(
                          (option) =>
                            option.value !==
                            "all"
                        ).map(
                          (option) => (
                            <option
                              key={
                                option.value
                              }
                              value={
                                option.value
                              }
                            >
                              {
                                option.label
                              }
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {/* ASSIGNMENT */}

                    <div>
                      <label className="text-[11px] font-medium text-gray-500 block mb-1">
                        Assigned Admin
                      </label>

                      <select
                        value={
                          selectedConversation.assigned_admin_id ||
                          ""
                        }
                        disabled={
                          updatingConversation
                        }
                        onChange={(event) =>
                          updateConversation({
                            assigned_admin_id:
                              event.target
                                .value ||
                              null,
                          })
                        }
                        className="w-full h-9 rounded-md border bg-white px-2.5 text-sm"
                      >
                        <option value="">
                          Unassigned
                        </option>

                        {admins.map(
                          (admin) => (
                            <option
                              key={
                                admin.user_id
                              }
                              value={
                                admin.user_id
                              }
                            >
                              {shortId(
                                admin.user_id
                              )}{" "}
                              —{" "}
                              {
                                ROLE_LABELS[
                                  admin.role
                                ]
                              }
                            </option>
                          )
                        )}
                      </select>
                    </div>

                  </div>

                  {/* QUICK ACTIONS */}

                  <div className="flex flex-wrap gap-2 mt-3">

                    {selectedConversation.assigned_admin_id !==
                      user.id && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={
                          assignToMe
                        }
                        disabled={
                          updatingConversation
                        }
                      >
                        <User className="h-3.5 w-3.5 mr-1.5" />
                        Assign to Me
                      </Button>
                    )}

                    {selectedConversation.status !==
                      "resolved" &&
                      selectedConversation.status !==
                        "closed" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateConversation(
                              {
                                status:
                                  "resolved",
                              }
                            )
                          }
                          disabled={
                            updatingConversation
                          }
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                          Resolve
                        </Button>
                      )}

                    {selectedConversation.status !==
                      "closed" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateConversation(
                            {
                              status:
                                "closed",
                            }
                          )
                        }
                        disabled={
                          updatingConversation
                        }
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        Close
                      </Button>
                    )}

                  </div>

                </div>
              </div>

              {/* ==================================================
                  MESSAGES
              ================================================== */}

              <div className="flex-1 overflow-y-auto p-4 sm:p-6">

                {messagesLoading ? (

                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                  </div>

                ) : messages.length ===
                  0 ? (

                  <div className="h-full flex flex-col items-center justify-center text-center">

                    <MessageCircle className="h-10 w-10 text-gray-300 mb-3" />

                    <p className="text-sm text-gray-500">
                      No messages yet.
                    </p>

                  </div>

                ) : (

                  <div className="max-w-4xl mx-auto space-y-4">

                    {messages.map(
                      (item) => {
                        const isAdmin =
                          item.sender_type ===
                          "admin";

                        const isSystem =
                          item.sender_type ===
                          "system";

                        return (
                          <div
                            key={
                              item.id
                            }
                            className={`flex ${
                              isAdmin
                                ? "justify-end"
                                : "justify-start"
                            }`}
                          >

                            <div
                              className={`
                                max-w-[85%] sm:max-w-[70%]
                                rounded-2xl
                                px-4 py-3
                                ${
                                  isSystem
                                    ? "bg-gray-200 text-gray-700"
                                    : isAdmin
                                    ? "bg-purple-600 text-white rounded-br-md"
                                    : "bg-white border text-gray-900 shadow-sm rounded-bl-md"
                                }
                              `}
                            >

                              {!isAdmin &&
                                !isSystem && (
                                  <p className="text-xs font-semibold text-purple-600 mb-1">
                                    {
                                      selectedCustomerName
                                    }
                                  </p>
                                )}

                              {isAdmin && (
                                <p className="text-xs font-semibold text-white/75 mb-1">
                                  {
                                    user.id ===
                                    item.sender_id
                                      ? "You"
                                      : "Support Admin"
                                  }
                                </p>
                              )}

                              {isSystem && (
                                <p className="text-xs font-semibold text-gray-500 mb-1">
                                  System
                                </p>
                              )}

                              <p className="text-sm whitespace-pre-wrap break-words">
                                {
                                  item.message
                                }
                              </p>

                              <div
                                className={`
                                  flex items-center gap-2
                                  text-[10px]
                                  mt-2
                                  ${
                                    isAdmin
                                      ? "text-white/65"
                                      : "text-gray-400"
                                  }
                                `}
                              >

                                <span>
                                  {formatTime(
                                    item.created_at
                                  )}
                                </span>

                                {isAdmin &&
                                  item.read_at && (
                                    <span>
                                      Read
                                    </span>
                                  )}

                              </div>

                            </div>
                          </div>
                        );
                      }
                    )}

                    <div
                      ref={
                        messagesEndRef
                      }
                    />

                  </div>
                )}
              </div>

              {/* ==================================================
                  COMPOSER
              ================================================== */}

              <div className="bg-white border-t p-3 sm:p-4">

                <div className="max-w-4xl mx-auto">

                  {selectedConversation.status ===
                    "closed" ? (

                    <div className="rounded-xl bg-gray-100 border p-4 text-center">

                      <div className="flex items-center justify-center gap-2 text-gray-600">

                        <Clock3 className="h-4 w-4" />

                        <p className="text-sm font-medium">
                          This conversation
                          is closed.
                        </p>

                      </div>

                    </div>

                  ) : (

                    <div className="flex items-center gap-2">

                      <Input
                        value={
                          message
                        }
                        onChange={(
                          event
                        ) =>
                          setMessage(
                            event
                              .target
                              .value
                          )
                        }
                        onKeyDown={
                          handleKeyDown
                        }
                        disabled={
                          sending
                        }
                        placeholder="Type your reply to the customer..."
                        className="flex-1"
                      />

                      <Button
                        type="button"
                        size="icon"
                        onClick={
                          sendMessage
                        }
                        disabled={
                          sending ||
                          !message.trim()
                        }
                        className="bg-purple-600 hover:bg-purple-700 shrink-0"
                      >
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>

                    </div>
                  )}

                  <div className="flex items-center justify-between mt-2 px-1">

                    <p className="text-[10px] text-gray-400">
                      Conversation ID:{" "}
                      {shortId(
                        selectedConversation.id
                      )}
                    </p>

                    <p className="text-[10px] text-gray-400">
                      Created{" "}
                      {formatDateTime(
                        selectedConversation.created_at
                      )}
                    </p>

                  </div>

                </div>
              </div>

            </>
          )}
        </section>
      </main>
    </div>
  );
};

export default AdminSupportPage;
