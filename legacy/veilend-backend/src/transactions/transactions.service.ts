import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class TransactionsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll(address: string) {
    const client = this.supabaseService.getClient();
    
    // First get user ID
    const { data: user } = await client
      .from('users')
      .select('id')
      .eq('address', address)
      .single();

    if (!user) return [];

    const { data, error } = await client
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  async create(address: string, txData: any) {
    const client = this.supabaseService.getClient();

    // Get user ID
    const { data: user } = await client
      .from('users')
      .select('id')
      .eq('address', address)
      .single();
      
    if (!user) throw new Error('User not found');

    const { data, error } = await client
      .from('transactions')
      .insert({
        user_id: user.id,
        ...txData
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
}
