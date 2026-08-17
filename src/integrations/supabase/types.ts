export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
          request_hash: string | null
          response: Json | null
          scope: string
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          key: string
          request_hash?: string | null
          response?: Json | null
          scope: string
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          key?: string
          request_hash?: string | null
          response?: Json | null
          scope?: string
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          account_type: string
          code: string
          created_at: string
          currency: string
          id: string
          name: string
          purpose: string
          user_id: string | null
          wallet_id: string | null
        }
        Insert: {
          account_type: string
          code: string
          created_at?: string
          currency?: string
          id?: string
          name: string
          purpose: string
          user_id?: string | null
          wallet_id?: string | null
        }
        Update: {
          account_type?: string
          code?: string
          created_at?: string
          currency?: string
          id?: string
          name?: string
          purpose?: string
          user_id?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          created_at: string
          currency: string
          direction: string
          entry_type: string
          id: string
          ledger_account_id: string
          transaction_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          direction: string
          entry_type: string
          id?: string
          ledger_account_id: string
          transaction_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          direction?: string
          entry_type?: string
          id?: string
          ledger_account_id?: string
          transaction_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          bvn: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          id: string
          kyc_level: number | null
          nickname: string | null
          nin: string | null
          phone_number: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          bvn?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          kyc_level?: number | null
          nickname?: string | null
          nin?: string | null
          phone_number?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          bvn?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          kyc_level?: number | null
          nickname?: string | null
          nin?: string | null
          phone_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      transaction_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          transaction_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          transaction_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          transaction_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string | null
          completed_at: string | null
          created_at: string | null
          currency: string
          description: string | null
          hold_transaction_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          provider: string | null
          provider_reference: string | null
          reference_number: string
          reversal_of: string | null
          reversed_at: string | null
          status: string
          transaction_type: string
          updated_at: string | null
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          currency?: string
          description?: string | null
          hold_transaction_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          provider?: string | null
          provider_reference?: string | null
          reference_number: string
          reversal_of?: string | null
          reversed_at?: string | null
          status?: string
          transaction_type: string
          updated_at?: string | null
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          currency?: string
          description?: string | null
          hold_transaction_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          provider?: string | null
          provider_reference?: string | null
          reference_number?: string
          reversal_of?: string | null
          reversed_at?: string | null
          status?: string
          transaction_type?: string
          updated_at?: string | null
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_hold_transaction_id_fkey"
            columns: ["hold_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_accounts: {
        Row: {
          account_name: string | null
          account_number: string
          bank_name: string
          created_at: string
          id: string
          is_permanent: boolean
          order_reference: string | null
          provider: string
          provider_reference: string | null
          status: string
          updated_at: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          account_name?: string | null
          account_number: string
          bank_name: string
          created_at?: string
          id?: string
          is_permanent?: boolean
          order_reference?: string | null
          provider?: string
          provider_reference?: string | null
          status?: string
          updated_at?: string
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string
          bank_name?: string
          created_at?: string
          id?: string
          is_permanent?: boolean
          order_reference?: string | null
          provider?: string
          provider_reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "virtual_accounts_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string | null
          currency: string
          held_balance: number
          id: string
          status: string
          updated_at: string | null
          user_id: string
          virtual_account_number: string | null
        }
        Insert: {
          balance?: number
          created_at?: string | null
          currency?: string
          held_balance?: number
          id?: string
          status?: string
          updated_at?: string | null
          user_id: string
          virtual_account_number?: string | null
        }
        Update: {
          balance?: number
          created_at?: string | null
          currency?: string
          held_balance?: number
          id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
          virtual_account_number?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      charge_fee: {
        Args: {
          _amount: number
          _description?: string
          _idempotency_key?: string
          _reference?: string
          _user_id: string
        }
        Returns: {
          amount: number
          category: string | null
          completed_at: string | null
          created_at: string | null
          currency: string
          description: string | null
          hold_transaction_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          provider: string | null
          provider_reference: string | null
          reference_number: string
          reversal_of: string | null
          reversed_at: string | null
          status: string
          transaction_type: string
          updated_at: string | null
          user_id: string
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      credit_wallet: {
        Args: {
          p_amount: number
          p_description?: string
          p_provider?: string
          p_provider_reference?: string
          p_reference_number: string
          p_wallet_id: string
        }
        Returns: Json
      }
      debit_wallet: {
        Args: {
          _amount: number
          _category?: string
          _description?: string
          _idempotency_key?: string
          _metadata?: Json
          _reference?: string
          _user_id: string
        }
        Returns: {
          amount: number
          category: string | null
          completed_at: string | null
          created_at: string | null
          currency: string
          description: string | null
          hold_transaction_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          provider: string | null
          provider_reference: string | null
          reference_number: string
          reversal_of: string | null
          reversed_at: string | null
          status: string
          transaction_type: string
          updated_at: string | null
          user_id: string
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_wallet: {
        Args: { _user_id: string }
        Returns: {
          balance: number
          created_at: string | null
          currency: string
          held_balance: number
          id: string
          status: string
          updated_at: string | null
          user_id: string
          virtual_account_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "wallets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      hold_funds: {
        Args: {
          _amount: number
          _description?: string
          _idempotency_key?: string
          _metadata?: Json
          _reference?: string
          _user_id: string
        }
        Returns: {
          amount: number
          category: string | null
          completed_at: string | null
          created_at: string | null
          currency: string
          description: string | null
          hold_transaction_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          provider: string | null
          provider_reference: string | null
          reference_number: string
          reversal_of: string | null
          reversed_at: string | null
          status: string
          transaction_type: string
          updated_at: string | null
          user_id: string
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_entry_pair: {
        Args: {
          _amount: number
          _credit_account: string
          _debit_account: string
          _entry_type: string
          _txn_id: string
          _user_id: string
        }
        Returns: undefined
      }
      refund_wallet: {
        Args: {
          _amount: number
          _description?: string
          _idempotency_key?: string
          _metadata?: Json
          _reference?: string
          _user_id: string
        }
        Returns: {
          amount: number
          category: string | null
          completed_at: string | null
          created_at: string | null
          currency: string
          description: string | null
          hold_transaction_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          provider: string | null
          provider_reference: string | null
          reference_number: string
          reversal_of: string | null
          reversed_at: string | null
          status: string
          transaction_type: string
          updated_at: string | null
          user_id: string
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_funds: {
        Args: {
          _amount: number
          _description?: string
          _hold_transaction_id: string
          _idempotency_key?: string
          _user_id: string
        }
        Returns: {
          amount: number
          category: string | null
          completed_at: string | null
          created_at: string | null
          currency: string
          description: string | null
          hold_transaction_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          provider: string | null
          provider_reference: string | null
          reference_number: string
          reversal_of: string | null
          reversed_at: string | null
          status: string
          transaction_type: string
          updated_at: string | null
          user_id: string
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_transaction: {
        Args: {
          _idempotency_key?: string
          _reason?: string
          _transaction_id: string
        }
        Returns: {
          amount: number
          category: string | null
          completed_at: string | null
          created_at: string | null
          currency: string
          description: string | null
          hold_transaction_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          provider: string | null
          provider_reference: string | null
          reference_number: string
          reversal_of: string | null
          reversed_at: string | null
          status: string
          transaction_type: string
          updated_at: string | null
          user_id: string
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_money: {
        Args: {
          p_amount: number
          p_description?: string
          p_idempotency_key?: string
          p_recipient_user_id: string
          p_reference?: string
          p_sender_user_id: string
        }
        Returns: Json
      }
      sync_wallet_balances: { Args: { _wallet_id: string }; Returns: undefined }
      wallet_operation: {
        Args: {
          _amount: number
          _category?: string
          _description?: string
          _hold_transaction_id?: string
          _idempotency_key?: string
          _metadata?: Json
          _operation: string
          _provider?: string
          _provider_reference?: string
          _reference?: string
          _user_id: string
        }
        Returns: {
          amount: number
          category: string | null
          completed_at: string | null
          created_at: string | null
          currency: string
          description: string | null
          hold_transaction_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          provider: string | null
          provider_reference: string | null
          reference_number: string
          reversal_of: string | null
          reversed_at: string | null
          status: string
          transaction_type: string
          updated_at: string | null
          user_id: string
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
