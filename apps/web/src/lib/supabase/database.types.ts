export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          assigned_at: string
          assigned_by: string
          id: string
          org_id: string
          user_id: string
          version_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          id?: string
          org_id: string
          user_id: string
          version_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          id?: string
          org_id?: string
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_org_id_user_id_fkey"
            columns: ["org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["org_id", "user_id"]
          },
          {
            foreignKeyName: "assignments_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      binding_reviews: {
        Row: {
          block_hash: string
          claim_ids: string[]
          created_at: string
          id: string
          notes: string
          reviewer: string
          seq: number
          verdict: string
        }
        Insert: {
          block_hash: string
          claim_ids: string[]
          created_at?: string
          id?: string
          notes?: string
          reviewer: string
          seq?: never
          verdict: string
        }
        Update: {
          block_hash?: string
          claim_ids?: string[]
          created_at?: string
          id?: string
          notes?: string
          reviewer?: string
          seq?: never
          verdict?: string
        }
        Relationships: []
      }
      block_claims: {
        Row: {
          block_id: string
          claim_id: string
        }
        Insert: {
          block_id: string
          claim_id: string
        }
        Update: {
          block_id?: string
          claim_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "block_claims_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "lesson_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_claims_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_reviews: {
        Row: {
          claim_id: string
          created_at: string
          decision: string
          expires_at: string | null
          id: string
          receipt: Json
          reviewer: string
          seq: number
        }
        Insert: {
          claim_id: string
          created_at?: string
          decision: string
          expires_at?: string | null
          id?: string
          receipt: Json
          reviewer: string
          seq?: never
        }
        Update: {
          claim_id?: string
          created_at?: string
          decision?: string
          expires_at?: string | null
          id?: string
          receipt?: Json
          reviewer?: string
          seq?: never
        }
        Relationships: [
          {
            foreignKeyName: "claim_reviews_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_sources: {
        Row: {
          claim_id: string
          source_id: string
        }
        Insert: {
          claim_id: string
          source_id: string
        }
        Update: {
          claim_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_sources_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          created_at: string
          created_by: string
          evidence_level: string
          id: string
          population: string
          statement: string
        }
        Insert: {
          created_at?: string
          created_by: string
          evidence_level: string
          id?: string
          population: string
          statement: string
        }
        Update: {
          created_at?: string
          created_by?: string
          evidence_level?: string
          id?: string
          population?: string
          statement?: string
        }
        Relationships: []
      }
      course_parts: {
        Row: {
          course_id: string
          id: string
          ordinal: number
          org_id: string | null
          scope: string
          summary: string
          title: string
        }
        Insert: {
          course_id: string
          id: string
          ordinal: number
          org_id?: string | null
          scope?: string
          summary: string
          title: string
        }
        Update: {
          course_id?: string
          id?: string
          ordinal?: number
          org_id?: string | null
          scope?: string
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_parts_course_id_scope_fkey"
            columns: ["course_id", "scope"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "scope"]
          },
          {
            foreignKeyName: "course_parts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          description: string
          id: string
          layer: string
          level: string
          org_id: string | null
          outcomes: Json
          scope: string
          slug: string
          subtitle: string
          title: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          description: string
          id: string
          layer: string
          level: string
          org_id?: string | null
          outcomes: Json
          scope?: string
          slug: string
          subtitle: string
          title: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          layer?: string
          level?: string
          org_id?: string | null
          outcomes?: Json
          scope?: string
          slug?: string
          subtitle?: string
          title?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_versions: {
        Row: {
          content_hash: string
          course_id: string
          id: string
          layer: string
          org_id: string | null
          published_at: string
          published_by: string
          scope: string
          snapshot: Json
          version_number: number
        }
        Insert: {
          content_hash: string
          course_id: string
          id?: string
          layer: string
          org_id?: string | null
          published_at?: string
          published_by: string
          scope?: string
          snapshot: Json
          version_number: number
        }
        Update: {
          content_hash?: string
          course_id?: string
          id?: string
          layer?: string
          org_id?: string | null
          published_at?: string
          published_by?: string
          scope?: string
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_versions_course_id_scope_fkey"
            columns: ["course_id", "scope"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "scope"]
          },
          {
            foreignKeyName: "curriculum_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_blocks: {
        Row: {
          content: Json
          content_hash: string
          id: string
          kind: string
          lesson_id: string
          ordinal: number
          org_id: string | null
          scope: string
          support: string | null
        }
        Insert: {
          content: Json
          content_hash: string
          id?: string
          kind: string
          lesson_id: string
          ordinal: number
          org_id?: string | null
          scope?: string
          support?: string | null
        }
        Update: {
          content?: Json
          content_hash?: string
          id?: string
          kind?: string
          lesson_id?: string
          ordinal?: number
          org_id?: string | null
          scope?: string
          support?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_blocks_lesson_id_scope_fkey"
            columns: ["lesson_id", "scope"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id", "scope"]
          },
          {
            foreignKeyName: "lesson_blocks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_completions: {
        Row: {
          completed_at: string
          content_hash: string
          id: string
          lesson_id: string
          org_id: string
          origin_completion_id: string | null
          user_id: string
          version_id: string
        }
        Insert: {
          completed_at?: string
          content_hash: string
          id?: string
          lesson_id: string
          org_id: string
          origin_completion_id?: string | null
          user_id: string
          version_id: string
        }
        Update: {
          completed_at?: string
          content_hash?: string
          id?: string
          lesson_id?: string
          org_id?: string
          origin_completion_id?: string | null
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_completions_org_id_version_id_user_id_fkey"
            columns: ["org_id", "version_id", "user_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["org_id", "version_id", "user_id"]
          },
          {
            foreignKeyName: "lesson_completions_origin_completion_id_org_id_user_id_fkey"
            columns: ["origin_completion_id", "org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "lesson_completions"
            referencedColumns: ["id", "org_id", "user_id"]
          },
          {
            foreignKeyName: "lesson_completions_version_id_lesson_id_content_hash_fkey"
            columns: ["version_id", "lesson_id", "content_hash"]
            isOneToOne: false
            referencedRelation: "version_lessons"
            referencedColumns: ["version_id", "lesson_id", "content_hash"]
          },
        ]
      }
      lessons: {
        Row: {
          anatomy_ids: Json
          course_id: string
          duration_minutes: number
          format: string
          id: string
          media: Json
          objectives: Json
          ordinal: number
          org_id: string | null
          part_id: string
          resources: Json
          scope: string
          slug: string
          summary: string
          title: string
        }
        Insert: {
          anatomy_ids: Json
          course_id: string
          duration_minutes: number
          format: string
          id: string
          media: Json
          objectives: Json
          ordinal: number
          org_id?: string | null
          part_id: string
          resources: Json
          scope?: string
          slug: string
          summary: string
          title: string
        }
        Update: {
          anatomy_ids?: Json
          course_id?: string
          duration_minutes?: number
          format?: string
          id?: string
          media?: Json
          objectives?: Json
          ordinal?: number
          org_id?: string | null
          part_id?: string
          resources?: Json
          scope?: string
          slug?: string
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_part_id_course_id_scope_fkey"
            columns: ["part_id", "course_id", "scope"]
            isOneToOne: false
            referencedRelation: "course_parts"
            referencedColumns: ["id", "course_id", "scope"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      source_retractions: {
        Row: {
          notice: Json
          recorded_at: string
          recorded_by: string
          source_id: string
        }
        Insert: {
          notice: Json
          recorded_at?: string
          recorded_by: string
          source_id: string
        }
        Update: {
          notice?: Json
          recorded_at?: string
          recorded_by?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_retractions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          created_at: string
          created_by: string
          doi: string | null
          id: string
          kind: string
          license: string
          locator: string | null
          pmid: string | null
          title: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          doi?: string | null
          id?: string
          kind: string
          license: string
          locator?: string | null
          pmid?: string | null
          title: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          doi?: string | null
          id?: string
          kind?: string
          license?: string
          locator?: string | null
          pmid?: string | null
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      version_claims: {
        Row: {
          claim_id: string
          lesson_id: string
          version_id: string
        }
        Insert: {
          claim_id: string
          lesson_id: string
          version_id: string
        }
        Update: {
          claim_id?: string
          lesson_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "version_claims_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "version_claims_version_id_lesson_id_fkey"
            columns: ["version_id", "lesson_id"]
            isOneToOne: false
            referencedRelation: "version_lessons"
            referencedColumns: ["version_id", "lesson_id"]
          },
        ]
      }
      version_flags: {
        Row: {
          claim_id: string
          flagged_at: string
          reason: string
          source_id: string
          version_id: string
        }
        Insert: {
          claim_id: string
          flagged_at?: string
          reason: string
          source_id: string
          version_id: string
        }
        Update: {
          claim_id?: string
          flagged_at?: string
          reason?: string
          source_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "version_flags_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "version_flags_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "version_flags_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      version_lessons: {
        Row: {
          content_hash: string
          lesson_id: string
          ordinal: number
          org_id: string | null
          scope: string
          version_id: string
        }
        Insert: {
          content_hash: string
          lesson_id: string
          ordinal: number
          org_id?: string | null
          scope?: string
          version_id: string
        }
        Update: {
          content_hash?: string
          lesson_id?: string
          ordinal?: number
          org_id?: string | null
          scope?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "version_lessons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "version_lessons_version_id_scope_fkey"
            columns: ["version_id", "scope"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id", "scope"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { invite_token: string }; Returns: string }
      assign_version: {
        Args: { p_org: string; p_user: string; p_version: string }
        Returns: string
      }
      complete_lesson: {
        Args: { p_assignment: string; p_lesson: string }
        Returns: string
      }
      create_invite: {
        Args: {
          invitee_email: string
          invitee_role: Database["public"]["Enums"]["member_role"]
          target_org: string
        }
        Returns: string
      }
      create_org: {
        Args: { org_name: string; org_slug: string }
        Returns: string
      }
      publish_course: { Args: { p_course: string }; Returns: string }
      publisher_add_claim: {
        Args: { p_actor: string; p_claim: Json }
        Returns: string
      }
      publisher_add_source: {
        Args: { p_actor: string; p_source: Json }
        Returns: string
      }
      publisher_publish_course: {
        Args: { p_actor: string; p_course: string }
        Returns: string
      }
      publisher_record_retraction: {
        Args: { p_actor: string; p_notice: Json; p_source: string }
        Returns: number
      }
      publisher_review_block: {
        Args: { p_actor: string; p_block: string; p_review: Json }
        Returns: string
      }
      publisher_review_claim: {
        Args: { p_actor: string; p_claim: string; p_review: Json }
        Returns: string
      }
      publisher_save_course_draft: {
        Args: { p_actor: string; p_course: Json }
        Returns: string
      }
      remove_member: {
        Args: { member: string; target_org: string }
        Returns: undefined
      }
      revoke_invite: { Args: { invite_id: string }; Returns: undefined }
      save_course_draft: {
        Args: { p_course: Json; p_org: string }
        Returns: string
      }
      set_member_role: {
        Args: {
          member: string
          new_role: Database["public"]["Enums"]["member_role"]
          target_org: string
        }
        Returns: undefined
      }
    }
    Enums: {
      member_role: "owner" | "lead" | "trainer"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      member_role: ["owner", "lead", "trainer"],
    },
  },
} as const

