/**
 *  Methods to load and save sort sessions to Supabase database
 *  This allows tracking of user sort sessions, including prompt, results, and processing time.
 */


import { supabase } from '../supabase';
import { SortSession } from '../../types';

export class SortSessionManager {
  /**
   * Save a sort session to Supabase database
   */
  static async saveSortSession(session: SortSession): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const sessionToInsert = {
        id: session.id,
        user_id: user.id,
        prompt: session.prompt,
        results: session.results,
        processing_time: session.processingTime,
        created_at: new Date(session.timestamp).toISOString(),
      };

      const { error } = await supabase
        .from('sort_sessions')
        .insert([sessionToInsert]);

      if (error) {
        throw error;
      }

      // Keep only the last 50 sessions for this user
      const { data: sessions, error: selectError } = await supabase
        .from('sort_sessions')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(50, 1000);

      if (selectError) {
        console.error('Error fetching old sessions:', selectError);
        return;
      }

      if (sessions && sessions.length > 0) {
        const sessionIdsToDelete = sessions.map((s: any) => s.id);
        const { error: deleteError } = await supabase
          .from('sort_sessions')
          .delete()
          .in('id', sessionIdsToDelete);

        if (deleteError) {
          console.error('Error deleting old sessions:', deleteError);
        }
      }
    } catch (error) {
      console.error('Error saving sort session to Supabase:', error);
      throw error;
    }
  }

  /**
   * Load sort sessions from Supabase database
   */
  static async loadSortSessions(): Promise<SortSession[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('User not authenticated, returning empty sessions');
        return [];
      }

      const { data, error } = await supabase
        .from('sort_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      return (data || []).map((session: any) => ({
        id: session.id,
        prompt: session.prompt,
        timestamp: new Date(session.created_at).getTime(),
        results: session.results,
        processingTime: session.processing_time || 0,
      }));
    } catch (error) {
      console.error('Error loading sort sessions from Supabase:', error);
      return [];
    }
  }
}