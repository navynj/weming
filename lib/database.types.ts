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
      app_opens: {
        Row: {
          id: string
          notification_id: string | null
          notification_permission: string | null
          platform: string
          source: string
          started_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_id?: string | null
          notification_permission?: string | null
          platform: string
          source: string
          started_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notification_id?: string | null
          notification_permission?: string | null
          platform?: string
          source?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_opens_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_opens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          view: string
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
          view?: string
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
          view?: string
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
      home_filing: {
        Row: {
          created_at: string
          my_lane_id: string
          splash_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          my_lane_id: string
          splash_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          my_lane_id?: string
          splash_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_filing_my_lane_id_fkey"
            columns: ["my_lane_id"]
            isOneToOne: false
            referencedRelation: "my_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_filing_splash_id_fkey"
            columns: ["splash_id"]
            isOneToOne: false
            referencedRelation: "splashes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_filing_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_link_opens: {
        Row: {
          id: number
          invite_id: string
          opened_at: string
        }
        Insert: {
          id?: never
          invite_id: string
          opened_at?: string
        }
        Update: {
          id?: never
          invite_id?: string
          opened_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_link_opens_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "pool_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_opens: {
        Row: {
          opened_at: string
          pool_id: string
          user_id: string
        }
        Insert: {
          opened_at?: string
          pool_id: string
          user_id: string
        }
        Update: {
          opened_at?: string
          pool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_opens_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_opens_user_id_fkey"
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
      member_notification_prefs: {
        Row: {
          pool_id: string
          type: string
          user_id: string
          value: string
        }
        Insert: {
          pool_id: string
          type: string
          user_id: string
          value: string
        }
        Update: {
          pool_id?: string
          type?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_notification_prefs_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_pool_settings: {
        Row: {
          pool_id: string
          theme: string | null
          theme_mode: string | null
          user_id: string
        }
        Insert: {
          pool_id: string
          theme?: string | null
          theme_mode?: string | null
          user_id: string
        }
        Update: {
          pool_id?: string
          theme?: string | null
          theme_mode?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_pool_settings_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_pool_settings_user_id_fkey"
            columns: ["user_id"]
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
      my_theme_settings: {
        Row: {
          apply_everywhere: boolean
          home_color: string
          mode: string
          user_id: string
        }
        Insert: {
          apply_everywhere?: boolean
          home_color?: string
          mode?: string
          user_id: string
        }
        Update: {
          apply_everywhere?: boolean
          home_color?: string
          mode?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "my_theme_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          paused: boolean
          show_titles: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          paused?: boolean
          show_titles?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          paused?: boolean
          show_titles?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          clicked_at: string | null
          count: number
          created_at: string
          delivered_at: string | null
          id: string
          invited: boolean
          pool_id: string
          pushed_at: string | null
          read_at: string | null
          recipient_id: string
          reply_id: string | null
          ripple_id: string | null
          splash_id: string | null
          type: string
        }
        Insert: {
          actor_id: string
          clicked_at?: string | null
          count?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          invited?: boolean
          pool_id: string
          pushed_at?: string | null
          read_at?: string | null
          recipient_id: string
          reply_id?: string | null
          ripple_id?: string | null
          splash_id?: string | null
          type: string
        }
        Update: {
          actor_id?: string
          clicked_at?: string | null
          count?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          invited?: boolean
          pool_id?: string
          pushed_at?: string | null
          read_at?: string | null
          recipient_id?: string
          reply_id?: string | null
          ripple_id?: string | null
          splash_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "ripple_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_ripple_id_fkey"
            columns: ["ripple_id"]
            isOneToOne: false
            referencedRelation: "ripples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_splash_id_fkey"
            columns: ["splash_id"]
            isOneToOne: false
            referencedRelation: "splashes"
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
      pool_notification_defaults: {
        Row: {
          pool_id: string
          type: string
          value: string
        }
        Insert: {
          pool_id: string
          type: string
          value: string
        }
        Update: {
          pool_id?: string
          type?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_notification_defaults_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_removed_members: {
        Row: {
          pool_id: string
          removed_at: string
          removed_by: string | null
          user_id: string
        }
        Insert: {
          pool_id: string
          removed_at?: string
          removed_by?: string | null
          user_id: string
        }
        Update: {
          pool_id?: string
          removed_at?: string
          removed_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_removed_members_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_removed_members_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_removed_members_user_id_fkey"
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
          theme: string | null
          theme_mode: string | null
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
          theme?: string | null
          theme_mode?: string | null
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
          theme?: string | null
          theme_mode?: string | null
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
          welcome_splash_created: boolean
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
          welcome_splash_created?: boolean
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
          welcome_splash_created?: boolean
        }
        Relationships: []
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
          thread_closed: boolean
          thread_pool_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          ripple_id: string
          thread_closed?: boolean
          thread_pool_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          ripple_id?: string
          thread_closed?: boolean
          thread_pool_id?: string | null
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
            foreignKeyName: "ripple_reactions_thread_pool_id_fkey"
            columns: ["thread_pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
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
          thread_closed: boolean
          thread_pool_id: string | null
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
          thread_closed?: boolean
          thread_pool_id?: string | null
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
          thread_closed?: boolean
          thread_pool_id?: string | null
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
          {
            foreignKeyName: "ripple_replies_thread_pool_id_fkey"
            columns: ["thread_pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
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
          author_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          is_welcome: boolean
          media: string[]
          media_meta: Json
          note: string | null
          occurred_on: string | null
          occurred_time: string | null
          parent_ripple_id: string | null
          participants: string[]
          planned: boolean
          splash_id: string | null
          started_at: string | null
          thread_pool_id: string | null
          video_previews: boolean
          written_on: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          is_welcome?: boolean
          media?: string[]
          media_meta?: Json
          note?: string | null
          occurred_on?: string | null
          occurred_time?: string | null
          parent_ripple_id?: string | null
          participants?: string[]
          planned?: boolean
          splash_id?: string | null
          started_at?: string | null
          thread_pool_id?: string | null
          video_previews?: boolean
          written_on?: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          is_welcome?: boolean
          media?: string[]
          media_meta?: Json
          note?: string | null
          occurred_on?: string | null
          occurred_time?: string | null
          parent_ripple_id?: string | null
          participants?: string[]
          planned?: boolean
          splash_id?: string | null
          started_at?: string | null
          thread_pool_id?: string | null
          video_previews?: boolean
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
          handed_at: string | null
          handed_to: string | null
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
          handed_at?: string | null
          handed_to?: string | null
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
          handed_at?: string | null
          handed_to?: string | null
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
          is_welcome: boolean
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
          is_welcome?: boolean
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
          is_welcome?: boolean
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
      _answered_by_others: {
        Args: { owner: string; pid: string; rid: string }
        Returns: boolean
      }
      _board_layout_clear: { Args: { l: Json; paths: string[] }; Returns: Json }
      _board_layout_merge: { Args: { base: Json; patch: Json }; Returns: Json }
      _board_layout_prune: { Args: { l: Json; media: string[] }; Returns: Json }
      _detach_thread: {
        Args: { made?: Json; pid: string; sid: string }
        Returns: undefined
      }
      _hand_over_thread: {
        Args: { p_pool: string; p_splash: string }
        Returns: string
      }
      _home_lane_for: { Args: { sid: string; uid: string }; Returns: string }
      _invite_pool: { Args: { p_token: string }; Returns: string }
      _joint_pool: { Args: { sid: string }; Returns: string }
      _layout_group: { Args: { g: Json; kind: string }; Returns: boolean }
      _layout_number: {
        Args: { hi: number; lo: number; v: Json }
        Returns: boolean
      }
      _leave_member: {
        Args: { keep: boolean; pid: string; uid: string }
        Returns: undefined
      }
      _leave_placeholder: {
        Args: { owner: string; pid: string; rid: string; target: string }
        Returns: undefined
      }
      _leave_thread_placeholder: {
        Args: { owner: string; rid: string }
        Returns: undefined
      }
      _notification_pool: {
        Args: { actor: string; recipient: string; rid: string }
        Returns: string
      }
      _notification_value: {
        Args: { p_type: string; pid: string; uid: string }
        Returns: string
      }
      _notify_new_post: {
        Args: { p_pool: string; p_splash: string }
        Returns: undefined
      }
      _place_on: {
        Args: { cid: string; plid: string; sid: string; uid: string }
        Returns: undefined
      }
      _pool_heir: { Args: { leaving: string; pid: string }; Returns: string }
      _require_member: { Args: { pid: string }; Returns: string }
      _require_only_mine: {
        Args: { sid: string; uid: string }
        Returns: undefined
      }
      _require_owner: { Args: { pid: string }; Returns: string }
      _require_uid: { Args: never; Returns: string }
      _response_thread: {
        Args: { rid: string; uid: string; wanted: string }
        Returns: string
      }
      _ripple_pools: { Args: { rid: string }; Returns: string[] }
      _set_links: {
        Args: { p_links: Json; pid: string; uid: string }
        Returns: undefined
      }
      _settle_lane_default: {
        Args: { cid: string; pid: string }
        Returns: undefined
      }
      _settle_pool_owner: { Args: { pid: string }; Returns: string }
      _splash_lane: { Args: { sid: string }; Returns: string }
      _teardown_pool: { Args: { p_pool: string }; Returns: undefined }
      _theme_color_ok: { Args: { c: string }; Returns: boolean }
      account_deletion_preview: { Args: never; Returns: Json }
      add_joint_invitees: {
        Args: { p_everyone?: boolean; p_splash: string; p_users: string[] }
        Returns: undefined
      }
      add_reply:
        | {
            Args: { p_body: string; p_id?: string; p_ripple: string }
            Returns: string
          }
        | {
            Args: {
              p_body: string
              p_id: string
              p_pool: string
              p_ripple: string
            }
            Returns: string
          }
      admin_app_opens: {
        Args: { p_users?: string[] }
        Returns: {
          id: string
          kind: string
          notification_pool_id: string
          platform: string
          started_at: string
          user_id: string
        }[]
      }
      admin_invite_link_visits: {
        Args: never
        Returns: {
          opened_at: string
          pool_id: string
        }[]
      }
      admin_notifications: {
        Args: never
        Returns: {
          clicked_at: string
          delivered_at: string
          influenced_open_at: string
          notification_id: string
          pool_id: string
          type: string
          user_id: string
        }[]
      }
      admin_open_permissions: {
        Args: never
        Returns: {
          at: string
          permission: string
          user_id: string
        }[]
      }
      admin_pool_events: {
        Args: { p_pool?: string }
        Returns: {
          at: string
          has_media: boolean
          kind: string
          pool_id: string
          splash_id: string
          user_id: string
        }[]
      }
      admin_pool_people: {
        Args: { p_pool?: string }
        Returns: {
          display_name: string
          invited_at: string
          is_owner: boolean
          joined_at: string
          left_at: string
          pool_id: string
          user_id: string
        }[]
      }
      admin_pools: {
        Args: never
        Returns: {
          created_at: string
          name: string
          owner_id: string
          pool_id: string
        }[]
      }
      admin_push_status: {
        Args: never
        Returns: {
          last_used_at: string
          subscriptions: number
          user_id: string
        }[]
      }
      admin_tracking_start: { Args: never; Returns: string }
      admin_user_events: {
        Args: { p_user?: string }
        Returns: {
          at: string
          has_media: boolean
          item_key: string
          kind: string
          pool_id: string
          splash_id: string
          user_id: string
        }[]
      }
      admin_user_records: {
        Args: { p_user?: string }
        Returns: {
          created_at: string
          has_media: boolean
          is_home: boolean
          pool_count: number
          splash_id: string
          user_id: string
        }[]
      }
      admin_users: {
        Args: never
        Returns: {
          display_name: string
          signed_up_at: string
          user_id: string
        }[]
      }
      applied_migrations: { Args: never; Returns: string[] }
      board_layout_valid: { Args: { l: Json }; Returns: boolean }
      can_read_responses: { Args: { rid: string }; Returns: boolean }
      can_respond: { Args: { rid: string }; Returns: boolean }
      can_see_ripple: { Args: { rid: string }; Returns: boolean }
      count_invite_link_open: { Args: { p_token: string }; Returns: undefined }
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
      delete_my_account: { Args: never; Returns: Json }
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
      invite_members: {
        Args: { p_token: string }
        Returns: {
          avatar_path: string
          display_name: string
        }[]
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
      is_pool_member_object: { Args: { object_name: string }; Returns: boolean }
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
      log_app_open: {
        Args: { p_notification?: string; p_platform: string; p_source: string }
        Returns: undefined
      }
      mark_notifications_read: {
        Args: { p_ids?: string[] }
        Returns: undefined
      }
      member_visible: { Args: { pid: string; uid: string }; Returns: boolean }
      move_pool_splash: {
        Args: { p_pool_lane: string; p_splash: string }
        Returns: undefined
      }
      move_to_home: {
        Args: { p_my_lane: string; p_splash: string }
        Returns: undefined
      }
      my_left_pool_ripples: {
        Args: never
        Returns: {
          pool_id: string
          ripple_id: string
        }[]
      }
      my_notification_value: {
        Args: { p_pool: string; p_type: string }
        Returns: string
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
      pool_creator_is_me: { Args: { pid: string }; Returns: boolean }
      record_app_open: {
        Args: {
          p_notification?: string
          p_permission?: string
          p_platform: string
          p_source: string
        }
        Returns: undefined
      }
      record_invite_open: { Args: { p_token: string }; Returns: undefined }
      record_ripple_view: { Args: { rid: string }; Returns: undefined }
      remove_pool_member: {
        Args: { p_pool: string; p_user: string }
        Returns: undefined
      }
      rename_pool: {
        Args: { p_name: string; p_pool: string }
        Returns: undefined
      }
      responder_former: { Args: { rid: string; uid: string }; Returns: boolean }
      responder_visible: {
        Args: { rid: string; uid: string }
        Returns: boolean
      }
      response_readable:
        | {
            Args: { rid: string; tp: string; writer: string }
            Returns: boolean
          }
        | {
            Args: { closed: boolean; rid: string; tp: string; writer: string }
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
      ripple_replies_in: {
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
          thread_pool_id: string
        }[]
      }
      ripple_span: {
        Args: { ended: string; started: string }
        Returns: unknown
      }
      ripple_writable: { Args: { sid: string; tp: string }; Returns: boolean }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      set_board_layout: {
        Args: {
          p_clear?: string[]
          p_patch: Json
          p_pool: string
          p_splash: string
          p_view?: string
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
      set_pool_theme:
        | { Args: { p_pool: string; p_theme: string }; Returns: undefined }
        | {
            Args: { p_mode: string; p_pool: string; p_theme: string }
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
      transfer_pool_owner: {
        Args: { p_pool: string; p_to: string }
        Returns: undefined
      }
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

