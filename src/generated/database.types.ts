/** Generated from Supabase schema. Do not edit by hand.
 * schema-sha256: 7bc7fecac5864b339d89e3f5f159343426409f1ad135f85b81a4f276d3b9bf62
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      achievements: {
        Row: {
          description: string
          icon: string
          id: string
          key: string
          name: string
          rule_key: string
          threshold: number
        }
        Insert: {
          description: string
          icon: string
          id: string
          key: string
          name: string
          rule_key: string
          threshold: number
        }
        Update: {
          description?: string
          icon?: string
          id?: string
          key?: string
          name?: string
          rule_key?: string
          threshold?: number
        }
        Relationships: []
      }
      game_players: {
        Row: {
          earned_xp: number
          final_rank: number | null
          game_id: string
          id: string
          left_at: string | null
          match_score: number
          mode: Database["public"]["Enums"]["game_mode"]
          owner_id: string
          player_id: string
          ready: boolean
          seat: number
          successful_turns: number
        }
        Insert: {
          earned_xp?: number
          final_rank?: number | null
          game_id: string
          id?: string
          left_at?: string | null
          match_score?: number
          mode?: Database["public"]["Enums"]["game_mode"]
          owner_id: string
          player_id: string
          ready?: boolean
          seat: number
          successful_turns?: number
        }
        Update: {
          earned_xp?: number
          final_rank?: number | null
          game_id?: string
          id?: string
          left_at?: string | null
          match_score?: number
          mode?: Database["public"]["Enums"]["game_mode"]
          owner_id?: string
          player_id?: string
          ready?: boolean
          seat?: number
          successful_turns?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          completed_at: string | null
          created_at: string
          current_round: number
          current_seat: number
          environment: Database["public"]["Enums"]["game_environment"]
          host_id: string
          id: string
          join_code: string | null
          lobby_open: boolean
          mode: Database["public"]["Enums"]["game_mode"]
          owner_id: string
          rules_version: string
          started_at: string
          status: Database["public"]["Enums"]["game_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_round?: number
          current_seat?: number
          environment?: Database["public"]["Enums"]["game_environment"]
          host_id: string
          id?: string
          join_code?: string | null
          lobby_open?: boolean
          mode?: Database["public"]["Enums"]["game_mode"]
          owner_id: string
          rules_version?: string
          started_at?: string
          status?: Database["public"]["Enums"]["game_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_round?: number
          current_seat?: number
          environment?: Database["public"]["Enums"]["game_environment"]
          host_id?: string
          id?: string
          join_code?: string | null
          lobby_open?: boolean
          mode?: Database["public"]["Enums"]["game_mode"]
          owner_id?: string
          rules_version?: string
          started_at?: string
          status?: Database["public"]["Enums"]["game_status"]
        }
        Relationships: []
      }
      levels: {
        Row: {
          level: number
          minimum_xp: number
        }
        Insert: {
          level: number
          minimum_xp: number
        }
        Update: {
          level?: number
          minimum_xp?: number
        }
        Relationships: []
      }
      player_achievements: {
        Row: {
          achievement_id: string
          player_id: string
          unlocked_at: string
        }
        Insert: {
          achievement_id: string
          player_id: string
          unlocked_at?: string
        }
        Update: {
          achievement_id?: string
          player_id?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_profiles: {
        Row: {
          avatar: string
          best_streak: number
          color: string
          created_at: string
          current_streak: number
          device_slot: number
          id: string
          name: string
          owner_id: string
          total_xp: number
          updated_at: string
        }
        Insert: {
          avatar: string
          best_streak?: number
          color: string
          created_at?: string
          current_streak?: number
          device_slot: number
          id?: string
          name: string
          owner_id: string
          total_xp?: number
          updated_at?: string
        }
        Update: {
          avatar?: string
          best_streak?: number
          color?: string
          created_at?: string
          current_streak?: number
          device_slot?: number
          id?: string
          name?: string
          owner_id?: string
          total_xp?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_quest_stats: {
        Row: {
          last_cleared_at: string | null
          player_id: string
          quest_id: string
          successes: number
        }
        Insert: {
          last_cleared_at?: string | null
          player_id: string
          quest_id: string
          successes?: number
        }
        Update: {
          last_cleared_at?: string | null
          player_id?: string
          quest_id?: string
          successes?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_quest_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_quest_stats_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
        ]
      }
      quests: {
        Row: {
          active: boolean
          created_at: string
          difficulty: Database["public"]["Enums"]["quest_difficulty"]
          environments: Database["public"]["Enums"]["game_environment"][]
          hex: string | null
          id: string
          key: string
          kind: Database["public"]["Enums"]["quest_kind"]
          label: string
          portable: boolean
          prompt: string
          target_class: string | null
          target_color: string | null
          validator_config: Json
        }
        Insert: {
          active?: boolean
          created_at?: string
          difficulty: Database["public"]["Enums"]["quest_difficulty"]
          environments?: Database["public"]["Enums"]["game_environment"][]
          hex?: string | null
          id: string
          key: string
          kind: Database["public"]["Enums"]["quest_kind"]
          label: string
          portable?: boolean
          prompt: string
          target_class?: string | null
          target_color?: string | null
          validator_config?: Json
        }
        Update: {
          active?: boolean
          created_at?: string
          difficulty?: Database["public"]["Enums"]["quest_difficulty"]
          environments?: Database["public"]["Enums"]["game_environment"][]
          hex?: string | null
          id?: string
          key?: string
          kind?: Database["public"]["Enums"]["quest_kind"]
          label?: string
          portable?: boolean
          prompt?: string
          target_class?: string | null
          target_color?: string | null
          validator_config?: Json
        }
        Relationships: []
      }
      turn_feedback: {
        Row: {
          created_at: string
          id: number
          owner_id: string
          reason: string
          turn_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          owner_id: string
          reason: string
          turn_id: string
        }
        Update: {
          created_at?: string
          id?: never
          owner_id?: string
          reason?: string
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turn_feedback_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
      turns: {
        Row: {
          created_at: string
          deadline_at: string | null
          earned_xp: number
          elapsed_ms: number | null
          game_id: string
          game_player_id: string
          id: string
          model_version: string | null
          player_id: string
          points: number
          prepared_at: string
          quest_id: string
          resolved_at: string | null
          result: Json
          retry_count: number
          round: number
          started_at: string | null
          status: Database["public"]["Enums"]["turn_status"]
          validator_version: string | null
          vision_attempt_count: number
        }
        Insert: {
          created_at?: string
          deadline_at?: string | null
          earned_xp?: number
          elapsed_ms?: number | null
          game_id: string
          game_player_id: string
          id?: string
          model_version?: string | null
          player_id: string
          points?: number
          prepared_at?: string
          quest_id: string
          resolved_at?: string | null
          result?: Json
          retry_count?: number
          round: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["turn_status"]
          validator_version?: string | null
          vision_attempt_count?: number
        }
        Update: {
          created_at?: string
          deadline_at?: string | null
          earned_xp?: number
          elapsed_ms?: number | null
          game_id?: string
          game_player_id?: string
          id?: string
          model_version?: string | null
          player_id?: string
          points?: number
          prepared_at?: string
          quest_id?: string
          resolved_at?: string | null
          result?: Json
          retry_count?: number
          round?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["turn_status"]
          validator_version?: string | null
          vision_attempt_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "turns_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turns_game_player_id_fkey"
            columns: ["game_player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turns_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turns_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_attempts: {
        Row: {
          confidence: number | null
          created_at: string
          decision: Database["public"]["Enums"]["vision_decision"]
          id: number
          latency_ms: number
          reason: string | null
          sequence_no: number
          turn_id: string
          validator: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          decision: Database["public"]["Enums"]["vision_decision"]
          id?: never
          latency_ms: number
          reason?: string | null
          sequence_no: number
          turn_id: string
          validator: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          decision?: Database["public"]["Enums"]["vision_decision"]
          id?: never
          latency_ms?: number
          reason?: string | null
          sequence_no?: number
          turn_id?: string
          validator?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_attempts_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abandon_game: { Args: { p_game_id: string }; Returns: undefined }
      abort_turn: {
        Args: { p_reason?: string; p_turn_id: string }
        Returns: undefined
      }
      activate_turn: { Args: { p_turn_id: string }; Returns: Json }
      advance_turn_pointer: {
        Args: { p_from_round: number; p_from_seat: number; p_game_id: string }
        Returns: Json
      }
      complete_game: { Args: { p_game_id: string }; Returns: undefined }
      create_game: {
        Args: {
          p_environment?: Database["public"]["Enums"]["game_environment"]
          p_players: Json
        }
        Returns: Json
      }
      create_online_game: {
        Args: {
          p_environment?: Database["public"]["Enums"]["game_environment"]
          p_name: string
        }
        Returns: Json
      }
      expire_turn: { Args: { p_turn_id: string }; Returns: Json }
      game_state: { Args: { p_game_id: string }; Returns: Json }
      generate_join_code: { Args: never; Returns: string }
      is_game_member: { Args: { p_game_id: string }; Returns: boolean }
      join_game: {
        Args: { p_join_code: string; p_name: string }
        Returns: Json
      }
      leave_game: { Args: { p_game_id: string }; Returns: Json }
      level_for_xp: { Args: { p_total_xp: number }; Returns: number }
      prepare_turn: {
        Args: {
          p_background_classes?: string[]
          p_game_id: string
          p_player_id: string
          p_round: number
        }
        Returns: Json
      }
      record_vision_attempt: {
        Args: {
          p_confidence: number
          p_decision: Database["public"]["Enums"]["vision_decision"]
          p_latency_ms: number
          p_reason?: string
          p_sequence_no: number
          p_turn_id: string
          p_validator: string
        }
        Returns: undefined
      }
      resolve_turn: {
        Args: {
          p_confidence: number
          p_latency_ms: number
          p_model_version: string
          p_reason?: string
          p_sequence_no: number
          p_turn_id: string
          p_validator: string
          p_validator_version: string
        }
        Returns: Json
      }
      seat_avatar: { Args: { p_seat: number }; Returns: string }
      seat_color: { Args: { p_seat: number }; Returns: string }
      set_player_ready: {
        Args: { p_game_id: string; p_ready: boolean }
        Returns: Json
      }
      spectate_game_id: { Args: { p_topic: string }; Returns: string }
      start_online_game: { Args: { p_game_id: string }; Returns: Json }
      unlock_achievements: {
        Args: { p_elapsed_ms: number; p_game_id: string; p_player_id: string }
        Returns: string[]
      }
    }
    Enums: {
      game_environment: "school" | "home" | "outdoor"
      game_mode: "local" | "online"
      game_status: "active" | "completed" | "abandoned"
      quest_difficulty: "easy" | "medium" | "hard"
      quest_kind: "object" | "smile" | "color"
      turn_status: "prepared" | "active" | "passed" | "timed_out" | "aborted"
      vision_decision: "continue" | "pass" | "system_error"
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
    Enums: {
      game_environment: ["school", "home", "outdoor"],
      game_mode: ["local", "online"],
      game_status: ["active", "completed", "abandoned"],
      quest_difficulty: ["easy", "medium", "hard"],
      quest_kind: ["object", "smile", "color"],
      turn_status: ["prepared", "active", "passed", "timed_out", "aborted"],
      vision_decision: ["continue", "pass", "system_error"],
    },
  },
} as const
