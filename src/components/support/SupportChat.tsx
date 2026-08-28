import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  Headphones,
  Loader2,
  Send,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SupportChatProps {
  open: boolean;
  onClose: () => void;
}

interface Conversation {
  id: string;
  user_id: string;
  assigned_admin_id: string | null;
  subject: string | null;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
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

const SupportChat = ({
  open,
  onClose,
}: SupportChatProps) => {
  const { toast } = useToast();

  const [conversation, setConversation] =
    useState<Conversation | null>(null);

  const [messages, setMessages] =
    useState<SupportMessage[]>([]);

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [sending, setSending] =
    useState(false);

  const [starting, setStarting] =
    useState(false);

  const messagesEndRef =
    useRef<HTMLDivElement | null>(null);

  // ============================================================
  // SCROLL
  // ============================================================

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }, 50);
  }, []);

  // ============================================================
  // LOAD MESSAGES
  // ============================================================

  const loadMessages = async (
    conversationId: string
  ) => {
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

    setMessages(
      (data ?? []) as SupportMessage[]
    );

    scrollToBottom();

    const unreadIds =
      (data ?? [])
        .filter(
          (item: any) =>
            item.sender_type === "admin" &&
            !item.read_at
        )
        .map(
          (item: any) => item.id
        );

    if (unreadIds.length > 0) {
      await supabase
        .from("support_messages")
        .update({
          read_at:
            new Date().toISOString(),
        })
        .in("id", unreadIds);
    }
  };

  // ============================================================
  // LOAD OPEN CONVERSATION
  // ============================================================

  const loadConversation =
    useCallback(async () => {
      if (!open) {
        return;
      }

      setLoading(true);

      try {
        const {
          data: userData,
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        const userId =
          userData.user?.id;

        if (!userId) {
          throw new Error(
            "You must be signed in to use support chat."
          );
        }

        const {
          data,
          error,
        } = await supabase
          .from("support_conversations")
          .select("*")
          .eq("user_id", userId)
          .not(
            "status",
            "eq",
            "closed"
          )
          .order("updated_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (error) {
          throw error;
        }

        setConversation(
          data as Conversation | null
        );

        if (data) {
          await loadMessages(data.id);
        } else {
          setMessages([]);
        }
      } catch (error: any) {
        console.error(
          "Failed to load support conversation:",
          error
        );

        toast({
          title: "Support unavailable",
          description:
            error?.message ||
            "Unable to load support chat.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }, [open, toast]);

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  useEffect(() => {
    if (!open) {
      return;
    }

    loadConversation();
  }, [
    open,
    loadConversation,
  ]);

  // ============================================================
  // REALTIME
  // ============================================================

  useEffect(() => {
    if (
      !open ||
      !conversation?.id
    ) {
      return;
    }

    const conversationId =
      conversation.id;

    const channel =
      supabase.channel(
        `support-chat-${conversationId}`
      );

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
        filter:
          `conversation_id=eq.${conversationId}`,
      },
      async (payload) => {
        const incoming =
          payload.new as SupportMessage;

        setMessages((current) => {
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
        });

        scrollToBottom();

        if (
          incoming.sender_type ===
          "admin"
        ) {
          await supabase
            .from("support_messages")
            .update({
              read_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              incoming.id
            );
        }
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "support_conversations",
        filter:
          `id=eq.${conversationId}`,
      },
      (payload) => {
        setConversation(
          payload.new as Conversation
        );
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    open,
    conversation?.id,
    scrollToBottom,
  ]);

  // ============================================================
  // CREATE CONVERSATION
  // ============================================================

  const createConversation =
    async () => {
      if (starting) {
        return;
      }

      setStarting(true);

      try {
        const {
          data: userData,
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        const userId =
          userData.user?.id;

        if (!userId) {
          throw new Error(
            "You must be signed in."
          );
        }

        const {
          data,
          error,
        } = await supabase
          .from(
            "support_conversations"
          )
          .insert({
            user_id: userId,
            subject:
              "Customer Support",
            status: "open",
            priority: "normal",
          })
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        setConversation(
          data as Conversation
        );

        setMessages([]);
      } catch (error: any) {
        console.error(
          "Failed to create support conversation:",
          error
        );

        toast({
          title:
            "Unable to start chat",
          description:
            error?.message ||
            "Please try again.",
          variant: "destructive",
        });
      } finally {
        setStarting(false);
      }
    };

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  const sendMessage =
    async () => {
      const cleanMessage =
        message.trim();

      if (
        !cleanMessage ||
        sending
      ) {
        return;
      }

      let activeConversation =
        conversation;

      try {
        setSending(true);

        if (!activeConversation) {
          await createConversation();

          const {
            data: userData,
          } =
            await supabase.auth.getUser();

          const userId =
            userData.user?.id;

          if (!userId) {
            throw new Error(
              "Authentication required."
            );
          }

          const {
            data,
            error,
          } =
            await supabase
              .from(
                "support_conversations"
              )
              .select("*")
              .eq(
                "user_id",
                userId
              )
              .not(
                "status",
                "eq",
                "closed"
              )
              .order(
                "updated_at",
                {
                  ascending: false,
                }
              )
              .limit(1)
              .single();

          if (error) {
            throw error;
          }

          activeConversation =
            data as Conversation;

          setConversation(
            activeConversation
          );
        }

        const {
          data: userData,
          error: userError,
        } =
          await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        const userId =
          userData.user?.id;

        if (!userId) {
          throw new Error(
            "Authentication required."
          );
        }

        const {
          error,
        } =
          await supabase
            .from("support_messages")
            .insert({
              conversation_id:
                activeConversation.id,
              sender_id:
                userId,
              sender_type:
                "user",
              message:
                cleanMessage,
            });

        if (error) {
          throw error;
        }

        setMessage("");
        scrollToBottom();
      } catch (error: any) {
        console.error(
          "Failed to send support message:",
          error
        );

        toast({
          title: "Message failed",
          description:
            error?.message ||
            "Unable to send your message.",
          variant: "destructive",
        });
      } finally {
        setSending(false);
      }
    };

  // ============================================================
  // KEYBOARD
  // ============================================================

  const handleKeyDown = (
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

  // ============================================================
  // CLOSED
  // ============================================================

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md h-[100dvh] sm:h-[680px] bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">

        {/* HEADER */}

        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-4 flex items-center justify-between">

          <div className="flex items-center gap-3">

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Headphones className="h-5 w-5" />
            </div>

            <div>
              <p className="font-bold">
                IyanjuPay Support
              </p>

              <p className="text-xs text-white/80">
                We are here to help
              </p>
            </div>

          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </Button>

        </div>

        {/* CONTENT */}

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">

          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
            </div>
          ) : !conversation ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">

              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-4">
                <Headphones className="h-7 w-7 text-purple-600" />
              </div>

              <h2 className="text-lg font-bold text-gray-900">
                How can we help?
              </h2>

              <p className="text-sm text-gray-500 mt-2 mb-6">
                Chat with IyanjuPay support for help with your account, transfers, funding, bills, or any other issue.
              </p>

              <Button
                type="button"
                onClick={createConversation}
                disabled={starting}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {starting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  "Start Chat"
                )}
              </Button>

            </div>
          ) : (
            <div className="space-y-3">

              {messages.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">
                    Send a message and our support team will respond.
                  </p>
                </div>
              )}

              {messages.map((item) => {
                const isUser =
                  item.sender_type ===
                  "user";

                return (
                  <div
                    key={item.id}
                    className={`flex ${
                      isUser
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={[
                        "max-w-[82%] rounded-2xl px-4 py-3",
                        isUser
                          ? "bg-purple-600 text-white rounded-br-md"
                          : "bg-white border text-gray-900 rounded-bl-md shadow-sm",
                      ].join(" ")}
                    >

                      {!isUser && (
                        <p className="text-xs font-semibold text-purple-600 mb-1">
                          IyanjuPay Support
                        </p>
                      )}

                      <p className="text-sm whitespace-pre-wrap break-words">
                        {item.message}
                      </p>

                      <p
                        className={`text-[10px] mt-1 ${
                          isUser
                            ? "text-white/70"
                            : "text-gray-400"
                        }`}
                      >
                        {new Date(
                          item.created_at
                        ).toLocaleTimeString(
                          "en-NG",
                          {
                            hour: "2-digit",
                            minute:
                              "2-digit",
                          }
                        )}
                      </p>

                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>
          )}

        </div>

        {/* INPUT */}

        {conversation && (
          <div className="border-t bg-white p-3">

            {conversation.status ===
              "closed" ||
            conversation.status ===
              "resolved" ? (
              <div className="text-center">

                <p className="text-sm text-gray-500 mb-2">
                  This conversation has been closed.
                </p>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setConversation(null);
                    setMessages([]);
                  }}
                >
                  Start New Conversation
                </Button>

              </div>
            ) : (
              <div className="flex items-center gap-2">

                <Input
                  value={message}
                  onChange={(event) =>
                    setMessage(
                      event.target.value
                    )
                  }
                  onKeyDown={
                    handleKeyDown
                  }
                  placeholder="Type your message..."
                  disabled={sending}
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

          </div>
        )}

      </div>
    </div>
  );
};

export default SupportChat;
