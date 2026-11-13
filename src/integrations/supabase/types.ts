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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: number
          new_values: Json | null
          old_values: Json | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name_en: string
          name_ur: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name_en: string
          name_ur: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name_en?: string
          name_ur?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      parties: {
        Row: {
          address: string | null
          monthly_salary: number
          updated_by: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["party_kind"]
          name: string
          opening_balance: number
          party_type: string | null
          phone: string | null
          season_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          monthly_salary?: number
          updated_by?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["party_kind"]
          name: string
          opening_balance?: number
          party_type?: string | null
          phone?: string | null
          season_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          monthly_salary?: number
          updated_by?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["party_kind"]
          name?: string
          opening_balance?: number
          party_type?: string | null
          phone?: string | null
          season_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parties_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      party_rates: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          effective_from: string
          id: string
          kind: Database["public"]["Enums"]["rate_kind"]
          party_id: string
          rate_per_1000: number
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          effective_from: string
          id?: string
          kind: Database["public"]["Enums"]["rate_kind"]
          party_id: string
          rate_per_1000: number
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          effective_from?: string
          id?: string
          kind?: Database["public"]["Enums"]["rate_kind"]
          party_id?: string
          rate_per_1000?: number
        }
        Relationships: [
          {
            foreignKeyName: "party_rates_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_rates_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "party_ledger"
            referencedColumns: ["party_id"]
          },
        ]
      }
      production_entries: {
        Row: {
          confirmed_at: string | null
          confirmed_count: number | null
          created_at: string
          created_by: string
          deleted_at: string | null
          entry_date: string
          estimated_count: number
          id: string
          notes: string | null
          party_id: string
          season_id: string
          updated_at: string
          updated_by: string | null
          week_id: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_count?: number | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          entry_date: string
          estimated_count?: number
          id?: string
          notes?: string | null
          party_id: string
          season_id: string
          updated_at?: string
          updated_by?: string | null
          week_id: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_count?: number | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          entry_date?: string
          estimated_count?: number
          id?: string
          notes?: string | null
          party_id?: string
          season_id?: string
          updated_at?: string
          updated_by?: string | null
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_entries_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "party_ledger"
            referencedColumns: ["party_id"]
          },
          {
            foreignKeyName: "production_entries_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      qualities: {
        Row: {
          category: Database["public"]["Enums"]["quality_category"]
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["quality_kind"]
          name_en: string
          name_ur: string
          sort_order: number
          stock_quality_id: string | null
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["quality_category"]
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["quality_kind"]
          name_en: string
          name_ur: string
          sort_order?: number
          stock_quality_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["quality_category"]
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["quality_kind"]
          name_en?: string
          name_ur?: string
          sort_order?: number
          stock_quality_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          end_date: string
          id: string
          is_closed: boolean
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          end_date: string
          id?: string
          is_closed?: boolean
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          is_closed?: boolean
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          deleted_at: string | null
          direction: Database["public"]["Enums"]["txn_direction"]
          entry_date: string
          handler_user_id: string
          id: string
          kind: Database["public"]["Enums"]["txn_kind"]
          method: Database["public"]["Enums"]["pay_method"]
          note: string | null
          party_id: string | null
          receipt_url: string | null
          season_id: string | null
          expense_category_id: string | null
          sale_id: string | null
          to_user_id: string | null
          updated_by: string | null
          updated_at: string
          week_id: string | null
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          direction: Database["public"]["Enums"]["txn_direction"]
          entry_date: string
          handler_user_id: string
          id?: string
          kind: Database["public"]["Enums"]["txn_kind"]
          method?: Database["public"]["Enums"]["pay_method"]
          note?: string | null
          party_id?: string | null
          receipt_url?: string | null
          season_id?: string | null
          expense_category_id?: string | null
          sale_id?: string | null
          to_user_id?: string | null
          updated_by?: string | null
          updated_at?: string
          week_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["txn_direction"]
          entry_date?: string
          handler_user_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["txn_kind"]
          method?: Database["public"]["Enums"]["pay_method"]
          note?: string | null
          party_id?: string | null
          receipt_url?: string | null
          season_id?: string | null
          expense_category_id?: string | null
          sale_id?: string | null
          to_user_id?: string | null
          updated_by?: string | null
          updated_at?: string
          week_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "party_ledger"
            referencedColumns: ["party_id"]
          },
          {
            foreignKeyName: "transactions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weeks: {
        Row: {
          created_at: string
          created_by: string
          end_date: string
          id: string
          season_id: string
          start_date: string
          week_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          end_date: string
          id?: string
          season_id: string
          start_date: string
          week_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          end_date?: string
          id?: string
          season_id?: string
          start_date?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_counts: {
        Row: {
          counted: number
          created_at: string
          created_by: string
          deleted_at: string | null
          entry_date: string
          id: string
          note: string | null
          owner_user_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          counted: number
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          entry_date: string
          id?: string
          note?: string | null
          owner_user_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          counted?: number
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          entry_date?: string
          id?: string
          note?: string | null
          owner_user_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      kiln_entries: {
        Row: {
          count: number
          created_at: string
          created_by: string
          deleted_at: string | null
          entry_date: string
          id: string
          notes: string | null
          party_id: string
          quality_id: string | null
          season_id: string
          source_party_id: string | null
          stage: Database["public"]["Enums"]["kiln_stage"]
          updated_at: string
          updated_by: string | null
          week_id: string
        }
        Insert: {
          count: number
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          entry_date: string
          id?: string
          notes?: string | null
          party_id: string
          quality_id?: string | null
          season_id: string
          source_party_id?: string | null
          stage: Database["public"]["Enums"]["kiln_stage"]
          updated_at?: string
          updated_by?: string | null
          week_id: string
        }
        Update: {
          count?: number
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          party_id?: string
          quality_id?: string | null
          season_id?: string
          source_party_id?: string | null
          stage?: Database["public"]["Enums"]["kiln_stage"]
          updated_at?: string
          updated_by?: string | null
          week_id?: string
        }
        Relationships: []
      }
      salary_months: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          deleted_at: string | null
          entry_date: string
          id: string
          note: string | null
          party_id: string
          season_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          entry_date: string
          id?: string
          note?: string | null
          party_id: string
          season_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          entry_date?: string
          id?: string
          note?: string | null
          party_id?: string
          season_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          quality_id: string
          quantity: number
          rate_per_1000: number
          sale_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          quality_id: string
          quantity: number
          rate_per_1000: number
          sale_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          quality_id?: string
          quantity?: number
          rate_per_1000?: number
          sale_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          created_at: string
          created_by: string
          customer_id: string
          deleted_at: string | null
          delivery_charges: number
          discount: number
          driver_name: string | null
          entry_date: string
          id: string
          invoice_no: number
          note: string | null
          season_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_no: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          customer_id: string
          deleted_at?: string | null
          delivery_charges?: number
          discount?: number
          driver_name?: string | null
          entry_date: string
          id?: string
          invoice_no?: number
          note?: string | null
          season_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_no?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_id?: string
          deleted_at?: string | null
          delivery_charges?: number
          discount?: number
          driver_name?: string | null
          entry_date?: string
          id?: string
          invoice_no?: number
          note?: string | null
          season_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_no?: string | null
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          delta: number
          entry_date: string
          id: string
          quality_id: string | null
          reason: string
          season_id: string | null
          stock: Database["public"]["Enums"]["stock_kind"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          delta: number
          entry_date: string
          id?: string
          quality_id?: string | null
          reason: string
          season_id?: string | null
          stock: Database["public"]["Enums"]["stock_kind"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          delta?: number
          entry_date?: string
          id?: string
          quality_id?: string | null
          reason?: string
          season_id?: string | null
          stock?: Database["public"]["Enums"]["stock_kind"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      finished_stock: {
        Row: {
          adjusted: number | null
          balance: number | null
          category: Database["public"]["Enums"]["quality_category"] | null
          name_en: string | null
          name_ur: string | null
          produced: number | null
          quality_id: string | null
          sold: number | null
        }
        Relationships: []
      }
      party_earnings: {
        Row: {
          earnings: number | null
          party_id: string | null
        }
        Relationships: []
      }
      party_ledger: {
        Row: {
          balance: number | null
          credits: number | null
          deductions: number | null
          earnings: number | null
          kharcha: number | null
          opening_balance: number | null
          party_id: string | null
          party_kind: Database["public"]["Enums"]["party_kind"] | null
          payments_in: number | null
          payments_out: number | null
          sales: number | null
        }
        Relationships: []
      }
      raw_stock: {
        Row: {
          adjusted: number | null
          balance: number | null
          loaded: number | null
          made: number | null
        }
        Relationships: []
      }
      sale_totals: {
        Row: {
          bricks: number | null
          customer_id: string | null
          delivery_charges: number | null
          discount: number | null
          entry_date: string | null
          gross: number | null
          invoice_no: number | null
          sale_id: string | null
          season_id: string | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_sale: {
        Args: {
          _customer_id: string
          _delivery: number
          _discount: number
          _driver_name: string
          _entry_date: string
          _handler: string | null
          _items: Json
          _method: Database["public"]["Enums"]["pay_method"]
          _note: string
          _paid: number
          _vehicle_no: string
        }
        Returns: string
      }
      season_for_date: { Args: { _d: string }; Returns: string }
      claim_owner_role: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "munshi"
      kiln_stage: "rehra" | "nakasi"
      party_kind:
        | "patheer"
        | "rehra"
        | "nakasi"
        | "employee"
        | "customer"
        | "vendor"
      pay_method: "cash" | "bank" | "easypaisa" | "jazzcash" | "other"
      quality_category: "normal" | "nine_t" | "special" | "other"
      quality_kind: "sale" | "nakasi"
      rate_kind: "earning" | "kharcha"
      stock_kind: "raw" | "finished"
      txn_direction: "in" | "out"
      txn_kind:
        | "kharcha"
        | "expense"
        | "salary"
        | "worker_payment_us"
        | "worker_payment_them"
        | "sale_receipt"
        | "adjustment"
        | "other"
        | "owner_transfer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "munshi"],
      kiln_stage: ["rehra", "nakasi"],
      party_kind: [
        "patheer",
        "rehra",
        "nakasi",
        "employee",
        "customer",
        "vendor",
      ],
      pay_method: ["cash", "bank", "easypaisa", "jazzcash", "other"],
      quality_category: ["normal", "nine_t", "special", "other"],
      quality_kind: ["sale", "nakasi"],
      rate_kind: ["earning", "kharcha"],
      stock_kind: ["raw", "finished"],
      txn_direction: ["in", "out"],
      txn_kind: [
        "kharcha",
        "expense",
        "salary",
        "worker_payment_us",
        "worker_payment_them",
        "sale_receipt",
        "adjustment",
        "other",
        "owner_transfer",
      ],
    },
  },
} as const
