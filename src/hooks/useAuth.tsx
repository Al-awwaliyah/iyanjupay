import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const useAuth = () => {
  const [user, setUser] =
    useState<User | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let mounted = true;

    /*
     * ========================================================
     * INITIAL SESSION
     * ========================================================
     */

    const loadSession = async () => {
      try {
        const {
          data,
          error,
        } =
          await supabase.auth.getSession();

        if (error) {
          console.error(
            "Failed to load Supabase session:",
            error
          );

          if (mounted) {
            setUser(null);
            setLoading(false);
          }

          return;
        }

        if (!mounted) {
          return;
        }

        setUser(
          data.session?.user ?? null
        );

        setLoading(false);
      } catch (error) {
        console.error(
          "Auth session error:",
          error
        );

        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    loadSession();

    /*
     * ========================================================
     * AUTH STATE CHANGES
     * ========================================================
     */

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          session
        ) => {
          if (!mounted) {
            return;
          }

          setUser(
            session?.user ?? null
          );

          setLoading(false);
        }
      );

    /*
     * ========================================================
     * CLEANUP
     * ========================================================
     */

    return () => {
      mounted = false;

      subscription.unsubscribe();
    };
  }, []);

  /*
   * ========================================================
   * SIGN OUT
   * ========================================================
   */

  const signOut = async () => {
    try {
      const {
        error,
      } =
        await supabase.auth.signOut();

      if (error) {
        console.error(
          "Sign out error:",
          error
        );

        throw error;
      }
    } catch (error) {
      console.error(
        "Unable to sign out:",
        error
      );
    }
  };

  return {
    user,
    loading,
    signOut,
  };
};
