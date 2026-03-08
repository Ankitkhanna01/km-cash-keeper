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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      cached_addresses: {
        Row: {
          city: string | null
          created_at: string
          display_name: string
          hit_count: number
          id: string
          lat: number
          lon: number
          place_name: string | null
          postal_code: string | null
          province: string | null
          search_terms: string[] | null
          source: string
          street: string | null
          user_id: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          display_name: string
          hit_count?: number
          id?: string
          lat: number
          lon: number
          place_name?: string | null
          postal_code?: string | null
          province?: string | null
          search_terms?: string[] | null
          source?: string
          street?: string | null
          user_id?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          display_name?: string
          hit_count?: number
          id?: string
          lat?: number
          lon?: number
          place_name?: string | null
          postal_code?: string | null
          province?: string | null
          search_terms?: string[] | null
          source?: string
          street?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          document_type: string
          document_url: string | null
          estimated_km: number | null
          has_verified_km: boolean
          id: string
          income_amount: number | null
          kilometres: number | null
          notes: string | null
          period_month: number
          period_year: number
          platform: string | null
          raw_ocr_data: Json | null
          source_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_type: string
          document_url?: string | null
          estimated_km?: number | null
          has_verified_km?: boolean
          id?: string
          income_amount?: number | null
          kilometres?: number | null
          notes?: string | null
          period_month: number
          period_year: number
          platform?: string | null
          raw_ocr_data?: Json | null
          source_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_type?: string
          document_url?: string | null
          estimated_km?: number | null
          has_verified_km?: boolean
          id?: string
          income_amount?: number | null
          kilometres?: number | null
          notes?: string | null
          period_month?: number
          period_year?: number
          platform?: string | null
          raw_ocr_data?: Json | null
          source_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expense_reviews: {
        Row: {
          created_at: string
          details: string | null
          expense_id: string | null
          id: string
          is_resolved: boolean
          message: string
          related_expense_id: string | null
          resolved_at: string | null
          review_type: string
          severity: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          expense_id?: string | null
          id?: string
          is_resolved?: boolean
          message: string
          related_expense_id?: string | null
          resolved_at?: string | null
          review_type: string
          severity?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: string | null
          expense_id?: string | null
          id?: string
          is_resolved?: boolean
          message?: string
          related_expense_id?: string | null
          resolved_at?: string | null
          review_type?: string
          severity?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_reviews_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_reviews_related_expense_id_fkey"
            columns: ["related_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          card_last4: string | null
          category: string
          created_at: string
          date: string
          deleted_at: string | null
          id: string
          notes: string | null
          purpose: string
          receipt_url: string | null
          user_id: string
          vendor_name: string
        }
        Insert: {
          amount: number
          card_last4?: string | null
          category: string
          created_at?: string
          date: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          purpose?: string
          receipt_url?: string | null
          user_id: string
          vendor_name: string
        }
        Update: {
          amount?: number
          card_last4?: string | null
          category?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          purpose?: string
          receipt_url?: string | null
          user_id?: string
          vendor_name?: string
        }
        Relationships: []
      }
      odometer_gaps: {
        Row: {
          confirmed_at: string | null
          created_at: string
          gap_category: string | null
          gap_km: number
          gap_status: string
          id: string
          logged_business_km: number
          logged_personal_km: number
          notes: string | null
          odometer_total_km: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          gap_category?: string | null
          gap_km?: number
          gap_status?: string
          id?: string
          logged_business_km?: number
          logged_personal_km?: number
          notes?: string | null
          odometer_total_km?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          gap_category?: string | null
          gap_km?: number
          gap_status?: string
          id?: string
          logged_business_km?: number
          logged_personal_km?: number
          notes?: string | null
          odometer_total_km?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      odometer_readings: {
        Row: {
          created_at: string
          end_reading: number | null
          id: string
          start_reading: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          end_reading?: number | null
          id?: string
          start_reading?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          end_reading?: number | null
          id?: string
          start_reading?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      performance_ratios: {
        Row: {
          created_at: string
          id: string
          km_per_dollar: number
          last_calculated_at: string
          platform: string | null
          source_document_count: number
          total_income: number
          total_km: number
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          km_per_dollar: number
          last_calculated_at?: string
          platform?: string | null
          source_document_count?: number
          total_income?: number
          total_km?: number
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          km_per_dollar?: number
          last_calculated_at?: string
          platform?: string | null
          source_document_count?: number
          total_income?: number
          total_km?: number
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          category: string
          company: string | null
          created_at: string
          date: string
          end_city: string | null
          end_lat: number | null
          end_location: string
          end_lon: number | null
          end_postal_code: string | null
          end_province: string | null
          end_street: string | null
          end_time: string
          id: string
          kilometres: number
          notes: string | null
          start_city: string | null
          start_lat: number | null
          start_location: string
          start_lon: number | null
          start_postal_code: string | null
          start_province: string | null
          start_street: string | null
          start_time: string
          user_id: string
        }
        Insert: {
          category?: string
          company?: string | null
          created_at?: string
          date: string
          end_city?: string | null
          end_lat?: number | null
          end_location: string
          end_lon?: number | null
          end_postal_code?: string | null
          end_province?: string | null
          end_street?: string | null
          end_time: string
          id?: string
          kilometres: number
          notes?: string | null
          start_city?: string | null
          start_lat?: number | null
          start_location: string
          start_lon?: number | null
          start_postal_code?: string | null
          start_province?: string | null
          start_street?: string | null
          start_time: string
          user_id: string
        }
        Update: {
          category?: string
          company?: string | null
          created_at?: string
          date?: string
          end_city?: string | null
          end_lat?: number | null
          end_location?: string
          end_lon?: number | null
          end_postal_code?: string | null
          end_province?: string | null
          end_street?: string | null
          end_time?: string
          id?: string
          kilometres?: number
          notes?: string | null
          start_city?: string | null
          start_lat?: number | null
          start_location?: string
          start_lon?: number | null
          start_postal_code?: string | null
          start_province?: string | null
          start_street?: string | null
          start_time?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
