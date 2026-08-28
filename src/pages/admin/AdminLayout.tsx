import React, {
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Activity,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Scale,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

import { useLocation, useNavigate } from "react-router-dom";

type AdminRole =
  | "super_admin"
  | "operations_admin"
  | "support_admin"
  | "finance_admin"
  | "compliance_admin"
  | "read_only_admin";

interface SupportAdmin {
  user_id: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

interface AdminLayoutProps {
  children: ReactNode;
}

interface NavigationItem {
  label: string;
  path: string;
  icon: React.ComponentType<{
    className?: string;
  }>;
  roles?: AdminRole[];
  badge?: string;
}

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  operations_admin: "Operations Admin",
  support_admin: "Support Admin",
  finance_admin: "Finance Admin",
  compliance_admin: "Compliance Admin",
  read_only_admin: "Read Only Admin",
};

const ALL_ROLES: AdminRole[] = [
  "super_admin",
  "operations_admin",
  "support_admin",
  "finance_admin",
  "compliance_admin",
  "read_only_admin",
];

const Navigation = ({
  adminRole,
}: {
  adminRole: AdminRole;
}) => {
  const items: NavigationItem[] = [
    {
      label: "Dashboard",
      path: "/admin",
      icon: LayoutDashboard,
      roles: ALL_ROLES,
    },
    {
      label: "Customers",
      path: "/admin/customers",
      icon: Users,
      roles: ALL_ROLES,
    },
    {
      label: "Transactions",
      path: "/admin/transactions",
      icon: Activity,
      roles: [
        "super_admin",
        "operations_admin",
        "finance_admin",
        "read_only_admin",
      ],
    },
    {
      label: "Support",
      path: "/admin/support",
      icon: Headphones,
      roles: ALL_ROLES,
    },
    {
      label: "Disputes",
      path: "/admin/disputes",
      icon: Scale,
      roles: [
        "super_admin",
        "operations_admin",
        "finance_admin",
        "compliance_admin",
        "read_only_admin",
      ],
    },
    {
      label: "Reconciliation",
      path: "/admin/reconciliation",
      icon: ClipboardList,
      roles: [
        "super_admin",
        "finance_admin",
        "read_only_admin",
      ],
      badge: "Soon",
    },
    {
      label: "Analytics",
      path: "/admin/analytics",
      icon: BarChart3,
      roles: [
        "super_admin",
        "operations_admin",
        "finance_admin",
        "read_only_admin",
      ],
      badge: "Soon",
    },
    {
      label: "Notifications",
      path: "/admin/notifications",
      icon: Bell,
      roles: ALL_ROLES,
      badge: "Soon",
    },
    {
      label: "Audit Logs",
      path: "/admin/audit-logs",
      icon: FileText,
      roles: [
        "super_admin",
        "compliance_admin",
        "read_only_admin",
      ],
      badge: "Soon",
    },
    {
      label: "Admin Management",
      path: "/admin/admins",
      icon: ShieldCheck,
      roles: ["super_admin"],
      badge: "Soon",
    },
    {
      label: "Settings",
      path: "/admin/settings",
      icon: Settings,
      roles: ["super_admin"],
      badge: "Soon",
    },
  ];

  return items.filter(
    (item) =>
      !item.roles ||
      item.roles.includes(adminRole)
  );
};

const AdminLayout = ({
  children,
}: AdminLayoutProps) => {
  const {
    user,
    loading: authLoading,
    signOut,
  } = useAuth();

  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [adminRecord, setAdminRecord] =
    useState<SupportAdmin | null>(null);

  const [checkingAccess, setCheckingAccess] =
    useState(true);

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  const [collapsed, setCollapsed] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const checkAdminAccess =
    useCallback(async () => {
      if (!user?.id) {
        setCheckingAccess(false);
        return;
      }

      setCheckingAccess(true);

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

          toast({
            title: "Access denied",
            description:
              "You do not have active administrator access.",
            variant: "destructive",
          });

          navigate("/", {
            replace: true,
          });

          return;
        }

        setAdminRecord(
          data as SupportAdmin
        );
      } catch (error: any) {
        console.error(
          "Admin access verification failed:",
          error
        );

        setAdminRecord(null);

        toast({
          title: "Access denied",
          description:
            error?.message ||
            "Unable to verify administrator access.",
          variant: "destructive",
        });

        navigate("/", {
          replace: true,
        });
      } finally {
        setCheckingAccess(false);
      }
    }, [
      user?.id,
      navigate,
      toast,
    ]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      navigate("/", {
        replace: true,
      });

      return;
    }

    checkAdminAccess();
  }, [
    authLoading,
    user,
    checkAdminAccess,
    navigate,
  ]);

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      await signOut();

      navigate("/", {
        replace: true,
      });
    } catch (error: any) {
      console.error(
        "Admin logout failed:",
        error
      );

      toast({
        title: "Logout failed",
        description:
          error?.message ||
          "Unable to log out.",
        variant: "destructive",
      });
    } finally {
      setLoggingOut(false);
    }
  };

  const navigation =
    adminRecord
      ? Navigation({
          adminRole:
            adminRecord.role,
        })
      : [];

  const isActive = (
    path: string
  ) => {
    if (path === "/admin") {
      return location.pathname === "/admin";
    }

    return (
      location.pathname === path ||
      location.pathname.startsWith(
        `${path}/`
      )
    );
  };

  if (
    authLoading ||
    checkingAccess ||
    !adminRecord
  ) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto">
            <Shield className="h-7 w-7 text-purple-600" />
          </div>

          <div className="mt-4 flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-purple-600" />

            <p className="text-sm text-gray-500">
              Verifying administrator access...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ======================================================
          MOBILE OVERLAY
      ====================================================== */}

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() =>
            setMobileMenuOpen(false)
          }
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
        />
      )}

      {/* ======================================================
          SIDEBAR
      ====================================================== */}

      <aside
        className={`
          fixed lg:sticky
          top-0 left-0
          z-50
          h-screen
          bg-white
          border-r
          flex flex-col
          transition-all duration-200
          ${
            collapsed
              ? "lg:w-[76px]"
              : "lg:w-[260px]"
          }
          w-[280px]
          ${
            mobileMenuOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0"
          }
        `}
      >
        {/* BRAND */}

        <div className="h-16 border-b flex items-center justify-between px-4 shrink-0">
          <button
            type="button"
            onClick={() =>
              navigate("/admin")
            }
            className="flex items-center gap-3 min-w-0"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-white" />
            </div>

            {!collapsed && (
              <div className="text-left min-w-0">
                <p className="font-bold text-gray-900 truncate">
                  IyanjuPay
                </p>

                <p className="text-[11px] text-gray-400 truncate">
                  Admin Console
                </p>
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              setMobileMenuOpen(false)
            }
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* ADMIN PROFILE */}

        <div
          className={`
            border-b
            p-3
            ${
              collapsed
                ? "flex justify-center"
                : ""
            }
          `}
        >
          <div
            className={`
              rounded-xl
              bg-purple-50
              border
              border-purple-100
              p-3
              ${
                collapsed
                  ? "w-12 h-12 p-0 flex items-center justify-center"
                  : ""
              }
            `}
          >
            {collapsed ? (
              <div className="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
                A
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  A
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    Administrator
                  </p>

                  <p className="text-[11px] text-purple-600 truncate">
                    {
                      ROLE_LABELS[
                        adminRecord.role
                      ]
                    }
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* NAVIGATION */}

        <nav className="flex-1 overflow-y-auto p-3">
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Administration
            </p>
          )}

          <div className="space-y-1">
            {navigation.map(
              (item) => {
                const Icon =
                  item.icon;

                const active =
                  isActive(
                    item.path
                  );

                return (
                  <button
                    type="button"
                    key={
                      item.path
                    }
                    onClick={() => {
                      navigate(
                        item.path
                      );

                      setMobileMenuOpen(
                        false
                      );
                    }}
                    title={
                      collapsed
                        ? item.label
                        : undefined
                    }
                    className={`
                      w-full
                      flex
                      items-center
                      gap-3
                      rounded-xl
                      px-3
                      py-2.5
                      text-sm
                      transition
                      ${
                        collapsed
                          ? "justify-center"
                          : ""
                      }
                      ${
                        active
                          ? "bg-purple-100 text-purple-700 font-semibold"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }
                    `}
                  >
                    <Icon className="h-4 w-4 shrink-0" />

                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">
                          {
                            item.label
                          }
                        </span>

                        {item.badge && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">
                            {
                              item.badge
                            }
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              }
            )}
          </div>
        </nav>

        {/* SIDEBAR BOTTOM */}

        <div className="border-t p-3 space-y-1">
          <button
            type="button"
            onClick={() =>
              setCollapsed(
                (value) =>
                  !value
              )
            }
            className="hidden lg:flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-100"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4 mx-auto" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                Collapse menu
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className={`
              w-full
              flex
              items-center
              gap-3
              px-3
              py-2.5
              rounded-xl
              text-sm
              text-red-600
              hover:bg-red-50
              ${
                collapsed
                  ? "justify-center"
                  : ""
              }
            `}
          >
            {loggingOut ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}

            {!collapsed && (
              <span>
                {loggingOut
                  ? "Logging out..."
                  : "Logout"}
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* ======================================================
          MAIN AREA
      ====================================================== */}

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* TOP BAR */}

        <header className="h-16 bg-white border-b flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() =>
                setMobileMenuOpen(
                  true
                )
              }
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div>
              <h1 className="font-bold text-gray-900">
                {location.pathname ===
                "/admin"
                  ? "Admin Dashboard"
                  : navigation.find(
                      (item) =>
                        isActive(
                          item.path
                        )
                    )?.label ||
                    "Administration"}
              </h1>

              <p className="hidden sm:block text-xs text-gray-400">
                IyanjuPay Administration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="relative w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center"
              onClick={() =>
                navigate(
                  "/admin/notifications"
                )
              }
            >
              <Bell className="h-5 w-5 text-gray-500" />
            </button>

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l">
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">
                A
              </div>

              <div className="max-w-[160px]">
                <p className="text-xs font-semibold text-gray-800 truncate">
                  Administrator
                </p>

                <p className="text-[10px] text-gray-400 truncate">
                  {
                    ROLE_LABELS[
                      adminRecord.role
                    ]
                  }
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT */}

        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
