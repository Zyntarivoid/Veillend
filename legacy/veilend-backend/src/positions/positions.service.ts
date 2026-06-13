import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class PositionsService {
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
      .from('positions')
      .select('*')
      .eq('user_id', user.id);

    if (error) throw new Error(error.message);
    return data;
  }
}
