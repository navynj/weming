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
      board_layouts: {
        Row: {
          id: string
          layout: Json
          pool_id: string | null
          scope: string
          splash_id: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          layout?: Json
          pool_id?: string | null
          scope: string
          splash_id: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          layout?: Json
          pool_id?: string | null
          scope?: string
          splash_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_layouts_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_layouts_splash_id_fkey"
            columns: ["splash_id"]
            isOneToOne: false
            referencedRelation: "splashes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_layouts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_layouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      joint_invitees: {
        Row: {
          id: string
          invited_at: string
          pool_id: string | null
          splash_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string
          pool_id?: string | null
          splash_id: string
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string
          pool_id?: string | null
          splash_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "joint_invitees_placement_fkey"
            columns: ["splash_id", "pool_id"]
            isOneToOne: false
            referencedRelation: "splash_placements"
            referencedColumns: ["splash_id", "pool_id"]
          },
          {
            foreignKeyName: "joint_invitees_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "joint_invitees_splash_id_fkey"
            columns: ["splash_id"]
            isOneToOne: false
            referencedRelation: "splashes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "joint_invitees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_mappings: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          is_home: boolean
          my_category_id: string
          pool_id: string
          pool_lane_id: string
          share_by_default: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_home?: boolean
          my_category_id: string
          pool_id: string
          pool_lane_id: string
          share_by_default?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_home?: boolean
          my_category_id?: string
          pool_id?: string
          pool_lane_id?: string
          share_by_default?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lane_mappings_my_category_id_fkey"
            columns: ["my_category_id"]
            isOneToOne: false
            referencedRelation: "my_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_mappings_pool_lane_fkey"
            columns: ["pool_lane_id", "pool_id"]
            isOneToOne: false
            referencedRelation: "pool_lanes"
            referencedColumns: ["id", "pool_id"]
          },
          {
            foreignKeyName: "lane_mappings_pool_lane_id_fkey"
            columns: ["pool_lane_id"]
            isOneToOne: false
            referencedRelation: "pool_lanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_mappings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          created_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      list_members: {
        Row: {
          list_id: string
          member_id: string
        }
        Insert: {
          list_id: string
          member_id: string
        }
        Update: {
          list_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      my_categories: {
        Row: {
          created_at: string
          default_mode: Database["public"]["Enums"]["ripple_mode"]
          icon: string | null
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          default_mode?: Database["public"]["Enums"]["ripple_mode"]
          icon?: string | null
          id?: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          default_mode?: Database["public"]["Enums"]["ripple_mode"]
          icon?: string | null
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "my_categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_invites: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          pool_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          pool_id: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          pool_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_invites_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_lanes: {
        Row: {
          description: string | null
          icon: string | null
          id: string
          name: string
          pool_id: string
          position: number
        }
        Insert: {
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          pool_id: string
          position?: number
        }
        Update: {
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          pool_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pool_lanes_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_members: {
        Row: {
          include_history: boolean
          joined_at: string
          keep_on_leave: boolean | null
          left_at: string | null
          on_home: boolean
          pool_id: string
          user_id: string
        }
        Insert: {
          include_history?: boolean
          joined_at?: string
          keep_on_leave?: boolean | null
          left_at?: string | null
          on_home?: boolean
          pool_id: string
          user_id: string
        }
        Update: {
          include_history?: boolean
          joined_at?: string
          keep_on_leave?: boolean | null
          left_at?: string | null
          on_home?: boolean
          pool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_members_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pools: {
        Row: {
          born_from_splash: string | null
          created_at: string
          ephemeral: boolean
          id: string
          invite_all_by_default: boolean
          invite_code: string | null
          kind: Database["public"]["Enums"]["pool_kind"] | null
          name: string
          owner_id: string | null
          photo_path: string | null
          photo_version: number | null
          visibility: Database["public"]["Enums"]["pool_visibility"]
        }
        Insert: {
          born_from_splash?: string | null
          created_at?: string
          ephemeral?: boolean
          id?: string
          invite_all_by_default?: boolean
          invite_code?: string | null
          kind?: Database["public"]["Enums"]["pool_kind"] | null
          name: string
          owner_id?: string | null
          photo_path?: string | null
          photo_version?: number | null
          visibility?: Database["public"]["Enums"]["pool_visibility"]
        }
        Update: {
          born_from_splash?: string | null
          created_at?: string
          ephemeral?: boolean
          id?: string
          invite_all_by_default?: boolean
          invite_code?: string | null
          kind?: Database["public"]["Enums"]["pool_kind"] | null
          name?: string
          owner_id?: string | null
          photo_path?: string | null
          photo_version?: number | null
          visibility?: Database["public"]["Enums"]["pool_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "pools_born_from_splash_fkey"
            columns: ["born_from_splash"]
            isOneToOne: false
            referencedRelation: "splashes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pools_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          avatar_url: string | null
          avatar_version: number | null
          created_at: string
          display_name: string
          id: string
          last_active_at: string
          theme_color: string
          theme_mode: string
          timezone: string
        }
        Insert: {
          avatar_path?: string | null
          avatar_url?: string | null
          avatar_version?: number | null
          created_at?: string
          display_name: string
          id: string
          last_active_at?: string
          theme_color?: string
          theme_mode?: string
          timezone?: string
        }
        Update: {
          avatar_path?: string | null
          avatar_url?: string | null
          avatar_version?: number | null
          created_at?: string
          display_name?: string
          id?: string
          last_active_at?: string
          theme_color?: string
          theme_mode?: string
          timezone?: string
        }
        Relationships: []
      }
      ripple_audience: {
        Row: {
          list_id: string | null
          pool_id: string | null
          ripple_id: string
          target_type: Database["public"]["Enums"]["audience_target"]
        }
        Insert: {
          list_id?: string | null
          pool_id?: string | null
          ripple_id: string
          target_type: Database["public"]["Enums"]["audience_target"]
        }
        Update: {
          list_id?: string | null
          pool_id?: string | null
          ripple_id?: string
          target_type?: Database["public"]["Enums"]["audience_target"]
        }
        Relationships: [
          {
            foreignKeyName: "ripple_audience_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ripple_audience_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ripple_audience_ripple_id_fkey"
            columns: ["ripple_id"]
            isOneToOne: false
            referencedRelation: "ripples"
            referencedColumns: ["id"]
          },
        ]
      }
      ripple_reactions: {
        Row: {
          created_at: string
          emoji: string
          ripple_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          ripple_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          ripple_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ripple_reactions_ripple_id_fkey"
            columns: ["ripple_id"]
            isOneToOne: false
            referencedRelation: "ripples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ripple_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ripple_replies: {
        Row: {
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          ripple_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          ripple_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          ripple_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ripple_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ripple_replies_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ripple_replies_ripple_id_fkey"
            columns: ["ripple_id"]
            isOneToOne: false
            referencedRelation: "ripples"
            referencedColumns: ["id"]
          },
        ]
      }
      ripple_views: {
        Row: {
          ripple_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          ripple_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          ripple_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ripple_views_ripple_id_fkey"
            columns: ["ripple_id"]
            isOneToOne: false
            referencedRelation: "ripples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ripple_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ripples: {
        Row: {
          author_id: string
          created_at: string
          ended_at: string | null
          id: string
          media: string[]
          note: string | null
          occurred_on: string | null
          occurred_time: string | null
          parent_ripple_id: string | null
          participants: string[]
          planned: boolean
          splash_id: string | null
          started_at: string | null
          thread_pool_id: string | null
          written_on: string
        }
        Insert: {
          author_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          media?: string[]
          note?: string | null
          occurred_on?: string | null
          occurred_time?: string | null
          parent_ripple_id?: string | null
          participants?: string[]
          planned?: boolean
          splash_id?: string | null
          started_at?: string | null
          thread_pool_id?: string | null
          written_on?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          media?: string[]
          note?: string | null
          occurred_on?: string | null
          occurred_time?: string | null
          parent_ripple_id?: string | null
          participants?: string[]
          planned?: boolean
          splash_id?: string | null
          started_at?: string | null
          thread_pool_id?: string | null
          written_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "ripples_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ripples_parent_ripple_id_fkey"
            columns: ["parent_ripple_id"]
            isOneToOne: false
            referencedRelation: "ripples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ripples_splash_id_fkey"
            columns: ["splash_id"]
            isOneToOne: false
            referencedRelation: "splashes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ripples_thread_placement_fkey"
            columns: ["splash_id", "thread_pool_id"]
            isOneToOne: false
            referencedRelation: "splash_placements"
            referencedColumns: ["splash_id", "pool_id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          declared_end: string | null
          declared_start: string | null
          id: string
          kind: Database["public"]["Enums"]["session_kind"]
          lane_id: string | null
          month: string | null
          owner_id: string
          title: string
        }
        Insert: {
          created_at?: string
          declared_end?: string | null
          declared_start?: string | null
          id?: string
          kind: Database["public"]["Enums"]["session_kind"]
          lane_id?: string | null
          month?: string | null
          owner_id: string
          title: string
        }
        Update: {
          created_at?: string
          declared_end?: string | null
          declared_start?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["session_kind"]
          lane_id?: string | null
          month?: string | null
          owner_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "my_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      splash_origins: {
        Row: {
          id: string
          pool_lane_icon: string | null
          pool_lane_name: string
          pool_name: string
          recorded_at: string
          splash_id: string
        }
        Insert: {
          id?: string
          pool_lane_icon?: string | null
          pool_lane_name: string
          pool_name: string
          recorded_at?: string
          splash_id: string
        }
        Update: {
          id?: string
          pool_lane_icon?: string | null
          pool_lane_name?: string
          pool_name?: string
          recorded_at?: string
          splash_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "splash_origins_splash_id_fkey"
            columns: ["splash_id"]
            isOneToOne: false
            referencedRelation: "splashes"
            referencedColumns: ["id"]
          },
        ]
      }
      splash_placements: {
        Row: {
          created_at: string
          invite_all: boolean
          origin_pool_lane_icon: string | null
          origin_pool_lane_name: string | null
          origin_pool_name: string | null
          pool_id: string
          pool_lane_id: string
          shared: boolean
          splash_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          invite_all?: boolean
          origin_pool_lane_icon?: string | null
          origin_pool_lane_name?: string | null
          origin_pool_name?: string | null
          pool_id: string
          pool_lane_id: string
          shared?: boolean
          splash_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          invite_all?: boolean
          origin_pool_lane_icon?: string | null
          origin_pool_lane_name?: string | null
          origin_pool_name?: string | null
          pool_id?: string
          pool_lane_id?: string
          shared?: boolean
          splash_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "splash_placements_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "splash_placements_pool_lane_fkey"
            columns: ["pool_lane_id", "pool_id"]
            isOneToOne: false
            referencedRelation: "pool_lanes"
            referencedColumns: ["id", "pool_id"]
          },
          {
            foreignKeyName: "splash_placements_splash_id_fkey"
            columns: ["splash_id"]
            isOneToOne: false
            referencedRelation: "splashes"
            referencedColumns: ["id"]
          },
        ]
      }
      splashes: {
        Row: {
          created_at: string
          created_by: string | null
          declared_end: string | null
          declared_lane_id: string | null
          declared_start: string | null
          description: string | null
          ends_at: string | null
          icon: string | null
          id: string
          joint_invite_all: boolean
          own_pool_id: string | null
          owner_id: string | null
          pinned_at: string | null
          pool_id: string | null
          pool_lane_id: string | null
          prompt: string | null
          session_id: string | null
          title: string
          type: Database["public"]["Enums"]["splash_type"]
          written_on: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          declared_end?: string | null
          declared_lane_id?: string | null
          declared_start?: string | null
          description?: string | null
          ends_at?: string | null
          icon?: string | null
          id?: string
          joint_invite_all?: boolean
          own_pool_id?: string | null
          owner_id?: string | null
          pinned_at?: string | null
          pool_id?: string | null
          pool_lane_id?: string | null
          prompt?: string | null
          session_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["splash_type"]
          written_on?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          declared_end?: string | null
          declared_lane_id?: string | null
          declared_start?: string | null
          description?: string | null
          ends_at?: string | null
          icon?: string | null
          id?: string
          joint_invite_all?: boolean
          own_pool_id?: string | null
          owner_id?: string | null
          pinned_at?: string | null
          pool_id?: string | null
          pool_lane_id?: string | null
          prompt?: string | null
          session_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["splash_type"]
          written_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "splashes_created_by_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "splashes_created_by_fkey1"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "splashes_declared_lane_id_fkey"
            columns: ["declared_lane_id"]
            isOneToOne: false
            referencedRelation: "my_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "splashes_own_pool_id_fkey"
            columns: ["own_pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "splashes_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "splashes_pool_lane_fkey"
            columns: ["pool_lane_id", "pool_id"]
            isOneToOne: false
            referencedRelation: "pool_lanes"
            referencedColumns: ["id", "pool_id"]
          },
          {
            foreignKeyName: "splashes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _board_layout_clear: { Args: { l: Json; paths: string[] }; Returns: Json }
      _board_layout_merge: { Args: { base: Json; patch: Json }; Returns: Json }
      _board_layout_prune: { Args: { l: Json; media: string[] }; Returns: Json }
      _detach_thread: {
        Args: { made?: Json; pid: string; sid: string }
        Returns: undefined
      }
      _home_lane_for: { Args: { sid: string; uid: string }; Returns: string }
      _invite_pool: { Args: { p_token: string }; Returns: string }
      _joint_pool: { Args: { sid: string }; Returns: string }
      _layout_group: { Args: { g: Json; kind: string }; Returns: boolean }
      _layout_number: {
        Args: { hi: number; lo: number; v: Json }
        Returns: boolean
      }
      _place_on: {
        Args: { cid: string; plid: string; sid: string; uid: string }
        Returns: undefined
      }
      _require_member: { Args: { pid: string }; Returns: string }
      _require_only_mine: {
        Args: { sid: string; uid: string }
        Returns: undefined
      }
      _require_uid: { Args: never; Returns: string }
      _ripple_pools: { Args: { rid: string }; Returns: string[] }
      _set_links: {
        Args: { p_links: Json; pid: string; uid: string }
        Returns: undefined
      }
      _settle_lane_default: {
        Args: { cid: string; pid: string }
        Returns: undefined
      }
      _splash_lane: { Args: { sid: string }; Returns: string }
      add_joint_invitees: {
        Args: { p_everyone?: boolean; p_splash: string; p_users: string[] }
        Returns: undefined
      }
      add_reply: {
        Args: { p_body: string; p_id?: string; p_ripple: string }
        Returns: string
      }
      board_layout_valid: { Args: { l: Json }; Returns: boolean }
      can_read_responses: { Args: { rid: string }; Returns: boolean }
      can_respond: { Args: { rid: string }; Returns: boolean }
      can_see_ripple: { Args: { rid: string }; Returns: boolean }
      create_invite: {
        Args: { p_pool: string }
        Returns: {
          expires_at: string
          token: string
        }[]
      }
      create_own_pool_splash: {
        Args: {
          p_declared_start?: string
          p_icon?: string
          p_id: string
          p_pool: string
          p_pool_lane: string
          p_title: string
        }
        Returns: string
      }
      create_pool: {
        Args: {
          p_include_history: boolean
          p_kind: Database["public"]["Enums"]["pool_kind"]
          p_lanes: Json
          p_name: string
        }
        Returns: string
      }
      create_together_splash: {
        Args: {
          p_declared_start: string
          p_icon: string
          p_id: string
          p_invite_all: boolean
          p_pool: string
          p_pool_lane: string
          p_title: string
        }
        Returns: string
      }
      delete_joint_splash: { Args: { p_splash: string }; Returns: undefined }
      delete_pool: { Args: { p_pool: string }; Returns: undefined }
      delete_reply: { Args: { p_reply: string }; Returns: undefined }
      edit_reply: {
        Args: { p_body: string; p_reply: string }
        Returns: undefined
      }
      hide_reply: {
        Args: { p_hidden?: boolean; p_reply: string }
        Returns: undefined
      }
      invite_photo: {
        Args: { p_token: string }
        Returns: {
          photo_path: string
          photo_version: number
        }[]
      }
      invite_preview: {
        Args: { p_token: string }
        Returns: {
          member_initials: string[]
          pool_name: string
        }[]
      }
      is_current_member: { Args: { pid: string }; Returns: boolean }
      is_linked: { Args: { other: string }; Returns: boolean }
      is_pool_creator: { Args: { object_name: string }; Returns: boolean }
      join_pool: {
        Args: { p_include_history: boolean; p_links: Json; p_token: string }
        Returns: string
      }
      joint_together: {
        Args: { p_splashes: string[] }
        Returns: {
          splash_id: string
          user_id: string
        }[]
      }
      lane_is_mine_in: { Args: { plid: string }; Returns: boolean }
      leave_pool: {
        Args: { p_keep: boolean; p_pool: string }
        Returns: undefined
      }
      member_visible: { Args: { pid: string; uid: string }; Returns: boolean }
      move_pool_splash: {
        Args: { p_pool_lane: string; p_splash: string }
        Returns: undefined
      }
      my_left_pool_ripples: {
        Args: never
        Returns: {
          pool_id: string
          ripple_id: string
        }[]
      }
      my_thread_ripples: {
        Args: never
        Returns: {
          declared_end: string
          declared_start: string
          icon: string
          owner_id: string
          pool_id: string
          pool_lane_icon: string
          pool_lane_id: string
          pool_lane_name: string
          pool_name: string
          ripple_id: string
          shared: boolean
          splash_id: string
          title: string
        }[]
      }
      placement_together: {
        Args: { p_splashes: string[] }
        Returns: {
          pool_id: string
          splash_id: string
          user_id: string
        }[]
      }
      record_ripple_view: { Args: { rid: string }; Returns: undefined }
      rename_pool: {
        Args: { p_name: string; p_pool: string }
        Returns: undefined
      }
      responder_former: { Args: { rid: string; uid: string }; Returns: boolean }
      responder_visible: {
        Args: { rid: string; uid: string }
        Returns: boolean
      }
      revoke_invite: { Args: { p_invite: string }; Returns: undefined }
      ripple_author: { Args: { rid: string }; Returns: string }
      ripple_in_my_pools: { Args: { rid: string }; Returns: boolean }
      ripple_is_locked: { Args: { rid: string }; Returns: boolean }
      ripple_replies_for: {
        Args: { p_ripples: string[] }
        Returns: {
          author_id: string
          body: string
          created_at: string
          edited_at: string
          former: boolean
          hidden: boolean
          id: string
          ripple_id: string
        }[]
      }
      ripple_span: {
        Args: { ended: string; started: string }
        Returns: unknown
      }
      ripple_writable: { Args: { sid: string; tp: string }; Returns: boolean }
      set_board_layout: {
        Args: {
          p_clear?: string[]
          p_patch: Json
          p_pool: string
          p_splash: string
        }
        Returns: Json
      }
      set_joint_together: {
        Args: { p_everyone: boolean; p_splash: string; p_users: string[] }
        Returns: undefined
      }
      set_lane_links: {
        Args: { p_links: Json; p_pool: string }
        Returns: undefined
      }
      set_placement_together: {
        Args: {
          p_everyone: boolean
          p_pool: string
          p_splash: string
          p_users: string[]
        }
        Returns: undefined
      }
      set_pool_invite_all: {
        Args: { p_on: boolean; p_pool: string }
        Returns: undefined
      }
      set_pool_on_home: {
        Args: { p_on: boolean; p_pool: string }
        Returns: undefined
      }
      set_pool_photo: {
        Args: { p_on: boolean; p_pool: string }
        Returns: undefined
      }
      set_splash_lane: {
        Args: { p_my_lane: string; p_place_on?: string; p_splash: string }
        Returns: undefined
      }
      shares_pool: { Args: { other: string }; Returns: boolean }
      splash_in_my_pools: { Args: { sid: string }; Returns: boolean }
      splash_in_pool: { Args: { pid: string; sid: string }; Returns: boolean }
      splash_owner: { Args: { sid: string }; Returns: string }
      splash_to_mine: {
        Args: { p_my_lane: string; p_place_on?: string; p_splash: string }
        Returns: undefined
      }
      splash_to_together: {
        Args: { p_invite_all: boolean; p_pool_lane: string; p_splash: string }
        Returns: undefined
      }
      splash_writable: { Args: { sid: string }; Returns: boolean }
      visible_avatars: { Args: { uids: string[] }; Returns: string[] }
      visible_pool_photos: { Args: { pids: string[] }; Returns: string[] }
    }
    Enums: {
      audience_target: "list" | "pool" | "lock"
      pool_kind:
        | "couple_diary"
        | "study"
        | "running_crew"
        | "faith_group"
        | "friends"
      pool_visibility: "private" | "open"
      ripple_mode: "drop" | "timed"
      session_kind: "monthly" | "custom"
      splash_type: "free" | "prompted"
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
      audience_target: ["list", "pool", "lock"],
      pool_kind: [
        "couple_diary",
        "study",
        "running_crew",
        "faith_group",
        "friends",
      ],
      pool_visibility: ["private", "open"],
      ripple_mode: ["drop", "timed"],
      session_kind: ["monthly", "custom"],
      splash_type: ["free", "prompted"],
    },
  },
} as const

