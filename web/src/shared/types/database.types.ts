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
    PostgrestVersion: "14.5"
  }
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
      announcement_audiences: {
        Row: {
          announcement_id: string
          branch_id: string | null
          created_at: string
          id: string
          organization_id: string
          role_id: string | null
          user_id: string | null
        }
        Insert: {
          announcement_id: string
          branch_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          role_id?: string | null
          user_id?: string | null
        }
        Update: {
          announcement_id?: string
          branch_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          role_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_audiences_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_audiences_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "vw_announcements_resolved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_audiences_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_audiences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_audiences_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_deliveries: {
        Row: {
          announcement_id: string
          channel: string
          created_at: string
          id: string
          organization_id: string
          sent_at: string | null
          status: string
          target: string | null
        }
        Insert: {
          announcement_id: string
          channel: string
          created_at?: string
          id?: string
          organization_id: string
          sent_at?: string | null
          status?: string
          target?: string | null
        }
        Update: {
          announcement_id?: string
          channel?: string
          created_at?: string
          id?: string
          organization_id?: string
          sent_at?: string | null
          status?: string
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_deliveries_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_deliveries_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "vw_announcements_resolved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          branch_id: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_featured: boolean
          kind: string
          organization_id: string
          publish_at: string | null
          target_scope: Json
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          branch_id?: string | null
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_featured?: boolean
          kind?: string
          organization_id: string
          publish_at?: string | null
          target_scope?: Json
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          branch_id?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_featured?: boolean
          kind?: string
          organization_id?: string
          publish_at?: string | null
          target_scope?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          branch_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          city: string | null
          code: string | null
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          phone: string | null
          sort_order: number
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          phone?: string | null
          sort_order?: number
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
          sort_order?: number
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_flags: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          reason: string
          reported_by: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          submission_item_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          reason: string
          reported_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          submission_item_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          reason?: string
          reported_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          submission_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_flags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_flags_submission_item_id_fkey"
            columns: ["submission_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_submission_items"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_item_attachments: {
        Row: {
          created_at: string
          file_path: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          organization_id: string
          submission_item_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_path: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          organization_id: string
          submission_item_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_path?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          organization_id?: string
          submission_item_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_item_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_item_attachments_submission_item_id_fkey"
            columns: ["submission_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_submission_items"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_item_comments: {
        Row: {
          author_id: string
          comment: string
          created_at: string
          id: string
          organization_id: string
          submission_item_id: string
        }
        Insert: {
          author_id: string
          comment: string
          created_at?: string
          id?: string
          organization_id: string
          submission_item_id: string
        }
        Update: {
          author_id?: string
          comment?: string
          created_at?: string
          id?: string
          organization_id?: string
          submission_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_item_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_item_comments_submission_item_id_fkey"
            columns: ["submission_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_submission_items"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_submission_items: {
        Row: {
          created_at: string
          id: string
          is_checked: boolean
          is_flagged: boolean
          organization_id: string
          submission_id: string
          template_item_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_checked?: boolean
          is_flagged?: boolean
          organization_id: string
          submission_id: string
          template_item_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_checked?: boolean
          is_flagged?: boolean
          organization_id?: string
          submission_id?: string
          template_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_submission_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_submission_items_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "checklist_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_submission_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_submissions: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          organization_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          submitted_by: string
          template_id: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by: string
          template_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_submissions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          created_at: string
          id: string
          label: string
          organization_id: string
          priority: string
          section_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          organization_id: string
          priority?: string
          section_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          organization_id?: string
          priority?: string
          section_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_sections: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_sections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          branch_id: string | null
          checklist_type: string
          created_at: string
          created_by: string | null
          department: string | null
          department_id: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          repeat_every: string | null
          shift: string | null
          target_scope: Json
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          checklist_type?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          repeat_every?: string | null
          shift?: string | null
          target_scope?: Json
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          checklist_type?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          repeat_every?: string | null
          shift?: string | null
          target_scope?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "organization_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      department_positions: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          department_id: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          department_id: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "organization_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_positions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_access_rules: {
        Row: {
          branch_id: string | null
          can_download: boolean
          can_edit: boolean
          can_read: boolean
          created_at: string
          document_id: string
          id: string
          organization_id: string
          role_id: string | null
          user_id: string | null
        }
        Insert: {
          branch_id?: string | null
          can_download?: boolean
          can_edit?: boolean
          can_read?: boolean
          created_at?: string
          document_id: string
          id?: string
          organization_id: string
          role_id?: string | null
          user_id?: string | null
        }
        Update: {
          branch_id?: string | null
          can_download?: boolean
          can_edit?: boolean
          can_read?: boolean
          created_at?: string
          document_id?: string
          id?: string
          organization_id?: string
          role_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_access_rules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_rules_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_rules_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folders: {
        Row: {
          access_scope: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          access_scope?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          access_scope?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      document_processing_jobs: {
        Row: {
          attempts: number
          created_at: string
          document_id: string
          error_message: string | null
          id: string
          job_type: string
          organization_id: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          document_id: string
          error_message?: string | null
          id?: string
          job_type?: string
          organization_id: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          document_id?: string
          error_message?: string | null
          id?: string
          job_type?: string
          organization_id?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_processing_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          access_scope: Json
          branch_id: string | null
          checksum_sha256: string | null
          created_at: string
          deleted_at: string | null
          file_path: string
          file_size_bytes: number | null
          folder_id: string | null
          id: string
          mime_type: string | null
          organization_id: string
          original_file_name: string | null
          owner_user_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          access_scope?: Json
          branch_id?: string | null
          checksum_sha256?: string | null
          created_at?: string
          deleted_at?: string | null
          file_path: string
          file_size_bytes?: number | null
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          organization_id: string
          original_file_name?: string | null
          owner_user_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          access_scope?: Json
          branch_id?: string | null
          checksum_sha256?: string | null
          created_at?: string
          deleted_at?: string | null
          file_path?: string
          file_size_bytes?: number | null
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          organization_id?: string
          original_file_name?: string | null
          owner_user_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_contracts: {
        Row: {
          branch_id: string | null
          contract_status: string
          contract_type: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_frequency: string | null
          salary_amount: number | null
          salary_currency: string | null
          signed_at: string | null
          signed_document_id: string | null
          signer_name: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          contract_status?: string
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_frequency?: string | null
          salary_amount?: number | null
          salary_currency?: string | null
          signed_at?: string | null
          signed_document_id?: string | null
          signer_name?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          contract_status?: string
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_frequency?: string | null
          salary_amount?: number | null
          salary_currency?: string | null
          signed_at?: string | null
          signed_document_id?: string | null
          signer_name?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_contracts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contracts_signed_document_id_fkey"
            columns: ["signed_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          created_at: string
          document_id: string
          employee_id: string
          expires_at: string | null
          has_no_expiration: boolean
          id: string
          organization_id: string
          pending_reminder_last_sent_at: string | null
          pending_reminder_stage: number
          pending_since_at: string | null
          requested_without_file: boolean
          reminder_days: number | null
          reminder_last_sent_at: string | null
          reminder_sent_for_date: string | null
          signature_completed_at: string | null
          signature_embed_src: string | null
          signature_error: string | null
          signature_provider: string | null
          signature_requested_at: string | null
          signature_requested_by: string | null
          signature_status: string | null
          signature_submission_id: number | null
          signature_submitter_slug: string | null
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          employee_id: string
          expires_at?: string | null
          has_no_expiration?: boolean
          id?: string
          organization_id: string
          pending_reminder_last_sent_at?: string | null
          pending_reminder_stage?: number
          pending_since_at?: string | null
          requested_without_file?: boolean
          reminder_days?: number | null
          reminder_last_sent_at?: string | null
          reminder_sent_for_date?: string | null
          signature_completed_at?: string | null
          signature_embed_src?: string | null
          signature_error?: string | null
          signature_provider?: string | null
          signature_requested_at?: string | null
          signature_requested_by?: string | null
          signature_status?: string | null
          signature_submission_id?: number | null
          signature_submitter_slug?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          employee_id?: string
          expires_at?: string | null
          has_no_expiration?: boolean
          id?: string
          organization_id?: string
          pending_reminder_last_sent_at?: string | null
          pending_reminder_stage?: number
          pending_since_at?: string | null
          requested_without_file?: boolean
          reminder_days?: number | null
          reminder_last_sent_at?: string | null
          reminder_sent_for_date?: string | null
          signature_completed_at?: string | null
          signature_embed_src?: string | null
          signature_error?: string | null
          signature_provider?: string | null
          signature_requested_at?: string | null
          signature_requested_by?: string | null
          signature_status?: string | null
          signature_submission_id?: number | null
          signature_submitter_slug?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_line1: string | null
          address_postal_code: string | null
          address_state: string | null
          birth_date: string | null
          branch_id: string | null
          created_at: string
          department: string | null
          department_id: string | null
          document_number: string | null
          document_type: string | null
          email: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_code: string | null
          first_name: string
          hired_at: string | null
          id: string
          last_name: string
          nationality: string | null
          organization_id: string
          personal_email: string | null
          phone: string | null
          phone_country_code: string | null
          position: string | null
          sex: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          birth_date?: string | null
          branch_id?: string | null
          created_at?: string
          department?: string | null
          department_id?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          emergency_contact_email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_code?: string | null
          first_name: string
          hired_at?: string | null
          id?: string
          last_name: string
          nationality?: string | null
          organization_id: string
          personal_email?: string | null
          phone?: string | null
          phone_country_code?: string | null
          position?: string | null
          sex?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          birth_date?: string | null
          branch_id?: string | null
          created_at?: string
          department?: string | null
          department_id?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          emergency_contact_email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_code?: string | null
          first_name?: string
          hired_at?: string | null
          id?: string
          last_name?: string
          nationality?: string | null
          organization_id?: string
          personal_email?: string | null
          phone?: string | null
          phone_country_code?: string | null
          position?: string | null
          sex?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "organization_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_messages: {
        Row: {
          created_at: string
          feedback_type: string
          id: string
          message: string
          organization_id: string
          page_path: string | null
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_type?: string
          id?: string
          message: string
          organization_id: string
          page_path?: string | null
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_type?: string
          id?: string
          message?: string
          organization_id?: string
          page_path?: string | null
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          organization_id: string
          role_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          role_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          role_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      module_catalog: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_core: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_core?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_core?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_departments: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string | null
          first_login_completed_at: string | null
          first_login_user_id: string | null
          full_name: string | null
          id: string
          invitation_code: string
          metadata: Json | null
          organization_id: string
          role_code: string
          sent_at: string
          sent_by: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string | null
          first_login_completed_at?: string | null
          first_login_user_id?: string | null
          full_name?: string | null
          id?: string
          invitation_code: string
          metadata?: Json | null
          organization_id: string
          role_code?: string
          sent_at?: string
          sent_by?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string | null
          first_login_completed_at?: string | null
          first_login_user_id?: string | null
          full_name?: string | null
          id?: string
          invitation_code?: string
          metadata?: Json | null
          organization_id?: string
          role_code?: string
          sent_at?: string
          sent_by?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_limits: {
        Row: {
          created_at: string
          id: string
          max_branches: number | null
          max_employees: number | null
          max_storage_mb: number | null
          max_users: number | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_branches?: number | null
          max_employees?: number | null
          max_storage_mb?: number | null
          max_users?: number | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_branches?: number | null
          max_employees?: number | null
          max_storage_mb?: number | null
          max_users?: number | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_limits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_modules: {
        Row: {
          created_at: string
          enabled_at: string | null
          id: string
          is_enabled: boolean
          module_id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled_at?: string | null
          id?: string
          is_enabled?: boolean
          module_id: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled_at?: string | null
          id?: string
          is_enabled?: boolean
          module_id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "module_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_modules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          accent_color: string | null
          billed_to: string | null
          billing_email: string | null
          billing_period: string | null
          billing_plan: string | null
          company_favicon_path: string | null
          company_favicon_url: string | null
          company_logo_dark_path: string | null
          company_logo_dark_url: string | null
          company_logo_path: string | null
          company_logo_url: string | null
          created_at: string
          dashboard_note: string | null
          feedback_whatsapp: string | null
          invoice_emails_enabled: boolean | null
          organization_id: string
          payment_last4: string | null
          primary_color: string | null
          support_email: string | null
          support_phone: string | null
          timezone: string | null
          updated_at: string
          updated_by: string | null
          website_url: string | null
        }
        Insert: {
          accent_color?: string | null
          billed_to?: string | null
          billing_email?: string | null
          billing_period?: string | null
          billing_plan?: string | null
          company_favicon_path?: string | null
          company_favicon_url?: string | null
          company_logo_dark_path?: string | null
          company_logo_dark_url?: string | null
          company_logo_path?: string | null
          company_logo_url?: string | null
          created_at?: string
          dashboard_note?: string | null
          feedback_whatsapp?: string | null
          invoice_emails_enabled?: boolean | null
          organization_id: string
          payment_last4?: string | null
          primary_color?: string | null
          support_email?: string | null
          support_phone?: string | null
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
          website_url?: string | null
        }
        Update: {
          accent_color?: string | null
          billed_to?: string | null
          billing_email?: string | null
          billing_period?: string | null
          billing_plan?: string | null
          company_favicon_path?: string | null
          company_favicon_url?: string | null
          company_logo_dark_path?: string | null
          company_logo_dark_url?: string | null
          company_logo_path?: string | null
          company_logo_url?: string | null
          created_at?: string
          dashboard_note?: string | null
          feedback_whatsapp?: string | null
          invoice_emails_enabled?: boolean | null
          organization_id?: string
          payment_last4?: string | null
          primary_color?: string | null
          support_email?: string | null
          support_phone?: string | null
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_user_profiles: {
        Row: {
          branch_id: string | null
          created_at: string
          department_id: string | null
          email: string | null
          employee_id: string | null
          first_name: string | null
          id: string
          is_employee: boolean
          last_name: string | null
          organization_id: string
          phone: string | null
          position_id: string | null
          source: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          employee_id?: string | null
          first_name?: string | null
          id?: string
          is_employee?: boolean
          last_name?: string | null
          organization_id: string
          phone?: string | null
          position_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          employee_id?: string | null
          first_name?: string | null
          id?: string
          is_employee?: boolean
          last_name?: string | null
          organization_id?: string
          phone?: string | null
          position_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_user_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_user_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "organization_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_user_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_user_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_user_profiles_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "department_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_activated_at: string | null
          billing_activation_status: string
          billing_onboarding_required: boolean
          country_code: string | null
          created_at: string
          created_by: string | null
          id: string
          legal_name: string | null
          name: string
          plan_id: string | null
          slug: string
          status: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          billing_activated_at?: string | null
          billing_activation_status?: string
          billing_onboarding_required?: boolean
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          legal_name?: string | null
          name: string
          plan_id?: string | null
          slug: string
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          billing_activated_at?: string | null
          billing_activation_status?: string
          billing_onboarding_required?: boolean
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          plan_id?: string | null
          slug?: string
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          module_code: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          module_code: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          module_code?: string
        }
        Relationships: []
      }
      plan_modules: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          module_id: string
          plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          module_id: string
          plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          module_id?: string
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "module_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_modules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_period: string | null
          code: string
          created_at: string
          currency_code: string | null
          description: string | null
          id: string
          is_active: boolean
          max_branches: number | null
          max_employees: number | null
          max_storage_mb: number | null
          max_users: number | null
          name: string
          price_amount: number | null
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          billing_period?: string | null
          code: string
          created_at?: string
          currency_code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_branches?: number | null
          max_employees?: number | null
          max_storage_mb?: number | null
          max_users?: number | null
          name: string
          price_amount?: number | null
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_period?: string | null
          code?: string
          created_at?: string
          currency_code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_branches?: number | null
          max_employees?: number | null
          max_storage_mb?: number | null
          max_users?: number | null
          name?: string
          price_amount?: number | null
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          id: string
          is_system: boolean
          level: number
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_system?: boolean
          level?: number
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_system?: boolean
          level?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_jobs: {
        Row: {
          created_at: string
          cron_expression: string | null
          custom_days: number[] | null
          id: string
          is_active: boolean
          job_type: string
          last_run_at: string | null
          metadata: Json | null
          next_run_at: string
          organization_id: string
          recurrence_type: string
          target_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cron_expression?: string | null
          custom_days?: number[] | null
          id?: string
          is_active?: boolean
          job_type: string
          last_run_at?: string | null
          metadata?: Json | null
          next_run_at: string
          organization_id: string
          recurrence_type: string
          target_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cron_expression?: string | null
          custom_days?: number[] | null
          id?: string
          is_active?: boolean
          job_type?: string
          last_run_at?: string | null
          metadata?: Json | null
          next_run_at?: string
          organization_id?: string
          recurrence_type?: string
          target_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_customers: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          stripe_customer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          stripe_customer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          stripe_customer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_processed_events: {
        Row: {
          event_id: string
          processed_at: string
        }
        Insert: {
          event_id: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          processed_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          organization_id: string
          plan_id: string | null
          price_id: string
          quantity: number
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          organization_id: string
          plan_id?: string | null
          price_id: string
          quantity?: number
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          organization_id?: string
          plan_id?: string | null
          price_id?: string
          quantity?: number
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_stripe_customer_id_fkey"
            columns: ["stripe_customer_id"]
            isOneToOne: false
            referencedRelation: "stripe_customers"
            referencedColumns: ["stripe_customer_id"]
          },
        ]
      }
      superadmin_impersonation_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          reason: string | null
          revoked_at: string | null
          superadmin_user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id: string
          organization_id: string
          reason?: string | null
          revoked_at?: string | null
          superadmin_user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          reason?: string | null
          revoked_at?: string | null
          superadmin_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "superadmin_impersonation_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      superadmin_users: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          analytics_enabled: boolean
          created_at: string
          date_format: string
          language: string
          onboarding_seen_at: string | null
          organization_id: string
          theme: string
          timezone_manual: string | null
          timezone_mode: string
          two_factor_enabled: boolean
          two_factor_method: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analytics_enabled?: boolean
          created_at?: string
          date_format?: string
          language?: string
          onboarding_seen_at?: string | null
          organization_id: string
          theme?: string
          timezone_manual?: string | null
          timezone_mode?: string
          two_factor_enabled?: boolean
          two_factor_method?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analytics_enabled?: boolean
          created_at?: string
          date_format?: string
          language?: string
          onboarding_seen_at?: string | null
          organization_id?: string
          theme?: string
          timezone_manual?: string | null
          timezone_mode?: string
          two_factor_enabled?: boolean
          two_factor_method?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_announcements_resolved: {
        Row: {
          author_name: string | null
          body: string | null
          branch_id: string | null
          created_by: string | null
          expires_at: string | null
          id: string | null
          is_featured: boolean | null
          kind: string | null
          organization_id: string | null
          publish_at: string | null
          resolved_departments: Json | null
          resolved_locations: Json | null
          resolved_positions: Json | null
          resolved_users: Json | null
          target_scope: Json | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      announcement_scope_match:
        | {
            Args: {
              employee_department_id: string
              member_branch_id: string
              member_user_id: string
              scope: Json
            }
            Returns: boolean
          }
        | {
            Args: {
              employee_department_id: string
              employee_position_ids?: string[]
              member_branch_id: string
              member_user_id: string
              scope: Json
            }
            Returns: boolean
          }
      can_manage_org: { Args: { org_id: string }; Returns: boolean }
      can_read_announcement: {
        Args: {
          ann_branch_id: string
          ann_id: string
          ann_org_id: string
          ann_scope: Json
        }
        Returns: boolean
      }
      can_read_checklist_submission: {
        Args: { submission_id: string; submission_org_id: string }
        Returns: boolean
      }
      can_read_checklist_template: {
        Args: {
          template_branch_id: string
          template_department_id: string
          template_org_id: string
          template_scope: Json
        }
        Returns: boolean
      }
      can_read_document: {
        Args: {
          doc_access_scope: Json
          doc_branch_id: string
          doc_id: string
          doc_org_id: string
        }
        Returns: boolean
      }
      can_submit_checklist: {
        Args: {
          submission_org_id: string
          submitted_by: string
          template_id: string
        }
        Returns: boolean
      }
      checklist_scope_match:
        | {
            Args: {
              employee_department_id: string
              member_branch_id: string
              member_user_id: string
              scope: Json
            }
            Returns: boolean
          }
        | {
            Args: {
              employee_department_id: string
              employee_position_ids?: string[]
              member_branch_id: string
              member_user_id: string
              scope: Json
            }
            Returns: boolean
          }
      count_accessible_documents: {
        Args: {
          p_branch_id?: string
          p_department_id?: string
          p_organization_id: string
          p_position_ids?: string[]
          p_role_code: string
          p_user_id: string
        }
        Returns: number
      }
      create_employee_transaction: {
        Args: {
          p_address_city: string
          p_address_country: string
          p_address_line1: string
          p_address_postal_code: string
          p_address_state: string
          p_birth_date: string
          p_branch_id: string
          p_contract_end_date: string
          p_contract_notes: string
          p_contract_signed_at: string
          p_contract_signer_name: string
          p_contract_start_date: string
          p_contract_status: string
          p_contract_type: string
          p_create_membership: boolean
          p_department: string
          p_department_id: string
          p_documents: Json
          p_email: string
          p_emergency_contact_email: string
          p_emergency_contact_name: string
          p_emergency_contact_phone: string
          p_first_name: string
          p_hired_at: string
          p_last_name: string
          p_linked_user_id: string
          p_nationality: string
          p_organization_id: string
          p_payment_frequency: string
          p_phone: string
          p_phone_country_code: string
          p_position: string
          p_position_id: string
          p_profile_source: string
          p_role_id: string
          p_salary_amount: number
          p_salary_currency: string
          p_sex: string
          p_status: string
        }
        Returns: Json
      }
      current_user_id: { Args: never; Returns: string }
      get_company_users: {
        Args: { lookup_organization_id: string }
        Returns: {
          branch_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          role_id: string
          status: string
          user_id: string
        }[]
      }
      get_employee_access_context: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: {
          branch_id: string
          has_membership: boolean
          membership_id: string
          role_code: string
        }[]
      }
      get_organization_storage_bytes: {
        Args: { p_org_id: string }
        Returns: number
      }
      get_tenant_access_context: {
        Args: {
          p_module_code: string
          p_organization_id: string
          p_user_id: string
        }
        Returns: {
          billing_onboarding_required: boolean
          branch_id: string
          has_membership: boolean
          membership_id: string
          module_enabled: boolean
          role_code: string
          subscription_period_end: string
          subscription_status: string
        }[]
      }
      get_user_id_by_email: { Args: { lookup_email: string }; Returns: string }
      has_org_membership: { Args: { org_id: string }; Returns: boolean }
      has_org_role: {
        Args: { org_id: string; role_code: string }
        Returns: boolean
      }
      is_module_enabled: {
        Args: { module_code: string; org_id: string }
        Returns: boolean
      }
      is_superadmin: { Args: never; Returns: boolean }
      submit_checklist_transaction: {
        Args: {
          p_branch_id: string
          p_items: Json
          p_organization_id: string
          p_submission_id: string
          p_submitted_at: string
          p_submitted_by: string
          p_template_id: string
        }
        Returns: undefined
      }
      superadmin_org_health_snapshot: {
        Args: never
        Returns: {
          active_admins: number
          active_announcements: number
          active_employees: number
          active_members: number
          checklist_7d: number
          docs_30d: number
          enabled_modules: number
          name: string
          organization_id: string
          plan_id: string
          status: string
          storage_limit_mb: number
          storage_mb: number
        }[]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
