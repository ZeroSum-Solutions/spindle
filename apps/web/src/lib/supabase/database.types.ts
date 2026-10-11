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
          run_id: string | null
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
          run_id?: string | null
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
          run_id?: string | null
          seq?: never
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "binding_reviews_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "review_runs"
            referencedColumns: ["id"]
          },
        ]
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
          claim_hash: string | null
          claim_id: string
          created_at: string
          decision: string
          expires_at: string | null
          id: string
          receipt: Json
          reviewer: string
          run_id: string | null
          seq: number
        }
        Insert: {
          claim_hash?: string | null
          claim_id: string
          created_at?: string
          decision: string
          expires_at?: string | null
          id?: string
          receipt: Json
          reviewer: string
          run_id?: string | null
          seq?: never
        }
        Update: {
          claim_hash?: string | null
          claim_id?: string
          created_at?: string
          decision?: string
          expires_at?: string | null
          id?: string
          receipt?: Json
          reviewer?: string
          run_id?: string | null
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
          {
            foreignKeyName: "claim_reviews_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "review_runs"
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
      course_reviews: {
        Row: {
          course_id: string
          created_at: string
          findings: Json
          id: string
          notes: string
          originality: string
          reviewer: string
          run_id: string | null
          safety: string
          seq: number
          shell_hash: string
          verdict: string
        }
        Insert: {
          course_id: string
          created_at?: string
          findings: Json
          id?: string
          notes?: string
          originality: string
          reviewer: string
          run_id?: string | null
          safety: string
          seq?: never
          shell_hash: string
          verdict: string
        }
        Update: {
          course_id?: string
          created_at?: string
          findings?: Json
          id?: string
          notes?: string
          originality?: string
          reviewer?: string
          run_id?: string | null
          safety?: string
          seq?: never
          shell_hash?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_reviews_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "review_runs"
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
          learner_snapshot: Json | null
          org_id: string | null
          published_at: string
          published_by: string
          question_set_hash: string | null
          rules: string
          scope: string
          snapshot: Json
          version_number: number
        }
        Insert: {
          content_hash: string
          course_id: string
          id?: string
          layer: string
          learner_snapshot?: Json | null
          org_id?: string | null
          published_at?: string
          published_by: string
          question_set_hash?: string | null
          rules: string
          scope?: string
          snapshot: Json
          version_number: number
        }
        Update: {
          content_hash?: string
          course_id?: string
          id?: string
          layer?: string
          learner_snapshot?: Json | null
          org_id?: string | null
          published_at?: string
          published_by?: string
          question_set_hash?: string | null
          rules?: string
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
      lesson_reviews: {
        Row: {
          claim_ids: string[]
          created_at: string
          findings: Json
          id: string
          lesson_hash: string
          lesson_id: string
          notes: string
          originality: string
          reviewer: string
          run_id: string | null
          safety: string
          seq: number
          verdict: string
        }
        Insert: {
          claim_ids: string[]
          created_at?: string
          findings: Json
          id?: string
          lesson_hash: string
          lesson_id: string
          notes?: string
          originality: string
          reviewer: string
          run_id?: string | null
          safety: string
          seq?: never
          verdict: string
        }
        Update: {
          claim_ids?: string[]
          created_at?: string
          findings?: Json
          id?: string
          lesson_hash?: string
          lesson_id?: string
          notes?: string
          originality?: string
          reviewer?: string
          run_id?: string | null
          safety?: string
          seq?: never
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_reviews_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "review_runs"
            referencedColumns: ["id"]
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
      practice_media: {
        Row: {
          admitted_at: string
          admitted_by: string
          end_seconds: number
          id: string
          provider: string
          rationale: string
          start_seconds: number
          video_id: string
        }
        Insert: {
          admitted_at?: string
          admitted_by: string
          end_seconds: number
          id?: string
          provider: string
          rationale: string
          start_seconds: number
          video_id: string
        }
        Update: {
          admitted_at?: string
          admitted_by?: string
          end_seconds?: number
          id?: string
          provider?: string
          rationale?: string
          start_seconds?: number
          video_id?: string
        }
        Relationships: []
      }
      practice_media_checks: {
        Row: {
          checked_at: string
          described_at: string | null
          describer_cost_usd: number | null
          describer_model: string | null
          describer_run_id: string | null
          id: string
          kind: string
          media_id: string
          notes: string
          outcome: string
          recorded_at: string
          recorded_by: string
          run_id: string | null
          seq: number
        }
        Insert: {
          checked_at: string
          described_at?: string | null
          describer_cost_usd?: number | null
          describer_model?: string | null
          describer_run_id?: string | null
          id?: string
          kind: string
          media_id: string
          notes?: string
          outcome: string
          recorded_at?: string
          recorded_by: string
          run_id?: string | null
          seq?: never
        }
        Update: {
          checked_at?: string
          described_at?: string | null
          describer_cost_usd?: number | null
          describer_model?: string | null
          describer_run_id?: string | null
          id?: string
          kind?: string
          media_id?: string
          notes?: string
          outcome?: string
          recorded_at?: string
          recorded_by?: string
          run_id?: string | null
          seq?: never
        }
        Relationships: [
          {
            foreignKeyName: "practice_media_checks_describer_run_id_fkey"
            columns: ["describer_run_id"]
            isOneToOne: false
            referencedRelation: "review_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_media_checks_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "practice_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_media_checks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "review_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_media_metadata: {
        Row: {
          available: boolean
          channel: string
          fetched_at: string
          media_id: string
          recorded_by: string
          title: string
        }
        Insert: {
          available: boolean
          channel: string
          fetched_at: string
          media_id: string
          recorded_by: string
          title: string
        }
        Update: {
          available?: boolean
          channel?: string
          fetched_at?: string
          media_id?: string
          recorded_by?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_media_metadata_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: true
            referencedRelation: "practice_media"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_media_status: {
        Row: {
          id: string
          media_id: string
          reason: string
          recorded_at: string
          recorded_by: string
          seq: number
          status: string
        }
        Insert: {
          id?: string
          media_id: string
          reason: string
          recorded_at?: string
          recorded_by: string
          seq?: never
          status: string
        }
        Update: {
          id?: string
          media_id?: string
          reason?: string
          recorded_at?: string
          recorded_by?: string
          seq?: never
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_media_status_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "practice_media"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          answers: Json
          attempt_key: string
          correct: number
          id: string
          org_id: string
          passed: boolean
          question_set_hash: string
          submitted_at: string
          total: number
          user_id: string
          version_id: string
        }
        Insert: {
          answers: Json
          attempt_key: string
          correct: number
          id?: string
          org_id: string
          passed?: boolean
          question_set_hash: string
          submitted_at?: string
          total: number
          user_id: string
          version_id: string
        }
        Update: {
          answers?: Json
          attempt_key?: string
          correct?: number
          id?: string
          org_id?: string
          passed?: boolean
          question_set_hash?: string
          submitted_at?: string
          total?: number
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_org_id_version_id_user_id_fkey"
            columns: ["org_id", "version_id", "user_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["org_id", "version_id", "user_id"]
          },
        ]
      }
      review_runs: {
        Row: {
          id: string
          model: string
          packet_digest: string
          recorded_at: string
          recorded_by: string
          reviewed_at: string
          session_id: string
        }
        Insert: {
          id?: string
          model: string
          packet_digest: string
          recorded_at?: string
          recorded_by: string
          reviewed_at: string
          session_id: string
        }
        Update: {
          id?: string
          model?: string
          packet_digest?: string
          recorded_at?: string
          recorded_by?: string
          reviewed_at?: string
          session_id?: string
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
      module_status: {
        Args: { p_assignment: string }
        Returns: {
          assignment_id: string
          best_attempt_id: string
          best_correct: number
          best_total: number
          complete: boolean
          lessons_completed: number
          lessons_total: number
          questions_total: number
          quiz_carried: boolean
          quiz_credit_attempt_id: string
          quiz_passed: boolean
          quiz_required: boolean
          version_id: string
        }[]
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
      publisher_admit_media: {
        Args: { p_actor: string; p_media: Json }
        Returns: string
      }
      publisher_claim_target: {
        Args: { p_actor: string; p_claim: string }
        Returns: Json
      }
      publisher_publish_course: {
        Args: { p_actor: string; p_course: string }
        Returns: string
      }
      publisher_publish_course_checked: {
        Args: { p_actor: string; p_checked: Json; p_course: string }
        Returns: string
      }
      publisher_record_media_check: {
        Args: { p_actor: string; p_check: Json; p_media: string }
        Returns: string
      }
      publisher_record_retraction: {
        Args: { p_actor: string; p_notice: Json; p_source: string }
        Returns: number
      }
      publisher_refresh_media_metadata: {
        Args: { p_actor: string; p_media: string; p_metadata: Json }
        Returns: undefined
      }
      publisher_review_block: {
        Args: { p_actor: string; p_block: string; p_review: Json }
        Returns: string
      }
      publisher_review_claim: {
        Args: { p_actor: string; p_claim: string; p_review: Json }
        Returns: string
      }
      publisher_review_course: {
        Args: { p_actor: string; p_course: string; p_review: Json }
        Returns: string
      }
      publisher_review_lesson: {
        Args: { p_actor: string; p_lesson: string; p_review: Json }
        Returns: string
      }
      publisher_review_targets: {
        Args: { p_actor: string; p_course: string }
        Returns: Json
      }
      publisher_save_course_draft: {
        Args: { p_actor: string; p_course: Json }
        Returns: string
      }
      publisher_set_media_status: {
        Args: { p_actor: string; p_media: string; p_status: Json }
        Returns: string
      }
      quiz_attempt_review: {
        Args: { p_attempt: string }
        Returns: {
          answer_index: number
          chosen: number
          correct: boolean
          explanation: string
          question_id: string
        }[]
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
      submit_quiz_attempt: {
        Args: { p_answers: Json; p_assignment: string; p_attempt_key: string }
        Returns: {
          attempt_id: string
          correct: number
          passed: boolean
          total: number
        }[]
      }
      version_integrity: {
        Args: { p_version: string }
        Returns: {
          claim_id: string
          lesson_id: string
          state: string
        }[]
      }
      version_media: {
        Args: { p_version: string }
        Returns: {
          available: boolean
          channel: string
          media_id: string
          review: string
          state: string
          title: string
        }[]
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

