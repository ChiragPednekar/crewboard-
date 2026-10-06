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
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["actor_kind"]
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          payload: Json
          summary: string | null
          videographer_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["actor_kind"]
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          payload?: Json
          summary?: string | null
          videographer_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["actor_kind"]
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          payload?: Json
          summary?: string | null
          videographer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_videographer_id_fkey"
            columns: ["videographer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_emails: {
        Row: {
          added_at: string
          email: string
        }
        Insert: {
          added_at?: string
          email: string
        }
        Update: {
          added_at?: string
          email?: string
        }
        Relationships: []
      }
      allowed_emails: {
        Row: {
          added_by: string | null
          base_location: string | null
          claimed_at: string | null
          claimed_by: string | null
          client_ids: string[]
          created_at: string
          email: string
          full_name: string | null
          phone: string | null
          role: string
        }
        Insert: {
          added_by?: string | null
          base_location?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_ids?: string[]
          created_at?: string
          email: string
          full_name?: string | null
          phone?: string | null
          role?: string
        }
        Update: {
          added_by?: string | null
          base_location?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_ids?: string[]
          created_at?: string
          email?: string
          full_name?: string | null
          phone?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "allowed_emails_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowed_emails_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: boolean
          master_spreadsheet_id: string | null
          sheet_mode: Database["public"]["Enums"]["sheet_mode"]
          sync_enabled: boolean
          updated_at: string
          updated_by: string | null
          weight_completion: number
          weight_discretionary: number
          weight_points: number
          weight_punctuality: number
        }
        Insert: {
          id?: boolean
          master_spreadsheet_id?: string | null
          sheet_mode?: Database["public"]["Enums"]["sheet_mode"]
          sync_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          weight_completion?: number
          weight_discretionary?: number
          weight_points?: number
          weight_punctuality?: number
        }
        Update: {
          id?: boolean
          master_spreadsheet_id?: string | null
          sheet_mode?: Database["public"]["Enums"]["sheet_mode"]
          sync_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          weight_completion?: number
          weight_discretionary?: number
          weight_points?: number
          weight_punctuality?: number
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_unlocks: {
        Row: {
          assessment_id: string
          id: string
          reason: string
          unlocked_at: string
          unlocked_by: string | null
        }
        Insert: {
          assessment_id: string
          id?: string
          reason: string
          unlocked_at?: string
          unlocked_by?: string | null
        }
        Update: {
          assessment_id?: string
          id?: string
          reason?: string
          unlocked_at?: string
          unlocked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_unlocks_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "monthly_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_unlocks_unlocked_by_fkey"
            columns: ["unlocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      best_work_votes: {
        Row: {
          created_at: string
          month: string
          task_id: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          month: string
          task_id: string
          voter_id: string
        }
        Update: {
          created_at?: string
          month?: string
          task_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_work_votes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_work_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_review_links: {
        Row: {
          client_contact: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          decision: string | null
          expires_at: string
          id: string
          rating: number | null
          responded_at: string | null
          responder_name: string | null
          revoked_at: string | null
          submission_id: string | null
          task_id: string
          token: string
        }
        Insert: {
          client_contact?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          decision?: string | null
          expires_at?: string
          id?: string
          rating?: number | null
          responded_at?: string | null
          responder_name?: string | null
          revoked_at?: string | null
          submission_id?: string | null
          task_id: string
          token?: string
        }
        Update: {
          client_contact?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          decision?: string | null
          expires_at?: string
          id?: string
          rating?: number | null
          responded_at?: string | null
          responder_name?: string | null
          revoked_at?: string | null
          submission_id?: string | null
          task_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_review_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_review_links_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_review_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          notes: string | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          notes?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          notes?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      equipment: {
        Row: {
          category: string
          checked_out_at: string | null
          created_at: string
          due_back: string | null
          holder_id: string | null
          id: string
          name: string
          notes: string | null
          serial_no: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          checked_out_at?: string | null
          created_at?: string
          due_back?: string | null
          holder_id?: string | null
          id?: string
          name: string
          notes?: string | null
          serial_no?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          checked_out_at?: string | null
          created_at?: string
          due_back?: string | null
          holder_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          serial_no?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          equipment_id: string
          id: number
          note: string | null
          videographer_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          equipment_id: string
          id?: never
          note?: string | null
          videographer_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          equipment_id?: string
          id?: never
          note?: string | null
          videographer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_log_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_log_videographer_id_fkey"
            columns: ["videographer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_work: {
        Row: {
          chosen_by: string | null
          created_at: string
          id: string
          month: string
          rank: number
          reason: string | null
          task_id: string
          updated_at: string
        }
        Insert: {
          chosen_by?: string | null
          created_at?: string
          id?: string
          month: string
          rank: number
          reason?: string | null
          task_id: string
          updated_at?: string
        }
        Update: {
          chosen_by?: string | null
          created_at?: string
          id?: string
          month?: string
          rank?: number
          reason?: string | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_work_chosen_by_fkey"
            columns: ["chosen_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "featured_work_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          end_date: string
          id: string
          kind: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
          videographer_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          kind?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          updated_at?: string
          videographer_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          kind?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          videographer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_videographer_id_fkey"
            columns: ["videographer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_assessments: {
        Row: {
          admin_remarks: string | null
          approved_count: number
          assigned_count: number
          base_score: number
          bonus_points: number
          bonus_reason: string | null
          completion_pct: number
          computed_at: string
          created_at: string
          discretionary_score: number | null
          id: string
          is_locked: boolean
          max_points_sum: number
          month: string
          on_time_count: number
          points_awarded_sum: number
          points_pct: number
          public_note: string | null
          published_at: string | null
          published_by: string | null
          punctuality_pct: number
          status: Database["public"]["Enums"]["assessment_status"]
          submitted_count: number
          total_score: number
          updated_at: string
          videographer_id: string
          weights: Json
        }
        Insert: {
          admin_remarks?: string | null
          approved_count?: number
          assigned_count?: number
          base_score?: number
          bonus_points?: number
          bonus_reason?: string | null
          completion_pct?: number
          computed_at?: string
          created_at?: string
          discretionary_score?: number | null
          id?: string
          is_locked?: boolean
          max_points_sum?: number
          month: string
          on_time_count?: number
          points_awarded_sum?: number
          points_pct?: number
          public_note?: string | null
          published_at?: string | null
          published_by?: string | null
          punctuality_pct?: number
          status?: Database["public"]["Enums"]["assessment_status"]
          submitted_count?: number
          total_score?: number
          updated_at?: string
          videographer_id: string
          weights: Json
        }
        Update: {
          admin_remarks?: string | null
          approved_count?: number
          assigned_count?: number
          base_score?: number
          bonus_points?: number
          bonus_reason?: string | null
          completion_pct?: number
          computed_at?: string
          created_at?: string
          discretionary_score?: number | null
          id?: string
          is_locked?: boolean
          max_points_sum?: number
          month?: string
          on_time_count?: number
          points_awarded_sum?: number
          points_pct?: number
          public_note?: string | null
          published_at?: string | null
          published_by?: string | null
          punctuality_pct?: number
          status?: Database["public"]["Enums"]["assessment_status"]
          submitted_count?: number
          total_score?: number
          updated_at?: string
          videographer_id?: string
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "monthly_assessments_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_assessments_videographer_id_fkey"
            columns: ["videographer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_plans: {
        Row: {
          created_at: string
          created_by: string | null
          goals: string | null
          id: string
          month: string
          published_at: string | null
          status: Database["public"]["Enums"]["plan_status"]
          summary: string | null
          updated_at: string
          videographer_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          goals?: string | null
          id?: string
          month: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          summary?: string | null
          updated_at?: string
          videographer_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          goals?: string | null
          id?: string
          month?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          summary?: string | null
          updated_at?: string
          videographer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_plans_videographer_id_fkey"
            columns: ["videographer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          push_sent_at: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
          whatsapp_status: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          push_sent_at?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
          whatsapp_status?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          push_sent_at?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
          whatsapp_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approval_decided_at: string | null
          approval_decided_by: string | null
          approval_status: string
          avatar_url: string | null
          base_location: string | null
          created_at: string
          deactivated_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          whatsapp_number: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          approval_decided_at?: string | null
          approval_decided_by?: string | null
          approval_status?: string
          avatar_url?: string | null
          base_location?: string | null
          created_at?: string
          deactivated_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          approval_decided_at?: string | null
          approval_decided_by?: string | null
          approval_status?: string
          avatar_url?: string | null
          base_location?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_approval_decided_by_fkey"
            columns: ["approval_decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_comments: {
        Row: {
          at_seconds: number | null
          author_id: string | null
          author_name: string | null
          author_staff: boolean
          body: string
          created_at: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          submission_id: string | null
          task_id: string
        }
        Insert: {
          at_seconds?: number | null
          author_id?: string | null
          author_name?: string | null
          author_staff?: boolean
          body: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          submission_id?: string | null
          task_id: string
        }
        Update: {
          at_seconds?: number | null
          author_id?: string | null
          author_name?: string | null
          author_staff?: boolean
          body?: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          submission_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_configs: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          last_error: string | null
          last_rows_updated: number
          last_status: string | null
          last_synced_at: string | null
          ping_token_hash: string | null
          provisioned_at: string | null
          spreadsheet_id: string
          sync_requested_at: string | null
          tab_name: string
          updated_at: string
          videographer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_rows_updated?: number
          last_status?: string | null
          last_synced_at?: string | null
          ping_token_hash?: string | null
          provisioned_at?: string | null
          spreadsheet_id: string
          sync_requested_at?: string | null
          tab_name?: string
          updated_at?: string
          videographer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_rows_updated?: number
          last_status?: string | null
          last_synced_at?: string | null
          ping_token_hash?: string | null
          provisioned_at?: string | null
          spreadsheet_id?: string
          sync_requested_at?: string | null
          tab_name?: string
          updated_at?: string
          videographer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_configs_videographer_id_fkey"
            columns: ["videographer_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_outbox: {
        Row: {
          attempts: number
          enqueued_at: string
          id: number
          last_error: string | null
          processed_at: string | null
          reason: string
          task_id: string
        }
        Insert: {
          attempts?: number
          enqueued_at?: string
          id?: never
          last_error?: string | null
          processed_at?: string | null
          reason: string
          task_id: string
        }
        Update: {
          attempts?: number
          enqueued_at?: string
          id?: never
          last_error?: string | null
          processed_at?: string | null
          reason?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_outbox_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_row_state: {
        Row: {
          last_link: string | null
          last_notes: string | null
          last_read_at: string | null
          last_sheet_edit_at: string | null
          last_status: string | null
          last_written_at: string | null
          row_hash: string | null
          sheet_config_id: string
          task_id: string
        }
        Insert: {
          last_link?: string | null
          last_notes?: string | null
          last_read_at?: string | null
          last_sheet_edit_at?: string | null
          last_status?: string | null
          last_written_at?: string | null
          row_hash?: string | null
          sheet_config_id: string
          task_id: string
        }
        Update: {
          last_link?: string | null
          last_notes?: string | null
          last_read_at?: string | null
          last_sheet_edit_at?: string | null
          last_status?: string | null
          last_written_at?: string | null
          row_hash?: string | null
          sheet_config_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_row_state_sheet_config_id_fkey"
            columns: ["sheet_config_id"]
            isOneToOne: false
            referencedRelation: "sheet_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_row_state_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          created_at: string
          id: string
          is_on_time: boolean
          links: string[]
          notes: string | null
          source: Database["public"]["Enums"]["submission_source"]
          submitted_at: string
          submitted_by: string | null
          task_id: string
          thumbnail_path: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_on_time?: boolean
          links: string[]
          notes?: string | null
          source?: Database["public"]["Enums"]["submission_source"]
          submitted_at?: string
          submitted_by?: string | null
          task_id: string
          thumbnail_path?: string | null
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          is_on_time?: boolean
          links?: string[]
          notes?: string | null
          source?: Database["public"]["Enums"]["submission_source"]
          submitted_at?: string
          submitted_by?: string | null
          task_id?: string
          thumbnail_path?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_events: {
        Row: {
          created_at: string
          detail: Json
          id: number
          kind: Database["public"]["Enums"]["sync_event_kind"]
          row_number: number | null
          run_id: string
          sheet_config_id: string | null
          task_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: never
          kind: Database["public"]["Enums"]["sync_event_kind"]
          row_number?: number | null
          run_id: string
          sheet_config_id?: string | null
          task_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: never
          kind?: Database["public"]["Enums"]["sync_event_kind"]
          row_number?: number | null
          run_id?: string
          sheet_config_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_events_sheet_config_id_fkey"
            columns: ["sheet_config_id"]
            isOneToOne: false
            referencedRelation: "sheet_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          finished_at: string | null
          id: string
          started_at: string
          stats: Json
          status: string
          trigger: string
          triggered_by: string | null
        }
        Insert: {
          finished_at?: string | null
          id?: string
          started_at?: string
          stats?: Json
          status?: string
          trigger: string
          triggered_by?: string | null
        }
        Update: {
          finished_at?: string | null
          id?: string
          started_at?: string
          stats?: Json
          status?: string
          trigger?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_categories: {
        Row: {
          created_at: string
          default_max_points: number
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_max_points?: number
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_max_points?: number
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      task_references: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["reference_kind"]
          meta: Json
          note: string | null
          sort_order: number
          storage_path: string | null
          task_id: string
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["reference_kind"]
          meta?: Json
          note?: string | null
          sort_order?: number
          storage_path?: string | null
          task_id: string
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["reference_kind"]
          meta?: Json
          note?: string | null
          sort_order?: number
          storage_path?: string | null
          task_id?: string
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_references_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_references_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_reviews: {
        Row: {
          created_at: string
          decision: Database["public"]["Enums"]["review_decision"]
          feedback: string | null
          id: string
          points_awarded: number | null
          quality_rating: number | null
          reviewed_at: string
          reviewer_id: string | null
          submission_id: string | null
          task_id: string
        }
        Insert: {
          created_at?: string
          decision: Database["public"]["Enums"]["review_decision"]
          feedback?: string | null
          id?: string
          points_awarded?: number | null
          quality_rating?: number | null
          reviewed_at?: string
          reviewer_id?: string | null
          submission_id?: string | null
          task_id: string
        }
        Update: {
          created_at?: string
          decision?: Database["public"]["Enums"]["review_decision"]
          feedback?: string | null
          id?: string
          points_awarded?: number | null
          quality_rating?: number | null
          reviewed_at?: string
          reviewer_id?: string | null
          submission_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_reviews_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          approved_at: string | null
          brief: string | null
          category_id: string
          client_id: string
          created_at: string
          created_by: string | null
          due_date: string
          first_submitted_at: string | null
          id: string
          last_submitted_at: string | null
          max_points: number
          month: string
          plan_id: string
          points_awarded: number | null
          priority: Database["public"]["Enums"]["task_priority"]
          quality_rating: number | null
          sheet_row_ref: string | null
          shoot_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          status_changed_at: string
          status_changed_via: Database["public"]["Enums"]["submission_source"]
          title: string
          updated_at: string
          videographer_id: string
          videographer_notes: string | null
        }
        Insert: {
          approved_at?: string | null
          brief?: string | null
          category_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          due_date: string
          first_submitted_at?: string | null
          id?: string
          last_submitted_at?: string | null
          max_points: number
          month: string
          plan_id: string
          points_awarded?: number | null
          priority?: Database["public"]["Enums"]["task_priority"]
          quality_rating?: number | null
          sheet_row_ref?: string | null
          shoot_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          status_changed_at?: string
          status_changed_via?: Database["public"]["Enums"]["submission_source"]
          title: string
          updated_at?: string
          videographer_id: string
          videographer_notes?: string | null
        }
        Update: {
          approved_at?: string | null
          brief?: string | null
          category_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          first_submitted_at?: string | null
          id?: string
          last_submitted_at?: string | null
          max_points?: number
          month?: string
          plan_id?: string
          points_awarded?: number | null
          priority?: Database["public"]["Enums"]["task_priority"]
          quality_rating?: number | null
          sheet_row_ref?: string | null
          shoot_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          status_changed_at?: string
          status_changed_via?: Database["public"]["Enums"]["submission_source"]
          title?: string
          updated_at?: string
          videographer_id?: string
          videographer_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "task_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "monthly_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_videographer_id_fkey"
            columns: ["videographer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      videographer_clients: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          client_id: string
          videographer_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          client_id: string
          videographer_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          client_id?: string
          videographer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "videographer_clients_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videographer_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videographer_clients_videographer_id_fkey"
            columns: ["videographer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assert_task_actor: {
        Args: {
          p_source: Database["public"]["Enums"]["submission_source"]
          p_task: Database["public"]["Tables"]["tasks"]["Row"]
        }
        Returns: undefined
      }
      available_months: { Args: never; Returns: string[] }
      begin_sync_run: {
        Args: { p_trigger: string; p_triggered_by?: string }
        Returns: string
      }
      calc_assessment_score: {
        Args: {
          p_completion_pct: number
          p_discretionary: number
          p_points_pct: number
          p_punctuality_pct: number
          p_weights: Json
        }
        Returns: number
      }
      calc_month_metrics: {
        Args: { p_month: string; p_videographer_id: string }
        Returns: {
          approved_count: number
          assigned_count: number
          max_points_sum: number
          on_time_count: number
          points_awarded_sum: number
          submitted_count: number
        }[]
      }
      can_see_task: { Args: { p_task_id: string }; Returns: boolean }
      cancel_leave: {
        Args: { p_id: string }
        Returns: {
          created_at: string
          end_date: string
          id: string
          kind: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
          videographer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_task: {
        Args: { p_reason?: string; p_task_id: string }
        Returns: {
          approved_at: string | null
          brief: string | null
          category_id: string
          client_id: string
          created_at: string
          created_by: string | null
          due_date: string
          first_submitted_at: string | null
          id: string
          last_submitted_at: string | null
          max_points: number
          month: string
          plan_id: string
          points_awarded: number | null
          priority: Database["public"]["Enums"]["task_priority"]
          quality_rating: number | null
          sheet_row_ref: string | null
          shoot_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          status_changed_at: string
          status_changed_via: Database["public"]["Enums"]["submission_source"]
          title: string
          updated_at: string
          videographer_id: string
          videographer_notes: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cast_vote: {
        Args: { p_month: string; p_task_id: string }
        Returns: undefined
      }
      check_dispatch_secret: { Args: { p_secret: string }; Returns: boolean }
      checkout_equipment: {
        Args: {
          p_due_back?: string
          p_id: string
          p_note?: string
          p_videographer_id: string
        }
        Returns: {
          category: string
          checked_out_at: string | null
          created_at: string
          due_back: string | null
          holder_id: string | null
          id: string
          name: string
          notes: string | null
          serial_no: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "equipment"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clear_vote: { Args: { p_month: string }; Returns: undefined }
      compute_assessment: {
        Args: { p_month: string; p_videographer_id: string }
        Returns: {
          admin_remarks: string | null
          approved_count: number
          assigned_count: number
          base_score: number
          bonus_points: number
          bonus_reason: string | null
          completion_pct: number
          computed_at: string
          created_at: string
          discretionary_score: number | null
          id: string
          is_locked: boolean
          max_points_sum: number
          month: string
          on_time_count: number
          points_awarded_sum: number
          points_pct: number
          public_note: string | null
          published_at: string | null
          published_by: string | null
          punctuality_pct: number
          status: Database["public"]["Enums"]["assessment_status"]
          submitted_count: number
          total_score: number
          updated_at: string
          videographer_id: string
          weights: Json
        }
        SetofOptions: {
          from: "*"
          to: "monthly_assessments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_month_assessments: {
        Args: { p_month: string }
        Returns: {
          admin_remarks: string | null
          approved_count: number
          assigned_count: number
          base_score: number
          bonus_points: number
          bonus_reason: string | null
          completion_pct: number
          computed_at: string
          created_at: string
          discretionary_score: number | null
          id: string
          is_locked: boolean
          max_points_sum: number
          month: string
          on_time_count: number
          points_awarded_sum: number
          points_pct: number
          public_note: string | null
          published_at: string | null
          published_by: string | null
          punctuality_pct: number
          status: Database["public"]["Enums"]["assessment_status"]
          submitted_count: number
          total_score: number
          updated_at: string
          videographer_id: string
          weights: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "monthly_assessments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_tasks: {
        Args: {
          p_month: string
          p_refs?: Json
          p_task: Json
          p_videographer_ids: string[]
        }
        Returns: {
          approved_at: string | null
          brief: string | null
          category_id: string
          client_id: string
          created_at: string
          created_by: string | null
          due_date: string
          first_submitted_at: string | null
          id: string
          last_submitted_at: string | null
          max_points: number
          month: string
          plan_id: string
          points_awarded: number | null
          priority: Database["public"]["Enums"]["task_priority"]
          quality_rating: number | null
          sheet_row_ref: string | null
          shoot_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          status_changed_at: string
          status_changed_via: Database["public"]["Enums"]["submission_source"]
          title: string
          updated_at: string
          videographer_id: string
          videographer_notes: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_actor_kind: {
        Args: never
        Returns: Database["public"]["Enums"]["actor_kind"]
      }
      current_weights: { Args: never; Returns: Json }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      decide_leave: {
        Args: { p_decision: string; p_id: string; p_note?: string }
        Returns: {
          created_at: string
          end_date: string
          id: string
          kind: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
          videographer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_signup: {
        Args: {
          p_approve: boolean
          p_client_ids?: string[]
          p_role?: string
          p_user_id: string
        }
        Returns: {
          approval_decided_at: string | null
          approval_decided_by: string | null
          approval_status: string
          avatar_url: string | null
          base_location: string | null
          created_at: string
          deactivated_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          whatsapp_number: string | null
          whatsapp_opt_in: boolean
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      due_deadline: { Args: { d: string }; Returns: string }
      duplicate_plan: {
        Args: {
          p_from_month: string
          p_to_month: string
          p_videographer_id: string
        }
        Returns: Json
      }
      enqueue_sheet_sync: {
        Args: { p_reason: string; p_task_id: string }
        Returns: undefined
      }
      ensure_plan: {
        Args: { p_month: string; p_videographer_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          goals: string | null
          id: string
          month: string
          published_at: string | null
          status: Database["public"]["Enums"]["plan_status"]
          summary: string | null
          updated_at: string
          videographer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "monthly_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finish_sync_run: {
        Args: { p_run_id: string; p_stats: Json; p_status: string }
        Returns: undefined
      }
      format_month: { Args: { p_month: string }; Returns: string }
      format_timecode: { Args: { p_seconds: number }; Returns: string }
      get_account_status: {
        Args: never
        Returns: {
          banned_until: string
          confirmed_at: string
          id: string
          invited_at: string
          last_sign_in_at: string
        }[]
      }
      get_badges: { Args: { p_videographer_id: string }; Returns: Json }
      get_client_ratings: {
        Args: { p_month: string }
        Returns: {
          approvals: number
          avg_rating: number
          reviews: number
          videographer_id: string
        }[]
      }
      get_client_review: { Args: { p_token: string }; Returns: Json }
      get_featured_work: {
        Args: { p_month: string }
        Returns: {
          approved_at: string
          category: string
          client_logo_url: string
          client_name: string
          links: string[]
          quality_rating: number
          rank: number
          reason: string
          task_id: string
          thumbnail_path: string
          title: string
          videographer_avatar_url: string
          videographer_id: string
          videographer_name: string
        }[]
      }
      get_leaderboard: {
        Args: { p_month: string }
        Returns: {
          avatar_url: string
          full_name: string
          is_provisional: boolean
          rank: number
          tasks_assigned: number
          tasks_completed: number
          total_score: number
          videographer_id: string
        }[]
      }
      get_team_stats: {
        Args: { p_month: string }
        Returns: {
          clients_served: number
          crew_count: number
          on_time_pct: number
          tasks_assigned: number
          videos_delivered: number
        }[]
      }
      get_top_performer: {
        Args: { p_month: string }
        Returns: {
          avatar_url: string
          full_name: string
          is_provisional: boolean
          public_note: string
          tasks_assigned: number
          tasks_completed: number
          total_score: number
          videographer_id: string
        }[]
      }
      get_vote_candidates: {
        Args: { p_month: string }
        Returns: {
          avatar_url: string
          category: string
          client_name: string
          is_mine: boolean
          links: string[]
          my_vote: boolean
          task_id: string
          title: string
          videographer_id: string
          videographer_name: string
          votes: number
          voting_open: boolean
        }[]
      }
      get_yearly_leaderboard: {
        Args: { p_year: number }
        Returns: {
          avatar_url: string
          avg_score: number
          full_name: string
          months: number
          rank: number
          total_score: number
          videographer_id: string
        }[]
      }
      hook_before_user_created: { Args: { event: Json }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_admin_email: {
        Args: { p_confirmed_at: string; p_email: string }
        Returns: boolean
      }
      is_featured_task: { Args: { p_task_id: string }; Returns: boolean }
      is_month_final: { Args: { p_month: string }; Returns: boolean }
      is_month_locked: {
        Args: { p_month: string; p_videographer_id: string }
        Returns: boolean
      }
      is_privileged: { Args: never; Returns: boolean }
      is_reviewer: { Args: never; Returns: boolean }
      is_service_context: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_vote_candidate: { Args: { p_task_id: string }; Returns: boolean }
      issue_sheet_ping_tokens: {
        Args: { p_spreadsheet_id: string }
        Returns: {
          config_id: string
          tab_name: string
          token: string
        }[]
      }
      log_activity: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_payload?: Json
          p_summary: string
          p_videographer_id: string
        }
        Returns: undefined
      }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      month_start: { Args: { d: string }; Returns: string }
      my_access: { Args: never; Returns: Json }
      notify: {
        Args: {
          p_body: string
          p_link: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      notify_admins: {
        Args: {
          p_body: string
          p_link: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      owns_open_task: { Args: { p_task_id: string }; Returns: boolean }
      publish_assessment: {
        Args: { p_assessment_id: string }
        Returns: {
          admin_remarks: string | null
          approved_count: number
          assigned_count: number
          base_score: number
          bonus_points: number
          bonus_reason: string | null
          completion_pct: number
          computed_at: string
          created_at: string
          discretionary_score: number | null
          id: string
          is_locked: boolean
          max_points_sum: number
          month: string
          on_time_count: number
          points_awarded_sum: number
          points_pct: number
          public_note: string | null
          published_at: string | null
          published_by: string | null
          punctuality_pct: number
          status: Database["public"]["Enums"]["assessment_status"]
          submitted_count: number
          total_score: number
          updated_at: string
          videographer_id: string
          weights: Json
        }
        SetofOptions: {
          from: "*"
          to: "monthly_assessments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_plan: {
        Args: { p_plan_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          goals: string | null
          id: string
          month: string
          published_at: string | null
          status: Database["public"]["Enums"]["plan_status"]
          summary: string | null
          updated_at: string
          videographer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "monthly_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_task: {
        Args: { p_task_id: string }
        Returns: {
          approved_at: string | null
          brief: string | null
          category_id: string
          client_id: string
          created_at: string
          created_by: string | null
          due_date: string
          first_submitted_at: string | null
          id: string
          last_submitted_at: string | null
          max_points: number
          month: string
          plan_id: string
          points_awarded: number | null
          priority: Database["public"]["Enums"]["task_priority"]
          quality_rating: number | null
          sheet_row_ref: string | null
          shoot_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          status_changed_at: string
          status_changed_via: Database["public"]["Enums"]["submission_source"]
          title: string
          updated_at: string
          videographer_id: string
          videographer_notes: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      return_equipment: {
        Args: { p_id: string; p_note?: string }
        Returns: {
          category: string
          checked_out_at: string | null
          created_at: string
          due_back: string | null
          holder_id: string | null
          id: string
          name: string
          notes: string | null
          serial_no: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "equipment"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_task: {
        Args: {
          p_decision: Database["public"]["Enums"]["review_decision"]
          p_feedback?: string
          p_points?: number
          p_rating?: number
          p_task_id: string
        }
        Returns: {
          created_at: string
          decision: Database["public"]["Enums"]["review_decision"]
          feedback: string | null
          id: string
          points_awarded: number | null
          quality_rating: number | null
          reviewed_at: string
          reviewer_id: string | null
          submission_id: string | null
          task_id: string
        }
        SetofOptions: {
          from: "*"
          to: "task_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      safe_ratio: { Args: { p_den: number; p_num: number }; Returns: number }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      set_client_videographers: {
        Args: { p_client_id: string; p_videographer_ids: string[] }
        Returns: number
      }
      set_comment_resolved: {
        Args: { p_id: string; p_resolved: boolean }
        Returns: {
          at_seconds: number | null
          author_id: string | null
          author_name: string | null
          author_staff: boolean
          body: string
          created_at: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          submission_id: string | null
          task_id: string
        }
        SetofOptions: {
          from: "*"
          to: "review_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_equipment_status: {
        Args: { p_id: string; p_note?: string; p_status: string }
        Returns: {
          category: string
          checked_out_at: string | null
          created_at: string
          due_back: string | null
          holder_id: string | null
          id: string
          name: string
          notes: string | null
          serial_no: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "equipment"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_featured_work: {
        Args: { p_month: string; p_picks: Json }
        Returns: {
          chosen_by: string | null
          created_at: string
          id: string
          month: string
          rank: number
          reason: string | null
          task_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "featured_work"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_task_progress: {
        Args: {
          p_source?: Database["public"]["Enums"]["submission_source"]
          p_status: Database["public"]["Enums"]["task_status"]
          p_task_id: string
        }
        Returns: {
          approved_at: string | null
          brief: string | null
          category_id: string
          client_id: string
          created_at: string
          created_by: string | null
          due_date: string
          first_submitted_at: string | null
          id: string
          last_submitted_at: string | null
          max_points: number
          month: string
          plan_id: string
          points_awarded: number | null
          priority: Database["public"]["Enums"]["task_priority"]
          quality_rating: number | null
          sheet_row_ref: string | null
          shoot_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          status_changed_at: string
          status_changed_via: Database["public"]["Enums"]["submission_source"]
          title: string
          updated_at: string
          videographer_id: string
          videographer_notes: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_videographer_clients: {
        Args: { p_client_ids: string[]; p_videographer_id: string }
        Returns: number
      }
      sheet_task_snapshots: {
        Args: { p_videographer_id: string }
        Returns: {
          brief: string
          category: string
          client: string
          due_date: string
          feedback: string
          id: string
          latest_links: string[]
          max_points: number
          month: string
          notes: string
          points_awarded: number
          refs: string[]
          status: Database["public"]["Enums"]["task_status"]
          status_changed_at: string
          title: string
          updated_at: string
        }[]
      }
      start_task: {
        Args: { p_task_id: string }
        Returns: {
          approved_at: string | null
          brief: string | null
          category_id: string
          client_id: string
          created_at: string
          created_by: string | null
          due_date: string
          first_submitted_at: string | null
          id: string
          last_submitted_at: string | null
          max_points: number
          month: string
          plan_id: string
          points_awarded: number | null
          priority: Database["public"]["Enums"]["task_priority"]
          quality_rating: number | null
          sheet_row_ref: string | null
          shoot_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          status_changed_at: string
          status_changed_via: Database["public"]["Enums"]["submission_source"]
          title: string
          updated_at: string
          videographer_id: string
          videographer_notes: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_client_review: {
        Args: {
          p_comment?: string
          p_decision: string
          p_name?: string
          p_rating: number
          p_token: string
        }
        Returns: Json
      }
      submit_task: {
        Args: {
          p_links: string[]
          p_notes?: string
          p_source?: Database["public"]["Enums"]["submission_source"]
          p_submitted_at?: string
          p_task_id: string
          p_thumbnail_path?: string
        }
        Returns: {
          created_at: string
          id: string
          is_on_time: boolean
          links: string[]
          notes: string | null
          source: Database["public"]["Enums"]["submission_source"]
          submitted_at: string
          submitted_by: string | null
          task_id: string
          thumbnail_path: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      task_transition_allowed: {
        Args: {
          p_as_admin: boolean
          p_from: Database["public"]["Enums"]["task_status"]
          p_to: Database["public"]["Enums"]["task_status"]
        }
        Returns: boolean
      }
      today_ist: { Args: never; Returns: string }
      trigger_sheets_sync: { Args: never; Returns: number }
      unlock_assessment: {
        Args: { p_assessment_id: string; p_reason: string }
        Returns: {
          admin_remarks: string | null
          approved_count: number
          assigned_count: number
          base_score: number
          bonus_points: number
          bonus_reason: string | null
          completion_pct: number
          computed_at: string
          created_at: string
          discretionary_score: number | null
          id: string
          is_locked: boolean
          max_points_sum: number
          month: string
          on_time_count: number
          points_awarded_sum: number
          points_pct: number
          public_note: string | null
          published_at: string | null
          published_by: string | null
          punctuality_pct: number
          status: Database["public"]["Enums"]["assessment_status"]
          submitted_count: number
          total_score: number
          updated_at: string
          videographer_id: string
          weights: Json
        }
        SetofOptions: {
          from: "*"
          to: "monthly_assessments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_task_notes: {
        Args: {
          p_notes: string
          p_source?: Database["public"]["Enums"]["submission_source"]
          p_task_id: string
        }
        Returns: {
          approved_at: string | null
          brief: string | null
          category_id: string
          client_id: string
          created_at: string
          created_by: string | null
          due_date: string
          first_submitted_at: string | null
          id: string
          last_submitted_at: string | null
          max_points: number
          month: string
          plan_id: string
          points_awarded: number | null
          priority: Database["public"]["Enums"]["task_priority"]
          quality_rating: number | null
          sheet_row_ref: string | null
          shoot_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          status_changed_at: string
          status_changed_via: Database["public"]["Enums"]["submission_source"]
          title: string
          updated_at: string
          videographer_id: string
          videographer_notes: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      voting_open: { Args: { p_month: string }; Returns: boolean }
    }
    Enums: {
      actor_kind: "user" | "sheet" | "system"
      assessment_status: "draft" | "published"
      plan_status: "draft" | "published"
      reference_kind: "link" | "file" | "note"
      review_decision: "approved" | "revision_requested"
      sheet_mode: "own_sheet" | "master_tab"
      submission_source: "app" | "sheet"
      sync_event_kind:
        | "updated"
        | "submission_created"
        | "written"
        | "unknown_id"
        | "missing_id"
        | "conflict_approved"
        | "conflict_lww"
        | "permission_denied"
        | "bad_link"
        | "invalid_status"
        | "error"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status:
        | "assigned"
        | "in_progress"
        | "submitted"
        | "revision_requested"
        | "approved"
        | "cancelled"
      user_role: "admin" | "videographer" | "reviewer"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      actor_kind: ["user", "sheet", "system"],
      assessment_status: ["draft", "published"],
      plan_status: ["draft", "published"],
      reference_kind: ["link", "file", "note"],
      review_decision: ["approved", "revision_requested"],
      sheet_mode: ["own_sheet", "master_tab"],
      submission_source: ["app", "sheet"],
      sync_event_kind: [
        "updated",
        "submission_created",
        "written",
        "unknown_id",
        "missing_id",
        "conflict_approved",
        "conflict_lww",
        "permission_denied",
        "bad_link",
        "invalid_status",
        "error",
      ],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: [
        "assigned",
        "in_progress",
        "submitted",
        "revision_requested",
        "approved",
        "cancelled",
      ],
      user_role: ["admin", "videographer", "reviewer"],
    },
  },
} as const

